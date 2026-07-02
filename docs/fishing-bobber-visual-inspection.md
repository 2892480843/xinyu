# Fishing Bobber Visual Inspection

Date: 2026-06-29

## Scope

The fishing cast marker now renders through the dedicated `xy_item_fishing_bobber.glb` model instead of the previous sphere and cylinder primitives in `FishingSpot`.

## Result

Pass.

The scene-level check used Playwright with mocked local API responses, opened Explore mode, warped the player to a valid bay fishing point away from nearby NPC prompts, clicked the fishing action, and captured the cast state.

Screenshot:

- `docs/screenshots/fishing-bobber-visual-inspection.png`

## Evidence

| Check | Result |
|---|---|
| `xy_item_fishing_bobber.glb` | HTTP 200 |
| GLB failures | `[]` |
| Canvas | Rendered at `1440x1000`; screenshot sample had `2202` unique colors. |
| Fishing state | Bottom HUD showed `抛竿中...`; the red and white bobber was visible on the water. |
| Regression test | `frontend/tests/fishingBobberModel.test.mjs` verifies GLB node/material names and `ExploreMode` routing through `GltfFishingBobber`. |

## Known Exclusions

The backend API was mocked for this pass so the inspection could focus on frontend model loading, 3D placement, and the fishing interaction state. This does not validate backend memory, island-state, or artifact endpoints.

Older third-party GLBs may still emit `THREE.GLTFLoader` warnings for unsupported legacy material extensions. Those warnings are unrelated to the fishing bobber asset and no GLB request failed.

## Verification Commands

```bash
cd frontend && npm run lint
cd frontend && npm test
cd frontend && npm run build
```
