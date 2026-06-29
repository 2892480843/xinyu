import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readEnvironmentSource() {
  return readFile(path.resolve("src/lib/exploreEnvironment.ts"), "utf8");
}

test("explore environment defines four times and rain weather", async () => {
  const source = await readEnvironmentSource();

  for (const value of ["dawn", "noon", "sunset", "night"]) {
    assert.match(source, new RegExp(`value: "${value}"`));
  }
  assert.match(source, /export type ExploreWeather = "clear" \| "rain"/);
  assert.match(source, /label: "日出"/);
  assert.match(source, /label: "中午"/);
  assert.match(source, /label: "夕阳"/);
  assert.match(source, /label: "夜晚"/);
  assert.match(source, /label: "下雨"/);
});

test("explore environment persists new keys and migrates legacy xy_night", async () => {
  const source = await readEnvironmentSource();

  assert.match(source, /EXPLORE_TIME_STORAGE_KEY = "xy_explore_time"/);
  assert.match(source, /EXPLORE_WEATHER_STORAGE_KEY = "xy_explore_weather"/);
  assert.match(source, /storage\.getItem\("xy_night"\) === "1"/);
  assert.match(source, /timeOfDay: "night"/);
  assert.match(source, /weather: "clear"/);
});

test("explore environment exposes visual values for sky and light", async () => {
  const source = await readEnvironmentSource();

  assert.match(source, /skyTop/);
  assert.match(source, /skyMid/);
  assert.match(source, /skyBottom/);
  assert.match(source, /directional/);
  assert.match(source, /ambient/);
  assert.match(source, /fogNear/);
  assert.match(source, /rainOpacity/);
});
