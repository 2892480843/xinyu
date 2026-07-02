import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

async function readIsland3DSource() {
  return readFile(path.resolve("src/components/Island3D.tsx"), "utf8");
}

function numberConst(source, name) {
  const match = source.match(new RegExp(`const ${name} = (-?\\d+(?:\\.\\d+)?)`));
  assert.ok(match, `${name} should be a readable numeric constant`);
  return Number(match[1]);
}

async function loadIslandGlb() {
  const bytes = await readFile(path.resolve("public/models/xy_scene_island.glb"));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new GLTFLoader().parseAsync(buffer, "file://" + path.resolve("public/models") + "/");
}

async function loadTurtleGlb() {
  const bytes = await readFile(path.resolve("public/models/xy_creature_turtle.glb"));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new GLTFLoader().parseAsync(buffer, "file://" + path.resolve("public/models") + "/");
}

test("homepage GLB island waterline sits clearly below the sand beach", async () => {
  const source = await readIsland3DSource();
  const scale = numberConst(source, "GLB_SCALE");
  const islandY = numberConst(source, "GLB_Y");
  const waterY = numberConst(source, "GLB_WATER_Y");

  const gltf = await loadIslandGlb();
  const sandBox = new THREE.Box3();
  gltf.scene.traverse((object) => {
    const mesh = object;
    if (!mesh.isMesh) return;
    const materialNames = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      .map((material) => material?.name ?? "");
    if (materialNames.includes("Sand")) {
      sandBox.union(new THREE.Box3().setFromObject(mesh));
    }
  });
  assert.ok(!sandBox.isEmpty(), "xy_scene_island.glb should contain a Sand beach mesh");

  const sandMinWorldY = islandY + sandBox.min.y * scale;
  assert.ok(
    sandMinWorldY - waterY >= 0.75,
    `sand beach should clear homepage water by at least 0.75 world units, got ${(sandMinWorldY - waterY).toFixed(3)}`,
  );
});

test("homepage GLB turtle stays small and half-submerged in the lowered waterline", async () => {
  const source = await readIsland3DSource();
  const waterY = numberConst(source, "GLB_WATER_Y");
  const turtleScale = numberConst(source, "TURTLE_SCALE");
  const turtleWaterlineOffsetY = numberConst(source, "TURTLE_WATERLINE_OFFSET_Y");

  assert.ok(turtleScale >= 0.5 && turtleScale <= 0.7, `homepage turtle scale should stay subtle, got ${turtleScale}`);

  const gltf = await loadTurtleGlb();
  const box = new THREE.Box3().setFromObject(gltf.scene);
  assert.ok(!box.isEmpty(), "xy_creature_turtle.glb should have visible geometry");

  const turtleY = waterY + turtleWaterlineOffsetY;
  const turtleMinWorldY = turtleY + box.min.y * turtleScale;
  const turtleMaxWorldY = turtleY + box.max.y * turtleScale;
  const shellAboveWater = turtleMaxWorldY - waterY;
  const bodyBelowWater = waterY - turtleMinWorldY;

  assert.ok(bodyBelowWater >= 0.1, `turtle body should sink into the water by at least 0.1, got ${bodyBelowWater.toFixed(3)}`);
  assert.ok(shellAboveWater >= 0.1, `turtle shell should still be visible above water by at least 0.1, got ${shellAboveWater.toFixed(3)}`);
  assert.ok(shellAboveWater <= 0.22, `turtle should not tower above the waterline, got ${shellAboveWater.toFixed(3)}`);
});

test("homepage GLB turtle swim path stays away from the near-camera bottom edge", async () => {
  const source = await readIsland3DSource();
  const swimCenterZ = numberConst(source, "TURTLE_SWIM_CENTER_Z");
  const swimRadiusZ = numberConst(source, "TURTLE_SWIM_RADIUS_Z");

  assert.ok(
    swimCenterZ + swimRadiusZ <= 2.25,
    `turtle near-camera swim extent should stay at or below z=2.25, got ${(swimCenterZ + swimRadiusZ).toFixed(3)}`,
  );
});
