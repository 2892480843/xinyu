import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("home explore entry uses a timed sea-mist arrival overlay", () => {
  const home = read("../src/pages/Home.tsx");

  assert.match(home, /const EXPLORE_ARRIVAL_MIN_MS = 1150/);
  assert.match(home, /function IslandArrivalOverlay\(\{ visual \}: \{ visual: SceneVisual \}\)/);
  assert.match(home, /const \[exploreArrivalVisible,\s*setExploreArrivalVisible\] = useState\(false\)/);
  assert.match(home, /const openExploreMode = useCallback/);
  assert.match(home, /setExploreArrivalVisible\(true\);[\s\S]*setExploreOpen\(true\);/);
  assert.match(home, /window\.setTimeout\(\(\) => \{[\s\S]*setExploreArrivalVisible\(false\);[\s\S]*\}, EXPLORE_ARRIVAL_MIN_MS\)/);
  assert.match(home, /onClick=\{openExploreMode\}/);
  assert.match(home, /<IslandArrivalOverlay key="explore-arrival" visual=\{visual\} \/>/);
  assert.match(home, /role="status"/);
  assert.match(home, /aria-live="polite"/);
});

test("sea-mist arrival overlay has CSS motion and reduced-motion fallback", () => {
  const css = read("../src/index.css");

  assert.match(css, /\.island-arrival-overlay\s*\{/);
  assert.match(css, /\.island-arrival-mist\s*\{/);
  assert.match(css, /\.island-arrival-mist--near\s*\{/);
  assert.match(css, /@keyframes island-arrival-drift/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.island-arrival-overlay\s+\*[\s\S]*animation:\s*none/);
});
