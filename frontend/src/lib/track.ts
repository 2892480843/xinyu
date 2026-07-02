// 程序化巡游长公路:一条平滑的闭环样条赛道,带节奏的弯道与缓坡。零模型零射线——
// 路面几何、贴地高度、是否在路面,全部由样条解析算出,所以永远流畅、永远开不完。
import * as THREE from "three";

export interface TrackSample {
  cx: number;
  cy: number;
  cz: number;
  tx: number; // 水平切线(前进方向,归一化)
  tz: number;
  nx: number; // 水平右法线(归一化)
  nz: number;
  heading: number; // atan2(tx,tz)
  s: number; // 累积弧长
  grade: number; // 纵向坡度(dy/ds),用于车身俯仰
}

export interface Decoration {
  x: number;
  z: number;
  y: number;
  side: number; // -1 左 / +1 右
  kind: number; // 0 松 1 圆叶树 2 樱花 3 灌木 4 苔石 5 花丛 6 草丛 7 灯
  rot: number;
  scale: number;
  tint: number; // 0..1 逐实例微调色种子(打破"千篇一律")
}

export type EggKind = "rainbow" | "windmill" | "deer" | "bunny" | "spirit" | "balloons";

export interface EggPlacement {
  x: number;
  z: number;
  y: number;
  heading: number; // 该处道路朝向(rad),用于让彩蛋朝向路边视线
  kind: EggKind;
  seed: number; // 每个彩蛋的稳定随机种子(动画相位/配色用)
}

export interface Track {
  halfWidth: number;
  length: number;
  samples: TrackSample[];
  buildRoadGeometry(): THREE.BufferGeometry;
  decorations(): Decoration[];
  eggs(): EggPlacement[];
  nearest(x: number, z: number, hintIdx: number): { idx: number; lateral: number; height: number; sample: TrackSample };
  startPose(): { x: number; z: number; y: number; heading: number };
}

// 确定性伪随机(基于整数种子),保证每次刷新装饰布局一致,不抖动。
function hash(n: number): number {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  x = x - Math.floor(x);
  return x;
}

const ROAD_HALF = 7.0; // 路面半宽(总宽 14m,双车道感,够宽松不憋屈)
const N = 1600; // 中心线弧长均匀采样数

