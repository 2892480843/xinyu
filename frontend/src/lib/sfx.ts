// Web Audio API 即时合成的微音效——零资产、零网络请求、原创无版权。
// 不替代音乐，只在关键交互节点提供「点缀级」反馈。
// 全局 volume 受 MusicControl 静音开关影响（setSfxMuted，与背景音乐一键联动）。
//
// 信号链：每个音源同时走「干声」与「湿声(混响)」两路，最终都汇入 masterGain，
// 因此一个静音开关即可同时停掉干湿两路；湿声给整体一层柔和的海岛回响空气感。
//
// 真实采样层（2026-06 集成）：`play()` 对 chime/ripple/collect/bloom/page/inscribe/
// settle/whoosh 这 8 个音效「采样优先 + 合成降级」——命中 samples.ts 缓存则播真实录音，
// 未命中（首访 / 断网 / 解码失败）立即回退本文件合成版。其余音效（wave/shell/breath/
// 这样既提升沉浸感，又保留断网可跑的离线韧性（离线优先的硬要求）。

// 采样池（循环依赖是安全的：两模块顶层都不执行对方代码，仅在运行时互调函数）。
import { playSample, type SampleName } from "./samples";

// 有真实采样可替代的 8 个音效名；命中缓存时优先播采样，否则 fall through 到合成。
const SAMPLED_NAMES: ReadonlySet<SampleName> = new Set<SampleName>([
  "chime", "ripple", "collect", "bloom", "page", "inscribe", "settle", "whoosh",
]);

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

