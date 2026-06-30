# Island Arrival Transition Design

## Background

The current desktop island entry starts from the `上岛走走` button in `frontend/src/pages/Home.tsx`. Clicking it immediately sets `exploreOpen` to true and mounts `ExploreMode`. While the 3D scene is loading, `ExploreMode` only shows the small `ExploreLoading` text `岛屿正在浮出水面……` inside the canvas.

This works technically, but the emotional transition is thin: the user taps a highly expressive home CTA, then can briefly see a plain loading state before the island is ready.

## Goal

Replace the plain click-to-load feeling with a lightweight sea-mist arrival transition. The user should feel like they are moving toward the island, while the 3D scene keeps loading normally in the background.

## User Experience

1. The user clicks `上岛走走`.
2. A full-screen arrival overlay appears immediately.
3. The overlay darkens the current view slightly, lifts a soft sea mist from the bottom, and shows a calm arrival line such as `正在靠岸……`.
4. `ExploreMode` mounts underneath the overlay without changing the existing heavy-asset loading strategy.
5. After a short minimum duration, the overlay fades away and reveals the island scene.

## Architecture

| Area | Design |
|---|---|
| Home entry | Keep the existing `setExploreOpen(true)` flow so the island scene still mounts immediately. |
| Arrival overlay | Add a small React component, likely `IslandArrivalOverlay`, rendered above `ExploreMode` while entry is in progress. |
| Animation | Use CSS and existing Framer Motion where already present; no new image, GLB, or network asset. |
| Loading boundary | Keep `ExploreLoading` as the canvas fallback, but make it visually match the arrival tone. |
| Mobile | Do not add heavy preload behavior. Keep mobile orientation and first-walking-seconds constraints intact. |

Framer Motion means the existing animation library already used on the home page. Suspense fallback means the temporary UI shown while lazy-loaded React or 3D content is still preparing.

## State Flow

| State | Meaning | UI |
|---|---|---|
| `exploreOpen = false` | User is on the home page. | Existing home UI and `上岛走走` button. |
| `exploreOpen = true`, arrival active | Explore mode is mounting. | Sea-mist overlay covers the transition. |
| Arrival done | The island can be viewed. | Overlay fades out; `ExploreMode` remains interactive. |
| Exit island | User closes exploration. | Reset arrival state so the next entry plays again. |

The overlay should use a minimum visible duration around 900-1200 ms. It should not wait indefinitely for all 3D assets, because the scene already has staged loading and progressive reveal behavior.

## Visual Direction

- Full-screen overlay, not a card.
- Dark translucent upper layer to make the transition calmer.
- Bottom sea-mist gradient and two or three slow moving mist bands.
- Center or lower-center text, short and quiet.
- No emoji, no decorative blobs, no extra explanatory text.
- Respect `prefers-reduced-motion` by reducing movement to a simple fade.

## Error Handling

| Risk | Handling |
|---|---|
| Explore mode fails to mount. | Existing error boundary still closes explore mode. Overlay state resets when `exploreOpen` is false. |
| Overlay blocks controls after fade. | Remove it from render or set `pointer-events: none` after exit. |
| Mobile entry becomes slower. | Do not add new assets or eager model preloading. |
| Motion feels noisy. | Keep duration short and opacity restrained. |

## Testing

| Check | Expected Result |
|---|---|
| Source-level test | Home renders/uses the arrival overlay when opening explore mode. |
| Mobile regression test | Mobile entry still avoids `onPointerDown={prefetchExplore}` and does not prefetch in `openExploreMode`. |
| Full frontend test | Existing Node tests pass. |
| Build | TypeScript and Vite production build pass. |
| Manual browser check | Clicking `上岛走走` shows the sea-mist transition before the island view. |

## Scope Boundaries

This change does not alter the 3D world, player spawn position, camera controls, route structure, model preloading list, or mobile orientation behavior. It only improves the visual transition after clicking `上岛走走`.

## Acceptance Criteria

- Clicking `上岛走走` displays a sea-mist arrival overlay immediately.
- The overlay fades away automatically after a short minimum duration.
- `ExploreMode` still mounts underneath using the existing lazy-loading path.
- No new heavy visual assets are introduced.
- Reduced-motion users receive a simpler fade.
- Existing tests and production build pass.