export function makeTrack(): Track {
  // —— 控制点:基于大圆 + 平滑正弦扰动,保证流畅、不自交、有弯道节奏 + 缓坡 ——
  const R = 300;
  const K = 16;
  const ctrl: THREE.Vector3[] = [];
  for (let i = 0; i < K; i++) {
    const a = (i / K) * Math.PI * 2;
    const r = R * (1 + 0.26 * Math.sin(a * 3) + 0.12 * Math.cos(a * 2));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    ctrl.push(new THREE.Vector3(x, 0, z)); // 第一版平路面:车恒定贴地最稳;起伏留作后续地形增强
  }
  const curve = new THREE.CatmullRomCurve3(ctrl, true, "catmullrom", 0.5);

  // 弧长均匀采样中心线
  const pts = curve.getSpacedPoints(N); // N+1 点,首尾重合
  const seg = curve.getLength() / N;
  const samples: TrackSample[] = [];
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % N];
    let tx = q.x - p.x;
    let tz = q.z - p.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const dy = q.y - p.y;
    const grade = dy / (Math.hypot(q.x - p.x, q.z - p.z) || 1);
    samples.push({
      cx: p.x,
      cy: p.y,
      cz: p.z,
      tx,
      tz,
      nx: tz, // 右法线 = 切线顺时针 90°
      nz: -tx,
      heading: Math.atan2(tx, tz),
      s: i * seg,
      grade,
    });
  }
  const length = N * seg;

  const buildRoadGeometry = (): THREE.BufferGeometry => {
    const rows = N + 1;
    const pos = new Float32Array(rows * 2 * 3);
    const uv = new Float32Array(rows * 2 * 2);
    const nor = new Float32Array(rows * 2 * 3);
    const V_PERIOD = 9; // 纹理沿弧长每 ~9m 循环一次(中线虚线节奏)
    // 整圈取整数段纹理 → 末行(=首点)正好落在整数个周期边界上,闭环接缝处中线虚线严丝对齐,
    // 不再因 length/V_PERIOD 非整数而在起点出现一小截错位/跳变的虚线。
    const vRepeats = Math.max(1, Math.round((N * seg) / V_PERIOD));
    const vPer = (N * seg) / vRepeats;
    for (let i = 0; i < rows; i++) {
      const sm = samples[i % N];
      const v = (i * seg) / vPer;
      const lx = sm.cx - sm.nx * ROAD_HALF;
      const lz = sm.cz - sm.nz * ROAD_HALF;
      const rx = sm.cx + sm.nx * ROAD_HALF;
      const rz = sm.cz + sm.nz * ROAD_HALF;
      const b = i * 2 * 3;
      pos[b] = lx; pos[b + 1] = sm.cy + 0.06; pos[b + 2] = lz;
      pos[b + 3] = rx; pos[b + 4] = sm.cy + 0.06; pos[b + 5] = rz;
      nor[b] = 0; nor[b + 1] = 1; nor[b + 2] = 0;
      nor[b + 3] = 0; nor[b + 4] = 1; nor[b + 5] = 0;
      const u = i * 2 * 2;
      uv[u] = 0; uv[u + 1] = v;
      uv[u + 2] = 1; uv[u + 3] = v;
    }
    const idx = new Uint32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      const o = i * 6;
      idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = a + 2;
      idx[o + 3] = a + 1; idx[o + 4] = a + 3; idx[o + 5] = a + 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  };

  const decorations = (): Decoration[] => {
    const out: Decoration[] = [];
    // —— 中景:树木带(路肩外 3~16m),松/圆叶为主 + 樱花点缀 + 偶见灌木/苔石/灯。每 ~13m 两侧。——
    const STEP = 7;
    for (let i = 0; i < N; i += STEP) {
      const sm = samples[i];
      for (let sIdx = 0; sIdx < 2; sIdx++) {
        const side = sIdx === 0 ? -1 : 1;
        if (hash(i * 2 + sIdx) < 0.18) continue; // 留空档
        const off = ROAD_HALF + 3 + hash(i + sIdx * 99) * 13;
        const r = hash(i * 7 + sIdx + 1);
        const kind = r < 0.34 ? 0 : r < 0.6 ? 1 : r < 0.7 ? 2 : r < 0.8 ? 3 : r < 0.88 ? 4 : r < 0.93 ? 7 : 1;
        out.push({
          x: sm.cx + sm.nx * off * side,
          z: sm.cz + sm.nz * off * side,
          y: sm.cy,
          side,
          kind,
          rot: hash(i + sIdx * 13) * Math.PI * 2,
          scale: 0.85 + hash(i * 3 + sIdx) * 0.7,
          tint: hash(i * 11 + sIdx * 5),
        });
      }
    }
    // —— 近景:前景带(路肩外 1.2~4.7m),草丛/花/小灌木,更密(每 ~6m),增强层次与"精致感"。——
    const STEP2 = 3;
    for (let i = 0; i < N; i += STEP2) {
      const sm = samples[i];
      for (let sIdx = 0; sIdx < 2; sIdx++) {
        const side = sIdx === 0 ? -1 : 1;
        if (hash(i * 5 + sIdx * 3 + 7) < 0.35) continue;
        const off = ROAD_HALF + 1.2 + hash(i * 2 + sIdx + 31) * 3.5;
        const r = hash(i * 9 + sIdx + 2);
        const kind = r < 0.5 ? 6 : r < 0.82 ? 5 : 3;
        out.push({
          x: sm.cx + sm.nx * off * side,
          z: sm.cz + sm.nz * off * side,
          y: sm.cy,
          side,
          kind,
          rot: hash(i * 4 + sIdx * 7) * Math.PI * 2,
          scale: 0.7 + hash(i * 6 + sIdx) * 0.6,
          tint: hash(i * 13 + sIdx * 2),
        });
      }
    }
    return out;
  };

  // 沿环线稀疏散布的「奇遇彩蛋」:卡通形象 + 惊喜小景,间隔足够远 → 每个都像一次奖励。
  // side: -1 左 / +1 右; off: 路肩外偏移米数。所有彩蛋都留在车道外,车开的路只保留路面和标线。
  const eggs = (): EggPlacement[] => {
    const spec: { frac: number; kind: EggKind; side: number; off: number }[] = [
      { frac: 0.045, kind: "rainbow", side: -1, off: 20 },
      { frac: 0.12, kind: "deer", side: 1, off: 6 },
      { frac: 0.205, kind: "windmill", side: -1, off: 34 },
      { frac: 0.31, kind: "bunny", side: 1, off: 5 },
      { frac: 0.4, kind: "spirit", side: -1, off: 7 },
      { frac: 0.52, kind: "balloons", side: 1, off: 6 },
      { frac: 0.63, kind: "rainbow", side: 1, off: 20 },
      { frac: 0.71, kind: "deer", side: -1, off: 7 },
      { frac: 0.8, kind: "windmill", side: 1, off: 40 },
      { frac: 0.88, kind: "spirit", side: 1, off: 7 },
      { frac: 0.94, kind: "bunny", side: -1, off: 5 },
    ];
    return spec.map((s, i) => {
      const sm = samples[Math.floor(s.frac * N) % N];
      const o = ROAD_HALF + s.off;
      return {
        x: sm.cx + sm.nx * o * s.side,
        z: sm.cz + sm.nz * o * s.side,
        y: sm.cy,
        heading: sm.heading,
        kind: s.kind,
        seed: hash(i * 17 + 3) * 1000,
      };
    });
  };

  // 最近点:从 hint 附近局部环形搜索(车每帧位移小,最近点索引连续)。
  const nearest = (x: number, z: number, hintIdx: number) => {
    let bestD = Infinity;
    let bestI = hintIdx;
    const W = 60;
    for (let k = -W; k <= W; k++) {
      const i = ((hintIdx + k) % N + N) % N;
      const sm = samples[i];
      const dx = x - sm.cx;
      const dz = z - sm.cz;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const sm = samples[bestI];
    const dx = x - sm.cx;
    const dz = z - sm.cz;
    const lateral = dx * sm.nx + dz * sm.nz; // 带符号横向偏移(右正左负)
    return { idx: bestI, lateral, height: sm.cy, sample: sm };
  };

  const startPose = () => {
    const sm = samples[0];
    return { x: sm.cx, z: sm.cz, y: sm.cy, heading: sm.heading };
  };

  return { halfWidth: ROAD_HALF, length, samples, buildRoadGeometry, decorations, eggs, nearest, startPose };
}
