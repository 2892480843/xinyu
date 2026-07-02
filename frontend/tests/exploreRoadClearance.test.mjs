import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import * as THREE from "three";

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

function extractRoadCtrlPts(source) {
  const match = source.match(/const ROAD_CTRL_PTS:[\s\S]*?=\s*(\[[\s\S]*?\n\]);/);
  assert.ok(match, "ROAD_CTRL_PTS should be a static array");
  return Function(`"use strict"; return (${match[1]});`)();
}

function extractFarmCenter(source) {
  const farmBlock = sourceBlock(source, "farm: {", "zoo: {");
  const x = Number(farmBlock.match(/\bx:\s*(-?\d+(?:\.\d+)?)/)?.[1]);
  const z = Number(farmBlock.match(/\bz:\s*(-?\d+(?:\.\d+)?)/)?.[1]);
  assert.ok(Number.isFinite(x), "farm x should be readable");
  assert.ok(Number.isFinite(z), "farm z should be readable");
  return { x, z };
}

function extractExploreWalkRadius(exploreWorldSource, islandTerrainSource) {
  const radius = Number(islandTerrainSource.match(/ISLAND_RADIUS\s*=\s*(\d+(?:\.\d+)?)/)?.[1]);
  const scale = Number(exploreWorldSource.match(/EXPLORE_SCALE\s*=\s*(\d+(?:\.\d+)?)/)?.[1]);
  const walkFactor = Number(exploreWorldSource.match(/EXPLORE_WALK_RADIUS\s*=\s*ISLAND_RADIUS\s*\*\s*EXPLORE_SCALE\s*\*\s*(\d+(?:\.\d+)?)/)?.[1]);
  assert.ok(Number.isFinite(radius), "ISLAND_RADIUS should be readable");
  assert.ok(Number.isFinite(scale), "EXPLORE_SCALE should be readable");
  assert.ok(Number.isFinite(walkFactor), "EXPLORE_WALK_RADIUS factor should be readable");
  return radius * scale * walkFactor;
}

function extractDistrictCenters(presentationSource, exploreWorldSource, islandTerrainSource) {
  const out = {};
  const block = sourceBlock(presentationSource, "export const HEALING_DISTRICT_PRESENTATION", "} as const;");
  for (const match of block.matchAll(/\n\s*(home|rice|mountain|forest|town|farm|zoo|swamp|scenic):\s*\{([\s\S]*?)\n\s*\}/g)) {
    const body = match[2];
    const x = Number(body.match(/\bx:\s*(-?\d+(?:\.\d+)?)/)?.[1]);
    const z = Number(body.match(/\bz:\s*(-?\d+(?:\.\d+)?)/)?.[1]);
    assert.ok(Number.isFinite(x), `${match[1]} x should be readable`);
    assert.ok(Number.isFinite(z), `${match[1]} z should be readable`);
    out[match[1]] = { x, z };
  }
  const walkRadius = extractExploreWalkRadius(exploreWorldSource, islandTerrainSource);
  out.beach = {
    x: Math.cos(0.55) * walkRadius * 0.91,
    z: Math.sin(0.55) * walkRadius * 0.91,
  };
  return out;
}

function evalPositionExpr(expr, center) {
  const normalized = expr.replace(/\s+/g, "").replace(/Math\.PI/g, String(Math.PI));
  if (normalized === "p.x") return center.x;
  if (normalized === "p.z") return center.z;
  const match = normalized.match(/^p\.(x|z)([+-])(\d+(?:\.\d+)?)$/);
  if (match) {
    const base = center[match[1]];
    const offset = Number(match[3]);
    return match[2] === "+" ? base + offset : base - offset;
  }
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return numeric;
  return NaN;
}

function extractDistrictGroundProps(block, center, label) {
  const out = [];
  for (const match of block.matchAll(/<GroundProp[^>]*\bx=\{([^}]+)\}[^>]*\bz=\{([^}]+)\}/g)) {
    const x = evalPositionExpr(match[1], center);
    const z = evalPositionExpr(match[2], center);
    if (Number.isFinite(x) && Number.isFinite(z)) out.push({ label, x, z });
  }
  return out;
}

function evalDistrictExpr(expr, axisName, axisValue) {
  const compact = expr.replace(/\s+/g, " ").trim();
  if (compact === `p.${axisName}`) return axisValue;
  const match = compact.match(new RegExp(`^p\\.${axisName}\\s*([+-])\\s*(\\d+(?:\\.\\d+)?)$`));
  assert.ok(match, `unsupported ${axisName} expression: ${expr}`);
  const value = Number(match[2]);
  return match[1] === "+" ? axisValue + value : axisValue - value;
}

function extractGroundPropPoint(block, modelName, farm) {
  const match = block.match(new RegExp(`<GroundProp[^>]*url=\\{MODELS\\.${modelName}\\}[^>]*x=\\{([^}]+)\\}[^>]*z=\\{([^}]+)\\}`, "m"));
  assert.ok(match, `${modelName} GroundProp should exist`);
  return {
    x: evalDistrictExpr(match[1], "x", farm.x),
    z: evalDistrictExpr(match[2], "z", farm.z),
  };
}

