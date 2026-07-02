import { getFishingBait, type FishingBaitId } from "./fishingGear";

export type FishingWaterLayer = "near" | "mid" | "far";
export type FishingSpot = "shore" | "reef" | "deepBay" | "nightTide";
export type ExploreTimeOfDay = "morning" | "day" | "sunset" | "night";
export type ExploreWeather = "clear" | "rain" | "meteor" | "fog" | "wind";

export interface FishingSpecies {
  id: string;
  name: string;
  rarity: "common" | "uncommon" | "rare" | "legendary";
  strength: number;
  stamina: number;
  baseWeight: number;
  minWeight: number;
  maxWeight: number;
  preferredLayers: FishingWaterLayer[];
  preferredSpots: FishingSpot[];
  preferredWeather?: ExploreWeather[];
  preferredTimes?: ExploreTimeOfDay[];
}

export interface FishingPoolContext {
  spot: FishingSpot;
  weather: ExploreWeather;
  timeOfDay: ExploreTimeOfDay;
  layer: FishingWaterLayer;
}

export interface FishingPoolEntry {
  species: FishingSpecies;
  weight: number;
}

export const FISHING_SPECIES: FishingSpecies[] = [
  {
    id: "silver_bay_minnow",
    name: "银湾小鱼",
    rarity: "common",
    strength: 0.18,
    stamina: 0.22,
    baseWeight: 0.25,
    minWeight: 0.08,
    maxWeight: 0.48,
    preferredLayers: ["near", "mid", "far"],
    preferredSpots: ["shore", "reef", "deepBay", "nightTide"],
  },
  {
    id: "tide_bream",
    name: "潮汐鲷",
    rarity: "uncommon",
    strength: 0.34,
    stamina: 0.38,
    baseWeight: 0.7,
    minWeight: 0.42,
    maxWeight: 1.25,
    preferredLayers: ["near", "mid"],
    preferredSpots: ["shore", "reef", "deepBay"],
  },
  {
    id: "rainscale_fish",
    name: "雨鳞鱼",
    rarity: "rare",
    strength: 0.48,
    stamina: 0.5,
    baseWeight: 0.9,
    minWeight: 0.55,
    maxWeight: 1.65,
    preferredLayers: ["mid"],
    preferredSpots: ["shore", "reef", "deepBay"],
    preferredWeather: ["rain"],
  },
  {
    id: "fog_lantern_eel",
    name: "雾灯鳗",
    rarity: "rare",
    strength: 0.58,
    stamina: 0.62,
    baseWeight: 1.2,
    minWeight: 0.9,
    maxWeight: 2.1,
    preferredLayers: ["mid", "far"],
    preferredSpots: ["deepBay", "nightTide"],
    preferredTimes: ["night"],
  },
  {
    id: "starsea_fish",
    name: "星海鱼",
    rarity: "legendary",
    strength: 0.72,
    stamina: 0.78,
    baseWeight: 1.8,
    minWeight: 1.2,
    maxWeight: 3.4,
    preferredLayers: ["far"],
    preferredSpots: ["nightTide"],
    preferredWeather: ["clear", "meteor"],
    preferredTimes: ["night"],
  },
];

export function getFishingSpecies(id: string): FishingSpecies | undefined {
  return FISHING_SPECIES.find((species) => species.id === id);
}

export function buildFishingPool(context: FishingPoolContext, baitId: FishingBaitId | string): FishingPoolEntry[] {
  const bait = getFishingBait(baitId);
  return FISHING_SPECIES.map((species) => {
    let weight = species.rarity === "common" ? 8 : species.rarity === "uncommon" ? 4 : species.rarity === "rare" ? 2 : 0.8;
    if (species.preferredLayers.includes(context.layer)) weight *= 1.6;
    if (species.preferredSpots.includes(context.spot)) weight *= 1.6;
    if (species.preferredWeather?.includes(context.weather)) weight *= 1.8;
    if (species.preferredTimes?.includes(context.timeOfDay)) weight *= 1.8;
    if (bait.targetSpeciesIds.includes(species.id)) weight *= species.rarity === "legendary" ? 18 : 3;
    return { species, weight };
  }).filter((entry) => entry.weight > 0);
}

export function chooseWeightedSpecies(pool: FishingPoolEntry[], rng: () => number = Math.random): FishingSpecies {
  if (pool.length === 0) return FISHING_SPECIES[0];
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let pick = Math.max(0, Math.min(0.999999, rng())) * total;
  for (const entry of pool) {
    pick -= entry.weight;
    if (pick <= 0) return entry.species;
  }
  return pool[pool.length - 1].species;
}
