import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

function extractRoadHalf(source) {
  const match = source.match(/const ROAD_HALF = (\d+(?:\.\d+)?);/);
  assert.ok(match, "ROAD_HALF should be a readable constant");
  return Number(match[1]);
}

function extractEggSpecs(source) {
  const match = source.match(/const spec:[\s\S]*?=\s*(\[[\s\S]*?\n\s*\]);/);
  assert.ok(match, "egg placement spec should be a static array");
  return Function(`"use strict"; return (${match[1]});`)();
}

test("drive-road scenic eggs stay completely outside the drivable lane", async () => {
  const source = await readFile(path.resolve("src/lib/track.ts"), "utf8");
  const roadHalf = extractRoadHalf(source);
  const safetyBuffer = 1.2;
  const footprintRadius = {
    rainbow: 16.6,
    windmill: 4.5,
    deer: 1.2,
    bunny: 0.7,
    spirit: 0.9,
    balloons: 0.8,
  };

  const offenders = [];
  for (const egg of extractEggSpecs(source)) {
    const footprint = footprintRadius[egg.kind];
    assert.ok(Number.isFinite(footprint), `${egg.kind} should have a footprint radius`);
    const lateralCenter = Math.abs(egg.side) * (roadHalf + egg.off);
    const required = roadHalf + footprint + safetyBuffer;
    if (lateralCenter < required) {
      offenders.push(`${egg.kind} at ${egg.frac}: lateral=${lateralCenter.toFixed(1)}, required=${required.toFixed(1)}`);
    }
  }

  assert.deepEqual(offenders, [], `scenic eggs should not overlap the drive road: ${offenders.join("; ")}`);
});