// 暴露全局 AudioContext 与 masterGain，供 samples.ts / ambience.ts 复用同一音路
// （共享静音联动：所有采样 / 氛围底噪都汇入这个 masterGain）。
export function getAudioContext(): AudioContext | null {
  return ensure();
}
export function getMasterGain(): GainNode | null {
  // ensure() 会把 ctx / masterGain 一并建好。
  void ensure();
  return masterGain;
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

// 风铃单音(任意音高):基频 + 八度泛音,清亮带海岛混响。用于「风铃心曲」逐音敲响。
export function chimeNote(freq: number) {
  tone({ freq, duration: 1.3, attack: 0.004, type: "sine", gain: 0.42, reverb: 0.4 });
  tone({ freq: freq * 2, duration: 0.9, attack: 0.004, type: "sine", gain: 0.15, startAt: 0.02, reverb: 0.4 });
}

// 引擎低鸣(持续音源):上车 startEngine、下车 stopEngine、行驶中每帧 setEngineSpeed(|车速|/上限)。
let engine: { osc: OscillatorNode; sub: OscillatorNode; filt: BiquadFilterNode; gain: GainNode } | null = null;
export function startEngine() {
  const c = ensure();
  if (!c || !masterGain || engine) return;
  const osc = c.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = 56;
  const sub = c.createOscillator(); sub.type = "triangle"; sub.frequency.value = 28;
  const filt = c.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 300; filt.Q.value = 0.7;
  const gain = c.createGain(); gain.gain.value = 0;
  osc.connect(filt); sub.connect(filt); filt.connect(gain); gain.connect(masterGain);
  osc.start(); sub.start();
  engine = { osc, sub, filt, gain };
}
export function setEngineSpeed(spd: number) {
  if (!engine || !ctx) return;
  const t = ctx.currentTime; const s = Math.max(0, Math.min(1, spd));
  const base = 52 + s * 95; // 怠速 → 拉高
  engine.osc.frequency.setTargetAtTime(base, t, 0.08);
  engine.sub.frequency.setTargetAtTime(base * 0.5, t, 0.08);
  engine.filt.frequency.setTargetAtTime(300 + s * 980, t, 0.1);
  engine.gain.gain.setTargetAtTime(muted ? 0 : 0.07 + s * 0.12, t, 0.1); // 低鸣,随速度明显拉响(怠速沉、给油亮)
}
export function stopEngine() {
  if (!engine || !ctx) return;
  const e = engine; engine = null;
  e.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
  setTimeout(() => { try { e.osc.stop(); e.sub.stop(); e.osc.disconnect(); e.sub.disconnect(); e.filt.disconnect(); e.gain.disconnect(); } catch { /* ignore */ } }, 350);
}

// 加油门「轰~」:踩下油门 / 按增压那一下的加速爆发声——锯齿引擎音上扬(转速攀升) + 低八度铺底
// + 涡轮气浪向上扫频。持续低鸣由上面的 engine 负责,这一记是「踩下去」的推背听感。
// power: 1 普通给油 / ~1.7 增压(更长更亮)。muted 时静默;汇入 masterGain → 随音乐一键静音联动。
export function playAccelRev(power = 1) {
  const c = ensure();
  if (!c || !masterGain || muted) return;
  const t0 = c.currentTime;
  const p = Math.max(0.6, Math.min(2, power));
  const dur = 0.46 * p;
  // 引擎吼:锯齿基频低→高,经一个随之打开的带 Q 低通 → 像转速一路攀升
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(70, t0);
  osc.frequency.exponentialRampToValueAtTime(150 + 70 * p, t0 + dur);
  const filt = c.createBiquadFilter();
  filt.type = "lowpass";
  filt.Q.value = 6;
  filt.frequency.setValueAtTime(360, t0);
  filt.frequency.exponentialRampToValueAtTime(1300 + 700 * p, t0 + dur * 0.82);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.16 * p, t0 + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(filt).connect(g).connect(masterGain);
  // 低八度铺底,加厚那一「轰」
  const sub = c.createOscillator();
  sub.type = "triangle";
  sub.frequency.setValueAtTime(35, t0);
  sub.frequency.exponentialRampToValueAtTime(74 + 34 * p, t0 + dur);
  const gs = c.createGain();
  gs.gain.setValueAtTime(0.0001, t0);
  gs.gain.exponentialRampToValueAtTime(0.1 * p, t0 + 0.05);
  gs.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  sub.connect(gs).connect(masterGain);
  osc.start(t0); sub.start(t0);
  const stop = t0 + dur + 0.05;
  osc.stop(stop); sub.stop(stop);
  // 涡轮气浪:滤波噪声向上扫,给加速一层空气掠过的「咻」(noiseBurst 为下方函数声明,已 hoist)
  noiseBurst({ duration: dur * 0.9, filterFreq: 500, filterTo: 2400 + 900 * p, gain: 0.06 * p, q: 0.9 });
}

// 起跳音：卡通「Q 弹 boing」——弹性上扬的腾起音，贴合治愈小岛的可爱基调。频率走一条「欠阻尼
// 弹簧」曲线（从低快速上窜 → 过冲 → 阻尼震荡收敛回稳态），三角波暖体 + 一缕高八度亮泛音，约
// 0.34s 的「啵嘤~」。现默认走此合成（不再优先真实 foley 采样 jump.m4a；采样文件保留备用，见
// public/audio/proc_jump.py）。muted 时静默；汇入 masterGain → 随音乐一键静音联动。
export function playJump() {
  const c = ensure();
  if (!c || !masterGain || muted) return;
  const t0 = c.currentTime;
  const dur = 0.34;
  // 欠阻尼二阶阶跃响应 y(t)：从 0 快速上窜、过冲(>1)、再阻尼震荡收敛到 1——这就是「啵嘤」的弹性。
  const fBase = 175, fSpan = 300;        // 基频 175Hz → 稳态约 475Hz，过冲峰约 655Hz
  const zeta = 0.16;                     // 阻尼比（越小越「Q」、回弹震荡越多）
  const wn = 2 * Math.PI * 9;            // 自然角频率（上窜速度）
  const wd = wn * Math.sqrt(1 - zeta * zeta);
  const N = 96;
  const fund = new Float32Array(N);
  const oct = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * dur;
    const y = 1 - Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + (zeta * wn / wd) * Math.sin(wd * t));
    const f = fBase + fSpan * y;
    fund[i] = f;
    oct[i] = f * 2;
  }
  // 主体：三角波（暖而有弹性），频率沿弹簧曲线上窜回弹
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueCurveAtTime(fund, t0, dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.26, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(masterGain);
  // 高八度亮泛音：更轻更短，给 boing 一点清亮弹性的「叮」
  const osc2 = c.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueCurveAtTime(oct, t0, dur);
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.0001, t0);
  g2.gain.exponentialRampToValueAtTime(0.08, t0 + 0.01);
  g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.6);
  osc2.connect(g2).connect(masterGain);
  // 少量湿声融入海岛空气感（过多会糊掉弹性，故克制）
  if (reverbSend) {
    const send = c.createGain();
    send.gain.value = 0.12;
    g.connect(send).connect(reverbSend);
  }
  const stop = t0 + dur + 0.05;
  osc.start(t0); osc.stop(stop);
  osc2.start(t0); osc2.stop(stop);
}

// 落地音合成降级（采样 land.m4a 未命中时用）：低频闷响——噪声 burst 垫底 + 110Hz 短尾。
export function playLand(gain = 0.3) {
  if (muted) return;
  noiseBurst({ duration: 0.12, filterFreq: 360, gain: gain * 0.6 });
  tone({ freq: 110, duration: 0.22, attack: 0.004, type: "triangle", gain: gain * 0.5, reverb: 0.15 });
}

