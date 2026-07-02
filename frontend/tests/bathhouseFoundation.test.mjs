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

test("bathhouse placement uses the measured GLB floor depth instead of a rounded lift", async () => {
  const source = await readExploreSource();
  const landmarkConfig = sourceBlock(source, "const BATH_MODEL_FLOOR_DEPTH", "const BATH_FRONT_OPENING");

  assert.match(landmarkConfig, /const BATH_MODEL_FLOOR_DEPTH = 0\.02623401977279237/);
  assert.match(landmarkConfig, /base:\s*BATH_MODEL_FLOOR_DEPTH/);
  assert.doesNotMatch(landmarkConfig, /base:\s*0\.03/);
});

test("bathhouse landmark renders a small foundation plug under the thin GLB floor", async () => {
  const source = await readExploreSource();
  const landmarkConfig = sourceBlock(source, "const BATH_MODEL_FLOOR_DEPTH", "const BATH_FRONT_OPENING");
  const renderBlock = sourceBlock(source, "function LandmarkOnPad", "function InstancedField");

  assert.match(landmarkConfig, /const BATH_FOUNDATION/);
  assert.match(landmarkConfig, /foundation:\s*BATH_FOUNDATION/);
  assert.match(renderBlock, /const foundation = cfg\.foundation/);
  assert.match(renderBlock, /boxGeometry args=\{\[foundation\.width,\s*foundation\.height,\s*foundation\.depth\]\}/);
  assert.match(renderBlock, /meshStandardMaterial color=\{foundation\.color\}/);
});
