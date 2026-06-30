import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

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

function animationTargetNames(gltf, animationName) {
  const animation = (gltf.animations ?? []).find((item) => item.name === animationName);
  assert.ok(animation, `expected animation clip ${animationName}`);

  return new Set(
    (animation.channels ?? [])
      .map((channel) => gltf.nodes?.[channel.target?.node]?.name)
      .filter(Boolean),
  );
}

test("companion spirit GLB exports expanded action clips", async () => {
  const gltf = await readGlbJson(path.resolve("public/models/xy_pet_spirit_lighthouse.glb"));
  const names = new Set((gltf.animations ?? []).map((animation) => animation.name).filter(Boolean));

  for (const clip of ["Nuzzle", "CuriousPeek", "DiscoveryHop", "LanternGaze", "ComfortPulse", "NightGuard"]) {
    assert.ok(names.has(clip), `missing companion spirit animation clip ${clip}`);
  }
});

test("expanded companion spirit clips animate visible model nodes", async () => {
  const gltf = await readGlbJson(path.resolve("public/models/xy_pet_spirit_lighthouse.glb"));

  const expectations = {
    Nuzzle: ["XY_PetSpirit_Lighthouse", "XYANIM_TailPivot"],
    CuriousPeek: ["XY_PetSpirit_Lighthouse", "XYANIM_MemoryOrbPivot"],
    DiscoveryHop: ["XY_PetSpirit_Lighthouse", "XYANIM_TailPivot", "XYANIM_MemoryOrbPivot"],
    LanternGaze: ["XY_PetSpirit_Lighthouse", "XYANIM_MemoryOrbPivot"],
    ComfortPulse: ["XY_PetSpirit_Lighthouse", "XYANIM_MemoryOrbPivot"],
    NightGuard: ["XY_PetSpirit_Lighthouse", "XYANIM_MemoryOrbPivot"],
  };

  for (const [clip, nodes] of Object.entries(expectations)) {
    const targets = animationTargetNames(gltf, clip);
    for (const node of nodes) {
      assert.ok(targets.has(node), `${clip} should animate ${node}`);
    }
  }
});
