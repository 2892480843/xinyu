# Shooting Star Visual Inspection

Date: 2026-06-29

## Scope

The Star-wish night sky event now renders through the dedicated `xy_fx_shooting_star.glb` model instead of the previous primitive glowing sphere in `StarWish`.

## Result

Pass.

The scene-level check used Playwright with mocked local API responses, opened Explore mode in night mode, warped the player to the Star-wish observation point, waited for the shooting-star cycle, and captured the night sky event.

Screenshot:

- `docs/screenshots/shooting-star-visual-inspection.png`

## Evidence

| Check | Result |
|---|---|
| `xy_fx_shooting_star.glb` | HTTP 200 |
| GLB failures | `[]` |
| Canvas | Rendered at `1440x1000`; screenshot sample had `3665` unique colors. |
| Star-wish trigger | Discovery HUD/card state included `对着流星许个愿`. |
| Regression test | `frontend/tests/shootingStarModel.test.mjs` verifies GLB node/material names and `ExploreMode` routing through `GltfShootingStar`. |

## Known Exclusions

The backend API was mocked for this pass so the inspection could focus on frontend model loading, night-mode event placement, and the Star-wish interaction state. This does not validate backend memory, island-state, or artifact endpoints.

Older third-party GLBs may still emit `THREE.GLTFLoader` warnings for unsupported legacy material extensions. Those warnings are unrelated to the shooting-star asset and no GLB request failed.

## Verification Commands

```bash
cd frontend && npm run lint
cd frontend && npm test
cd frontend && npm run build
```
