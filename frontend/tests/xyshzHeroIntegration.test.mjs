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

test("xyshz GLB is registered as the default playable hero", async () => {
  const source = await readExploreSource();
  const modelsBlock = sourceBlock(source, "const MODELS", "};");

  assert.match(modelsBlock, /heroChar:\s*"\/models\/xyshz_rigged\.glb\?v=5"/);
  assert.match(modelsBlock, /guardianChar:\s*"\/models\/xy_char_protagonist\.glb\?v=2"/);
  assert.match(source, /type CharKind = "hero" \| "guardian" \| "pocoyo" \| "avatar"/);
  assert.match(source, /const CHAR_ORDER: CharKind\[\] = \["hero", "guardian", "pocoyo", "avatar"\]/);
  assert.match(source, /if \(v === "hero" \|\| v === "guardian" \|\| v === "pocoyo" \|\| v === "avatar"\) return v;/);
});

test("xyshz hero connects its rigged GLB walk clip through drei useAnimations", async () => {
  const source = await readExploreSource();
  const heroBlock = sourceBlock(source, "function GltfHero", "function GltfGuardian");

  assert.match(heroBlock, /const \{ scene, animations \} = useGLTF\(MODELS\.heroChar\)/);
  assert.match(heroBlock, /useAnimations\(animations, ref\)/);
  assert.match(heroBlock, /actionRef\?: React\.RefObject<CharacterActionClip>/);
  assert.match(heroBlock, /actions\[next\]/);
  assert.match(heroBlock, /THREE\.LoopRepeat/);
  assert.match(heroBlock, /THREE\.LoopOnce/);
  assert.match(source, /const XYSHZ_MODEL_SCALE = 0\.0145/);
  assert.match(source, /const XYSHZ_FOOT_OFFSET_Y = 49\.9846 \* XYSHZ_MODEL_SCALE/);
  assert.match(source, /const XYSHZ_MODEL_ROTATION:[^=]+= \[0, -Math\.PI \/ 2, 0\]/);
});

test("xyshz hero connects the dedicated RunLoop clip for held movement", async () => {
  const source = await readExploreSource();
  const heroBlock = sourceBlock(source, "function GltfHero", "function GltfGuardian");
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");

  assert.match(source, /const XYSHZ_RUN_HOLD_SECONDS = 0\.55/);
  assert.match(heroBlock, /requested === "RunLoop" \? "RunLoop" : requested === "WalkLoop" \? "WalkLoop" : "Idle"/);
  assert.match(heroBlock, /nextAction\.timeScale = next === "RunLoop" \? XYSHZ_RUN_TIMESCALE : next === "WalkLoop" \? XYSHZ_WALK_TIMESCALE : 1/);
  assert.match(playerBlock, /moveHoldT\.current \+= moving \? dt : -dt \* 2/);
  assert.match(playerBlock, /running: character === "hero" && moveHoldT\.current >= XYSHZ_RUN_HOLD_SECONDS/);
  assert.match(playerBlock, /character === "hero" && \(characterActionRef\.current === "WalkLoop" \|\| characterActionRef\.current === "RunLoop"\)/);
});

test("xyshz hero corrects the source model's +X front to the player's +Z movement direction", async () => {
  const source = await readExploreSource();
  const heroBlock = sourceBlock(source, "function GltfHero", "function GltfGuardian");

  assert.match(source, /const XYSHZ_MODEL_ROTATION:[^=]+= \[0, -Math\.PI \/ 2, 0\]/);
  assert.match(heroBlock, /rotation=\{XYSHZ_MODEL_ROTATION\}/);
});

test("xyshz hero applies only a conservative in-game walk overlay over the GLB clip", async () => {
  const source = await readExploreSource();
  const heroBlock = sourceBlock(source, "function GltfHero", "function GltfGuardian");

  assert.match(heroBlock, /heroWalkBones/);
  assert.match(heroBlock, /getObjectByName\("UpperArmL"\)/);
  assert.match(heroBlock, /getObjectByName\("ForeArmR"\)/);
  assert.match(heroBlock, /walkBlend/);
  assert.match(heroBlock, /root\.position\.y/);
  assert.match(heroBlock, /UpperArmL[\s\S]*rotation\.x/);
  assert.match(heroBlock, /ForeArmR[\s\S]*rotation\.x/);
  assert.doesNotMatch(
    heroBlock,
    /bones\.(?:HandL|HandR|UpperLegL|UpperLegR|LowerLegL|LowerLegR|FootL|FootR)\.rotation\.[xyz]\s*\+=/,
  );
});

test("xyshz hero speeds up WalkLoop so held movement reads as walking", async () => {
  const source = await readExploreSource();
  const heroBlock = sourceBlock(source, "function GltfHero", "function GltfGuardian");

  assert.match(source, /const XYSHZ_WALK_TIMESCALE = 1\.55/);
  assert.match(heroBlock, /nextAction\.timeScale = next === "RunLoop" \? XYSHZ_RUN_TIMESCALE : next === "WalkLoop" \? XYSHZ_WALK_TIMESCALE : 1/);
});

test("xyshz hero lets drei advance the GLB animation mixer only once per frame", async () => {
  const source = await readExploreSource();
  const heroBlock = sourceBlock(source, "function GltfHero", "function GltfGuardian");

  assert.doesNotMatch(heroBlock, /mixer\.update\(dt\)/);
});

test("legacy animated guardian keeps its GLB clips separate from xyshz", async () => {
  const source = await readExploreSource();
  const guardianBlock = sourceBlock(source, "function GltfGuardian", "// 可切换主角的种类");
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");

  assert.match(guardianBlock, /const \{ scene, animations \} = useGLTF\(MODELS\.guardianChar\)/);
  assert.match(guardianBlock, /useAnimations\(animations, ref\)/);
  assert.match(playerBlock, /const glbClipActive = \(character === "guardian" && characterActionRef\.current !== "Idle"\) \|\| \(character === "hero" && \(characterActionRef\.current === "WalkLoop" \|\| characterActionRef\.current === "RunLoop"\)\)/);
  assert.match(playerBlock, /character === "hero" \? \(/);
  assert.match(playerBlock, /<GltfHero[\s\S]*actionRef=\{characterActionRef\}/);
  assert.match(playerBlock, /character === "guardian" \? \(/);
  assert.match(playerBlock, /<GltfGuardian[\s\S]*actionRef=\{characterActionRef\}/);
});

test("original xyshz asset remains available as the static rigging source", async () => {
  const gltf = await readGlbJson(path.resolve("public/models/xyshz.glb"));
  const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name).filter(Boolean));

  assert.equal((gltf.animations ?? []).length, 0);
  assert.ok(nodeNames.has("RootNode"));
  assert.ok(nodeNames.has("tripo_node_bf7a4596"));
});
