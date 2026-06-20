// 卡通几何共享工具:DriveScene 与 DriveWorld 共用,避免重复定义。
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// 3 阶 toon 渐变贴图:暗→中→亮,营造统一的卡通色阶。
export function makeToonGrad(): THREE.DataTexture {
  const d = new Uint8Array([96, 96, 96, 255, 178, 178, 178, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// 给几何体刷上单一顶点色,便于 merge 后用 vertexColors 一次性渲染多色部件。
export function tinted(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const col = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = col.r;
    arr[i * 3 + 1] = col.g;
    arr[i * 3 + 2] = col.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function mergeToonGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalized = geometries.map((geo) => (geo.index ? geo.toNonIndexed() : geo.clone()));
  const merged = mergeGeometries(normalized);
  normalized.forEach((geo) => geo.dispose());
  if (!merged) {
    throw new Error("Unable to merge toon geometries");
  }
  return merged;
}
