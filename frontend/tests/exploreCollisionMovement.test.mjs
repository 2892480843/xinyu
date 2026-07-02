import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readExploreSource() {
  return readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
}

async function readPresentationSource() {
  return readFile(path.resolve("src/lib/explorePresentation.ts"), "utf8");
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

function extractDistrictCenters(source) {
  const out = {};
  const block = sourceBlock(source, "export const HEALING_DISTRICT_PRESENTATION", "} as const;");
  for (const match of block.matchAll(/\n\s*(mountain|swamp|scenic):\s*\{([\s\S]*?)\n\s*\}/g)) {
    const x = Number(match[2].match(/\bx:\s*(-?\d+(?:\.\d+)?)/)?.[1]);
    const z = Number(match[2].match(/\bz:\s*(-?\d+(?:\.\d+)?)/)?.[1]);
    assert.ok(Number.isFinite(x), `${match[1]} x should be readable`);
    assert.ok(Number.isFinite(z), `${match[1]} z should be readable`);
    out[match[1]] = { x, z };
  }
  return out;
}

function extractDistrictColliders(source, centers) {
  const colliderBlock = sourceBlock(source, "const C1_DISTRICT_COLLIDERS", "function beachAngleDelta");
  return [...colliderBlock.matchAll(/districtCollider\("(\w+)",\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/g)]
    .filter((match) => centers[match[1]])
    .map((match) => {
      const center = centers[match[1]];
      return {
        label: `${match[1]} ${match[2]},${match[3]}`,
        x: center.x + Number(match[2]),
        z: center.z + Number(match[3]),
        r: Number(match[4]),
      };
    });
}

test("explore collision grid registers each collider across its full occupied cell span", async () => {
  const source = await readExploreSource();
  const gridBlock = sourceBlock(source, "function buildColliderGrid", "// 就地把 pos 推到障碍边缘外");

  assert.match(gridBlock, /const reach = c\.r \+ MAX_COLLISION_QUERY_RADIUS/);
  assert.match(gridBlock, /Math\.floor\(\(c\.x - reach\) \/ COL_CELL\)/);
  assert.match(gridBlock, /Math\.floor\(\(c\.x \+ reach\) \/ COL_CELL\)/);
  assert.match(gridBlock, /for \(let gx = minX; gx <= maxX; gx\+\+\)/);
  assert.match(gridBlock, /for \(let gz = minZ; gz <= maxZ; gz\+\+\)/);
});

test("player movement advances in collision-safe substeps before animation and camera updates", async () => {
  const source = await readExploreSource();
  const collisionBlock = sourceBlock(source, "const PLAYER_COLLISION_STEP_MAX", "type DistrictPresentationKey");
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");

  assert.match(collisionBlock, /const PLAYER_COLLISION_STEP_LIMIT = 4/);
  assert.match(collisionBlock, /function clampToWalkableRadius\(pos: THREE\.Vector3, vel: \{ x: number; z: number \}\)/);
  assert.match(collisionBlock, /function resolveParkedCarCollision\(pos: THREE\.Vector3, vel: \{ x: number; z: number \}, pr: number\)/);
  assert.match(collisionBlock, /function advanceWithCollisions\(grid: Map<string, Collider\[\]> \| null, pos: THREE\.Vector3, vel: \{ x: number; z: number \}, dt: number, pr: number\)/);
  assert.match(collisionBlock, /const steps = Math\.min\(PLAYER_COLLISION_STEP_LIMIT,\s*Math\.max\(1, Math\.ceil\(Math\.hypot\(dx, dz\) \/ PLAYER_COLLISION_STEP_MAX\)\)\)/);
  assert.match(collisionBlock, /resolveCollisions\(grid, pos, vel, pr\)/);
  assert.match(collisionBlock, /resolveParkedCarCollision\(pos, vel, pr\)/);
  assert.match(collisionBlock, /clampToWalkableRadius\(pos, vel\)/);
  assert.match(playerBlock, /advanceWithCollisions\(collidersRef\?\.current \?\? null, pos, vel\.current, dt, PLAYER_COL_R\)/);
  assert.doesNotMatch(playerBlock, /pos\.x \+= vel\.current\.x \* dt;\s*pos\.z \+= vel\.current\.z \* dt;/);
});

test("expanded collision grid resolves from one occupied cell without repeated neighbor scans", async () => {
  const source = await readExploreSource();
  const resolveBlock = sourceBlock(source, "function resolveCollisions", "const PLAYER_COL_R");

  assert.match(resolveBlock, /const cell = grid\.get\(colKey\(cgx, cgz\)\)/);
  assert.match(resolveBlock, /if \(!cell\) return/);
  assert.match(resolveBlock, /for \(let i = 0; i < cell\.length; i\+\+\)/);
  assert.doesNotMatch(resolveBlock, /for \(let ax = cgx - 1; ax <= cgx \+ 1; ax\+\+\)/);
  assert.doesNotMatch(resolveBlock, /for \(let az = cgz - 1; az <= cgz \+ 1; az\+\+\)/);
});

test("central village walking path is not blocked by side prop colliders", async () => {
  const source = await readExploreSource();
  const colliderBlock = sourceBlock(source, "// 村落散布道具", "// 石阶:实心");
  const playerRadiusMatch = source.match(/const PLAYER_COL_R = ([\d.]+)/);
  assert.ok(playerRadiusMatch, "player collision radius should be readable");
  const playerRadius = Number(playerRadiusMatch[1]);

  const fixedColliders = [...colliderBlock.matchAll(/\{ x: (-?\d+(?:\.\d+)?), z: (-?\d+(?:\.\d+)?), r: (\d+(?:\.\d+)?) \}/g)]
    .map((match) => ({
      x: Number(match[1]),
      z: Number(match[2]),
      r: Number(match[3]),
    }));

  const pathSamples = [
    { x: 0.1, z: 1.4, label: "right edge of the central path beside the signpost" },
    { x: 0.25, z: 1.4, label: "visible central path beside the signpost" },
    { x: -0.35, z: 2.6, label: "left edge of the central path beside the bench" },
  ];

  for (const sample of pathSamples) {
    const blockers = fixedColliders
      .filter((c) => Math.hypot(sample.x - c.x, sample.z - c.z) < c.r + playerRadius)
      .map((c) => `(${c.x}, ${c.z}, r=${c.r})`);

    assert.deepEqual(blockers, [], `${sample.label} should remain walkable, blocked by ${blockers.join(", ")}`);
  }
});

test("walkable district gates and bridges do not use centered blocking colliders", async () => {
  const source = await readExploreSource();
  const centers = extractDistrictCenters(await readPresentationSource());
  const colliders = extractDistrictColliders(source, centers);
  const playerRadiusMatch = source.match(/const PLAYER_COL_R = ([\d.]+)/);
  assert.ok(playerRadiusMatch, "player collision radius should be readable");
  const playerRadius = Number(playerRadiusMatch[1]);

  const passThroughPoints = [
    { label: "mountain torii gate opening", x: centers.mountain.x - 27, z: centers.mountain.z - 20 },
    { label: "scenic torii gate opening", x: 18, z: 106 },
    { label: "main swamp bridge deck", x: 91, z: -103 },
    { label: "upper swamp bridge deck", x: 84, z: -95 },
    { label: "lower swamp bridge deck", x: 80, z: -116 },
  ];

  for (const point of passThroughPoints) {
    const blockers = colliders
      .filter((c) => Math.hypot(point.x - c.x, point.z - c.z) < c.r + playerRadius)
      .map((c) => `${c.label} at (${c.x}, ${c.z}, r=${c.r})`);

    assert.deepEqual(blockers, [], `${point.label} should remain passable, blocked by ${blockers.join(", ")}`);
  }
});

test("pond water participates in movement collision without sealing bridge approaches", async () => {
  const source = await readExploreSource();
  const pondBlock = sourceBlock(source, "function pondPassageAt", "function beachAngleDelta");
  const colliderBuildBlock = sourceBlock(source, "useEffect(() => {\n    if (!collidersRef) return;", "collidersRef.current = buildColliderGrid(list);");

  assert.match(source, /const POND_COLLISION_RX = 7\.2/);
  assert.match(source, /const POND_COLLISION_RZ = 5\.8/);
  assert.match(source, /const POND_COLLIDER_COUNT = 18/);
  assert.match(source, /const POND_BRIDGE_PASSAGE = /);
  assert.match(source, /const POND_STEPSTONE_PASSAGE = /);
  assert.match(pondBlock, /function pondPassageAt\(x: number, z: number\): boolean/);
  assert.match(pondBlock, /if \(pondPassageAt\(x, z\)\) continue/);
  assert.match(colliderBuildBlock, /for \(const c of pondWaterColliders\(\)\) list\.push\(c\)/);
});
