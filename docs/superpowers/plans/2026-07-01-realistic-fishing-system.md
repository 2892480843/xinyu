# Realistic Fishing System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current HUD-only fishing rhythm interaction with a realistic fishing system where the playable hero aims, casts, hooks, fights, and records fish using ecosystem, gear, bait, tension, and codex rules.

**Architecture:** Keep the experience inside `ExploreMode`, but move fishing rules, species, gear, simulation, and storage into focused `frontend/src/lib` modules. Extend the existing protagonist action selector so the current `hero` can enter fishing actions, then connect a procedural rod/line/bobber scene layer and a compact HUD around the pure simulation state.

**Tech Stack:** Vite, React 19, Three.js/R3F, TypeScript, Node `node:test`, TypeScript `transpileModule`, browser `localStorage`.

---

## Scope Check

The approved spec spans rule simulation, storage, protagonist action routing, 3D scene feedback, HUD, and tests. These are tightly coupled around one user-facing fishing loop, so this plan keeps them together but splits implementation into independently testable commits.

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `frontend/tests/fishingSystem.test.mjs` | Create | TDD coverage for species, gear, simulation, and storage pure modules. |
| `frontend/tests/fishingProtagonistAction.test.mjs` | Create | TDD coverage for protagonist fishing action selection and `ExploreMode` hero routing. |
| `frontend/tests/realisticFishingExploreMode.test.mjs` | Create | Source-level integration checks for `ExploreMode` realistic fishing wiring. |
| `frontend/tests/fishingRhythm.test.mjs` | Modify | Keep legacy pure rhythm helper coverage, remove old HUD/source assertions that no longer describe the product. |
| `frontend/src/lib/fishingSystem.ts` | Create | Shared fishing phases, environment, session, outcome, and input types. |
| `frontend/src/lib/fishingSpecies.ts` | Create | Fish species catalog, condition weighting, and deterministic weighted selection. |
| `frontend/src/lib/fishingGear.ts` | Create | Rod, line, bait catalog and loadout resolution. |
| `frontend/src/lib/fishingSimulation.ts` | Create | Pure cast, hook, bite, tension, escape, and catch simulation helpers. |
| `frontend/src/lib/fishingStorage.ts` | Create | Versioned local save loading, saving, catch recording, and release recording. |
| `frontend/src/lib/protagonistAction.ts` | Modify | Add fishing action clips and selection priority. |
| `frontend/src/components/ExploreMode.tsx` | Modify | Wire realistic fishing session state, hero action routing, procedural rod/line/bobber feedback, HUD, and codex/result handling. |

The worktree already has unrelated modified and untracked files. Every commit step must stage only the paths listed in that task.

---

### Task 1: Add Failing Pure Fishing System Tests

**Files:**
- Create: `frontend/tests/fishingSystem.test.mjs`

- [ ] **Step 1: Write the failing test file**

Create `frontend/tests/fishingSystem.test.mjs` with this content:

```js
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const fishingModuleNames = ["fishingSystem", "fishingGear", "fishingSpecies", "fishingSimulation", "fishingStorage"];

async function importFishingModule(entryName) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xy-real-fishing-"));
  for (const moduleName of fishingModuleNames) {
    const source = await readFile(path.resolve(`src/lib/${moduleName}.ts`), "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: true,
      },
    }).outputText.replaceAll(/from "\.\/(fishing[A-Za-z]+)"/g, 'from "./$1.mjs"');
    await writeFile(path.join(dir, `${moduleName}.mjs`), output, "utf8");
  }
  const modulePath = path.join(dir, `${entryName}.mjs`);
  return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);
}

test("fishing species catalog contains the approved first five fish", async () => {
  const { FISHING_SPECIES, getFishingSpecies } = await importFishingModule("fishingSpecies");

  assert.deepEqual(
    FISHING_SPECIES.map((species) => species.id),
    ["silver_bay_minnow", "tide_bream", "rainscale_fish", "fog_lantern_eel", "starsea_fish"],
  );
  assert.equal(getFishingSpecies("starsea_fish").name, "星海鱼");
  assert.equal(getFishingSpecies("missing"), undefined);
});

test("fishing species pool is weighted by environment and bait", async () => {
  const { buildFishingPool, chooseWeightedSpecies } = await importFishingModule("fishingSpecies");

  const pool = buildFishingPool(
    { spot: "nightTide", weather: "clear", timeOfDay: "night", layer: "far" },
    "stardust_bait",
  );

  const star = pool.find((entry) => entry.species.id === "starsea_fish");
  const minnow = pool.find((entry) => entry.species.id === "silver_bay_minnow");
  assert.ok(star, "night far water with stardust bait should include starsea fish");
  assert.ok(minnow, "common fish should stay available as a fallback");
  assert.ok(star.weight > minnow.weight, "matching legendary conditions should outweigh common fallback");
  assert.equal(chooseWeightedSpecies(pool, () => 0).id, "silver_bay_minnow");
  assert.equal(chooseWeightedSpecies(pool, () => 0.999).id, "starsea_fish");
});

test("fishing gear resolves safe defaults and numeric control values", async () => {
  const { DEFAULT_FISHING_LOADOUT, resolveFishingLoadout } = await importFishingModule("fishingGear");

  assert.deepEqual(DEFAULT_FISHING_LOADOUT, {
    rodId: "bamboo_shadow_rod",
    lineId: "fine_line",
    baitId: "plain_bait",
  });

  const loadout = resolveFishingLoadout({
    rodId: "star_tide_rod",
    lineId: "star_thread_line",
    baitId: "stardust_bait",
  });

  assert.equal(loadout.rod.name, "星潮竿");
  assert.equal(loadout.line.breakLimit > 0.9, true);
  assert.equal(loadout.bait.targetSpeciesIds.includes("starsea_fish"), true);
});

test("casting maps power to layer and distance", async () => {
  const { castPowerToWaterLayer, calculateCastDistance, isCastValid } = await importFishingModule("fishingSimulation");
  const { resolveFishingLoadout } = await importFishingModule("fishingGear");
  const loadout = resolveFishingLoadout({ rodId: "sea_breeze_rod", lineId: "tough_line", baitId: "shell_meat" });

  assert.equal(castPowerToWaterLayer(0.12), "near");
  assert.equal(castPowerToWaterLayer(0.52), "mid");
  assert.equal(castPowerToWaterLayer(0.88), "far");
  assert.equal(isCastValid(0.05), false);
  assert.equal(isCastValid(0.45), true);
  assert.equal(calculateCastDistance(0.5, loadout.rod), 8.5);
});

test("hook timing separates early hit and late outcomes", async () => {
  const { resolveHookResult } = await importFishingModule("fishingSimulation");

  assert.equal(resolveHookResult(120), "early");
  assert.equal(resolveHookResult(420), "hit");
  assert.equal(resolveHookResult(960), "late");
});

test("fight simulation catches, breaks, or loses fish from tension state", async () => {
  const { nextFishingFightState } = await importFishingModule("fishingSimulation");

  const setup = {
    rodControl: 0.7,
    lineBreakLimit: 0.82,
    speciesStrength: 0.42,
    speciesStamina: 0.24,
  };

  const steady = nextFishingFightState(
    { tension: 0.48, fishStamina: 0.08, fishDistance: 0.12, strainMs: 0, slackMs: 0, outcome: "fighting" },
    { reeling: true, steadying: true, fishSurge: 0.1 },
    setup,
    500,
  );
  assert.equal(steady.outcome, "caught");

  const broken = nextFishingFightState(
    { tension: 0.92, fishStamina: 0.5, fishDistance: 0.6, strainMs: 850, slackMs: 0, outcome: "fighting" },
    { reeling: true, steadying: false, fishSurge: 0.7 },
    setup,
    200,
  );
  assert.equal(broken.outcome, "line_broken");

  const escaped = nextFishingFightState(
    { tension: 0.05, fishStamina: 0.5, fishDistance: 0.8, strainMs: 0, slackMs: 1150, outcome: "fighting" },
    { reeling: false, steadying: false, fishSurge: 0.2 },
    setup,
    200,
  );
  assert.equal(escaped.outcome, "fish_escaped");
});

test("fishing storage initializes, records catch, records release, and tolerates bad JSON", async () => {
  const { createDefaultFishingSave, loadFishingSave, recordFishingCatch, recordFishingRelease, saveFishingSave } =
    await importFishingModule("fishingStorage");

  const memory = new Map();
  const storage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, value),
  };

  const empty = loadFishingSave(storage);
  assert.deepEqual(empty, createDefaultFishingSave());

  const caught = recordFishingCatch(empty, { speciesId: "silver_bay_minnow", weight: 0.42, caughtAt: 1782900000000 });
  assert.equal(caught.stats.totalCatches, 1);
  assert.equal(caught.codex.silver_bay_minnow.maxWeight, 0.42);

  const released = recordFishingRelease(caught, "silver_bay_minnow");
  assert.equal(released.stats.totalReleased, 1);
  assert.equal(released.codex.silver_bay_minnow.releaseCount, 1);

  saveFishingSave(storage, released);
  assert.equal(loadFishingSave(storage).stats.totalCatches, 1);

  memory.set("xy_fishing_v1", "{bad json");
  assert.deepEqual(loadFishingSave(storage), createDefaultFishingSave());
});
```

