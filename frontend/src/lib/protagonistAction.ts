export type FishingActionClip = "FishingAim" | "FishingCast" | "FishingHook" | "FishingFight" | "FishingReel" | "FishingResult";
export type CharacterActionClip =
  | "Idle"
  | "WalkLoop"
  | "RunLoop"
  | "Jump"
  | "Wave"
  | "Flute"
  | "Sit"
  | "Cheer"
  | FishingActionClip;

interface CharacterActionState {
  moving: boolean;
  running?: boolean;
  airborne: boolean;
  landingActive?: boolean;
  cheerActive: boolean;
  waveActive: boolean;
  fluteActive: boolean;
  sitAmount: number;
  fishingAction?: FishingActionClip | null;
}

export function selectCharacterAction(state: CharacterActionState): CharacterActionClip {
  if (state.airborne || state.landingActive) return "Jump";
  if (state.fishingAction) return state.fishingAction;
  if (state.cheerActive) return "Cheer";
  if (state.fluteActive) return "Flute";
  if (state.waveActive) return "Wave";
  if (state.sitAmount > 0.55) return "Sit";
  if (state.moving && state.running) return "RunLoop";
  if (state.moving) return "WalkLoop";
  return "Idle";
}

export type HeroActionClip = CharacterActionClip;
export const selectHeroAction = selectCharacterAction;
