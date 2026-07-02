export type FishingRodId = "bamboo_shadow_rod" | "sea_breeze_rod" | "star_tide_rod";
export type FishingLineId = "fine_line" | "tough_line" | "star_thread_line";
export type FishingBaitId = "plain_bait" | "shell_meat" | "stardust_bait";

export interface FishingRod {
  id: FishingRodId;
  name: string;
  control: number;
  castRange: number;
}

export interface FishingLine {
  id: FishingLineId;
  name: string;
  breakLimit: number;
}

export interface FishingBait {
  id: FishingBaitId;
  name: string;
  targetSpeciesIds: string[];
}

export interface FishingLoadoutInput {
  rodId?: string;
  lineId?: string;
  baitId?: string;
}

export interface FishingLoadout {
  rod: FishingRod;
  line: FishingLine;
  bait: FishingBait;
}

export const DEFAULT_FISHING_LOADOUT = {
  rodId: "bamboo_shadow_rod",
  lineId: "fine_line",
  baitId: "plain_bait",
} as const;

export const FISHING_RODS: FishingRod[] = [
  { id: "bamboo_shadow_rod", name: "竹影竿", control: 0.58, castRange: 13 },
  { id: "sea_breeze_rod", name: "海风竿", control: 0.66, castRange: 17 },
  { id: "star_tide_rod", name: "星潮竿", control: 0.82, castRange: 21 },
];

export const FISHING_LINES: FishingLine[] = [
  { id: "fine_line", name: "细线", breakLimit: 0.68 },
  { id: "tough_line", name: "韧线", breakLimit: 0.82 },
  { id: "star_thread_line", name: "星纹线", breakLimit: 0.94 },
];

export const FISHING_BAITS: FishingBait[] = [
  { id: "plain_bait", name: "素饵", targetSpeciesIds: ["silver_bay_minnow", "tide_bream"] },
  { id: "shell_meat", name: "贝肉", targetSpeciesIds: ["tide_bream", "rainscale_fish"] },
  { id: "stardust_bait", name: "星尘饵", targetSpeciesIds: ["starsea_fish", "fog_lantern_eel"] },
];

function findById<T extends { id: string }>(items: T[], id: string | undefined, fallback: string): T {
  return items.find((item) => item.id === id) ?? items.find((item) => item.id === fallback)!;
}

export function getFishingBait(id: string | undefined): FishingBait {
  return findById(FISHING_BAITS, id, DEFAULT_FISHING_LOADOUT.baitId);
}

export function resolveFishingLoadout(input: FishingLoadoutInput = {}): FishingLoadout {
  return {
    rod: findById(FISHING_RODS, input.rodId, DEFAULT_FISHING_LOADOUT.rodId),
    line: findById(FISHING_LINES, input.lineId, DEFAULT_FISHING_LOADOUT.lineId),
    bait: getFishingBait(input.baitId),
  };
}