- [ ] **Step 2: Run the red test**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && node --test tests/fishingSystem.test.mjs
```

Expected: FAIL with `ENOENT` for the first missing `src/lib/fishing*.ts` module, because the production modules do not exist.

- [ ] **Step 3: Commit only the red tests**

Run:

```bash
cd /Users/a111/chen/code/心屿
git add frontend/tests/fishingSystem.test.mjs
git commit -m "test: add realistic fishing system red tests"
```

Expected: commit includes only `frontend/tests/fishingSystem.test.mjs`.

---

### Task 2: Implement Pure Fishing Domain Modules

**Files:**
- Create: `frontend/src/lib/fishingSystem.ts`
- Create: `frontend/src/lib/fishingSpecies.ts`
- Create: `frontend/src/lib/fishingGear.ts`
- Create: `frontend/src/lib/fishingSimulation.ts`
- Create: `frontend/src/lib/fishingStorage.ts`
- Test: `frontend/tests/fishingSystem.test.mjs`

- [ ] **Step 1: Create shared fishing system types**

Create `frontend/src/lib/fishingSystem.ts` with this content:

```ts
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

export type FishingSpotKind = "shallows" | "reef" | "deepBay" | "nightTide";
export type FishingWaterLayer = "near" | "mid" | "far";
export type FishingWeather = "clear" | "rain" | "fog" | "wind";
export type FishingTimeOfDay = "morning" | "day" | "sunset" | "night";
export type FishingFightOutcome = "fighting" | "caught" | "fish_escaped" | "line_broken";

export interface FishingEnvironment {
  spot: FishingSpotKind;
  weather: FishingWeather;
  timeOfDay: FishingTimeOfDay;
  layer: FishingWaterLayer;
}

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

export interface FishingSession {
  phase: FishingPhase;
  aimOffset: number;
  castPower: number;
  layer: FishingWaterLayer;
  selectedSpeciesId: string | null;
  hookStartedAtMs: number;
  fight: FishingFightState;
}

export const INITIAL_FISHING_FIGHT: FishingFightState = {
  tension: 0.42,
  fishStamina: 1,
  fishDistance: 1,
  strainMs: 0,
  slackMs: 0,
  outcome: "fighting",
};

export const INITIAL_FISHING_SESSION: FishingSession = {
  phase: "idle",
  aimOffset: 0,
  castPower: 0,
  layer: "near",
  selectedSpeciesId: null,
  hookStartedAtMs: 0,
  fight: INITIAL_FISHING_FIGHT,
};
```

- [ ] **Step 2: Create gear catalog**

Create `frontend/src/lib/fishingGear.ts` with this content:

```ts
export interface FishingRod {
  id: string;
  name: string;
  minDistance: number;
  maxDistance: number;
  control: number;
  maxFishWeight: number;
  tensionWindowBonus: number;
}

export interface FishingLine {
  id: string;
  name: string;
  breakLimit: number;
  recovery: number;
}

