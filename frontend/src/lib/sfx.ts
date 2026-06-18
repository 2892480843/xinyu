// Web Audio API 即时合成的微音效——零资产、零网络请求。
// 不替代音乐，只在关键交互节点提供「点缀级」反馈：chime / wave / shell / breath / page / inscribe。
// 全局 volume 受 MusicControl 静音开关影响（通过 sfxVolume 全局状态）。

type SfxName = "chime" | "wave" | "shell" | "breath_in" | "breath_out" | "page" | "inscribe" | "tap" | "ripple" | "bloom";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.18;
      masterGain.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  // iOS / 浏览器自动暂停时需要用户手势唤醒
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function setSfxMuted(next: boolean) {
  muted = next;
  if (masterGain) masterGain.gain.value = muted ? 0 : 0.18;
}

export function isSfxMuted() {
  return muted;
}

// 包络合成单个 tone
function tone(opts: {
  freq: number;
  duration: number;
  type?: OscillatorType;
  attack?: number;
  release?: number;
  detune?: number;
  startAt?: number;
  gain?: number;
}) {
  const c = ensure();
  if (!c || !masterGain || muted) return;
  const start = (c.currentTime || 0) + (opts.startAt ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.value = opts.freq;
  if (opts.detune) osc.detune.value = opts.detune;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(opts.gain ?? 0.7, start + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);
  osc.connect(g).connect(masterGain);
  osc.start(start);
  osc.stop(start + opts.duration + 0.05);
}

// 噪声 burst（用来做 wave / shell 的海水感）
function noiseBurst(opts: { duration: number; gain?: number; filterFreq?: number; startAt?: number }) {
  const c = ensure();
  if (!c || !masterGain || muted) return;
  const start = (c.currentTime || 0) + (opts.startAt ?? 0);
  const bufferSize = Math.max(1, Math.floor(c.sampleRate * opts.duration));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = opts.filterFreq ?? 600;
  const g = c.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(masterGain);
  src.start(start);
}

export function play(name: SfxName) {
  switch (name) {
    case "chime":
      // 5 度叠加铃音：C5 + G5 钟一下
      tone({ freq: 523.25, duration: 1.3, attack: 0.005, gain: 0.5, type: "sine" });
      tone({ freq: 783.99, duration: 1.6, attack: 0.005, gain: 0.32, type: "sine", startAt: 0.04 });
      tone({ freq: 1046.5, duration: 1.0, attack: 0.005, gain: 0.18, type: "sine", startAt: 0.08 });
      break;
    case "wave":
      // 海浪：低频噪声 + 漂浮 sine
      noiseBurst({ duration: 1.2, filterFreq: 380, gain: 0.22 });
      tone({ freq: 160, duration: 1.4, attack: 0.2, type: "sine", gain: 0.18 });
      break;
    case "shell":
      // 贝壳：短脆 + 低尾
      tone({ freq: 880, duration: 0.4, attack: 0.002, type: "triangle", gain: 0.35 });
      tone({ freq: 440, duration: 0.6, attack: 0.02, type: "sine", gain: 0.18, startAt: 0.04 });
      break;
    case "breath_in":
      noiseBurst({ duration: 0.8, filterFreq: 1200, gain: 0.15 });
      break;
    case "breath_out":
      noiseBurst({ duration: 1.2, filterFreq: 500, gain: 0.18 });
      break;
    case "page":
      // 翻页 chip click
      noiseBurst({ duration: 0.12, filterFreq: 2400, gain: 0.18 });
      break;
    case "inscribe":
      // 刻字 ink
      tone({ freq: 320, duration: 0.5, attack: 0.01, type: "triangle", gain: 0.25 });
      tone({ freq: 240, duration: 0.6, attack: 0.05, type: "sine", gain: 0.15, startAt: 0.05 });
      break;
    case "tap":
      tone({ freq: 660, duration: 0.18, attack: 0.002, type: "sine", gain: 0.22 });
      break;
    case "ripple":
      tone({ freq: 220, duration: 0.9, attack: 0.05, type: "sine", gain: 0.2 });
      tone({ freq: 440, duration: 0.7, attack: 0.05, type: "sine", gain: 0.12, startAt: 0.15 });
      break;
    case "bloom":
      // 萌发/生长：低频暖 swell 缓缓托起 + 高频微光点亮，呼应「新元素破土」的峰值
      tone({ freq: 196, duration: 1.7, attack: 0.45, type: "sine", gain: 0.22 });
      tone({ freq: 293.66, duration: 1.5, attack: 0.55, type: "sine", gain: 0.13, startAt: 0.1 });
      tone({ freq: 1318.51, duration: 0.9, attack: 0.02, type: "sine", gain: 0.13, startAt: 0.28 });
      tone({ freq: 1760, duration: 0.7, attack: 0.02, type: "sine", gain: 0.09, startAt: 0.42 });
      break;
  }
}
