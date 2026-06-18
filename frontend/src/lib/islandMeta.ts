// 岛屿元素 / 趋势 / 导演台 Agent 的展示元数据，前端多处复用。

export interface FeatureMeta {
  icon: string;
  label: string;
  // 在场景下方「岛屿带」上的大致位置（百分比），用于叠加层定位
  left: number;
  bottom: number;
}

// 与后端 island_state_service.EMOTION_FEATURES 的 key 对齐
export const FEATURE_META: Record<string, FeatureMeta> = {
  lighthouse: { icon: "🗼", label: "灯塔", left: 78, bottom: 30 },
  stars: { icon: "✨", label: "星光", left: 24, bottom: 46 },
  fireflies: { icon: "🌟", label: "萤火", left: 60, bottom: 34 },
  flowers: { icon: "🌸", label: "花", left: 40, bottom: 26 },
  butterflies: { icon: "🦋", label: "蝴蝶", left: 55, bottom: 38 },
  sunshine: { icon: "☀️", label: "阳光", left: 72, bottom: 44 },
  fog: { icon: "🌫️", label: "雾", left: 50, bottom: 36 },
  rocks: { icon: "🪨", label: "礁石", left: 30, bottom: 24 },
  wind: { icon: "🍃", label: "风", left: 64, bottom: 40 },
  rain: { icon: "🌧️", label: "雨痕", left: 46, bottom: 42 },
  tide: { icon: "🌊", label: "潮水", left: 34, bottom: 22 },
  single_tree: { icon: "🌳", label: "孤树", left: 44, bottom: 28 },
  moonlight: { icon: "🌙", label: "月光", left: 76, bottom: 46 },
  distant_boat: { icon: "⛵", label: "远船", left: 20, bottom: 30 },
  sailboat: { icon: "⛵", label: "帆船", left: 58, bottom: 26 },
  calm_water: { icon: "💧", label: "静水", left: 36, bottom: 22 },
  sunrise: { icon: "🌅", label: "晨光", left: 70, bottom: 42 },
  cliffs: { icon: "🪨", label: "崖壁", left: 28, bottom: 28 },
  storm: { icon: "🌩️", label: "风暴", left: 66, bottom: 44 },
  spray: { icon: "🌊", label: "浪花", left: 42, bottom: 22 },
  faint_light: { icon: "🕯️", label: "微光", left: 52, bottom: 32 },
  still_water: { icon: "🪞", label: "静水", left: 38, bottom: 22 },
  shelter: { icon: "⛺", label: "避风处", left: 62, bottom: 26 },
  hammock: { icon: "🛏️", label: "吊床", left: 48, bottom: 26 },

  // 玩家通过岛屿仪式留下的物件（持久收藏），与后端 island_ritual_service.ARTIFACTS 对齐
  lantern: { icon: "🏮", label: "暖灯", left: 26, bottom: 32 },
  paper_boat: { icon: "🛶", label: "纸船", left: 18, bottom: 20 },
  night_flower: { icon: "🌼", label: "夜来香", left: 38, bottom: 24 },
  shell: { icon: "🐚", label: "贝壳", left: 32, bottom: 19 },
  star_wish: { icon: "⭐", label: "星愿", left: 74, bottom: 50 },
  river_lamp: { icon: "🪔", label: "河灯", left: 46, bottom: 19 },
  stone_cairn: { icon: "🪨", label: "石堆", left: 24, bottom: 24 },
  kite: { icon: "🪁", label: "风筝", left: 70, bottom: 54 },
  feather: { icon: "🪶", label: "羽毛", left: 56, bottom: 36 },
  candle: { icon: "🕯️", label: "烛火", left: 60, bottom: 28 },
  sail: { icon: "⛵", label: "小帆", left: 54, bottom: 22 },
  leaf_note: { icon: "🍃", label: "叶笺", left: 64, bottom: 30 },
  bonfire: { icon: "🔥", label: "篝火", left: 50, bottom: 24 },
  bloom: { icon: "🌸", label: "花", left: 42, bottom: 26 },
  silent_shell: { icon: "🌑", label: "静默贝壳", left: 28, bottom: 17 },
  glyph_stone: { icon: "🪨", label: "心境石", left: 36, bottom: 15 },
};

// 情绪 -> 心象地图节点颜色
export const EMOTION_COLOR: Record<string, string> = {
  sad: "#7c9cc4",
  anxious: "#9aa3b2",
  tired: "#8b9ad6",
  lonely: "#b8a9d6",
  calm: "#6fd3c4",
  happy: "#f5c86b",
  angry: "#d98a8a",
  helpless: "#8a9bb0",
};

export const TREND_META: Record<string, { label: string; tone: string }> = {
  recovering: { label: "正在恢复", tone: "text-emerald-200/80" },
  brightening: { label: "正在变亮", tone: "text-amber-200/80" },
  stormy: { label: "风浪较大", tone: "text-rose-200/80" },
  stable: { label: "平稳", tone: "text-sky-200/80" },
  mixed: { label: "天气交错", tone: "text-violet-200/80" },
};

export interface AgentMeta {
  key: string;
  label: string;
  icon: string;
}

// 导演台固定展示顺序（与后端 agent_trace 顺序一致）
export const AGENT_ORDER: AgentMeta[] = [
  { key: "emotion", label: "情绪分析", icon: "🌊" },
  { key: "memory", label: "记忆检索", icon: "🐚" },
  { key: "environment", label: "环境推理", icon: "🏝️" },
  { key: "narrative", label: "叙事表达", icon: "✍️" },
  { key: "safety", label: "安全边界", icon: "🛟" },
];
