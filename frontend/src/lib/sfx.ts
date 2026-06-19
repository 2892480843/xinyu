// Web Audio API 即时合成的微音效——零资产、零网络请求、原创无版权。
// 不替代音乐，只在关键交互节点提供「点缀级」反馈。
// 全局 volume 受 MusicControl 静音开关影响（setSfxMuted，与背景音乐一键联动）。
//
// 信号链：每个音源同时走「干声」与「湿声(混响)」两路，最终都汇入 masterGain，
// 因此一个静音开关即可同时停掉干湿两路；湿声给整体一层柔和的海岛回响空气感。

type SfxName =
  | "chime"
  | "wave"
  | "shell"
  | "breath_in"
  | "breath_out"
  | "page"
  | "inscribe"
  | "tap"
  | "ripple"
  | "bloom"
  | "collect"
  | "reveal"
  | "whoosh"
  | "settle";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let reverbSend: GainNode | null = null; // 混响母线入口（湿声汇集点）
let muted = false;

const MASTER_VOLUME = 0.18;

// 生成一段指数衰减的噪声脉冲，作为轻量混响的 impulse response（无需外部音频）。
function buildImpulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = c.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = c.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = MASTER_VOLUME;
      masterGain.connect(ctx.destination);

      // 混响母线：send -> convolver -> master（湿声也受 master 的静音/音量约束）
      reverbSend = ctx.createGain();
      reverbSend.gain.value = 1;
      const convolver = ctx.createConvolver();
      convolver.buffer = buildImpulse(ctx, 1.6, 3.2);
      const wetLevel = ctx.createGain();
      wetLevel.gain.value = 0.9;
      reverbSend.connect(convolver).connect(wetLevel).connect(masterGain);
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
  if (masterGain) masterGain.gain.value = muted ? 0 : MASTER_VOLUME;
}

export function isSfxMuted() {
  return muted;
}

// 包络合成单个 tone。reverb: 0~1 送往混响母线的比例（湿声）。
function tone(opts: {
  freq: number;
  duration: number;
  type?: OscillatorType;
  attack?: number;
  release?: number;
  detune?: number;
  startAt?: number;
  gain?: number;
  reverb?: number;
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
  osc.connect(g);
  g.connect(masterGain); // 干声
  if (opts.reverb && reverbSend) {
    const send = c.createGain();
    send.gain.value = opts.reverb;
    g.connect(send).connect(reverbSend); // 湿声
  }
  osc.start(start);
  osc.stop(start + opts.duration + 0.05);
}

// 频率滑音 tone（whoosh / 上行点亮等用）。
function sweep(opts: {
  from: number;
  to: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  startAt?: number;
  reverb?: number;
}) {
  const c = ensure();
  if (!c || !masterGain || muted) return;
  const start = (c.currentTime || 0) + (opts.startAt ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), start + opts.duration);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(opts.gain ?? 0.3, start + opts.duration * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);
  osc.connect(g);
  g.connect(masterGain);
  if (opts.reverb && reverbSend) {
    const send = c.createGain();
    send.gain.value = opts.reverb;
    g.connect(send).connect(reverbSend);
  }
  osc.start(start);
  osc.stop(start + opts.duration + 0.05);
}

// 噪声 burst（用来做 wave / shell / whoosh 的海水与空气感）。
function noiseBurst(opts: {
  duration: number;
  gain?: number;
  filterFreq?: number;
  filterTo?: number; // 给定则做滤波扫频（whoosh）
  q?: number;
  startAt?: number;
  reverb?: number;
}) {
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
  if (opts.q) filter.Q.value = opts.q;
  const f0 = opts.filterFreq ?? 600;
  filter.frequency.setValueAtTime(f0, start);
  if (opts.filterTo) filter.frequency.exponentialRampToValueAtTime(Math.max(1, opts.filterTo), start + opts.duration);
  const g = c.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g);
  g.connect(masterGain);
  if (opts.reverb && reverbSend) {
    const send = c.createGain();
    send.gain.value = opts.reverb;
    g.connect(send).connect(reverbSend);
  }
  src.start(start);
}

