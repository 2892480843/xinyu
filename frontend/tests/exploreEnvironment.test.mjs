import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readEnvironmentSource() {
  return readFile(path.resolve("src/lib/exploreEnvironment.ts"), "utf8");
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("explore environment defines four times and only public clear or rain weather options", async () => {
  const source = await readEnvironmentSource();
  const weatherOptionsBlock = sourceBlock(source, "export const EXPLORE_WEATHER_OPTIONS", "];\n\nexport const DEFAULT_EXPLORE_ENVIRONMENT");

  for (const value of ["dawn", "noon", "sunset", "night"]) {
    assert.match(source, new RegExp(`value: "${value}"`));
  }
  assert.match(source, /export type ExploreWeather = "clear" \| "rain" \| "meteor"/);
  assert.match(source, /label: "日出"/);
  assert.match(source, /label: "中午"/);
  assert.match(source, /label: "夕阳"/);
  assert.match(source, /label: "夜晚"/);
  assert.match(weatherOptionsBlock, /label: "晴天"/);
  assert.match(weatherOptionsBlock, /label: "下雨"/);
  assert.doesNotMatch(weatherOptionsBlock, /label: "流星夜"/);
  assert.doesNotMatch(weatherOptionsBlock, /value: "meteor"/);
  assert.match(source, /value === "clear" \|\| value === "rain"/);
  assert.doesNotMatch(source, /value === "clear" \|\| value === "rain" \|\| value === "meteor"/);
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

test("meteor night has its own cinematic sky and does not reuse rain visuals", async () => {
  const source = await readEnvironmentSource();
  const meteorBlock = sourceBlock(source, 'if (environment.weather === "meteor")', "  return {\n    ...base,");

  assert.match(meteorBlock, /skyTop: "#02040f"/);
  assert.match(meteorBlock, /skyMid: "#11153d"/);
  assert.match(meteorBlock, /skyBottom: "#322052"/);
  assert.match(meteorBlock, /rainOpacity: 0/);
  assert.doesNotMatch(meteorBlock, /skyTop: "#435f73"/);
});
