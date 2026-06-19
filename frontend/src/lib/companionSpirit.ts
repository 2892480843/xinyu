export type CompanionAnimation = "IdleLoop" | "Joyful" | "Worried" | "FeedTreat" | "TalkListen" | "BondGlow" | "SleepFloat" | "SecretTwirl";

export type CompanionFoodId = "moonShell" | "starPearl" | "warmTea";

export type CompanionSecretId = "tideShell" | "firstWhisper" | "lighthouseKeeper" | "nightGlow";

export interface CompanionFood {
  id: CompanionFoodId;
  label: string;
  icon: string;
  affinity: number;
  reply: string;
}

export interface CompanionState {
  userId: string;
  name: string;
  affinity: number;
  feedCount: number;
  talkCount: number;
  lastFedAt: number | null;
  lastTalkedAt: number | null;
  unlockedSecrets: CompanionSecretId[];
}

export interface CompanionInteractionResult {
  state: CompanionState;
  reply: string;
  animation: CompanionAnimation;
  unlockedNow: CompanionSecretId[];
}

export const COMPANION_STORAGE_KEY = "xinyu.companionSpirit.v1";

export const COMPANION_FOODS: CompanionFood[] = [
  {
    id: "moonShell",
    label: "月光贝",
    icon: "◒",
    affinity: 14,
    reply: "它把贝壳贴近灯塔，像是在替你收好今天的一点微光。",
  },
  {
    id: "starPearl",
    label: "星砂糖",
    icon: "✦",
    affinity: 18,
    reply: "它开心地转了一圈，尾鳍撒出细小的星砂。",
  },
  {
    id: "warmTea",
    label: "暖雾茶",
    icon: "☁",
    affinity: 12,
    reply: "它慢慢喝完，灯塔的光也跟着柔和下来。",
  },
];

const SECRET_COPY: Record<CompanionSecretId, string> = {
  tideShell: "潮汐贝壳被点亮了。以后海风响起时，它会先替你听一会儿。",
  firstWhisper: "精灵记住了你的第一段悄悄话。它会在你沉默时靠近一点。",
  lighthouseKeeper: "灯塔守望者醒来了。它会把你走过的温柔路线藏进光里。",
  nightGlow: "夜航微光出现了。夜晚探索时，精灵会亮得更暖一些。",
};

const WORRIED_REPLIES = [
  "我在这里。我们慢慢来，先把今天放轻一点。",
  "不用马上变好。你往前走一步，我就替你照亮一步。",
  "如果心里很乱，就先看着灯塔呼吸三次。慢慢的，我陪你。",
];

const CALM_REPLIES = [
  "海风刚刚经过，我替你留住了一点安静。",
  "今天的你也抵达了。哪怕只是走一小段，也算数。",
  "我会把这座岛的光调得柔一点，陪你多待一会儿。",
];

export function createCompanionState(userId: string, name = "微光"): CompanionState {
  return {
    userId,
    name,
    affinity: 0,
    feedCount: 0,
    talkCount: 0,
    lastFedAt: null,
    lastTalkedAt: null,
    unlockedSecrets: [],
  };
}

export function normalizeCompanionState(value: unknown, userId: string): CompanionState {
  if (!value || typeof value !== "object") return createCompanionState(userId);
  const raw = value as Partial<CompanionState>;
  if (raw.userId !== userId) return createCompanionState(userId);
  return {
    userId,
    name: cleanName(raw.name),
    affinity: clampNumber(raw.affinity, 0, 100),
    feedCount: Math.max(0, Math.floor(Number(raw.feedCount) || 0)),
    talkCount: Math.max(0, Math.floor(Number(raw.talkCount) || 0)),
    lastFedAt: typeof raw.lastFedAt === "number" ? raw.lastFedAt : null,
    lastTalkedAt: typeof raw.lastTalkedAt === "number" ? raw.lastTalkedAt : null,
    unlockedSecrets: dedupeSecrets(raw.unlockedSecrets),
  };
}

