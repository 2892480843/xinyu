# Memory Imprint Visual Inspection

Date: 2026-06-29

## Scope

Memory imprints now render through five dedicated GLB models instead of procedural primitives in `MemoryImprints`.

The retained emotion-to-shape mapping is:

| Emotion | Shape | Model |
|---|---|---|
| `happy` | `star` | `xy_item_imprint_star.glb` |
| `calm` | `shell` | `xy_item_imprint_shell.glb` |
| `lonely` | `flower` | `xy_item_imprint_flower.glb` |
| `angry` | `spark` | `xy_item_imprint_spark.glb` |
| `sad`, `anxious`, `tired`, `helpless`, unknown | `drop` | `xy_item_imprint_drop.glb` |

## Result

Pass.

The scene-level check used Playwright with mocked local API responses to inject five history memories. This made the imprint set deterministic without depending on the backend server.

Screenshot:

- `docs/screenshots/memory-imprint-visual-inspection.png`

## Evidence

| Check | Result |
|---|---|
| `xy_item_imprint_star.glb` | HTTP 200 |
| `xy_item_imprint_shell.glb` | HTTP 200 |
| `xy_item_imprint_flower.glb` | HTTP 200 |
| `xy_item_imprint_spark.glb` | HTTP 200 |
| `xy_item_imprint_drop.glb` | HTTP 200 |
| GLB failures | `[]` |
| Canvas | Rendered at `1440x1000` |
| Unit tests | `frontend/tests/imprint3d.test.mjs` verifies registry coverage, emotion mapping, GLB node/material names, and `ExploreMode` registry routing. |

## Known Exclusions

The backend API was mocked for this pass so all five imprint shapes could be inspected in one deterministic run. This does not validate backend memory retrieval; it validates frontend model routing and asset loading.

Older third-party GLBs may still emit `THREE.GLTFLoader` warnings for `KHR_materials_pbrSpecularGlossiness`. Those warnings are unrelated to the new imprint GLBs and no imprint model request failed.

## Verification Commands

```bash
cd frontend && npm run lint
cd frontend && npm test
cd frontend && npm run build
```
