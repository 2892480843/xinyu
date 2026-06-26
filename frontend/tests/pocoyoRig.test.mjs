import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

async function readExploreSource() {
  return readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
}

async function readPocoyoBlock() {
  const source = await readExploreSource();
  const start = source.indexOf("function GltfPocoyo");
  const end = source.indexOf("function Player", start);
  assert.notEqual(start, -1, "GltfPocoyo function should exist");
  assert.notEqual(end, -1, "Player function should follow GltfPocoyo");
  return source.slice(start, end);
}

async function loadPocoyoScene() {
  const bytes = await readFile(path.resolve("public/models/xy_char_pocoyo.glb"));
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, "", resolve, reject);
  });
  return gltf.scene;
}

test("Pocoyo uses an explicit upright rig instead of the stale 120x FBX scale", async () => {
  const block = await readPocoyoBlock();

  assert.doesNotMatch(block, /scale=\{120\}/);
  assert.match(block, /POCOYO_MODEL_SCALE/);
  assert.match(block, /POCOYO_UPRIGHT_ROTATION/);
  assert.match(block, /POCOYO_FOOT_OFFSET_Y/);
});

test("Pocoyo upright rig keeps the rendered model in player scale with feet on the ground", async () => {
  const source = await readExploreSource();
  const scale = Number(source.match(/const POCOYO_MODEL_SCALE = ([0-9.]+)/)?.[1]);
  const footMin = Number(source.match(/POCOYO_FOOT_OFFSET_Y = ([0-9.]+) \* POCOYO_MODEL_SCALE/)?.[1]);

  assert.ok(Number.isFinite(scale), "Pocoyo scale constant should be readable");
  assert.ok(Number.isFinite(footMin), "Pocoyo foot offset constant should be readable");
  assert.match(source, /POCOYO_UPRIGHT_ROTATION:[^=]+= \[Math\.PI \/ 2, 0, 0\]/);

  const model = (await loadPocoyoScene()).clone(true);
  model.rotation.set(Math.PI / 2, 0, 0);
  model.scale.setScalar(scale);
  model.position.set(0, footMin * scale, 0);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);

  assert.ok(Math.abs(box.min.y) < 0.001, `expected feet on ground, got minY=${box.min.y}`);
  assert.ok(size.y > 1 && size.y < 1.15, `expected player-height Pocoyo, got height=${size.y}`);
  assert.ok(size.x < 0.7 && size.z < 0.8, `expected compact Pocoyo footprint, got ${size.x} x ${size.z}`);
});
