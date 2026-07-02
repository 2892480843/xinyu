export interface FishingCatchRecord {
  speciesId: string;
  weight: number;
  caughtAt: number;
}

export interface FishingCodexEntry {
  caught: number;
  released: number;
  maxWeight: number;
  firstCaughtAt: number;
  releaseCount: number;
}

export interface FishingSave {
  version: 1;
  selectedRodId: string;
  selectedLineId: string;
  selectedBaitId: string;
  catches: FishingCatchRecord[];
  codex: Record<string, FishingCodexEntry>;
  stats: {
    totalCatches: number;
    totalReleased: number;
  };
}

export type FishingSaveV1 = FishingSave;

const STORAGE_KEY = "xy_fishing_v1";

export function createDefaultFishingSave(): FishingSave {
  return {
    version: 1,
    selectedRodId: "bamboo_shadow_rod",
    selectedLineId: "fine_line",
    selectedBaitId: "plain_bait",
    catches: [],
    codex: {},
    stats: { totalCatches: 0, totalReleased: 0 },
  };
}

export function loadFishingSave(storage: Pick<Storage, "getItem"> | null | undefined): FishingSave {
  if (!storage) return createDefaultFishingSave();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultFishingSave();
    const parsed = JSON.parse(raw) as FishingSave;
    if (parsed.version !== 1 || !parsed.stats || !parsed.codex) return createDefaultFishingSave();
    return { ...createDefaultFishingSave(), ...parsed, stats: { ...createDefaultFishingSave().stats, ...parsed.stats } };
  } catch {
    return createDefaultFishingSave();
  }
}

export function saveFishingSave(storage: Pick<Storage, "setItem"> | null | undefined, save: FishingSave): void {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(save));
}

export function recordFishingCatch(save: FishingSave, catchRecord: FishingCatchRecord): FishingSave {
  const entry = save.codex[catchRecord.speciesId] ?? {
    caught: 0,
    released: 0,
    maxWeight: 0,
    firstCaughtAt: catchRecord.caughtAt,
    releaseCount: 0,
  };
  return {
    ...save,
    catches: [...save.catches, catchRecord],
    stats: { ...save.stats, totalCatches: save.stats.totalCatches + 1 },
    codex: {
      ...save.codex,
      [catchRecord.speciesId]: {
        ...entry,
        caught: entry.caught + 1,
        maxWeight: Math.max(entry.maxWeight, catchRecord.weight),
        firstCaughtAt: Math.min(entry.firstCaughtAt, catchRecord.caughtAt),
      },
    },
  };
}

export function recordFishingRelease(save: FishingSave, speciesId: string): FishingSave {
  const entry = save.codex[speciesId] ?? {
    caught: 0,
    released: 0,
    maxWeight: 0,
    firstCaughtAt: Date.now(),
    releaseCount: 0,
  };
  return {
    ...save,
    stats: { ...save.stats, totalReleased: save.stats.totalReleased + 1 },
    codex: {
      ...save.codex,
      [speciesId]: {
        ...entry,
        released: entry.released + 1,
        releaseCount: entry.releaseCount + 1,
      },
    },
  };
}
