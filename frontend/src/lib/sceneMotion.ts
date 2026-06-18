export type SceneMotionMood = "soothe" | "bright" | "restless" | "heavy";

export interface SceneMotionPreset {
  imageScale: [number, number, number];
  imageX: [string, string, string];
  imageY: [string, string, string];
  imageDuration: number;
  auraOpacity: [number, number, number];
  auraScale: [number, number, number];
  auraDuration: number;
  cloudX: [string, string, string];
  cloudOpacity: [number, number, number];
  cloudDuration: number;
  seaOpacity: [number, number, number];
  seaDuration: number;
}

const MOTION_PRESETS: Record<SceneMotionMood, SceneMotionPreset> = {
  soothe: {
    imageScale: [1.012, 1.022, 1.012],
    imageX: ["-0.35%", "0.35%", "-0.35%"],
    imageY: ["-0.2%", "0.25%", "-0.2%"],
    imageDuration: 34,
    auraOpacity: [0.1, 0.2, 0.1],
    auraScale: [1, 1.06, 1],
    auraDuration: 24,
    cloudX: ["-2%", "2%", "-2%"],
    cloudOpacity: [0.06, 0.13, 0.06],
    cloudDuration: 40,
    seaOpacity: [0.05, 0.1, 0.05],
    seaDuration: 26,
  },
  bright: {
    imageScale: [1.014, 1.028, 1.014],
    imageX: ["-0.45%", "0.55%", "-0.45%"],
    imageY: ["-0.22%", "0.28%", "-0.22%"],
    imageDuration: 28,
    auraOpacity: [0.16, 0.33, 0.16],
    auraScale: [1, 1.09, 1],
    auraDuration: 20,
    cloudX: ["-2.5%", "2.8%", "-2.5%"],
    cloudOpacity: [0.08, 0.18, 0.08],
    cloudDuration: 34,
    seaOpacity: [0.07, 0.14, 0.07],
    seaDuration: 22,
  },
  restless: {
    imageScale: [1.012, 1.03, 1.012],
    imageX: ["-0.75%", "0.85%", "-0.75%"],
    imageY: ["-0.28%", "0.36%", "-0.28%"],
    imageDuration: 18,
    auraOpacity: [0.08, 0.23, 0.08],
    auraScale: [1, 1.12, 1],
    auraDuration: 16,
    cloudX: ["-3.5%", "3.8%", "-3.5%"],
    cloudOpacity: [0.04, 0.15, 0.04],
    cloudDuration: 24,
    seaOpacity: [0.04, 0.12, 0.04],
    seaDuration: 18,
  },
  heavy: {
    imageScale: [1.008, 1.016, 1.008],
    imageX: ["-0.2%", "0.24%", "-0.2%"],
    imageY: ["-0.12%", "0.18%", "-0.12%"],
    imageDuration: 44,
    auraOpacity: [0.04, 0.11, 0.04],
    auraScale: [1, 1.04, 1],
    auraDuration: 30,
    cloudX: ["-1.2%", "1.4%", "-1.2%"],
    cloudOpacity: [0.03, 0.08, 0.03],
    cloudDuration: 48,
    seaOpacity: [0.025, 0.07, 0.025],
    seaDuration: 34,
  },
};

export function getSceneMotion(mood: string | undefined): SceneMotionPreset {
  if (mood === "bright" || mood === "restless" || mood === "heavy" || mood === "soothe") {
    return MOTION_PRESETS[mood];
  }
  return MOTION_PRESETS.soothe;
}
