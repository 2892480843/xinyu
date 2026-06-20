// 车道遮罩:解码 dirt_road_mask.json(512² 位图,世界范围 -150~150,正对应缩放居中后的林间土路模型),
// 构建带符号距离场(SDF),给驾驶提供「是否在路 / 离路缘多远 / 往哪是路内 / 从哪出生」四类查询。
// 全部是 XZ 俯视投影,与地形高度无关——高度仍由射线贴地负责,遮罩只负责把车「关」在车道里。

export interface RoadMask {
  res: number;
  min: number;
  size: number;
  cell: number; // 每格世界尺寸(米)
  on: Uint8Array; // res*res,1=路面
  maxHalfWidth: number; // 路面最宽处的半宽(米),用于自适应护栏留白
  /** 世界坐标是否落在路面上 */
  isOnRoad(x: number, z: number): boolean;
  /** 带符号距离(米):路内为正(到路缘距离),路外为负(到路面距离);双线性插值 */
  sampleSdf(x: number, z: number): number;
  /** 指向「路内更深处」的单位方向(SDF 梯度上升方向),写入 out;无梯度时写 0 */
  gradTo(x: number, z: number, out: { x: number; z: number }): void;
  /** 出生点:路的一端 + 朝路面延伸方向 */
  findSpawn(): { x: number; z: number; heading: number };
}

function decodeBits(b64: string, count: number): Uint8Array {
  const bin = atob(b64);
  const on = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    on[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  }
  return on;
}

// Chamfer(1,√2) 距离变换:seed=1 处距离 0,前向+后向两遍扫描传播,得单位「格」的近似欧氏距离。
function chamferDT(seed: Uint8Array, res: number): Float32Array {
  const INF = 1e9;
  const D1 = 1;
  const D2 = Math.SQRT2;
  const d = new Float32Array(res * res);
  for (let i = 0; i < d.length; i++) d[i] = seed[i] ? 0 : INF;
  for (let z = 0; z < res; z++) {
    for (let x = 0; x < res; x++) {
      const i = z * res + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + D1);
      if (z > 0) v = Math.min(v, d[i - res] + D1);
      if (x > 0 && z > 0) v = Math.min(v, d[i - res - 1] + D2);
      if (x < res - 1 && z > 0) v = Math.min(v, d[i - res + 1] + D2);
      d[i] = v;
    }
  }
  for (let z = res - 1; z >= 0; z--) {
    for (let x = res - 1; x >= 0; x--) {
      const i = z * res + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x < res - 1) v = Math.min(v, d[i + 1] + D1);
      if (z < res - 1) v = Math.min(v, d[i + res] + D1);
      if (x < res - 1 && z < res - 1) v = Math.min(v, d[i + res + 1] + D2);
      if (x > 0 && z < res - 1) v = Math.min(v, d[i + res - 1] + D2);
      d[i] = v;
    }
  }
  return d;
}

