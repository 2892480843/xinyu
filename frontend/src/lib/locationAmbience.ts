// 位置感知环境底噪引擎——按玩家所在区域切换循环底噪。
//
// 与 lib/ambience.ts（情绪底噪）并列独立运行，两者可叠加（如「海边 + 雨声」）。
// 区域切换用交叉淡入淡出（旧区 fadeTo(0)+pause，新区 fadeTo(目标)），不硬切。
// 受 MusicControl 静音联动（setLocationAmbienceMuted），一键静音覆盖此层。
// 降级：文件缺失/断网 → 该区域静默，不阻断主流程。
//
// 区域→素材映射对齐 ExploreMode 地形判据（exGroundY 高度 + bayMask 海湾 + 离心半径）。
// 资源署名见 public/audio/CREDITS.md。

/** 位置区域 key——与地形判据一一对应。 */
export type LocationZone =
  | "ocean" // 深海/远海
  | "bay" // 海湾浅滩/海滩
  | "brook" // 池塘/溪流
  | "campfire" // 篝火旁
  | "mountain" // 山地/高地
  | "forest" // 森林
  | "meadow_day" // 草地/村落（白天）
  | "meadow_night"; // 草地/村落（夜晚）

export type WeatherAmbience = "clear" | "rain";

/** 区域 → ambience 文件名（public/audio/ambience/）。 */
const ZONE_FILES: Record<LocationZone, string> = {
  ocean: "ocean_waves",
  bay: "ocean_waves",
  brook: "brook",
  campfire: "campfire",
  mountain: "wind_forest",
  forest: "wind_forest",
  meadow_day: "dawn_birds",
  meadow_night: "crickets",
};

const WEATHER_FILES: Record<Exclude<WeatherAmbience, "clear">, string> = {
  rain: "rain",
};

const FADE_STEP_MS = 50;
const FADE_DURATION_MS = 1200; // 区域切换比情绪切换更柔和
const TARGET_VOLUME = 0.4;

// 区域元素池：同一区域复用同一 audio 元素，避免反复创建。
const pool = new Map<LocationZone, HTMLAudioElement>();
const weatherPool = new Map<Exclude<WeatherAmbience, "clear">, HTMLAudioElement>();
const brokenSrc = new Set<string>(); // 加载失败的 src，避免反复重试
let muted = false;
let enabled = false;
let activeZone: LocationZone | null = null;
let activeWeather: Exclude<WeatherAmbience, "clear"> | null = null;
const fadeTimers = new Map<LocationZone, number>();
const weatherFadeTimers = new Map<Exclude<WeatherAmbience, "clear">, number>();

function zoneUrl(zone: LocationZone): string {
  return `/audio/ambience/${ZONE_FILES[zone]}.m4a`;
}

function getEl(zone: LocationZone): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  let el = pool.get(zone);
  if (!el) {
    const src = zoneUrl(zone);
    if (brokenSrc.has(src)) return null; // 此前加载失败
    el = new Audio();
    el.loop = true;
    el.preload = "none";
    el.volume = 0;
    el.setAttribute("data-src", src);
    el.src = src;
    el.addEventListener("error", () => {
      // 文件缺失/断网：标记失败，停掉，不再重试
      brokenSrc.add(src);
      pool.delete(zone);
    });
    pool.set(zone, el);
  }
  return el;
}

function weatherUrl(weather: Exclude<WeatherAmbience, "clear">): string {
  return `/audio/ambience/${WEATHER_FILES[weather]}.m4a`;
}

function getWeatherEl(weather: Exclude<WeatherAmbience, "clear">): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  let el = weatherPool.get(weather);
  if (!el) {
    const src = weatherUrl(weather);
    if (brokenSrc.has(src)) return null;
    el = new Audio();
    el.loop = true;
    el.preload = "none";
    el.volume = 0;
    el.setAttribute("data-src", src);
    el.src = src;
    el.addEventListener("error", () => {
      brokenSrc.add(src);
      weatherPool.delete(weather);
    });
    weatherPool.set(weather, el);
  }
  return el;
}

function clearFade(zone: LocationZone) {
  const t = fadeTimers.get(zone);
  if (t !== undefined) {
    window.clearInterval(t);
    fadeTimers.delete(zone);
  }
}

function fadeZone(zone: LocationZone, target: number, onDone?: () => void) {
  const el = pool.get(zone);
  if (!el) {
    onDone?.();
    return;
  }
  clearFade(zone);
  const start = el.volume;
  const steps = Math.max(1, Math.round(FADE_DURATION_MS / FADE_STEP_MS));
  let i = 0;
  fadeTimers.set(
    zone,
    window.setInterval(() => {
      i += 1;
      el.volume = Math.max(0, Math.min(1, start + (target - start) * (i / steps)));
      if (i >= steps) {
        clearFade(zone);
        el.volume = target;
        onDone?.();
      }
    }, FADE_STEP_MS),
  );
}

function clearWeatherFade(weather: Exclude<WeatherAmbience, "clear">) {
  const t = weatherFadeTimers.get(weather);
  if (t !== undefined) {
    window.clearInterval(t);
    weatherFadeTimers.delete(weather);
  }
}

