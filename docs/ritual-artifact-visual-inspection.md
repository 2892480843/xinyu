# Ritual Artifact Visual Inspection

Date: 2026-06-29

## Scope

Visual pass for the five dedicated ritual artifact GLBs added after the 16-item artifact registry mapping:

- `star_wish`
- `sail`
- `silent_shell`
- `glyph_stone`
- `bloom`

## Results

| Artifact | Screenshot | Result | Notes |
|---|---|---|---|
| `star_wish` | `docs/screenshots/ritual-artifact-star-wish-final.png` | Pass | Moved to open grass and added `StarWishTop` so the star shape reads from gameplay angles. |
| `sail` | `docs/screenshots/ritual-artifact-sail-close.png` | Pass | Clear silhouette on beach; no visible sinking or obstruction. |
| `silent_shell` | `docs/screenshots/ritual-artifact-silent-shell-close.png` | Pass | Clear scale and readable shell body on sand. |
| `glyph_stone` | `docs/screenshots/ritual-artifact-glyph-stone-final.png` | Pass | Added `GlyphBack` so the glowing glyph remains visible from the inspected side. |
| `bloom` | `docs/screenshots/ritual-artifact-bloom-recheck.png` | Pass | Moved to open grass and increased placement scale for readability. |

## Verification

- `npm test`
- `npm run build`

Both commands passed after the visual adjustments.
