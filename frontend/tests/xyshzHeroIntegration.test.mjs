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

  assert.match(modelsBlock, /heroChar:\s*"\/models\/xyshz_rigged\.glb\?v=6"/);
  assert.match(modelsBlock, /guardianChar:\s*"\/models\/xy_char_protagonist\.glb\?v=2"/);
  assert.match(source, /type CharKind = "hero" \| "guardian" \| "pocoyo" \| "avatar"/);
  assert.match(source, /const CHAR_ORDER: CharKind\[\] = \["hero", "guardian", "pocoyo", "avatar"\]/);
  assert.match(source, /if \(v === "hero" \|\| v === "guardian" \|\| v === "pocoyo" \|\| v === "avatar"\) return v;/);
});

test("xyshz hero connects its complete rigged GLB action library through drei useAnimations", async () => {
  const source = await readExploreSource();
  const heroBlock = sourceBlock(source, "function GltfHero", "function GltfGuardian");

  assert.match(heroBlock, /const \{ scene, animations \} = useGLTF\(MODELS\.heroChar\)/);
  assert.match(heroBlock, /useAnimations\(animations, ref\)/);
  assert.match(heroBlock, /actionRef\?: React\.RefObject<CharacterActionClip>/);
  assert.match(source, /const XYSHZ_ACTION_CLIPS = \["Idle", "WalkLoop", "RunLoop", "Jump", "Wave", "Flute", "Sit", "Cheer"\] as const/);
  assert.match(source, /function isXyshzActionClip\(clip: CharacterActionClip\): clip is \(typeof XYSHZ_ACTION_CLIPS\)\[number\]/);
  assert.match(heroBlock, /isXyshzActionClip\(requested\) && actions\[requested\] \? requested : "Idle"/);
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

  assert.match(source, /const PLAYER_SPEED = 10\.4/);
  assert.match(source, /const XYSHZ_RUN_HOLD_SECONDS = 0\.45/);
  assert.match(source, /const XYSHZ_RUN_TIMESCALE = 1\.18/);
  assert.match(heroBlock, /const looped = next === "Idle" \|\| next === "RunLoop" \|\| next === "WalkLoop"/);
  assert.match(heroBlock, /nextAction\.clampWhenFinished = !looped/);
  assert.match(heroBlock, /nextAction\.timeScale = next === "RunLoop" \? XYSHZ_RUN_TIMESCALE : next === "WalkLoop" \? XYSHZ_WALK_TIMESCALE : 1/);
  assert.match(playerBlock, /moveHoldT\.current \+= moving \? dt : -dt \* 2/);
  assert.match(playerBlock, /smoothstep01\(XYSHZ_RUN_HOLD_SECONDS, XYSHZ_RUN_HOLD_SECONDS \+ 0\.3, moveHoldT\.current\)/);
  assert.match(playerBlock, /const moveSpeed = PLAYER_SPEED \* \(1 \+ runBlend \* 0\.35\)/);
  assert.match(playerBlock, /stepT\.current = wading \? 0\.56 - runBlend \* 0\.07 : 0\.52 - runBlend \* 0\.08/);
  assert.match(playerBlock, /running: character === "hero" && moveHoldT\.current >= XYSHZ_RUN_HOLD_SECONDS/);
  assert.match(playerBlock, /character === "hero" && characterActionRef\.current !== "Idle"/);
});

test("xyshz one-shot clips are driven by existing gameplay timers", async () => {
  const source = await readExploreSource();
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");

  assert.match(playerBlock, /if \(input\.wave\) \{ waveT\.current = 1\.5; input\.wave = false; \}/);
  assert.match(playerBlock, /if \(input\.flute\) \{ fluteT\.current = FLUTE_DUR; fluteNote\.current = 0; input\.flute = false; \}/);
  assert.match(playerBlock, /if \(cc !== prevCheer\.current\) \{ cheerT\.current = 0\.85; prevCheer\.current = cc; \}/);
  assert.match(playerBlock, /waveT\.current = Math\.max\(0, waveT\.current - dt\)/);
  assert.match(playerBlock, /cheerT\.current = Math\.max\(0, cheerT\.current - dt\)/);
  assert.match(playerBlock, /fluteT\.current = Math\.max\(0, fluteT\.current - dt\)/);
  assert.match(playerBlock, /cheerActive: cheerT\.current > 0/);
  assert.match(playerBlock, /waveActive: waveT\.current > 0/);
  assert.match(playerBlock, /fluteActive: fluteT\.current > 0/);
});

test("xyshz hero corrects the source model's +X front to the player's +Z movement direction", async () => {
  const source = await readExploreSource();
  const heroBlock = sourceBlock(source, "function GltfHero", "function GltfGuardian");

  assert.match(source, /const XYSHZ_MODEL_ROTATION:[^=]+= \[0, -Math\.PI \/ 2, 0\]/);
  assert.match(heroBlock, /rotation=\{XYSHZ_MODEL_ROTATION\}/);
});

test("xyshz hero does not layer manual limb overrides over authored GLB clips", async () => {
  const source = await readExploreSource();
  const heroBlock = sourceBlock(source, "function GltfHero", "function GltfGuardian");

  assert.doesNotMatch(heroBlock, /heroWalkBones/);
  assert.doesNotMatch(heroBlock, /walkBlend/);
  assert.doesNotMatch(heroBlock, /getObjectByName\("UpperArmL"\)/);
  assert.doesNotMatch(heroBlock, /root\.position\.y\s*=/);
  assert.doesNotMatch(
    heroBlock,
    /(?:UpperArmL|UpperArmR|ForeArmL|ForeArmR|HandL|HandR|UpperLegL|UpperLegR|LowerLegL|LowerLegR|FootL|FootR)[\s\S]*rotation\.[xyz]\s*\+=/,
  );
});

test("xyshz hero speeds up WalkLoop so held movement reads as walking", async () => {
  const source = await readExploreSource();
  const heroBlock = sourceBlock(source, "function GltfHero", "function GltfGuardian");

  assert.match(source, /const XYSHZ_WALK_TIMESCALE = 1\.22/);
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
  assert.match(playerBlock, /const glbClipActive = \(character === "guardian" && characterActionRef\.current !== "Idle"\) \|\| \(character === "hero" && characterActionRef\.current !== "Idle"\)/);
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
