import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readZonesSource() {
  return readFile(path.resolve("src/lib/exploreZones.ts"), "utf8");
}

async function readWorldSource() {
  return readFile(path.resolve("src/lib/exploreWorld.ts"), "utf8");
}

test("explore world exports the shared walk radius used by the island", async () => {
  const source = await readWorldSource();

  assert.match(source, /export const EXPLORE_SCALE = 80/);
  assert.match(source, /export const EXPLORE_HEIGHT_SCALE = 0\.6/);
  assert.match(source, /export const EXPLORE_HILLS = 15/);
  assert.match(source, /export const EXPLORE_WALK_RADIUS = ISLAND_RADIUS \* EXPLORE_SCALE \* 0\.74/);
});

test("explore zones define the ten C1 districts", async () => {
  const source = await readZonesSource();
  const expected = [
    ["home", "家"],
    ["beach", "海滩"],
    ["rice", "稻田"],
    ["mountain", "山"],
    ["forest", "森林"],
    ["town", "小镇"],
    ["farm", "农村"],
    ["zoo", "动物园"],
    ["swamp", "沼泽地"],
    ["scenic", "风景区"],
  ];

  for (const [key, label] of expected) {
    assert.match(source, new RegExp(`key: "${key}"`));
    assert.match(source, new RegExp(`label: "${label}"`));
  }
  assert.match(source, /export const EXPLORE_ZONE_KEYS/);
  assert.match(source, /export const EXPLORE_MAP_POIS/);
});

test("explore zones expose position and ambience helpers", async () => {
  const source = await readZonesSource();

  assert.match(source, /export function findExploreZone/);
  assert.match(source, /export function exploreZoneAmbience/);
  assert.match(source, /ambience: "brook"/);
  assert.match(source, /ambience: "forest"/);
  assert.match(source, /ambience: "bay"/);
});
