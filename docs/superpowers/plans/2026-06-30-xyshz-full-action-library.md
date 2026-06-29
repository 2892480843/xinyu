# XYSHZ Full Action Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, natural GLB action library for the `xyshz` protagonist and route every common player action to a dedicated clip.

**Architecture:** Blender remains the source of truth for `xyshz` bone animation. `blender/xyshz_rigged_walk.py` exports one skinned GLB with named NLA tracks, while `GltfHero` becomes a generic clip player for the `xyshz` action set. `Player` continues to own physics, input, position, audio, and props, but no longer drives `xyshz` limbs procedurally when a GLB clip is active.

**Tech Stack:** Blender Python, Three.js GLTF animation, React Three Fiber, Drei `useAnimations`, Node test runner, Vite/TypeScript.

---

## File Structure

- Modify `frontend/src/lib/protagonistAction.ts`: add `Cheer` and `cheerActive`, keep deterministic action priority.
- Modify `frontend/tests/protagonistActionSelector.test.mjs`: red/green coverage for `Cheer` and full priority.
- Modify `frontend/tests/xyshzRiggedWalk.test.mjs`: require full clip library and measure natural movement ranges.
- Modify `blender/xyshz_rigged_walk.py`: generate `Jump`, `Wave`, `Flute`, `Sit`, and `Cheer` clips on the existing rig.
- Regenerate `frontend/public/models/xyshz_rigged.glb`: exported GLB containing all clips.
- Modify `frontend/tests/xyshzHeroIntegration.test.mjs`: route `xyshz` actions to the full GLB clip set.
- Modify `frontend/src/components/ExploreMode.tsx`: make `GltfHero` play all clips, remove walk-only overlay reliance, and route `cheerT` to `Cheer`.

## Task 1: Add Full Action State To The Selector

**Files:**
- Modify: `frontend/tests/protagonistActionSelector.test.mjs`
- Modify: `frontend/src/lib/protagonistAction.ts`

- [ ] **Step 1: Write the failing selector tests**

Replace the two test bodies in `frontend/tests/protagonistActionSelector.test.mjs` with:

```js
test("selectCharacterAction maps movement states to shared character clips", async () => {
  const { selectCharacterAction } = await importProtagonistAction();

  const base = { moving: false, running: false, airborne: false, cheerActive: false, waveActive: false, fluteActive: false, sitAmount: 0 };
  assert.equal(selectCharacterAction(base), "Idle");
  assert.equal(selectCharacterAction({ ...base, moving: true }), "WalkLoop");
  assert.equal(selectCharacterAction({ ...base, moving: true, running: true }), "RunLoop");
  assert.equal(selectCharacterAction({ ...base, sitAmount: 0.7 }), "Sit");
  assert.equal(selectCharacterAction({ ...base, waveActive: true }), "Wave");
  assert.equal(selectCharacterAction({ ...base, fluteActive: true }), "Flute");
  assert.equal(selectCharacterAction({ ...base, cheerActive: true }), "Cheer");
  assert.equal(selectCharacterAction({ ...base, airborne: true }), "Jump");
});

test("selectCharacterAction keeps expressive and physics-critical priorities stable", async () => {
  const { selectCharacterAction } = await importProtagonistAction();

  const busy = { moving: true, running: true, airborne: true, cheerActive: true, waveActive: true, fluteActive: true, sitAmount: 1 };
  assert.equal(selectCharacterAction(busy), "Jump");
  assert.equal(selectCharacterAction({ ...busy, airborne: false }), "Cheer");
  assert.equal(selectCharacterAction({ ...busy, airborne: false, cheerActive: false }), "Flute");
  assert.equal(selectCharacterAction({ ...busy, airborne: false, cheerActive: false, fluteActive: false }), "Wave");
  assert.equal(selectCharacterAction({ ...busy, airborne: false, cheerActive: false, fluteActive: false, waveActive: false }), "Sit");
  assert.equal(selectCharacterAction({ ...busy, airborne: false, cheerActive: false, fluteActive: false, waveActive: false, sitAmount: 0 }), "RunLoop");
});
```

