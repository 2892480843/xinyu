import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readExploreSource() {
  return readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("explore map is driven by the C1 zone registry", async () => {
  const source = await readExploreSource();
  const mapBlock = sourceBlock(source, "type PoiKind", "function smoothClosedPath");
  const iconBlock = sourceBlock(source, "function PoiIcon", "function IslandMapBody");

  assert.match(source, /EXPLORE_MAP_POIS/);
  assert.match(mapBlock, /type PoiKind = ExplorePoiKind/);
  assert.match(mapBlock, /const MAP_POIS: MapPoi\[] = EXPLORE_MAP_POIS/);
  for (const kind of ["home", "rice", "farm", "mountain", "forest", "zoo", "swamp", "scenic"]) {
    assert.match(iconBlock, new RegExp(`case "${kind}"`));
  }
});
