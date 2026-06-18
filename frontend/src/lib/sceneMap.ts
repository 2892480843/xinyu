// 场景视觉映射：palette -> 完整的色彩、天气、意象配置，驱动 IslandScene 沉浸式视觉。

import type { SceneMotionMood } from "./sceneMotion";

export interface SceneVisual {
  image: string;
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  sea: string;
  seaHighlight: string;
  island: string;
  celestial: string;
  celestialGlow: string;
  accent: string;
  weather: "clear" | "light_rain" | "rain" | "fog" | "storm";
  time: "dawn" | "day" | "dusk" | "night";
  stars: boolean;
  motion: SceneMotionMood;
}

export interface BackendScene {
  time: string;
  weather: string;
  palette: string;
  music: string;
  imagery: string[];
}

export const SCENE_MAP: Record<string, SceneVisual> = {
  slate_blue: {
    image: "/scenes/sad-slate-blue.png",
    skyTop: "#3a4a6b", skyMid: "#5a6b8c", skyBottom: "#8a93ad",
    sea: "#3c4a66", seaHighlight: "#9fb0cc",
    island: "#222a3d", celestial: "#e8e4d8", celestialGlow: "rgba(232,228,216,0.35)",
    accent: "#aeb9d6", weather: "light_rain", time: "dusk", stars: false, motion: "heavy",
  },
  mist_gray: {
    image: "/scenes/anxious-mist-gray.png",
    skyTop: "#6b7280", skyMid: "#9ca3af", skyBottom: "#c7cdd6",
    sea: "#5b6573", seaHighlight: "#b8c0cc",
    island: "#3a4150", celestial: "#e5e7eb", celestialGlow: "rgba(229,231,235,0.25)",
    accent: "#cbd5e1", weather: "fog", time: "day", stars: false, motion: "restless",
  },
  deep_indigo: {
    image: "/scenes/tired-deep-indigo.png",
    skyTop: "#0a1330", skyMid: "#162046", skyBottom: "#243066",
    sea: "#0e1638", seaHighlight: "#3a4f8a",
    island: "#070c1c", celestial: "#f4f1d0", celestialGlow: "rgba(244,241,208,0.4)",
    accent: "#9fb4f0", weather: "clear", time: "night", stars: true, motion: "heavy",
  },
  pale_lavender: {
    image: "/scenes/lonely-pale-lavender.png",
    skyTop: "#9a8fb5", skyMid: "#c3b9d6", skyBottom: "#e0d8ec",
    sea: "#8a82a6", seaHighlight: "#cfc6e0",
    island: "#5a526e", celestial: "#fff3e0", celestialGlow: "rgba(255,243,224,0.4)",
    accent: "#cdbae6", weather: "fog", time: "dawn", stars: false, motion: "heavy",
  },
  soft_aqua: {
    image: "/scenes/calm-soft-aqua-clean.png",
    skyTop: "#3fb6c4", skyMid: "#7fd3dd", skyBottom: "#c4eef2",
    sea: "#2fa6b8", seaHighlight: "#a8ecf2",
    island: "#1f7d8c", celestial: "#fff6cf", celestialGlow: "rgba(255,246,207,0.55)",
    accent: "#bdf3f7", weather: "clear", time: "day", stars: false, motion: "soothe",
  },
  warm_gold: {
    image: "/scenes/happy-warm-gold.png",
    skyTop: "#f0a93b", skyMid: "#f8c96b", skyBottom: "#fde4a6",
    sea: "#e6a14a", seaHighlight: "#ffe6a8",
    island: "#c87f2a", celestial: "#fff3b0", celestialGlow: "rgba(255,243,176,0.7)",
    accent: "#ffe9a8", weather: "clear", time: "day", stars: false, motion: "bright",
  },
  deep_crimson: {
    image: "/scenes/angry-deep-crimson.png",
    skyTop: "#5a1f2a", skyMid: "#8a2f3a", skyBottom: "#b04a4a",
    sea: "#4a1820", seaHighlight: "#8a3a3a",
    island: "#2a0f14", celestial: "#f0c987", celestialGlow: "rgba(240,201,135,0.35)",
    accent: "#e0a0a0", weather: "storm", time: "dusk", stars: false, motion: "restless",
  },
  dark_slate: {
    image: "/scenes/helpless-dark-slate.png",
    skyTop: "#0f1620", skyMid: "#1a2733", skyBottom: "#2a3a48",
    sea: "#0c121b", seaHighlight: "#2a3a48",
    island: "#070b11", celestial: "#d8e2ee", celestialGlow: "rgba(216,226,238,0.3)",
    accent: "#9fb2c6", weather: "rain", time: "night", stars: false, motion: "heavy",
  },
};

