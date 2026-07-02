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

test("explore mode keeps meteor sky internal without a public weather menu option", async () => {
  const source = await readExploreSource();
  const environment = await readFile(path.resolve("src/lib/exploreEnvironment.ts"), "utf8");
  const sceneBlock = sourceBlock(source, "function ExploreScene({", "function ExploreMode");
  const modeBlock = sourceBlock(source, "const isMeteorNight", "return (");
  const weatherOptionsBlock = sourceBlock(environment, "export const EXPLORE_WEATHER_OPTIONS", "];\n\nexport const DEFAULT_EXPLORE_ENVIRONMENT");

  assert.doesNotMatch(weatherOptionsBlock, /label:\s*"流星夜"/);
  assert.doesNotMatch(weatherOptionsBlock, /value:\s*"meteor"/);
  assert.match(modeBlock, /environment\.weather === "meteor"/);
  assert.match(modeBlock, /setWeatherAmbience\(environment\.weather === "rain" \? "rain" : "clear"/);
  assert.match(sceneBlock, /meteorShowerCount/);
  assert.match(sceneBlock, /meteorMode=\{isMeteorNight\}/);
  assert.match(sceneBlock, /isMeteorNight \|\| visual\.time === "night"/);
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

test("rice district renders finished flat farm terraces", async () => {
  const source = await readExploreSource();
  const zones = await readFile(path.resolve("src/lib/exploreZones.ts"), "utf8");
  const presentation = await readFile(path.resolve("src/lib/explorePresentation.ts"), "utf8");
  const modelBlock = sourceBlock(source, "const MODELS =", "const EXPLORE_PREFETCH_MODELS");
  const paddyLayoutBlock = sourceBlock(source, "const RICE_PADDY_LAYOUT", "type RicePaddyPlot");
  const paddyWaterBlock = sourceBlock(source, "const RICE_PADDY_LAYOUT", "function RiceFieldDistrict");
  const retainingWallBlock = sourceBlock(source, "function RicePaddyRetainingWall", "function RicePaddyBermStrip");
  const riceBlock = sourceBlock(source, "function RiceFieldDistrict", "function MountainDistrict");

  assert.match(zones, /label:\s*"稻田"/);
  assert.doesNotMatch(zones, /label:\s*"麦田"/);
  assert.match(zones, /key:\s*"rice"[\s\S]*?x:\s*48,\s*z:\s*-68/);
  assert.match(source, /稻田映着天空/);
  assert.match(presentation, /rice:\s*\{\s*x:\s*48,\s*z:\s*-68/);
  assert.match(modelBlock, /bgBird:\s*"\/models\/xy_bg_bird\.glb"/);
  assert.match(paddyLayoutBlock, /\{ dx: -15,\s*dz: -10,\s*w: 24,\s*d: 16,\s*rot: 0 \}/);
  assert.match(paddyLayoutBlock, /\{ dx: 15,\s*dz: -10,\s*w: 24,\s*d: 16,\s*rot: 0 \}/);
  assert.match(paddyLayoutBlock, /\{ dx: -15,\s*dz: 10,\s*w: 24,\s*d: 16,\s*rot: 0 \}/);
  assert.match(paddyLayoutBlock, /\{ dx: 15,\s*dz: 10,\s*w: 24,\s*d: 16,\s*rot: 0 \}/);
  assert.doesNotMatch(paddyLayoutBlock, /rot:\s*-?0\.\d+/);
  assert.match(paddyWaterBlock, /meshStandardMaterial color="#79cbd0"/);
  assert.match(paddyWaterBlock, /meshToonMaterial color="#d9be72"/);
  assert.match(retainingWallBlock, /meshToonMaterial[\s\S]*?vertexColors/);
  assert.doesNotMatch(retainingWallBlock, /meshToonMaterial color="#d9be72"/);
  assert.doesNotMatch(retainingWallBlock, /meshToonMaterial color="#8b7650"/);
  assert.match(paddyWaterBlock, /new THREE\.ConeGeometry\(0\.05,\s*0\.62,\s*5\)/);
  assert.match(paddyWaterBlock, /<InstancedField geo=\{seedlingGeo\} material=\{seedlingMat\} items=\{seedlingItems\}/);
  assert.match(paddyWaterBlock, /new THREE\.ConeGeometry\(0\.07,\s*0\.24,\s*5\)/);
  assert.match(paddyWaterBlock, /const grainHeadItems = useMemo<InstItem\[]>\(\(\) => \{/);
  assert.match(paddyWaterBlock, /<InstancedField geo=\{grainHeadGeo\} material=\{grainHeadMat\} items=\{grainHeadItems\}/);
  assert.match(paddyWaterBlock, /function RicePaddyTerrainSurface/);
  assert.match(paddyWaterBlock, /function RicePaddyRetainingWall/);
  assert.match(paddyWaterBlock, /function RicePaddyBermStrip/);
  assert.match(paddyWaterBlock, /function RicePaddyShineStrip/);
  assert.match(paddyWaterBlock, /function ricePaddyFlatY/);
  assert.match(paddyWaterBlock, /function ricePaddyGridLocalPoint/);
  assert.match(paddyWaterBlock, /function buildRicePaddySurfaceGeometry/);
  assert.match(paddyWaterBlock, /function buildRicePaddyRetainingWallGeometry/);
  assert.match(paddyWaterBlock, /const groundY = placeableGroundY\(x,\s*z\)/);
  assert.match(paddyWaterBlock, /terrainGrassColor\(x,\s*z,\s*groundY,\s*wallColor\)/);
  assert.match(paddyWaterBlock, /geo\.setAttribute\("color",\s*new THREE\.Float32BufferAttribute\(colors,\s*3\)\)/);
  assert.match(paddyWaterBlock, /function buildRicePaddyBermGeometry/);
  assert.match(paddyWaterBlock, /Math\.max\(\.\.\.samples\.map/);
  assert.match(paddyWaterBlock, /ricePaddyFlatY\(plot,\s*yLift\)/);
  assert.match(paddyWaterBlock, /function buildRicePaddySurfaceGeometry\(plot: RicePaddyPlot, segmentsX = 8, segmentsZ = 6, yLift = 0\.22\)/);
  assert.match(paddyWaterBlock, /groundY \+ bottomLift/);
  assert.match(paddyWaterBlock, /function buildRicePaddyBermGeometry\(plot: RicePaddyPlot, side: RicePaddyBermSide, yLift = 0\.28\)/);
  assert.match(paddyWaterBlock, /side=\{THREE\.DoubleSide\}/);
  assert.match(paddyWaterBlock, /transparent opacity=\{0\.84\}/);
  assert.match(paddyWaterBlock, /const rowCount = Math\.max\(4,\s*Math\.round\(\(plot\.d - 4\) \/ 3\.2\)\)/);
  assert.match(paddyWaterBlock, /const colCount = Math\.max\(5,\s*Math\.round\(\(plot\.w - 4\.8\) \/ 3\.2\)\)/);
  assert.match(paddyWaterBlock, /ricePaddyGridLocalPoint\(plot,\s*col,\s*colCount,\s*row,\s*rowCount,\s*2\.4,\s*2\)/);
  assert.match(paddyWaterBlock, /r:\s*\[0,\s*plot\.rot,\s*0\]/);
  assert.match(paddyWaterBlock, /<RicePaddyRetainingWall key=\{`wall-\$\{i\}`\}/);
  assert.match(paddyWaterBlock, /<RicePaddyShineStrip key=\{`shine-\$\{i\}`\}/);
  assert.doesNotMatch(paddyWaterBlock, /positions\.push\(x,\s*placeableGroundY\(x,\s*z\) \+ yLift,\s*z\)/);
  assert.doesNotMatch(paddyWaterBlock, /p:\s*\[x,\s*placeableGroundY\(x,\s*z\) \+ 0\.42,\s*z\]/);
  assert.doesNotMatch(paddyWaterBlock, /\(hash2\(plotIndex \* 73 \+ i,\s*2\.3\) - 0\.5\) \* \(plot\.w - 2\.4\)/);
  assert.doesNotMatch(paddyWaterBlock, /\(hash2\(plotIndex \* 73 \+ i,\s*5\.9\) - 0\.5\) \* \(plot\.d - 2\.0\)/);
  assert.doesNotMatch(paddyWaterBlock, /<planeGeometry args=\{\[plot\.w,\s*plot\.d\]\}/);
  assert.doesNotMatch(paddyWaterBlock, /<boxGeometry args=\{\[plot\.w \+ 1\.2/);
  assert.doesNotMatch(paddyWaterBlock, /<planeGeometry args=\{\[len,\s*0\.28\]\}/);
  assert.match(paddyWaterBlock, /RicePaddyWater/);
  assert.doesNotMatch(source, /function WheatPaddyWater/);
  assert.match(source, /function FieldScarecrow/);
  assert.match(source, /meshToonMaterial color="#d9b45d"/);
  assert.match(source, /meshToonMaterial color="#6f8f5f"/);
  assert.match(source, /meshToonMaterial color="#c89b4e"/);
  assert.match(source, /meshToonMaterial color="#7b5630"/);
  assert.match(source, /placeableGroundY\(x,\s*z\)/);
  assert.match(source, /baseY\?: number/);
  assert.match(source, /const y = baseY \?\? placeableGroundY\(x,\s*z\)/);
  assert.match(riceBlock, /<RicePaddyWater/);
  assert.match(riceBlock, /<FieldScarecrow/);
  assert.match(riceBlock, /const scarecrowAnchors = \[/);
  assert.match(riceBlock, /baseY=\{ricePaddyFlatY\(plot,\s*0\.34\)\}/);
  assert.doesNotMatch(riceBlock, /<FieldScarecrow grad=\{grad\} x=\{p\.x - 24\} z=\{p\.z - 2\}/);
  assert.doesNotMatch(riceBlock, /<FieldEgret/);
  assert.match(riceBlock, /const flatY = ricePaddyFlatY\(plot,\s*0\.3\)/);
  assert.match(riceBlock, /ricePaddyGridLocalPoint\(plot,\s*c,\s*colCount,\s*r,\s*rowCount,\s*3,\s*2\.8\)/);
  assert.match(riceBlock, /<GltfProp key=\{`\$\{plotIndex\}-\$\{r\}-\$\{c\}`\} url=\{MODELS\.natCropSprout\}/);
  assert.match(riceBlock, /position=\{\[x,\s*flatY,\s*z\]\}/);
  assert.match(riceBlock, /rotation=\{\[0,\s*plot\.rot,\s*0\]\}/);
  assert.doesNotMatch(riceBlock, /\+ \(hash2\(plotIndex \* 91 \+ r \* 7 \+ c,\s*1\.7\) - 0\.5\) \* 0\.55/);
  assert.doesNotMatch(riceBlock, /\+ \(hash2\(plotIndex \* 91 \+ r \* 7 \+ c,\s*4\.2\) - 0\.5\) \* 0\.44/);
  assert.doesNotMatch(riceBlock, /url=\{MODELS\.natCropSprout\} grad=\{grad\} x=\{x\} z=\{z\}/);
  assert.match(riceBlock, /MODELS\.bgBird/);
  assert.match(riceBlock, /MODELS\.houseCottage/);
  assert.match(riceBlock, /MODELS\.townFence/);
  assert.match(riceBlock, /MODELS\.natReed/);
});

test("rural town mountain and forest districts render built signature scenes", async () => {
  const source = await readExploreSource();
  const mountainBlock = sourceBlock(source, "function MountainDistrict", "function ForestDistrict");
  const forestBlock = sourceBlock(source, "function ForestDistrict", "function TownDistrict");
  const townBlock = sourceBlock(source, "function TownDistrict", "function FarmDistrict");
  const farmBlock = sourceBlock(source, "function FarmDistrict", "function ZooDistrict");
  const farmCoreBlock = sourceBlock(source, "function FarmsteadDistrictCore", "function TownMarketSquare");
  const townCoreBlock = sourceBlock(source, "function TownMarketSquare", "function MountainStepPath");
  const townPaversBlock = sourceBlock(source, "function TownMarketPavers", "function TownMarketSquare");
  const mountainPathBlock = sourceBlock(source, "function MountainStepPath", "function MountainTrailScene");
  const mountainMarkersBlock = sourceBlock(source, "function MountainTrailMarkers", "function ForestUnderstory");
  const mountainCoreBlock = sourceBlock(source, "function MountainTrailScene", "function ForestUnderstory");
  const forestCoreBlock = sourceBlock(source, "function ForestUnderstory", "function MountainDistrict");
  const islandBlock = sourceBlock(source, "function IslandDistricts", "function ExploreScene");

  for (const name of ["FarmSoilBed", "FarmSoilRows", "FarmsteadDistrictCore", "TownMarketPavers", "TownMarketSquare", "MountainTrailMarkers", "MountainTrailScene", "ForestCampClearing", "ForestCampGrove"]) {
    assert.match(source, new RegExp(`function ${name}`));
  }
  for (const name of ["MountainDistrict", "ForestDistrict", "TownDistrict", "FarmDistrict"]) {
    assert.match(source, new RegExp(`function ${name}`));
    assert.match(islandBlock, new RegExp(`<${name}`));
  }

  assert.match(farmBlock, /<FarmsteadDistrictCore/);
  assert.match(townBlock, /<TownMarketSquare/);
  assert.match(mountainBlock, /<MountainTrailScene/);
  assert.match(forestBlock, /<ForestCampGrove/);

  assert.match(farmCoreBlock, /<FarmCropRows/);
  assert.match(farmCoreBlock, /<FarmSoilRows/);
  assert.doesNotMatch(farmCoreBlock, /<FarmSoilBed/);
  assert.match(farmCoreBlock, /<FieldScarecrow/);
  assert.match(farmCoreBlock, /MODELS\.houseCottage/);
  assert.match(farmBlock, /DistrictFlatTile/);
  assert.match(farmCoreBlock, /MODELS\.houseVilla/);
  assert.match(farmCoreBlock, /MODELS\.isleWell/);
  assert.match(farmCoreBlock, /MODELS\.natCropSprout/);
  assert.match(farmCoreBlock, /MODELS\.townHaystack/);
  assert.match(farmCoreBlock, /MODELS\.townFence/);
  assert.match(farmCoreBlock, /MODELS\.windmill/);

  assert.match(townCoreBlock, /<TownMarketPavers/);
  assert.match(townPaversBlock, /placeableGroundY/);
  assert.match(townPaversBlock, /polygonOffset/);
  assert.match(townCoreBlock, /MODELS\.houseShop/);
  assert.match(townCoreBlock, /MODELS\.houseCafe/);
  assert.match(townCoreBlock, /MODELS\.houseMachiya/);
  assert.match(townCoreBlock, /MODELS\.houseRound/);
  assert.match(townCoreBlock, /MODELS\.isleStall/);
  assert.match(townCoreBlock, /MODELS\.townLamppost/);
  assert.match(townCoreBlock, /MODELS\.townParasol/);
  assert.match(townCoreBlock, /MODELS\.townBench/);

  assert.match(mountainBlock, /DistrictFlatTile/);
  assert.match(mountainBlock, /MODELS\.natRock/);
  assert.match(mountainCoreBlock, /<MountainStepPath/);
  assert.match(mountainCoreBlock, /<MountainTrailMarkers/);
  assert.match(mountainPathBlock, /MODELS\.isleStepstones/);
  assert.match(mountainMarkersBlock, /meshToonMaterial/);
  assert.match(mountainCoreBlock, /MODELS\.terrCliff/);
  assert.match(mountainCoreBlock, /MODELS\.cairn/);
  assert.match(mountainCoreBlock, /MODELS\.torii/);
  assert.match(mountainCoreBlock, /MODELS\.isleLookout/);
  assert.match(mountainCoreBlock, /MODELS\.natPine/);

  assert.match(forestBlock, /DistrictCircleTile/);
  assert.match(forestCoreBlock, /<ForestCampClearing/);
  assert.match(forestCoreBlock, /<ForestUnderstory/);
  assert.match(forestCoreBlock, /MODELS\.natRock/);
  assert.match(forestCoreBlock, /MODELS\.natPine/);
  assert.match(forestCoreBlock, /MODELS\.natBroad/);
  assert.match(forestCoreBlock, /MODELS\.natBush/);
  assert.match(forestCoreBlock, /MODELS\.natMushroom/);
  assert.match(forestCoreBlock, /MODELS\.bonfire/);
  assert.match(forestCoreBlock, /MODELS\.isleTent/);
  assert.match(forestCoreBlock, /MODELS\.isleSwing/);
  assert.match(forestCoreBlock, /MODELS\.isleHammock/);
  assert.match(forestCoreBlock, /MODELS\.leafnote/);
});

test("explore districts do not render large translucent guide patches", async () => {
  const source = await readExploreSource();
  const patchBlock = sourceBlock(source, "function DistrictGroundPatch", "function DistrictFlatTile");
  const flatBlock = sourceBlock(source, "function DistrictFlatTile", "function DistrictCircleTile");
  const circleBlock = sourceBlock(source, "function DistrictCircleTile", "function DistrictLanternPair");
  const swampBlock = sourceBlock(source, "function SwampDistrict", "function ScenicDistrict");

  for (const block of [patchBlock, flatBlock, circleBlock]) {
    assert.match(block, /return null;/);
  }
  assert.doesNotMatch(patchBlock, /meshBasicMaterial color=\{patch\.color\}/);
  assert.doesNotMatch(patchBlock, /meshBasicMaterial color=\{patch\.ring\}/);
  assert.doesNotMatch(flatBlock, /meshBasicMaterial color=\{color\}/);
  assert.doesNotMatch(circleBlock, /meshBasicMaterial color=\{color\}/);
  assert.doesNotMatch(swampBlock, /meshStandardMaterial color="#4a8279"/);
});

test("district detail polish uses real local surfaces without duplicate forest scatter", async () => {
  const source = await readExploreSource();
  const forestBlock = sourceBlock(source, "function ForestDistrict", "function TownDistrict");
  const swampSurfaceBlock = sourceBlock(source, "function SwampWaterPatch", "function SwampDistrict");
  const swampBlock = sourceBlock(source, "function SwampDistrict", "function ScenicDistrict");
  const zooBlock = sourceBlock(source, "function ZooDistrict", "function SwampWaterPatch");
  const scenicBlock = sourceBlock(source, "function ScenicDistrict", "function IslandDistricts");

  assert.match(source, /function SwampWaterPatch/);
  assert.match(swampSurfaceBlock, /<TerrainEllipseSurface/);
  assert.match(swampSurfaceBlock, /color="#78b7ad"/);
  assert.match(swampSurfaceBlock, /opacity=\{0\.5\}/);
  assert.match(swampBlock, /<SwampWaterPatch/);

  assert.match(source, /function ZooHabitatPool/);
  assert.match(zooBlock, /<ZooHabitatPool/);
  assert.match(zooBlock, /MODELS\.critterFish/);

  assert.match(source, /function ScenicViewPath/);
  assert.match(scenicBlock, /<ScenicViewPath/);
  assert.match(scenicBlock, /MODELS\.isleWindchime/);

  assert.match(forestBlock, /<ForestCampGrove/);
  assert.doesNotMatch(forestBlock, /const treeSpots =/);
  assert.doesNotMatch(forestBlock, /const bushSpots =/);
  assert.doesNotMatch(forestBlock, /const mushrooms =/);
});

test("district local surfaces follow terrain instead of clipping through slopes", async () => {
  const source = await readExploreSource();
  const helperBlock = sourceBlock(source, "type TerrainSurfaceMaterialProps", "function DistrictGroundPatch");
  const homeDetailsBlock = sourceBlock(source, "function HomeYardDetails", "function HomeDistrict");
  const beachDetailsBlock = sourceBlock(source, "function BeachShoreDetails", "function BeachDistrict");
  const farmSoilBlock = sourceBlock(source, "function FarmSoilBed", "function FarmSoilRows");
  const townPaversBlock = sourceBlock(source, "function TownMarketPavers", "function TownNoticeBoard");
  const forestClearingBlock = sourceBlock(source, "function ForestCampClearing", "function ForestCampGrove");
  const zooPoolBlock = sourceBlock(source, "function ZooHabitatPool", "function ZooDistrict");
  const swampSurfaceBlock = sourceBlock(source, "function SwampWaterPatch", "function SwampDistrict");
  const scenicPathBlock = sourceBlock(source, "function ScenicViewPath", "function ScenicDistrict");

  assert.match(helperBlock, /function buildTerrainRectSurfaceGeometry/);
  assert.match(helperBlock, /function buildTerrainEllipseSurfaceGeometry/);
  assert.match(helperBlock, /function TerrainRectSurface/);
  assert.match(helperBlock, /function TerrainEllipseSurface/);
  assert.match(helperBlock, /placeableGroundY\(x,\s*z\) \+ yLift/);
  assert.match(helperBlock, /side=\{THREE\.DoubleSide\}/);
  assert.match(helperBlock, /useEffect\(\(\) => \(\) => geo\.dispose\(\), \[geo\]\)/);

  for (const block of [homeDetailsBlock, beachDetailsBlock, farmSoilBlock, townPaversBlock, forestClearingBlock, zooPoolBlock, swampSurfaceBlock, scenicPathBlock]) {
    assert.match(block, /<Terrain(?:Rect|Ellipse)Surface/);
  }

  for (const block of [homeDetailsBlock, farmSoilBlock, townPaversBlock, forestClearingBlock, zooPoolBlock, swampSurfaceBlock, scenicPathBlock]) {
    assert.doesNotMatch(block, /rotation=\{\[-Math\.PI \/ 2,\s*0,/);
    assert.doesNotMatch(block, /<planeGeometry args=/);
    assert.doesNotMatch(block, /<circleGeometry args=/);
    assert.doesNotMatch(block, /<boxGeometry args=\{\[1,\s*1,\s*0\.08\]\}/);
  }
  assert.doesNotMatch(beachDetailsBlock, /<planeGeometry args=/);
});

test("district procedural ground surfaces are not blocked by GLB suspense", async () => {
  const source = await readExploreSource();
  const exploreSceneDistrictBlock = sourceBlock(source, "<DelayedMount ms={revealDelay.districts}>", "{/* 海面(大) */}");
  const homeBlock = sourceBlock(source, "function HomeDistrict", "function BeachShoreDetails");
  const beachBlock = sourceBlock(source, "function BeachDistrict", "const RICE_PADDY_LAYOUT");
  const riceBlock = sourceBlock(source, "function RiceFieldDistrict", "function FarmSoilBed");
  const townSquareBlock = sourceBlock(source, "function TownMarketSquare", "function MountainStepPath");
  const farmCoreBlock = sourceBlock(source, "function FarmsteadDistrictCore", "function TownMarketPavers");
  const zooBlock = sourceBlock(source, "function ZooDistrict", "function SwampWaterPatch");
  const swampBlock = sourceBlock(source, "function SwampDistrict", "function ScenicPrayerFlags");
  const scenicBlock = sourceBlock(source, "function ScenicDistrict", "function IslandDistricts");

  assert.match(exploreSceneDistrictBlock, /<IslandDistricts grad=\{toonGrad\}/);
  assert.doesNotMatch(exploreSceneDistrictBlock, /<Suspense fallback=\{null\}>\s*<IslandDistricts/);

  for (const [block, surfacePattern] of [
    [homeBlock, /<HomeYardDetails/],
    [beachBlock, /<BeachShoreDetails/],
    [riceBlock, /<RicePaddyWater/],
    [townSquareBlock, /<TownMarketPavers/],
    [farmCoreBlock, /<FarmSoilRows/],
    [zooBlock, /<ZooHabitatPool/],
    [swampBlock, /<SwampWaterPatch/],
    [scenicBlock, /<ScenicPrayerFlags/],
  ]) {
    assert.match(block, surfacePattern);
    assert.match(block, /<Suspense fallback=\{null\}>/);
    assert.ok(block.search(surfacePattern) < block.indexOf("<Suspense fallback={null}>"), "procedural surface should render before GLB suspense boundary");
  }
});

test("central plaza pond is level water while rice highlights stay flat with terraces", async () => {
  const source = await readExploreSource();
  const townBlock = sourceBlock(source, "function Town({", "function Coastline");
  const helperBlock = sourceBlock(source, "function buildTerrainEllipseSurfaceGeometry", "function DistrictGroundPatch");
  const paddyShineBlock = sourceBlock(source, "function RicePaddyShineStrip", "function RicePaddyWater");
  const paddyWaterBlock = sourceBlock(source, "function RicePaddyWater", "function FieldScarecrow");

  assert.match(townBlock, /<TerrainEllipseSurface grad=\{toonGrad\} x=\{0\} z=\{0\} rx=\{4\.5\} rz=\{4\.5\}/);
  assert.match(townBlock, /color="#cabfa8"/);
  assert.match(helperBlock, /function buildFlatEllipseSurfaceGeometry/);
  assert.match(helperBlock, /positions\.push\(x,\s*y,\s*z\)/);
  assert.match(helperBlock, /function pondWaterLevel/);
  assert.match(helperBlock, /Math\.max\(waterY,\s*placeableGroundY\(x,\s*z\)\)/);
  assert.match(helperBlock, /function FlatEllipseSurface/);
  assert.match(townBlock, /const pondWaterY = pondWaterLevel\(pondX,\s*pondZ,\s*7\.2,\s*5\.8\)/);
  assert.match(townBlock, /<FlatEllipseSurface grad=\{toonGrad\} x=\{pondX\} z=\{pondZ\}/);
  assert.match(townBlock, /rx=\{7\.2\} rz=\{5\.8\}/);
  assert.match(townBlock, /y=\{pondWaterY\}/);
  assert.match(townBlock, /color="#5fb6c4"/);
  assert.match(townBlock, /opacity=\{0\.88\}/);
  assert.doesNotMatch(townBlock, /receiveShadow renderOrder=\{renderOrder\}/);
  assert.doesNotMatch(townBlock, /<circleGeometry args=\{\[4\.5,\s*32\]\}/);
  assert.doesNotMatch(townBlock, /<circleGeometry args=\{\[6,\s*30\]\}/);

  assert.match(paddyWaterBlock, /<RicePaddyShineStrip key=\{`shine-\$\{i\}`\}/);
  assert.match(paddyShineBlock, /buildRicePaddyFlatRectGeometry\(plot,\s*lx,\s*lz,\s*len,\s*0\.28,\s*rot\)/);
  assert.doesNotMatch(paddyWaterBlock, /<TerrainRectSurface key=\{`shine-\$\{i\}`\}/);
  assert.doesNotMatch(paddyWaterBlock, /<planeGeometry args=\{\[len,\s*0\.28\]\}/);
});

test("home beach town and scenic districts include close-up life details", async () => {
  const source = await readExploreSource();
  const homeDetailsBlock = sourceBlock(source, "function HomeYardDetails", "function HomeDistrict");
  const homeDistrictBlock = sourceBlock(source, "function HomeDistrict", "function BeachShoreDetails");
  const beachDetailsBlock = sourceBlock(source, "function BeachShoreDetails", "function BeachDistrict");
  const beachDistrictBlock = sourceBlock(source, "function BeachDistrict", "function RicePaddyWater");
  const townDetailsBlock = sourceBlock(source, "function TownNoticeBoard", "function TownMarketSquare");
  const townDistrictBlock = sourceBlock(source, "function TownMarketSquare", "function MountainTrailMarkers");
  const scenicDetailsBlock = sourceBlock(source, "function ScenicPrayerFlags", "function ScenicViewPath");
  const scenicDistrictBlock = sourceBlock(source, "function ScenicDistrict", "function IslandDistricts");

  assert.match(homeDetailsBlock, /color="#f4d6a3"/);
  assert.match(homeDetailsBlock, /meshToonMaterial color="#6f8f5f"/);
  assert.match(homeDistrictBlock, /<HomeYardDetails/);

  assert.match(beachDetailsBlock, /color="#fff1c7"/);
  assert.match(beachDetailsBlock, /color="#7fc7d4"/);
  assert.match(beachDistrictBlock, /<BeachShoreDetails/);

  assert.match(townDetailsBlock, /meshToonMaterial color="#7b5630"/);
  assert.match(townDetailsBlock, /meshToonMaterial color="#f0c86a"/);
  assert.match(townDistrictBlock, /<TownNoticeBoard/);

  assert.match(scenicDetailsBlock, /meshToonMaterial color="#d95f45"/);
  assert.match(scenicDetailsBlock, /meshToonMaterial color="#f0c86a"/);
  assert.match(scenicDistrictBlock, /<ScenicPrayerFlags/);
});

test("grounded explore props use no-clip terrain height and model floor offsets", async () => {
  const source = await readExploreSource();
  const groundHeightBlock = sourceBlock(source, "function placeableGroundY", "function modelGroundLift");
  const liftBlock = sourceBlock(source, "function modelGroundLift", "function GltfProp");
  const gltfBlock = sourceBlock(source, "function GltfProp", "function GroundProp");
  const groundPropBlock = sourceBlock(source, "function GroundProp", "type RitualArtifactKey");

  assert.match(groundHeightBlock, /groundYWithRoad\(x,\s*z\)/);
  assert.match(groundHeightBlock, /road\.y \+ road\.roadW \* ROAD_SURFACE_RAISE/);
  assert.match(groundHeightBlock, /landmarkGroundLift\(x,\s*z\)/);
  assert.match(groundHeightBlock, /stairsGroundLift\(x,\s*z\)/);
  assert.match(liftBlock, /new THREE\.Box3\(\)\.setFromObject\(object\)/);
  assert.match(liftBlock, /return -box\.min\.y/);
  assert.match(gltfBlock, /grounded\?: boolean/);
  assert.match(gltfBlock, /grounded \? modelGroundLift\(obj\) : 0/);
  assert.match(gltfBlock, /<group position=\{position\} rotation=\{rotation\} scale=\{scale\}>/);
  assert.match(gltfBlock, /<primitive object=\{obj\} position=\{\[0,\s*groundLift,\s*0\]\}/);
  assert.match(groundPropBlock, /placeableGroundY\(x,\s*z\) \+ yOffset/);
  assert.match(groundPropBlock, /grounded/);
});

test("random island scatter reserves C1 district footprints", async () => {
  const source = await readExploreSource();
  const clearingBlock = sourceBlock(source, "const C1_DISTRICT_CLEARINGS", "const ISLE_PROPS");
  const islePropsBlock = sourceBlock(source, "const ISLE_PROPS", "function nearIsleProp");

  for (const key of ["home", "beach", "rice", "mountain", "forest", "town", "farm", "zoo", "swamp", "scenic"]) {
    assert.match(clearingBlock, new RegExp(`HEALING_DISTRICT_PRESENTATION\\.${key}`));
  }
  assert.match(islePropsBlock, /...C1_DISTRICT_CLEARINGS/);
  assert.match(source, /nearIsleProp\(x,\s*z,\s*1\.5\)/);
});

test("C1 district solid props are registered as collision blockers", async () => {
  const source = await readExploreSource();
  const colliderBlock = sourceBlock(source, "type DistrictPresentationKey", "function beachAngleDelta");
  const gridBlock = sourceBlock(source, "useEffect(() => {\n    if (!collidersRef) return;", "collidersRef.current = buildColliderGrid(list);");

  for (const key of ["home", "beach", "rice", "mountain", "forest", "town", "farm", "zoo", "swamp", "scenic"]) {
    assert.match(colliderBlock, new RegExp(`districtCollider\\("${key}"`));
  }
  assert.match(colliderBlock, /type DistrictCollider = Collider & \{ district: DistrictPresentationKey \}/);
  assert.match(colliderBlock, /const MIN_DISTRICT_COLLIDER_RADIUS = 0\.45/);
  assert.match(colliderBlock, /Math\.max\(MIN_DISTRICT_COLLIDER_RADIUS,\s*r\)/);
  assert.match(colliderBlock, /districtCollider\("rice", 11, -12, 1\.1\)/);
  assert.match(colliderBlock, /districtCollider\("swamp", -15, -12, 0\.75\)/);
  assert.match(colliderBlock, /districtCollider\("scenic", -3, 0, 0\.5\)/);
  assert.match(colliderBlock, /districtCollider\("scenic", 14, -3, 0\.75\)/);
  assert.doesNotMatch(colliderBlock, /districtCollider\("mountain", -27, -20,/);
  assert.doesNotMatch(colliderBlock, /districtCollider\("swamp", -1, 1,/);
  assert.doesNotMatch(colliderBlock, /districtCollider\("swamp", -8, 9,/);
  assert.doesNotMatch(colliderBlock, /districtCollider\("swamp", -12, -12,/);
  assert.doesNotMatch(colliderBlock, /districtCollider\("scenic", -6, -1,/);
  assert.match(gridBlock, /for \(const c of C1_DISTRICT_COLLIDERS\) list\.push\(c\)/);
});

test("dense ground grass avoids solid scene footprints", async () => {
  const source = await readExploreSource();
  const footprintBlock = sourceBlock(source, "function buildTownBuildingFootprints", "const PLAYER_SPEED");
  const grassBlock = sourceBlock(source, "function GroundGrass", "function Village");

  assert.match(source, /type TownBuildingFootprint/);
  assert.match(footprintBlock, /function nearTownBuildingFootprint/);
  assert.match(footprintBlock, /isInDriveRoadClearance\(x,\s*z,\s*2\.6\)/);
  assert.match(footprintBlock, /onLandmarkPad\(x,\s*z\)/);
  assert.match(footprintBlock, /nearIsleProp\(x,\s*z,\s*1\.0\)/);
  assert.match(grassBlock, /buildTownBuildingFootprints\(\)/);
  assert.match(grassBlock, /nearIsleProp\(x,\s*z,\s*0\.75\)/);
  assert.match(grassBlock, /nearTownBuildingFootprint\(x,\s*z,\s*solidBuildings,\s*0\.65\)/);
  assert.match(grassBlock, /isInDriveRoadClearance\(x,\s*z,\s*0\.35\)/);
});

test("mountain snow patches stay scoped to the mountain district", async () => {
  const source = await readExploreSource();
  const snowHelperBlock = sourceBlock(source, "const MOUNTAIN_SNOW_MIN_HEIGHT", "const PLAYER_SPEED");
  const snowBlock = sourceBlock(source, "const snowItems = useMemo", "useEffect(() => () => toonGrad.dispose()");

  assert.match(snowHelperBlock, /function isMountainSnowSpot\(x: number,\s*z: number,\s*h: number\): boolean/);
  assert.match(snowHelperBlock, /HEALING_DISTRICT_PRESENTATION\.mountain/);
  assert.match(snowHelperBlock, /MOUNTAIN_SNOW_RADIUS/);
  assert.match(snowHelperBlock, /MOUNTAIN_SNOW_MIN_HEIGHT/);
  assert.match(snowHelperBlock, /dx \* dx \+ dz \* dz > MOUNTAIN_SNOW_RADIUS \* MOUNTAIN_SNOW_RADIUS/);
  assert.match(snowBlock, /if \(!isMountainSnowSpot\(x,\s*z,\s*h\)\) continue/);
  assert.doesNotMatch(snowBlock, /if \(h < 11\.5\) continue/);
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
  assert.match(source, /稻田映着天空/);
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
  assert.match(presentation, /introSeconds:\s*5\.4/);
  assert.match(presentation, /introMaxDelta:\s*1 \/ 45/);
  assert.match(presentation, /introFollowLerp:\s*1\.35/);
  assert.match(presentation, /introLookLerp:\s*3\.2/);
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
  assert.match(playerBlock, /const introCameraActive = introT\.current < 1/);
  assert.match(playerBlock, /const cameraDt = introCameraActive \? Math\.min\(dt, HEALING_WALK_CAMERA\.introMaxDelta\) : dt/);
  assert.match(playerBlock, /introT\.current = Math\.min\(1, introT\.current \+ cameraDt \/ HEALING_WALK_CAMERA\.introSeconds\)/);
  assert.match(playerBlock, /camera\.position\.lerp\(_camTarget, Math\.min\(1, cameraDt \* HEALING_WALK_CAMERA\.introFollowLerp\)\)/);
  assert.match(playerBlock, /camLook\.current\.lerp\(_camLookTarget, Math\.min\(1, cameraDt \* HEALING_WALK_CAMERA\.introLookLerp\)\)/);
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
