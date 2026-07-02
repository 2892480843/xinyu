import type { SceneVisual } from "./sceneMap";

export type ExploreTimeOfDay = "dawn" | "noon" | "sunset" | "night";
export type ExploreWeather = "clear" | "rain" | "meteor";

export interface ExploreEnvironment {
  timeOfDay: ExploreTimeOfDay;
  weather: ExploreWeather;
}

export interface ExploreTimeOption {
  value: ExploreTimeOfDay;
  label: string;
  icon: string;
}

export interface ExploreWeatherOption {
  value: ExploreWeather;
  label: string;
  icon: string;
}

export interface ExploreEnvironmentVisual {
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  celestial: string;
  directional: string;
  ambient: number;
  hemi: number;
  fog: string;
  fogNear: number;
  fogFar: number;
  rainOpacity: number;
}

export const EXPLORE_TIME_STORAGE_KEY = "xy_explore_time";
export const EXPLORE_WEATHER_STORAGE_KEY = "xy_explore_weather";

export const EXPLORE_TIME_OPTIONS: ExploreTimeOption[] = [
  { value: "dawn", label: "日出", icon: "☀" },
  { value: "noon", label: "中午", icon: "◎" },
  { value: "sunset", label: "夕阳", icon: "◐" },
  { value: "night", label: "夜晚", icon: "☾" },
];

export const EXPLORE_WEATHER_OPTIONS: ExploreWeatherOption[] = [
  { value: "clear", label: "晴天", icon: "☀" },
  { value: "rain", label: "下雨", icon: "☂" },
];

export const DEFAULT_EXPLORE_ENVIRONMENT: ExploreEnvironment = {
  timeOfDay: "noon",
  weather: "clear",
};

export const EXPLORE_TIME_VISUALS: Record<ExploreTimeOfDay, ExploreEnvironmentVisual> = {
  dawn: {
    skyTop: "#f09a78",
    skyMid: "#f7c58f",
    skyBottom: "#f6e7c4",
    celestial: "#ffe4a3",
    directional: "#ffd08a",
    ambient: 0.58,
    hemi: 0.5,
    fog: "#f0b18a",
    fogNear: 210,
    fogFar: 840,
    rainOpacity: 0.24,
  },
  noon: {
    skyTop: "#65b8d6",
    skyMid: "#a4dce7",
    skyBottom: "#def3eb",
    celestial: "#fff6cf",
    directional: "#fff3d2",
    ambient: 0.78,
    hemi: 0.64,
    fog: "#6fbfdd",
    fogNear: 220,
    fogFar: 920,
    rainOpacity: 0.22,
  },
  sunset: {
    skyTop: "#bc6c69",
    skyMid: "#e69468",
    skyBottom: "#f2cf98",
    celestial: "#ffd28a",
    directional: "#ffad72",
    ambient: 0.5,
    hemi: 0.48,
    fog: "#a85d68",
    fogNear: 195,
    fogFar: 780,
    rainOpacity: 0.28,
  },
  night: {
    skyTop: "#05071a",
    skyMid: "#181643",
    skyBottom: "#4a3b60",
    celestial: "#cdd8ff",
    directional: "#aab9e6",
    ambient: 0.3,
    hemi: 0.3,
    fog: "#1a2440",
    fogNear: 230,
    fogFar: 1060,
    rainOpacity: 0.28,
  },
};

export function isExploreTime(value: string | null): value is ExploreTimeOfDay {
  return value === "dawn" || value === "noon" || value === "sunset" || value === "night";
}

export function isExploreWeather(value: string | null): value is ExploreWeather {
  return value === "clear" || value === "rain";
}

export function loadExploreEnvironment(storage: Storage | null | undefined): ExploreEnvironment {
  if (!storage) return DEFAULT_EXPLORE_ENVIRONMENT;
  const time = storage.getItem(EXPLORE_TIME_STORAGE_KEY);
  const weather = storage.getItem(EXPLORE_WEATHER_STORAGE_KEY);
  if (isExploreTime(time) || isExploreWeather(weather)) {
    return {
      timeOfDay: isExploreTime(time) ? time : DEFAULT_EXPLORE_ENVIRONMENT.timeOfDay,
      weather: isExploreWeather(weather) ? weather : DEFAULT_EXPLORE_ENVIRONMENT.weather,
    };
  }
  if (storage.getItem("xy_night") === "1") {
    return { timeOfDay: "night", weather: "clear" };
  }
  return DEFAULT_EXPLORE_ENVIRONMENT;
}

export function saveExploreEnvironment(storage: Storage | null | undefined, environment: ExploreEnvironment): void {
  if (!storage) return;
  storage.setItem(EXPLORE_TIME_STORAGE_KEY, environment.timeOfDay);
  storage.setItem(EXPLORE_WEATHER_STORAGE_KEY, environment.weather);
}

export function resolveExploreEnvironmentVisual(visual: SceneVisual, environment: ExploreEnvironment): ExploreEnvironmentVisual {
  const base = EXPLORE_TIME_VISUALS[environment.timeOfDay];
  if (environment.weather === "clear") return base;
  if (environment.weather === "meteor") {
    return {
      ...EXPLORE_TIME_VISUALS.night,
      skyTop: "#02040f",
      skyMid: "#11153d",
      skyBottom: "#322052",
      celestial: "#f0f6ff",
      directional: "#b9c9ff",
      ambient: 0.38,
      hemi: 0.36,
      fog: "#161633",
      fogNear: 255,
      fogFar: 1220,
      rainOpacity: 0,
    };
  }
  return {
    ...base,
    skyTop: "#435f73",
    skyMid: "#6f8794",
    skyBottom: "#a2b9b7",
    celestial: "#d8e3e8",
    directional: "#c2d0d8",
    ambient: Math.max(0.28, base.ambient - 0.14),
    hemi: Math.max(0.26, base.hemi - 0.14),
    fog: environment.timeOfDay === "night" ? visual.sea : "#6f8f93",
    fogNear: Math.max(125, base.fogNear - 85),
    fogFar: Math.max(560, base.fogFar - 260),
    rainOpacity: base.rainOpacity + 0.34,
  };
}
