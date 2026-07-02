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
