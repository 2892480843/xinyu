import { useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";

// 「沉浸/无障碍」总闸：是否允许 3D / 视差 / 体积光等动效。
// immersive = 系统未要求减少动态 && 用户未开「静海模式」&& 非 ?flat=1。
// 红线：每个 3D/视差入口都必须订阅它，reduced-motion / 静海 / flat 任一为真即把效果系数归零。

const KEY = "xinyu.calmMode";

function readCalm(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let calm = readCalm();
const subs = new Set<() => void>();

export function setCalmMode(next: boolean): void {
  calm = next;
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* localStorage 不可用时仅内存生效 */
  }
  subs.forEach((f) => f());
}

export function getCalmMode(): boolean {
  return calm;
}

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

function flatForced(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("flat") === "1";
  } catch {
    return false;
  }
}

export interface Immersion {
  immersive: boolean; // 是否允许 3D/视差/体积光
  calmMode: boolean; // 用户「静海模式」开关
  reduced: boolean; // 系统 prefers-reduced-motion
  setCalmMode: (next: boolean) => void;
}

export function useImmersion(): Immersion {
  const reduced = useReducedMotion() ?? false;
  const calmMode = useSyncExternalStore(subscribe, getCalmMode, () => false);
  const flat = flatForced();
  return {
    immersive: !reduced && !calmMode && !flat,
    calmMode,
    reduced,
    setCalmMode,
  };
}