// 笛声单音（「吹笛子」动作用）：三角波为体（空心暖音，近竹笛/陶笛音色）+ 八度泛音添亮，
// 叠 ~5Hz 轻颤音(vibrato) + 起音一缕气声，柔起柔落带海岛混响。一个动作里按五声音阶连成短句。
export function playFluteNote(freq: number, dur = 0.55, gain = 0.24) {
  const c = ensure();
  if (!c || !masterGain || muted) return;
  const t0 = c.currentTime;
  // 主体：三角波 + 颤音 LFO（轻微音高起伏，吹奏的“气”感）
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  const vib = c.createOscillator();
  vib.type = "sine";
  vib.frequency.value = 5.2;
  const vibAmt = c.createGain();
  vibAmt.gain.value = freq * 0.006; // ±0.6% 颤音深度
  vib.connect(vibAmt).connect(osc.frequency);
  // 八度泛音：更轻更短，添一点笛子的亮泛音
  const oc2 = c.createOscillator();
  oc2.type = "sine";
  oc2.frequency.value = freq * 2;
  // 主增益包络：柔起 ~45ms → 持续 → 柔落（legato，音与音之间略叠）
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.045);
  g.gain.setValueAtTime(gain, t0 + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.0001, t0);
  g2.gain.exponentialRampToValueAtTime(gain * 0.28, t0 + 0.06);
  g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.8);
  osc.connect(g).connect(masterGain);
  oc2.connect(g2).connect(masterGain);
  // 湿声（海岛回响空气感）
  if (reverbSend) {
    const send = c.createGain();
    send.gain.value = 0.32;
    g.connect(send).connect(reverbSend);
  }
  // 起音气声：极短带通柔噪，模拟吹气的“呼”
  noiseBurst({ duration: 0.13, filterFreq: Math.min(freq * 2.4, 4000), gain: 0.045, q: 0.7, reverb: 0.18 });
  osc.start(t0); oc2.start(t0); vib.start(t0);
  const stop = t0 + dur + 0.05;
  osc.stop(stop); oc2.stop(stop); vib.stop(stop);
}