export interface FishingBait {
  id: string;
  name: string;
  targetSpeciesIds: string[];
  biteBonus: number;
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

export const FISHING_RODS: FishingRod[] = [
  { id: "bamboo_shadow_rod", name: "竹影竿", minDistance: 2, maxDistance: 10, control: 0.58, maxFishWeight: 2.2, tensionWindowBonus: 0 },
  { id: "sea_breeze_rod", name: "海风竿", minDistance: 2.5, maxDistance: 14.5, control: 0.7, maxFishWeight: 4.6, tensionWindowBonus: 0.06 },
  { id: "star_tide_rod", name: "星潮竿", minDistance: 3, maxDistance: 19, control: 0.82, maxFishWeight: 8.8, tensionWindowBonus: 0.11 },
];

export const FISHING_LINES: FishingLine[] = [
  { id: "fine_line", name: "细线", breakLimit: 0.74, recovery: 0.28 },
  { id: "tough_line", name: "韧线", breakLimit: 0.84, recovery: 0.22 },
  { id: "star_thread_line", name: "星丝线", breakLimit: 0.94, recovery: 0.18 },
];

export const FISHING_BAITS: FishingBait[] = [
  { id: "plain_bait", name: "普通饵", targetSpeciesIds: ["silver_bay_minnow"], biteBonus: 0.05 },
  { id: "shell_meat", name: "贝肉", targetSpeciesIds: ["tide_bream", "rainscale_fish"], biteBonus: 0.1 },
  { id: "stardust_bait", name: "星屑饵", targetSpeciesIds: ["fog_lantern_eel", "starsea_fish"], biteBonus: 0.16 },
];

export const DEFAULT_FISHING_LOADOUT = {
  rodId: "bamboo_shadow_rod",
  lineId: "fine_line",
  baitId: "plain_bait",
};

export function getFishingRod(id: string | undefined): FishingRod | undefined {
  return FISHING_RODS.find((rod) => rod.id === id);
}

export function getFishingLine(id: string | undefined): FishingLine | undefined {
  return FISHING_LINES.find((line) => line.id === id);
}

export function getFishingBait(id: string | undefined): FishingBait | undefined {
  return FISHING_BAITS.find((bait) => bait.id === id);
}

export function resolveFishingLoadout(input: FishingLoadoutInput = {}): FishingLoadout {
  return {
    rod: getFishingRod(input.rodId) ?? getFishingRod(DEFAULT_FISHING_LOADOUT.rodId)!,
    line: getFishingLine(input.lineId) ?? getFishingLine(DEFAULT_FISHING_LOADOUT.lineId)!,
    bait: getFishingBait(input.baitId) ?? getFishingBait(DEFAULT_FISHING_LOADOUT.baitId)!,
  };
}
```

- [ ] **Step 3: Create species catalog and weighting**

Create `frontend/src/lib/fishingSpecies.ts` with this content:

```ts
import type { FishingEnvironment, FishingSpotKind, FishingTimeOfDay, FishingWaterLayer, FishingWeather } from "./fishingSystem";

export type FishRarity = "common" | "uncommon" | "rare" | "legendary";

export interface FishingSpecies {
  id: string;
  name: string;
  rarity: FishRarity;
  minWeight: number;
  maxWeight: number;
  baseWeight: number;
  preferredSpots: FishingSpotKind[];
  preferredWeather: FishingWeather[];
  preferredTime: FishingTimeOfDay[];
  preferredLayers: FishingWaterLayer[];
  preferredBaits: string[];
  strength: number;
  stamina: number;
}

export interface WeightedFishingSpecies {
  species: FishingSpecies;
  weight: number;
  reasons: string[];
}

export const FISHING_SPECIES: FishingSpecies[] = [
  {
    id: "silver_bay_minnow",
    name: "银湾小鱼",
    rarity: "common",
    minWeight: 0.12,
    maxWeight: 0.55,
    baseWeight: 42,
    preferredSpots: ["shallows", "deepBay", "reef", "nightTide"],
    preferredWeather: ["clear", "rain", "fog", "wind"],
    preferredTime: ["morning", "day", "sunset", "night"],
    preferredLayers: ["near", "mid"],
    preferredBaits: ["plain_bait"],
    strength: 0.18,
    stamina: 0.22,
  },
  {
    id: "tide_bream",
    name: "潮声鲷",
    rarity: "common",
    minWeight: 0.45,
    maxWeight: 1.6,
    baseWeight: 28,
    preferredSpots: ["shallows", "reef", "deepBay"],
    preferredWeather: ["clear", "wind"],
    preferredTime: ["sunset", "day"],
    preferredLayers: ["mid"],
    preferredBaits: ["shell_meat"],
    strength: 0.36,
    stamina: 0.42,
  },
  {
    id: "rainscale_fish",
    name: "雨鳞鱼",
    rarity: "uncommon",
    minWeight: 0.8,
    maxWeight: 2.8,
    baseWeight: 15,
    preferredSpots: ["deepBay"],
    preferredWeather: ["rain"],
    preferredTime: ["morning", "sunset", "night"],
    preferredLayers: ["mid", "far"],
    preferredBaits: ["shell_meat"],
    strength: 0.52,
    stamina: 0.58,
  },
  {
    id: "fog_lantern_eel",
    name: "雾灯鳗",
    rarity: "rare",
    minWeight: 1.1,
    maxWeight: 3.8,
    baseWeight: 8,
    preferredSpots: ["reef", "nightTide"],
    preferredWeather: ["fog"],
    preferredTime: ["night"],
    preferredLayers: ["mid", "far"],
    preferredBaits: ["stardust_bait"],
    strength: 0.68,
    stamina: 0.7,
  },
  {
    id: "starsea_fish",
    name: "星海鱼",
    rarity: "legendary",
    minWeight: 1.8,
    maxWeight: 5.2,
    baseWeight: 3,
    preferredSpots: ["nightTide"],
    preferredWeather: ["clear", "fog"],
    preferredTime: ["night"],
    preferredLayers: ["far"],
    preferredBaits: ["stardust_bait"],
    strength: 0.82,
    stamina: 0.86,
  },
];

export function getFishingSpecies(id: string): FishingSpecies | undefined {
  return FISHING_SPECIES.find((species) => species.id === id);
}

function conditionBonus<T extends string>(value: T, preferred: T[], bonus: number, reason: string, reasons: string[]): number {
  if (!preferred.includes(value)) return 0;
  reasons.push(reason);
  return bonus;
}

export function buildFishingPool(environment: FishingEnvironment, baitId: string): WeightedFishingSpecies[] {
  return FISHING_SPECIES.map((species) => {
    const reasons: string[] = [];
    let weight = species.baseWeight;
    weight += conditionBonus(environment.spot, species.preferredSpots, 8, "spot", reasons);
    weight += conditionBonus(environment.weather, species.preferredWeather, 6, "weather", reasons);
    weight += conditionBonus(environment.timeOfDay, species.preferredTime, 6, "time", reasons);
    weight += conditionBonus(environment.layer, species.preferredLayers, 8, "layer", reasons);
    weight += conditionBonus(baitId, species.preferredBaits, 12, "bait", reasons);
    if (species.rarity === "legendary" && reasons.length < 4) weight *= 0.18;
    if (species.rarity === "rare" && reasons.length < 3) weight *= 0.42;
    return { species, weight: Math.max(1, Math.round(weight * 100) / 100), reasons };
  }).filter((entry) => entry.weight > 0);
}

export function chooseWeightedSpecies(pool: WeightedFishingSpecies[], random = Math.random): FishingSpecies {
  if (pool.length === 0) return FISHING_SPECIES[0];
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random() * total;
  for (const entry of pool) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.species;
  }
  return pool[pool.length - 1].species;
}
```

- [ ] **Step 4: Create simulation helpers**

Create `frontend/src/lib/fishingSimulation.ts` with this content:

```ts
import type { FishingFightInput, FishingFightSetup, FishingFightState, FishingWaterLayer } from "./fishingSystem";
import type { FishingRod } from "./fishingGear";

export type HookResult = "early" | "hit" | "late";

export const MIN_VALID_CAST_POWER = 0.16;
export const HOOK_WINDOW_START_MS = 220;
export const HOOK_WINDOW_END_MS = 820;
export const LINE_BREAK_STRAIN_MS = 900;
export const SLACK_ESCAPE_MS = 1200;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function castPowerToWaterLayer(power: number): FishingWaterLayer {
  if (power < 0.34) return "near";
  if (power < 0.67) return "mid";
  return "far";
}

export function isCastValid(power: number): boolean {
  return Number.isFinite(power) && power >= MIN_VALID_CAST_POWER && power <= 1;
}

export function calculateCastDistance(power: number, rod: FishingRod): number {
  const clamped = clamp(power, 0, 1);
  return Math.round((rod.minDistance + (rod.maxDistance - rod.minDistance) * clamped) * 10) / 10;
}

export function resolveHookResult(elapsedMs: number): HookResult {
  if (elapsedMs < HOOK_WINDOW_START_MS) return "early";
  if (elapsedMs <= HOOK_WINDOW_END_MS) return "hit";
  return "late";
}

export function nextFishingFightState(
  state: FishingFightState,
  input: FishingFightInput,
  setup: FishingFightSetup,
  deltaMs: number,
): FishingFightState {
  if (state.outcome !== "fighting") return state;

  const seconds = Math.max(0, deltaMs) / 1000;
  const surge = clamp(input.fishSurge, 0, 1);
  const reelingGain = input.reeling ? 0.34 : -0.2;
  const steadyingRelief = input.steadying ? setup.rodControl * 0.16 : 0;
  const fishPull = surge * setup.speciesStrength * 0.32;
  const tension = clamp(state.tension + (reelingGain + fishPull - steadyingRelief) * seconds, 0, 1);
  const inControl = tension >= 0.28 && tension <= setup.lineBreakLimit - 0.12;
  const staminaDrain = inControl && input.reeling ? (0.16 + setup.rodControl * 0.1) * seconds : 0.015 * seconds;
  const fishStamina = clamp(state.fishStamina - staminaDrain, 0, Math.max(1, setup.speciesStamina));
  const distanceDelta = input.reeling && inControl ? -0.28 * seconds : (surge * 0.18 + (tension < 0.14 ? 0.22 : 0)) * seconds;
  const fishDistance = clamp(state.fishDistance + distanceDelta, 0, 1);
  const strainMs = tension > setup.lineBreakLimit ? state.strainMs + deltaMs : 0;
  const slackMs = tension < 0.14 ? state.slackMs + deltaMs : 0;

  if (strainMs >= LINE_BREAK_STRAIN_MS) {
    return { tension, fishStamina, fishDistance, strainMs, slackMs, outcome: "line_broken" };
  }
  if (slackMs >= SLACK_ESCAPE_MS) {
    return { tension, fishStamina, fishDistance, strainMs, slackMs, outcome: "fish_escaped" };
  }
  if (fishStamina <= 0.001 || fishDistance <= 0.001) {
    return { tension, fishStamina: 0, fishDistance: 0, strainMs, slackMs, outcome: "caught" };
  }

  return { tension, fishStamina, fishDistance, strainMs, slackMs, outcome: "fighting" };
}
```

- [ ] **Step 5: Create storage helpers**

Create `frontend/src/lib/fishingStorage.ts` with this content:

```ts
import { DEFAULT_FISHING_LOADOUT } from "./fishingGear";