- [ ] **Step 2: Run selector tests and verify red**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
node --test tests/protagonistActionSelector.test.mjs
```

Expected: FAIL because `Cheer` and `cheerActive` are not defined in `CharacterActionClip` / `CharacterActionState`.

- [ ] **Step 3: Implement the selector change**

Update `frontend/src/lib/protagonistAction.ts` to:

```ts
export type CharacterActionClip = "Idle" | "WalkLoop" | "RunLoop" | "Jump" | "Wave" | "Flute" | "Sit" | "Cheer";

interface CharacterActionState {
  moving: boolean;
  running?: boolean;
  airborne: boolean;
  cheerActive?: boolean;
  waveActive: boolean;
  fluteActive: boolean;
  sitAmount: number;
}

export function selectCharacterAction(state: CharacterActionState): CharacterActionClip {
  if (state.airborne) return "Jump";
  if (state.cheerActive) return "Cheer";
  if (state.fluteActive) return "Flute";
  if (state.waveActive) return "Wave";
  if (state.sitAmount > 0.55) return "Sit";
  if (state.moving && state.running) return "RunLoop";
  if (state.moving) return "WalkLoop";
  return "Idle";
}

export type HeroActionClip = CharacterActionClip;
export const selectHeroAction = selectCharacterAction;
```

- [ ] **Step 4: Run selector tests and verify green**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
node --test tests/protagonistActionSelector.test.mjs
```

Expected: PASS.

## Task 2: Add Red Tests For The Full GLB Clip Library

**Files:**
- Modify: `frontend/tests/xyshzRiggedWalk.test.mjs`

- [ ] **Step 1: Require the complete clip list**

In `xyshz rigged GLB exports the playable skeleton and walk clips`, change the clip loop to:

```js
for (const clip of ["Idle", "WalkLoop", "RunLoop", "Jump", "Wave", "Flute", "Sit", "Cheer"]) {
  assert.ok(clipNames.has(clip), `missing xyshz animation clip ${clip}`);
}
```

- [ ] **Step 2: Add helpers for pose sampling**

Add these helpers after `axisRange`:

```js
function getClip(gltf, name) {
  const clip = (gltf.animations ?? []).find((animation) => animation.name === name);
  assert.ok(clip, `missing ${name} animation`);
  return clip;
}

function rotationDeltaForClip(gltf, bin, clipName, nodeName) {
  const clip = getClip(gltf, clipName);
  const nodeIndex = gltf.nodes.findIndex((node) => node.name === nodeName);
  assert.notEqual(nodeIndex, -1, `missing node ${nodeName}`);
  const channel = clip.channels.find((candidate) => candidate.target.node === nodeIndex && candidate.target.path === "rotation");
  assert.ok(channel, `missing ${clipName}/${nodeName} rotation channel`);
  const values = accessorRows(gltf, bin, clip.samplers[channel.sampler].output);
  return maxRotationDeltaDegrees(values);
}
```

- [ ] **Step 3: Add naturalness tests for non-locomotion clips**

Add this test before the rig-axis test:

```js
test("xyshz expressive clips move the intended bones without locking the body", async () => {
  const { json: gltf, bin } = await readGlb(path.resolve("public/models/xyshz_rigged.glb"));

  const expectations = [
    ["Jump", "UpperLegL", 18, 70],
    ["Jump", "LowerLegR", 18, 90],
    ["Wave", "UpperArmL", 35, 120],
    ["Wave", "ForeArmL", 30, 120],
    ["Flute", "UpperArmL", 30, 115],
    ["Flute", "UpperArmR", 30, 115],
    ["Sit", "UpperLegL", 35, 115],
    ["Sit", "UpperLegR", 35, 115],
    ["Cheer", "UpperArmL", 35, 130],
    ["Cheer", "UpperArmR", 35, 130],
  ];

  for (const [clipName, nodeName, minimum, maximum] of expectations) {
    const delta = rotationDeltaForClip(gltf, bin, clipName, nodeName);
    assert.ok(delta >= minimum, `${clipName}/${nodeName} rotates ${delta.toFixed(2)}deg; expected at least ${minimum}deg`);
    assert.ok(delta <= maximum, `${clipName}/${nodeName} rotates ${delta.toFixed(2)}deg; expected <= ${maximum}deg`);
  }
});
```