export function play(name: SfxName) {
  switch (name) {
    case "chime":
      // 5 度叠加铃音：C5 + G5 + C6，带回响余韵
      tone({ freq: 523.25, duration: 1.4, attack: 0.005, gain: 0.5, type: "sine", reverb: 0.35 });
      tone({ freq: 783.99, duration: 1.7, attack: 0.005, gain: 0.32, type: "sine", startAt: 0.04, reverb: 0.35 });
      tone({ freq: 1046.5, duration: 1.1, attack: 0.005, gain: 0.18, type: "sine", startAt: 0.08, reverb: 0.3 });
      break;
    case "wave":
      // 海浪：低频噪声涌起 + 漂浮 sine，湿声拉出海岸空间
      noiseBurst({ duration: 1.3, filterFreq: 380, gain: 0.22, reverb: 0.4 });
      tone({ freq: 160, duration: 1.4, attack: 0.2, type: "sine", gain: 0.18, reverb: 0.25 });
      break;
    case "shell":
      // 贝壳：短脆 + 低尾
      tone({ freq: 880, duration: 0.4, attack: 0.002, type: "triangle", gain: 0.35, reverb: 0.3 });
      tone({ freq: 440, duration: 0.6, attack: 0.02, type: "sine", gain: 0.18, startAt: 0.04, reverb: 0.25 });
      break;
    case "breath_in":
      noiseBurst({ duration: 0.85, filterFreq: 1200, gain: 0.15, reverb: 0.2 });
      break;
    case "breath_out":
      noiseBurst({ duration: 1.25, filterFreq: 500, gain: 0.18, reverb: 0.25 });
      break;
    case "page":
      // 翻页 chip click（干脆，不加混响）
      noiseBurst({ duration: 0.12, filterFreq: 2400, gain: 0.18 });
      break;
    case "inscribe":
      // 刻字 ink
      tone({ freq: 320, duration: 0.5, attack: 0.01, type: "triangle", gain: 0.25, reverb: 0.2 });
      tone({ freq: 240, duration: 0.6, attack: 0.05, type: "sine", gain: 0.15, startAt: 0.05, reverb: 0.2 });
      break;
    case "tap":
      tone({ freq: 660, duration: 0.18, attack: 0.002, type: "sine", gain: 0.22, reverb: 0.12 });
      break;
    case "ripple":
      // 涟漪：两环扩散
      tone({ freq: 220, duration: 0.9, attack: 0.05, type: "sine", gain: 0.2, reverb: 0.35 });
      tone({ freq: 440, duration: 0.7, attack: 0.05, type: "sine", gain: 0.12, startAt: 0.15, reverb: 0.35 });
      break;
    case "bloom":
      // 萌发/生长：低频暖 swell 缓缓托起 + 高频微光点亮，呼应「新元素破土」的峰值
      tone({ freq: 196, duration: 1.7, attack: 0.45, type: "sine", gain: 0.22, reverb: 0.4 });
      tone({ freq: 293.66, duration: 1.5, attack: 0.55, type: "sine", gain: 0.13, startAt: 0.1, reverb: 0.4 });
      tone({ freq: 1318.51, duration: 0.9, attack: 0.02, type: "sine", gain: 0.13, startAt: 0.28, reverb: 0.45 });
      tone({ freq: 1760, duration: 0.7, attack: 0.02, type: "sine", gain: 0.09, startAt: 0.42, reverb: 0.45 });
      break;
    case "collect":
      // 拾取（心灵印记 / 心愿之光）：上行大三和弦琶音 + 高频闪光，轻盈奖励感
      tone({ freq: 587.33, duration: 0.5, attack: 0.004, type: "sine", gain: 0.26, reverb: 0.4 }); // D5
      tone({ freq: 739.99, duration: 0.55, attack: 0.004, type: "sine", gain: 0.22, startAt: 0.06, reverb: 0.4 }); // F#5
      tone({ freq: 987.77, duration: 0.7, attack: 0.004, type: "sine", gain: 0.2, startAt: 0.12, reverb: 0.45 }); // B5
      tone({ freq: 1975.53, duration: 0.5, attack: 0.002, type: "sine", gain: 0.08, startAt: 0.18, reverb: 0.5 }); // 微光
      break;
    case "reveal":
      // 浮现/展开（面板、修正信、欢迎回归）：柔和上行 swell 拉开帷幕
      sweep({ from: 330, to: 660, duration: 0.7, type: "sine", gain: 0.16, reverb: 0.35 });
      tone({ freq: 880, duration: 0.8, attack: 0.18, type: "sine", gain: 0.1, startAt: 0.12, reverb: 0.4 });
      break;
    case "whoosh":
      // 转场/运镜：滤波噪声扫频，空气掠过感
      noiseBurst({ duration: 0.9, filterFreq: 280, filterTo: 2600, gain: 0.16, q: 0.8, reverb: 0.3 });
      break;
    case "settle":
      // 物件落定：低频轻落 + 短尾，温柔着陆（比 bloom 克制）
      tone({ freq: 174.61, duration: 0.7, attack: 0.008, type: "sine", gain: 0.26, reverb: 0.3 });
      tone({ freq: 261.63, duration: 0.5, attack: 0.03, type: "sine", gain: 0.12, startAt: 0.05, reverb: 0.3 });
      break;
  }
}
