export type AnimeBayWeather = "clear" | "rain" | "meteor";
export type AnimeBayTimeOfDay = "dawn" | "noon" | "sunset" | "night";

export interface AnimeSeaPaletteInput {
  sea: string;
  seaHighlight: string;
  timeOfDay: AnimeBayTimeOfDay;
  weather: AnimeBayWeather;
}

export interface AnimeSeaPalette {
  deep: string;
  mid: string;
  shallow: string;
  foam: string;
  reflection: string;
  waveOpacity: number;
  reflectionOpacity: number;
}

export interface AnimeShoreBreakInput {
  bayAngle: number;
  waterlineRadius: number;
  lowTier: boolean;
  night: boolean;
}

export interface AnimeShoreBreakSpec {
  key: string;
  x: number;
  z: number;
  radius: number;
  alongOffset: number;
  offShoreOffset: number;
  length: number;
  width: number;
  opacity: number;
  phase: number;
  speed: number;
  color: string;
}

const HIGH_SHORE_BREAKS = [
  { u: -18, v: 3.2, length: 66, width: 1.6, opacity: 0.24, phase: 0.0, speed: 0.42 },
  { u: 13, v: 6.4, length: 52, width: 1.25, opacity: 0.19, phase: 1.7, speed: 0.34 },
  { u: -34, v: 10.5, length: 38, width: 1.05, opacity: 0.15, phase: 2.6, speed: 0.3 },
  { u: 35, v: 14.0, length: 42, width: 0.95, opacity: 0.12, phase: 3.4, speed: 0.24 },
  { u: 0, v: 18.0, length: 72, width: 0.85, opacity: 0.1, phase: 4.1, speed: 0.2 },
] as const;

function bayPoint(bayAngle: number, radius: number, alongOffset: number, offShoreOffset: number): { x: number; z: number } {
  const rx = Math.cos(bayAngle);
  const rz = Math.sin(bayAngle);
  const tx = -Math.sin(bayAngle);
  const tz = Math.cos(bayAngle);
  return {
    x: rx * radius + tx * alongOffset + rx * offShoreOffset,
    z: rz * radius + tz * alongOffset + rz * offShoreOffset,
  };
}

export function makeAnimeShoreBreaks(input: AnimeShoreBreakInput): AnimeShoreBreakSpec[] {
  const count = input.lowTier ? 3 : HIGH_SHORE_BREAKS.length;
  const foam = input.night ? "#d9f4ff" : "#f7fbff";
  return HIGH_SHORE_BREAKS.slice(0, count).map((b, index) => {
    const p = bayPoint(input.bayAngle, input.waterlineRadius, b.u, b.v);
    return {
      key: `shore-${index}`,
      x: p.x,
      z: p.z,
      radius: input.waterlineRadius + b.v,
      alongOffset: b.u,
      offShoreOffset: b.v,
      length: b.length,
      width: b.width,
      opacity: b.opacity,
      phase: b.phase,
      speed: b.speed,
      color: foam,
    };
  });
}

export function resolveAnimeSeaPalette(input: AnimeSeaPaletteInput): AnimeSeaPalette {
  if (input.weather === "meteor") {
    return {
      deep: "#071326",
      mid: "#0c4561",
      shallow: "#4aa7b9",
      foam: "#d9f4ff",
      reflection: "#dcecff",
      waveOpacity: 0.68,
      reflectionOpacity: 0.18,
    };
  }
  if (input.timeOfDay === "night") {
    return {
      deep: "#071426",
      mid: "#0e3c56",
      shallow: "#326f82",
      foam: "#d9f4ff",
      reflection: "#dcecff",
      waveOpacity: 0.62,
      reflectionOpacity: 0.16,
    };
  }
  if (input.weather === "rain") {
    return {
      deep: "#1d4d5e",
      mid: "#4e7c88",
      shallow: "#91c2c6",
      foam: "#e7f6fb",
      reflection: "#c6dbe2",
      waveOpacity: 0.42,
      reflectionOpacity: 0.08,
    };
  }
  return {
    deep: input.sea,
    mid: "#4cb6c5",
    shallow: input.seaHighlight,
    foam: "#f7fbff",
    reflection: "#fff4cf",
    waveOpacity: 0.56,
    reflectionOpacity: 0.18,
  };
}