- [ ] **Step 4: Add world-position tests for flute and sit**

Add this test after the expressive clip test:

```js
test("xyshz flute and sit clips place hands and feet in believable ranges", async () => {
  const { THREE, gltf } = await loadRiggedGltfScene();

  function sampleNodes(clipName, nodeNames) {
    const clip = getClip(gltf, clipName);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(clip).play();
    const samples = Object.fromEntries(nodeNames.map((name) => [name, []]));
    for (let i = 0; i < 17; i += 1) {
      mixer.setTime(clip.duration * (i / 16));
      gltf.scene.updateMatrixWorld(true);
      for (const nodeName of nodeNames) {
        const node = gltf.scene.getObjectByName(nodeName);
        assert.ok(node, `missing ${nodeName}`);
        const pos = new THREE.Vector3();
        node.getWorldPosition(pos);
        samples[nodeName].push([pos.x, pos.y, pos.z]);
      }
    }
    return samples;
  }

  const flute = sampleNodes("Flute", ["HandL", "HandR"]);
  for (const handName of ["HandL", "HandR"]) {
    assert.ok(axisRange(flute[handName], 1) >= 1.0, `${handName} should lift visibly during Flute`);
    assert.ok(axisRange(flute[handName], 2) < 18, `${handName} should stay near the torso during Flute`);
  }

  const sit = sampleNodes("Sit", ["Hips", "FootL", "FootR"]);
  assert.ok(axisRange(sit.Hips, 1) >= 0.12, "Sit should lower and breathe through the hips");
  assert.ok(axisRange(sit.FootL, 2) < 6.5, "FootL should not slide sideways during Sit");
  assert.ok(axisRange(sit.FootR, 2) < 6.5, "FootR should not slide sideways during Sit");
});
```

- [ ] **Step 5: Run GLB tests and verify red**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
node --test tests/xyshzRiggedWalk.test.mjs
```

Expected: FAIL because `Jump`, `Wave`, `Flute`, `Sit`, and `Cheer` are missing from `xyshz_rigged.glb`.

## Task 3: Export Full Action Clips From Blender

**Files:**
- Modify: `blender/xyshz_rigged_walk.py`
- Regenerate: `frontend/public/models/xyshz_rigged.glb`

- [ ] **Step 1: Expand the declared clip list**

Update:

```py
CLIPS = ["Idle", "WalkLoop", "RunLoop", "Jump", "Wave", "Flute", "Sit", "Cheer"]
```

- [ ] **Step 2: Add reusable neutral and additive pose helpers**

Add this code after `add_idle`:

```py
def neutral_pose():
    return {
        "Hips": {"loc": (0.0, 0.0, 0.0), "rot": (0.0, 0.0, 0.0)},
        "Spine": {"rot": (0.0, 0.0, 0.0)},
        "Chest": {"rot": (0.0, 0.0, 0.0)},
        "Head": {"rot": (0.0, 0.0, 0.0)},
        "UpperLegL": {"rot": (0.0, 0.0, 0.0)},
        "LowerLegL": {"rot": (0.0, 0.0, r(2.0))},
        "FootL": {"rot": (0.0, 0.0, 0.0)},
        "UpperLegR": {"rot": (0.0, 0.0, 0.0)},
        "LowerLegR": {"rot": (0.0, 0.0, r(2.0))},
        "FootR": {"rot": (0.0, 0.0, 0.0)},
        "UpperArmL": {"rot": (0.0, 0.0, r(1.5))},
        "ForeArmL": {"rot": (0.0, 0.0, r(-4.0))},
        "HandL": {"rot": (0.0, 0.0, 0.0)},
        "UpperArmR": {"rot": (0.0, 0.0, r(-1.5))},
        "ForeArmR": {"rot": (0.0, 0.0, r(-4.0))},
        "HandR": {"rot": (0.0, 0.0, 0.0)},
    }


def pose(**updates):
    out = {name: dict(spec) for name, spec in neutral_pose().items()}
    for bone_name, spec in updates.items():
        merged = dict(out.get(bone_name, {}))
        merged.update(spec)
        out[bone_name] = merged
    return out
