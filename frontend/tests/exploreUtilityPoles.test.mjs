import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("utility poles and wires anchor to the visible road-adjusted ground", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const utilityBlock = sourceBlock(source, "const poleItems = useMemo<InstItem[]>", "  // 路灯排(沿主路另一侧)");

  assert.match(utilityBlock, /groundYWithRoad\(p\.x,\s*p\.z\)\.y \+ 1\.15/);
  assert.match(utilityBlock, /groundYWithRoad\(p\.x,\s*p\.z\)\.y \+ 2\.1/);
  assert.match(utilityBlock, /groundYWithRoad\(p\.x,\s*p\.z\)\.y \+ 1\.85/);
  assert.match(utilityBlock, /groundYWithRoad\(a\.x,\s*a\.z\)\.y \+ TOP/);
  assert.match(utilityBlock, /groundYWithRoad\(b\.x,\s*b\.z\)\.y \+ TOP/);
  assert.match(utilityBlock, /groundYWithRoad\(x,\s*z\)\.y \+ MIN_CLEAR/);
  assert.doesNotMatch(utilityBlock, /exGroundY\(/);
});
