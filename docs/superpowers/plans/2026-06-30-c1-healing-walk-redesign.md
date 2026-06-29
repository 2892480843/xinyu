# C1 Healing Walk Redesign Plan

## Scope

把 C1 的功能完成态调整成 B 方向的“治愈散步感”：近景相机、区域识别、雨天氛围。

## Steps

1. Add a failing source-level test for healing-walk presentation constants and integration points.
2. Add shared presentation constants for camera, rain, and district visuals.
3. Wire the player camera and Canvas default camera to the healing-walk values.
4. Strengthen rain visuals and rainy environment colors.
5. Add district ground patches and larger landmark groupings for the added island zones.
6. Run focused tests, full tests, build, and browser screenshot verification.

## Verification

- `npm test -- tests/exploreC1Integration.test.mjs`
- `npm test`
- `npm run build`
- Playwright desktop and mobile smoke screenshots against `http://127.0.0.1:5173/`