```

- [ ] **Step 3: Add hand-keyed expressive clips**

Add this code after `add_run_loop`:

```py
def add_jump(arm: bpy.types.Object) -> None:
    frames = [
        (1, pose()),
        (7, pose(
            Hips={"loc": (0.0, 0.0, -0.08)},
            Chest={"rot": (r(3.0), 0.0, 0.0)},
            UpperLegL={"rot": (0.0, 0.0, r(-18))},
            UpperLegR={"rot": (0.0, 0.0, r(-22))},
            LowerLegL={"rot": (0.0, 0.0, r(28))},
            LowerLegR={"rot": (0.0, 0.0, r(34))},
            UpperArmL={"rot": (0.0, 0.0, r(-18))},
            UpperArmR={"rot": (0.0, 0.0, r(18))},
        )),
        (15, pose(
            Hips={"loc": (0.0, 0.0, 0.30)},
            Chest={"rot": (r(-2.0), 0.0, 0.0)},
            UpperLegL={"rot": (0.0, 0.0, r(28))},
            UpperLegR={"rot": (0.0, 0.0, r(34))},
            LowerLegL={"rot": (0.0, 0.0, r(58))},
            LowerLegR={"rot": (0.0, 0.0, r(68))},
            FootL={"rot": (0.0, 0.0, r(-10))},
            FootR={"rot": (0.0, 0.0, r(-12))},
            UpperArmL={"rot": (0.0, 0.0, r(-34))},
            UpperArmR={"rot": (0.0, 0.0, r(34))},
            ForeArmL={"rot": (0.0, 0.0, r(-14))},
            ForeArmR={"rot": (0.0, 0.0, r(-14))},
        )),
        (25, pose(
            Hips={"loc": (0.0, 0.0, -0.05)},
            UpperLegL={"rot": (0.0, 0.0, r(-10))},
            UpperLegR={"rot": (0.0, 0.0, r(-12))},
            LowerLegL={"rot": (0.0, 0.0, r(24))},
            LowerLegR={"rot": (0.0, 0.0, r(28))},
        )),
        (33, pose()),
    ]
    keyed_pose_action(arm, "Jump", 33, frames)


def add_wave(arm: bpy.types.Object) -> None:
    frames = [
        (1, pose()),
        (10, pose(UpperArmL={"rot": (0.0, 0.0, r(-42))}, ForeArmL={"rot": (0.0, 0.0, r(-54))}, HandL={"rot": (0.0, r(8), r(10))})),
        (18, pose(UpperArmL={"rot": (0.0, 0.0, r(-52))}, ForeArmL={"rot": (0.0, 0.0, r(-88))}, HandL={"rot": (0.0, r(-16), r(-12))}, Chest={"rot": (r(1.0), 0.0, r(-2.0))})),
        (26, pose(UpperArmL={"rot": (0.0, 0.0, r(-48))}, ForeArmL={"rot": (0.0, 0.0, r(-62))}, HandL={"rot": (0.0, r(18), r(14))}, Chest={"rot": (r(0.8), 0.0, r(-1.5))})),
        (34, pose(UpperArmL={"rot": (0.0, 0.0, r(-52))}, ForeArmL={"rot": (0.0, 0.0, r(-88))}, HandL={"rot": (0.0, r(-14), r(-10))}, Chest={"rot": (r(1.0), 0.0, r(-2.0))})),
        (44, pose(UpperArmL={"rot": (0.0, 0.0, r(-20))}, ForeArmL={"rot": (0.0, 0.0, r(-22))})),
        (53, pose()),
    ]
    keyed_pose_action(arm, "Wave", 53, frames)


