import type { LocationZone } from "./locationAmbience";
import { EXPLORE_WALK_RADIUS } from "./exploreWorld";

export type ExploreZoneKey =
  | "home"
  | "beach"
  | "rice"
  | "mountain"
  | "forest"
  | "town"
  | "farm"
  | "zoo"
  | "swamp"
  | "scenic";

export type ExplorePoiKind =
  | "home"
  | "beach"
  | "rice"
  | "mountain"
  | "forest"
  | "town"
  | "farm"
  | "zoo"
  | "swamp"
  | "scenic";

export interface ExploreZone {
  key: ExploreZoneKey;
  label: string;
  icon: string;
  kind: ExplorePoiKind;
  x: number;
  z: number;
  radius: number;
  color: string;
  ambience: LocationZone;
  dx?: number;
  dy?: number;
}

const R = EXPLORE_WALK_RADIUS;

export const EXPLORE_ZONES: ExploreZone[] = [
  { key: "home", label: "家", icon: "⌂", kind: "home", x: -24, z: -20, radius: 24, color: "#ffd9a0", ambience: "meadow_day", dy: -12 },
  { key: "beach", label: "海滩", icon: "☂", kind: "beach", x: Math.cos(0.55) * R * 0.95, z: Math.sin(0.55) * R * 0.95, radius: 38, color: "#ffe7bf", ambience: "bay", dy: -12 },
  { key: "rice", label: "稻田", icon: "▦", kind: "rice", x: 56, z: -82, radius: 30, color: "#cfe88a", ambience: "meadow_day", dy: -12 },
  { key: "mountain", label: "山", icon: "△", kind: "mountain", x: -70, z: 70, radius: 36, color: "#d8c0ff", ambience: "mountain", dy: -12 },
  { key: "forest", label: "森林", icon: "♣", kind: "forest", x: -118, z: 20, radius: 44, color: "#8ed08a", ambience: "forest", dy: -12 },
  { key: "town", label: "小镇", icon: "▥", kind: "town", x: -12, z: -54, radius: 28, color: "#e8c8a0", ambience: "meadow_day", dy: -12 },
  { key: "farm", label: "农村", icon: "⌁", kind: "farm", x: -54, z: -88, radius: 32, color: "#d7c17a", ambience: "meadow_day", dy: -12 },
  { key: "zoo", label: "动物园", icon: "◇", kind: "zoo", x: 82, z: -24, radius: 30, color: "#f0b0a0", ambience: "meadow_day", dy: -12 },
  { key: "swamp", label: "沼泽地", icon: "◌", kind: "swamp", x: 92, z: -104, radius: 34, color: "#8fbf9a", ambience: "brook", dy: -12 },
  { key: "scenic", label: "风景区", icon: "✦", kind: "scenic", x: 20, z: 112, radius: 30, color: "#f3d18a", ambience: "mountain", dy: -12 },
];

export const EXPLORE_ZONE_KEYS = EXPLORE_ZONES.map((zone) => zone.key);

export const EXPLORE_MAP_POIS = EXPLORE_ZONES.map((zone) => ({
  x: zone.x,
  z: zone.z,
  label: zone.label,
  icon: zone.icon,
  kind: zone.kind,
  color: zone.color,
  dx: zone.dx,
  dy: zone.dy,
}));

export function findExploreZone(x: number, z: number): ExploreZone | null {
  let best: ExploreZone | null = null;
  let bestDistance = Infinity;
  for (const zone of EXPLORE_ZONES) {
    const dx = x - zone.x;
    const dz = z - zone.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance <= zone.radius && distance < bestDistance) {
      best = zone;
      bestDistance = distance;
    }
  }
  return best;
}

export function exploreZoneAmbience(zone: ExploreZone | null, night: boolean): LocationZone | null {
  if (!zone) return null;
  if ((zone.key === "home" || zone.key === "town" || zone.key === "farm" || zone.key === "zoo") && night) {
    return "meadow_night";
  }
  return zone.ambience;
}