// 🎵 精灵哼唱：把一条治愈小调乐句逐音连奏成「唱给你听」的一小段。
// 三角波暖体（近人声哼鸣「啦~」）+ 八度泛音添亮，柔起柔落带海岛混响。
// seed 决定选哪条乐句（同一精灵每次唱略有不同）；返回这段的大致时长（秒），
// 供 3D 精灵据此维持「唱歌态」摇摆与头顶飘音符。muted / 不支持时静默返回 0。
const COMPANION_SONG_PHRASES: number[][] = [
  [523.25, 587.33, 659.25, 587.33, 783.99, 659.25, 523.25],   // do re mi re sol mi do
  [659.25, 587.33, 523.25, 587.33, 659.25, 659.25, 587.33],   // mi re do re mi mi re
  [783.99, 659.25, 880.0, 783.99, 659.25, 587.33],            // sol mi la sol mi re
  [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 523.25],   // do mi sol do' sol mi do
];
export function playCompanionSong(seed = 0): number {
  if (muted) return 0;
  const c = ensure();
  if (!c || !masterGain) return 0;
  const phrase = COMPANION_SONG_PHRASES[Math.abs(Math.floor(seed)) % COMPANION_SONG_PHRASES.length];
  const step = 0.4; // 每个音的时值
  phrase.forEach((freq, i) => {
    const at = i * step;
    // 主体「啦~」：三角波暖音，柔起柔落，legato 略叠
    tone({ freq, duration: step * 1.08, attack: 0.05, type: "triangle", gain: 0.17, startAt: at, reverb: 0.42 });
    // 八度泛音：更轻更短，像歌声的亮泛音
    tone({ freq: freq * 2, duration: step * 0.66, attack: 0.04, type: "sine", gain: 0.05, startAt: at + 0.02, reverb: 0.45 });
  });
  // 收尾一缕上扬微光，给「唱完了」一个温柔的尾音
  tone({ freq: phrase[phrase.length - 1] * 2, duration: 0.5, attack: 0.06, type: "sine", gain: 0.06, startAt: phrase.length * step, reverb: 0.5 });
  return phrase.length * step + 0.55;
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
  // 采样优先：有真实采样的音效，命中缓存则播采样；未命中（首访/断网）回退下方合成。
  if (SAMPLED_NAMES.has(name as SampleName) && playSample(name as SampleName)) {
    return;
  }
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

// 🏮 放天灯：一缕暖空气托起轻纸的升空气声 + 低频暖 swell —— 远而安静，贴合治愈基调。
export function playLanternRelease() {
  noiseBurst({ duration: 1.4, filterFreq: 480, filterTo: 1500, gain: 0.05, q: 0.7, reverb: 0.45 });
  tone({ freq: 196, duration: 1.6, attack: 0.5, type: "sine", gain: 0.07, reverb: 0.4 });
  tone({ freq: 587.33, duration: 1.2, attack: 0.25, type: "sine", gain: 0.04, startAt: 0.2, reverb: 0.5 });
}

// 🎵 放天灯小夜曲：music box（八音盒）音色的治愈短旋律 —— 放飞瞬间轻轻响起，温柔上行，
// 像把心事托上夜空。零资产、断网可跑（与精灵哼唱同一即时合成思路）。
// 八音盒音色：极快起音的纯音 + 八度 / 十二度泛音添金属亮泽 + 高混响余韵，清亮一「叮」。
function musicBoxNote(freq: number, at: number, gain: number, dur: number) {
  tone({ freq, duration: dur, attack: 0.002, type: "sine", gain, startAt: at, reverb: 0.5 });
  tone({ freq: freq * 2, duration: dur * 0.6, attack: 0.002, type: "sine", gain: gain * 0.5, startAt: at + 0.004, reverb: 0.5 });
  tone({ freq: freq * 3, duration: dur * 0.32, attack: 0.002, type: "sine", gain: gain * 0.16, startAt: at + 0.008, reverb: 0.45 });
}
// grand（放飞一片）：奏更长更丰满的一段——盘旋上行的主旋律 + 暖低音铺底 + 收尾高八度泛光。
export function playLanternMelody(grand = false) {
  if (muted || !ensure()) return;
  // 五声音阶（C 宫：C D E G A）治愈旋律，整体上行 —— 呼应「放飞 / 升起」。
  const E5 = 659.25, G5 = 783.99, A5 = 880.0, C6 = 1046.5, D6 = 1174.66, E6 = 1318.51, G6 = 1567.98;
  const step = grand ? 0.32 : 0.3;
  const lead = grand
    ? [G5, A5, C6, D6, E6, D6, C6, A5, C6, D6, E6, G6]   // 盘旋上行到高处再轻落，像万灯齐升
    : [E5, G5, A5, C6, A5, C6];                          // 一缕轻盈上扬
  lead.forEach((f, i) => musicBoxNote(f, i * step, grand ? 0.12 : 0.15, grand ? 1.5 : 1.3));
  if (grand) {
    // 低音铺底：暖三角波长音，给乐段一层温柔厚度（C3 G3 A3 C4，每 ~2.6 拍一记）。
    [130.81, 196.0, 220.0, 261.63].forEach((f, i) =>
      tone({ freq: f, duration: 2.0, attack: 0.03, type: "triangle", gain: 0.05, startAt: i * step * 2.6, reverb: 0.4 }));
    // 收尾：高八度泛光，给「升空完成」一个温柔句点。
    musicBoxNote(E6, lead.length * step + 0.12, 0.1, 2.0);
  }
}

// 🎆 烟花升空：细细的上行哨音（远、轻），给「它正飞上去」的预备感。
export function playFireworkLaunch() {
  sweep({ from: 300, to: 1500, duration: 1.0, type: "sine", gain: 0.05, reverb: 0.35 });
  noiseBurst({ duration: 1.0, filterFreq: 300, filterTo: 1800, gain: 0.03, q: 0.6, reverb: 0.3 });
}

// 🎆 烟花绽放：低沉的「咚」+ 滤波气浪 + 一串错峰的细碎噼啪闪烁尾音。big 给更饱满的一击。
export function playFireworkBurst(big = false) {
  const g = big ? 1 : 0.78;
  tone({ freq: big ? 62 : 78, duration: 0.55, attack: 0.004, type: "sine", gain: 0.2 * g, reverb: 0.45 });
  noiseBurst({ duration: 0.5, filterFreq: 900, filterTo: 90, gain: 0.16 * g, q: 0.6, reverb: 0.4 });
  tone({ freq: 1760, duration: 0.35, attack: 0.004, type: "sine", gain: 0.05 * g, startAt: 0.02, reverb: 0.55 });
  for (let i = 0; i < 7; i++) {
    noiseBurst({ duration: 0.05, filterFreq: 3200 + Math.random() * 2500, gain: 0.03 * g, startAt: 0.12 + i * 0.07 + Math.random() * 0.04, reverb: 0.2 });
  }
}
