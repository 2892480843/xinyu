import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSkyFxSource() {
  return readFile(path.resolve("src/components/SkyFx.tsx"), "utf8");
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("meteor shower uses thin streak lines plus glow and debris points", async () => {
  const source = await readSkyFxSource();
  const block = sourceBlock(source, "export function MeteorShower", "// ───────────────────────── 夜空浮尘");

  assert.match(block, /new THREE\.LineBasicMaterial/);
  assert.match(block, /lineSegments/);
  assert.match(block, /sparkGeo/);
  assert.match(block, /headGeo/);
  assert.match(block, /meteorMode \? 18 : 9/);
  assert.match(block, /meteorMode \? 7 : 0/);
  assert.match(block, /depthWrite: false/);
  assert.match(block, /blending: THREE\.AdditiveBlending/);
});
