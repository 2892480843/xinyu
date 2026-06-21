// 🏮 放天灯·音乐线索 —— 放飞瞬间奏起的真实曲目（CC-BY 4.0，Kevin MacLeod / incompetech）。
//
// 与 sfx.ts 的「采样优先 + 合成降级」同理：命中已解码缓存则播真实音乐，未就绪
//（首次访问 / 断网 / 解码失败）则由调用方回退 sfx.ts 的 playLanternMelody 八音盒合成。
//
// 路由：复用 sfx.ts 唯一的 AudioContext；自有 cueGain → destination（音乐级音量，
// 不经 sfx 的 0.18 master，否则会被压得过轻）。受 MusicControl 一键静音联动
//（setLanternMusicMuted，与 BGM / SFX / 氛围底噪同开同关）。
//
// 时长收口：曲目本身 2~3 分钟，但放飞只是一段短庆典 → 仅播一小段后自动淡出
//（单灯 ~16s / 放飞一片 ~30s），不长占音轨；同时派发 `xinyu:bgm-duck` 让 BGM 暂时让位。
//
// 完整署名见 public/audio/CREDITS.md（与 9 首情绪 BGM 同源同协议）。

import { getAudioContext, isSfxMuted } from "./sfx";

export type LanternCue = "single" | "flock";

const CUE_FILES: Record<LanternCue, string> = {
  single: "/audio/lantern/single.m4a", // 「Frost Waltz」钢片琴 + 钟琴 —— 一盏灯升入星空
  flock: "/audio/lantern/flock.m4a", //   「Skye Cuillin」竖琴 / 弦乐 / 合唱 —— 漫天灯海齐升
};

// 每段实际播放时长（秒）+ 淡入 / 淡出（秒）+ 音量。
const CUE_PLAN: Record<LanternCue, { play: number; fadeIn: number; fadeOut: number; gain: number }> = {
  single: { play: 16, fadeIn: 0.8, fadeOut: 3.5, gain: 0.5 },
  flock: { play: 30, fadeIn: 1.2, fadeOut: 5.0, gain: 0.55 },
};

type Status = "idle" | "loading" | "ready" | "failed";
const cache = new Map<LanternCue, { status: Status; buffer: AudioBuffer | null }>();
const statusOf = (c: LanternCue): Status => cache.get(c)?.status ?? "idle";

let cueGain: GainNode | null = null;
let muted = false;
let active: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

function getCueGain(ctx: AudioContext): GainNode {
  if (!cueGain) {
    cueGain = ctx.createGain();
    cueGain.gain.value = muted ? 0 : 1;
    cueGain.connect(ctx.destination);
  }
  return cueGain;
}

// 后台加载并解码缓存某段曲目。失败标记 failed，不再重试（断网韧性）。
async function load(cue: LanternCue): Promise<void> {
  if (statusOf(cue) !== "idle") return;
  cache.set(cue, { status: "loading", buffer: null });
  const ctx = getAudioContext();
  if (!ctx) {
    cache.set(cue, { status: "failed", buffer: null });
    return;
  }
  try {
    const res = await fetch(CUE_FILES[cue]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    cache.set(cue, { status: "ready", buffer });
  } catch {
    cache.set(cue, { status: "failed", buffer: null });
  }
}

/** 预热两段曲目的解码缓存（玩家可能放灯前于 idle 时后台调用），使首次放飞即可奏真实音乐。 */
export function prewarmLanternCues(): void {
  (Object.keys(CUE_FILES) as LanternCue[]).forEach((c) => {
    if (statusOf(c) === "idle") void load(c);
  });
}

// 停掉当前在播曲目（淡出 fade 秒），避免连续放飞时叠播。
function stopActive(fade = 0.4): void {
  if (!active) return;
  const ctx = getAudioContext();
  const a = active;
  active = null;
  if (!ctx) {
    try { a.src.stop(); } catch { /* 已停止 */ }
    return;
  }
  const t = ctx.currentTime;
  try {
    a.gain.gain.cancelScheduledValues(t);
    a.gain.gain.setValueAtTime(a.gain.gain.value, t);
    a.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    a.src.stop(t + fade + 0.05);
  } catch { /* 已断开 */ }
}

/**
 * 放飞瞬间奏起对应曲目。命中已解码缓存则播放并返回 true；未就绪 / 静音返回 false
 *（调用方回退合成 playLanternMelody）。同时派发 `xinyu:bgm-duck` 让背景音乐暂时让位。
 */
export function playLanternCue(cue: LanternCue): boolean {
  if (muted || isSfxMuted()) {
    prewarmLanternCues(); // 静音中也后台预热，解禁后即可用
    return false;
  }
  const entry = cache.get(cue);
  if (!entry || entry.status !== "ready" || !entry.buffer) {
    if (statusOf(cue) === "idle") void load(cue); // 后台预热，下次可用
    return false;
  }
  const ctx = getAudioContext();
  if (!ctx) return false;
  stopActive(0.25);

  const plan = CUE_PLAN[cue];
  const src = ctx.createBufferSource();
  src.buffer = entry.buffer;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  const dur = Math.min(plan.play, entry.buffer.duration); // 不超过曲目本身长度
  // 淡入 → 平台 → 末段淡出，整体成一段自洽的短乐句。
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(plan.gain, t + plan.fadeIn);
  const fadeStart = Math.max(t + plan.fadeIn, t + dur - plan.fadeOut);
  g.gain.setValueAtTime(plan.gain, fadeStart);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(g).connect(getCueGain(ctx));
  src.start(t);
  src.stop(t + dur + 0.05);

  const self = { src, gain: g };
  active = self;
  src.onended = () => {
    if (active === self) active = null;
    try { src.disconnect(); g.disconnect(); } catch { /* 已断开 */ }
  };

  // BGM 让位：放飞期间把背景音乐淡低，结束前恢复（由 MusicControl 监听）。
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("xinyu:bgm-duck", { detail: { ms: Math.round(dur * 1000) } }));
  }
  return true;
}

/** MusicControl 一键静音联动：静音即停当前曲目并掐断 cueGain。 */
export function setLanternMusicMuted(next: boolean): void {
  muted = next;
  if (cueGain) cueGain.gain.value = muted ? 0 : 1;
  if (muted) stopActive(0.2);
}
