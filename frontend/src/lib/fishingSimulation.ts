import type { FishingRod } from "./fishingGear";
import type { FishingWaterLayer } from "./fishingSpecies";

export type HookResult = "early" | "hit" | "late";
export type FishingFightOutcome = "fighting" | "caught" | "line_broken" | "fish_escaped";

export interface FishingFightState {
  tension: number;
  fishStamina: number;
  fishDistance: number;
  strainMs: number;
  slackMs: number;
  outcome: FishingFightOutcome;
}

export interface FishingFightInput {
  reeling: boolean;
  steadying: boolean;
  fishSurge: number;
}

export interface FishingFightSetup {
  rodControl: number;
  lineBreakLimit: number;
  speciesStrength: number;
  speciesStamina: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function castPowerToWaterLayer(power: number): FishingWaterLayer {
  if (power < 0.34) return "near";
  if (power < 0.67) return "mid";
  return "far";
}

export function calculateCastDistance(power: number, rod: FishingRod): number {
  return Math.round(clamp01(power) * rod.castRange * 10) / 10;
}

export function isCastValid(power: number): boolean {
  return power >= 0.1 && power <= 1;
}

export function resolveHookResult(msAfterBite: number): HookResult {
  if (msAfterBite < 250) return "early";
  if (msAfterBite <= 850) return "hit";
  return "late";
}

export function nextFishingFightState(
  state: FishingFightState,
  input: FishingFightInput,
  setup: FishingFightSetup,
  dtMs: number,
): FishingFightState {
  if (state.outcome !== "fighting") return state;

  const dt = Math.max(0, dtMs) / 1000;
  const control = input.steadying ? setup.rodControl * 0.45 : 0;
  const surge = input.fishSurge * (0.42 + setup.speciesStrength * 0.5);
  const reelPressure = input.reeling ? 0.18 : -0.08;
  const tension = clamp01(state.tension + surge * dt + reelPressure - control * dt);
  const fishStamina = clamp01(state.fishStamina - (input.reeling ? (0.34 + setup.rodControl * 0.2) * dt : 0.05 * dt));
  const fishDistance = clamp01(state.fishDistance + (input.reeling ? -0.55 * dt : 0.2 * dt) + input.fishSurge * 0.08 * dt);
  const strainMs = tension > setup.lineBreakLimit ? state.strainMs + dtMs : 0;
  const slackMs = tension < 0.12 && !input.reeling ? state.slackMs + dtMs : 0;

  let outcome: FishingFightOutcome = "fighting";
  if (fishStamina <= 0.1 && fishDistance <= 0.2) outcome = "caught";
  else if (tension > setup.lineBreakLimit || strainMs >= 1000) outcome = "line_broken";
  else if (slackMs >= 1200 || fishDistance >= 1) outcome = "fish_escaped";

  return { tension, fishStamina, fishDistance, strainMs, slackMs, outcome };
}
