// 心屿统一「卡通手绘睡月」SVG 构造(单一可信源)。
// 从 CartoonMoon.tsx 拆出,使组件文件只导出 React 组件(满足 react-refresh/only-export-components)。
// 晚安屏(NightWatch)直接 inline 同一段 SVG;3D 夜空(ExploreMode)把它当纹理贴在朝相机的 billboard 上。
//
// 坐标系:viewBox 0 0 220 220。月牙 = 整月圆(104,112 r84) 减 右上挖空圆(190,98 r74),
// 两圆交点(146.96,37.81)/(165.08,167.67) = 月牙上/下尖角。脸落在月牙最饱满的左侧。

const MOON_INNER = `
<defs>
  <radialGradient id="xmFill" cx="38%" cy="33%" r="80%">
    <stop offset="0%" stop-color="#fffdf4"/>
    <stop offset="54%" stop-color="#ffeec6"/>
    <stop offset="100%" stop-color="#f2d083"/>
  </radialGradient>
  <linearGradient id="xmShade" x1="0" y1="0" x2="1" y2="0.14">
    <stop offset="0%" stop-color="#a9763f" stop-opacity="0"/>
    <stop offset="56%" stop-color="#a9763f" stop-opacity="0"/>
    <stop offset="100%" stop-color="#a9763f" stop-opacity="0.4"/>
  </linearGradient>
  <radialGradient id="xmHi" cx="32%" cy="27%" r="42%">
    <stop offset="0%" stop-color="#fffdf6" stop-opacity="0.9"/>
    <stop offset="100%" stop-color="#fffdf6" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="xmHalo" cx="48%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#fff4d2" stop-opacity="0.52"/>
    <stop offset="52%" stop-color="#ffe7b2" stop-opacity="0.16"/>
    <stop offset="100%" stop-color="#ffe7b2" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="xmBlush" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#ff9fa9" stop-opacity="0.6"/>
    <stop offset="100%" stop-color="#ff9fa9" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="xmMare" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#c9d4ee" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#c9d4ee" stop-opacity="0"/>
  </radialGradient>
</defs>
<circle cx="104" cy="112" r="106" fill="url(#xmHalo)"/>
<path d="M146.96 37.81 A84 84 0 1 0 165.08 167.67 A74 74 0 0 1 146.96 37.81 Z" fill="url(#xmFill)"/>
<path d="M146.96 37.81 A84 84 0 1 0 165.08 167.67 A74 74 0 0 1 146.96 37.81 Z" fill="url(#xmShade)"/>
<circle cx="42" cy="84" r="13" fill="url(#xmMare)"/>
<circle cx="100" cy="60" r="10" fill="url(#xmMare)"/>
<path d="M146.96 37.81 A84 84 0 1 0 165.08 167.67 A74 74 0 0 1 146.96 37.81 Z" fill="url(#xmHi)"/>
<path d="M146.96 37.81 A84 84 0 1 0 165.08 167.67 A74 74 0 0 1 146.96 37.81 Z"
      fill="none" stroke="#b07c5a" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="54" cy="120" r="13" fill="url(#xmBlush)"/>
<circle cx="110" cy="120" r="13" fill="url(#xmBlush)"/>
<g fill="none" stroke="#7a5142" stroke-width="3.4" stroke-linecap="round">
  <path d="M49 106 Q60 92 71 106"/>
  <path d="M93 106 Q104 92 115 106"/>
  <path d="M70 130 Q82 143 94 130"/>
</g>
<g fill="none" stroke="#d9c8ff" stroke-linecap="round" stroke-linejoin="round">
  <path d="M120 88 h13 l-13 14 h13" stroke-width="3.2" opacity="0.95"/>
  <path d="M141 67 h10 l-10 11 h10" stroke-width="2.8" opacity="0.78"/>
  <path d="M157 50 h8 l-8 9 h8" stroke-width="2.4" opacity="0.6"/>
</g>
`;

// 夜空小星(四角 sparkle),仅晚安屏装饰用。
const MOON_STARS = `
<g fill="#fff1bf">
  <path d="M40 39 Q40 44 45 44 Q40 44 40 49 Q40 44 35 44 Q40 44 40 39 Z" opacity="0.9"/>
  <path d="M24 153 Q24 157.5 28.5 157.5 Q24 157.5 24 162 Q24 157.5 19.5 157.5 Q24 157.5 24 153 Z" opacity="0.68"/>
  <path d="M186 62 Q186 66 190 66 Q186 66 186 70 Q186 66 182 66 Q186 66 186 62 Z" opacity="0.8"/>
  <path d="M188 165 Q188 170 193 170 Q188 170 188 175 Q188 170 183 170 Q188 170 188 165 Z" opacity="0.82"/>
  <path d="M201 120 Q201 123 204 123 Q201 123 201 126 Q201 123 198 123 Q201 123 201 120 Z" opacity="0.6"/>
</g>
`;

/** 完整 SVG 字符串(自带 width/height,便于当作 <img>/纹理解码)。 */
export function buildMoonSvg(px = 220, withStars = false): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 220 220">${withStars ? MOON_STARS : ""}${MOON_INNER}</svg>`;
}

/** 给 three.js 当贴图用的 data URL(512² 解码,够清晰;不含星星)。 */
export const MOON_TEXTURE_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildMoonSvg(512, false))}`;
