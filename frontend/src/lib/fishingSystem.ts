import type { FishingFightState as SimulationFishingFightState } from "./fishingSimulation";
import type {
  ExploreTimeOfDay as SpeciesExploreTimeOfDay,
  ExploreWeather as SpeciesExploreWeather,
  FishingSpot as SpeciesFishingSpot,
  FishingWaterLayer as SpeciesFishingWaterLayer,
} from "./fishingSpecies";

export type FishingPhase =
  | "idle"
  | "gear"
  | "aim"
  | "cast"
  | "waiting"
  | "hook"
  | "fight"
  | "result"
  | "bad_cast"
  | "no_bite"
  | "fish_escaped"
  | "line_broken";

export type FishingTimeOfDay = SpeciesExploreTimeOfDay;
export type FishingWeather = SpeciesExploreWeather;

export interface FishingEnvironment {
  spot: SpeciesFishingSpot;
  weather: FishingWeather;
  timeOfDay: FishingTimeOfDay;
  layer: SpeciesFishingWaterLayer;
}

export interface FishingSession {
  phase: FishingPhase;
  castPower: number;
  layer: SpeciesFishingWaterLayer;
  aimOffset: number;
  selectedSpeciesId?: string;
  hookStartedAtMs: number;
  fight: SimulationFishingFightState;
}

export const INITIAL_FISHING_FIGHT: SimulationFishingFightState = {
  tension: 0.34,
  fishStamina: 1,
  fishDistance: 1,
  strainMs: 0,
  slackMs: 0,
  outcome: "fighting",
};

export const INITIAL_FISHING_SESSION: FishingSession = {
  phase: "idle",
  castPower: 0,
  layer: "mid",
  aimOffset: 0,
  hookStartedAtMs: 0,
  fight: INITIAL_FISHING_FIGHT,
};

export * from "./fishingGear";
export * from "./fishingSpecies";
export * from "./fishingSimulation";
export * from "./fishingStorage";
