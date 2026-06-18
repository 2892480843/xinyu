// 岛屿地形高度场 + 网格生成(自由探索模式与角色贴地共用)。纯 hash 值噪声,确定性、无依赖。
// 与 Island3D 的环境岛同形(参数一致),让两套体验观感连续。
import * as THREE from "three";

export const ISLAND_SIZE = 9;
export const ISLAND_SEG = 64;
export const ISLAND_RADIUS = 3.0;
export const ISLAND_PEAK = 1.7;

export function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function smoothstep01(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// 平面坐标 → 高度。径向衰减山形 + 多倍频起伏，边缘沉入海面。
export function islandHeight(x: number, y: number): number {
  const r = Math.sqrt(x * x + y * y) / ISLAND_RADIUS;
  const fall = 1 - smoothstep01(0.15, 1.0, r);
  let h = fall * ISLAND_PEAK;
  h += fall * (valueNoise(x * 0.7 + 11, y * 0.7 + 11) - 0.5) * 1.3;
  h += fall * (valueNoise(x * 1.7, y * 1.7) - 0.5) * 0.5;
  h -= smoothstep01(0.62, 1.15, r) * 1.4;
  return h;
}

// 角色贴地用：给世界坐标 (wx, wz)，返回地表世界 y。地形 mesh 经 rotateX(-90°)：平面(px,py)→世界(px,h,-py)。
export function groundHeight(wx: number, wz: number): number {
  return islandHeight(wx, -wz);
}

export function buildIslandGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(ISLAND_SIZE, ISLAND_SIZE, ISLAND_SEG, ISLAND_SEG);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, islandHeight(pos.getX(i), pos.getY(i)));
  }
  geo.computeVertexNormals();
  return geo;
}
