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

test("drivable car has an immediate visible fallback and is not gated by heavy landmark degradation", async () => {
  const source = await readExploreSource();
  const carBlock = sourceBlock(source, "/* 汽车(", "/* 程序小镇");
  const fallbackBlock = sourceBlock(source, "function ParkedCarFallback", "function DrivableCar");

  assert.match(source, /function ParkedCarFallback/);
  assert.match(carBlock, /<Suspense fallback=\{<ParkedCarFallback grad=\{toonGrad\} \/>\}>/);
  assert.match(carBlock, /<DrivableCar grad=\{toonGrad\} \/>/);
  assert.doesNotMatch(carBlock, /allowHeavyLandmarks/);
  assert.doesNotMatch(carBlock, /DelayedMount/);
  assert.match(fallbackBlock, /position=\{\[carState\.x, groundYWithRoad\(carState\.x, carState\.z\)\.y \+ CAR_Y_OFFSET, carState\.z\]\}/);
});

test("island drivable car uses steerable wheel rigs instead of static GLB wheels", async () => {
  const source = await readExploreSource();
  const drivableBlock = sourceBlock(source, "function DrivableCar", "function TireDust");

  assert.match(source, /const CAR_MAX_STEER_VIS = 0\.5/);
  assert.match(source, /const CAR_WHEEL_ROLL_R = 0\.38/);
  assert.match(source, /const CAR_WHEELS: \{ x: number; y: number; z: number; r: number; front: boolean \}\[\] = \[/);
  assert.match(source, /function buildDrivableWheel\(\): THREE\.BufferGeometry/);
  assert.match(source, /function buildDrivableCarBody\(scene: THREE\.Object3D, grad: THREE\.Texture\)/);
  assert.match(drivableBlock, /const sFL = useRef<THREE\.Group>\(null\)/);
  assert.match(drivableBlock, /const sFR = useRef<THREE\.Group>\(null\)/);
  assert.match(drivableBlock, /const wFL = useRef<THREE\.Mesh>\(null\)/);
  assert.match(drivableBlock, /const wRR = useRef<THREE\.Mesh>\(null\)/);
  assert.match(drivableBlock, /steerVis\.current \+= \(carState\.turn - steerVis\.current\)/);
  assert.match(drivableBlock, /wheelRoll\.current = \(wheelRoll\.current \+ \(carState\.speed \/ CAR_WHEEL_ROLL_R\) \* dt\) % \(Math\.PI \* 2\)/);
  assert.match(drivableBlock, /const steerY = -steerVis\.current \* CAR_MAX_STEER_VIS/);
  assert.match(drivableBlock, /sFL\.current\.rotation\.y = steerY/);
  assert.match(drivableBlock, /wFL\.current\.rotation\.x = wheelRoll\.current/);
  assert.doesNotMatch(drivableBlock, /<GltfProp url=\{MODELS\.qiche\}/);
});