export const FISHING_SAVE_KEY = "xy_fishing_v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface FishingCodexEntry {
  speciesId: string;
  firstCaughtAt: number;
  catchCount: number;
  releaseCount: number;
  maxWeight: number;
}

export interface FishingSaveV1 {
  version: 1;
  selectedRodId: string;
  selectedLineId: string;
  selectedBaitId: string;
  baitInventory: Record<string, number>;
  codex: Record<string, FishingCodexEntry>;
  stats: {
    totalCatches: number;
    totalReleased: number;
    totalEscaped: number;
    totalLineBreaks: number;
  };
}

export interface FishingCatchRecord {
  speciesId: string;
  weight: number;
  caughtAt: number;
}

export function createDefaultFishingSave(): FishingSaveV1 {
  return {
    version: 1,
    selectedRodId: DEFAULT_FISHING_LOADOUT.rodId,
    selectedLineId: DEFAULT_FISHING_LOADOUT.lineId,
    selectedBaitId: DEFAULT_FISHING_LOADOUT.baitId,
    baitInventory: {
      plain_bait: 999,
      shell_meat: 3,
      stardust_bait: 1,
    },
    codex: {},
    stats: {
      totalCatches: 0,
      totalReleased: 0,
      totalEscaped: 0,
      totalLineBreaks: 0,
    },
  };
}

function isFishingSaveV1(value: unknown): value is FishingSaveV1 {
  return !!value && typeof value === "object" && (value as { version?: unknown }).version === 1;
}

export function loadFishingSave(storage: StorageLike): FishingSaveV1 {
  try {
    const raw = storage.getItem(FISHING_SAVE_KEY);
    if (!raw) return createDefaultFishingSave();
    const parsed = JSON.parse(raw) as unknown;
    if (!isFishingSaveV1(parsed)) return createDefaultFishingSave();
    return { ...createDefaultFishingSave(), ...parsed, stats: { ...createDefaultFishingSave().stats, ...parsed.stats } };
  } catch {
    return createDefaultFishingSave();
  }
}

export function saveFishingSave(storage: StorageLike, save: FishingSaveV1): void {
  storage.setItem(FISHING_SAVE_KEY, JSON.stringify(save));
}

export function recordFishingCatch(save: FishingSaveV1, record: FishingCatchRecord): FishingSaveV1 {
  const existing = save.codex[record.speciesId];
  return {
    ...save,
    stats: { ...save.stats, totalCatches: save.stats.totalCatches + 1 },
    codex: {
      ...save.codex,
      [record.speciesId]: {
        speciesId: record.speciesId,
        firstCaughtAt: existing?.firstCaughtAt ?? record.caughtAt,
        catchCount: (existing?.catchCount ?? 0) + 1,
        releaseCount: existing?.releaseCount ?? 0,
        maxWeight: Math.max(existing?.maxWeight ?? 0, record.weight),
      },
    },
  };
}