Object.assign(SCENE_MAP, {
  sad_low: { ...SCENE_MAP.slate_blue, image: "/scenes/sad-low-blue-hour.png", weather: "light_rain", time: "dusk", motion: "soothe" },
  sad_mid: { ...SCENE_MAP.slate_blue, image: "/scenes/sad-mid-slate-blue.png", weather: "light_rain", time: "dusk", motion: "heavy" },
  sad_high: { ...SCENE_MAP.slate_blue, image: "/scenes/sad-high-midnight-rain.png", weather: "rain", time: "night", motion: "heavy" },

  anxious_low: { ...SCENE_MAP.mist_gray, image: "/scenes/anxious-low-morning-haze.png", weather: "fog", time: "day", motion: "soothe" },
  anxious_mid: { ...SCENE_MAP.mist_gray, image: "/scenes/anxious-mid-mist-gray.png", weather: "fog", time: "day", motion: "restless" },
  anxious_high: { ...SCENE_MAP.mist_gray, image: "/scenes/anxious-high-pressure-fog.png", weather: "storm", time: "dusk", motion: "restless" },

  tired_low: { ...SCENE_MAP.deep_indigo, image: "/scenes/tired-low-evening-indigo.png", weather: "clear", time: "dusk", stars: false, motion: "soothe" },
  tired_mid: { ...SCENE_MAP.deep_indigo, image: "/scenes/tired-mid-deep-indigo.png", weather: "clear", time: "night", stars: true, motion: "heavy" },
  tired_high: { ...SCENE_MAP.deep_indigo, image: "/scenes/tired-high-starry-hush.png", weather: "fog", time: "night", stars: true, motion: "heavy" },

  lonely_low: { ...SCENE_MAP.pale_lavender, image: "/scenes/lonely-low-lavender-dawn.png", weather: "fog", time: "dawn", stars: false, motion: "soothe" },
  lonely_mid: { ...SCENE_MAP.pale_lavender, image: "/scenes/lonely-mid-pale-lavender.png", weather: "fog", time: "dawn", stars: false, motion: "heavy" },
  lonely_high: { ...SCENE_MAP.pale_lavender, image: "/scenes/lonely-high-moonlit-shore.png", weather: "clear", time: "night", stars: true, motion: "heavy" },

  calm_low: { ...SCENE_MAP.soft_aqua, image: "/scenes/calm-low-soft-aqua-dawn.png", weather: "clear", time: "dawn", motion: "soothe" },
  calm_mid: { ...SCENE_MAP.soft_aqua, image: "/scenes/calm-mid-soft-aqua.png", weather: "clear", time: "day", motion: "soothe" },
  calm_high: { ...SCENE_MAP.soft_aqua, image: "/scenes/calm-high-glass-tide.png", weather: "clear", time: "dusk", motion: "soothe" },

  happy_low: { ...SCENE_MAP.warm_gold, image: "/scenes/happy-low-warm-morning.png", weather: "clear", time: "day", motion: "bright" },
  happy_mid: { ...SCENE_MAP.warm_gold, image: "/scenes/happy-mid-warm-gold.png", weather: "clear", time: "day", motion: "bright" },
  happy_high: { ...SCENE_MAP.warm_gold, image: "/scenes/happy-high-sunburst-gold.png", weather: "clear", time: "dusk", motion: "bright" },

  angry_low: { ...SCENE_MAP.deep_crimson, image: "/scenes/angry-low-crimson-wind.png", weather: "light_rain", time: "dusk", motion: "restless" },
  angry_mid: { ...SCENE_MAP.deep_crimson, image: "/scenes/angry-mid-deep-crimson.png", weather: "storm", time: "dusk", motion: "restless" },
  angry_high: { ...SCENE_MAP.deep_crimson, image: "/scenes/angry-high-black-storm.png", weather: "storm", time: "night", motion: "restless" },

  helpless_low: { ...SCENE_MAP.dark_slate, image: "/scenes/helpless-low-dim-rain.png", weather: "light_rain", time: "dusk", motion: "heavy" },
  helpless_mid: { ...SCENE_MAP.dark_slate, image: "/scenes/helpless-mid-dark-slate.png", weather: "rain", time: "night", motion: "heavy" },
  helpless_high: { ...SCENE_MAP.dark_slate, image: "/scenes/helpless-high-faint-light.png", weather: "rain", time: "night", motion: "heavy" },
} satisfies Record<string, SceneVisual>);

export const DEFAULT_VISUAL: SceneVisual = SCENE_MAP.calm_mid;

export function resolveScene(palette: string | undefined): SceneVisual {
  if (!palette) return DEFAULT_VISUAL;
  return SCENE_MAP[palette] ?? DEFAULT_VISUAL;
}

export const EMOTION_META: Record<string, { label: string; palette: string }> = {
  sad: { label: "难过", palette: "sad_mid" },
  anxious: { label: "焦虑", palette: "anxious_mid" },
  tired: { label: "疲惫", palette: "tired_mid" },
  lonely: { label: "孤独", palette: "lonely_mid" },
  calm: { label: "平静", palette: "calm_mid" },
  happy: { label: "愉悦", palette: "happy_mid" },
  angry: { label: "愤怒", palette: "angry_mid" },
  helpless: { label: "无助", palette: "helpless_mid" },
};
