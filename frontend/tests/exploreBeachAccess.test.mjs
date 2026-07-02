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

test("explore mode lets the player walk to the near-shore side of the beach fence", async () => {
  const source = await readExploreSource();
  const boundaryBlock = sourceBlock(source, "function walkableRadius", "function Player");
  const boundaryUseBlock = sourceBlock(source, "function clampToWalkableRadius", "type DistrictPresentationKey");
  const playerBlock = sourceBlock(source, "function Player", "function Wishes");

  assert.match(boundaryBlock, /FENCE_RADIUS/);
  assert.match(boundaryBlock, /NEAR_SHORE_WALK_MARGIN/);
  assert.match(boundaryBlock, /bayMask\(wx,\s*wz\)/);
  assert.match(boundaryBlock, /FENCE_RADIUS \+ NEAR_SHORE_WALK_MARGIN/);
  assert.match(boundaryUseBlock, /walkableRadius\(pos\.x,\s*pos\.z\)/);
  assert.match(playerBlock, /advanceWithCollisions\(collidersRef\?\.current \?\? null,\s*pos,\s*vel\.current,\s*dt,\s*PLAYER_COL_R\)/);
  assert.doesNotMatch(playerBlock, /WALK_RADIUS \* \(1 \+ 0\.16 \* bayMask\(pos\.x,\s*pos\.z\)\)/);
});

test("explore mode lets the beach gate reach the visible bay waterline", async () => {
  const source = await readExploreSource();
  const shoreBlock = sourceBlock(source, "const SHORE_FOAM_INNER_RADIUS", "const C1_DISTRICT_CLEARINGS");
  const boundaryBlock = sourceBlock(source, "function walkableRadius", "function Player");

  assert.match(shoreBlock, /BAY_WADE_RADIUS\s*=\s*BAY_WATERLINE_RADIUS \+ 3\.6/);
  assert.match(boundaryBlock, /const nearShoreR = FENCE_RADIUS \+ NEAR_SHORE_WALK_MARGIN \* bay/);
  assert.match(boundaryBlock, /const bayWadeR = FENCE_RADIUS \+ \(BAY_WADE_RADIUS - FENCE_RADIUS\) \* bay/);
  assert.match(boundaryBlock, /return Math\.max\(nearShoreR,\s*bayWadeR\)/);
  assert.doesNotMatch(boundaryBlock, /return FENCE_RADIUS \+ NEAR_SHORE_WALK_MARGIN \* bay/);
});

test("explore mode leaves a visible fence opening at the beach approach", async () => {
  const source = await readExploreSource();
  const gapBlock = sourceBlock(source, "function isBeachFenceGap", "function walkableRadius");
  const fenceBlock = sourceBlock(source, "const fence = useMemo", "// 电线杆");

  assert.match(gapBlock, /BEACH_FENCE_GATE_HALF_WIDTH/);
  assert.match(gapBlock, /bayMask\(wx,\s*wz\)/);
  assert.match(gapBlock, /Math\.abs\(d\) < BEACH_FENCE_GATE_HALF_WIDTH/);
  assert.match(fenceBlock, /if \(isBeachFenceGap\(x,\s*z\)\) continue/);
});

test("explore mode registers the visible shore fence as a collision blocker", async () => {
  const source = await readExploreSource();
  const colliderFnBlock = sourceBlock(source, "function beachFenceColliders", "function walkableRadius");
  const colliderUseBlock = sourceBlock(source, "useEffect(() => {\n    if (!collidersRef) return;", "collidersRef.current = buildColliderGrid(list);");

  assert.match(colliderFnBlock, /FENCE_COLLIDER_RADIUS/);
  assert.match(colliderFnBlock, /if \(isBeachFenceGap\(x,\s*z\)\) continue/);
  assert.match(colliderFnBlock, /out\.push\(\{ x,\s*z,\s*r: FENCE_COLLIDER_RADIUS \}\)/);
  assert.match(colliderUseBlock, /for \(const c of beachFenceColliders\(\)\) list\.push\(c\)/);
});

test("shore water effects stay outside the dry beach radius", async () => {
  const source = await readExploreSource();
  const shoreBlock = sourceBlock(source, "const SHORE_FOAM_INNER_RADIUS", "const MODELS");
  const coastlineBlock = sourceBlock(source, "function Coastline", "// ============================== 新玩法组件");
  const sceneBlock = sourceBlock(source, "function ExploreScene({", "function ExploreMode");

  assert.match(shoreBlock, /SHORE_FOAM_INNER_RADIUS\s*=\s*ISLAND_RADIUS \* EXS \* 0\.84/);
  assert.match(shoreBlock, /BAY_WATERLINE_RADIUS\s*=\s*SHORE_FOAM_INNER_RADIUS/);
  assert.match(coastlineBlock, /function bayWaterPoint/);
  assert.match(coastlineBlock, /BAY_WATERLINE_RADIUS/);
  assert.doesNotMatch(coastlineBlock, /WALK_RADIUS \* 0\.92/);
  assert.doesNotMatch(coastlineBlock, /WALK_RADIUS \* 1\.0/);
  assert.doesNotMatch(sceneBlock, /ringGeometry args=\{\[WALK_RADIUS \* 1\.0,\s*WALK_RADIUS \* 1\.1/);
  assert.match(sceneBlock, /SHORE_FOAM_INNER_RADIUS/);
});

test("explore mode renders anime bay water and shore breaks instead of a single hard sea layer", async () => {
  const source = await readExploreSource();
  const sceneBlock = sourceBlock(source, "function ExploreScene({", "function ExploreMode");

  assert.match(source, /makeAnimeShoreBreaks/);
  assert.match(source, /resolveAnimeSeaPalette/);
  assert.match(source, /function AnimatedAnimeSea/);
  assert.match(source, /function AnimeShoreBreaks/);
  assert.match(source, /function BayLightReflection/);
  assert.match(sceneBlock, /<AnimatedAnimeSea/);
  assert.match(sceneBlock, /<AnimeShoreBreaks/);
  assert.match(sceneBlock, /<BayLightReflection/);
  assert.doesNotMatch(sceneBlock, /<ringGeometry args=\{\[SHORE_FOAM_INNER_RADIUS,\s*SHORE_FOAM_OUTER_RADIUS/);
});
