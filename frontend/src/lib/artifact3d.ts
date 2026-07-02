export type ArtifactRenderKind = "glb" | "procedural";

export interface Artifact3dEntry {
  key: string;
  label: string;
  kind: ArtifactRenderKind;
  url?: string;
  scale: number;
  yOffset?: number;
  tags: string[];
  note: string;
}

export const ARTIFACT_3D_KEYS = [
  "lantern",
  "paper_boat",
  "night_flower",
  "shell",
  "star_wish",
  "river_lamp",
  "stone_cairn",
  "kite",
  "feather",
  "candle",
  "sail",
  "leaf_note",
  "bonfire",
  "bloom",
  "silent_shell",
  "glyph_stone",
] as const;

export type Artifact3dKey = typeof ARTIFACT_3D_KEYS[number];

export const ARTIFACT_3D_REGISTRY: Record<Artifact3dKey, Artifact3dEntry> = {
  lantern: {
    key: "lantern",
    label: "暖灯",
    kind: "glb",
    url: "/models/kmd.glb",
    scale: 1.25,
    tags: ["existing-glb", "ritual", "large"],
    note: "复用已接入的天灯模型，适合表现升起的暖灯。",
  },
  paper_boat: {
    key: "paper_boat",
    label: "纸船",
    kind: "glb",
    url: "/models/xy_item_paperboat.glb",
    scale: 0.9,
    tags: ["existing-glb", "newly-wired"],
    note: "已有纸船 GLB，之前未纳入自由探索模型表。",
  },
  night_flower: {
    key: "night_flower",
    label: "夜来香",
    kind: "glb",
    url: "/models/xy_item_nightflower.glb",
    scale: 1.1,
    tags: ["existing-glb"],
    note: "已有夜来香模型，可直接复用。",
  },
  shell: {
    key: "shell",
    label: "贝壳",
    kind: "glb",
    url: "/models/xy_item_shell.glb",
    scale: 1,
    yOffset: 0.03,
    tags: ["existing-glb"],
    note: "已有贝壳模型，可直接复用。",
  },
  star_wish: {
    key: "star_wish",
    label: "星愿",
    kind: "glb",
    url: "/models/xy_item_star_wish.glb",
    scale: 0.85,
    tags: ["dedicated-glb", "ritual"],
    note: "专属星形心愿模型，中心使用 Emissive_StarCore 发光材质。",
  },
  river_lamp: {
    key: "river_lamp",
    label: "河灯",
    kind: "glb",
    url: "/models/xy_item_riverlamp.glb",
    scale: 0.7,
    yOffset: 0.08,
    tags: ["existing-glb"],
    note: "已有河灯模型，可直接复用。",
  },
  stone_cairn: {
    key: "stone_cairn",
    label: "石堆",
    kind: "glb",
    url: "/models/xy_item_cairn.glb",
    scale: 0.85,
    tags: ["existing-glb"],
    note: "已有石堆模型，可直接复用。",
  },
  kite: {
    key: "kite",
    label: "风筝",
    kind: "glb",
    url: "/models/xy_item_kite.glb",
    scale: 1.25,
    yOffset: 4.8,
    tags: ["existing-glb", "airborne"],
    note: "已有风筝模型，摆放时需要离地。",
  },
  feather: {
    key: "feather",
    label: "羽毛",
    kind: "glb",
    url: "/models/xy_item_feather.glb",
    scale: 1,
    yOffset: 0.08,
    tags: ["existing-glb", "newly-wired"],
    note: "已有羽毛 GLB，之前未纳入自由探索模型表。",
  },
  candle: {
    key: "candle",
    label: "烛火",
    kind: "glb",
    url: "/models/xy_item_candle.glb",
    scale: 1,
    tags: ["existing-glb", "newly-wired"],
    note: "已有烛火 GLB，之前未纳入自由探索模型表。",
  },
  sail: {
    key: "sail",
    label: "小帆",
    kind: "glb",
    url: "/models/xy_item_sail.glb",
    scale: 0.8,
    yOffset: 0.05,
    tags: ["dedicated-glb", "ritual"],
    note: "专属小帆模型，包含 SmallSail 节点和 SailCloth 帆布材质。",
  },
  leaf_note: {
    key: "leaf_note",
    label: "叶笺",
    kind: "glb",
    url: "/models/xy_item_leafnote.glb",
    scale: 1,
    yOffset: 0.04,
    tags: ["existing-glb", "newly-wired"],
    note: "已有叶笺 GLB，之前未纳入自由探索模型表。",
  },
  bonfire: {
    key: "bonfire",
    label: "篝火",
    kind: "glb",
    url: "/models/xy_item_bonfire.glb",
    scale: 1,
    tags: ["existing-glb"],
    note: "已有篝火模型，可直接复用。",
  },
  bloom: {
    key: "bloom",
    label: "花",
    kind: "glb",
    url: "/models/xy_item_bloom.glb",
    scale: 1,
    tags: ["dedicated-glb", "ritual"],
    note: "专属单朵仪式花，花心使用 Emissive_BloomCore 发光材质。",
  },
  silent_shell: {
    key: "silent_shell",
    label: "静默贝壳",
    kind: "glb",
    url: "/models/xy_item_silent_shell.glb",
    scale: 1,
    yOffset: 0.03,
    tags: ["dedicated-glb", "ritual"],
    note: "专属暗色静默贝壳，带 SilentShellInner 内侧材质和微光珍珠。",
  },
  glyph_stone: {
    key: "glyph_stone",
    label: "心境石",
    kind: "glb",
    url: "/models/xy_item_glyph_stone.glb",
    scale: 0.9,
    tags: ["dedicated-glb", "ritual"],
    note: "专属刻纹心境石，正面刻痕使用 Emissive_Glyph 发光材质。",
  },
};

export function artifact3dUrl(key: string): string | null {
  const entry = ARTIFACT_3D_REGISTRY[key as Artifact3dKey];
  return entry?.kind === "glb" ? (entry.url ?? null) : null;
}

export function artifact3dGlbUrls(): string[] {
  return Array.from(new Set(ARTIFACT_3D_KEYS.map((key) => artifact3dUrl(key)).filter((url): url is string => Boolean(url))));
}
