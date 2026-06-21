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
// 用模块级单例（整个应用只有一个精灵在说话），避免 RAF 多开。
let currentLevel = 0;
const levelListeners = new Set<(level: number) => void>();
let levelRaf = 0;
// 说话期间用「基于时间的节奏起伏」驱动 3D 口型（云端音频与浏览器原生统一走此模拟）。
// 不再把音频接进 Web Audio 图——那条链路在 AudioContext 挂起时会让声音变静音，正是「不出声」的根源。
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

function startLevelLoop(getRaw: () => number) {
  cancelAnimationFrame(levelRaf);
  const tick = () => {
    const raw = getRaw();
    // 轻微平滑：停顿处也有一点微动，更像「正在说话」而非死寂
    const eased = currentLevel + (raw - currentLevel) * 0.35;
    emitLevel(Math.min(1, Math.max(0, eased)));
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

/** 创建一个精灵语音控制器（模块内复用 speechSynthesis；云端音频每句新建 <audio> 直接播）。 */
export function createCompanionVoice(): CompanionVoiceController {
  const speechSupported = isBrowserSpeechSupported();
  let audioEl: HTMLAudioElement | null = null;
  // 发声令牌：每次 speak / stop 自增。旧的一句在 await 之后若发现自己已被顶替（my !== seq）
  // 就立刻放弃，绝不再开口 —— 根治「两句抢着播 / 念半截 / 串音」。
  let seq = 0;

  const stopBrowser = () => {
    if (speechSupported) window.speechSynthesis.cancel();
  };

  const teardownAudio = () => {
    stopLevelLoop();
    if (audioEl) {
      audioEl.onended = null;
      audioEl.onerror = null;
      audioEl.pause();
      try { audioEl.src = ""; } catch { /* ignore */ }
      audioEl = null;
    }
  };

  const stop = () => {
    seq++; // 作废所有在途请求
    simulatedUntil = 0;
    stopBrowser();
    teardownAudio();
  };

  // 口型驱动：按文本长度估时长，用基于时间的节奏起伏；rate 越快起伏越密。
  const startSimLevel = (text: string, rate: number, isPlaying?: () => boolean) => {
    simulatedUntil = Date.now() + Math.min(20000, (text.length * 260) / rate);
    startLevelLoop(() => {
      // 云端音频：以「是否还在播」为准（精确收口）；原生合成：按估算时长。
      if (isPlaying ? !isPlaying() : Date.now() > simulatedUntil) return 0;
      const t = performance.now() * 0.001;
      return 0.22 + Math.abs(Math.sin(t * (6 * rate))) * 0.34 + Math.abs(Math.sin(t * 11)) * 0.14;
    });
  };

  const browserSpeak = (text: string, emotion: string) => {
    if (!speechSupported || !text) return;
    const tune = VOICE_TUNING[emotion] ?? { rate: 0.9, pitch: 1.0 };
    // 防 Chrome 上 cancel + 立刻 speak 静默 bug：cancel → rAF → speak
    window.speechSynthesis.cancel();
    startSimLevel(text, tune.rate);
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
    const my = ++seq; // 认领这次发声
    teardownAudio();
    stopBrowser();
    // 优先云端情感 TTS；未配置 / 失败则无缝降级浏览器原生（情绪调音）。
    const dataUrl = await synthesizeSpeech(clean, emotion, voice ?? undefined);
    if (my !== seq) return; // 已被更新的一句顶替 → 放弃
    if (dataUrl) {
      const audio = new Audio(dataUrl);
      audioEl = audio;
      const tune = VOICE_TUNING[emotion] ?? { rate: 0.9, pitch: 1.0 };
      audio.onended = () => { if (my === seq) { simulatedUntil = 0; teardownAudio(); } };
      audio.onerror = () => { if (my !== seq) return; teardownAudio(); browserSpeak(clean, emotion); };
      // 直接播到扬声器（不经 Web Audio 图）→ 不受 AudioContext 挂起影响，声音稳；口型用模拟驱动。
      startSimLevel(clean, tune.rate, () => !audio.paused && !audio.ended);
      try {
        await audio.play();
        if (my !== seq) { teardownAudio(); return; } // 启动播放期间又被顶替
        return;
      } catch {
        if (my !== seq) return;
        teardownAudio();
        browserSpeak(clean, emotion); // 自动播放被拒等 → 退浏览器原生
        return;
      }
    }
    if (my !== seq) return;
    browserSpeak(clean, emotion);
  };

  return { speak, stop };
}
