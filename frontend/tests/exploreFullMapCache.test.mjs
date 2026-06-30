import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const read = (rel) => readFileSync(path.resolve(root, rel), "utf8");

test("desktop homepage preloads the full explore map before island entry", () => {
  const desktop = read("src/pages/Home.tsx");
  const mobile = read("src/mobile/pages/HomeMobile.tsx");
  const explore = read("src/components/ExploreMode.tsx");
  const prefetchBlock = explore.match(/export function prefetchExploreAssets\(\): void \{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.match(desktop, /requestIdleCallback[\s\S]*prefetchExplore/);
  assert.match(desktop, /setTimeout\(prefetchExplore,\s*1800\)/);
  assert.match(desktop, /onPointerEnter=\{prefetchExplore\}/);
  assert.match(desktop, /onPointerDown=\{prefetchExplore\}/);

  assert.doesNotMatch(mobile, /requestIdleCallback[\s\S]*prefetchExplore/);
  assert.doesNotMatch(mobile, /setTimeout\(prefetchExplore/);
  assert.match(mobile, /onPointerEnter=\{prefetchExplore\}/);
  assert.doesNotMatch(mobile, /onPointerDown=\{prefetchExplore\}/);

  assert.doesNotMatch(explore, /Object\.values\(MODELS\)\.forEach\(\(u\) => \{/);
  assert.match(explore, /const EXPLORE_PREFETCH_MODELS = Object\.values\(MODELS\);/);
  assert.match(explore, /function queueExplorePreload/);
  assert.match(prefetchBlock, /queueExplorePreload\(EXPLORE_PREFETCH_MODELS\)/);
  for (const heavy of ["companion", "skyLantern", "townblock", "qiche", "rhododendron", "bathhouse"]) {
    assert.match(explore, new RegExp(`${heavy}:`));
  }
});

test("desktop island overview mounts the visible map face immediately", () => {
  const explore = read("src/components/ExploreMode.tsx");

  assert.match(explore, /town:\s*lowTier \? 5200 : 0/);
  assert.match(explore, /village:\s*lowTier \? 7600 : 0/);
  assert.match(explore, /coastline:\s*lowTier \? 9600 : 0/);
  assert.match(explore, /districts:\s*lowTier \? 12500 : 0/);
  assert.match(explore, /townblock:\s*lowTier \? 14000 : 0/);
  assert.match(explore, /rhododendron:\s*lowTier \? 16500 : 0/);
  assert.match(explore, /manor:\s*lowTier \? 19000 : 0/);
  assert.match(explore, /bath:\s*lowTier \? 22000 : 0/);
  assert.match(explore, /桌面开场直接展示完整岛貌/);
});
