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

test("landmark pads do not render separate exposed platform meshes", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const block = sourceBlock(source, "function LandmarkOnPad", "function InstancedField");

  assert.match(block, /<GltfProp/);
  assert.doesNotMatch(block, /<cylinderGeometry args=\{\[padR,\s*padR \* 1\.06,\s*10,\s*40\]\}/);
  assert.doesNotMatch(block, /padTopGeo|skirtGeo|padGrassMat/);
  assert.doesNotMatch(block, /geometry=\{padTopGeo\}|geometry=\{skirtGeo\}/);
});

test("landmark pads are folded into the island terrain grass surface", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const terrainBlock = sourceBlock(source, "function buildExploreTerrain", "// 手绘后期");
  const block = sourceBlock(source, "function LandmarkOnPad", "function InstancedField");
  const usageBlock = sourceBlock(source, "function Town", "function Npcs");

  assert.match(source, /function terrainGrassColor/);
  assert.match(source, /function landmarkGrassColor/);
  assert.match(source, /setAttribute\("color",\s*new THREE\.Float32BufferAttribute/);
  assert.match(terrainBlock, /landmarkGroundLift\(px,\s*-py\)/);
  assert.match(terrainBlock, /landmarkGrassColor\(px,\s*-py,\s*tmp\)/);
  assert.doesNotMatch(block, /padColor/);
  assert.doesNotMatch(block, /new THREE\.MeshToonMaterial/);
  assert.doesNotMatch(usageBlock, /padColor=/);
});

test("landmark pad grass colors sample the underlying island terrain", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const grassBlock = sourceBlock(source, "function landmarkGrassColor", "// 建好的地形");

  assert.match(source, /function landmarkGrassColor/);
  assert.match(grassBlock, /terrainGrassColor\(wx,\s*wz,\s*exGroundY\(wx,\s*wz\)/);
  assert.doesNotMatch(grassBlock, /padTop/);
});

test("landmark pads use static pad data without runtime landmark registry", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const block = sourceBlock(source, "function LandmarkOnPad", "function InstancedField");

  assert.match(source, /const LANDMARK_PADS = \[/);
  assert.doesNotMatch(source, /const LANDMARKS/);
  assert.doesNotMatch(block, /LANDMARKS/);
  assert.doesNotMatch(block, /LANDMARKS\.push/);
});

test("ground grass follows raised landmark pad surfaces", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const block = sourceBlock(source, "function GroundGrass", "// 海岛村落");
  const groundLiftBlock = sourceBlock(source, "function landmarkGroundLift", "// 散落物");

  assert.match(source, /const LANDMARK_PADS = \[/);
  assert.match(source, /BATH\.x[\s\S]*padR:\s*10/);
  assert.match(source, /BLOCK\.x[\s\S]*padR:\s*7\.5/);
  assert.match(source, /MANOR\.x[\s\S]*padR:\s*9/);
  assert.match(groundLiftBlock, /for \(const p of LANDMARK_PADS\)/);
  assert.match(block, /landmarkGroundLift\(x,\s*z\)/);
  assert.match(block, /Math\.max\([^)]*landmarkY/);
});

test("landmark ground lift is ignored outside landmark pads", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const groundLiftBlock = sourceBlock(source, "function landmarkGroundLift", "// 散落物");

  assert.match(groundLiftBlock, /let lift = -Infinity/);
  assert.doesNotMatch(groundLiftBlock, /let lift = 0/);
});
