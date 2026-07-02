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
  assert.match(source, /const XYSHZ_RUN_HOLD_SECONDS = 0\.82/);
  assert.match(source, /const XYSHZ_RUN_BLEND_SECONDS = 0\.28/);
  assert.match(source, /const XYSHZ_RUN_INPUT_THRESHOLD = 0\.72/);
  assert.match(source, /const XYSHZ_WALK_SPEED_FACTOR = 0\.74/);
  assert.match(source, /const XYSHZ_RUN_SPEED_FACTOR = 1\.18/);
  assert.match(source, /const XYSHZ_RUN_TIMESCALE = 1\.16/);
  assert.match(source, /const XYSHZ_RUN_BODY_BOB_BOOST = 0\.44/);
  assert.match(source, /const XYSHZ_RUN_FORWARD_LEAN = 0\.085/);
  assert.match(source, /const XYSHZ_RUN_BODY_SWAY_BOOST = 0\.045/);
  assert.match(source, /const XYSHZ_RUN_STEP_INTERVAL_DROP = 0\.13/);
  assert.match(source, /const XYSHZ_RUN_PHASE_BOOST = 0\.28/);
  assert.match(heroBlock, /const looped = next === "Idle" \|\| next === "RunLoop" \|\| next === "WalkLoop"/);
  assert.match(heroBlock, /nextAction\.clampWhenFinished = !looped/);
  assert.match(heroBlock, /nextAction\.timeScale = next === "RunLoop" \? XYSHZ_RUN_TIMESCALE : next === "WalkLoop" \? XYSHZ_WALK_TIMESCALE : 1/);
  assert.match(playerBlock, /const inputStrength = Math\.min\(1, Math\.hypot\(input\.x, input\.y\)\)/);
  assert.match(playerBlock, /const runIntent = moving && inputStrength >= XYSHZ_RUN_INPUT_THRESHOLD/);
  assert.match(playerBlock, /moveHoldT\.current \+= runIntent \? dt : -dt \* 2\.4/);
  assert.match(playerBlock, /smoothstep01\(XYSHZ_RUN_HOLD_SECONDS, XYSHZ_RUN_HOLD_SECONDS \+ XYSHZ_RUN_BLEND_SECONDS, moveHoldT\.current\)/);
  assert.match(playerBlock, /const heroMoveSpeedFactor = character === "hero" \? XYSHZ_WALK_SPEED_FACTOR \+ runBlend \* \(XYSHZ_RUN_SPEED_FACTOR - XYSHZ_WALK_SPEED_FACTOR\) : 1/);
  assert.match(playerBlock, /const moveSpeed = PLAYER_SPEED \* heroMoveSpeedFactor/);
  assert.match(playerBlock, /walkPhase\.current \+= dt \* speedMag \* \(0\.9 \+ walkBlend \* XYSHZ_WALK_PHASE_BOOST \+ runBlend \* XYSHZ_RUN_PHASE_BOOST\)/);
  assert.match(playerBlock, /stepT\.current = wading \? 0\.56 - runBlend \* XYSHZ_RUN_STEP_INTERVAL_DROP : 0\.52 - runBlend \* XYSHZ_RUN_STEP_INTERVAL_DROP/);
  assert.match(playerBlock, /running: character === "hero" && runBlend >= 0\.5/);
  assert.match(playerBlock, /character === "hero" && characterActionRef\.current !== "Idle"/);
});

