# Island Detail Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the walkable island feel complete, cozy, and internally consistent across every named C1 district.

**Architecture:** Keep the existing single-scene React Three Fiber structure and improve the district composition functions in `frontend/src/components/ExploreMode.tsx`. Use source-level integration tests in `frontend/tests/exploreC1Integration.test.mjs` to lock visual requirements that are easy to regress: no guide patches, no egrets in the wheat field, district wrappers render their richer core scenes, and all grounded props use terrain-aware placement.

**Tech Stack:** React, TypeScript, Three.js, React Three Fiber, Vite, Node test runner, Playwright screenshots for manual visual inspection.

---

### Task 1: Lock The Detail Contract

**Files:**
- Modify: `frontend/tests/exploreC1Integration.test.mjs`
- Read: `frontend/src/components/ExploreMode.tsx`

- [ ] **Step 1: Add source assertions for each named district**

Add expectations that `RiceFieldDistrict`, `FarmDistrict`, `TownDistrict`, `MountainDistrict`, `ForestDistrict`, `ZooDistrict`, `SwampDistrict`, and `ScenicDistrict` render recognizable signature props. Use the existing `sourceBlock` helper and assert concrete model/function names such as `FieldScarecrow`, `FarmSoilBed`, `TownMarketSquare`, `MountainTrailScene`, `ForestCampGrove`, `MODELS.critterFox`, `MODELS.isleBridge`, and `MODELS.isleWindchime`.

- [ ] **Step 2: Run the integration test to verify failures**

Run: `node --test tests/exploreC1Integration.test.mjs`

Expected: fail only where the current source lacks a required detail assertion or where a district wrapper is not rendering the richer core scene.

- [ ] **Step 3: Update the scene code until assertions pass**

Modify only `frontend/src/components/ExploreMode.tsx`. Prefer existing procedural helpers and existing `MODELS` entries over new assets.

- [ ] **Step 4: Run the integration test again**

Run: `node --test tests/exploreC1Integration.test.mjs`

Expected: all tests pass.

### Task 2: Remove Remaining Abstract Visual Patches

**Files:**
- Modify: `frontend/src/components/ExploreMode.tsx`
- Modify: `frontend/tests/exploreC1Integration.test.mjs`

- [ ] **Step 1: Expand the no-guide-patch test**

Assert that `DistrictGroundPatch`, `DistrictFlatTile`, and `DistrictCircleTile` return `null`, and that district water/soil surfaces are real contextual meshes rather than large translucent guide tiles.

- [ ] **Step 2: Run red test**

Run: `node --test tests/exploreC1Integration.test.mjs`

Expected: fail if any large translucent guide mesh is still rendered.

- [ ] **Step 3: Replace guide tiles with local props**

For any remaining district that relies on abstract patch helpers, keep the helper call harmless and add concrete objects: fences, benches, wells, bridges, reeds, animals, crop rows, stones, lanterns, signs, tents, and water/soil meshes.

- [ ] **Step 4: Run green test**

Run: `node --test tests/exploreC1Integration.test.mjs`

Expected: pass.

### Task 3: Validate Grounding And No-Clipping

**Files:**
- Modify: `frontend/src/components/ExploreMode.tsx`
- Modify: `frontend/tests/exploreC1Integration.test.mjs`

- [ ] **Step 1: Add/keep assertions around placement helpers**

Assert that `GroundProp` uses `placeableGroundY(x, z) + yOffset`, `GltfProp` supports `grounded`, and object bottoms are lifted by `modelGroundLift`.

- [ ] **Step 2: Run red test**

Run: `node --test tests/exploreC1Integration.test.mjs`

Expected: fail if any placement helper is missing from the source.

- [ ] **Step 3: Fix scene placement**

Use `GroundProp` for terrain-following GLB props. Use procedural mesh groups with `placeableGroundY` for hand-built props such as `FieldScarecrow`.

- [ ] **Step 4: Run green test**

Run: `node --test tests/exploreC1Integration.test.mjs`

Expected: pass.

### Task 4: Browser Visual Sweep

**Files:**
- Read: `frontend/src/components/ExploreMode.tsx`
- Create screenshots under `/tmp` only

- [ ] **Step 1: Start or reuse the dev server**

Run: `npm run dev -- --host 127.0.0.1 --port 5173`

Expected: Vite serves `http://127.0.0.1:5173/`.

- [ ] **Step 2: Capture district screenshots**

Use Playwright to enter walk mode, warp with `window.__XYWARP = { x, z }`, and save screenshots for the main districts. Inspect for visible white birds, giant yellow/transparent guide blocks, missing district signature props, and obvious clipping.

- [ ] **Step 3: Patch any concrete visual issue discovered**

For each issue, add a focused test assertion first when it is source-verifiable, then patch `ExploreMode.tsx`.

### Task 5: Final Verification

**Files:**
- Read: all changed files

- [ ] **Step 1: Run focused tests**

Run: `node --test tests/exploreC1Integration.test.mjs`

Expected: all tests pass.

- [ ] **Step 2: Run current regression suite**

Run: `node --test tests/mobileCompletion.test.mjs tests/exploreC1Integration.test.mjs tests/protagonistActionSelector.test.mjs`

Expected: all tests pass.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: TypeScript and Vite build succeed.

