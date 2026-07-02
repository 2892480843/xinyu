# Villager NPC Visual Inspection

Date: 2026-06-29

## Scope

NPC island residents now render through the dedicated `xy_char_villager_base.glb` model instead of the previous primitive `CharacterModel` body. The player avatar and wardrobe preview still keep their existing character path.

## Result

Pass.

The close-range scene check confirms the villager GLB reads as a distinct island resident in the real Explore scene, including hat, face, shirt, pants, arms, and legs. The screenshot used for visual review is:

- `docs/screenshots/villager-npc-close-clean.png`

## Evidence

| Check | Result |
|---|---|
| Model file | `frontend/public/models/xy_char_villager_base.glb` exists. |
| Runtime request | `xy_char_villager_base.glb` returned HTTP 200 during Playwright inspection. |
| Model failures | No `.glb` request failed during the NPC-focused inspection. |
| Scene | The Explore canvas rendered at desktop size and showed the GLB villager in-world. |
| Regression test | `frontend/tests/villagerModel.test.mjs` verifies stable node/material names and NPC routing through `GltfNpcCharacter`. |

## Known Exclusions

The backend API was not part of this model inspection. If the backend is not running locally, `127.0.0.1:8000` requests may fail with `ERR_CONNECTION_REFUSED`; those failures are excluded because the GLB asset request and 3D scene rendering are served by the frontend dev server.

Older third-party GLBs may emit `THREE.GLTFLoader` warnings for unsupported legacy material extensions. Those warnings were already present outside this villager asset and are not treated as failures for this pass.

## Verification Commands

```bash
cd frontend && npm run lint
cd frontend && npm test
cd frontend && npm run build
```
