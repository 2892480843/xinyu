import { useSyncExternalStore } from "react";
import { hasWebGL } from "../lib/webgl";

// 真 3D 岛屿（react-three-fiber）旗舰皮的开关。
// 默认关闭——这是渐进增强：用户主动开启、且设备支持 WebGL，才接管背景；
// 否则永远是现有 CSS-3D 场景。reduced-motion / 静海模式由调用方再叠一层门控（见 Home）。

const KEY = "xinyu.skin3d";

function read(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let enabled = read();
const subs = new Set<() => void>();

export function setSkin3d(next: boolean): void {
  enabled = next;
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* localStorage 不可用时仅内存生效 */
  }
  subs.forEach((f) => f());
}

function getSkin3d(): boolean {
  return enabled;
}

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export interface Skin3d {
  /** 用户开关是否打开 */
  wanted: boolean;
  /** 设备是否支持 WebGL */
  supported: boolean;
  /** 实际是否应渲染真 3D（wanted && supported），仍需调用方叠加 immersive 门控 */
  active: boolean;
  setSkin3d: (next: boolean) => void;
}

export function useSkin3d(): Skin3d {
  const wanted = useSyncExternalStore(subscribe, getSkin3d, () => false);
  const supported = hasWebGL();
  return { wanted, supported, active: wanted && supported, setSkin3d };
}
