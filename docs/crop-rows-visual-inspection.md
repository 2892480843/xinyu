# Crop Rows Visual Inspection

Date: 2026-06-29

## Scope

This pass checks whether farm crop rows should remain procedural background geometry or receive a small dedicated GLB model.

The first inspection showed the farm area was readable, but the crop bodies were plain green boxes and visually too close to surrounding grass and reeds. This iteration replaces the crop boxes with `xy_nat_crop_sprout.glb` while preserving the existing farm layout, spacing, and instanced rendering.

## Result

Pass.

The crop rows now read as planted sprouts instead of generic green posts. Each instance has a small soil anchor and leaf cluster, so the farm patch separates better from surrounding grass at normal elevated gameplay camera distance.

Screenshot:

- `docs/screenshots/crop-rows-visual-inspection.png`

## Evidence

| Check | Result |
|---|---|
| `xy_nat_crop_sprout.glb` | Loaded in the scene; GLB request count increased from `119` to `120` after wiring. |
| GLB failures | `[]` |
| GLB non-200 responses | `[]` |
| Canvas | Rendered at `1440x1000`; screenshot image saved at `1440x1005`. |
| Screenshot sample | `7549` unique colors after downsampling to `240x167`. |
| Placement | Player warped to the farm centered near `(-58, -22)`; camera framed the crop patch and nearby haystack GLBs. |
| Visual decision | Crop rows are more legible and no visible floating or scale mismatch was observed. |
| Pond clearance recheck | Crop placement now skips sprouts within `8.5` world units of the pond center; the closest retained crop is about `8.55` units from the pond center. |

## Model Contract

`xy_nat_crop_sprout.glb` keeps stable node and material names for future edits:

| Type | Names |
|---|---|
| Nodes | `CropSproutRoot`, `StemCluster`, `LeafCluster`, `SoilAnchor` |
| Materials | `CropStem`, `CropLeafLight`, `CropLeafDark`, `SoilAnchorMat` |

## Known Exclusions

The backend API was mocked for this pass so the inspection could focus on frontend scene placement and visual readability. This does not validate backend memory, island-state, artifact, or companion endpoints.

The first screenshot script reported one non-GLB `ERR_CONNECTION_CLOSED` console entry during page teardown, but GLB failures and page errors were empty. The later crop/pond recheck had GLB failures `[]`, GLB non-200 responses `[]`, and page errors `[]`.

## Verification Commands

```bash
cd frontend && node --test tests/cropSproutModel.test.mjs
cd frontend && npm run lint
cd frontend && npm run build
cd frontend && npm test
```