def add_flute(arm: bpy.types.Object) -> None:
    frames = [
        (1, pose()),
        (10, pose(Chest={"rot": (r(1.5), 0.0, 0.0)}, UpperArmL={"rot": (0.0, 0.0, r(-42))}, UpperArmR={"rot": (0.0, 0.0, r(42))}, ForeArmL={"rot": (0.0, 0.0, r(-64))}, ForeArmR={"rot": (0.0, 0.0, r(-64))})),
        (22, pose(Chest={"rot": (r(2.0), 0.0, r(1.0))}, Head={"rot": (r(-2.0), 0.0, 0.0)}, UpperArmL={"rot": (0.0, 0.0, r(-62))}, UpperArmR={"rot": (0.0, 0.0, r(62))}, ForeArmL={"rot": (0.0, 0.0, r(-92))}, ForeArmR={"rot": (0.0, 0.0, r(-92))}, HandL={"rot": (0.0, r(5), r(4))}, HandR={"rot": (0.0, r(-5), r(-4))})),
        (36, pose(Chest={"rot": (r(1.2), 0.0, r(-1.0))}, Head={"rot": (r(-1.5), 0.0, 0.0)}, UpperArmL={"rot": (0.0, 0.0, r(-60))}, UpperArmR={"rot": (0.0, 0.0, r(60))}, ForeArmL={"rot": (0.0, 0.0, r(-84))}, ForeArmR={"rot": (0.0, 0.0, r(-84))}, HandL={"rot": (0.0, r(-4), r(-3))}, HandR={"rot": (0.0, r(4), r(3))})),
        (49, pose()),
    ]
    keyed_pose_action(arm, "Flute", 49, frames)


def add_sit(arm: bpy.types.Object) -> None:
    frames = [
        (1, pose()),
        (14, pose(Hips={"loc": (0.0, 0.0, -0.16)}, Chest={"rot": (r(3.0), 0.0, 0.0)}, UpperLegL={"rot": (0.0, 0.0, r(42))}, UpperLegR={"rot": (0.0, 0.0, r(46))}, LowerLegL={"rot": (0.0, 0.0, r(42))}, LowerLegR={"rot": (0.0, 0.0, r(38))})),
        (28, pose(Hips={"loc": (0.0, 0.0, -0.34)}, Chest={"rot": (r(5.0), 0.0, r(1.0))}, UpperLegL={"rot": (0.0, 0.0, r(82))}, UpperLegR={"rot": (0.0, 0.0, r(88))}, LowerLegL={"rot": (0.0, 0.0, r(68))}, LowerLegR={"rot": (0.0, 0.0, r(62))}, UpperArmL={"rot": (0.0, 0.0, r(-18))}, UpperArmR={"rot": (0.0, 0.0, r(18))}, ForeArmL={"rot": (0.0, 0.0, r(-36))}, ForeArmR={"rot": (0.0, 0.0, r(-36))})),
        (43, pose(Hips={"loc": (0.0, 0.0, -0.30)}, Chest={"rot": (r(3.5), 0.0, r(-1.0))}, UpperLegL={"rot": (0.0, 0.0, r(78))}, UpperLegR={"rot": (0.0, 0.0, r(84))}, LowerLegL={"rot": (0.0, 0.0, r(64))}, LowerLegR={"rot": (0.0, 0.0, r(60))}, UpperArmL={"rot": (0.0, 0.0, r(-16))}, UpperArmR={"rot": (0.0, 0.0, r(16))}, ForeArmL={"rot": (0.0, 0.0, r(-34))}, ForeArmR={"rot": (0.0, 0.0, r(-34))})),
        (57, pose(Hips={"loc": (0.0, 0.0, -0.34)}, Chest={"rot": (r(5.0), 0.0, r(1.0))}, UpperLegL={"rot": (0.0, 0.0, r(82))}, UpperLegR={"rot": (0.0, 0.0, r(88))}, LowerLegL={"rot": (0.0, 0.0, r(68))}, LowerLegR={"rot": (0.0, 0.0, r(62))}, UpperArmL={"rot": (0.0, 0.0, r(-18))}, UpperArmR={"rot": (0.0, 0.0, r(18))}, ForeArmL={"rot": (0.0, 0.0, r(-36))}, ForeArmR={"rot": (0.0, 0.0, r(-36))})),
    ]
    keyed_pose_action(arm, "Sit", 57, frames)


