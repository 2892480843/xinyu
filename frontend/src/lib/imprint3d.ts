export const IMPRINT_3D_SHAPES = ["star", "shell", "flower", "spark", "drop"] as const;

export type Imprint3dShape = typeof IMPRINT_3D_SHAPES[number];

export interface Imprint3dEntry {
  shape: Imprint3dShape;
  label: string;
  url: string;
  scale: number;
  yOffset: number;
  note: string;
}

export const IMPRINT_3D_REGISTRY: Record<Imprint3dShape, Imprint3dEntry> = {
  star: {
    shape: "star",
    label: "星光印记",
    url: "/models/xy_item_imprint_star.glb",
    scale: 1,
    yOffset: 0,
    note: "用于 happy 情绪，保持原先星/光点语义。",
  },
  shell: {
    shape: "shell",
    label: "贝壳印记",
    url: "/models/xy_item_imprint_shell.glb",
    scale: 1,
    yOffset: 0,
    note: "用于 calm 情绪，延续安静收纳的贝壳意象。",
  },
  flower: {
    shape: "flower",
    label: "花朵印记",
    url: "/models/xy_item_imprint_flower.glb",
    scale: 1,
    yOffset: 0,
    note: "用于 lonely 情绪，表达被看见后重新开花。",
  },
  spark: {
    shape: "spark",
    label: "火花印记",
    url: "/models/xy_item_imprint_spark.glb",
    scale: 1,
    yOffset: 0,
    note: "用于 angry 情绪，保留尖锐但可被承接的火花轮廓。",
  },
  drop: {
    shape: "drop",
    label: "水滴印记",
    url: "/models/xy_item_imprint_drop.glb",
    scale: 1,
    yOffset: 0,
    note: "用于 sad、anxious、tired、helpless 等沉重情绪。",
  },
};

export function imprintShapeForEmotion(emotion: string): Imprint3dShape {
  const value = emotion.trim().toLowerCase();
  if (value === "happy") return "star";
  if (value === "calm") return "shell";
  if (value === "lonely") return "flower";
  if (value === "angry") return "spark";
  return "drop";
}

export function imprint3dUrlForEmotion(emotion: string): string {
  return IMPRINT_3D_REGISTRY[imprintShapeForEmotion(emotion)].url;
}
