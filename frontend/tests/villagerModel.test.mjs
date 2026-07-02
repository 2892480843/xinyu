import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const VILLAGER_URL = "/models/xy_char_villager_base.glb";

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

test("villager base model exists with stable node and material names", async () => {
  const filePath = path.resolve("public", VILLAGER_URL.slice(1));
  await access(filePath);

  const gltf = await readGlbJson(filePath);
  const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name).filter(Boolean));
  const materialNames = new Set((gltf.materials ?? []).map((material) => material.name).filter(Boolean));

  for (const node of ["VillagerRoot", "Body", "Head", "Hair", "Hat", "ArmL", "ArmR", "LegL", "LegR"]) {
    assert.ok(nodeNames.has(node), `villager GLB should include node ${node}`);
  }

  for (const material of ["Skin", "Hair", "Shirt", "Pants", "Hat", "Eye", "Blush"]) {
    assert.ok(materialNames.has(material), `villager GLB should include material ${material}`);
  }
});

test("ExploreMode routes NPCs through the villager GLB while preserving avatar colors", async () => {
  const source = await readExploreSource();
  const modelsBlock = sourceBlock(source, "const MODELS =", "};");
  const npcBlock = sourceBlock(source, "function Npcs", "function SecretWhale");

  assert.match(modelsBlock, /villagerBase:\s*"\/models\/xy_char_villager_base\.glb"/);
  assert.match(source, /function GltfNpcCharacter/);
  assert.match(source, /useGLTF\(MODELS\.villagerBase\)/);
  assert.match(source, /VillagerMaterialName/);
  assert.match(source, /mats\.Skin\.color\.set\(avatar\.skin\)/);
  assert.match(source, /mats\.Hair\.color\.set\(avatar\.hair\)/);
  assert.match(source, /mats\.Shirt\.color\.set\(avatar\.shirt\)/);
  assert.match(source, /mats\.Pants\.color\.set\(avatar\.pants\)/);
  assert.match(npcBlock, /<GltfNpcCharacter avatar=\{n\.avatar\}/);
  assert.doesNotMatch(npcBlock, /<CharacterModel avatar=\{n\.avatar\}/);
});