def add_cheer(arm: bpy.types.Object) -> None:
    frames = [
        (1, pose()),
        (8, pose(Hips={"loc": (0.0, 0.0, -0.08)}, UpperLegL={"rot": (0.0, 0.0, r(-12))}, UpperLegR={"rot": (0.0, 0.0, r(-12))}, LowerLegL={"rot": (0.0, 0.0, r(24))}, LowerLegR={"rot": (0.0, 0.0, r(24))})),
        (17, pose(Hips={"loc": (0.0, 0.0, 0.20)}, Chest={"rot": (r(-2.0), 0.0, 0.0)}, UpperArmL={"rot": (0.0, 0.0, r(-86))}, UpperArmR={"rot": (0.0, 0.0, r(86))}, ForeArmL={"rot": (0.0, 0.0, r(-38))}, ForeArmR={"rot": (0.0, 0.0, r(-38))}, LowerLegL={"rot": (0.0, 0.0, r(32))}, LowerLegR={"rot": (0.0, 0.0, r(32))})),
        (29, pose(Hips={"loc": (0.0, 0.0, -0.04)}, UpperArmL={"rot": (0.0, 0.0, r(-38))}, UpperArmR={"rot": (0.0, 0.0, r(38))}, ForeArmL={"rot": (0.0, 0.0, r(-18))}, ForeArmR={"rot": (0.0, 0.0, r(-18))})),
        (37, pose()),
    ]
    keyed_pose_action(arm, "Cheer", 37, frames)
```

- [ ] **Step 4: Register the new clip exporters**

In `main()`, after `add_run_loop(arm)`, add:

```py
    add_jump(arm)
    add_wave(arm)
    add_flute(arm)
    add_sit(arm)
    add_cheer(arm)
```

- [ ] **Step 5: Re-export the GLB**

Run:

```bash
cd /Users/a111/chen/code/心屿
blender --background --python blender/xyshz_rigged_walk.py
```

Expected: exit 0 and `Exported /Users/a111/chen/code/心屿/frontend/public/models/xyshz_rigged.glb`.

- [ ] **Step 6: Run GLB tests and verify green**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
node --test tests/xyshzRiggedWalk.test.mjs
```

Expected: PASS. If a movement threshold fails, adjust only the relevant keyframe values in `blender/xyshz_rigged_walk.py`, re-export, and rerun this exact test.

## Task 4: Route The Full Clip Set Through GltfHero

**Files:**
- Modify: `frontend/tests/xyshzHeroIntegration.test.mjs`
- Modify: `frontend/src/components/ExploreMode.tsx`

- [ ] **Step 1: Replace the old walk-only overlay test**

In `frontend/tests/xyshzHeroIntegration.test.mjs`, replace `xyshz hero applies only a conservative in-game walk overlay over the GLB clip` with:

```js
test("xyshz hero plays the full action library through GLB clips", async () => {
  const source = await readExploreSource();
  const heroBlock = sourceBlock(source, "function GltfHero", "function GltfGuardian");

  assert.match(source, /const XYSHZ_ACTION_CLIPS = \["Idle", "WalkLoop", "RunLoop", "Jump", "Wave", "Flute", "Sit", "Cheer"\] as const/);
  assert.match(heroBlock, /XYSHZ_ACTION_CLIPS\.includes\(requested\)/);
  assert.match(heroBlock, /const looped = XYSHZ_LOOPED_ACTIONS\.has\(next\)/);
  assert.match(heroBlock, /nextAction\.timeScale = XYSHZ_ACTION_TIMESCALE\[next\] \?\? 1/);
  assert.match(heroBlock, /nextAction\.fadeIn\(XYSHZ_ACTION_FADE\[next\] \?\? 0\.12\)\.play\(\)/);
  assert.doesNotMatch(heroBlock, /heroWalkBones/);
  assert.doesNotMatch(heroBlock, /bones\.(?:UpperArmL|ForeArmL|UpperArmR|ForeArmR)/);
});
```

- [ ] **Step 2: Update routing expectations**

In the same test file:

```js
assert.match(source, /const XYSHZ_ACTION_CLIPS = \["Idle", "WalkLoop", "RunLoop", "Jump", "Wave", "Flute", "Sit", "Cheer"\] as const/);
assert.match(playerBlock, /character === "hero" && characterActionRef\.current !== "Idle"/);
assert.match(playerBlock, /cheerActive: cheerT\.current > 0/);
```

