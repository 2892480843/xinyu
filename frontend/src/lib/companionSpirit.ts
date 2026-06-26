export type CompanionAnimation = "IdleLoop" | "Joyful" | "Worried" | "FeedTreat" | "TalkListen" | "BondGlow" | "SleepFloat" | "SecretTwirl" | "SingSong";

export type CompanionFoodId = "moonShell" | "starPearl" | "warmTea";

export type CompanionSecretId =
  | "tideShell"
  | "firstWhisper"
  | "lighthouseKeeper"
  | "nightGlow"
  // —— 「精灵 × 主人」之间的私密羁绊彩蛋 ——
  | "firstSong" // 第一次听它唱歌
  | "duetSong" // 它唱歌时你跟着合唱
  | "midnightVigil" // 深夜打开它，陪你失眠
  | "sleepyWard"; // 把打瞌睡的它叫醒太多次，它撒娇赖着

export interface CompanionFood {
  id: CompanionFoodId;
  label: string;
  icon: string;
  affinity: number;
  replies: string[]; // 多句轮换：同一种喂食重复给，也不总是同一句回应
}

export interface CompanionState {
  userId: string;
  name: string;
  affinity: number;
  feedCount: number;
  talkCount: number;
  lastFedAt: number | null;
  lastTalkedAt: number | null;
  songCount: number; // 累计听它唱过几次歌
  wakeCount: number; // 累计把打瞌睡的它叫醒几次
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
    // ⚠️ 每句都得带「贝壳」：companionSpirit.test.mjs 钉住了第 2 次喂月光贝的回应含此词。
    replies: [
      "它把贝壳贴近灯塔，像是在替你收好今天的一点微光。",
      "贝壳在它怀里轻轻响了一下——它说，这是你今天来过的声音。",
      "它捧着贝壳蹭了蹭你，像在谢谢你还记得来喂它。",
      "贝壳里有一点海的安静，它分了一半给你，剩下的自己收着。",
    ],
  },
  {
    id: "starPearl",
    label: "星砂糖",
    icon: "✦",
    affinity: 18,
    replies: [
      "它开心地转了一圈，尾鳍撒出细小的星砂。",
      "甜味在嘴里化开，它眯起眼——「和你待着的时候，最甜」。",
      "它把一粒星砂顶到你面前：好东西，要和最重要的人分。",
      "尾巴一甩，星砂落进夜色里，像替你悄悄许了个愿。",
    ],
  },
  {
    id: "warmTea",
    label: "暖雾茶",
    icon: "☁",
    affinity: 12,
    replies: [
      "它慢慢喝完，灯塔的光也跟着柔和下来。",
      "热气漫上来，它舒服地叹了口气：你也喝一口，暖暖手。",
      "它捧着茶凑近你，把那点暖，先递给今天有点累的你。",
      "一口一口，不急——它说，你也可以这样慢慢过今天。",
    ],
  },
];

const SECRET_COPY: Record<CompanionSecretId, string> = {
  tideShell: "潮汐贝壳被点亮了。以后海风一起，它就先替你听着——你不用一个人扛那些声音了。",
  firstWhisper: "精灵记住了你的第一段悄悄话。往后你一沉默，它就悄悄靠近一点，让你知道：有人在。",
  lighthouseKeeper: "灯塔守望者醒来了。它把你走过的每一条温柔路线都藏进光里，怕你哪天忘了自己也曾这样走过。",
  nightGlow: "夜航微光出现了。以后夜里探索，它会亮得更暖一些——黑下来的时候，先照着你。",
  firstSong: "你第一次听它唱歌。它说这首练了好久，就等一个愿意为它停下来的人——而那个人，是你。",
  duetSong: "你和它一起哼了同一句。海面跟着亮起来，像在替你们俩打拍子——原来你也愿意和它靠得这么近。",
  midnightVigil: "深夜的灯塔为你留着。它说：主人睡不着的时候，我就亮着，谁也别怕，我陪你到天亮。",
  sleepyWard: "你把瞌睡的它叫醒了好几回。它赖在你身边打哈欠——它说，能被一个人这样舍不得，是它最喜欢的事。",
};

