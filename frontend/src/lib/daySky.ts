// 昼夜天色:把一个归一化时刻 t∈[0,1) 映射成完整的「天空 + 灯光 + 雾 + 太阳方向」配色。
// 开车地图开场即日出(t=0),缓慢推进:日出→正午→黄昏夕阳→暮色→星夜→拂晓,循环。
// 全部解析计算、零分配(写入预分配的 SkyState),每帧调用也不卡。
import * as THREE from "three";

export const CYCLE_SEC = 165; // 一整轮昼夜的秒数(够慢够治愈,又能在一次兜风里看全日出日落)

export interface SkyState {
  top: THREE.Color; // 天顶
  mid: THREE.Color; // 中空
  horizon: THREE.Color; // 地平线
  sun: THREE.Color; // 太阳/月亮 圆盘色
  sunGlow: THREE.Color; // 光晕色
  fog: THREE.Color;
  ambient: THREE.Color;
  ambientI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  dir: THREE.Color;
  dirI: number;
  sunDir: THREE.Vector3; // 指向太阳的单位向量(y<0 即落到地平线下)
  sunVisible: number; // 太阳圆盘可见度 0..1(下沉时渐隐)
  nightness: number; // 0 白昼 .. 1 深夜(驱动星空/月亮/萤火)
  sunsetness: number; // 0..1 金色暖光(驱动云霞染色)
  dayness: number; // 0..1 白昼度(驱动鸟群)
  label: string; // 时段中文标签(HUD 用)
}

export function makeSkyState(): SkyState {
  return {
    top: new THREE.Color(),
    mid: new THREE.Color(),
    horizon: new THREE.Color(),
    sun: new THREE.Color(),
    sunGlow: new THREE.Color(),
    fog: new THREE.Color(),
    ambient: new THREE.Color(),
    ambientI: 1,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiI: 1,
    dir: new THREE.Color(),
    dirI: 1,
    sunDir: new THREE.Vector3(0, 1, 0),
    sunVisible: 1,
    nightness: 0,
    sunsetness: 0,
    dayness: 1,
    label: "",
  };
}

// —— 四个锚点配色:白昼 / 金色(日出日落) / 暮色 / 星夜。按太阳高度加权混合,过渡永远自洽。——
interface Palette {
  top: THREE.Color;
  mid: THREE.Color;
  horizon: THREE.Color;
  sun: THREE.Color;
  sunGlow: THREE.Color;
  fog: THREE.Color;
  ambient: THREE.Color;
  ambientI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  dir: THREE.Color;
  dirI: number;
}
const c = (h: string) => new THREE.Color(h);
const PAL: Record<"day" | "gold" | "dusk" | "night", Palette> = {
  day: {
    top: c("#3f9fe0"), mid: c("#8fc8ec"), horizon: c("#dcefF6"), sun: c("#fff6da"), sunGlow: c("#ffe6a8"),
    fog: c("#cfe6ef"), ambient: c("#ffffff"), ambientI: 0.9, hemiSky: c("#cfeaf5"), hemiGround: c("#7e8c5a"), hemiI: 0.75, dir: c("#fff4dc"), dirI: 1.3,
  },
  gold: {
    top: c("#5d86be"), mid: c("#f2a771"), horizon: c("#ffd089"), sun: c("#ffb14b"), sunGlow: c("#ff8a3d"),
    fog: c("#f4c498"), ambient: c("#ffd9b0"), ambientI: 0.78, hemiSky: c("#ffcf9a"), hemiGround: c("#6a5a4a"), hemiI: 0.7, dir: c("#ff9d4d"), dirI: 1.25,
  },
  dusk: {
    top: c("#2c376c"), mid: c("#6a5a9a"), horizon: c("#d4818f"), sun: c("#e09aa0"), sunGlow: c("#c66a8a"),
    fog: c("#5c5886"), ambient: c("#9a93c0"), ambientI: 0.55, hemiSky: c("#7a6ea8"), hemiGround: c("#3a3550"), hemiI: 0.55, dir: c("#bd8ab4"), dirI: 0.6,
  },
  night: {
    top: c("#0d1430"), mid: c("#172148"), horizon: c("#2a3766"), sun: c("#d2e1ff"), sunGlow: c("#9fc0ff"),
    fog: c("#131c3a"), ambient: c("#6a78b0"), ambientI: 0.34, hemiSky: c("#2a3766"), hemiGround: c("#0f152c"), hemiI: 0.45, dir: c("#8fa6e0"), dirI: 0.45,
  },
};

