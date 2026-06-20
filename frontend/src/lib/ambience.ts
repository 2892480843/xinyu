// 环境氛围底噪层——叠加在背景音乐之下的循环环境音（海浪/雨/夜虫/篝火/林风/晨鸟）。
//
// 设计：
// - 一个模块级 <audio loop> 元素（不进 React 树），音量约为 BGM 的 35%，淡入淡出切换。
// - 跟随 MusicControl 的音乐开关：setAmbienceMuted 由 MusicControl 与 setSfxMuted 同步调用，
//   保持「一键静音」覆盖 BGM + SFX + 氛围底噪三层。
// - 降级：音频文件 404 / 断网 / 解码失败 → 静默无底噪，不阻断主流程。
// - 情绪 → 底噪映射对齐需求文档的情绪→岛屿元素（见 island_state EMOTION_FEATURES）。
//
// 资源署名见 public/audio/CREDITS.md（Wikimedia Commons，CC0/CC-BY/CC-BY-SA）。

const FADE_STEP_MS = 40;
const FADE_DURATION_MS = 800;
const TARGET_VOLUME = 0.4; // 环境底噪主音量（用户反馈偏小，从 0.14 提至 0.4）

/** 情绪 key → ambience 文件名（与 public/audio/ambience/ 对应）。 */
const AMBIENCE_MAP: Record<string, string> = {
  calm: "ocean_waves",
  lonely: "ocean_waves",
  default: "ocean_waves",
  sad: "rain",
  tired: "crickets",
  anxious: "wind_forest",
  happy: "dawn_birds",
};

let el: HTMLAudioElement | null = null;
let fadeTimer: number | null = null;
let muted = false;
let enabled = false; // 是否允许播放（跟随音乐开关）
let currentKey = ""; // 当前情绪 key（用于去重切换）
let brokenSrc: string | null = null; // 加载失败的 src，避免反复重试

function ensureEl(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!el) {
    el = new Audio();
    el.loop = true;
    el.preload = "none";
    el.volume = 0;
    el.addEventListener("error", () => {
      // 文件缺失 / 断网：标记此 src 失败，停掉，不再重试
      if (el) brokenSrc = el.getAttribute("data-src");
    });
  }
  return el;
}

function clearFade() {
  if (fadeTimer !== null) {
    window.clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

function fadeTo(target: number, onDone?: () => void) {
  const audio = ensureEl();
  if (!audio) return;
  clearFade();
  const start = audio.volume;
  const steps = Math.max(1, Math.round(FADE_DURATION_MS / FADE_STEP_MS));
  let i = 0;
  fadeTimer = window.setInterval(() => {
    i += 1;
    audio.volume = Math.max(0, Math.min(1, start + (target - start) * (i / steps)));
    if (i >= steps) {
      clearFade();
      audio.volume = target;
      onDone?.();
    }
  }, FADE_STEP_MS);
}

/**
 * 设置氛围底噪。emotion 变化时切换文件（带淡入淡出）；enabled 控制是否播放（跟随音乐开关）。
 * 同情绪重复调用会去重，不重复切换。
 */
export function setAmbience(emotion: string | undefined, on: boolean) {
  enabled = on;
  const audio = ensureEl();
  if (!audio) return;

  const key = emotion ?? "default";
  const file = AMBIENCE_MAP[key] ?? AMBIENCE_MAP.default;
  const src = `/audio/ambience/${file}.m4a`;

  // 静音 / 关闭：淡出后暂停
  if (!on || muted) {
    if (!audio.paused) {
      fadeTo(0, () => audio.pause());
    }
    return;
  }

  // 同曲且已在播：无需操作
  if (key === currentKey && !audio.paused) return;

  // 切换曲目：淡出旧曲 → 换 src → 播放并淡入
  currentKey = key;
  const startNew = () => {
    if (brokenSrc === src) return; // 此前加载失败，不重试
    audio.setAttribute("data-src", src);
    audio.src = src;
    audio.currentTime = 0;
    audio.volume = 0;
    const p = audio.play();
    if (p) p.then(() => fadeTo(TARGET_VOLUME)).catch(() => { /* 静默降级 */ });
  };

  if (!audio.paused) {
    fadeTo(0, () => {
      audio.pause();
      startNew();
    });
  } else {
    startNew();
  }
}

/** 静音开关（由 MusicControl 与 setSfxMuted 同步调用）。 */
export function setAmbienceMuted(next: boolean) {
  muted = next;
  const audio = ensureEl();
  if (!audio) return;
  if (next) {
    if (!audio.paused) fadeTo(0, () => audio.pause());
  } else if (enabled) {
    // 取消静音：若本应播放则淡入恢复
    if (audio.paused && currentKey) {
      const p = audio.play();
      if (p) p.then(() => fadeTo(TARGET_VOLUME)).catch(() => { /* ignore */ });
    } else {
      fadeTo(TARGET_VOLUME);
    }
  }
}
