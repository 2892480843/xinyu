import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const MEMORY_TREE_URL = "/models/xy_item_memory_tree.glb";

async function readGlbJson(filePath) {
  const bytes = await readFile(filePath);
  assert.equal(bytes.toString("utf8", 0, 4), "glTF", "expected a binary glTF file");

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.toString("utf8", offset + 4, offset + 8);
    offset += 8;

    if (type === "JSON") {
      return JSON.parse(bytes.toString("utf8", offset, offset + length).trim());
    }
    offset += length;
  }

  throw new Error("GLB JSON chunk not found");
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("memory tree GLB exists with stable nodes and materials", async () => {
  const filePath = path.resolve("public", MEMORY_TREE_URL.slice(1));
  await access(filePath);

  const gltf = await readGlbJson(filePath);
  const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name).filter(Boolean));
  const materialNames = new Set((gltf.materials ?? []).map((material) => material.name).filter(Boolean));

  for (const node of ["MemoryTreeRoot", "Trunk", "BranchA", "BranchB", "BranchC", "Canopy", "OrbAnchor_0", "OrbAnchor_1", "OrbAnchor_2"]) {
    assert.ok(nodeNames.has(node), `memory tree GLB should include node ${node}`);
  }

  for (const material of ["MemoryTreeTrunk", "MemoryTreeLeaf", "MemoryTreeLeafLight", "Emissive_MemoryTreeCore"]) {
    assert.ok(materialNames.has(material), `memory tree GLB should include material ${material}`);
  }
});

test("ExploreMode renders memory tree through its dedicated GLB and keeps collected orbs", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const treeBlock = sourceBlock(source, "function MemoryTree", "function Town");

  assert.match(source, /memoryTree:\s*"\/models\/xy_item_memory_tree\.glb"/);
  assert.match(source, /function GltfMemoryTree/);
  assert.match(source, /useGLTF\(MODELS\.memoryTree\)/);
  assert.match(treeBlock, /<GltfMemoryTree/);
  assert.match(treeBlock, /orbRefs/);
  assert.match(treeBlock, /orbMats/);
  assert.doesNotMatch(treeBlock, /<cylinderGeometry args=\{\[0\.18,\s*0\.34,\s*3\.1,\s*7\]\}/);
});
