import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const read = (rel) => readFileSync(path.resolve(root, rel), "utf8");

test("homepage warms full explore model scenes before island entry", () => {
  const desktop = read("src/pages/Home.tsx");
  const mobile = read("src/mobile/pages/HomeMobile.tsx");
  const explore = read("src/components/ExploreMode.tsx");
  const prefetchBlock = explore.match(/export function prefetchExploreAssets\(\): void \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const prefetchModelsBlock = explore.match(/const EXPLORE_PREFETCH_MODELS[\s\S]*?\];/)?.[0] ?? "";

  assert.match(desktop, /requestIdleCallback[\s\S]*prefetchExplore/);
  assert.match(desktop, /setTimeout\(prefetchExplore,\s*1800\)/);
  assert.match(desktop, /function ExploreLaunchFallback/);
  assert.match(desktop, /const openExploreMode = useCallback\(\(\) => \{[\s\S]*prefetchExplore\(\);[\s\S]*setExploreOpen\(true\);[\s\S]*\}, \[\]\);/);
  assert.match(desktop, /onClick=\{openExploreMode\}/);
  assert.match(desktop, /onPointerEnter=\{prefetchExplore\}/);
  assert.match(desktop, /onPointerDown=\{prefetchExplore\}/);
  assert.match(desktop, /fallback=\{<ExploreLaunchFallback accent=\{visual\.accent\} \/>\}/);

  assert.match(mobile, /requestIdleCallback[\s\S]*prefetchExplore/);
  assert.match(mobile, /setTimeout\(prefetchExplore,\s*1800\)/);
  assert.match(mobile, /onPointerEnter=\{prefetchExplore\}/);
  assert.match(mobile, /onPointerDown=\{prefetchExplore\}/);

  assert.doesNotMatch(explore, /Object\.values\(MODELS\)\.forEach\(\(u\) => \{/);
  assert.match(prefetchModelsBlock, /Object\.values\(MODELS\)/);
  assert.match(explore, /function queueExplorePreload/);
  assert.match(explore, /requestIdleCallback[\s\S]*useGLTF\.preload\(url\)/);
  assert.match(prefetchBlock, /queueExplorePreload\(EXPLORE_PREFETCH_MODELS\)/);
  assert.doesNotMatch(prefetchBlock, /isCoarsePointerDevice/);
  for (const heavy of ["companion", "skyLantern", "townblock", "qiche", "rhododendron", "bathhouse"]) {
    assert.match(explore, new RegExp(`${heavy}:`));
  }
  assert.doesNotMatch(explore, /prewarmLanternCues/);
});

test("explore entry preloads the model cache without showing the full-screen loading overlay", () => {
  const explore = read("src/components/ExploreMode.tsx");
  const prefetchModelsBlock = explore.match(/const EXPLORE_PREFETCH_MODELS[\s\S]*?\];/)?.[0] ?? "";
  const gateBlock = explore.match(/function ExploreModelGate[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(prefetchModelsBlock, /\.\.\.new Set\(\[/);
  assert.match(prefetchModelsBlock, /Object\.values\(MODELS\)/);
  assert.match(prefetchModelsBlock, /Object\.values\(IMPRINT_3D_REGISTRY\)\.map\(\(entry\) => entry\.url\)/);
  assert.match(gateBlock, /useGLTF\(EXPLORE_PREFETCH_MODELS\)/);
  assert.doesNotMatch(gateBlock, /onReady/);
  assert.match(explore, /<ExploreModelGate>[\s\S]*<ExploreScene/);
  assert.match(explore, /<\/ExploreModelGate>/);
  assert.doesNotMatch(explore, /handleExploreModelsReady/);
  assert.doesNotMatch(explore, /useProgress/);
  assert.doesNotMatch(explore, /EXPLORE_ENTRY_MIN_LOADING_MS/);
  assert.doesNotMatch(explore, /minimumLoadingElapsed/);
  assert.doesNotMatch(explore, /ExploreLoadingOverlay/);
  assert.doesNotMatch(explore, /心屿正在浮出水面/);
  assert.doesNotMatch(explore, /模型缓存/);
});

test("island overview keeps low-tier mobile content close to Web completeness", () => {
  const explore = read("src/components/ExploreMode.tsx");

  assert.match(explore, /function getExploreRevealDelay\(tier: PerfTier\): ExploreRevealDelay/);
  assert.match(explore, /town:\s*tier === "low" \? 120 : 0/);
  assert.match(explore, /village:\s*tier === "low" \? 260 : 120/);
  assert.match(explore, /coastline:\s*tier === "low" \? 420 : 220/);
  assert.match(explore, /districts:\s*tier === "low" \? 560 : 320/);
  assert.match(explore, /companion:\s*tier === "low" \? 700 : 360/);
  assert.match(explore, /interactions:\s*tier === "low" \? 900 : 520/);
  assert.match(explore, /townblock:\s*tier === "low" \? 1050 : 620/);
  assert.match(explore, /rhododendron:\s*tier === "low" \? 1250 : 760/);
  assert.match(explore, /manor:\s*tier === "low" \? 1450 : 900/);
  assert.match(explore, /bath:\s*tier === "low" \? 1700 : 1100/);
  assert.match(explore, /模型已由 ExploreModelGate 预热/);
  assert.doesNotMatch(explore, /companion:\s*tier === "low" \? 70000/);
});