export async function loadRoadMask(url: string): Promise<RoadMask> {
  const resp = await fetch(url);
  const j = (await resp.json()) as { RES: number; range: [number, number]; bits: string };
  const res = j.RES;
  const min = j.range[0];
  const size = j.range[1] - j.range[0];
  const cell = size / res;
  const on = decodeBits(j.bits, res * res);

  // 带符号距离场(米):路内 = 到最近非路;路外 = 负的到最近路面。
  const notOn = new Uint8Array(on.length);
  for (let i = 0; i < on.length; i++) notOn[i] = on[i] ? 0 : 1;
  const dIn = chamferDT(notOn, res); // 路面格 → 最近路缘(格)
  const dOut = chamferDT(on, res); // 非路格 → 最近路面(格)
  const sdf = new Float32Array(on.length);
  let maxDIn = 0;
  for (let i = 0; i < on.length; i++) {
    if (on[i] && dIn[i] > maxDIn) maxDIn = dIn[i];
    sdf[i] = (on[i] ? dIn[i] : -dOut[i]) * cell;
  }
  const maxHalfWidth = maxDIn * cell;

  const colOf = (x: number) => (x - min) / cell;
  const rowOf = (z: number) => (z - min) / cell;
  const worldX = (c: number) => min + (c + 0.5) * cell;
  const worldZ = (r: number) => min + (r + 0.5) * cell;

  const isOnRoad = (x: number, z: number): boolean => {
    const c = Math.floor(colOf(x));
    const r = Math.floor(rowOf(z));
    if (c < 0 || c >= res || r < 0 || r >= res) return false;
    return on[r * res + c] === 1;
  };

  const sampleSdf = (x: number, z: number): number => {
    let cf = colOf(x) - 0.5;
    let rf = rowOf(z) - 0.5;
    cf = Math.max(0, Math.min(res - 1.001, cf));
    rf = Math.max(0, Math.min(res - 1.001, rf));
    const c0 = Math.floor(cf);
    const r0 = Math.floor(rf);
    const tx = cf - c0;
    const tz = rf - r0;
    const i00 = r0 * res + c0;
    const a = sdf[i00] + (sdf[i00 + 1] - sdf[i00]) * tx;
    const b = sdf[i00 + res] + (sdf[i00 + res + 1] - sdf[i00 + res]) * tx;
    return a + (b - a) * tz;
  };

  const gradTo = (x: number, z: number, out: { x: number; z: number }): void => {
    const e = cell;
    const gx = sampleSdf(x + e, z) - sampleSdf(x - e, z);
    const gz = sampleSdf(x, z + e) - sampleSdf(x, z - e);
    const len = Math.hypot(gx, gz);
    if (len < 1e-6) {
      out.x = 0;
      out.z = 0;
      return;
    }
    out.x = gx / len;
    out.z = gz / len;
  };

  const findSpawn = (): { x: number; z: number; heading: number } => {
    // 路面质心(格坐标)
    let mc = 0;
    let mr = 0;
    let sc = 0;
    for (let r = 0; r < res; r++) {
      for (let c = 0; c < res; c++) {
        if (on[r * res + c]) {
          mc += c;
          mr += r;
          sc++;
        }
      }
    }
    if (sc > 0) {
      mc /= sc;
      mr /= sc;
    }
    // 端点:8 邻路面数 ≤3 且非毛刺(dIn≥0.8 格),取离质心最远者 → 路程最长的一头。
    let best = -1;
    let bestC = -1;
    let bestR = -1;
    let fb = -1;
    let fbi = -1;
    for (let r = 1; r < res - 1; r++) {
      for (let c = 1; c < res - 1; c++) {
        const i = r * res + c;
        if (!on[i]) continue;
        if (dIn[i] > fb) {
          fb = dIn[i];
          fbi = i;
        }
        let nb = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if ((dr || dc) && on[(r + dr) * res + (c + dc)]) nb++;
          }
        }
        if (nb <= 3 && dIn[i] >= 0.8) {
          const dd = (c - mc) * (c - mc) + (r - mr) * (r - mr);
          if (dd > best) {
            best = dd;
            bestC = c;
            bestR = r;
          }
        }
      }
    }
    let c = bestC;
    let r = bestR;
    if (c < 0) {
      // 无端点(环路):退到路最宽处
      c = fbi % res;
      r = (fbi / res) | 0;
    }
    // 朝向:指向半径 6 邻域的路面质心 → 沿路往里开
    let ax = 0;
    let az = 0;
    let n = 0;
    const R = 6;
    for (let dr = -R; dr <= R; dr++) {
      for (let dc = -R; dc <= R; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= res || cc < 0 || cc >= res) continue;
        if (on[rr * res + cc]) {
          ax += dc;
          az += dr;
          n++;
        }
      }
    }
    const heading = n > 0 && (ax || az) ? Math.atan2(ax, az) : 0;
    return { x: worldX(c), z: worldZ(r), heading };
  };

  return { res, min, size, cell, on, maxHalfWidth, isOnRoad, sampleSdf, gradTo, findSpawn };
}
