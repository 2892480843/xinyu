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

test("explore mode keeps a conservative pixel and instance budget before runtime degradation", async () => {
  const source = await readExploreSource();
  const sceneBlock = sourceBlock(source, "function ExploreScene", "function Joystick");

  assert.match(source, /const EXPLORE_DPR_RANGE: Record<PerfTier, \[number, number\]> = \{\s*low: \[0\.75, 1\],\s*high: \[0\.85, 1\.15\],\s*\}/);
  assert.match(source, /const EXPLORE_GRASS_COUNT: Record<PerfTier, number> = \{\s*low: 8000,\s*high: 28000,\s*\}/);
  assert.match(source, /const EXPLORE_TERRAIN_SEGMENTS: Record<PerfTier, number> = \{\s*low: 160,\s*high: 280,\s*\}/);
  assert.match(source, /function buildExploreTerrain\(tier: PerfTier\): THREE\.BufferGeometry/);
  assert.match(source, /const SEG = EXPLORE_TERRAIN_SEGMENTS\[tier\]/);
  assert.match(sceneBlock, /const terrain = useMemo\(\(\) => buildExploreTerrain\(tier\), \[tier\]\)/);
  assert.match(sceneBlock, /const grassCount = EXPLORE_GRASS_COUNT\[tier\]/);
  assert.match(sceneBlock, /\{grassCount > 0 && <GroundGrass count=\{grassCount\} animate=\{tier === "high" && !degraded\} grad=\{toonGrad\} \/>\}/);
  assert.doesNotMatch(sceneBlock, /const snowItems = useMemo<InstItem\[\]>\(\(\) => \{\s*if \(lowTier\) return \[\]/);
  assert.match(source, /dpr=\{EXPLORE_DPR_RANGE\[tier\]\}/);
});

test("runtime performance watcher reacts before visible stutter accumulates", async () => {
  const source = await readExploreSource();
  const perfBlock = sourceBlock(source, "function PerfWatch", "function LandmarkOnPad");

  assert.match(source, /const EXPLORE_PERF_SAMPLE_SECONDS = 0\.6/);
  assert.match(source, /const EXPLORE_PERF_MILD_FPS = 54/);
  assert.match(source, /const EXPLORE_PERF_HARD_FPS = 36/);
  assert.match(source, /const EXPLORE_DPR_STAGE_ONE = 0\.95/);
  assert.match(source, /const EXPLORE_DPR_STAGE_TWO = 0\.78/);
  assert.match(perfBlock, /if \(a\.t >= EXPLORE_PERF_SAMPLE_SECONDS\)/);
  assert.match(perfBlock, /a\.mild = fps < EXPLORE_PERF_MILD_FPS \? a\.mild \+ 1 : 0/);
  assert.match(perfBlock, /a\.hard = fps < EXPLORE_PERF_HARD_FPS \? a\.hard \+ 1 : 0/);
  assert.match(perfBlock, /if \(stage\.current < 1 && a\.mild >= 1\) \{ stage\.current = 1; setDpr\(EXPLORE_DPR_STAGE_ONE\); \}/);
  assert.match(perfBlock, /if \(a\.hard >= 1 \|\| a\.mild >= 3\)/);
  assert.match(perfBlock, /setDpr\(tier === "low" \? 0\.65 : EXPLORE_DPR_STAGE_TWO\)/);
});

test("heavy explore models fill in quickly on low tier while still staging landmarks", async () => {
  const source = await readExploreSource();
  const delayBlock = sourceBlock(source, "function getExploreRevealDelay", "const COL_CELL");
  const townSignature = sourceBlock(source, "function Town", "const wall = useMemo");
  const sceneBlock = sourceBlock(source, "function ExploreScene", "function Joystick");
  const townRenderBlock = sourceBlock(source, "/* 写实重地标", "/* 池塘 + 芦苇 */");

  assert.match(delayBlock, /town: tier === "low" \? 120 : 0/);
  assert.match(delayBlock, /village: tier === "low" \? 260 : 120/);
  assert.match(delayBlock, /coastline: tier === "low" \? 420 : 220/);
  assert.match(delayBlock, /districts: tier === "low" \? 560 : 320/);
  assert.match(delayBlock, /companion: tier === "low" \? 700 : 360/);
  assert.match(delayBlock, /interactions: tier === "low" \? 900 : 520/);
  assert.match(delayBlock, /lanterns: tier === "low" \? 980 : 580/);
  assert.match(delayBlock, /townblock: tier === "low" \? 1050 : 620/);
  assert.match(delayBlock, /rhododendron: tier === "low" \? 1250 : 760/);
  assert.match(delayBlock, /manor: tier === "low" \? 1450 : 900/);
  assert.match(delayBlock, /bath: tier === "low" \? 1700 : 1100/);
  assert.match(townSignature, /allowHeavyLandmarks,\s*\}: \{/);
  assert.match(townSignature, /allowHeavyLandmarks\?: boolean/);
  assert.match(sceneBlock, /allowHeavyLandmarks \/>/);
  assert.match(sceneBlock, /<DelayedMount ms=\{revealDelay\.companion\}>/);
  assert.doesNotMatch(sceneBlock, /!\s*degraded && <DelayedMount ms=\{revealDelay\.companion\}>/);
  assert.match(townRenderBlock, /\{allowHeavyLandmarks && \(/);
  assert.match(sceneBlock, /<Suspense fallback=\{<ParkedCarFallback grad=\{toonGrad\} \/>\}>/);
});
