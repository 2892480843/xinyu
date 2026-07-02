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

test("lantern releases do not reuse lantern spawn signals for fireworks", async () => {
  const source = await readExploreSource();
  const scenePropsBlock = sourceBlock(source, "function ExploreScene", "}) {");
  const sceneTypeBlock = sourceBlock(source, "lanternLaunch: React.RefObject<number>;", "onAtWater");
  const sceneRenderBlock = sourceBlock(source, "/* 天灯", "<FishingRigFx");
  const singleBlock = sourceBlock(source, "const doReleaseLantern = () => {", "const doReleaseLanternFlock = () => {");
  const flockBlock = sourceBlock(source, "const doReleaseLanternFlock = () => {", "const ensureLantern");

  assert.match(source, /const fireworkLaunch = useRef\(0\)/);
  assert.match(scenePropsBlock, /fireworkLaunch,/);
  assert.match(sceneTypeBlock, /fireworkLaunch: React\.RefObject<number>;/);
  assert.match(source, /fireworkLaunch=\{fireworkLaunch\}/);
  assert.match(sceneRenderBlock, /<SkyLanterns launchRef=\{lanternLaunch\} posRef=\{posRef\} tier=\{tier\} \/>/);
  assert.match(sceneRenderBlock, /<Fireworks launchRef=\{fireworkLaunch\} posRef=\{posRef\} active=\{isNight\} tier=\{tier\} \/>/);

  assert.match(singleBlock, /lanternLaunch\.current \+= 1/);
  assert.match(singleBlock, /fireworkLaunch\.current \+= 1/);
  assert.doesNotMatch(singleBlock, /setTimeout\(\(\) => \{\s*lanternLaunch\.current \+= 1;\s*\}/);

  assert.match(flockBlock, /lanternFlock\.v \+= 1/);
  assert.match(flockBlock, /fireworkLaunch\.current \+= 1/);
  assert.doesNotMatch(flockBlock, /lanternLaunch\.current \+= 1/);
});

test("rising lantern instances use lightweight procedural geometry", async () => {
  const source = await readExploreSource();
  const risingBlock = sourceBlock(source, "function RisingLantern", "function GroundBlessing");

  assert.doesNotMatch(risingBlock, /useGLTF\(MODELS\.skyLantern\)/);
  assert.doesNotMatch(risingBlock, /scene\.clone|\.clone\(true\)|\.traverse\(/);
  assert.match(risingBlock, /const paperMat = useMemo\(\(\) => new THREE\.MeshToonMaterial/);
  assert.match(risingBlock, /const frameMat = useMemo\(\(\) => new THREE\.MeshBasicMaterial/);
  assert.match(risingBlock, /<boxGeometry args=\{\[0\.78, 1\.02, 0\.78\]\}/);
});

test("multi-lantern launch uses tiered caps and incremental mounting", async () => {
  const source = await readExploreSource();
  const skyBlock = sourceBlock(source, "function SkyLanterns", "function GltfFishingBobber");
  const interactionsBlock = sourceBlock(source, "<DelayedMount ms={revealDelay.interactions}>", "{/* 帧率自适应");

  assert.match(source, /function lanternFlockSize\(tier: PerfTier\): number/);
  assert.match(source, /function lanternCap\(tier: PerfTier\): number/);
  assert.match(source, /function lanternBatchSize\(tier: PerfTier\): number/);
  assert.match(source, /function lanternFireworkRounds\(tier: PerfTier\): number/);
  assert.match(skyBlock, /tier:\s*PerfTier/);
  assert.match(skyBlock, /const CAP = lanternCap\(tier\)/);
  assert.match(skyBlock, /const batchSize = lanternBatchSize\(tier\)/);
  assert.match(skyBlock, /const FN = lanternFlockSize\(tier\)/);
  assert.match(skyBlock, /pending\.current\.splice\(0, batchSize\)/);
  assert.doesNotMatch(skyBlock, /useGLTF\(MODELS\.skyLantern\)/);
  assert.doesNotMatch(skyBlock, /splice\(0,\s*3\)/);
  assert.doesNotMatch(interactionsBlock, /<SkyLanterns launchRef=\{lanternLaunch\}/);
  assert.doesNotMatch(interactionsBlock, /<Fireworks launchRef=\{fireworkLaunch\}/);
});

test("lantern release path throttles repeat clicks without model readiness polling", async () => {
  const source = await readExploreSource();
  const ensureBlock = sourceBlock(source, "const ensureLantern = (kind: \"single\" | \"flock\") => {", "const releaseLantern = ()");

  assert.match(source, /const LANTERN_SINGLE_COOLDOWN_MS = 900/);
  assert.match(source, /const LANTERN_FLOCK_COOLDOWN_MS = 2200/);
  assert.match(source, /const lastLanternReleaseAt = useRef\(0\)/);
  assert.match(ensureBlock, /Date\.now\(\)/);
  assert.match(ensureBlock, /LANTERN_FLOCK_COOLDOWN_MS/);
  assert.match(ensureBlock, /LANTERN_SINGLE_COOLDOWN_MS/);
  assert.doesNotMatch(ensureBlock, /_lanternModelReady|setInterval|setLanternPrep|lanternWaitRef/);
});
