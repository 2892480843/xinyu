import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const FISHING_BOBBER_URL = "/models/xy_item_fishing_bobber.glb";

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

test("fishing bobber GLB exists with stable nodes and materials", async () => {
  const filePath = path.resolve("public", FISHING_BOBBER_URL.slice(1));
  await access(filePath);

  const gltf = await readGlbJson(filePath);
  const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name).filter(Boolean));
  const materialNames = new Set((gltf.materials ?? []).map((material) => material.name).filter(Boolean));

  for (const node of ["FishingBobberRoot", "BobberBody", "BobberTip", "LineHook"]) {
    assert.ok(nodeNames.has(node), `fishing bobber GLB should include node ${node}`);
  }

  for (const material of ["BobberRed", "BobberWhite", "BobberLine", "Emissive_BobberTip"]) {
    assert.ok(materialNames.has(material), `fishing bobber GLB should include material ${material}`);
  }
});

test("ExploreMode renders the fishing marker through its dedicated GLB", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const block = sourceBlock(source, "function FishingRigFx", "function FishingSystemHud");

  assert.match(source, /fishingBobber:\s*"\/models\/xy_item_fishing_bobber\.glb"/);
  assert.match(source, /function GltfFishingBobber/);
  assert.match(source, /useGLTF\(MODELS\.fishingBobber\)/);
  assert.match(source, /<FishingRigFx/);
  assert.match(block, /<GltfFishingBobber/);
  assert.doesNotMatch(block, /<sphereGeometry args=\{\[0\.2,\s*10,\s*7\]\}/);
  assert.doesNotMatch(block, /<cylinderGeometry args=\{\[0\.03,\s*0\.03,\s*0\.22,\s*5\]\}/);
});