Keep existing checks for `useAnimations`, `LoopRepeat`, `LoopOnce`, model scale, foot offset, and rotation.

- [ ] **Step 3: Run integration test and verify red**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
node --test tests/xyshzHeroIntegration.test.mjs
```

Expected: FAIL because `GltfHero` still whitelists only `WalkLoop` and `RunLoop`, and it still contains `heroWalkBones` overlay code.

- [ ] **Step 4: Implement generic `GltfHero` clip playback**

In `frontend/src/components/ExploreMode.tsx`, replace the `XYSHZ_WALK_*` / `XYSHZ_RUN_*` playback constants around the hero section with:

```ts
const XYSHZ_ACTION_CLIPS = ["Idle", "WalkLoop", "RunLoop", "Jump", "Wave", "Flute", "Sit", "Cheer"] as const;
const XYSHZ_LOOPED_ACTIONS = new Set<CharacterActionClip>(["Idle", "WalkLoop", "RunLoop", "Sit"]);
const XYSHZ_ACTION_TIMESCALE: Partial<Record<CharacterActionClip, number>> = {
  WalkLoop: 1.55,
  RunLoop: 1.18,
  Jump: 1.08,
  Wave: 1.0,
  Flute: 1.0,
  Sit: 0.9,
  Cheer: 1.05,
};
const XYSHZ_ACTION_FADE: Partial<Record<CharacterActionClip, number>> = {
  Idle: 0.16,
  WalkLoop: 0.18,
  RunLoop: 0.12,
  Jump: 0.08,
  Wave: 0.12,
  Flute: 0.14,
  Sit: 0.2,
  Cheer: 0.08,
};
const XYSHZ_RUN_HOLD_SECONDS = 0.55;
```

Then replace `GltfHero` with:

```tsx
function GltfHero({ actionRef }: { actionRef?: React.RefObject<CharacterActionClip> }) {
  const { scene, animations } = useGLTF(MODELS.heroChar);
  const ref = useRef<THREE.Group>(null);
  const obj = useMemo(() => {
    const root = cloneSkeleton(scene);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.receiveShadow = false;
        m.frustumCulled = false;
      }
    });
    return root;
  }, [scene]);
  const { actions, mixer } = useAnimations(animations, ref);
  const activeClip = useRef<CharacterActionClip | "">("");
  const activeAction = useRef<THREE.AnimationAction | null>(null);

  useFrame(() => {
    const requested = actionRef?.current ?? "Idle";
    const next = XYSHZ_ACTION_CLIPS.includes(requested as (typeof XYSHZ_ACTION_CLIPS)[number]) && actions[requested] ? requested : "Idle";
    if (next === activeClip.current) return;

    activeAction.current?.fadeOut(XYSHZ_ACTION_FADE[next] ?? 0.12);
    const nextAction = actions[next];
    if (nextAction) {
      nextAction.reset();
      nextAction.clampWhenFinished = !XYSHZ_LOOPED_ACTIONS.has(next);
      nextAction.timeScale = XYSHZ_ACTION_TIMESCALE[next] ?? 1;
      const looped = XYSHZ_LOOPED_ACTIONS.has(next);
      nextAction.setLoop(looped ? THREE.LoopRepeat : THREE.LoopOnce, looped ? Infinity : 1);
      nextAction.fadeIn(XYSHZ_ACTION_FADE[next] ?? 0.12).play();
    }
    activeAction.current = nextAction ?? null;
    activeClip.current = next;
  });

  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);
  return (
    <group ref={ref}>
      <primitive
        object={obj}
        scale={XYSHZ_MODEL_SCALE}
        rotation={XYSHZ_MODEL_ROTATION}
        position={[0, XYSHZ_FOOT_OFFSET_Y, 0]}
      />
    </group>
  );
}
```

- [ ] **Step 5: Route `Cheer` and all hero GLB clips in Player**

In the `selectCharacterAction` call, add:

```ts
      cheerActive: cheerT.current > 0,
