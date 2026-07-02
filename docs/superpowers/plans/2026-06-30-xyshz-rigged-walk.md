# XYSHZ Rigged Walk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a rigged `xyshz_rigged.glb` with `Idle` and `WalkLoop` animation clips, then make the in-game `hero` character play `WalkLoop` while moving.

**Architecture:** A Blender script imports the static `xyshz.glb`, creates a lightweight human armature, assigns automatic spatial vertex groups, adds NLA animation clips, and exports a new GLB. The frontend keeps `guardian` on the old animated protagonist and changes `hero` to load the rigged `xyshz` asset through `useAnimations`.

**Tech Stack:** Blender Python (`bpy`), glTF/GLB, React Three Fiber, `@react-three/drei` `useGLTF` and `useAnimations`, Node test runner.

---

### Task 1: Lock the rigged asset contract

**Files:**
- Create: `frontend/tests/xyshzRiggedWalk.test.mjs`

- [ ] **Step 1: Write the failing test**

Create a Node test that reads `public/models/xyshz_rigged.glb` and asserts:
- the file is a binary glTF;
- animation clips include `Idle` and `WalkLoop`;
- node names include `XYSHZ_Rig`, `Hips`, `Spine`, `Chest`, `Head`, `UpperLegL`, `LowerLegL`, `FootL`, `UpperLegR`, `LowerLegR`, `FootR`, `UpperArmL`, `ForeArmL`, `HandL`, `UpperArmR`, `ForeArmR`, `HandR`;
- at least one mesh has skin data.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/xyshzRiggedWalk.test.mjs`

Expected: failure because `public/models/xyshz_rigged.glb` does not exist yet.

### Task 2: Generate the rigged GLB

**Files:**
- Create: `blender/xyshz_rigged_walk.py`
- Create: `frontend/public/models/xyshz_rigged.glb`

- [ ] **Step 1: Implement Blender script**

The script must:
- clear the scene;
- import `frontend/public/models/xyshz.glb`;
- normalize the mesh transform by applying scale and rotation;
- create an armature named `XYSHZ_Rig`;
- create named bones matching the test contract;
- add vertex groups to the imported mesh using coordinate bands;
- add an Armature modifier and parent the mesh to the rig;
- create `Idle` and `WalkLoop` actions;
- export `xyshz_rigged.glb` with `export_animations=True` and `export_animation_mode="NLA_TRACKS"`.

- [ ] **Step 2: Run Blender script**

Run: `blender --background --python blender/xyshz_rigged_walk.py`

Expected: exports `frontend/public/models/xyshz_rigged.glb` without Python errors.

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test -- tests/xyshzRiggedWalk.test.mjs`

Expected: rigged asset contract passes.

### Task 3: Wire rigged hero into ExploreMode

**Files:**
- Modify: `frontend/src/components/ExploreMode.tsx`
- Modify: `frontend/tests/xyshzHeroIntegration.test.mjs`
- Modify: `frontend/tests/protagonistActions.test.mjs`

- [ ] **Step 1: Write failing frontend test expectations**

Update existing tests to assert:
- `MODELS.heroChar` points to `/models/xyshz_rigged.glb?v=1`;
- `GltfHero` uses `const { scene, animations } = useGLTF(MODELS.heroChar)`;
- `GltfHero` calls `useAnimations(animations, ref)`;
- `GltfHero` reads `actions[next]` and loops `WalkLoop`;
- `glbClipActive` is true for `hero` and `guardian` when a non-idle action is active.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/xyshzHeroIntegration.test.mjs tests/protagonistActions.test.mjs`

Expected: failure because current `hero` loads static `xyshz.glb` and uses procedural action feedback.

- [ ] **Step 3: Implement minimal frontend change**

Change `GltfHero` to load `xyshz_rigged.glb`, create `actions` with `useAnimations`, and play `WalkLoop` when `actionRef.current === "WalkLoop"`. Keep the existing scale, rotation, and foot offset unless the new exported asset requires a measured adjustment.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/xyshzRiggedWalk.test.mjs tests/xyshzHeroIntegration.test.mjs tests/protagonistActions.test.mjs`

Expected: all targeted tests pass.

### Task 4: Verify runtime behavior

**Files:**
- No source file changes expected.

- [ ] **Step 1: Build frontend**

Run: `npm run build`

Expected: TypeScript and Vite build exit 0.

- [ ] **Step 2: Browser smoke test**

Use Playwright against local Vite:
- enter the identity gate;
- click `上岛走走`;
- confirm `/models/xyshz_rigged.glb?v=1` returns HTTP 200;
- capture desktop and mobile screenshots;
- confirm no page errors.

Expected: `xyshz_rigged.glb` loads, canvas renders, and the hero stands at player scale without camera obstruction.

---

## Self-Review

- Spec coverage: Covers Blender rig generation, animation clips, frontend loading, and runtime validation.
- Placeholder scan: No `TBD`, `TODO`, or incomplete test commands.
- Type consistency: Uses existing `CharacterActionClip`, `GltfHero`, `heroChar`, and `guardianChar` naming.