test("xyshz one-shot clips are driven by existing gameplay timers", async () => {
  const source = await readExploreSource();
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");

  assert.match(playerBlock, /if \(input\.wave\) \{ waveT\.current = WAVE_SECONDS; moveHoldT\.current = 0; input\.wave = false; \}/);
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

test("xyshz hero layers body proportion and outfit detail polish", async () => {
  const source = await readExploreSource();
  const detailBlock = sourceBlock(source, "function XyshzHeroBodyDetails", "function GltfHero");
  const heroBlock = sourceBlock(source, "function GltfHero", "function GltfGuardian");

  assert.match(source, /const XYSHZ_MODEL_BODY_SCALE:[^=]+= \[XYSHZ_MODEL_SCALE \* 1\.045, XYSHZ_MODEL_SCALE, XYSHZ_MODEL_SCALE \* 1\.02\]/);
  assert.match(source, /const XYSHZ_OUTFIT_BACK_Z = -0\.17/);
  assert.match(detailBlock, /name="XYSHZ_BackCoatSeam"/);
  assert.match(detailBlock, /name="XYSHZ_WaistSash"/);
  assert.match(detailBlock, /name="XYSHZ_RobeHemTrim"/);
  assert.match(detailBlock, /name="XYSHZ_CollarHighlight"/);
  assert.match(heroBlock, /scale=\{XYSHZ_MODEL_BODY_SCALE\}/);
  assert.match(heroBlock, /<XyshzHeroBodyDetails \/>/);
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
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");

  assert.match(source, /const XYSHZ_WALK_TIMESCALE = 1\.3/);
  assert.match(source, /const XYSHZ_WALK_PHASE_BOOST = 0\.26/);
  assert.match(source, /const XYSHZ_WALK_BODY_BOB_HEIGHT = 0\.165/);
  assert.match(source, /const XYSHZ_WALK_BODY_BOB_BOOST = 0\.52/);
  assert.match(source, /const XYSHZ_WALK_FORWARD_LEAN = 0\.04/);
  assert.match(source, /const XYSHZ_WALK_STEP_PITCH_BOOST = 0\.052/);
  assert.match(source, /const XYSHZ_WALK_BODY_SWAY_BOOST = 0\.085/);
  assert.match(heroBlock, /nextAction\.timeScale = next === "RunLoop" \? XYSHZ_RUN_TIMESCALE : next === "WalkLoop" \? XYSHZ_WALK_TIMESCALE : 1/);
  assert.match(playerBlock, /const walkBlend = character === "hero" \? gait \* \(1 - runBlend\) : 0/);
  assert.match(playerBlock, /walkPhase\.current \+= dt \* speedMag \* \(0\.9 \+ walkBlend \* XYSHZ_WALK_PHASE_BOOST \+ runBlend \* XYSHZ_RUN_PHASE_BOOST\)/);
});

test("xyshz hero softens authored GLB action transitions per clip", async () => {
  const source = await readExploreSource();
  const heroBlock = sourceBlock(source, "function GltfHero", "function GltfGuardian");

  assert.match(source, /const XYSHZ_LOCOMOTION_SWITCH_FADE = 0\.18/);
  assert.match(source, /const XYSHZ_JUMP_RECOVERY_FADE = 0\.24/);
  assert.match(source, /const XYSHZ_ACTION_FADE_IN: Record<\(typeof XYSHZ_ACTION_CLIPS\)\[number\], number>/);
  assert.match(source, /const XYSHZ_ACTION_FADE_OUT: Record<\(typeof XYSHZ_ACTION_CLIPS\)\[number\], number>/);
  assert.match(source, /function getXyshzActionFadeIn\(clip: \(typeof XYSHZ_ACTION_CLIPS\)\[number\]\)/);
  assert.match(source, /function getXyshzActionFadeOut\(from: \(typeof XYSHZ_ACTION_CLIPS\)\[number\] \| "", to: \(typeof XYSHZ_ACTION_CLIPS\)\[number\]\)/);
  assert.match(source, /return XYSHZ_LOCOMOTION_SWITCH_FADE/);
  assert.match(source, /return XYSHZ_JUMP_RECOVERY_FADE/);
  assert.match(heroBlock, /activeAction\.current\?\.fadeOut\(getXyshzActionFadeOut\(activeClip\.current, next\)\)/);
  assert.match(heroBlock, /nextAction\.zeroSlopeAtStart = true/);
  assert.match(heroBlock, /nextAction\.zeroSlopeAtEnd = true/);
  assert.match(heroBlock, /nextAction\.fadeIn\(getXyshzActionFadeIn\(next\)\)\.play\(\)/);
});

test("xyshz hero treats Wave as a stationary greeting instead of sliding while moving", async () => {
  const source = await readExploreSource();
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");

  assert.match(source, /const WAVE_SECONDS = 1\.35/);
  assert.match(source, /const WAVE_MOVE_LOCK_SECONDS = 0\.86/);
  assert.match(playerBlock, /if \(input\.wave\) \{\s*waveT\.current = WAVE_SECONDS;\s*moveHoldT\.current = 0;\s*input\.wave = false;\s*\}/);
  assert.match(source, /const XYSHZ_MOVE_INPUT_DEADZONE = 0\.08/);
  assert.match(playerBlock, /const inputStrength = Math\.min\(1, Math\.hypot\(input\.x, input\.y\)\)/);
  assert.match(playerBlock, /const wantsMove = inputStrength > XYSHZ_MOVE_INPUT_DEADZONE/);
  assert.match(playerBlock, /const greetingMoveLocked = character === "hero" && waveT\.current > WAVE_SECONDS - WAVE_MOVE_LOCK_SECONDS && !airborne\.current/);
  assert.match(playerBlock, /const moving = wantsMove && !greetingMoveLocked/);
  assert.match(playerBlock, /const tvx = moving \? _move\.x \* moveSpeed : 0/);
  assert.match(playerBlock, /const tvz = moving \? _move\.z \* moveSpeed : 0/);
});

test("xyshz hero keeps turns planted instead of banking like a vehicle", async () => {
  const source = await readExploreSource();
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");

  assert.match(source, /const XYSHZ_HERO_TURN_BANK_DAMPING = 0\.55/);
  assert.match(source, /const XYSHZ_HERO_MAX_TURN_BANK = 0\.11/);
  assert.match(playerBlock, /const bankLimit = character === "hero" \? XYSHZ_HERO_MAX_TURN_BANK : 0\.2/);
  assert.match(playerBlock, /const bankDamping = character === "hero" \? XYSHZ_HERO_TURN_BANK_DAMPING : 1/);
  assert.match(playerBlock, /const bank = Math\.max\(-bankLimit, Math\.min\(bankLimit, dy \* 0\.5 \* bankDamping\)\)/);
});

test("xyshz hero keeps the jump clip through a short landing recovery", async () => {
  const source = await readExploreSource();
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");

  assert.match(source, /const XYSHZ_LAND_ACTION_SECONDS = 0\.18/);
  assert.match(playerBlock, /const landT = useRef\(0\)/);
  assert.match(playerBlock, /landT\.current = 0/);
  assert.match(playerBlock, /landT\.current = XYSHZ_LAND_ACTION_SECONDS/);
  assert.match(playerBlock, /landT\.current = Math\.max\(0, landT\.current - dt\)/);
  assert.match(playerBlock, /landingActive: landT\.current > 0/);
});

test("xyshz hero keeps visible body bob while walking with GLB clips", async () => {
  const source = await readExploreSource();
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");

  assert.match(playerBlock, /const locomotionClipActive = characterActionRef\.current === "WalkLoop" \|\| characterActionRef\.current === "RunLoop"/);
  assert.match(playerBlock, /const bob = airborne\.current \|\| landT\.current > 0 \? 0 : Math\.abs\(Math\.sin\(walkPhase\.current\)\) \* XYSHZ_WALK_BODY_BOB_HEIGHT \* gait/);
  assert.match(playerBlock, /const locomotionBodyBobFactor = XYSHZ_GLTF_LOCOMOTION_BOB_FACTOR \+ walkBlend \* XYSHZ_WALK_BODY_BOB_BOOST \+ runBlend \* XYSHZ_RUN_BODY_BOB_BOOST/);
  assert.match(playerBlock, /const bodyBob = glbClipActive && locomotionClipActive \? bob \* locomotionBodyBobFactor \* rootMotionDamping : glbClipActive \? 0 : bob/);
  assert.match(playerBlock, /pos\.y \+ bodyBob \+ \(glbClipActive \? 0 : breathe \+ greetBob \+ fluteBob - sit\.current \* 0\.34\)/);
  assert.match(playerBlock, /const walkLean = walkBlend \* XYSHZ_WALK_FORWARD_LEAN/);
  assert.match(playerBlock, /const runLean = runBlend \* XYSHZ_RUN_FORWARD_LEAN/);
  assert.match(playerBlock, /const stepPitch = Math\.sin\(walkPhase\.current \* 2\) \* \(0\.044 \+ walkBlend \* XYSHZ_WALK_STEP_PITCH_BOOST\) \* gait \* rootMotionDamping/);
  assert.match(playerBlock, /\(0\.12 \* gait \+ walkLean \+ runLean\) \* rootMotionDamping \+ stepPitch/);
  assert.match(playerBlock, /const sway = Math\.sin\(walkPhase\.current\) \* \(0\.088 \+ walkBlend \* XYSHZ_WALK_BODY_SWAY_BOOST \+ runBlend \* XYSHZ_RUN_BODY_SWAY_BOOST\) \* gait \* rootMotionDamping/);
});

test("xyshz hero damps root shake and vertical camera follow over authored movement clips", async () => {
  const source = await readExploreSource();
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");

  assert.match(source, /const XYSHZ_HERO_LOCOMOTION_ROOT_DAMPING = 0\.42/);
  assert.match(source, /const XYSHZ_HERO_JUMP_ROOT_DAMPING = 0\.34/);
  assert.match(source, /const XYSHZ_HERO_LANDING_SQUASH_DAMPING = 0\.45/);
  assert.match(source, /const XYSHZ_CAMERA_VERTICAL_GROUND_LERP = 8/);
  assert.match(source, /const XYSHZ_CAMERA_VERTICAL_JUMP_LERP = 3\.2/);
  assert.match(playerBlock, /const camFollowY = useRef\(0\)/);
  assert.match(playerBlock, /const camFollowYReady = useRef\(false\)/);
  assert.match(playerBlock, /const rootMotionDamping = character === "hero" \? \(airborne\.current \|\| landT\.current > 0 \? XYSHZ_HERO_JUMP_ROOT_DAMPING : locomotionClipActive \? XYSHZ_HERO_LOCOMOTION_ROOT_DAMPING : 1\) : 1/);
  assert.match(playerBlock, /const bodyBob = glbClipActive && locomotionClipActive \? bob \* locomotionBodyBobFactor \* rootMotionDamping : glbClipActive \? 0 : bob/);
  assert.match(playerBlock, /const landingSquashDamping = character === "hero" \? XYSHZ_HERO_LANDING_SQUASH_DAMPING : 1/);
  assert.match(playerBlock, /- sq\.current \* 0\.12 \* landingSquashDamping/);
  assert.match(playerBlock, /const cameraY = camFollowY\.current/);
  assert.match(playerBlock, /pos\.x - Math\.sin\(ang\) \* dist, cameraY \+ ht/);
  assert.match(playerBlock, /pos\.x \+ Math\.sin\(ry\) \* HEALING_WALK_CAMERA\.lookAhead,\s*cameraY \+ HEALING_WALK_CAMERA\.lookHeight/);
});

test("xyshz hero leaves the far arrival camera as soon as walking starts", async () => {
  const source = await readExploreSource();
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");

  assert.match(playerBlock, /const introCameraActive = introT\.current < 1/);
  assert.match(playerBlock, /const cameraDt = introCameraActive \? Math\.min\(dt, HEALING_WALK_CAMERA\.introMaxDelta\) : dt/);
  assert.match(playerBlock, /const walkingStartedDuringIntro = moving && introCameraActive/);
  assert.match(playerBlock, /if \(walkingStartedDuringIntro\) introT\.current = 1/);
  assert.match(playerBlock, /if \(walkingStartedDuringIntro\) camera\.position\.copy\(_camTarget\)/);
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

test("dress preview renders the currently selected playable character", async () => {
  const source = await readExploreSource();
  const previewBlock = sourceBlock(source, "function AvatarPreview", "type VillagerMaterialName");
  const dressBlock = sourceBlock(source, "换装面板:", "<SwatchRow label=\"肤色\"");

  assert.match(previewBlock, /function AvatarPreview\(\{ avatar, character \}: \{ avatar: Avatar; character: CharKind \}\)/);
  assert.match(previewBlock, /character === "hero" \? \(/);
  assert.match(previewBlock, /<GltfHero \/>/);
  assert.match(previewBlock, /character === "guardian" \? \(/);
  assert.match(previewBlock, /<GltfGuardian \/>/);
  assert.match(previewBlock, /character === "pocoyo" \? \(/);
  assert.match(previewBlock, /<GltfPocoyo \/>/);
  assert.match(previewBlock, /<CharacterModel avatar=\{avatar\} \/>/);
  assert.match(dressBlock, /<AvatarPreview avatar=\{avatar\} character=\{character\} \/>/);
});

test("original xyshz asset remains available as the static rigging source", async () => {
  const gltf = await readGlbJson(path.resolve("public/models/xyshz.glb"));
  const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name).filter(Boolean));

  assert.equal((gltf.animations ?? []).length, 0);
  assert.ok(nodeNames.has("RootNode"));
  assert.ok(nodeNames.has("tripo_node_bf7a4596"));
});