```

Change:

```ts
const glbClipActive = (character === "guardian" && characterActionRef.current !== "Idle") || (character === "hero" && (characterActionRef.current === "WalkLoop" || characterActionRef.current === "RunLoop"));
```

to:

```ts
const glbClipActive = (character === "guardian" && characterActionRef.current !== "Idle") || (character === "hero" && characterActionRef.current !== "Idle");
```

- [ ] **Step 6: Run integration tests and verify green**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
node --test tests/xyshzHeroIntegration.test.mjs tests/protagonistActionSelector.test.mjs tests/protagonistActions.test.mjs
```

Expected: PASS. Update only tests that still assert the old walk-only routing.

## Task 5: Verify Interaction Timing In The Game State

**Files:**
- Modify: `frontend/tests/xyshzHeroIntegration.test.mjs`
- Modify: `frontend/src/components/ExploreMode.tsx`

- [ ] **Step 1: Add a source test for one-shot action durations**

Append this test to `frontend/tests/xyshzHeroIntegration.test.mjs`:

```js
test("xyshz one-shot clips are driven by existing gameplay timers", async () => {
  const source = await readExploreSource();
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");

  assert.match(playerBlock, /if \(input\.wave\) \{ waveT\.current = 1\.5; input\.wave = false; \}/);
  assert.match(playerBlock, /if \(input\.flute\) \{ fluteT\.current = FLUTE_DUR; fluteNote\.current = 0; input\.flute = false; \}/);
  assert.match(playerBlock, /if \(cc !== prevCheer\.current\) \{ cheerT\.current = 0\.85; prevCheer\.current = cc; \}/);
  assert.match(playerBlock, /cheerActive: cheerT\.current > 0/);
});
```

- [ ] **Step 2: Run and verify**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
node --test tests/xyshzHeroIntegration.test.mjs
```

Expected: PASS after Task 4.

## Task 6: Full Verification And Visual Review

**Files:**
- Verify only unless a visual issue is found.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
node --test tests/protagonistActionSelector.test.mjs tests/xyshzRiggedWalk.test.mjs tests/xyshzHeroIntegration.test.mjs tests/protagonistActions.test.mjs
```

Expected: all listed tests PASS.

- [ ] **Step 2: Run full tests**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
npm test
```

Expected: all tests PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
npm run build
```

Expected: TypeScript build and Vite build exit 0.

- [ ] **Step 4: Browser preview every clip**

Use the running Vite server at `http://127.0.0.1:5173/`. If it is not running, start it with:

```bash
cd /Users/a111/chen/code/心屿/frontend
npm run dev -- --host 127.0.0.1
```

Load `xyshz_rigged.glb?v=5` in a temporary Three.js preview and capture screenshots for `Idle`, `WalkLoop`, `RunLoop`, `Jump`, `Wave`, `Flute`, `Sit`, and `Cheer`. Confirm:

- Character faces forward with `XYSHZ_MODEL_ROTATION`.
- Feet move forward/back for locomotion, not sideways.
- Wave lifts one arm with visible elbow/hand motion.
- Flute brings both hands near the mouth line.
- Sit lowers hips without excessive sideways foot sliding.
- Cheer is short and expressive.

- [ ] **Step 5: Commit only this feature's files**

Before staging, check:

```bash
cd /Users/a111/chen/code/心屿
git status --short
```

Stage only:

```bash
git add \
  blender/xyshz_rigged_walk.py \
  frontend/public/models/xyshz_rigged.glb \
  frontend/src/components/ExploreMode.tsx \
  frontend/src/lib/protagonistAction.ts \
  frontend/tests/protagonistActionSelector.test.mjs \
  frontend/tests/protagonistActions.test.mjs \
  frontend/tests/xyshzHeroIntegration.test.mjs \
  frontend/tests/xyshzRiggedWalk.test.mjs
```

Commit:

```bash
git commit -m "feat: add xyshz full action library"
```

Do not stage unrelated dirty files listed by `git status`.

## Self-Review Checklist

- Spec coverage: all requested clips from the approved spec are represented in Tasks 1-4.
- TDD path: selector, GLB structure, expressive motion, and frontend routing tests are written before implementation steps.
- No placeholders: every task names exact files, commands, and expected outcomes.
- Dirty worktree handling: Task 6 explicitly stages only the feature files.
