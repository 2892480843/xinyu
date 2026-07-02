# Overview Visual Audit

Date: 2026-06-29

## Scope

This pass reviews the island after the recent GLB upgrades and checks whether the next best step should be more modeling or scene-level cleanup.

Screenshots:

- `docs/screenshots/overview-village.png`
- `docs/screenshots/overview-farm.png`
- `docs/screenshots/overview-pond.png`
- `docs/screenshots/overview-beach.png`

## Result

Pause new background modeling.

The village, farm, pond, and beach now read as GLB-rich scenes. The remaining visible procedural geometry is mostly terrain, road/path helpers, water/sky/effects, player-held tools, or subtle background vegetation. Those are better handled procedurally unless a future close-up exposes a concrete readability problem.

The only actionable issue found in this audit was layout-related: the new crop sprout GLB made the pond-adjacent farm overlap easier to see. That was fixed by adding a pond clearance rule to crop placement rather than by adding another model.

## Evidence

| Area | Screenshot | Decision |
|---|---|---|
| Village | `overview-village.png` | No new model needed; primary buildings, NPCs, props, lamps, and vegetation are already GLB-backed. |
| Farm | `overview-farm.png` | Crop sprout model reads well; keep future work to spacing/readability polish. |
| Pond | `overview-pond.png` | Pond remains readable; crop rows now avoid the pond waterline after recheck. |
| Beach | `overview-beach.png` | Beach props are strongly GLB-backed; remaining procedural particles/effects are appropriate. |

## Remaining Procedural Geometry

| Category | Examples | Decision |
|---|---|---|
| Functional surfaces | terrain, road ribbon, pads, path tiles, collision helpers | Keep procedural for flexibility and alignment with gameplay surfaces. |
| Effects | fire, sparkles, snow, moon reflection, glow rings, sky/ocean planes | Keep procedural because they animate or depend on runtime state. |
| Background micro-details | pond reeds/lilies, scattered grass, subtle particles | Defer; only model if a close-up screenshot shows a concrete weakness. |
| Dynamic player tools | flute, planted mood flowers, temporary visual cues | Keep procedural unless they become inventory-grade objects. |

## Recommendation

Next iteration should be a scene-layout quality pass, not another modeling pass.

Suggested focus:

1. Check close-range collisions and object overlaps around featured areas.
2. Verify model loading and scale on the existing GLB set.
3. Only add new GLBs when a screenshot shows the object is important and visually weak.

## Verification Method

The audit used Playwright against the local Vite app on `127.0.0.1:5173`, mocked `127.0.0.1:8000/api/**`, entered Explore mode through the `上岛走走` button, warped the player to four representative areas, fixed the camera with the existing `__XYCAM` debug hook, and captured screenshots.

Follow-up recheck after crop clearance:

| Check | Result |
|---|---|
| Rechecked screenshots | `overview-farm.png`, `overview-pond.png` |
| GLB failures | `[]` |
| GLB non-200 responses | `[]` |
| Canvas | Rendered at `1440x1000`; screenshots saved at `1440x1005`. |
