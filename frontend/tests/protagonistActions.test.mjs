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

function animationByName(gltf, name) {
  return (gltf.animations ?? []).find((animation) => animation.name === name);
}

function animationTargetNames(gltf, animationName) {
  const animation = animationByName(gltf, animationName);
  assert.ok(animation, `expected animation clip ${animationName}`);

  return new Set(
    (animation.channels ?? [])
      .map((channel) => gltf.nodes?.[channel.target?.node]?.name)
      .filter(Boolean),
  );
}

test("protagonist GLB exports named action clips for exploration controls", async () => {
  const gltf = await readGlbJson(path.resolve("public/models/xy_char_protagonist.glb"));
  const names = new Set((gltf.animations ?? []).map((animation) => animation.name));

  for (const clip of ["WalkLoop", "Jump", "Wave", "Flute", "Sit"]) {
    assert.ok(names.has(clip), `missing protagonist action clip ${clip}`);
  }
});

test("protagonist action clips target the intended articulated nodes", async () => {
  const gltf = await readGlbJson(path.resolve("public/models/xy_char_protagonist.glb"));

  const expectations = {
    WalkLoop: ["Body", "LegL", "LegR", "ShinL", "ShinR", "ArmL", "ArmR", "ForeArmL", "ForeArmR", "Cape"],
    Jump: ["Body", "LegL", "LegR", "ShinL", "ShinR", "ArmL", "ArmR", "Cape"],
    Wave: ["Body", "ArmL", "ForeArmL", "ArmR"],
    Flute: ["Body", "ArmL", "ArmR", "ForeArmL", "ForeArmR", "Prop_Flute"],
    Sit: ["Body", "LegL", "LegR", "ShinL", "ShinR", "ArmL", "ArmR", "ForeArmL", "ForeArmR", "Cape"],
  };

  for (const [clip, nodes] of Object.entries(expectations)) {
    const targets = animationTargetNames(gltf, clip);
    for (const node of nodes) {
      assert.ok(targets.has(node), `${clip} should animate ${node}`);
    }
  }
});

test("protagonist GLB includes reference-sheet polish details", async () => {
  const gltf = await readGlbJson(path.resolve("public/models/xy_char_protagonist.glb"));
  const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name).filter(Boolean));
  const materialNames = new Set((gltf.materials ?? []).map((material) => material.name).filter(Boolean));

  for (const node of [
    "HairWhorl",
    "CapeSideTailL",
    "CapeSideTailR",
    "CapeBackEmblem",
    "CloakCordTassels",
    "PearlPendant",
    "SatchelShellCharm",
  ]) {
    assert.ok(nodeNames.has(node), `missing reference polish node ${node}`);
  }

  for (const material of ["CapeBlueSheer", "Pearl", "GoldPin", "TasselBlue"]) {
    assert.ok(materialNames.has(material), `missing reference polish material ${material}`);
  }
});

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

test("GltfGuardian connects protagonist GLB clips through drei useAnimations", async () => {
  const block = sourceBlock(await readExploreSource(), "function GltfGuardian", "// 可切换主角的种类");

  assert.match(block, /const \{ scene, animations \} = useGLTF\(MODELS\.guardianChar\)/);
  assert.match(block, /useAnimations\(animations, ref\)/);
  assert.match(block, /actionRef\?: React\.RefObject<CharacterActionClip>/);
  assert.match(block, /actions\[next\]/);
  assert.match(block, /THREE\.LoopRepeat/);
  assert.match(block, /THREE\.LoopOnce/);
});

test("Player selects and routes the current action clip for every playable character", async () => {
  const source = await readExploreSource();
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");

  assert.match(source, /selectCharacterAction/);
  assert.match(playerBlock, /const characterActionRef = useRef<CharacterActionClip>\("Idle"\)/);
  assert.match(playerBlock, /characterActionRef\.current = selectCharacterAction/);
  assert.match(playerBlock, /const glbClipActive = \(character === "guardian" && characterActionRef\.current !== "Idle"\) \|\| \(character === "hero" && characterActionRef\.current !== "Idle"\)/);
  assert.match(playerBlock, /<GltfHero[\s\S]*actionRef=\{characterActionRef\}/);
  assert.match(playerBlock, /<GltfGuardian[\s\S]*actionRef=\{characterActionRef\}/);
  assert.match(playerBlock, /<GltfPocoyo[\s\S]*actionRef=\{characterActionRef\}/);
  assert.match(playerBlock, /<GltfAvatar[\s\S]*legL=\{legL\}[\s\S]*legR=\{legR\}[\s\S]*armL=\{armL\}[\s\S]*armR=\{armR\}/);
});
