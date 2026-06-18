// 心屿统一线型 SVG 图标集——1.5px stroke，无填充。
// 取代散落的 emoji，强化品牌一致性。

import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

// 情绪潮汐——三道海浪
export function IconWave(p: Props) {
  return (
    <Base {...p}>
      <path d="M3 8 Q7 5 12 8 T21 8" />
      <path d="M3 13 Q7 10 12 13 T21 13" />
      <path d="M3 18 Q7 15 12 18 T21 18" />
    </Base>
  );
}

// 记忆贝壳
export function IconShell(p: Props) {
  return (
    <Base {...p}>
      <path d="M12 4 C 4 9 4 17 12 21 C 20 17 20 9 12 4 Z" />
      <path d="M12 4 V21" />
      <path d="M12 4 L7 12" />
      <path d="M12 4 L17 12" />
    </Base>
  );
}

// 岛屿天气
export function IconIsland(p: Props) {
  return (
    <Base {...p}>
      <circle cx="17" cy="7" r="1.5" />
      <path d="M3 17 Q8 13 12 14 T21 17 L21 21 L3 21 Z" />
      <path d="M7 17 Q11 11 14 12 T19 17" />
    </Base>
  );
}

// 叙事羽毛笔
export function IconQuill(p: Props) {
  return (
    <Base {...p}>
      <path d="M20 4 L9 15 L7 17 L5 19 L3 21" />
      <path d="M14 10 L9 15 L5 16" />
      <path d="M20 4 L14 10" />
    </Base>
  );
}

// 安全灯塔
export function IconLighthouse(p: Props) {
  return (
    <Base {...p}>
      <path d="M12 3 L10 8 L14 8 Z" />
      <path d="M10 8 L9 18 L15 18 L14 8" />
      <path d="M9 18 L15 18 L16 21 L8 21 Z" />
      <path d="M6 6 L9 8" />
      <path d="M18 6 L15 8" />
      <circle cx="12" cy="6" r="0.8" fill="currentColor" />
    </Base>
  );
}

// 月光小岛——品牌印记
export function IconBrandIsland(p: Props) {
  const { size = 32, ...rest } = p;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden {...rest}>
      <defs>
        <radialGradient id="brand-moon" cx="0.5" cy="0.5">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="14" r="5" fill="url(#brand-moon)" opacity="0.92" />
      <path d="M0 36 Q12 30 24 32 T48 36 L48 48 L0 48 Z" fill="#9fb4f0" opacity="0.85" />
      <path d="M14 36 Q20 22 26 24 T38 36 Z" fill="#0a0e1f" />
      <path d="M0 42 Q14 40 26 41 T48 42" stroke="#fff" strokeOpacity="0.2" strokeWidth="0.5" fill="none" />
    </svg>
  );
}

// 静默贝壳（小，用在留下物件时）
export function IconSilentShell(p: Props) {
  return (
    <Base {...p}>
      <ellipse cx="12" cy="13" rx="8" ry="6" />
      <path d="M4 13 Q12 7 20 13" />
      <path d="M8 13 Q12 9 16 13" />
      <circle cx="12" cy="13" r="0.8" fill="currentColor" />
    </Base>
  );
}

// 心境石
export function IconGlyphStone(p: Props) {
  return (
    <Base {...p}>
      <path d="M5 15 Q4 10 8 7 Q12 5 16 7 Q20 10 19 15 Q19 19 14 20 Q9 20 5 17 Z" />
    </Base>
  );
}

// 纸船
export function IconPaperBoat(p: Props) {
  return (
    <Base {...p}>
      <path d="M3 15 L21 15 L18 19 L6 19 Z" />
      <path d="M12 4 L12 15" />
      <path d="M12 4 L3 15" />
    </Base>
  );
}

// 暖灯（lantern）
export function IconLantern(p: Props) {
  return (
    <Base {...p}>
      <path d="M9 5 L15 5" />
      <path d="M12 5 L12 7" />
      <path d="M8 7 L16 7 L15 17 L9 17 Z" />
      <path d="M8 7 L7 17 L9 17" />
      <path d="M16 7 L17 17 L15 17" />
      <path d="M9 17 L9 20 L15 20 L15 17" />
    </Base>
  );
}

// ×——dismiss
export function IconX(p: Props) {
  return (
    <Base {...p}>
      <path d="M6 6 L18 18" />
      <path d="M18 6 L6 18" />
    </Base>
  );
}

// ✓——check
export function IconCheck(p: Props) {
  return (
    <Base {...p}>
      <path d="M5 12 L10 17 L19 7" />
    </Base>
  );
}

// 月亮——night
export function IconMoon(p: Props) {
  return (
    <Base {...p}>
      <path d="M21 13 A8 8 0 1 1 11 3 A6 6 0 0 0 21 13 Z" />
    </Base>
  );
}
