export type CharacterActionClip = "Idle" | "WalkLoop" | "RunLoop" | "Jump" | "Wave" | "Flute" | "Sit";

interface CharacterActionState {
  moving: boolean;
  running?: boolean;
  airborne: boolean;
  waveActive: boolean;
  fluteActive: boolean;
  sitAmount: number;
}

export function selectCharacterAction(state: CharacterActionState): CharacterActionClip {
  if (state.airborne) return "Jump";
  if (state.fluteActive) return "Flute";
  if (state.waveActive) return "Wave";
  if (state.sitAmount > 0.55) return "Sit";
  if (state.moving && state.running) return "RunLoop";
  if (state.moving) return "WalkLoop";
  return "Idle";
}

export type HeroActionClip = CharacterActionClip;
export const selectHeroAction = selectCharacterAction;
