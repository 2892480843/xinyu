# C1 Strong Scenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the ten C1 map districts into visibly distinct walkable mini-scenes on the island.

**Architecture:** Keep the existing `ExploreMode.tsx` district rendering pattern, but require one component per C1 zone. Store each scene footprint in `explorePresentation.ts`, render each mini-scene inside `IslandDistricts`, and protect the result with source-level integration tests.

**Tech Stack:** React, TypeScript, React Three Fiber, existing GLB model registry, Node test runner.

---

### Task 1: Test The Ten Scene Contract

**Files:**
- Modify: `frontend/tests/exploreC1Integration.test.mjs`

- [x] **Step 1: Write the failing test**

Add a test that checks these component names exist and are all rendered by `IslandDistricts`:

```js
const sceneNames = [
  "HomeDistrict",
  "BeachDistrict",
  "RiceFieldDistrict",
  "MountainDistrict",
  "ForestDistrict",
  "TownDistrict",
  "FarmDistrict",
  "ZooDistrict",
  "SwampDistrict",
  "ScenicDistrict",
];
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/exploreC1Integration.test.mjs`

Expected: FAIL because `BeachDistrict`, `MountainDistrict`, `ForestDistrict`, and `TownDistrict` do not exist yet.

### Task 2: Add Strong Scene Footprints

**Files:**
- Modify: `frontend/src/lib/explorePresentation.ts`

- [x] **Step 1: Add `beach`, `mountain`, `forest`, and `town` entries to `HEALING_DISTRICT_PRESENTATION`**

Use the coordinates from `EXPLORE_ZONES`: beach near the bay, mountain at `(-70, 70)`, forest at `(-118, 20)`, town at `(-12, -54)`.

### Task 3: Render Four Missing Mini-Scenes

**Files:**
- Modify: `frontend/src/components/ExploreMode.tsx`

- [x] **Step 1: Add `BeachDistrict`**

Render a sand footprint plus beach-specific GLBs: deckchair, surfboard, bucket, beach ball, sign, palm, firepit, footprints.

- [x] **Step 2: Add `MountainDistrict`**

Render a rocky footprint, stone steps, torii/lookout/rocks/lanterns, and a visible route up the hill.

- [x] **Step 3: Add `ForestDistrict`**

Render a darker forest clearing, clustered pine/broadleaf trees, mushroom ring, flowers, hammock or tent, and a signpost.

- [x] **Step 4: Add `TownDistrict`**

Render a plaza footprint, stalls/parasol/crates/benches/lampposts/mailbox, and house anchors.

### Task 4: Strengthen Existing Six Mini-Scenes

**Files:**
- Modify: `frontend/src/components/ExploreMode.tsx`

- [x] **Step 1: Make each existing district read as a complete scene**

Add landmark combinations where needed: home gate/yard props, rice field channels and scarecrow-like sign/fence, farm rows and fence rhythm, zoo entry and enclosure, swamp boardwalk, scenic photo path.

### Task 5: Verify

**Files:**
- Modify: `docs/screenshots/*.png`

- [x] **Step 1: Run focused test**

Run: `npm test -- tests/exploreC1Integration.test.mjs`

Expected: PASS.

- [x] **Step 2: Run full test and build**

Run: `npm test` and `npm run build`

Result: `npm run build` passes. `npm test` runs 90/91 passing and is blocked by the unrelated `xyshz flute and sit clips place limbs like intentional actions` assertion in the pre-existing `xyshz` animation worktree changes.

- [x] **Step 3: Capture screenshots**

Capture one overview screenshot and close screenshots for representative districts so the visual difference is inspectable.
