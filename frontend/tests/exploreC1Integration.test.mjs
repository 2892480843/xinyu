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
  const districtBlock = sourceBlock(source, "function HomeDistrict", "function ExploreScene");

  for (const name of [
    "HomeDistrict",
    "BeachDistrict",
    "RiceFieldDistrict",
    "MountainDistrict",
    "ForestDistrict",
    "TownDistrict",
    "FarmDistrict",
    "ZooDistrict",
    "SwampDistrict",
    "ScenicDistrict",
    "IslandDistricts",
  ]) {
    assert.match(source, new RegExp(`function ${name}`));
  }
  for (const tag of [
    "<HomeDistrict",
    "<BeachDistrict",
    "<RiceFieldDistrict",
    "<MountainDistrict",
    "<ForestDistrict",
    "<TownDistrict",
    "<FarmDistrict",
    "<ZooDistrict",
    "<SwampDistrict",
    "<ScenicDistrict",
  ]) {
    assert.match(source, new RegExp(tag));
  }
  assert.match(sceneBlock, /<IslandDistricts/);
  assert.match(sceneBlock, /environment=\{environment\}/);
  assert.match(districtBlock, /MODELS\.natCropSprout/);
  assert.match(districtBlock, /MODELS\.beachDeckchair/);
  assert.match(districtBlock, /MODELS\.beachTidepool/);
  assert.match(districtBlock, /MODELS\.isleStepstones/);
  assert.match(districtBlock, /MODELS\.isleSwing/);
  assert.match(districtBlock, /MODELS\.isleBridge/);
  assert.match(districtBlock, /MODELS\.natPine/);
  assert.match(districtBlock, /MODELS\.townParasol/);
  assert.match(districtBlock, /MODELS\.natReed/);
  assert.match(districtBlock, /MODELS\.natLotus/);
  assert.match(districtBlock, /MODELS\.critterFox/);
  assert.match(districtBlock, /MODELS\.critterCat/);
  assert.match(districtBlock, /MODELS\.critterOwl/);
  assert.match(districtBlock, /MODELS\.critterFish/);
});

test("explore districts do not render large translucent guide patches", async () => {
  const source = await readExploreSource();
  const patchBlock = sourceBlock(source, "function DistrictGroundPatch", "function DistrictFlatTile");

  assert.match(patchBlock, /return null;/);
  assert.doesNotMatch(patchBlock, /meshBasicMaterial color=\{patch\.color\}/);
  assert.doesNotMatch(patchBlock, /meshBasicMaterial color=\{patch\.ring\}/);
});

test("explore districts drive proximity prompts and location ambience", async () => {
  const source = await readExploreSource();
  const audioBlock = sourceBlock(source, "function LocationAudio", "const MAP_VIEW");
  const proximityBlock = sourceBlock(source, "function DistrictProximity", "function ExploreScene");

  assert.match(source, /findExploreZone/);
  assert.match(source, /exploreZoneAmbience/);
  assert.match(source, /function DistrictProximity/);
  assert.match(source, /nearDistrict/);
  assert.match(source, /回家坐一会儿/);
  assert.match(source, /稻田在风里轻轻摆/);
  assert.match(source, /沼泽回声/);
  assert.match(source, /登高望岛/);
  assert.match(audioBlock, /findExploreZone\(p\.x,\s*p\.z\)/);
  assert.match(audioBlock, /exploreZoneAmbience/);
  assert.match(source, /<LocationAudio posRef=\{posRef\} night=\{isNight\} \/>/);
  assert.doesNotMatch(source, /<LocationAudio posRef=\{posRef\} night=\{visual\.time === "night"/);
  assert.match(proximityBlock, /tick\.current = 0\.25/);
  assert.match(proximityBlock, /key !== lastKey\.current/);
  assert.match(proximityBlock, /onNear\(zone\)/);
});

test("explore C1 uses far-map island arrival camera tuning", async () => {
  const source = await readExploreSource();
  const presentation = await readFile(path.resolve("src/lib/explorePresentation.ts"), "utf8");
  const playerBlock = sourceBlock(source, "function Player", "function Wishes");
  const rainBlock = sourceBlock(source, "function ExploreRain", "function HomeDistrict");
  const districtBlock = sourceBlock(source, "function DistrictGroundPatch", "function IslandDistricts");

  assert.match(source, /HEALING_WALK_CAMERA/);
  assert.match(source, /HEALING_RAIN_PRESENTATION/);
  assert.match(source, /HEALING_DISTRICT_PRESENTATION/);
  assert.match(presentation, /introSeconds:\s*3\.2/);
  assert.match(presentation, /introSideAngle:\s*2\.2/);
  assert.match(presentation, /introExtraDist:\s*120/);
  assert.match(presentation, /introExtraHeight:\s*130/);
  assert.match(presentation, /canvasPosition:\s*\[0,\s*150,\s*290\]\s*as const/);
  assert.match(presentation, /canvasFov:\s*50/);
  assert.match(presentation, /lookAhead:\s*1\.9/);
  assert.match(presentation, /normalCount:\s*260/);
  assert.match(presentation, /lowCount:\s*140/);
  assert.match(playerBlock, /HEALING_WALK_CAMERA\.introExtraDist/);
  assert.match(playerBlock, /HEALING_WALK_CAMERA\.introExtraHeight/);
  assert.match(playerBlock, /HEALING_WALK_CAMERA\.lookAhead/);
  assert.match(rainBlock, /HEALING_RAIN_PRESENTATION\.normalCount/);
  assert.match(rainBlock, /HEALING_RAIN_PRESENTATION\.lowCount/);
  assert.match(districtBlock, /HEALING_DISTRICT_PRESENTATION\.home/);
  assert.match(districtBlock, /HEALING_DISTRICT_PRESENTATION\.rice/);
  assert.match(districtBlock, /HEALING_DISTRICT_PRESENTATION\.farm/);
  assert.match(districtBlock, /HEALING_DISTRICT_PRESENTATION\.zoo/);
  assert.match(districtBlock, /HEALING_DISTRICT_PRESENTATION\.swamp/);
  assert.match(districtBlock, /HEALING_DISTRICT_PRESENTATION\.scenic/);
  assert.match(source, /<DistrictGroundPatch/);
});
