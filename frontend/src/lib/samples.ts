// 真实音频采样缓存池——「采样优先 + 合成降级」的加载与播放基础设施。
//
// 设计原则：
// - 所有采样最终汇入 sfx.ts 的同一个 masterGain，MusicControl 的一键静音天然覆盖。
// - 加载是异步的（fetch + decodeAudioData），但调用方多为同步触发；故采用
//   「后台预热 + AudioBuffer 缓存」：getSample 同步返回已就绪 buffer（无则返回 null
//   并触发后台加载），调用方拿不到就回退合成。
// - 净效果：首次=合成（零延迟）→ 之后=真实采样 → 断网/解码失败=永远合成（不再重试）。
//
// 资源署名见 public/audio/CREDITS.md；CC0/CC-BY/CC-BY-SA，公开演示可自由使用。

// 复用 sfx.ts 的唯一 AudioContext 与 masterGain（避免多 context 抢占）。
import { getAudioContext, getMasterGain } from "./sfx";

/** 采样分类（与 public/audio/{sfx,env}/ 目录一一对应）。 */
export type SampleBucket = "sfx" | "env";

/** 采样名——sfx 与 sfx.ts 的 SfxName 对齐；env 为环境音。 */
export type SampleName =
  // sfx 类（可替代 sfx.ts 合成版的 8 个）
  | "chime"
  | "ripple"
  | "collect"
  | "bloom"
  | "page"
  | "inscribe"
  | "settle"
  | "whoosh"
  // env 类（环境音，无合成对应，命中才响；jump/land 有合成降级，见 sfx.ts）
  | "footstep"
  | "water_splash"
  | "jump"
  | "land"
  // env 类·地标点状音（靠近地标边沿触发，走 envGain 独立常响）
  | "foghorn_zone"
  | "conch_zone";

/** 采样名 → (分类, 文件) 映射。 */
const SAMPLE_FILES: Record<SampleName, { bucket: SampleBucket; file: string }> = {
  chime: { bucket: "sfx", file: "chime.m4a" },
  ripple: { bucket: "sfx", file: "ripple.m4a" },
  collect: { bucket: "sfx", file: "collect.m4a" },
  bloom: { bucket: "sfx", file: "bloom.m4a" },
  page: { bucket: "sfx", file: "page.m4a" },
  inscribe: { bucket: "sfx", file: "inscribe.m4a" },
  settle: { bucket: "sfx", file: "settle.m4a" },
  whoosh: { bucket: "sfx", file: "whoosh.m4a" },
  footstep: { bucket: "env", file: "footstep.m4a" },
  water_splash: { bucket: "env", file: "water_splash.m4a" },
  jump: { bucket: "env", file: "jump.m4a" },
  land: { bucket: "env", file: "land.m4a" },
  foghorn_zone: { bucket: "env", file: "foghorn.m4a" },
  conch_zone: { bucket: "env", file: "conch.m4a" },
};

function sampleUrl(name: SampleName): string {
  const { bucket, file } = SAMPLE_FILES[name];
  return `/audio/${bucket}/${file}`;
}

// 加载状态机：防止重复 fetch；failed 后标记不再重试，避免断网时反复请求。
type Status = "idle" | "loading" | "ready" | "failed";
const cache = new Map<SampleName, { status: Status; buffer: AudioBuffer | null }>();

function statusOf(name: SampleName): Status {
  return cache.get(name)?.status ?? "idle";
}

/** 后台加载某采样并解码缓存。失败则标记 failed，不再重试。 */
async function loadSample(name: SampleName): Promise<void> {
  if (statusOf(name) !== "idle") return;
  cache.set(name, { status: "loading", buffer: null });
  const ctx = getAudioContext();
  if (!ctx) {
    cache.set(name, { status: "failed", buffer: null });
    return;
  }
  try {
    const res = await fetch(sampleUrl(name));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.arrayBuffer();
    // decodeAudioData 在旧 Safari 需回调形式，但现代浏览器均支持 Promise。
    const buffer = await ctx.decodeAudioData(arr);
    cache.set(name, { status: "ready", buffer });
  } catch {
    // 断网 / 404 / 解码失败——静默降级，不再重试。
    cache.set(name, { status: "failed", buffer: null });
  }
}

/**
 * 同步返回已就绪的采样 buffer；未就绪则返回 null 并触发后台加载（供下次使用）。
 * 调用方应在拿到 null 时立即回退合成，不要等待。
 */
export function getSample(name: SampleName): AudioBuffer | null {
  const entry = cache.get(name);
  if (entry?.status === "ready" && entry.buffer) return entry.buffer;
  if (statusOf(name) === "idle") void loadSample(name); // 后台预热，不阻塞
  return null;
}

/**
 * 播放一个采样。命中缓存则创建 AudioBufferSourceNode 播放，返回 true；
 * 未命中返回 false（调用方回退合成）。可选 playbackRate 微调音高、gain 缩放响度。
 *
 * 音路路由：
 * - sfx 类（chime/ripple/...）：经 masterGain，受 MusicControl 一键静音联动（与合成音效一致）。
 * - env 类（footstep/water_splash）：走独立 envGain → destination，**不受音乐静音影响**——
 *   探索环境音始终默认可响（用户需求），断网时静默。
 */
let envGain: GainNode | null = null;
let envVolume = 0.7; // env 类音量（持久）：静音状态下即便 envGain 尚未建立，首次发声也按此音量，不漏音
function getEnvGain(ctx: AudioContext): GainNode {
  if (!envGain) {
    envGain = ctx.createGain();
    envGain.gain.value = envVolume;
    envGain.connect(ctx.destination);
  }
  return envGain;
}

export function playSample(
  name: SampleName,
  opts?: { gain?: number; rate?: number; reverb?: number },
): boolean {
  const buffer = getSample(name);
  const ctx = getAudioContext();
  if (!buffer || !ctx) return false;
  const bucket = SAMPLE_FILES[name].bucket;
  // sfx 类需 masterGain（静音联动）；env 类走独立 envGain（默认常响）。
  const dest = bucket === "env" ? getEnvGain(ctx) : getMasterGain();
  if (!dest) return false;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  if (opts?.rate) src.playbackRate.value = opts.rate;
  const g = ctx.createGain();
  g.gain.value = opts?.gain ?? 0.8;
  src.connect(g).connect(dest);
  src.start();
  src.onended = () => {
    try {
      src.disconnect();
      g.disconnect();
    } catch {
      /* 已断开 */
    }
  };
  return true;
}

/** 设置探索环境音总音量（0~1）；env 类采样默认常响，可用此调节或静音。 */
export function setEnvVolume(v: number) {
  envVolume = Math.max(0, Math.min(1, v));
  if (envGain) envGain.gain.value = envVolume;
}
