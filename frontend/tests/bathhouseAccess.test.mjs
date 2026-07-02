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

test("bathhouse front steps keep a walkable gap through the landmark pad colliders", async () => {
  const source = await readExploreSource();
  const fillBlock = sourceBlock(source, "function fillPadColliders", "// ── 石阶");
  const colliderUseBlock = sourceBlock(source, "// 浴场 / 街区 / 山庄", "// 近海可达地形");

  assert.match(source, /const BATH_FRONT_OPENING/);
  assert.match(fillBlock, /PadColliderOpening/);
  assert.match(fillBlock, /isPadColliderInOpening/);
  assert.match(colliderUseBlock, /fillPadColliders\(BATH\.x,\s*BATH\.z,\s*10,\s*\[BATH_FRONT_OPENING\]\)/);
  assert.doesNotMatch(colliderUseBlock, /fillPadColliders\(BATH\.x,\s*BATH\.z,\s*10\)\)/);
});
