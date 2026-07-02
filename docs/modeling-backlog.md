# 3D Modeling Backlog

Date: 2026-06-29

## Scope

This backlog tracks the next modeling work after the 16 ritual collectible artifacts were mapped to 3D assets.

Confirmed current baseline:

- The backend ritual catalog has 16 artifact keys in `backend/app/services/island_ritual_service.py`.
- The frontend registry in `frontend/src/lib/artifact3d.ts` covers all 16 keys.
- `frontend/src/components/ExploreMode.tsx` renders registry-backed ritual artifacts through `RitualArtifactProp`.
- The five formerly fallback-like ritual artifacts now have dedicated GLBs:
  - `xy_item_star_wish.glb`
  - `xy_item_sail.glb`
  - `xy_item_silent_shell.glb`
  - `xy_item_glyph_stone.glb`
  - `xy_item_bloom.glb`
- Visual inspection for those five artifacts is recorded in `docs/ritual-artifact-visual-inspection.md`.
- The fishing marker now uses `xy_item_fishing_bobber.glb`, with visual inspection recorded in `docs/fishing-bobber-visual-inspection.md`.
- The Star-wish sky event now uses `xy_fx_shooting_star.glb`, with visual inspection recorded in `docs/shooting-star-visual-inspection.md`.
- The pond lily / reeds visual pass is recorded in `docs/pond-visual-inspection.md`; modeling is deferred because the current pond reads clearly enough at normal gameplay camera distance.
- The crop rows now use `xy_nat_crop_sprout.glb`, with visual inspection recorded in `docs/crop-rows-visual-inspection.md`.
- The overview visual audit is recorded in `docs/overview-visual-audit.md`; the next recommended step is scene-layout cleanup rather than more background modeling.

## Terms

| Term | Meaning |
|---|---|
| GLB | Binary glTF 3D model file used by the Three.js scene. |
| Registry | A typed mapping from gameplay key to model URL, scale, tags, and notes. |
| Procedural mesh | A 3D object built directly in code from primitives such as spheres, cylinders, or custom geometry. This is useful for effects, but can look generic for story-important objects. |
| Visual inspection | A Playwright or browser pass that checks model readability, scale, placement, and loading behavior in the real scene. |

## Priority Summary

| Priority | Target | Current State | Recommended Action | Why It Matters |
|---|---|---|---|---|
| P0 | NPC villager bodies | `CharacterModel` is still assembled from primitive geometry in `ExploreMode.tsx`. | Create or connect a small villager GLB set, then keep color variants in code. | NPCs are frequent, close-range, and emotionally important. Upgrading them improves the whole island faster than another prop. |
| P0 | Memory imprints | Completed: `MemoryImprints` now uses five emotion-specific GLBs through `frontend/src/lib/imprint3d.ts`. | Keep visual polish only if future close-range screenshots show scale/readability issues. | Memory collection is a core loop; dedicated shapes now replace the generic primitives. |
| P1 | Memory tree | Completed: `MemoryTree` now renders `xy_item_memory_tree.glb` and keeps collected-color orbs in code. | Keep only future visual polish if close-range screenshots show scale/readability issues. | It is the reward after collecting imprints, and it now has a dedicated model body. |
| P1 | Fishing bobber / fishing marker | Completed: `FishingSpot` now renders `xy_item_fishing_bobber.glb` through `GltfFishingBobber`. | Keep rod/line as a separate future iteration only if fishing becomes a larger mechanic. | The visible cast feedback no longer depends on primitive placeholder geometry. |
| P1 | Star-wish sky event | Completed: `StarWish` now renders `xy_fx_shooting_star.glb` through `GltfShootingStar`. | Keep only future timing/visibility polish if night screenshots show the meteor is too subtle. | The collectible and matching sky event now share a dedicated star/meteor visual language. |
| P2 | Pond lily / reeds cluster | Visual pass completed: pond lilies and flowers read clearly; reeds are subtle but acceptable background dressing. | Defer `xy_nat_lily_cluster.glb` / `xy_nat_reed_cluster.glb` unless the pond becomes a featured close-range area. | Lower impact because the pond already has river lamps and surrounding GLB context. |
| P2 | Crop rows / field plants | Completed: crop rows now render `xy_nat_crop_sprout.glb`; haystacks already use GLB; crop rows now avoid the pond waterline. | Keep only future visual polish if farm screenshots show scale/readability issues. | The farm patch now reads as planted sprouts rather than generic green posts. |
| P2 | Map/minimap icons | Some map markers remain SVG/UI symbols rather than model-backed thumbnails. | Defer unless the map becomes a 3D inspection view. | Not a 3D scene blocker. |

## Detailed Candidates