export function loadCompanionState(userId: string, storage?: Pick<Storage, "getItem">): CompanionState {
  if (!storage) return createCompanionState(userId);
  try {
    const raw = storage.getItem(COMPANION_STORAGE_KEY);
    return normalizeCompanionState(raw ? JSON.parse(raw) : null, userId);
  } catch {
    return createCompanionState(userId);
  }
}

export function saveCompanionState(state: CompanionState, storage?: Pick<Storage, "setItem">) {
  if (!storage) return;
  try {
    storage.setItem(COMPANION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function feedCompanion(state: CompanionState, foodId: CompanionFoodId, now = Date.now()): CompanionInteractionResult {
  const food = COMPANION_FOODS.find((item) => item.id === foodId) ?? COMPANION_FOODS[0];
  const next: CompanionState = {
    ...state,
    affinity: clampNumber(state.affinity + food.affinity, 0, 100),
    feedCount: state.feedCount + 1,
    lastFedAt: now,
  };
  const unlockedNow = resolveUnlockedSecrets(state, next, now);
  return {
    state: { ...next, unlockedSecrets: [...next.unlockedSecrets, ...unlockedNow] },
    reply: food.reply,
    animation: "FeedTreat",
    unlockedNow,
  };
}

export function talkToCompanion(state: CompanionState, emotion?: string, now = Date.now()): CompanionInteractionResult {
  const worried = isWorriedEmotion(emotion);
  const replies = worried ? WORRIED_REPLIES : CALM_REPLIES;
  const next: CompanionState = {
    ...state,
    affinity: clampNumber(state.affinity + (worried ? 8 : 5), 0, 100),
    talkCount: state.talkCount + 1,
    lastTalkedAt: now,
  };
  const unlockedNow = resolveUnlockedSecrets(state, next, now);
  const index = Math.min(replies.length - 1, Math.floor(next.affinity / 34));
  return {
    state: { ...next, unlockedSecrets: [...next.unlockedSecrets, ...unlockedNow] },
    reply: replies[index],
    animation: worried ? "TalkListen" : "BondGlow",
    unlockedNow,
  };
}

export function renameCompanion(state: CompanionState, name: string): CompanionState {
  return {
    ...state,
    name: cleanName(name),
  };
}

export function getCompanionBondLabel(affinity: number): string {
  if (affinity >= 80) return "灵魂灯塔";
  if (affinity >= 50) return "安心同伴";
  if (affinity >= 25) return "熟悉微光";
  return "初遇";
}

export function getSecretText(secret: CompanionSecretId): string {
  return SECRET_COPY[secret];
}

function resolveUnlockedSecrets(before: CompanionState, after: CompanionState, now: number): CompanionSecretId[] {
  const candidates: CompanionSecretId[] = [];
  if (after.feedCount >= 2) candidates.push("tideShell");
  if (after.talkCount >= 1 && after.affinity >= 20) candidates.push("firstWhisper");
  if (after.affinity >= 50) candidates.push("lighthouseKeeper");
  if (isNightTime(now) && after.affinity >= 30) candidates.push("nightGlow");
  return candidates.filter((secret) => !before.unlockedSecrets.includes(secret));
}

function isWorriedEmotion(emotion?: string): boolean {
  const value = String(emotion ?? "").toLowerCase();
  return ["worried", "anxious", "sad", "heavy", "restless", "lonely", "焦虑", "担心", "难过", "孤独"].some((key) => value.includes(key));
}

function isNightTime(timestamp: number): boolean {
  const hour = new Date(timestamp).getHours();
  return hour >= 21 || hour < 5;
}

function clampNumber(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function cleanName(name: unknown): string {
  const value = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 8);
  return value || "微光";
}

function dedupeSecrets(value: unknown): CompanionSecretId[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<CompanionSecretId>(["tideShell", "firstWhisper", "lighthouseKeeper", "nightGlow"]);
  const out: CompanionSecretId[] = [];
  value.forEach((item) => {
    if (allowed.has(item) && !out.includes(item)) out.push(item);
  });
  return out;
}
