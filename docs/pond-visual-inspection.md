# Pond Visual Inspection

Date: 2026-06-29

## Scope

This pass checks whether the current pond lilies and reeds need a dedicated GLB micro-kit after the higher-priority 3D modeling work.

The inspected pond elements are still procedural meshes in `ExploreMode.tsx`:

- pond water: circle mesh,
- lily pads: small circle meshes,
- lily flowers: small icosahedron meshes,
- reeds: thin cylinder meshes.

## Result

Defer modeling.

The pond reads clearly at a normal elevated gameplay camera distance. Lily pads, flowers, river lamps, pond edge shape, nearby stones, and surrounding props are visually identifiable. Reeds are subtler than the lilies, but they currently function as background dressing rather than a close-range or story-critical object.

Screenshot:

- `docs/screenshots/pond-visual-inspection.png`

## Evidence

| Check | Result |
|---|---|
| GLB failures | `[]` |
| GLB non-200 responses | `[]` |
| Canvas | Rendered at `1440x1000`; screenshot image saved at `1440x1005`. |
| Screenshot sample | `7665` unique colors after downsampling to `240x167`. |
| Placement | Player warped to pond center at approximately `(53.28, 53.28)`; camera framed the full pond and nearby props. |
| Visual decision | Lily pads and flowers are readable; reeds are acceptable as background vegetation for now. |

## Decision

Do not create `xy_nat_lily_cluster.glb` or `xy_nat_reed_cluster.glb` in this iteration.

Keep the pond micro-kit as a P2 follow-up only if the pond becomes a featured interaction area or a future close-range screenshot shows the reeds/lilies reading weakly.

## Known Exclusions

The backend API was mocked for this pass so the inspection could focus on frontend scene placement and visual readability. This does not validate backend memory, island-state, artifact, or companion endpoints.

This pass also does not judge crop rows, field plants, or other deferred P2 background clusters.

## Verification Method

The check used Playwright against the local Vite app on `127.0.0.1:5173`, mocked `127.0.0.1:8000/api/**`, entered Explore mode through the `上岛走走` button, warped the player to the pond, fixed the camera with the existing `__XYCAM` debug hook, and captured a screenshot.