function buildRoadSegments(ctrlPts) {
  const curve = new THREE.CatmullRomCurve3(
    ctrlPts.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    "catmullrom",
    0.5,
  );
  const samples = Array.from({ length: 280 }, (_, i) => {
    const p = curve.getPointAt(i / 280);
    return { x: p.x, z: p.z };
  });
  return samples.map((a, i) => [a, samples[(i + 1) % samples.length]]);
}

function distanceToRoadCenter(x, z, segments) {
  let best = Infinity;
  for (const [a, b] of segments) {
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / len2));
    const px = a.x + ex * t;
    const pz = a.z + ez * t;
    const d = Math.hypot(x - px, z - pz);
    best = Math.min(best, d);
  }
  return best;
}

test("farm solid props stay clear of the ring road lane", async () => {
  const exploreSource = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const presentationSource = await readFile(path.resolve("src/lib/explorePresentation.ts"), "utf8");
  const farmBlock = sourceBlock(exploreSource, "function FarmsteadDistrictCore", "function TownMarketPavers");
  const farm = extractFarmCenter(presentationSource);
  const roadSegments = buildRoadSegments(extractRoadCtrlPts(exploreSource));
  const roadHalfWidth = 3.0;
  const safetyBuffer = 1.0;

  const solidProps = [
    { label: "farm windmill", model: "windmill", radius: 8.5 },
    { label: "farm cottage", model: "houseCottage", radius: 3.0 },
    { label: "farm signpost", model: "townSignpost", radius: 1.2 },
  ].map((prop) => ({ ...prop, ...extractGroundPropPoint(farmBlock, prop.model, farm) }));

  for (const prop of solidProps) {
    const distance = distanceToRoadCenter(prop.x, prop.z, roadSegments);
    assert.ok(
      distance >= roadHalfWidth + prop.radius + safetyBuffer,
      `${prop.label} is too close to the ring road: distance=${distance.toFixed(2)}, required=${(roadHalfWidth + prop.radius + safetyBuffer).toFixed(2)}`,
    );
  }
});