function fadeWeather(weather: Exclude<WeatherAmbience, "clear">, target: number, onDone?: () => void) {
  const el = weatherPool.get(weather);
  if (!el) {
    onDone?.();
    return;
  }
  clearWeatherFade(weather);
  const start = el.volume;
  const steps = Math.max(1, Math.round(FADE_DURATION_MS / FADE_STEP_MS));
  let i = 0;
  weatherFadeTimers.set(
    weather,
    window.setInterval(() => {
      i += 1;
      el.volume = Math.max(0, Math.min(1, start + (target - start) * (i / steps)));
      if (i >= steps) {
        clearWeatherFade(weather);
        el.volume = target;
        onDone?.();
      }
    }, FADE_STEP_MS),
  );
}

/**
 * 设置当前区域。zone 变化时交叉淡入淡出；同区域重复调用去重。
 * enabled=false 或 muted 时淡出全部并暂停。
 */
export function setLocationZone(zone: LocationZone, on: boolean) {
  enabled = on;
  if (!on || muted) {
    // 全部淡出暂停
    for (const z of pool.keys()) {
      const el = pool.get(z)!;
      if (!el.paused) fadeZone(z, 0, () => el.pause());
    }
    activeZone = null;
    return;
  }
  if (zone === activeZone) return; // 同区域去重

  const prev = activeZone;
  activeZone = zone;

  // 旧区淡出
  if (prev) {
    const prevEl = pool.get(prev);
    if (prevEl && !prevEl.paused) fadeZone(prev, 0, () => prevEl.pause());
  }

  // 新区淡入
  const el = getEl(zone);
  if (!el) return; // 该区域文件不可用，静默
  const startNew = () => {
    el.currentTime = 0;
    const p = el.play();
    if (p) p.then(() => fadeZone(zone, TARGET_VOLUME)).catch(() => { /* 静默降级 */ });
  };
  if (el.paused) startNew();
  else fadeZone(zone, TARGET_VOLUME);
}

/** 静音开关（由 MusicControl 与 setSfxMuted/setAmbienceMuted 同步调用）。 */
export function setLocationAmbienceMuted(next: boolean) {
  muted = next;
  if (next) {
    for (const z of pool.keys()) {
      const el = pool.get(z)!;
      if (!el.paused) fadeZone(z, 0, () => el.pause());
    }
    for (const weather of weatherPool.keys()) {
      const el = weatherPool.get(weather)!;
      if (!el.paused) fadeWeather(weather, 0, () => el.pause());
    }
  } else if (enabled && activeZone) {
    // 取消静音：恢复当前区域
    const el = pool.get(activeZone);
    if (el && el.paused) {
      const p = el.play();
      if (p) p.then(() => fadeZone(activeZone!, TARGET_VOLUME)).catch(() => { /* ignore */ });
    } else if (el) {
      fadeZone(activeZone, TARGET_VOLUME);
    }
    if (activeWeather) {
      const weatherEl = weatherPool.get(activeWeather);
      if (weatherEl && weatherEl.paused) {
        const p = weatherEl.play();
        if (p) p.then(() => fadeWeather(activeWeather!, TARGET_VOLUME * 0.75)).catch(() => { /* ignore */ });
      } else if (weatherEl) {
        fadeWeather(activeWeather, TARGET_VOLUME * 0.75);
      }
    }
  }
}

export function setWeatherAmbience(weather: WeatherAmbience, on: boolean) {
  if (!on || weather === "clear") {
    for (const w of weatherPool.keys()) {
      const el = weatherPool.get(w)!;
      clearWeatherFade(w);
      el.pause();
      el.currentTime = 0;
    }
    activeWeather = null;
    return;
  }
  const el = getWeatherEl(weather);
  if (!el) return;
  if (activeWeather && activeWeather !== weather) {
    const prevEl = weatherPool.get(activeWeather);
    if (prevEl && !prevEl.paused) fadeWeather(activeWeather, 0, () => { prevEl.pause(); prevEl.currentTime = 0; });
  }
  activeWeather = weather;
  if (muted) {
    el.pause();
    el.currentTime = 0;
    el.volume = 0;
    return;
  }
  if (el.paused) {
    el.currentTime = 0;
    const p = el.play();
    if (p) p.then(() => fadeWeather(weather, TARGET_VOLUME * 0.75)).catch(() => { /* ignore */ });
  } else {
    fadeWeather(weather, TARGET_VOLUME * 0.75);
  }
}

/** 退出探索模式时彻底停止并清理（可选，便于资源回收）。 */
export function stopLocationAmbience() {
  enabled = false;
  activeZone = null;
  activeWeather = null;
  for (const z of pool.keys()) {
    const el = pool.get(z)!;
    clearFade(z);
    el.pause();
    el.currentTime = 0;
  }
  for (const weather of weatherPool.keys()) {
    const el = weatherPool.get(weather)!;
    clearWeatherFade(weather);
    el.pause();
    el.currentTime = 0;
  }
}