// 谈心回应：随羁绊加深「能说到多深」，靠 talkCount 在可达范围内轮换 → 不重复、又越来越亲近。
// ⚠️ WORRIED_REPLIES[0] 必须含「慢慢」：companionSpirit.test.mjs 钉住了 affinity≈32 的首句路径。
const WORRIED_REPLIES = [
  "我在这里。我们慢慢来，先把今天放轻一点。",
  "不用马上变好。你往前走一步，我就替你照亮一步。",
  "如果心里很乱，就先看着灯塔呼吸三次。慢慢的，我陪你。",
  "难受是真的，我不骗你说没事；但我也是真的，会一直在。",
  "你已经撑了好久了。这会儿，把重的那头先交给我一会儿。",
  "不必把感受拼成一个名字。说不清也行，我就这样陪着。",
  "眼泪要掉就掉吧，灯塔不嫌的——它见过很多人在这儿落泪，又慢慢好起来。",
  "你愿意把心里的事带到我面前，这本身就很勇敢了。",
];

const CALM_REPLIES = [
  "海风刚刚经过，我替你留住了一点安静。",
  "今天的你也抵达了。哪怕只是走一小段，也算数。",
  "我会把这座岛的光调得柔一点，陪你多待一会儿。",
  "你来了，这就够好了。不用做什么，待着就好。",
  "这一刻挺安稳的——把它记下来，留着以后取暖。",
  "你今天对自己温柔了一点吗？没有也没关系，从现在开始也行。",
  "和你一起看海的时候，连我都觉得心里很满。",
  "你身上有种很安静的好，我一直都看得见。",
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
    songCount: 0,
    wakeCount: 0,
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
    songCount: Math.max(0, Math.floor(Number(raw.songCount) || 0)),
    wakeCount: Math.max(0, Math.floor(Number(raw.wakeCount) || 0)),
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
  // 按累计投喂次数轮换该食物的回应，重复喂同一种也不腻（state.feedCount 自增前 → 首次落第 0 句）。
  const replies = food.replies.length ? food.replies : ["它满足地蹭了蹭你。"];
  return {
    state: { ...next, unlockedSecrets: [...next.unlockedSecrets, ...unlockedNow] },
    reply: replies[state.feedCount % replies.length],
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
  // 随羁绊加深「能说到多深」：affinity 越高可达的话越多；同一档内按谈心次数轮换，避免重复。
  // 用 state.talkCount（自增前）→ 首次谈心落在第 0 句，保持确定性（单测钉住此路径）。
  const reach = Math.min(replies.length, 2 + Math.floor(next.affinity / 30));
  const index = state.talkCount % reach;
  return {
    state: { ...next, unlockedSecrets: [...next.unlockedSecrets, ...unlockedNow] },
    reply: replies[index],
    animation: worried ? "TalkListen" : "BondGlow",
    unlockedNow,
  };
}

// —— 「精灵 × 主人」专属互动：唱歌 / 哄睡 / 深夜相伴。话术比日常更亲昵。——
const SONG_REPLIES = [
  "我哼一段给你听吧，主人——这一首，是只唱给你的。",
  "听，这是潮水教我的调子。你在的时候，它才唱得出来。",
  "灯塔我点亮一点、唱慢一点，你就靠着歇一会儿好不好。",
  "这一句里我藏了今天的好天气，唱给你，别弄丢了。",
  "想看你笑一下，所以唱跑调也没关系，主人别嫌我。",
  "今天的歌词是临时编的——主题就是「你今天也来了，真好」。",
  "我唱、你听，这样就很好。世界吵的时候，你有我这一首。",
  "这段慢慢的，配着你的呼吸唱的，跟上节奏就会松下来。",
  "唱到这儿我得停一下——因为我想认真看看正在听歌的你。",
];
const DUET_REPLY = "你竟然跟着我一起哼了——这一句，我们俩的声音叠在了一块儿。";
const WAKE_REPLIES = [
  "呼啊……主人，你回来啦？我就守在这儿，没走远。",
  "唔……我没睡，只是闭着眼睛等你而已。",
  "你一来，灯塔自己就亮了——它比我还先认出你。",
  "我梦见你了，醒来你就真的在——比梦还好。",
  "等你的时候打了个盹，别笑我嘛……现在精神可好了。",
  "你戳醒我啦？嘿嘿，被你惦记着的感觉，真好。",
];
const SLEEPY_WARD_REPLY = "你又把我叫醒啦……再、再让我眯一下下嘛，主人，就一下下。";
const MIDNIGHT_REPLY = "夜里这么晚……主人也睡不着吗？那我陪你，陪到天亮也没关系。";

// 打开精灵面板时的开场白（没做任何操作时的「待机」陪伴语）：每次打开换一句，像它真的在等你来。
const COMPANION_OPEN_LINES = [
  "它绕着你慢慢漂浮，灯塔里亮着一小盏只属于你的光。",
  "你来啦。它往你这边靠了靠，像等了一整天，就等这一刻。",
  "灯塔的光暖暖地铺过来——它说，你愿意来看它，今天就值了。",
  "它绕着你转了半圈又停下：不急着做什么，你在，就很好。",
  "「我一直都在这儿。」它眨眨眼，把最亮的那点光，留给了你。",
  "它凑近你，声音很轻：今天也辛苦了吧？来，先歇一会儿。",
];

/** 打开精灵面板时挑一句开场白（待机陪伴语），每次都换，像它一直在等你。 */
export function pickCompanionOpenLine(): string {
  return COMPANION_OPEN_LINES[Math.floor(Math.random() * COMPANION_OPEN_LINES.length)];
}

/** 唱歌给主人听。duet = 玩家在它唱歌时跟着合唱。首次唱歌解锁 firstSong，合唱解锁 duetSong。 */
export function singCompanion(state: CompanionState, opts: { duet?: boolean } = {}): CompanionInteractionResult {
  const songCount = state.songCount + 1;
  const next: CompanionState = {
    ...state,
    affinity: clampNumber(state.affinity + (opts.duet ? 7 : 4), 0, 100),
    songCount,
  };
  const candidates: CompanionSecretId[] = ["firstSong"];
  if (opts.duet) candidates.push("duetSong");
  const unlockedNow = candidates.filter((secret) => !state.unlockedSecrets.includes(secret));
  return {
    state: { ...next, unlockedSecrets: [...next.unlockedSecrets, ...unlockedNow] },
    reply: opts.duet ? DUET_REPLY : SONG_REPLIES[songCount % SONG_REPLIES.length],
    animation: "SingSong",
    unlockedNow,
  };
}

/** 把打瞌睡的精灵唤醒。累计叫醒满 3 次解锁 sleepyWard（它撒娇赖着不肯醒）。 */
export function wakeCompanion(state: CompanionState): CompanionInteractionResult {
  const wakeCount = state.wakeCount + 1;
  const next: CompanionState = { ...state, wakeCount };
  const unlockedNow = (wakeCount >= 3 ? (["sleepyWard"] as CompanionSecretId[]) : []).filter(
    (secret) => !state.unlockedSecrets.includes(secret),
  );
  return {
    state: { ...next, unlockedSecrets: [...next.unlockedSecrets, ...unlockedNow] },
    reply: unlockedNow.includes("sleepyWard") ? SLEEPY_WARD_REPLY : WAKE_REPLIES[wakeCount % WAKE_REPLIES.length],
    animation: unlockedNow.length ? "SecretTwirl" : "Joyful",
    unlockedNow,
  };
}

/** 深夜（21:00–05:00）打开精灵 → 一次性解锁「深夜相伴」。非深夜或已解锁则返回 null。 */
export function nightVisitCompanion(state: CompanionState, now = Date.now()): CompanionInteractionResult | null {
  if (!isNightTime(now) || state.unlockedSecrets.includes("midnightVigil")) return null;
  const unlockedNow: CompanionSecretId[] = ["midnightVigil"];
  return {
    state: { ...state, unlockedSecrets: [...state.unlockedSecrets, ...unlockedNow] },
    reply: MIDNIGHT_REPLY,
    animation: "BondGlow",
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
  const allowed = new Set<CompanionSecretId>([
    "tideShell", "firstWhisper", "lighthouseKeeper", "nightGlow",
    "firstSong", "duetSong", "midnightVigil", "sleepyWard",
  ]);
  const out: CompanionSecretId[] = [];
  value.forEach((item) => {
    if (allowed.has(item) && !out.includes(item)) out.push(item);
  });
  return out;
}