| Object | Evidence | Current Implementation | Suggested Model Contract | Acceptance Checks |
|---|---|---|---|---|
| NPC villager bodies | `Npcs` renders many nearby island residents; each uses `CharacterModel`. | Primitive capsule/sphere/cone/circle pieces with code-driven colors and hat. | `xy_char_villager_base.glb` with named nodes for `Body`, `Head`, `Hair`, `Hat`, `Arm_L`, `Arm_R`, `Leg_L`, `Leg_R`; keep material color overrides. | Test source references new villager model; Playwright screenshot verifies close-range NPC readability and no broken walk/bob animation. |
| Memory imprints | `MemoryImprints` maps emotions to `star`, `shell`, `flower`, `spark`, `drop`. | Dedicated GLBs through `IMPRINT_3D_REGISTRY`; glow sprite remains for pickup readability. | Maintain `xy_item_imprint_star.glb`, `xy_item_imprint_shell.glb`, `xy_item_imprint_flower.glb`, `xy_item_imprint_spark.glb`, `xy_item_imprint_drop.glb`; registry keyed by emotion shape. | Covered by `frontend/tests/imprint3d.test.mjs`; Playwright visual inspection recorded in `docs/memory-imprint-visual-inspection.md`. |
| Memory tree | `MemoryTree` appears after imprint collection. | Dedicated `xy_item_memory_tree.glb` for trunk, branches, canopy, and stable orb anchors; collected-color orbs remain dynamic. | Maintain `xy_item_memory_tree.glb`; optionally move dynamic orbs to the GLB anchors if later close-up framing needs exact branch placement. | Covered by `frontend/tests/memoryTreeModel.test.mjs`; Playwright visual inspection recorded in `docs/memory-tree-visual-inspection.md`. |
| Fishing bobber | `FishingSpot` shows a bobber when casting. | Dedicated `xy_item_fishing_bobber.glb` through `GltfFishingBobber`; old sphere/cylinder placeholder removed. | Maintain `xy_item_fishing_bobber.glb` with `BobberBody`, `BobberTip`, and `LineHook` node names. | Covered by `frontend/tests/fishingBobberModel.test.mjs`; Playwright visual inspection recorded in `docs/fishing-bobber-visual-inspection.md`. |
| Meteor / shooting star | `StarWish` event renders a shooting star when the player reaches the observation point at night. | Dedicated `xy_fx_shooting_star.glb` through `GltfShootingStar`; old primitive glowing sphere removed. | Maintain `xy_fx_shooting_star.glb` with `ShootingStarRoot`, `Core`, `Trail`, and `Glow` node names. | Covered by `frontend/tests/shootingStarModel.test.mjs`; Playwright visual inspection recorded in `docs/shooting-star-visual-inspection.md`. |
| Pond lily / reeds | Pond scene uses procedural lily meshes and reed cylinders around a GLB-rich pond. Visual inspection is recorded in `docs/pond-visual-inspection.md`. | Circles, icosahedrons, and cylinders. | Optional `xy_nat_lily_cluster.glb` and `xy_nat_reed_cluster.glb` if pond becomes a close inspection area. | Defer: current pond reads clearly enough at normal gameplay camera distance. |
| Crop rows | Farm crop visual pass showed primitive green posts were too close to surrounding grass/reeds; overview audit later showed pond-edge overlap after the sprout upgrade. | Dedicated `xy_nat_crop_sprout.glb` through `glbInstanceGeo`; farm spacing remains unchanged except crops within `POND_CROP_CLEARANCE` are skipped. | Maintain `xy_nat_crop_sprout.glb` with `CropSproutRoot`, `StemCluster`, `LeafCluster`, `SoilAnchor`; materials `CropStem`, `CropLeafLight`, `CropLeafDark`, `SoilAnchorMat`; keep pond clearance at `8.5` unless pond layout changes. | Covered by `frontend/tests/cropSproutModel.test.mjs`; Playwright visual inspection recorded in `docs/crop-rows-visual-inspection.md`; overview audit recorded in `docs/overview-visual-audit.md`. |

## Recommended Next Iteration

Do a scene-layout quality pass before adding more background models.

Reasons:

- NPC villager bodies, memory imprints, the memory tree, the fishing bobber, the Star-wish sky event, and crop rows are now modeled and wired.
- The pond visual pass shows the current lily pads and flowers are readable, while reeds are acceptable as background dressing.
- The overview audit shows the biggest remaining issues are more likely to be overlap, spacing, collision, and scale polish than missing GLBs.
- The remaining modeling candidates are lower impact background clusters, so they should continue to be gated by visual evidence rather than modeled automatically.

## Suggested P2 Plan

1. Run close-range layout screenshots for featured areas.
2. Fix object overlaps, waterline intrusions, and obvious scale mismatches.
3. Re-run focused Playwright screenshots after each layout fix.
4. Only if a screenshot shows an important object remains visually weak, add a focused model contract test before generating the asset.
5. Save screenshots under `docs/screenshots/` and record the decision in a visual inspection note.

## Deferred / Not Worth Modeling Now

| Object | Reason |
|---|---|
| Terrain, ocean, sky dome, moon plane, fireworks, grass fields | These are effects or large procedural systems where code-driven geometry is appropriate. Modeling them as static GLBs would reduce flexibility. |
| Roads, pads, collision helper geometry | These are functional scene surfaces, not collectible or inspectable objects. |
| Existing beach props, critters, water props, terrain props, island facilities | Already have GLB coverage in `MODELS`; only need visual polish if a specific screenshot shows an issue. |

## Verification Commands

Use these after each modeling iteration:

```bash
cd frontend && npm test
cd frontend && npm run build
```

For scene-level confidence, run a local browser smoke test and verify:

- the new GLB request returns 200,
- no old placeholder remains visible at the target location,
- scale and placement read well at normal gameplay camera distance,
- no unrelated model request fails.