test("scenic roadside ornaments stay clear of the ring road lane", async () => {
  const exploreSource = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const scenicBlock = sourceBlock(exploreSource, "function ScenicPrayerFlags", "function ScenicViewPath");
  const roadSegments = buildRoadSegments(extractRoadCtrlPts(exploreSource));
  const roadHalfWidth = 3.0;
  const safetyBuffer = 1.2;

  const points = [];
  const flagsBlock = scenicBlock.match(/const flags = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  for (const match of flagsBlock.matchAll(/\[\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*"#[0-9a-fA-F]{6}"/g)) {
    points.push({ label: `scenic flag ${points.length + 1}`, x: Number(match[1]), z: Number(match[2]) });
  }
  for (const match of scenicBlock.matchAll(/placeableGroundY\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/g)) {
    points.push({ label: `scenic ornament ${points.length + 1}`, x: Number(match[1]), z: Number(match[2]) });
  }

  assert.ok(points.length >= 5, "scenic roadside ornaments should be statically readable");
  for (const point of points) {
    const distance = distanceToRoadCenter(point.x, point.z, roadSegments);
    assert.ok(
      distance >= roadHalfWidth + safetyBuffer,
      `${point.label} is too close to the ring road: distance=${distance.toFixed(2)}, required=${(roadHalfWidth + safetyBuffer).toFixed(2)}`,
    );
  }
});

test("readable district props stay clear of the ring road lane", async () => {
  const exploreSource = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const presentationSource = await readFile(path.resolve("src/lib/explorePresentation.ts"), "utf8");
  const exploreWorldSource = await readFile(path.resolve("src/lib/exploreWorld.ts"), "utf8");
  const islandTerrainSource = await readFile(path.resolve("src/lib/islandTerrain.ts"), "utf8");
  const centers = extractDistrictCenters(presentationSource, exploreWorldSource, islandTerrainSource);
  const roadSegments = buildRoadSegments(extractRoadCtrlPts(exploreSource));
  const roadHalfWidth = 3.0;
  const safetyBuffer = 1.2;
  const blocks = [
    ["home", "HomeDistrict", "function HomeDistrict", "function BeachShoreDetails"],
    ["beach", "BeachDistrict", "function BeachDistrict", "function RicePaddyWater"],
    ["rice", "RiceFieldDistrict", "function RiceFieldDistrict", "function FarmSoilBed"],
    ["farm", "FarmsteadDistrictCore", "function FarmsteadDistrictCore", "function TownMarketPavers"],
    ["town", "TownMarketSquare", "function TownMarketSquare", "function MountainTrailMarkers"],
    ["mountain", "MountainTrailScene", "function MountainTrailScene", "function ForestUnderstory"],
    ["forest", "ForestCampGrove", "function ForestCampGrove", "function MountainDistrict"],
    ["zoo", "ZooDistrict", "function ZooDistrict", "function SwampWaterPatch"],
    ["swamp", "SwampDistrict", "function SwampDistrict", "function ScenicPrayerFlags"],
    ["scenic", "ScenicDistrict", "function ScenicDistrict", "function IslandDistricts"],
  ];

  const props = blocks.flatMap(([district, label, start, end]) =>
    extractDistrictGroundProps(sourceBlock(exploreSource, start, end), centers[district], label),
  );

  assert.ok(props.length >= 50, "district props should be statically readable");
  for (const prop of props) {
    const distance = distanceToRoadCenter(prop.x, prop.z, roadSegments);
    assert.ok(
      distance >= roadHalfWidth + safetyBuffer,
      `${prop.label} prop is too close to the ring road: (${prop.x.toFixed(2)}, ${prop.z.toFixed(2)}), distance=${distance.toFixed(2)}, required=${(roadHalfWidth + safetyBuffer).toFixed(2)}`,
    );
  }
});

test("district colliders stay clear of the ring road lane", async () => {
  const exploreSource = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const presentationSource = await readFile(path.resolve("src/lib/explorePresentation.ts"), "utf8");
  const exploreWorldSource = await readFile(path.resolve("src/lib/exploreWorld.ts"), "utf8");
  const islandTerrainSource = await readFile(path.resolve("src/lib/islandTerrain.ts"), "utf8");
  const centers = extractDistrictCenters(presentationSource, exploreWorldSource, islandTerrainSource);
  const roadSegments = buildRoadSegments(extractRoadCtrlPts(exploreSource));
  const colliderBlock = sourceBlock(exploreSource, "const C1_DISTRICT_COLLIDERS", "function beachAngleDelta");
  const roadHalfWidth = 3.0;
  const safetyBuffer = 1.2;

  const colliders = [...colliderBlock.matchAll(/districtCollider\("(\w+)",\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/g)]
    .map((match) => {
      const center = centers[match[1]];
      assert.ok(center, `${match[1]} center should exist`);
      return {
        label: `${match[1]} collider`,
        x: center.x + Number(match[2]),
        z: center.z + Number(match[3]),
        r: Number(match[4]),
      };
    });

  assert.ok(colliders.length >= 80, "district colliders should be statically readable");
  const offenders = [];
  for (const collider of colliders) {
    const distance = distanceToRoadCenter(collider.x, collider.z, roadSegments);
    if (distance < roadHalfWidth + safetyBuffer) {
      offenders.push(
        `${collider.label} at (${collider.x.toFixed(2)}, ${collider.z.toFixed(2)}), radius=${collider.r.toFixed(2)}, distance=${distance.toFixed(2)}`,
      );
    }
  }
  assert.deepEqual(offenders, [], `district colliders should stay clear of the ring road: ${offenders.join("; ")}`);
});

test("procedural island scatter uses the drive road clear zone", async () => {
  const exploreSource = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const roadHelperBlock = sourceBlock(exploreSource, "const ROAD_SURFACE_RAISE", "// 用控制点");
  const footprintBlock = sourceBlock(exploreSource, "function buildTownBuildingFootprints", "const PLAYER_SPEED");
  const scatterBlock = sourceBlock(exploreSource, "const bushes = useMemo", "const ritualArtifacts");
  const grassBlock = sourceBlock(exploreSource, "function GroundGrass", "function Village");

  assert.match(roadHelperBlock, /const DRIVE_ROAD_CLEARANCE = 2\.4/);
  assert.match(roadHelperBlock, /function isInDriveRoadClearance\(x: number,\s*z: number,\s*footprintRadius = 0\): boolean/);
  assert.match(roadHelperBlock, /distToRoadCenter\(x,\s*z\) < ROAD_HALF_W \+ DRIVE_ROAD_CLEARANCE \+ footprintRadius/);

  assert.match(footprintBlock, /isInDriveRoadClearance\(x,\s*z,\s*2\.6\)/);
  for (const [label, regex] of [
    ["bushes", /isInDriveRoadClearance\(x,\s*z,\s*0\.4\)/],
    ["path tiles", /isInDriveRoadClearance\(x,\s*z,\s*0\.8\)/],
    ["poles", /isInDriveRoadClearance\(x,\s*z,\s*0\.7\)/],
    ["lamps", /isInDriveRoadClearance\(x,\s*z,\s*0\.8\)/],
    ["flowers", /isInDriveRoadClearance\(x,\s*z,\s*0\.2\)/],
    ["trees", /isInDriveRoadClearance\(x,\s*z,\s*2\.2\)/],
    ["rocks", /isInDriveRoadClearance\(x,\s*z,\s*1\.2\)/],
    ["mushrooms", /isInDriveRoadClearance\(x,\s*z,\s*0\.35\)/],
    ["farm crops", /isInDriveRoadClearance\(wx,\s*wz,\s*0\.45\)/],
    ["hay bales", /isInDriveRoadClearance\(wx,\s*wz,\s*1\.0\)/],
  ]) {
    assert.match(scatterBlock, regex, `${label} should avoid the drive road clear zone`);
  }
  assert.match(grassBlock, /isInDriveRoadClearance\(x,\s*z,\s*0\.35\)/);
});
