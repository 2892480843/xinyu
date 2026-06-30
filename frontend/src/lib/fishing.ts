export type FishingState = "idle" | "cast" | "waiting" | "bite" | "missed";
export type FishingMissReason = "early" | "late";

export const FISHING_RHYTHM_DURATION_MS = 1800;
export const FISHING_HIT_START = 0.38;
export const FISHING_HIT_END = 0.62;
export const FISHING_WAIT_MIN_MS = 1600;
export const FISHING_WAIT_MAX_MS = 3800;

export function fishingRhythmProgress(
  nowMs: number,
  startedAtMs: number,
  durationMs = FISHING_RHYTHM_DURATION_MS,
): number {
  if (durationMs <= 0) return 1;
  const progress = (nowMs - startedAtMs) / durationMs;
  return Math.min(1, Math.max(0, progress));
}

export function isFishingRhythmHit(
  progress: number,
  hitStart = FISHING_HIT_START,
  hitEnd = FISHING_HIT_END,
): boolean {
  return Number.isFinite(progress) && progress >= hitStart && progress <= hitEnd;
}

export function fishingMissReason(progress: number): FishingMissReason {
  return progress < FISHING_HIT_START ? "early" : "late";
}

export function pickFishingWaitMs(random = Math.random): number {
  return FISHING_WAIT_MIN_MS + random() * (FISHING_WAIT_MAX_MS - FISHING_WAIT_MIN_MS);
}
