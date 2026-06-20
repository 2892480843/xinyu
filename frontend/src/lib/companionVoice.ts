import { synthesizeSpeech } from "./api";

// 专属精灵语音：复用岛屿叙事同款「云端情感 TTS 优先、浏览器原生降级」管线。
// 让精灵不光文字回你，还能用它自己的声音说出来。情绪 → 语速/音高微调，
// 让降级朗读也带情绪温度（疲惫更慢更轻、愉悦更明快）。
//
// 额外提供一个「实时音量 level(0..1)」订阅：说话时把云端音频接到 AnalyserNode
// 上采音量，浏览器原生降级时用节奏模拟。3D 里的精灵据此随声抖动 + 灯塔光脉动，
// 让「他在说话」被眼睛看见。

const VOICE_TUNING: Record<string, { rate: number; pitch: number }> = {
  tired: { rate: 0.82, pitch: 0.92 },
  sad: { rate: 0.84, pitch: 0.94 },
  lonely: { rate: 0.86, pitch: 0.96 },
  helpless: { rate: 0.82, pitch: 0.9 },
  anxious: { rate: 0.9, pitch: 1.0 },
  calm: { rate: 0.9, pitch: 1.0 },
  happy: { rate: 1.0, pitch: 1.06 },
  angry: { rate: 0.92, pitch: 0.98 },
};

export const COMPANION_VOICE_STORAGE_KEY = "xinyu.companionVoice.v1";
const COMPANION_VOICE_ID_KEY = "xinyu.companionVoiceId.v1";

export const isBrowserSpeechSupported = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

