# Island Explore C1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand “上岛走走” into one continuous ten-district island with dawn/noon/sunset/night and rain controls.

**Architecture:** Add small pure data modules for explore world constants, environment state, and district registry, then wire those modules into the existing `ExploreMode.tsx` map, audio, UI, and Three.js scene. Keep rendering additions inside focused district components and preserve the existing delayed-mount performance pattern.

**Tech Stack:** Vite, React 19, TypeScript 6, Three.js, React Three Fiber, Drei, Node test runner.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/lib/exploreWorld.ts` | Create | Shared explore-world constants derived from the current `ExploreMode.tsx` constants, so zone data and scene code use one radius/scale source. |
| `frontend/src/lib/exploreEnvironment.ts` | Create | Time-of-day/weather types, labels, palette data, localStorage migration from `xy_night`, and helper functions. |
| `frontend/src/lib/exploreZones.ts` | Create | Ten district definitions, map POIs, zone proximity helpers, and ambience mapping. |
| `frontend/src/lib/locationAmbience.ts` | Modify | Add rain ambience as a weather overlay while keeping existing location ambience behavior. |
| `frontend/src/components/ExploreMode.tsx` | Modify | Consume environment and zone modules, render new districts, update minimap/full map, add time/weather menu controls, add rain and sky effects. |
| `frontend/tests/exploreEnvironment.test.mjs` | Create | Source-level tests for environment state, labels, persistence keys, and legacy night migration. |
| `frontend/tests/exploreZones.test.mjs` | Create | Source-level tests for the ten district registry, labels, coordinates, and map POI exports. |
| `frontend/tests/exploreC1Integration.test.mjs` | Create | Source-level tests that `ExploreMode.tsx` uses the new modules, menu labels, rain effect, map data, and district layer. |
| `docs/superpowers/plans/2026-06-30-island-explore-c1.md` | Already created | This implementation plan. |

## Task 1: Environment State Module

**Files:**
- Create: `frontend/src/lib/exploreEnvironment.ts`
- Create: `frontend/tests/exploreEnvironment.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/exploreEnvironment.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readEnvironmentSource() {
  return readFile(path.resolve("src/lib/exploreEnvironment.ts"), "utf8");
}

test("explore environment defines four times and rain weather", async () => {
  const source = await readEnvironmentSource();

  for (const value of ["dawn", "noon", "sunset", "night"]) {
    assert.match(source, new RegExp(`value: "${value}"`));
  }
  assert.match(source, /export type ExploreWeather = "clear" \| "rain"/);
  assert.match(source, /label: "日出"/);
  assert.match(source, /label: "中午"/);
  assert.match(source, /label: "夕阳"/);
  assert.match(source, /label: "夜晚"/);
  assert.match(source, /label: "下雨"/);
});

test("explore environment persists new keys and migrates legacy xy_night", async () => {
  const source = await readEnvironmentSource();

  assert.match(source, /EXPLORE_TIME_STORAGE_KEY = "xy_explore_time"/);
  assert.match(source, /EXPLORE_WEATHER_STORAGE_KEY = "xy_explore_weather"/);
  assert.match(source, /localStorage\.getItem\("xy_night"\) === "1"/);
  assert.match(source, /timeOfDay: "night"/);
  assert.match(source, /weather: "clear"/);
});

