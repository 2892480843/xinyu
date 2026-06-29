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
  for (const kind of ["beach", "town", "home", "rice", "farm", "mountain", "forest", "zoo", "swamp", "scenic"]) {
    assert.match(iconBlock, new RegExp(`case "${kind}"`));
  }
});

test("explore mode exposes time-of-day and rain controls", async () => {
  const source = await readExploreSource();
  const menuBlock = sourceBlock(source, "xy-explore-menu", "换装面板");
  const sceneSignature = sourceBlock(source, "function ExploreScene({", "}) {");
  const sceneBlock = sourceBlock(source, "function ExploreScene({", "function ExploreMode");
  const skyTextureBlock = sourceBlock(source, "const skyTex = useMemo", "useEffect(() => () => skyTex.dispose()");

  assert.match(source, /DEFAULT_EXPLORE_ENVIRONMENT/);
  assert.match(source, /loadExploreEnvironment/);
  assert.match(source, /saveExploreEnvironment/);
  assert.match(source, /EXPLORE_TIME_OPTIONS/);
  assert.match(source, /EXPLORE_WEATHER_OPTIONS/);
  assert.match(source, /environment=\{environment\}/);
  assert.match(sceneSignature, /environment,/);
  assert.match(sceneSignature, /environment: ExploreEnvironment;/);
  assert.match(sceneBlock, /resolveExploreEnvironmentVisual\(visual, environment\)/);
  assert.match(source, /saveExploreEnvironment\(localStorage, environment\)/);
  assert.doesNotMatch(source, /localStorage\.setItem\("xy_night"/);
  assert.match(skyTextureBlock, /envVisual\.skyTop/);
  assert.match(skyTextureBlock, /envVisual\.skyMid/);
  assert.match(skyTextureBlock, /envVisual\.skyBottom/);
  assert.doesNotMatch(skyTextureBlock, /grd\.addColorStop\(0,\s*"#[0-9a-fA-F]{6}"/);
  assert.doesNotMatch(skyTextureBlock, /if\s*\(\s*forceNight\s*\)/);
  assert.match(menuBlock, /时辰/);
  assert.match(menuBlock, /天气/);
  assert.match(menuBlock, /日出/);
  assert.match(menuBlock, /中午/);
  assert.match(menuBlock, /夕阳/);
  assert.match(menuBlock, /夜晚/);
  assert.match(menuBlock, /晴天/);
  assert.match(menuBlock, /下雨/);
  assert.doesNotMatch(menuBlock, /切白天|切夜晚/);
});

test("explore mode renders rain visuals and enables weather ambience", async () => {
  const explore = await readExploreSource();
  const ambience = await readFile(path.resolve("src/lib/locationAmbience.ts"), "utf8");
  const mutedBlock = sourceBlock(ambience, "export function setLocationAmbienceMuted", "export function setWeatherAmbience");
  const weatherBlock = sourceBlock(ambience, "export function setWeatherAmbience", "export function stopLocationAmbience");
  const stopBlock = ambience.slice(ambience.indexOf("export function stopLocationAmbience"));

  assert.match(explore, /function ExploreRain/);
  assert.match(explore, /<ExploreRain/);
  assert.match(explore, /environment\.weather === "rain"/);
  assert.match(ambience, /setWeatherAmbience/);
  assert.match(ambience, /rain: "rain"/);
  assert.match(ambience, /weatherPool/);
  assert.match(ambience, /activeWeather/);
  assert.match(mutedBlock, /if \(enabled && activeZone\)[\s\S]*?\n\s*}\n\s*if \(activeWeather\)/);
  assert.match(weatherBlock, /if \(!on \|\| weather === "clear"\)/);
  assert.match(weatherBlock, /activeWeather = null;/);
  assert.match(weatherBlock, /clearWeatherFade\(w\)/);
  assert.match(weatherBlock, /el\.pause\(\);\n\s*el\.currentTime = 0;/);
  assert.match(stopBlock, /activeWeather = null;/);
  assert.match(stopBlock, /clearWeatherFade\(weather\)/);
  assert.match(stopBlock, /el\.pause\(\);\n\s*el\.currentTime = 0;/);
});

test("explore scene renders C1 district groups", async () => {
  const source = await readExploreSource();
  const sceneBlock = sourceBlock(source, "function ExploreScene", "function ExploreMode");

  for (const name of ["HomeDistrict", "RiceFieldDistrict", "FarmDistrict", "ZooDistrict", "SwampDistrict", "ScenicDistrict", "IslandDistricts"]) {
    assert.match(source, new RegExp(`function ${name}`));
  }
  assert.match(sceneBlock, /<IslandDistricts/);
  assert.match(sceneBlock, /environment=\{environment\}/);
  assert.match(source, /MODELS\.natCropSprout/);
  assert.match(source, /MODELS\.natReed/);
  assert.match(source, /MODELS\.natLotus/);
  assert.match(source, /MODELS\.critterFox/);
  assert.match(source, /MODELS\.critterCat/);
  assert.match(source, /MODELS\.critterOwl/);
});