/** 读取「自动朗读」开关（默认开）。精灵每次回复后自动开口，可随时关掉。 */
export function loadAutoVoice(): boolean {
  try {
    const v = localStorage.getItem(COMPANION_VOICE_STORAGE_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function saveAutoVoice(on: boolean): void {
  try {
    localStorage.setItem(COMPANION_VOICE_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** 读取用户选择的音色 id（阿里云为字符串音色名、腾讯云为数字字符串）。null = 用后端默认音色。 */
export function loadCompanionVoiceId(): string | null {
  try {
    const v = localStorage.getItem(COMPANION_VOICE_ID_KEY);
    return v === null ? null : v;
  } catch {
    return null;
  }
}

export function saveCompanionVoiceId(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(COMPANION_VOICE_ID_KEY);
    else localStorage.setItem(COMPANION_VOICE_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

// ── 实时音量总线 ──────────────────────────────────────────────
// 说话期间，组件通过 getCompanionLevel() 拿当前音量（0..1）驱动 3D 动画。
// 用模块级单例（整个应用只有一个精灵在说话），避免 AnalyserNode / RAF 多开。
let currentLevel = 0;
const levelListeners = new Set<(level: number) => void>();
let levelRaf = 0;
let analyser: AnalyserNode | null = null;
let analyserData: Uint8Array<ArrayBuffer> | null = null;
// 浏览器原生降级时，AnalyserNode 无信号 → 用基于时间的伪音量模拟说话起伏
let simulatedUntil = 0;

function emitLevel(v: number) {
  if (v === currentLevel) return;
  currentLevel = v;
  levelListeners.forEach((fn) => fn(v));
}

/** 让外部（3D 精灵）订阅音量变化；返回取消订阅函数。 */
export function subscribeCompanionLevel(fn: (level: number) => void): () => void {
  levelListeners.add(fn);
  return () => {
    levelListeners.delete(fn);
  };
}

/** 拉取当前音量快照（0..1）。供 3D useFrame 逐帧读取，无需订阅。 */
export function getCompanionLevel(): number {
  return currentLevel;
}

// AnalyserNode 需要 AudioContext；懒建并复用一个，避免每次说话重建。
let sharedCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  return sharedCtx;
}

function startLevelLoop(getRaw: () => number, isSimulated: boolean) {
  cancelAnimationFrame(levelRaf);
  const tick = () => {
    const raw = getRaw();
    // 轻微平滑 + 抬底：让停顿处也有一点微动，更像「正在说话」而非死寂
    const eased = currentLevel + (raw - currentLevel) * 0.35;
    emitLevel(Math.max(isSimulated ? 0.06 : 0, Math.min(1, eased)));
    if (raw <= 0.001 && Date.now() > simulatedUntil) {
      // 真实音频已无声且非模拟期 → 收到 0
    }
    levelRaf = requestAnimationFrame(tick);
  };
  levelRaf = requestAnimationFrame(tick);
}

function stopLevelLoop() {
  if (levelRaf) cancelAnimationFrame(levelRaf);
  levelRaf = 0;
  emitLevel(0);
}

export interface CompanionVoiceController {
  /** 朗读一段文本；正在朗读时会先停掉旧的。失败/不支持时静默降级，绝不抛错打断主流程。
   * voice 指定云端音色 id；省略则用后端默认音色。浏览器原生降级忽略此参数。 */
  speak: (text: string, emotion?: string, voice?: string | null) => Promise<void>;
  /** 停止当前朗读（云端音频 + 浏览器原生都清）。 */
  stop: () => void;
}

/** 创建一个精灵语音控制器（模块内复用同一个 audio 元素 + speechSynthesis）。 */
export function createCompanionVoice(): CompanionVoiceController {
  const speechSupported = isBrowserSpeechSupported();
  let audioEl: HTMLAudioElement | null = null;
  let mediaSource: MediaElementAudioSourceNode | null = null;

  const stopBrowser = () => {
    if (speechSupported) window.speechSynthesis.cancel();
  };

  const teardownAudio = () => {
    stopLevelLoop();
    if (audioEl) {
      audioEl.pause();
      try { audioEl.src = ""; } catch { /* ignore */ }
      audioEl = null;
    }
    // MediaElementSource 绑定后不能解绑，但断开连接即可；analyser 留着复用
    try { mediaSource?.disconnect(); } catch { /* ignore */ }
    mediaSource = null;
  };

  const stop = () => {
    stopBrowser();
    teardownAudio();
  };

  const browserSpeak = (text: string, emotion: string) => {
    if (!speechSupported || !text) return;
    // 防 Chrome 上 cancel + 立刻 speak 静默 bug：cancel → rAF → speak
    window.speechSynthesis.cancel();
    // 浏览器原生合成拿不到音量数据 → 用节奏模拟驱动 3D（按字数估算时长）
    const tune = VOICE_TUNING[emotion] ?? { rate: 0.9, pitch: 1.0 };
    simulatedUntil = Date.now() + Math.min(20000, text.length * 260 / tune.rate);
    startLevelLoop(() => {
      if (Date.now() > simulatedUntil) return 0;
      // 伪音量：基线呼吸 + 按节奏起伏，模拟说话的强弱
      const t = performance.now() * 0.001;
      return 0.22 + Math.abs(Math.sin(t * (6 * tune.rate))) * 0.34 + Math.abs(Math.sin(t * 11)) * 0.14;
    }, true);
    requestAnimationFrame(() => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = tune.rate;
      u.pitch = tune.pitch;
      u.onend = () => { simulatedUntil = 0; stopLevelLoop(); };
      u.onerror = () => { simulatedUntil = 0; stopLevelLoop(); };
      window.speechSynthesis.speak(u);
    });
  };

  const speak = async (text: string, emotion = "calm", voice: string | null = null) => {
    const clean = (text || "").trim();
    if (!clean) return;
    teardownAudio(); // 新的一句顶掉旧的，避免叠声
    stopBrowser();
    // 优先腾讯云情感 TTS；未配置/失败则无缝降级浏览器原生（情绪调音）
    const dataUrl = await synthesizeSpeech(clean, emotion, voice ?? undefined);
    if (dataUrl) {
      const audio = new Audio(dataUrl);
      audioEl = audio;
      audio.onended = () => { teardownAudio(); };
      audio.onerror = () => {
        teardownAudio();
        browserSpeak(clean, emotion);
      };
      try {
        // 接到 AnalyserNode 上采实时音量 → 驱动 3D 随声动
        const ctx = getAudioCtx();
        if (ctx) {
          try {
            if (ctx.state === "suspended") await ctx.resume();
            analyser = analyser ?? ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.75;
            if (!analyserData || analyserData.length !== analyser.frequencyBinCount) {
              analyserData = new Uint8Array(analyser.frequencyBinCount);
            }
            mediaSource = ctx.createMediaElementSource(audio);
            mediaSource.connect(analyser);
            analyser.connect(ctx.destination);
            startLevelLoop(() => {
              if (!analyser || !analyserData || audio.paused || audio.ended) return 0;
              analyser.getByteTimeDomainData(analyserData);
              // 时域振幅偏离 128(中点) 的平均量 → 音量
              let sum = 0;
              for (let i = 0; i < analyserData.length; i++) sum += Math.abs(analyserData[i] - 128);
              const mean = sum / analyserData.length / 128; // 0..1
              return Math.min(1, mean * 3.2); // 放大让轻柔 TTS 也看得见
            }, false);
          } catch {
            /* MediaElementSource 绑定失败也不影响播放，只是没有随声动 */
          }
        }
        await audio.play();
        return;
      } catch {
        teardownAudio();
      }
    }
    browserSpeak(clean, emotion);
  };

  return { speak, stop };
}
