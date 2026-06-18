// WebGL 能力检测：真 3D 旗舰皮的硬门槛。
// 不支持 WebGL（老设备 / 无障碍浏览器 / 无头环境）一律回退到 CSS-3D 场景，绝不白屏。

let cached: boolean | null = null;

export function hasWebGL(): boolean {
  if (cached !== null) return cached;
  if (typeof document === "undefined") {
    cached = false;
    return cached;
  }
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    cached = !!gl;
  } catch {
    cached = false;
  }
  return cached;
}