// 太阳轨迹关键帧:(t, 高度角°, 方位角°)。高度<0 即落到地平线下(夜)。线性插值 + 环绕。
const KEY: [number, number, number][] = [
  [0.0, 0, 95],
  [0.06, 8, 80],
  [0.13, 22, 64],
  [0.25, 80, 0],
  [0.37, 24, -60],
  [0.44, 9, -78],
  [0.5, 0, -95],
  [0.55, -9, -110],
  [0.63, -28, -140],
  [0.75, -78, 180],
  [0.88, -26, 140],
  [0.95, -8, 110],
  [1.0, 0, 95],
];

function sampleKey(t: number): { elev: number; azi: number } {
  for (let i = 0; i < KEY.length - 1; i++) {
    const a = KEY[i];
    const b = KEY[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const f = (t - a[0]) / (b[0] - a[0] || 1);
      return { elev: a[1] + (b[1] - a[1]) * f, azi: a[2] + (b[2] - a[2]) * f };
    }
  }
  return { elev: KEY[0][1], azi: KEY[0][2] };
}

function s01(x: number): number {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
}

function phaseLabel(t: number): string {
  if (t < 0.05 || t > 0.97) return "🌅 日出";
  if (t < 0.13) return "🌄 晨曦";
  if (t < 0.2) return "🌤 清晨";
  if (t < 0.31) return "☀️ 正午";
  if (t < 0.42) return "🌞 午后";
  if (t < 0.5) return "🌇 黄昏";
  if (t < 0.56) return "🌆 日落";
  if (t < 0.66) return "🌃 暮色";
  if (t < 0.9) return "🌙 星夜";
  return "✨ 拂晓";
}

// 把四个锚点按权重混合进 out 的某个颜色通道。
function blend(out: THREE.Color, wd: number, wg: number, wt: number, wn: number, key: keyof Palette) {
  const d = PAL.day[key] as THREE.Color;
  const g = PAL.gold[key] as THREE.Color;
  const t = PAL.dusk[key] as THREE.Color;
  const n = PAL.night[key] as THREE.Color;
  out.setRGB(d.r * wd + g.r * wg + t.r * wt + n.r * wn, d.g * wd + g.g * wg + t.g * wt + n.g * wn, d.b * wd + g.b * wg + t.b * wt + n.b * wn);
}
function blendScalar(wd: number, wg: number, wt: number, wn: number, key: "ambientI" | "hemiI" | "dirI") {
  return PAL.day[key] * wd + PAL.gold[key] * wg + PAL.dusk[key] * wt + PAL.night[key] * wn;
}

// 写入 out:给定 t∈[0,1) 计算全套天色。零分配。
export function sampleSky(t: number, out: SkyState): void {
  const { elev, azi } = sampleKey(t);
  const er = (elev * Math.PI) / 180;
  const ar = (azi * Math.PI) / 180;
  out.sunDir.set(Math.cos(er) * Math.sin(ar), Math.sin(er), Math.cos(er) * Math.cos(ar)).normalize();

  // 由太阳高度推导四个锚点权重 → 永远自洽的过渡。
  const nightW = s01((-elev - 6) / 12); // elev<=-18 全夜
  const dayW = s01((elev - 10) / 20); // elev>=30 全昼
  const goldW = Math.max(0, 1 - Math.abs(elev) / 15) * (1 - nightW); // 地平线附近暖金,入夜抑制
  const twiW = Math.max(0, 1 - Math.abs(elev + 10) / 12); // 中心 elev=-10 的紫色暮光带
  const sum = dayW + goldW + twiW + nightW || 1;
  const wd = dayW / sum;
  const wg = goldW / sum;
  const wt = twiW / sum;
  const wn = nightW / sum;

  blend(out.top, wd, wg, wt, wn, "top");
  blend(out.mid, wd, wg, wt, wn, "mid");
  blend(out.horizon, wd, wg, wt, wn, "horizon");
  blend(out.sun, wd, wg, wt, wn, "sun");
  blend(out.sunGlow, wd, wg, wt, wn, "sunGlow");
  blend(out.fog, wd, wg, wt, wn, "fog");
  blend(out.ambient, wd, wg, wt, wn, "ambient");
  blend(out.hemiSky, wd, wg, wt, wn, "hemiSky");
  blend(out.hemiGround, wd, wg, wt, wn, "hemiGround");
  blend(out.dir, wd, wg, wt, wn, "dir");
  out.ambientI = blendScalar(wd, wg, wt, wn, "ambientI");
  out.hemiI = blendScalar(wd, wg, wt, wn, "hemiI");
  out.dirI = blendScalar(wd, wg, wt, wn, "dirI");

  out.sunVisible = s01((elev + 3) / 6); // 高度>+3 全亮,<-3 隐没
  out.nightness = nightW;
  out.sunsetness = goldW;
  out.dayness = dayW;
  out.label = phaseLabel(t);
}
