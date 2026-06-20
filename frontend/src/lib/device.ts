import { useSyncExternalStore } from "react";

// 设备能力探测：触屏 / 小屏。统一收口，避免各组件各自 sniff。
// 与 perfTier 同一思路：模块级缓存 + useSyncExternalStore 订阅变化（折叠/外接键鼠时 pointer 可能变）。
// 全部 SSR 安全：typeof window 检查 + 服务端快照返回安全默认值。

function hasCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  } catch {
    return false;
  }
}

function hasTouchPoints(): boolean {
  if (typeof navigator === "undefined") return false;
  try {
    return (navigator.maxTouchPoints ?? 0) > 0;
  } catch {
    return false;
  }
}

function computeTouch(): boolean {
  // pointer: coarse 是最可靠的触屏主指针判定（iPad/桌面触屏均覆盖）；
  // maxTouchPoints 兜底（某些 Android 浏览器对 coarse 支持不一致）。
  return hasCoarsePointer() || hasTouchPoints();
}

let touch = computeTouch();
const touchSubs = new Set<() => void>();

function subscribeTouch(cb: () => void): () => void {
  touchSubs.add(cb);
  return () => {
    touchSubs.delete(cb);
  };
}

// 监听 pointer 媒体变化（外接/拔除键鼠、折叠形态切换）后重算一次。
// 注意：触屏硬件(maxTouchPoints>0)不会因为主指针变成鼠标而消失——
// 一旦设备有触屏，就保持 touch=true，只让「纯鼠标设备变触屏」的方向生效。
// 这样可避免 pointer: coarse 在某些环境(如自动化截图切换视口)瞬时抖动导致误判。
if (typeof window !== "undefined" && window.matchMedia) {
  try {
    const mq = window.matchMedia("(pointer: coarse)");
    const handler = () => {
      if (touch) return; // 已认定是触屏：硬件不会凭空消失，不再回退
      const next = computeTouch();
      if (next !== touch) {
        touch = next;
        touchSubs.forEach((f) => f());
      }
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler); // 旧 Safari
  } catch {
    /* matchMedia 不可用时仅取初始值 */
  }
}

function getTouch(): boolean {
  return touch;
}

/**
 * 当前主指针是否为触屏（含 iPad/触屏笔记本）。
 * 用 useSyncExternalStore 订阅，pointer 形态变化时自动更新。
 */
export function useIsTouch(): boolean {
  return useSyncExternalStore(subscribeTouch, getTouch, () => false);
}

// —— 小屏判定（主流手机宽度上限 ~480px）——
const SMALL_MAX = 480;

function computeSmall(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia?.(`(max-width: ${SMALL_MAX}px)`)?.matches ?? false;
  } catch {
    return false;
  }
}

let small = computeSmall();
const smallSubs = new Set<() => void>();

function subscribeSmall(cb: () => void): () => void {
  smallSubs.add(cb);
  return () => {
    smallSubs.delete(cb);
  };
}

if (typeof window !== "undefined" && window.matchMedia) {
  try {
    const mq = window.matchMedia(`(max-width: ${SMALL_MAX}px)`);
    const handler = () => {
      const next = computeSmall();
      if (next !== small) {
        small = next;
        smallSubs.forEach((f) => f());
      }
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
  } catch {
    /* matchMedia 不可用时仅取初始值 */
  }
}

function getSmall(): boolean {
  return small;
}

/** 当前是否为小屏（≤480px，覆盖主流手机竖屏）。 */
export function useIsSmallScreen(): boolean {
  return useSyncExternalStore(subscribeSmall, getSmall, () => false);
}
