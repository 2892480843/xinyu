import type { CSSProperties } from "react";
import { buildMoonSvg } from "../lib/moonSvg";

// 🌙 心屿统一「卡通手绘睡月」形象 —— 温柔睡脸弯月(长相见 lib/moonSvg.ts)。
// 本文件只导出 React 组件(<CartoonMoon/>),SVG 构造与纹理 URL 放在 lib/moonSvg.ts,
// 以满足 react-refresh/only-export-components(组件文件只导出组件,热更新才稳定)。
// 晚安屏(NightWatch)用本组件;3D 夜空(ExploreMode)直接用 lib 里的 MOON_TEXTURE_URL。

/** 给 DOM 直接渲染的卡通睡月(晚安屏用,默认带夜空小星)。 */
export function CartoonMoon({
  size = 160,
  stars = true,
  className,
  style,
}: {
  size?: number;
  stars?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{ width: size, height: size, lineHeight: 0, ...style }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: buildMoonSvg(size, stars) }}
    />
  );
}