test("explore environment exposes visual values for sky and light", async () => {
  const source = await readEnvironmentSource();

  assert.match(source, /skyTop/);
  assert.match(source, /skyMid/);
  assert.match(source, /skyBottom/);
  assert.match(source, /directional/);
  assert.match(source, /ambient/);
  assert.match(source, /fogNear/);
  assert.match(source, /rainOpacity/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd frontend
npm test -- tests/exploreEnvironment.test.mjs
```

Expected: `ENOENT` or assertion failure because `src/lib/exploreEnvironment.ts` does not exist yet.

- [ ] **Step 3: Create the environment module**

Create `frontend/src/lib/exploreEnvironment.ts`:

```ts
import type { SceneVisual } from "./sceneMap";

export type ExploreTimeOfDay = "dawn" | "noon" | "sunset" | "night";
export type ExploreWeather = "clear" | "rain";

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
    skyTop: "#f28a68",
    skyMid: "#f7ba83",
    skyBottom: "#f7e0b2",
    celestial: "#ffe4a3",
    directional: "#ffd08a",
    ambient: 0.58,
    hemi: 0.5,
    fog: "#f0b18a",
    fogNear: 250,
    fogFar: 980,
    rainOpacity: 0.2,
  },
  noon: {
    skyTop: "#4aaad8",
    skyMid: "#8fd6ef",
    skyBottom: "#d7f3f5",
    celestial: "#fff6cf",
    directional: "#fff3d2",
    ambient: 0.78,
    hemi: 0.64,
    fog: "#6fbfdd",
    fogNear: 260,
    fogFar: 1080,
    rainOpacity: 0.18,
  },
  sunset: {
    skyTop: "#c85a59",
    skyMid: "#e8895b",
    skyBottom: "#f7c181",
    celestial: "#ffd28a",
    directional: "#ffad72",
    ambient: 0.5,
    hemi: 0.48,
    fog: "#a85d68",
    fogNear: 230,
    fogFar: 900,
    rainOpacity: 0.24,
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
  return {
    ...base,
    skyTop: "#536b82",
    skyMid: "#8094a4",
    skyBottom: "#aebbc3",
    celestial: "#d8e3e8",
    directional: "#c2d0d8",
    ambient: Math.max(0.26, base.ambient - 0.18),
    hemi: Math.max(0.24, base.hemi - 0.16),
    fog: visual.sea,
    fogNear: Math.max(160, base.fogNear - 55),
    fogFar: Math.max(680, base.fogFar - 140),
    rainOpacity: base.rainOpacity + 0.22,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd frontend
npm test -- tests/exploreEnvironment.test.mjs
```

Expected: all tests in `exploreEnvironment.test.mjs` pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/src/lib/exploreEnvironment.ts frontend/tests/exploreEnvironment.test.mjs
git commit -m "feat: add explore environment state"
```

## Task 2: Zone Registry And World Constants

**Files:**
- Create: `frontend/src/lib/exploreWorld.ts`
- Create: `frontend/src/lib/exploreZones.ts`
- Create: `frontend/tests/exploreZones.test.mjs`
- Modify: `frontend/src/components/ExploreMode.tsx:58-61,419`

- [ ] **Step 1: Write the failing zone registry test**

Create `frontend/tests/exploreZones.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readZonesSource() {
  return readFile(path.resolve("src/lib/exploreZones.ts"), "utf8");
}

async function readWorldSource() {
  return readFile(path.resolve("src/lib/exploreWorld.ts"), "utf8");
}

test("explore world exports the shared walk radius used by the island", async () => {
  const source = await readWorldSource();

  assert.match(source, /export const EXPLORE_SCALE = 80/);
  assert.match(source, /export const EXPLORE_HEIGHT_SCALE = 0\.6/);
  assert.match(source, /export const EXPLORE_HILLS = 15/);
  assert.match(source, /export const EXPLORE_WALK_RADIUS = ISLAND_RADIUS \* EXPLORE_SCALE \* 0\.74/);
});

test("explore zones define the ten C1 districts", async () => {
  const source = await readZonesSource();
  const expected = [
    ["home", "家"],
    ["beach", "海滩"],
    ["rice", "稻田"],
    ["mountain", "山"],
    ["forest", "森林"],
    ["town", "小镇"],
    ["farm", "农村"],
    ["zoo", "动物园"],
    ["swamp", "沼泽地"],
    ["scenic", "风景区"],
  ];

  for (const [key, label] of expected) {
    assert.match(source, new RegExp(`key: "${key}"`));
    assert.match(source, new RegExp(`label: "${label}"`));
  }
  assert.match(source, /export const EXPLORE_ZONE_KEYS/);
  assert.match(source, /export const EXPLORE_MAP_POIS/);
});

test("explore zones expose position and ambience helpers", async () => {
  const source = await readZonesSource();

  assert.match(source, /export function findExploreZone/);
  assert.match(source, /export function exploreZoneAmbience/);
  assert.match(source, /ambience: "brook"/);
  assert.match(source, /ambience: "wind_forest"/);
  assert.match(source, /ambience: "bay"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd frontend
npm test -- tests/exploreZones.test.mjs
```

Expected: `ENOENT` because the new modules do not exist yet.

- [ ] **Step 3: Create shared world constants**

Create `frontend/src/lib/exploreWorld.ts`:

```ts
import { ISLAND_RADIUS } from "./islandTerrain";

export const EXPLORE_SCALE = 80;
export const EXPLORE_HEIGHT_SCALE = 0.6;
export const EXPLORE_HILLS = 15;
export const EXPLORE_WALK_RADIUS = ISLAND_RADIUS * EXPLORE_SCALE * 0.74;
```

- [ ] **Step 4: Create the ten-zone registry**

Create `frontend/src/lib/exploreZones.ts`:

```ts
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
```

- [ ] **Step 5: Wire `ExploreMode.tsx` to shared world constants**

Modify `frontend/src/components/ExploreMode.tsx` imports near lines 14-15:

```ts
import { EXPLORE_SCALE, EXPLORE_HEIGHT_SCALE, EXPLORE_HILLS, EXPLORE_WALK_RADIUS } from "../lib/exploreWorld";
```

Replace constants at lines 58-61:

```ts
const EXS = EXPLORE_SCALE;
const EYS = EXPLORE_HEIGHT_SCALE;
const HILLS = EXPLORE_HILLS;
```

Replace line 419:

```ts
const WALK_RADIUS = EXPLORE_WALK_RADIUS;
```

- [ ] **Step 6: Run tests**

Run:

```bash
cd frontend
npm test -- tests/exploreZones.test.mjs
```

Expected: all tests in `exploreZones.test.mjs` pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add frontend/src/lib/exploreWorld.ts frontend/src/lib/exploreZones.ts frontend/src/components/ExploreMode.tsx frontend/tests/exploreZones.test.mjs
git commit -m "feat: add explore zone registry"
```

## Task 3: Map Labels Use The Zone Registry

**Files:**
- Modify: `frontend/src/components/ExploreMode.tsx:21,5514-5526,5585-5647,5859-5865`
- Create: `frontend/tests/exploreC1Integration.test.mjs`

- [ ] **Step 1: Write the failing integration test for map wiring**

Create `frontend/tests/exploreC1Integration.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readExploreSource() {
  return readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("explore map is driven by the C1 zone registry", async () => {
  const source = await readExploreSource();
  const mapBlock = sourceBlock(source, "type PoiKind", "function smoothClosedPath");
  const iconBlock = sourceBlock(source, "function PoiIcon", "function IslandMapBody");

  assert.match(source, /EXPLORE_MAP_POIS/);
  assert.match(mapBlock, /type PoiKind = ExplorePoiKind/);
  assert.match(mapBlock, /const MAP_POIS: MapPoi\[] = EXPLORE_MAP_POIS/);
  for (const kind of ["home", "rice", "farm", "mountain", "forest", "zoo", "swamp", "scenic"]) {
    assert.match(iconBlock, new RegExp(`case "${kind}"`));
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd frontend
npm test -- tests/exploreC1Integration.test.mjs
```

Expected: assertion failure because `ExploreMode.tsx` has not imported `EXPLORE_MAP_POIS` or expanded `PoiIcon`.

- [ ] **Step 3: Import zone map data**

Modify imports in `frontend/src/components/ExploreMode.tsx` near line 21:

```ts
import { EXPLORE_MAP_POIS, type ExplorePoiKind } from "../lib/exploreZones";
```

Replace lines 5514-5526:

```ts
type PoiKind = ExplorePoiKind;
interface MapPoi { x: number; z: number; label: string; icon: string; kind: PoiKind; color: string; dx?: number; dy?: number }
const MAP_POIS: MapPoi[] = EXPLORE_MAP_POIS;
```

- [ ] **Step 4: Add vector icons for the new POI kinds**

Inside `PoiIcon` after the `beach` case, add:

```tsx
    case "home":
      return (<g>{shadow}
        <rect x={-4.4} y={-0.6} width={8.8} height={5.6} rx={0.9} fill={wall} {...co} />
        <path d="M-5.6 -0.6 L0 -5.3 L5.6 -0.6 Z" fill={roof} {...co} />
        <rect x={-1.1} y={1.5} width={2.2} height={3.5} rx={0.35} fill={wood} {...co} />
        <circle cx={2.8} cy={1.6} r={1.1} fill={win} /></g>);
    case "rice":
      return (<g>{shadow}
        <rect x={-5.5} y={-4.2} width={11} height={8.5} rx={1.2} fill={night ? "#69805e" : "#b8d776"} {...co} />
        <path d="M-3.7 -3.2 V3.3 M-1.2 -3.5 V3.6 M1.2 -3.5 V3.6 M3.7 -3.2 V3.3" stroke={night ? "#d8e2a0" : "#f7f0a8"} strokeWidth={0.75} strokeLinecap="round" />
        <path d="M-5.1 -1.5 H5.1 M-5.1 1.4 H5.1" stroke={night ? "#4f6448" : "#87b55d"} strokeWidth={0.75} /></g>);
    case "farm":
      return (<g>{shadow}
        <rect x={-4.8} y={-0.4} width={9.6} height={5.4} rx={0.8} fill={wall} {...co} />
        <path d="M-5.8 -0.4 L0 -4.7 L5.8 -0.4 Z" fill={night ? "#8f5f4f" : "#c96b42"} {...co} />
        <path d="M-5.6 5.3 H5.6 M-4.4 3.6 H4.4" stroke={wood} strokeWidth={0.9} strokeLinecap="round" /></g>);
    case "mountain":
      return (<g>{shadow}
        <path d="M-6 4.8 L-1.6 -5.2 L1.1 0.2 L3 -3.6 L6 4.8 Z" fill={night ? "#65758a" : "#9ab29a"} {...co} />
        <path d="M-1.6 -5.2 L-0.1 -2.1 L-2.4 -2.4 Z" fill="#eef5f7" stroke="none" />
        <path d="M3 -3.6 L4.2 -1 L2.2 -1.2 Z" fill="#eef5f7" stroke="none" /></g>);
    case "forest":
      return (<g>{shadow}
        <path d="M-4.2 3.8 L-1.6 -1.2 L-3.2 -1.2 L-0.7 -5 L1.8 -1.2 H0.3 L3 3.8 Z" fill={night ? "#315641" : "#4f9a57"} {...co} />
        <path d="M1.8 4.4 L4.7 4.4 L3.2 -0.2 L4.4 -0.2 L2.5 -3.2 L0.6 -0.2 H1.8 Z" fill={night ? "#284735" : "#6fb46a"} {...co} /></g>);
    case "zoo":
      return (<g>{shadow}
        <rect x={-5.2} y={-4.2} width={10.4} height={8.8} rx={1.4} fill={night ? "#4a5365" : "#f1d2a0"} {...co} />
        <path d="M-3.8 -2.4 V3.6 M-1.2 -2.4 V3.6 M1.2 -2.4 V3.6 M3.8 -2.4 V3.6" stroke={wood} strokeWidth={0.85} />
        <circle cx={-1.4} cy={-0.2} r={1.1} fill={night ? "#d6c2a0" : "#8f6b52"} />
        <circle cx={1.4} cy={-0.2} r={1.1} fill={night ? "#d6c2a0" : "#8f6b52"} /></g>);
    case "swamp":
      return (<g>{shadow}
        <ellipse cx={0} cy={1.4} rx={6.1} ry={4.2} fill={night ? "#315c55" : "#8fc5a7"} {...co} />
        <path d="M-4.5 2.8 C-2.4 0.8 -0.8 4 1.1 1.8 C2.7 0 4.2 2.4 5.2 1" fill="none" stroke={night ? "#b7dec4" : "#e6ffe8"} strokeWidth={0.8} strokeLinecap="round" />
        <path d="M-3.6 -2.5 C-3.2 -0.8 -3.2 0.4 -3.7 1.7 M3.6 -2.6 C3.1 -0.7 3.2 0.5 3.7 1.8" stroke={wood} strokeWidth={0.75} strokeLinecap="round" /></g>);
    case "scenic":
      return (<g>{shadow}
        <path d="M-5 4.4 H5 M-3.8 2.5 H3.8 M-2.8 0.7 H2.8" stroke={wood} strokeWidth={1} strokeLinecap="round" />
        <path d="M0 -5 L1.2 -1.3 L5 -1.3 L1.9 0.9 L3.1 4.4 L0 2.1 L-3.1 4.4 L-1.9 0.9 L-5 -1.3 L-1.2 -1.3 Z" fill={night ? "#ffe9a0" : "#ffcf5a"} stroke={ink} strokeWidth={0.7} strokeLinejoin="round" /></g>);
```

- [ ] **Step 5: Keep the map legend compact**

Replace the legend block at lines 5859-5865 with:

```tsx
            {/* 图例 / 标注 */}
            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 px-1 text-[11px] text-white/72 sm:grid-cols-3">
              <span className="text-[#ff8aa3]">▲ 你的位置</span>
              {MAP_POIS.map((p) => (
                <span key={p.label} className="truncate">{p.icon} {p.label}</span>
              ))}
            </div>
```

- [ ] **Step 6: Run the focused integration test**

Run:

```bash
cd frontend
npm test -- tests/exploreC1Integration.test.mjs
```

Expected: `explore map is driven by the C1 zone registry` passes.

- [ ] **Step 7: Commit**

Run:

```bash
git add frontend/src/components/ExploreMode.tsx frontend/tests/exploreC1Integration.test.mjs
git commit -m "feat: show C1 districts on island map"
```

## Task 4: Explore Time And Weather Controls

**Files:**
- Modify: `frontend/src/components/ExploreMode.tsx:6322-6509,7342-7359,7610,7767-7792`
- Modify: `frontend/tests/exploreC1Integration.test.mjs`

- [ ] **Step 1: Extend the integration test for menu controls**

Append this test to `frontend/tests/exploreC1Integration.test.mjs`:

```js
test("explore mode exposes time-of-day and rain controls", async () => {
  const source = await readExploreSource();
  const menuBlock = sourceBlock(source, "xy-explore-menu", "换装面板");

  assert.match(source, /loadExploreEnvironment/);
  assert.match(source, /saveExploreEnvironment/);
  assert.match(source, /EXPLORE_TIME_OPTIONS/);
  assert.match(source, /EXPLORE_WEATHER_OPTIONS/);
  assert.match(menuBlock, /时辰/);
  assert.match(menuBlock, /天气/);
  assert.match(menuBlock, /日出/);
  assert.match(menuBlock, /中午/);
  assert.match(menuBlock, /夕阳/);
  assert.match(menuBlock, /夜晚/);
  assert.match(menuBlock, /晴天/);
  assert.match(menuBlock, /下雨/);
  assert.doesNotMatch(menuBlock, /切白天|切夜晚/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd frontend
npm test -- tests/exploreC1Integration.test.mjs
```

Expected: menu-control test fails because `ExploreMode.tsx` still uses `night` and `切白天/切夜晚`.

- [ ] **Step 3: Import environment helpers**

Modify `ExploreMode.tsx` imports:

```ts
import {
  EXPLORE_TIME_OPTIONS,
  EXPLORE_WEATHER_OPTIONS,
  loadExploreEnvironment,
  resolveExploreEnvironmentVisual,
  saveExploreEnvironment,
  type ExploreEnvironment,
} from "../lib/exploreEnvironment";
```

- [ ] **Step 4: Replace the `night` state with `environment`**

Replace line 7342:

```ts
  const [environment, setEnvironment] = useState<ExploreEnvironment>(() => {
    try { return loadExploreEnvironment(localStorage); } catch { return { timeOfDay: "noon", weather: "clear" }; }
  });
```

Replace line 7358:

```ts
  useEffect(() => { try { saveExploreEnvironment(localStorage, environment); } catch { /* ignore */ } }, [environment]);
```

Add helpers after `fmtWhen` at line 7442:

```ts
  const activeTime = EXPLORE_TIME_OPTIONS.find((item) => item.value === environment.timeOfDay) ?? EXPLORE_TIME_OPTIONS[1];
  const activeWeather = EXPLORE_WEATHER_OPTIONS.find((item) => item.value === environment.weather) ?? EXPLORE_WEATHER_OPTIONS[0];
  const isExploreNight = environment.timeOfDay === "night";
  const setExploreTime = (timeOfDay: ExploreEnvironment["timeOfDay"]) => {
    if (timeOfDay === "night" && environment.timeOfDay !== "night") emitCompanionEvent("night");
    setEnvironment((current) => ({ ...current, timeOfDay }));
    playSfx("tap");
  };
  const setExploreWeather = (weather: ExploreEnvironment["weather"]) => {
    setEnvironment((current) => ({ ...current, weather }));
    playSfx(weather === "rain" ? "ripple" : "tap");
  };
```

- [ ] **Step 5: Pass environment into scene and map**

Update the `ExploreScene` prop list around lines 6322-6414:

```ts
  environment,
```

and its type block:

```ts
  environment: ExploreEnvironment;
```

Update the `ExploreScene` usage at line 7665 by replacing `forceNight={night}` with:

```tsx
environment={environment}
```

Update the minimap call at line 7768:

```tsx
      <Minimap posRef={posRef} headingRef={headingRef} night={isExploreNight || visual.time === "night" || !!visual.stars} />
```

- [ ] **Step 6: Replace scene night logic with environment logic**

Inside `ExploreScene`, replace line 6417:

```ts
  const envVisual = useMemo(() => resolveExploreEnvironmentVisual(visual, environment), [visual, environment]);
  const forceNight = environment.timeOfDay === "night";
  useEffect(() => { sceneEnv.night = forceNight; }, [forceNight]);
```

Update the sky texture dependency and color stops near lines 6450-6461 to use `envVisual`:

```ts
        grd.addColorStop(0, envVisual.skyTop);
        grd.addColorStop(0.5, envVisual.skyMid);
        grd.addColorStop(1, envVisual.skyBottom);
```

Change the `useMemo` dependency at line 6478:

```ts
  }, [envVisual.skyTop, envVisual.skyMid, envVisual.skyBottom, forceNight]);
```

Update lights at lines 6506-6509:

```tsx
      <fog attach="fog" args={[new THREE.Color(envVisual.fog).getHex(), envVisual.fogNear, envVisual.fogFar]} />
      <ambientLight intensity={envVisual.ambient} />
      <hemisphereLight args={[new THREE.Color(envVisual.skyMid).getHex(), new THREE.Color(visual.sea).getHex(), envVisual.hemi]} />
      <directionalLight position={environment.timeOfDay === "sunset" ? [-7, 5, -4] : [5, 8, 3]} intensity={forceNight ? 0.46 : 1.2} color={envVisual.directional} />
```

Update the CSS background at line 7610:

```ts
  const envVisual = resolveExploreEnvironmentVisual(visual, environment);
  const sky = `linear-gradient(to bottom, ${envVisual.skyTop} 0%, ${envVisual.skyMid} 48%, ${envVisual.skyBottom} 82%)`;
```

- [ ] **Step 7: Replace the menu item with time and weather sections**

Replace line 7790 with this block:

```tsx
              <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-[0.18em] text-white/38">时辰</div>
              <div className="grid grid-cols-2 gap-1">
                {EXPLORE_TIME_OPTIONS.map((item) => (
                  <MenuButton
                    key={item.value}
                    icon={item.icon}
                    label={item.value === activeTime.value ? `${item.label} ✓` : item.label}
                    onClick={() => setExploreTime(item.value)}
                  />
                ))}
              </div>
              <div className="my-1 h-px bg-white/10" />
              <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-[0.18em] text-white/38">天气</div>
              <div className="grid grid-cols-2 gap-1">
                {EXPLORE_WEATHER_OPTIONS.map((item) => (
                  <MenuButton
                    key={item.value}
                    icon={item.icon}
                    label={item.value === activeWeather.value ? `${item.label} ✓` : item.label}
                    onClick={() => setExploreWeather(item.value)}
                  />
                ))}
              </div>
```

- [ ] **Step 8: Run the focused integration tests**

Run:

```bash
cd frontend
npm test -- tests/exploreEnvironment.test.mjs tests/exploreC1Integration.test.mjs
```

Expected: all tests in both files pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add frontend/src/components/ExploreMode.tsx frontend/tests/exploreC1Integration.test.mjs
git commit -m "feat: add explore time and weather controls"
```

## Task 5: Rain Visuals And Rain Ambience

**Files:**
- Modify: `frontend/src/lib/locationAmbience.ts:17-32,89-137`
- Modify: `frontend/src/components/ExploreMode.tsx:6322-6620`
- Modify: `frontend/tests/exploreC1Integration.test.mjs`

- [ ] **Step 1: Extend the integration test for rain**

Append this test to `frontend/tests/exploreC1Integration.test.mjs`:

```js
test("explore mode renders rain visuals and enables weather ambience", async () => {
  const explore = await readExploreSource();
  const ambience = await readFile(path.resolve("src/lib/locationAmbience.ts"), "utf8");

  assert.match(explore, /function ExploreRain/);
  assert.match(explore, /<ExploreRain/);
  assert.match(explore, /environment\.weather === "rain"/);
  assert.match(ambience, /setWeatherAmbience/);
  assert.match(ambience, /rain: "rain"/);
  assert.match(ambience, /weatherPool/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd frontend
npm test -- tests/exploreC1Integration.test.mjs
```

Expected: rain test fails because `ExploreRain` and `setWeatherAmbience` do not exist yet.

- [ ] **Step 3: Add weather ambience overlay**

In `frontend/src/lib/locationAmbience.ts`, add a weather type after `LocationZone`:

```ts
export type WeatherAmbience = "clear" | "rain";
```

Add this mapping after `ZONE_FILES`:

```ts
const WEATHER_FILES: Record<Exclude<WeatherAmbience, "clear">, string> = {
  rain: "rain",
};
```

Add module state after `const pool`:

```ts
const weatherPool = new Map<Exclude<WeatherAmbience, "clear">, HTMLAudioElement>();
let activeWeather: Exclude<WeatherAmbience, "clear"> | null = null;
```

Add helper functions before `setLocationZone`:

```ts
function weatherUrl(weather: Exclude<WeatherAmbience, "clear">): string {
  return `/audio/ambience/${WEATHER_FILES[weather]}.m4a`;
}

function getWeatherEl(weather: Exclude<WeatherAmbience, "clear">): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  let el = weatherPool.get(weather);
  if (!el) {
    const src = weatherUrl(weather);
    if (brokenSrc.has(src)) return null;
    el = new Audio();
    el.loop = true;
    el.preload = "none";
    el.volume = 0;
    el.src = src;
    el.addEventListener("error", () => {
      brokenSrc.add(src);
      weatherPool.delete(weather);
    });
    weatherPool.set(weather, el);
  }
  return el;
}
```

Add the exported function before `setLocationAmbienceMuted`:

```ts
export function setWeatherAmbience(weather: WeatherAmbience, on: boolean) {
  if (!on || muted || weather === "clear") {
    if (activeWeather) {
      const prev = activeWeather;
      const prevEl = weatherPool.get(prev);
      if (prevEl && !prevEl.paused) fadeZoneLike(prevEl, 0, () => prevEl.pause());
      activeWeather = null;
    }
    return;
  }
  if (activeWeather === weather) return;
  if (activeWeather) {
    const prevEl = weatherPool.get(activeWeather);
    if (prevEl && !prevEl.paused) fadeZoneLike(prevEl, 0, () => prevEl.pause());
  }
  activeWeather = weather;
  const el = getWeatherEl(weather);
  if (!el) return;
  const p = el.play();
  if (p) p.then(() => fadeZoneLike(el, TARGET_VOLUME * 0.75)).catch(() => { /* ignore */ });
}
```

Add this helper near `fadeZone`:

```ts
function fadeZoneLike(el: HTMLAudioElement, target: number, onDone?: () => void) {
  const start = el.volume;
  const steps = Math.max(1, Math.round(FADE_DURATION_MS / FADE_STEP_MS));
  let i = 0;
  const timer = window.setInterval(() => {
    i += 1;
    el.volume = Math.max(0, Math.min(1, start + (target - start) * (i / steps)));
    if (i >= steps) {
      window.clearInterval(timer);
      el.volume = target;
      onDone?.();
    }
  }, FADE_STEP_MS);
}
```

Update `setLocationAmbienceMuted` and `stopLocationAmbience` to also stop `weatherPool`:

```ts
  if (next) {
    for (const z of pool.keys()) {
      const el = pool.get(z)!;
      if (!el.paused) fadeZone(z, 0, () => el.pause());
    }
    for (const el of weatherPool.values()) {
      if (!el.paused) fadeZoneLike(el, 0, () => el.pause());
    }
  }
```

and:

```ts
  activeWeather = null;
  for (const el of weatherPool.values()) {
    el.pause();
    el.currentTime = 0;
  }
```

- [ ] **Step 4: Render rain in `ExploreMode.tsx`**

Modify the import at line 21:

```ts
import { setLocationZone, setWeatherAmbience, stopLocationAmbience, type LocationZone } from "../lib/locationAmbience";
```

Add this component before `ExploreScene`:

```tsx
function ExploreRain({ active, opacity, tier }: { active: boolean; opacity: number; tier: PerfTier }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = tier === "low" ? 90 : 180;
  const geo = useMemo(() => new THREE.CylinderGeometry(0.012, 0.012, 2.4, 4), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#dbeafe", transparent: true, opacity, depthWrite: false }), [opacity]);
  const drops = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: (hash2(i, 1.2) - 0.5) * 340,
    y: 36 + hash2(i, 3.4) * 70,
    z: (hash2(i, 5.6) - 0.5) * 340,
    speed: 18 + hash2(i, 7.8) * 18,
  })), [count]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh || !active) return;
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      drop.y -= drop.speed * dt;
      if (drop.y < 2) drop.y = 70;
      dummy.position.set(drop.x, drop.y, drop.z);
      dummy.rotation.set(0.35, 0, -0.18);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (!active) return null;
  return <instancedMesh ref={ref} args={[geo, mat, count]} frustumCulled={false} />;
}
```

Inside `ExploreScene`, add an effect after `forceNight` is derived:

```ts
  useEffect(() => {
    setWeatherAmbience(environment.weather, true);
    return () => setWeatherAmbience("clear", false);
  }, [environment.weather]);
```

Render rain after line 6518:

```tsx
      <ExploreRain active={environment.weather === "rain"} opacity={envVisual.rainOpacity} tier={tier} />
```

For rain haze, add this mesh after the shallow-water mesh:

```tsx
      {environment.weather === "rain" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]}>
          <circleGeometry args={[WALK_RADIUS * 0.92, 96]} />
          <meshBasicMaterial color="#dbeafe" transparent opacity={0.08} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd frontend
npm test -- tests/exploreC1Integration.test.mjs
```

Expected: all tests in `exploreC1Integration.test.mjs` pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add frontend/src/lib/locationAmbience.ts frontend/src/components/ExploreMode.tsx frontend/tests/exploreC1Integration.test.mjs
git commit -m "feat: add rain to explore mode"
```

## Task 6: Render The Six New District Scene Groups

**Files:**
- Modify: `frontend/src/components/ExploreMode.tsx:760-960,6322-6620`
- Modify: `frontend/tests/exploreC1Integration.test.mjs`

- [ ] **Step 1: Extend the integration test for districts**

Append this test to `frontend/tests/exploreC1Integration.test.mjs`:

```js
test("explore scene renders C1 district groups", async () => {
  const source = await readExploreSource();
  const sceneBlock = sourceBlock(source, "function ExploreScene", "function ExploreMode");

  for (const name of ["HomeDistrict", "RiceFieldDistrict", "FarmDistrict", "ZooDistrict", "SwampDistrict", "ScenicDistrict", "IslandDistricts"]) {
    assert.match(source, new RegExp(`function ${name}`));
  }
  assert.match(sceneBlock, /<IslandDistricts/);
  assert.match(sceneBlock, /environment=\{environment\}/);
  assert.match(source, /MODELS\.natCropSprout/);
  assert.match(source, /MODELS\.natReed/);
  assert.match(source, /MODELS\.natLotus/);
  assert.match(source, /MODELS\.critterFox/);
  assert.match(source, /MODELS\.critterCat/);
  assert.match(source, /MODELS\.critterOwl/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd frontend
npm test -- tests/exploreC1Integration.test.mjs
```

Expected: district test fails because district components do not exist.

- [ ] **Step 3: Add missing model keys**

In the `MODELS` object around lines 760-860, ensure these keys exist:

```ts
  natLotus: "/models/xy_nat_lotus.glb",
  natReed: "/models/xy_nat_reed.glb",
  natCropSprout: "/models/xy_nat_crop_sprout.glb",
```

Keep existing `natCropSprout` if already present, and only add `natLotus` and `natReed`.

- [ ] **Step 4: Add a reusable ground prop helper**

Add after `GltfProp` is defined:

```tsx
function GroundProp({ url, grad, x, z, scale = 1, rot = 0, yOffset = 0, tint }: {
  url: string;
  grad: THREE.Texture;
  x: number;
  z: number;
  scale?: number;
  rot?: number;
  yOffset?: number;
  tint?: string;
}) {
  return <GltfProp url={url} grad={grad} tint={tint} position={[x, exGroundY(x, z) + yOffset, z]} rotation={[0, rot, 0]} scale={scale} />;
}
```

- [ ] **Step 5: Add district components**

Add these components before `ExploreScene`:

```tsx
function HomeDistrict({ grad, night }: { grad: THREE.Texture; night: boolean }) {
  const lamps = night ? "#ffd98a" : undefined;
  return (
    <group>
      <GroundProp url={MODELS.houseCottage} grad={grad} x={-26} z={-24} rot={0.55} scale={1.1} />
      <GroundProp url={MODELS.houseLoft} grad={grad} x={-15} z={-16} rot={-0.4} scale={0.9} />
      <GroundProp url={MODELS.townMailbox} grad={grad} x={-31} z={-15} rot={0.8} scale={0.9} tint={lamps} />
      <GroundProp url={MODELS.townBench} grad={grad} x={-19} z={-31} rot={1.8} scale={0.9} />
      <GroundProp url={MODELS.isleWell} grad={grad} x={-34} z={-28} scale={0.75} />
    </group>
  );
}

function RiceFieldDistrict({ grad, lowTier }: { grad: THREE.Texture; lowTier: boolean }) {
  const rows = lowTier ? 8 : 14;
  const cols = lowTier ? 7 : 11;
  const items = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 42 + c * 3.1 + (r % 2) * 0.8;
      const z = -99 + r * 3.0;
      items.push(<GroundProp key={`${r}-${c}`} url={MODELS.natCropSprout} grad={grad} x={x} z={z} rot={(c * 0.37 + r * 0.21) % 6.28} scale={0.82} />);
    }
  }
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[58, exGroundY(58, -80) + 0.04, -80]}>
        <planeGeometry args={[48, 38]} />
        <meshBasicMaterial color="#9fcf7a" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      {items}
      <GroundProp url={MODELS.townHaystack} grad={grad} x={79} z={-86} rot={0.4} scale={1.2} />
      <GroundProp url={MODELS.paperboat} grad={grad} x={47} z={-73} rot={-0.6} scale={0.9} />
    </group>
  );
}

function FarmDistrict({ grad }: { grad: THREE.Texture }) {
  return (
    <group>
      <GroundProp url={MODELS.houseVilla} grad={grad} x={-58} z={-93} rot={-0.8} scale={1.0} />
      <GroundProp url={MODELS.townHaystack} grad={grad} x={-43} z={-82} rot={0.3} scale={1.35} />
      <GroundProp url={MODELS.townHaystack} grad={grad} x={-66} z={-78} rot={1.4} scale={1.0} />
      <GroundProp url={MODELS.townFence} grad={grad} x={-51} z={-70} rot={0.1} scale={1.4} />
      <GroundProp url={MODELS.windmill} grad={grad} x={-72} z={-104} rot={0.7} scale={1.1} />
    </group>
  );
}

function ZooDistrict({ grad, night }: { grad: THREE.Texture; night: boolean }) {
  const tint = night ? "#ffe9a0" : undefined;
  return (
    <group>
      <GroundProp url={MODELS.townFence} grad={grad} x={76} z={-19} rot={0.0} scale={1.5} />
      <GroundProp url={MODELS.townFence} grad={grad} x={88} z={-19} rot={0.0} scale={1.5} />
      <GroundProp url={MODELS.townFence} grad={grad} x={82} z={-31} rot={Math.PI / 2} scale={1.5} />
      <GroundProp url={MODELS.townSignpost} grad={grad} x={70} z={-36} rot={0.5} scale={1.0} tint={tint} />
      <GroundProp url={MODELS.critterFox} grad={grad} x={79} z={-24} rot={0.5} scale={0.9} />
      <GroundProp url={MODELS.critterCat} grad={grad} x={88} z={-28} rot={-0.8} scale={0.9} />
      <GroundProp url={MODELS.critterOwl} grad={grad} x={84} z={-15} rot={0.2} scale={0.85} />
    </group>
  );
}

function SwampDistrict({ grad, accent, lowTier }: { grad: THREE.Texture; accent: string; lowTier: boolean }) {
  const count = lowTier ? 10 : 18;
  const reeds = Array.from({ length: count }, (_, i) => {
    const a = hash2(i + 31, 2.2) * Math.PI * 2;
    const r = 5 + hash2(i + 31, 4.4) * 20;
    return <GroundProp key={i} url={MODELS.natReed} grad={grad} x={92 + Math.cos(a) * r} z={-104 + Math.sin(a) * r} rot={a} scale={0.9 + hash2(i, 6.6) * 0.5} />;
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[92, exGroundY(92, -104) + 0.05, -104]}>
        <circleGeometry args={[27, 48]} />
        <meshStandardMaterial color={accent} roughness={0.4} metalness={0.1} transparent opacity={0.2} depthWrite={false} />
      </mesh>
      {reeds}
      <GroundProp url={MODELS.natLotus} grad={grad} x={84} z={-97} rot={0.4} scale={1.1} />
      <GroundProp url={MODELS.natLotus} grad={grad} x={101} z={-111} rot={-0.5} scale={0.9} />
      <GroundProp url={MODELS.natMushroom} grad={grad} x={109} z={-96} rot={0.8} scale={1.1} />
    </group>
  );
}

function ScenicDistrict({ grad, night }: { grad: THREE.Texture; night: boolean }) {
  const glow = night ? "#ffe9a0" : undefined;
  return (
    <group>
      <GroundProp url={MODELS.torii} grad={grad} x={18} z={112} rot={Math.PI} scale={1.1} />
      <GroundProp url={MODELS.isleLookout} grad={grad} x={31} z={105} rot={-0.5} scale={1.05} />
      <GroundProp url={MODELS.stonelantern} grad={grad} x={8} z={104} rot={0.4} scale={1.0} tint={glow} />
      <GroundProp url={MODELS.stonelantern} grad={grad} x={38} z={115} rot={-0.3} scale={1.0} tint={glow} />
      <GroundProp url={MODELS.isleWindchime} grad={grad} x={23} z={98} rot={0.2} scale={0.9} />
    </group>
  );
}

function IslandDistricts({ grad, accent, environment, tier }: { grad: THREE.Texture; accent: string; environment: ExploreEnvironment; tier: PerfTier }) {
  const night = environment.timeOfDay === "night";
  const lowTier = tier === "low";
  return (
    <group>
      <HomeDistrict grad={grad} night={night} />
      <RiceFieldDistrict grad={grad} lowTier={lowTier} />
      <FarmDistrict grad={grad} />
      <ZooDistrict grad={grad} night={night} />
      <SwampDistrict grad={grad} accent={accent} lowTier={lowTier} />
      <ScenicDistrict grad={grad} night={night} />
    </group>
  );
}
```

- [ ] **Step 6: Mount the districts with delayed loading**

Add `districts` to `revealDelay`:

```ts
    districts: lowTier ? 12500 : 500,
```

Render after `Coastline`:

```tsx
      <DelayedMount ms={revealDelay.districts}>
        <Suspense fallback={null}>
          <IslandDistricts grad={toonGrad} accent={visual.accent} environment={environment} tier={tier} />
        </Suspense>
      </DelayedMount>
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd frontend
npm test -- tests/exploreC1Integration.test.mjs
```

Expected: all tests in `exploreC1Integration.test.mjs` pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add frontend/src/components/ExploreMode.tsx frontend/tests/exploreC1Integration.test.mjs
git commit -m "feat: render C1 island districts"
```

## Task 7: District Proximity Prompts And Ambience Routing

**Files:**
- Modify: `frontend/src/components/ExploreMode.tsx:5454-5501,6322-6620,7714-7740`
- Modify: `frontend/tests/exploreC1Integration.test.mjs`

- [ ] **Step 1: Extend the integration test for proximity and ambience**

Append this test to `frontend/tests/exploreC1Integration.test.mjs`:

```js
test("explore districts drive proximity prompts and location ambience", async () => {
  const source = await readExploreSource();
  const audioBlock = sourceBlock(source, "function LocationAudio", "const MAP_VIEW");

  assert.match(source, /findExploreZone/);
  assert.match(source, /exploreZoneAmbience/);
  assert.match(source, /function DistrictProximity/);
  assert.match(source, /nearDistrict/);
  assert.match(source, /回家坐一会儿|稻田在风里轻轻摆|沼泽回声|登高望岛/);
  assert.match(audioBlock, /findExploreZone\(p\.x,\s*p\.z\)/);
  assert.match(audioBlock, /exploreZoneAmbience/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd frontend
npm test -- tests/exploreC1Integration.test.mjs
```

Expected: proximity test fails because `findExploreZone` is not used by `ExploreMode.tsx`.

- [ ] **Step 3: Import zone helpers**

Modify imports:

```ts
import { EXPLORE_MAP_POIS, EXPLORE_ZONES, exploreZoneAmbience, findExploreZone, type ExplorePoiKind, type ExploreZone } from "../lib/exploreZones";
```

- [ ] **Step 4: Route ambience through zone registry**

Update `LocationAudio` signature:

```tsx
function LocationAudio({ posRef, night }: { posRef: React.RefObject<THREE.Vector3>; night: boolean }) {
```

Keep the signature and replace the zone priority block at lines 5472-5480 with:

```ts
      const district = findExploreZone(p.x, p.z);
      const districtZone = exploreZoneAmbience(district, night);
      let zone: LocationZone;
      if (districtZone) zone = districtZone;
      else if (dist2(p.x, p.z, POND.x, POND.z) < 144) zone = "brook";
      else if (dist2(p.x, p.z, BONFIRE.x, BONFIRE.z) < 64) zone = "campfire";
      else if (r2 > WALK_RADIUS * WALK_RADIUS * 1.1025) zone = "ocean";
      else if ((bay > 0.32 && r2 > WALK_RADIUS * WALK_RADIUS * 0.6084) || gy < 0.12) zone = "bay";
      else if (gy > 4.5) zone = "mountain";
      else if (r2 > WALK_RADIUS * WALK_RADIUS * 0.2025 && r2 <= WALK_RADIUS * WALK_RADIUS * 0.6084) zone = "forest";
      else zone = night ? "meadow_night" : "meadow_day";
```

- [ ] **Step 5: Add district proximity prompt state**

In `ExploreMode`, add state after `nearFlower`:

```ts
  const [nearDistrict, setNearDistrict] = useState<ExploreZone | null>(null);
```

Add the helper function after `fmtWhen`:

```ts
  const districtLine = (zone: ExploreZone): string => {
    switch (zone.key) {
      case "home": return "回家坐一会儿，窗边的光会慢慢安静下来。";
      case "beach": return "海滩把浪声推到脚边，适合拾起一枚贝壳。";
      case "rice": return "稻田在风里轻轻摆，水面把天空切成细碎的光。";
      case "mountain": return "山路往上，能从这里登高望岛。";
      case "forest": return "森林把脚步声收得很轻，也许有小动物看见了你。";
      case "town": return "小镇的路灯和招牌都在等一个慢慢走过的人。";
      case "farm": return "农村的小路绕过干草堆，风车把今天翻到下一页。";
      case "zoo": return "动物园的小伙伴们很安静，靠近一点也没关系。";
      case "swamp": return "沼泽回声从芦苇里冒出来，雨天会更亮一点。";
      case "scenic": return "风景区的观景台正对着全岛，日出和夕阳最适合停留。";
    }
  };
```

- [ ] **Step 6: Add `DistrictProximity`**

Add before `ExploreScene`:

```tsx
function DistrictProximity({ posRef, onNear }: { posRef: React.RefObject<THREE.Vector3>; onNear: (zone: ExploreZone | null) => void }) {
  const lastKey = useRef<string | null>(null);
  const tick = useRef(0);
  useFrame((_, dt) => {
    tick.current -= dt;
    if (tick.current > 0) return;
    tick.current = 0.25;
    const p = posRef.current;
    const zone = p ? findExploreZone(p.x, p.z) : null;
    const key = zone?.key ?? null;
    if (key !== lastKey.current) {
      lastKey.current = key;
      onNear(zone);
    }
  });
  return null;
}
```

Add `onNearDistrict` to `ExploreScene` props:

```ts
  onNearDistrict,
```

and:

```ts
  onNearDistrict: (zone: ExploreZone | null) => void;
```

Render inside the interactions suspense near `InteractProximity`:

```tsx
        <DistrictProximity posRef={posRef} onNear={onNearDistrict} />
```

Pass the prop in the `ExploreScene` usage:

```tsx
onNearDistrict={setNearDistrict}
```

- [ ] **Step 7: Display the prompt without overlapping existing HUD**

After the wind-chime HUD block near line 7739, add:

```tsx
        {nearDistrict && (
          <div className="panel-glass-1 max-w-[92vw] rounded-full px-3.5 py-1 text-caption text-white/72">
            {nearDistrict.icon} {nearDistrict.label} · {districtLine(nearDistrict)}
          </div>
        )}
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
cd frontend
npm test -- tests/exploreC1Integration.test.mjs
```

Expected: all tests in `exploreC1Integration.test.mjs` pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add frontend/src/components/ExploreMode.tsx frontend/tests/exploreC1Integration.test.mjs
git commit -m "feat: add C1 district prompts and ambience"
```

## Task 8: Full Verification And Visual Pass

**Files:**
- Modify only if verification reveals defects in files touched by Tasks 1-7.

- [ ] **Step 1: Run the full frontend test suite**

Run:

```bash
cd frontend
npm test
```

Expected: all `frontend/tests/*.test.mjs` pass.

- [ ] **Step 2: Run the frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: TypeScript build and Vite production build complete without errors.

- [ ] **Step 3: Open the running app and verify desktop C1 behavior**

Use the existing dev server at `http://127.0.0.1:5173/`. In the browser:

1. Click `上岛走走`.
2. Open the all-island map.
3. Confirm the map labels include `家`、`海滩`、`稻田`、`山`、`森林`、`小镇`、`农村`、`动物园`、`沼泽地`、`风景区`.
4. Open the menu.
5. Switch `时辰` through `日出`、`中午`、`夕阳`、`夜晚`.
6. Switch `天气` to `下雨`, then back to `晴天`.
7. Walk or drive near at least three new zones: `家`, `稻田`, `沼泽地`.

Expected: the island remains visible, UI text does not overlap, rain appears only during `下雨`, and zone prompt pills appear near districts.

- [ ] **Step 4: Capture desktop screenshots**

Save screenshots under `docs/screenshots/`:

```text
docs/screenshots/c1-map-ten-districts.png
docs/screenshots/c1-sunset-rain.png
docs/screenshots/c1-rice-field.png
```

Expected: screenshots show the map labels, rain state, and at least one new district.

- [ ] **Step 5: Verify mobile-sized viewport**

Use browser viewport `390x844` or equivalent. Repeat:

1. Open `上岛走走`.
2. Open menu.
3. Open full map.
4. Toggle rain.

Expected: menu remains within screen width, map legend wraps, HUD prompt does not cover the joystick or bottom buttons.

- [ ] **Step 6: Fix verification defects with focused tests**

If a defect appears, add or update a source-level test in `frontend/tests/exploreC1Integration.test.mjs` that describes the broken behavior. Then patch the smallest relevant file. Run:

```bash
cd frontend
npm test -- tests/exploreC1Integration.test.mjs
npm run build
```

Expected: focused test and build pass after the fix.

- [ ] **Step 7: Final commit**

Run:

```bash
git add frontend/src frontend/tests docs/screenshots
git commit -m "test: verify C1 island exploration"
```

Skip this commit only if Step 6 made no code, test, or screenshot changes after the previous task commits.

## Self-Review

| Spec Requirement | Covered By |
|---|---|
| Ten districts in one continuous 3D island | Tasks 2, 3, 6, 7 |
| Map labels for all requested places | Tasks 2, 3 |
| Dawn/noon/sunset/night | Tasks 1, 4 |
| Rain weather state | Tasks 1, 4, 5 |
| Environment audio and rain sound | Tasks 5, 7 |
| Lightweight interactions per district | Task 7 |
| Existing gameplay preserved | Tasks 4-8 verify existing scene and tests |
| Performance through delayed mount and low-tier counts | Tasks 5, 6 |
| Automated tests and build verification | Tasks 1-8 |

No independent backend, database, or API subsystem is required for this C1 implementation. The plan intentionally keeps all changes inside the frontend exploration surface and supporting frontend libraries.