export function recordFishingRelease(save: FishingSaveV1, speciesId: string): FishingSaveV1 {
  const existing = save.codex[speciesId];
  if (!existing) return { ...save, stats: { ...save.stats, totalReleased: save.stats.totalReleased + 1 } };
  return {
    ...save,
    stats: { ...save.stats, totalReleased: save.stats.totalReleased + 1 },
    codex: {
      ...save.codex,
      [speciesId]: { ...existing, releaseCount: existing.releaseCount + 1 },
    },
  };
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && node --test tests/fishingSystem.test.mjs
```

Expected: PASS for all tests in `tests/fishingSystem.test.mjs`.

- [ ] **Step 7: Commit pure modules**

Run:

```bash
cd /Users/a111/chen/code/心屿
git add frontend/src/lib/fishingSystem.ts frontend/src/lib/fishingSpecies.ts frontend/src/lib/fishingGear.ts frontend/src/lib/fishingSimulation.ts frontend/src/lib/fishingStorage.ts frontend/tests/fishingSystem.test.mjs
git commit -m "feat: add realistic fishing domain rules"
```

Expected: commit includes only the five new domain modules and their test.

---

### Task 3: Add Failing Protagonist Fishing Action Tests

**Files:**
- Create: `frontend/tests/fishingProtagonistAction.test.mjs`

- [ ] **Step 1: Write action selector and source routing red tests**

Create `frontend/tests/fishingProtagonistAction.test.mjs` with this content:

```js
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

async function importProtagonistAction() {
  const source = await readFile(path.resolve("src/lib/protagonistAction.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dir = path.join(os.tmpdir(), "xy-fishing-action-tests");
  await mkdir(dir, { recursive: true });
  const modulePath = path.join(dir, `protagonistAction-${Date.now()}.mjs`);
  await writeFile(modulePath, compiled, "utf8");
  return import(`file://${modulePath}`);
}

function baseState() {
  return {
    moving: true,
    running: true,
    airborne: false,
    landingActive: false,
    cheerActive: true,
    waveActive: true,
    fluteActive: true,
    sitAmount: 1,
  };
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("selectCharacterAction gives grounded fishing actions priority over ordinary expression clips", async () => {
  const { selectCharacterAction } = await importProtagonistAction();

  assert.equal(selectCharacterAction({ ...baseState(), fishingAction: "FishingAim" }), "FishingAim");
  assert.equal(selectCharacterAction({ ...baseState(), fishingAction: "FishingCast" }), "FishingCast");
  assert.equal(selectCharacterAction({ ...baseState(), fishingAction: "FishingHook" }), "FishingHook");
  assert.equal(selectCharacterAction({ ...baseState(), fishingAction: "FishingFight" }), "FishingFight");
  assert.equal(selectCharacterAction({ ...baseState(), fishingAction: "FishingResult" }), "FishingResult");
});

test("selectCharacterAction keeps airborne and landing safety above fishing actions", async () => {
  const { selectCharacterAction } = await importProtagonistAction();

  assert.equal(selectCharacterAction({ ...baseState(), airborne: true, fishingAction: "FishingFight" }), "Jump");
  assert.equal(selectCharacterAction({ ...baseState(), landingActive: true, fishingAction: "FishingFight" }), "Jump");
});

test("ExploreMode routes active fishing action into the playable hero", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");
  const sceneBlock = sourceBlock(source, "function ExploreScene", "function ExploreMode");

  assert.match(source, /type FishingActionClip/);
  assert.match(playerBlock, /fishingAction\?: FishingActionClip \| null/);
  assert.match(playerBlock, /fishingAction,/);
  assert.match(playerBlock, /selectCharacterAction\(\{[\s\S]*fishingAction/);
  assert.match(sceneBlock, /fishingAction=\{fishingAction\}/);
  assert.match(playerBlock, /<GltfHero[\s\S]*actionRef=\{characterActionRef\}/);
});
```

- [ ] **Step 2: Run red tests**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && node --test tests/fishingProtagonistAction.test.mjs
```

Expected: FAIL because `FishingActionClip` and `fishingAction` routing do not exist yet.

- [ ] **Step 3: Commit only the red tests**

Run:

```bash
cd /Users/a111/chen/code/心屿
git add frontend/tests/fishingProtagonistAction.test.mjs
git commit -m "test: add protagonist fishing action red tests"
```

Expected: commit includes only `frontend/tests/fishingProtagonistAction.test.mjs`.

---

### Task 4: Implement Protagonist Fishing Action Routing

**Files:**
- Modify: `frontend/src/lib/protagonistAction.ts`
- Modify: `frontend/src/components/ExploreMode.tsx`
- Test: `frontend/tests/fishingProtagonistAction.test.mjs`

- [ ] **Step 1: Replace protagonist action selector with fishing-aware version**

Replace `frontend/src/lib/protagonistAction.ts` with this content:

```ts
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
```

- [ ] **Step 2: Add `fishingAction` props to `Player` and `ExploreScene`**

In `frontend/src/components/ExploreMode.tsx`, update the import from `protagonistAction`:

```ts
import { selectCharacterAction, type CharacterActionClip, type FishingActionClip } from "../lib/protagonistAction";
```

In `Player` props, add:

```ts
  fishingAction?: FishingActionClip | null;
```

In the `Player` parameter destructuring, add:

```ts
  fishingAction = null,
```

In the `selectCharacterAction` call inside `Player`, add the property:

```ts
      fishingAction,
```

In `ExploreScene` props, add:

```ts
  fishingAction: FishingActionClip | null;
```

In `ExploreScene` parameter destructuring, add:

```ts
  fishingAction,
```

In the `<Player ... />` element inside `ExploreScene`, add:

```tsx
fishingAction={fishingAction}
```

- [ ] **Step 3: Keep unsupported GLB clips safe**

In the `XYSHZ_ACTION_CLIPS` definition in `ExploreMode.tsx`, keep only clips that exist in `xyshz_rigged.glb`. The existing `GltfHero` fallback already maps unsupported requested clips to `"Idle"`:

```ts
const next = isXyshzActionClip(requested) && actions[requested] ? requested : "Idle";
```

Do not add fishing clips to `XYSHZ_ACTION_CLIPS` until the GLB actually exports those clips. The procedural rod and upper-body layer in Task 6 will provide the visible first version.

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && node --test tests/fishingProtagonistAction.test.mjs tests/protagonistActionSelector.test.mjs
```

Expected: PASS for new fishing action tests and existing selector priority tests.

- [ ] **Step 5: Commit action routing**

Run:

```bash
cd /Users/a111/chen/code/心屿
git add frontend/src/lib/protagonistAction.ts frontend/src/components/ExploreMode.tsx frontend/tests/fishingProtagonistAction.test.mjs
git commit -m "feat: route fishing actions to protagonist"
```

Expected: commit includes only the action selector, `ExploreMode` prop routing, and the new action test.

---

### Task 5: Add Failing ExploreMode Integration Tests

**Files:**
- Create: `frontend/tests/realisticFishingExploreMode.test.mjs`
- Modify: `frontend/tests/fishingRhythm.test.mjs`

- [ ] **Step 1: Create realistic fishing source integration tests**

Create `frontend/tests/realisticFishingExploreMode.test.mjs` with this content:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readExploreModeSource() {
  return readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("ExploreMode imports realistic fishing domain modules", async () => {
  const source = await readExploreModeSource();

  assert.match(source, /from "\.\.\/lib\/fishingSystem"/);
  assert.match(source, /from "\.\.\/lib\/fishingGear"/);
  assert.match(source, /from "\.\.\/lib\/fishingSpecies"/);
  assert.match(source, /from "\.\.\/lib\/fishingSimulation"/);
  assert.match(source, /from "\.\.\/lib\/fishingStorage"/);
});

test("ExploreMode keeps realistic fishing state separate from legacy rhythm state", async () => {
  const source = await readExploreModeSource();
  const stateBlock = sourceBlock(source, "const [atWater, setAtWater]", "const [songProgress, setSongProgress]");

  assert.match(stateBlock, /useState<FishingSession>\(INITIAL_FISHING_SESSION\)/);
  assert.match(stateBlock, /useState<FishingSaveV1>/);
  assert.match(stateBlock, /const activeFishingAction =/);
  assert.doesNotMatch(stateBlock, /useState<FishingState>\("idle"\)/);
});

test("ExploreMode renders hero-tied fishing scene feedback and HUD", async () => {
  const source = await readExploreModeSource();
  const sceneBlock = sourceBlock(source, "function ExploreScene", "function ExploreMode");
  const renderBlock = sourceBlock(source, "{/* 海湾岸边:垂钓按钮", "{/* 🐚 听海海螺");

  assert.match(source, /function FishingRigFx/);
  assert.match(source, /function FishingSystemHud/);
  assert.match(sceneBlock, /<FishingRigFx/);
  assert.match(sceneBlock, /fishingSession=\{fishingSession\}/);
  assert.match(sceneBlock, /fishingAction=\{fishingAction\}/);
  assert.match(renderBlock, /<FishingSystemHud/);
  assert.match(renderBlock, /钓具/);
  assert.match(renderBlock, /提竿/);
  assert.match(renderBlock, /张力/);
  assert.match(renderBlock, /放生/);
});

test("ExploreMode no longer uses the abstract rhythm ring as the primary fishing interaction", async () => {
  const source = await readExploreModeSource();

  assert.doesNotMatch(source, /function FishingRhythmHud/);
  assert.doesNotMatch(source, /盯住光圈/);
  assert.match(source, /浮漂/);
  assert.match(source, /鱼线/);
});
```

- [ ] **Step 2: Replace legacy rhythm source assertions with pure helper coverage**

Replace `frontend/tests/fishingRhythm.test.mjs` with this content:

```js
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function importFishingModule() {
  const source = await readFile(path.resolve("src/lib/fishing.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
  }).outputText;
  const dir = await mkdtemp(path.join(os.tmpdir(), "xy-fishing-"));
  const modulePath = path.join(dir, "fishing.mjs");
  await writeFile(modulePath, output, "utf8");
  return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);
}

test("legacy fishing rhythm progress clamps from 0 to 1", async () => {
  const fishing = await importFishingModule();

  assert.equal(fishing.FISHING_RHYTHM_DURATION_MS, 1800);
  assert.equal(fishing.fishingRhythmProgress(1000, 1000), 0);
  assert.equal(fishing.fishingRhythmProgress(1900, 1000), 0.5);
  assert.equal(fishing.fishingRhythmProgress(4000, 1000), 1);
  assert.equal(fishing.fishingRhythmProgress(900, 1000), 0);
  assert.equal(fishing.fishingRhythmProgress(1000, 1000, 0), 1);
});

test("legacy fishing rhythm hit window accepts the middle and rejects early or late reels", async () => {
  const fishing = await importFishingModule();

  assert.equal(fishing.FISHING_HIT_START, 0.38);
  assert.equal(fishing.FISHING_HIT_END, 0.62);
  assert.equal(fishing.isFishingRhythmHit(0.37), false);
  assert.equal(fishing.isFishingRhythmHit(0.38), true);
  assert.equal(fishing.isFishingRhythmHit(0.5), true);
  assert.equal(fishing.isFishingRhythmHit(0.62), true);
  assert.equal(fishing.isFishingRhythmHit(0.63), false);
  assert.equal(fishing.isFishingRhythmHit(Number.NaN), false);
});

test("legacy fishing miss reason separates early and late reels", async () => {
  const fishing = await importFishingModule();

  assert.equal(fishing.fishingMissReason(0.12), "early");
  assert.equal(fishing.fishingMissReason(0.7), "late");
});

test("legacy fishing wait time stays inside the existing gentle wait range", async () => {
  const fishing = await importFishingModule();

  assert.equal(fishing.pickFishingWaitMs(() => 0), 1600);
  assert.equal(fishing.pickFishingWaitMs(() => 1), 3800);
  assert.equal(fishing.pickFishingWaitMs(() => 0.5), 2700);
});
```

- [ ] **Step 3: Run red tests**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && node --test tests/realisticFishingExploreMode.test.mjs tests/fishingRhythm.test.mjs
```

Expected: `tests/fishingRhythm.test.mjs` PASS, `tests/realisticFishingExploreMode.test.mjs` FAIL because `ExploreMode` is not wired to the realistic fishing system yet.

- [ ] **Step 4: Commit integration red tests**

Run:

```bash
cd /Users/a111/chen/code/心屿
git add frontend/tests/realisticFishingExploreMode.test.mjs frontend/tests/fishingRhythm.test.mjs
git commit -m "test: add realistic fishing explore mode red tests"
```

Expected: commit includes only the new source integration test and the legacy rhythm test update.

---

### Task 6: Wire Realistic Fishing Into ExploreMode

**Files:**
- Modify: `frontend/src/components/ExploreMode.tsx`
- Test: `frontend/tests/realisticFishingExploreMode.test.mjs`
- Test: `frontend/tests/fishingProtagonistAction.test.mjs`

- [ ] **Step 1: Add realistic fishing imports**

In `frontend/src/components/ExploreMode.tsx`, keep the existing legacy `../lib/fishing` import only if another test or module still requires it. Add these imports near it:

```ts
import {
  INITIAL_FISHING_FIGHT,
  INITIAL_FISHING_SESSION,
  type FishingEnvironment,
  type FishingPhase,
  type FishingSession,
  type FishingTimeOfDay,
  type FishingWeather,
} from "../lib/fishingSystem";
import { resolveFishingLoadout, type FishingLoadout } from "../lib/fishingGear";
import { buildFishingPool, chooseWeightedSpecies, getFishingSpecies } from "../lib/fishingSpecies";
import {
  calculateCastDistance,
  castPowerToWaterLayer,
  isCastValid,
  nextFishingFightState,
  resolveHookResult,
} from "../lib/fishingSimulation";
import {
  createDefaultFishingSave,
  loadFishingSave,
  recordFishingCatch,
  recordFishingRelease,
  saveFishingSave,
  type FishingSaveV1,
} from "../lib/fishingStorage";
```

- [ ] **Step 2: Add small resolver helpers near fishing components**

Add this block above `FishingWaterSensor`:

```ts
function resolveFishingWeather(environment: ExploreEnvironment): FishingWeather {
  const weather = "weather" in environment ? String((environment as { weather?: unknown }).weather) : "";
  if (weather.includes("rain")) return "rain";
  if (weather.includes("fog") || weather.includes("mist")) return "fog";
  if (weather.includes("wind")) return "wind";
  return "clear";
}

function resolveFishingTimeOfDay(environment: ExploreEnvironment): FishingTimeOfDay {
  const time = "timeOfDay" in environment ? String((environment as { timeOfDay?: unknown }).timeOfDay) : "";
  const visual = "visual" in environment ? String((environment as { visual?: unknown }).visual) : "";
  const raw = `${time} ${visual}`.toLowerCase();
  if (raw.includes("night")) return "night";
  if (raw.includes("sunset") || raw.includes("dusk")) return "sunset";
  if (raw.includes("morning") || raw.includes("dawn")) return "morning";
  return "day";
}

function fishingActionForPhase(phase: FishingPhase): FishingActionClip | null {
  if (phase === "aim" || phase === "gear" || phase === "waiting") return "FishingAim";
  if (phase === "cast") return "FishingCast";
  if (phase === "hook") return "FishingHook";
  if (phase === "fight") return "FishingFight";
  if (phase === "result") return "FishingResult";
  return null;
}
```

- [ ] **Step 3: Replace old fishing state hooks**

Inside `ExploreMode`, replace the old `fishing`, `rhythmStartedAt`, `fishingMiss`, `shownCatch`, and `catchCount` hooks with:

```ts
  const [fishingSession, setFishingSession] = useState<FishingSession>(INITIAL_FISHING_SESSION);
  const [fishingSave, setFishingSave] = useState<FishingSaveV1>(() => {
    try { return loadFishingSave(localStorage); } catch { return createDefaultFishingSave(); }
  });
  const [shownCatch, setShownCatch] = useState<{ speciesId: string; icon: string; title: string; line: string; weight: number } | null>(null);
  const activeFishingAction = fishingActionForPhase(fishingSession.phase);
  const fishingLoadout = useMemo(
    () => resolveFishingLoadout({
      rodId: fishingSave.selectedRodId,
      lineId: fishingSave.selectedLineId,
      baitId: fishingSave.selectedBaitId,
    }),
    [fishingSave.selectedRodId, fishingSave.selectedLineId, fishingSave.selectedBaitId],
  );
```

Add this persistence effect near the existing `localStorage` effects:

```ts
  useEffect(() => {
    try { saveFishingSave(localStorage, fishingSave); } catch { /* ignore */ }
  }, [fishingSave]);
```

- [ ] **Step 4: Add session actions**

Replace `onCast` with this realistic session callback:

```ts
  const resetFishingSession = useCallback(() => {
    setFishingSession(INITIAL_FISHING_SESSION);
  }, []);

  const startRealisticFishing = useCallback(() => {
    setFishingSession({ ...INITIAL_FISHING_SESSION, phase: "gear" });
    playSfx("tap");
  }, []);

  const beginFishingAim = useCallback(() => {
    setFishingSession((session) => ({ ...session, phase: "aim", castPower: 0.45, layer: "mid" }));
    playSfx("tap");
  }, []);

  const castRealisticLine = useCallback((power: number) => {
    const layer = castPowerToWaterLayer(power);
    if (!isCastValid(power)) {
      setFishingSession((session) => ({ ...session, phase: "bad_cast", castPower: power, layer }));
      playSfx("ripple");
      return;
    }
    setFishingSession((session) => ({ ...session, phase: "cast", castPower: power, layer }));
    playSfx("whoosh");
  }, []);

  const buildCurrentFishingEnvironment = useCallback((layer: FishingEnvironment["layer"]): FishingEnvironment => ({
    spot: resolveFishingTimeOfDay(environment) === "night" ? "nightTide" : "deepBay",
    weather: resolveFishingWeather(environment),
    timeOfDay: resolveFishingTimeOfDay(environment),
    layer,
  }), [environment]);

  const handleHook = useCallback(() => {
    setFishingSession((session) => {
      if (session.phase !== "hook") return session;
      const hook = resolveHookResult(Date.now() - session.hookStartedAtMs);
      if (hook === "early") return { ...session, phase: "fish_escaped" };
      if (hook === "late") return { ...session, phase: "fish_escaped" };
      const species = getFishingSpecies(session.selectedSpeciesId ?? "silver_bay_minnow");
      return {
        ...session,
        phase: "fight",
        fight: {
          ...INITIAL_FISHING_FIGHT,
          fishStamina: species?.stamina ?? 1,
          fishDistance: 1,
        },
      };
    });
    playSfx("ripple");
  }, []);

  const finishFishingCatch = useCallback((speciesId: string) => {
    const species = getFishingSpecies(speciesId);
    const weight = species ? Math.round((species.minWeight + Math.random() * (species.maxWeight - species.minWeight)) * 100) / 100 : 0.2;
    setFishingSave((save) => recordFishingCatch(save, { speciesId, weight, caughtAt: Date.now() }));
    setShownCatch({
      speciesId,
      weight,
      icon: speciesId === "starsea_fish" ? "⭐" : "🐟",
      title: species?.name ?? "银湾小鱼",
      line: "主角把鱼稳稳收上岸，海面还在轻轻发光。",
    });
    setFishingSession({ ...INITIAL_FISHING_SESSION, phase: "result", selectedSpeciesId: speciesId });
    playSfx("collect");
    emitCompanionEvent("fish_catch");
  }, []);
```

- [ ] **Step 5: Add fishing phase effects**

Add this effect after the session actions:

```ts
  useEffect(() => {
    if (fishingSession.phase === "cast") {
      const t = window.setTimeout(() => {
        const env = buildCurrentFishingEnvironment(fishingSession.layer);
        const pool = buildFishingPool(env, fishingLoadout.bait.id);
        const species = chooseWeightedSpecies(pool);
        setFishingSession((session) => ({ ...session, phase: "waiting", selectedSpeciesId: species.id }));
      }, 520);
      return () => window.clearTimeout(t);
    }
    if (fishingSession.phase === "waiting") {
      const t = window.setTimeout(() => {
        setFishingSession((session) => ({ ...session, phase: "hook", hookStartedAtMs: Date.now() }));
        playSfx("ripple");
      }, 1300);
      return () => window.clearTimeout(t);
    }
    if (fishingSession.phase === "hook") {
      const t = window.setTimeout(() => {
        setFishingSession((session) => session.phase === "hook" ? { ...session, phase: "fish_escaped" } : session);
      }, 1100);
      return () => window.clearTimeout(t);
    }
    if (fishingSession.phase === "fish_escaped" || fishingSession.phase === "line_broken" || fishingSession.phase === "bad_cast" || fishingSession.phase === "no_bite") {
      const t = window.setTimeout(resetFishingSession, 1500);
      return () => window.clearTimeout(t);
    }
  }, [buildCurrentFishingEnvironment, fishingLoadout.bait.id, fishingSession.phase, fishingSession.layer, resetFishingSession]);

  useEffect(() => {
    if (!atWater && fishingSession.phase !== "idle") resetFishingSession();
  }, [atWater, fishingSession.phase, resetFishingSession]);
```

Add a lightweight fight loop:

```ts
  useEffect(() => {
    if (fishingSession.phase !== "fight") return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      setFishingSession((session) => {
        if (session.phase !== "fight") return session;
        const species = getFishingSpecies(session.selectedSpeciesId ?? "silver_bay_minnow");
        const next = nextFishingFightState(
          session.fight,
          { reeling: true, steadying: true, fishSurge: 0.35 + Math.sin(now / 380) * 0.25 },
          {
            rodControl: fishingLoadout.rod.control,
            lineBreakLimit: fishingLoadout.line.breakLimit,
            speciesStrength: species?.strength ?? 0.25,
            speciesStamina: species?.stamina ?? 0.25,
          },
          delta,
        );
        if (next.outcome === "caught" && session.selectedSpeciesId) {
          window.setTimeout(() => finishFishingCatch(session.selectedSpeciesId!), 0);
          return { ...session, fight: next, phase: "result" };
        }
        if (next.outcome === "line_broken") return { ...session, fight: next, phase: "line_broken" };
        if (next.outcome === "fish_escaped") return { ...session, fight: next, phase: "fish_escaped" };
        return { ...session, fight: next };
      });
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [finishFishingCatch, fishingLoadout.line.breakLimit, fishingLoadout.rod.control, fishingSession.phase]);
```

- [ ] **Step 6: Add procedural scene feedback**

Replace the old `FishingSpot` implementation with a `FishingRigFx` that keeps the existing GLB bobber and adds rod/line primitives:

```tsx
function FishingRigFx({
  posRef,
  headingRef,
  fishingSession,
  loadout,
}: {
  posRef: React.RefObject<THREE.Vector3>;
  headingRef: React.RefObject<number>;
  fishingSession: FishingSession;
  loadout: FishingLoadout;
}) {
  const group = useRef<THREE.Group>(null);
  const lineRef = useRef<THREE.Line>(null);
  const bobberRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    const p = posRef.current;
    if (!p || !group.current) return;
    const active = fishingSession.phase !== "idle" && fishingSession.phase !== "gear";
    group.current.visible = active;
    if (!active) return;
    const heading = headingRef.current ?? 0;
    const distance = calculateCastDistance(Math.max(0.18, fishingSession.castPower || 0.45), loadout.rod);
    const dx = Math.sin(heading + fishingSession.aimOffset) * distance;
    const dz = Math.cos(heading + fishingSession.aimOffset) * distance;
    const hand = new THREE.Vector3(p.x + Math.sin(heading) * 0.35, placeableGroundY(p.x, p.z) + 1.35, p.z + Math.cos(heading) * 0.35);
    const tip = new THREE.Vector3(hand.x + Math.sin(heading + fishingSession.aimOffset) * 1.8, hand.y + 0.62, hand.z + Math.cos(heading + fishingSession.aimOffset) * 1.8);
    const bob = new THREE.Vector3(p.x + dx, 0.18 + Math.sin(state.clock.elapsedTime * 3.1) * 0.05, p.z + dz);
    if (bobberRef.current) bobberRef.current.position.copy(bob);
    if (lineRef.current) {
      const curve = new THREE.CatmullRomCurve3([tip, new THREE.Vector3((tip.x + bob.x) / 2, Math.max(tip.y, 1.2), (tip.z + bob.z) / 2), bob]);
      lineRef.current.geometry.dispose();
      lineRef.current.geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(18));
    }
    group.current.position.set(0, 0, 0);
    group.current.rotation.y = heading + fishingSession.aimOffset;
  });

  return (
    <group ref={group} visible={false}>
      <mesh position={[0, 1.35, 0]} rotation={[0, 0, -0.65]} scale={[0.035, 0.035, 2.2]}>
        <cylinderGeometry args={[1, 1, 1, 8]} />
        <meshBasicMaterial color="#6b442e" />
      </mesh>
      <line ref={lineRef}>
        <bufferGeometry />
        <lineBasicMaterial color="#f8fafc" transparent opacity={0.78} />
      </line>
      <group ref={bobberRef}>
        <GltfFishingBobber />
      </group>
    </group>
  );
}
```

Then replace the old scene usage:

```tsx
<FishingSpot posRef={posRef} casting={fishingCasting} />
```

with:

```tsx
<FishingRigFx posRef={posRef} headingRef={headingRef} fishingSession={fishingSession} loadout={fishingLoadout} />
```

- [ ] **Step 7: Add realistic HUD**

Replace the old fishing HUD block with:

```tsx
      {/* 海湾岸边:真实垂钓系统 */}
      {atWater && nearNpc < 0 && (
        <div className="absolute inset-x-0 flex justify-center px-4" style={{ bottom: "calc(2.4rem + env(safe-area-inset-bottom))" }}>
          <FishingSystemHud
            session={fishingSession}
            save={fishingSave}
            loadout={fishingLoadout}
            onStart={startRealisticFishing}
            onAim={beginFishingAim}
            onCast={castRealisticLine}
            onHook={handleHook}
            onCancel={resetFishingSession}
          />
        </div>
      )}
```

Add this component near the old HUD components:

```tsx
function FishingSystemHud({
  session,
  save,
  loadout,
  onStart,
  onAim,
  onCast,
  onHook,
  onCancel,
}: {
  session: FishingSession;
  save: FishingSaveV1;
  loadout: FishingLoadout;
  onStart: () => void;
  onAim: () => void;
  onCast: (power: number) => void;
  onHook: () => void;
  onCancel: () => void;
}) {
  const tensionPct = Math.round(session.fight.tension * 100);
  if (session.phase === "idle") {
    return <button type="button" onClick={onStart} className="panel-glass-2 rounded-full px-6 py-2.5 font-display text-[15px] tracking-wider text-white/90">🎣 垂钓</button>;
  }
  if (session.phase === "gear") {
    return (
      <div className="panel-glass-2 rounded-card px-4 py-3 text-white/90">
        <p className="font-display text-[15px] tracking-wider">钓具</p>
        <p className="mt-1 text-caption text-white/62">{loadout.rod.name} · {loadout.line.name} · {loadout.bait.name}</p>
        <p className="mt-1 text-caption text-white/45">图鉴 {Object.keys(save.codex).length}/5</p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onAim} className="btn-primary px-4 py-2 text-[13px]">开始瞄准</button>
          <button type="button" onClick={onCancel} className="btn-ghost px-4 py-2 text-[13px]">收起</button>
        </div>
      </div>
    );
  }
  if (session.phase === "aim") {
    return (
      <div className="panel-glass-2 rounded-card px-4 py-3 text-center text-white/90">
        <p className="font-display text-[15px] tracking-wider">按住蓄力，松手抛竿</p>
        <button type="button" onClick={() => onCast(0.72)} className="btn-primary mt-2 px-5 py-2 text-[13px]">抛竿</button>
      </div>
    );
  }
  if (session.phase === "waiting" || session.phase === "cast") {
    return <div className="panel-glass-2 rounded-full px-5 py-2.5 font-display text-[14px] tracking-wider text-white/86">看浮漂，鱼线已经入水…</div>;
  }
  if (session.phase === "hook") {
    return <button type="button" onClick={onHook} className="panel-glass-2 rounded-full px-6 py-2.5 font-display text-[15px] tracking-wider text-white/90">浮漂下沉 · 提竿</button>;
  }
  if (session.phase === "fight") {
    return (
      <div className="panel-glass-2 rounded-card px-4 py-3 text-white/90">
        <p className="font-display text-[15px] tracking-wider">张力 {tensionPct}%</p>
        <div className="mt-2 h-2 w-48 rounded-full bg-white/15">
          <div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.min(100, tensionPct)}%` }} />
        </div>
        <p className="mt-2 text-caption text-white/58">保持绿区，别让线太紧或太松。</p>
      </div>
    );
  }
  if (session.phase === "bad_cast") return <div className="panel-glass-2 rounded-full px-5 py-2.5 text-white/86">落点太浅，只溅起一圈水花。</div>;
  if (session.phase === "fish_escaped") return <div className="panel-glass-2 rounded-full px-5 py-2.5 text-white/86">线松了，它挣脱了。</div>;
  if (session.phase === "line_broken") return <div className="panel-glass-2 rounded-full px-5 py-2.5 text-white/86">线绷太久断了。</div>;
  return <div className="panel-glass-2 rounded-full px-5 py-2.5 text-white/86">放生或收藏这次收获。</div>;
}
```

- [ ] **Step 8: Wire props through `ExploreScene` call**

When rendering `<ExploreScene ... />`, replace the old fishing props:

```tsx
onAtWater={setAtWater} fishingCasting={fishing !== "idle"}
```

with:

```tsx
onAtWater={setAtWater}
fishingSession={fishingSession}
fishingLoadout={fishingLoadout}
fishingAction={activeFishingAction}
```

Add these props to `ExploreScene`'s type and destructuring:

```ts
  fishingSession: FishingSession;
  fishingLoadout: FishingLoadout;
  fishingAction: FishingActionClip | null;
```

- [ ] **Step 9: Update catch result card**

Change the result card count line from the old `catchCount` to the versioned save:

```tsx
<p className="text-caption text-white/40 mt-3">已记录 {fishingSave.stats.totalCatches} 次垂钓收获</p>
<div className="mt-3 grid grid-cols-2 gap-2">
  <button onClick={() => setShownCatch(null)} className="btn-primary w-full">收藏</button>
  <button
    onClick={() => {
      if (shownCatch) setFishingSave((save) => recordFishingRelease(save, shownCatch.speciesId));
      setShownCatch(null);
    }}
    className="btn-ghost w-full"
  >
    放生
  </button>
</div>
```

- [ ] **Step 10: Run focused tests**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && node --test tests/realisticFishingExploreMode.test.mjs tests/fishingProtagonistAction.test.mjs tests/fishingRhythm.test.mjs
```

Expected: PASS for realistic fishing source tests, protagonist action tests, and legacy rhythm pure helper tests.

- [ ] **Step 11: Commit ExploreMode wiring**

Run:

```bash
cd /Users/a111/chen/code/心屿
git add frontend/src/components/ExploreMode.tsx frontend/tests/realisticFishingExploreMode.test.mjs frontend/tests/fishingProtagonistAction.test.mjs frontend/tests/fishingRhythm.test.mjs
git commit -m "feat: wire realistic fishing into explore mode"
```

Expected: commit includes only `ExploreMode` and the affected frontend tests.

---

### Task 7: Regression, Build, And Visual Verification

**Files:**
- Modify only if verification reveals a defect in files from Tasks 2, 4, 5, or 6.

- [ ] **Step 1: Run focused fishing tests**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && node --test tests/fishingSystem.test.mjs tests/realisticFishingExploreMode.test.mjs tests/fishingProtagonistAction.test.mjs tests/fishingRhythm.test.mjs tests/fishingBobberModel.test.mjs
```

Expected: PASS. If `fishingBobberModel.test.mjs` still expects `<FishingSpot ... />`, update that test to assert `useGLTF(MODELS.fishingBobber)` and `<FishingRigFx ... />`, then rerun this exact command.

- [ ] **Step 2: Run protagonist and existing integration tests**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && node --test tests/protagonistActionSelector.test.mjs tests/protagonistActions.test.mjs tests/xyshzHeroIntegration.test.mjs tests/exploreC1Integration.test.mjs
```

Expected: PASS. If a source assertion conflicts with the new `FishingActionClip` union, update the assertion to include fishing actions while preserving the existing hero, guardian, Pocoyo, and avatar expectations.

- [ ] **Step 3: Run full frontend test suite**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && npm test
```

Expected: PASS for all frontend tests.

- [ ] **Step 4: Run build**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && npm run build
```

Expected: PASS with Vite production build output and no TypeScript errors.

- [ ] **Step 5: Start local dev server for manual verification**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`. Keep the session running until visual verification is complete.

- [ ] **Step 6: Manual visual checklist**

Open the Vite URL in the in-app browser and verify:

```text
1. Enter Explore mode.
2. Move the hero to the bay fishing area.
3. Confirm the character visible in the scene is the playable hero, not a temporary person.
4. Click 垂钓.
5. Confirm the HUD shows 钓具 and the current rod/line/bait.
6. Click 开始瞄准.
7. Confirm the hero stops moving and the rod/line/bobber appear from the hero side.
8. Click 抛竿.
9. Confirm the bobber lands on the water and the UI says 看浮漂.
10. Click 提竿 when prompted.
11. Confirm 张力 appears during the fight.
12. Confirm success opens a catch card with 收藏 and 放生.
13. Repeat once and confirm a failure state can reset back to 垂钓.
14. Move away from the bay and confirm fishing visuals disappear.
```

- [ ] **Step 7: Final commit for expected test assertion fixes only**

If Steps 1-6 required only the expected test assertion updates described above, stage those test files and commit:

```bash
cd /Users/a111/chen/code/心屿
git add frontend/tests/fishingBobberModel.test.mjs frontend/tests/xyshzHeroIntegration.test.mjs
git commit -m "fix: stabilize realistic fishing regression checks"
```

Expected: commit includes only those regression test assertion updates. If no fixes were needed, skip this commit. If implementation files changed during verification, run `git diff --name-only`, inspect every changed file, and commit only the inspected implementation files with a message naming the actual failure that was fixed.

---

## Self-Review Checklist

- Spec coverage: Tasks 1-2 cover fish species, gear, bait, simulation, tension, failure reasons, and codex storage. Tasks 3-4 cover the explicit requirement that the playable hero receives fishing action state. Tasks 5-6 cover `ExploreMode`, bobber/line/rod feedback, HUD, and replacement of the abstract rhythm ring. Task 7 covers regression, build, and visual verification.
- Red-flag scan: the plan uses concrete file paths, test contents, module contents, commands, and expected outcomes.
- Type consistency: `FishingActionClip`, `FishingSession`, `FishingSaveV1`, `FishingLoadout`, `FishingEnvironment`, and fight state names match across tests, modules, and `ExploreMode` snippets.
