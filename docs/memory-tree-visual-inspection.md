# Memory Tree Visual Inspection

Date: 2026-06-29

## Scope

The reward tree shown after collecting all memory imprints now renders through `xy_item_memory_tree.glb`. The collected-color orb logic remains in `ExploreMode` so the tree still reflects the user's picked imprint colors.

## Result

Pass.

The scene-level check used Playwright with mocked local API responses to inject three history memories. The script warped the player to each deterministic imprint location, verified the completion HUD, and then captured the memory tree in the Explore scene.

Screenshot:

- `docs/screenshots/memory-tree-visual-inspection.png`

## Evidence

| Check | Result |
|---|---|
| `xy_item_memory_tree.glb` | HTTP 200 |
| GLB failures | `[]` |
| Canvas | Rendered at `1440x1000` |
| Completion HUD | `✦ 你走过的每一刻，都还在 ✦` observed after collecting all mocked imprints. |
| Regression test | `frontend/tests/memoryTreeModel.test.mjs` verifies GLB node/material names and `ExploreMode` routing through `GltfMemoryTree`. |

## Known Exclusions

The backend API was mocked for this pass so the imprint collection route could be triggered deterministically. This validates frontend tree reveal, model routing, and asset loading, not backend memory retrieval.

Older third-party GLBs may still emit `THREE.GLTFLoader` warnings for `KHR_materials_pbrSpecularGlossiness`. Those warnings are unrelated to the new memory tree asset and no GLB request failed.

## Verification Commands

```bash
cd frontend && npm run lint
cd frontend && npm test
cd frontend && npm run build
```
