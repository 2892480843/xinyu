// 心象元素统一线型 SVG 图标集——取代散落的 emoji（全作品唯一塑料感破绽）。
// 1.5px stroke、viewBox 24、吃 currentColor，可被父层 drop-shadow 染成发光。
// 用「共享形状」覆盖全部 FEATURE_META 键：相近意象复用同一图形，约 30 个键映射到 ~25 个图形。

import type { CSSProperties, ReactNode } from "react";

const lighthouse = (
  <>
    <path d="M12 3 L10 8 L14 8 Z" />
    <path d="M10 8 L9 18 L15 18 L14 8" />
    <path d="M9 18 L15 18 L16 21 L8 21 Z" />
    <path d="M6 6 L9 8" />
    <path d="M18 6 L15 8" />
    <circle cx="12" cy="6" r="0.9" fill="currentColor" stroke="none" />
  </>
);

const star = (
  <path d="M12 3 L14 9.2 L20.5 9.2 L15.2 13 L17.2 19.3 L12 15.4 L6.8 19.3 L8.8 13 L3.5 9.2 L10 9.2 Z" />
);

const sparkle = (
  <>
    <path d="M12 5 L13 11 L19 12 L13 13 L12 19 L11 13 L5 12 L11 11 Z" fill="currentColor" stroke="none" opacity="0.9" />
    <circle cx="18.5" cy="16" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="6" cy="17" r="0.7" fill="currentColor" stroke="none" opacity="0.7" />
  </>
);

const fireflies = (
  <>
    <circle cx="8" cy="15" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="14" cy="9" r="1" fill="currentColor" stroke="none" opacity="0.8" />
    <circle cx="17" cy="15" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="11" cy="12.5" r="0.7" fill="currentColor" stroke="none" opacity="0.6" />
  </>
);

const flower = (
  <>
    <circle cx="12" cy="7" r="2.3" />
    <circle cx="7" cy="11" r="2.3" />
    <circle cx="17" cy="11" r="2.3" />
    <circle cx="9" cy="16" r="2.3" />
    <circle cx="15" cy="16" r="2.3" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </>
);

const butterfly = (
  <>
    <path d="M12 7 V17" />
    <path d="M12 9 C7 5 3 8 5 12 C6 15 10 14 12 12" />
    <path d="M12 9 C17 5 21 8 19 12 C18 15 14 14 12 12" />
    <path d="M12 7 L10 4" />
    <path d="M12 7 L14 4" />
  </>
);

const sun = (
  <>
    <circle cx="12" cy="12" r="3.8" />
    <path d="M12 3 V5" />
    <path d="M12 19 V21" />
    <path d="M3 12 H5" />
    <path d="M19 12 H21" />
    <path d="M5.5 5.5 L7 7" />
    <path d="M17 17 L18.5 18.5" />
    <path d="M18.5 5.5 L17 7" />
    <path d="M7 17 L5.5 18.5" />
  </>
);

const sunrise = (
  <>
    <path d="M3.5 18 H20.5" />
    <path d="M7.5 18 A4.5 4.5 0 0 1 16.5 18" />
    <path d="M12 6 V8" />
    <path d="M5.5 10 L7 11.5" />
    <path d="M18.5 10 L17 11.5" />
  </>
);

const fog = (
  <>
    <path d="M4 8 H11" />
    <path d="M14 8 H20" />
    <path d="M4 12 H9" />
    <path d="M12 12 H19" />
    <path d="M5 16 H13" />
    <path d="M16 16 H20" />
  </>
);

const rock = (
  <>
    <path d="M4 18 Q4 12 9 11 Q14 10 17 13 Q20 15 18 18 Q12 20 4 18 Z" />
    <path d="M9 11 L11 15" />
  </>
);

const cairn = (
  <>
    <ellipse cx="12" cy="18" rx="6" ry="2.2" />
    <ellipse cx="12" cy="13.5" rx="4.5" ry="1.9" />
    <ellipse cx="12" cy="9.5" rx="3" ry="1.6" />
  </>
);

const glyphStone = (
  <>
    <path d="M5 15 Q4 10 8 7 Q12 5 16 7 Q20 10 19 15 Q19 19 14 20 Q9 20 5 17 Z" />
    <path d="M10 11 H14" />
    <path d="M12 11 V16" />
  </>
);

const wind = (
  <>
    <path d="M3 9 H13 a2.5 2.5 0 1 0 -2.5 -2.5" />
    <path d="M3 14 H17 a2.5 2.5 0 1 1 -2.5 2.5" />
    <path d="M3 18.5 H9" />
  </>
);

const leaf = (
  <>
    <path d="M5 19 C5 10 11 5 19 5 C19 13 13 19 5 19 Z" />
    <path d="M7 17 L16 8" />
  </>
);

const rain = (
  <>
    <ellipse cx="12" cy="10" rx="6" ry="3.2" />
    <path d="M8 15 L7 18" />
    <path d="M12 15 L11 18" />
    <path d="M16 15 L15 18" />
  </>
);

const storm = (
  <>
    <ellipse cx="12" cy="9" rx="6" ry="3" />
    <path d="M12.5 12 L9.5 16 H12 L10 20" />
  </>
);

const wave = (
  <>
    <path d="M3 10 Q7 7 12 10 T21 10" />
    <path d="M3 15 Q7 12 12 15 T21 15" />
  </>
);

