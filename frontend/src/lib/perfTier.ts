// 性能分档：真 3D 旗舰皮按设备能力自动降档，保证弱设备/移动端不卡。
// high = 完整效果（Bloom + 高分辨率反射 + 高 dpr）；low = 去后期 + 低分辨率反射 + 保守 dpr。
// 规则刻意简单可预测：软件渲染器 / 移动端 → low；桌面看 GPU 与 核心/内存。
// 覆盖：?perf=high 或 ?perf=low（power user / 强力手机想要完整效果时用）。

export type PerfTier = "high" | "low";

let cached: PerfTier | null = null;

function gpuRenderer(): string {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return "";
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "").toLowerCase();
  } catch {
    return "";
  }
}

function override(): PerfTier | null {
  if (typeof window === "undefined") return null;
  try {
    const p = new URLSearchParams(window.location.search).get("perf");
    return p === "high" || p === "low" ? p : null;
  } catch {
    return null;
  }
}

function hasTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (navigator.maxTouchPoints > 0) return true;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

function hasSmallViewport(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

function compute(): PerfTier {
  const forced = override();
  if (forced) return forced;
  if (typeof navigator === "undefined") return "low";

  const gpu = gpuRenderer();
  // 软件渲染（无 GPU 加速）必降级——这类环境跑后期/反射会非常卡
  if (/swiftshader|llvmpipe|software|microsoft basic|basic render/.test(gpu)) return "low";

  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua);
  // 移动端一律保守降级（屏幕设备千差万别，宁稳不卡）；强力手机可用 ?perf=high 解锁
  if (isMobile || hasTouchDevice() || hasSmallViewport()) return "low";

  // 桌面：先排除低核心/低内存，再允许强 GPU 或 多核+大内存 → high。
  const cores = navigator.hardwareConcurrency || 0;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0;
  if (cores > 0 && cores <= 4) return "low";
  if (memory > 0 && memory <= 4) return "low";
  const strongGpu = /apple m\d|apple gpu|rtx|geforce|radeon rx|radeon pro|intel arc|nvidia/.test(gpu);
  if (strongGpu) return "high";
  if (cores >= 8 && memory >= 8) return "high";
  return "low";
}

export function getPerfTier(): PerfTier {
  if (cached !== null) return cached;
  cached = compute();
  return cached;
}