const spray = (
  <>
    <path d="M3 16 Q7 13 12 16 T21 16" />
    <circle cx="8" cy="8" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="12" cy="6" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="16" cy="8" r="0.8" fill="currentColor" stroke="none" />
  </>
);

const ripple = (
  <>
    <path d="M5 11 H19" />
    <path d="M7 15 H17" />
    <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" opacity="0.7" />
  </>
);

const tree = (
  <>
    <path d="M12 21 V13" />
    <circle cx="12" cy="9" r="5" />
    <path d="M12 14 L9 11" />
    <path d="M12 16 L15 13" />
  </>
);

const boat = (
  <>
    <path d="M4 16 H20 L17.5 20 H6.5 Z" />
    <path d="M12 4 V16" />
    <path d="M12 5 L18 14 H12 Z" />
  </>
);

const tent = (
  <>
    <path d="M4 19 L12 6 L20 19 Z" />
    <path d="M12 6 V19" />
    <path d="M9.5 19 L12 14 L14.5 19" />
  </>
);

const hammock = (
  <>
    <path d="M4 7 V13" />
    <path d="M20 7 V13" />
    <path d="M4.5 9 Q12 18 19.5 9" />
    <path d="M5 9 H7" />
    <path d="M17 9 H19" />
  </>
);

const flame = (
  <>
    <path d="M12 4 C9.5 8 8.5 10 8.5 13.5 a3.5 3.5 0 0 0 7 0 C15.5 10 14.5 8 12 4 Z" />
    <path d="M12 10 C11 12 10.8 13 11 14.5" />
  </>
);

const candle = (
  <>
    <path d="M12 4 C10.5 6.5 10 8 10 10 a2 2 0 0 0 4 0 C14 8 13.5 6.5 12 4 Z" />
    <path d="M9 12 H15 V20 H9 Z" />
    <path d="M12 10 V12" />
  </>
);

const bonfire = (
  <>
    <path d="M12 5 C10 8 9 9.5 9 12 a3 3 0 0 0 6 0 C15 9.5 14 8 12 5 Z" />
    <path d="M5 19 L19 16" />
    <path d="M5 16 L19 19" />
  </>
);

const lamp = (
  <>
    <path d="M8 14 L9.5 9 H14.5 L16 14 Z" />
    <path d="M11 9 V7 H13 V9" />
    <path d="M4 18 Q8 16 12 18 T20 18" />
  </>
);

const lantern = (
  <>
    <path d="M9 5 L15 5" />
    <path d="M12 5 L12 7" />
    <path d="M8 7 L16 7 L15 17 L9 17 Z" />
    <path d="M9 17 L9 20 L15 20 L15 17" />
  </>
);

const shell = (
  <>
    <path d="M12 4 C4 9 4 17 12 21 C20 17 20 9 12 4 Z" />
    <path d="M12 4 V21" />
    <path d="M12 4 L7 12" />
    <path d="M12 4 L17 12" />
  </>
);

const silentShell = (
  <>
    <ellipse cx="12" cy="13" rx="8" ry="6" />
    <path d="M4 13 Q12 7 20 13" />
    <path d="M8 13 Q12 9 16 13" />
  </>
);

const moon = <path d="M21 13 A8 8 0 1 1 11 3 A6 6 0 0 0 21 13 Z" />;

const kite = (
  <>
    <path d="M12 3 L18 10 L12 16 L6 10 Z" />
    <path d="M12 3 V16" />
    <path d="M6 10 H18" />
    <path d="M12 16 Q13.5 19 11 20 Q13.5 21 11.5 22.5" />
  </>
);

const feather = (
  <>
    <path d="M19 5 C11 5 5 11 5 19" />
    <path d="M19 5 C19 13 13 19 6 19" />
    <path d="M9 13 L7 18" />
    <path d="M13 9 L11 14" />
  </>
);

const paperBoat = (
  <>
    <path d="M3 15 L21 15 L18 19 L6 19 Z" />
    <path d="M12 4 L12 15" />
    <path d="M12 4 L3 15" />
  </>
);

const defaultGlyph = <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" opacity="0.85" />;

// 键 → 图形（相近意象共享）。与 islandMeta.FEATURE_META 的键集对齐。
const GLYPHS: Record<string, ReactNode> = {
  // —— 情绪元素 ——
  lighthouse,
  stars: sparkle,
  fireflies,
  flowers: flower,
  butterflies: butterfly,
  sunshine: sun,
  fog,
  rocks: rock,
  wind,
  rain,
  tide: wave,
  single_tree: tree,
  moonlight: moon,
  distant_boat: boat,
  sailboat: boat,
  calm_water: ripple,
  sunrise,
  cliffs: cairn,
  storm,
  spray,
  faint_light: flame,
  still_water: ripple,
  shelter: tent,
  hammock,
  // —— 玩家物件 ——
  lantern,
  paper_boat: paperBoat,
  night_flower: flower,
  shell,
  star_wish: star,
  river_lamp: lamp,
  stone_cairn: cairn,
  kite,
  feather,
  candle,
  sail: boat,
  leaf_note: leaf,
  bonfire,
  bloom: flower,
  silent_shell: silentShell,
  glyph_stone: glyphStone,
};

interface Props {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export default function FeatureGlyph({ name, size = 26, className, style }: Props) {
  const body = GLYPHS[name] ?? defaultGlyph;
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
      className={className}
      style={style}
      aria-hidden
    >
      {body}
    </svg>
  );
}
