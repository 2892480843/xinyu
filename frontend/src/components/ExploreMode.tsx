/* eslint-disable react-hooks/immutability, react-hooks/set-state-in-effect -- R3F animation refs/materials are mutated outside React render state. */
import { Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Outlines, Html, useAnimations, useGLTF, Stars, Billboard, useTexture } from "@react-three/drei";
import { EffectComposer } from "@react-three/postprocessing";
import { Effect, EffectAttribute } from "postprocessing";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { SceneVisual } from "../lib/sceneMap";
import type { SceneMotionMood } from "../lib/sceneMotion";
import { ARTIFACT_3D_REGISTRY } from "../lib/artifact3d";
import { IMPRINT_3D_REGISTRY, imprintShapeForEmotion } from "../lib/imprint3d";
import { requestCompanionChat, fetchTtsVoices, type TtsVoice } from "../lib/api";
import { hash2, islandHeight, valueNoise, smoothstep01, ISLAND_RADIUS, ISLAND_SIZE } from "../lib/islandTerrain";
import { makeRng } from "../lib/deterministic";
import { Aurora, MeteorShower, NightMotes, MilkyWay } from "./SkyFx";
import { play as playSfx, chimeNote, startEngine, stopEngine, setEngineSpeed, playAccelRev, playJump, playLand, playFluteNote, playCompanionSong, playLanternRelease, playLanternMelody, playFireworkLaunch, playFireworkBurst } from "../lib/sfx";
import { emitCompanionEvent, pickChatterLine, subscribeCompanionEvents, type CompanionChatterEvent } from "../lib/companionChatter";
import { playSample } from "../lib/samples";
import { playLanternCue, prewarmLanternCues } from "../lib/lanternMusic";
import { setLocationZone, setWeatherAmbience, stopLocationAmbience, type LocationZone } from "../lib/locationAmbience";
import { getPerfTier } from "../lib/perfTier";
import type { PerfTier } from "../lib/perfTier";
import { useIsTouch } from "../lib/device";
import { selectCharacterAction, type CharacterActionClip } from "../lib/protagonistAction";
import { EXPLORE_SCALE, EXPLORE_HEIGHT_SCALE, EXPLORE_HILLS, EXPLORE_WALK_RADIUS } from "../lib/exploreWorld";
import { HEALING_DISTRICT_PRESENTATION, HEALING_RAIN_PRESENTATION, HEALING_WALK_CAMERA } from "../lib/explorePresentation";
import { EXPLORE_MAP_POIS, exploreZoneAmbience, findExploreZone, type ExplorePoiKind, type ExploreZone } from "../lib/exploreZones";
import {
  DEFAULT_EXPLORE_ENVIRONMENT,
  EXPLORE_TIME_OPTIONS,
  EXPLORE_WEATHER_OPTIONS,
  loadExploreEnvironment,
  resolveExploreEnvironmentVisual,
  saveExploreEnvironment,
  type ExploreEnvironment,
} from "../lib/exploreEnvironment";
import {
  createCompanionVoice,
  getCompanionLevel,
  loadAutoVoice,
  loadCompanionVoiceId,
  saveAutoVoice,
  saveCompanionVoiceId,
  subscribeCompanionLevel,
  type CompanionVoiceController,
} from "../lib/companionVoice";
import DriveScene from "./DriveScene";
import { MOON_TEXTURE_URL } from "../lib/moonSvg";
import VoiceInputButton from "./VoiceInputButton";
import {
  COMPANION_FOODS,
  feedCompanion,
  getCompanionBondLabel,
  getSecretText,
  loadCompanionState,
  nightVisitCompanion,
  pickCompanionOpenLine,
  renameCompanion,
  saveCompanionState,
  singCompanion,
  talkToCompanion,
  wakeCompanion,
  type CompanionAnimation,
  type CompanionFoodId,
  type CompanionSecretId,
  type CompanionState,
} from "../lib/companionSpirit";

// 探索地形:岛屿轮廓大幅水平放大 → 一座很大很大的可走岛
const EXS = EXPLORE_SCALE; // 水平放大(极巨大岛)
const EYS = EXPLORE_HEIGHT_SCALE; // 整体岛形高度系数
const HILLS = EXPLORE_HILLS; // 世界尺度丘陵幅度(让岛明显起伏,不是平盘子)
// 地表高度:大岛盘形(含海岸) + 世界频率多倍频丘陵。村落中心保持平整(密集小屋不卡坡),
// 丘陵在村外中环隆起、近海岸渐隐(岛仍干净沉入海)。
function exGroundY(wx: number, wz: number): number {
  const base = islandHeight(wx / EXS, -wz / EXS) * EYS;
  const r = Math.hypot(wx, wz) / (ISLAND_RADIUS * EXS);
  const coast = 1 - smoothstep01(0.62, 0.8, r); // 丘陵向海岸收平,外圈留出平缓沙滩肩台
  const villageFlat = smoothstep01(0.05, 0.24, r); // 中央村落区压平,向外才起伏
  // 东南海湾 cove:把丘陵在海湾外圈彻底压平 → 连续低平沙地,海滩道具稳稳落在沙上而非草坡。
  // 方位/半宽与 bayMask 同值(0.55/0.55),此处内联字面量:exGroundY 在模块初始化期即被调用,
  // 早于 BAY_ANGLE/BAY_WIDTH 的声明,引用它们会触发 TDZ 崩溃 —— 故不调用 bayMask。
  let dBay = Math.atan2(wz, wx) - 0.55;
  if (dBay < -Math.PI) dBay += Math.PI * 2; else if (dBay > Math.PI) dBay -= Math.PI * 2;
  const coveFlat = 1 - Math.exp(-(dBay * dBay) / (0.55 * 0.55)) * smoothstep01(0.42, 0.6, r);
  const hills =
    valueNoise(wx * 0.028 + 3, wz * 0.028 + 3) * 0.62 +
    valueNoise(wx * 0.08 + 1, wz * 0.08 + 1) * 0.28 +
    valueNoise(wx * 0.19, wz * 0.19) * 0.1; // 0..1(只加不减,从盘面隆起)
  return base + hills * HILLS * coast * villageFlat * coveFlat;
}

// ── 环岛柏油路「专属地面」:近路处把地形压平(车开起来又平又稳),远处退回原有丘陵 ──
// 由 Town 在挂载时填入:roadCurvePts = 中心线采样(含平滑高度),roadHalfW = 路面半宽。
// 这样驾驶逻辑、地形网格、路面贴图三处共用同一份「平路地面」→ 不颠、不穿模、不悬空。
interface RoadGroundSample { x: number; z: number; y: number; }
const roadGround: { pts: RoadGroundSample[]; halfW: number; flatW: number; blendW: number } = {
  pts: [],
  halfW: 3.0, // 路面半宽(与 ROAD_HALF_W 一致)
  flatW: 6.5, // 路面 + 路肩内完全铺平的半宽(略加宽,让路两侧有平整路肩、边缘稳稳贴地不悬空)
  blendW: 22.0, // 超出 flatW 后向丘陵地形渐变过渡的半宽(加宽 → 挖/填两侧是缓坡草坡,不是竖直墙)
};
// 给世界点 (wx,wz):若在路附近 → 返回该处「铺平后的路面高度」(顺路平滑,无高频丘陵);
// 不在路附近返回 null。用最近中心线点的高度做基准,避免路面横截面又有起伏。
function sampleRoadGround(wx: number, wz: number): { y: number; weight: number } | null {
  const pts = roadGround.pts;
  const N = pts.length;
  if (N < 4) return null;
  let bestI = -1;
  let bestD2 = Infinity;
  // 朴素最近邻(路仅 280 点;车/地形调用密集但每点只 O(280),可接受)
  for (let i = 0; i < N; i++) {
    const dx = pts[i].x - wx;
    const dz = pts[i].z - wz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; bestI = i; }
  }
  // 把查询点投影到「最近点左右两段」上,取真正的垂足:
  //  ① 垂距(而非到顶点的距离)→ 路带宽度精确、边缘干净;
  //  ② 垂足处沿段线性插值的高度 → 与柏油 ribbon 同一条曲面高度,地形压平后和路面严丝合缝。
  // 旧版用 (a.y+b.y)/2 的「整段常量高度」:坡段上这段常量比 ribbon 真实高度偏高最多约一个段差(~0.17m),
  // 超过路面薄层 raise(0.08)→ 草地三角从路面下方顶穿出来,看起来路被撕成锯齿状。投影后两者高度一致,根除穿模。
  let bestDist = Math.sqrt(bestD2);
  let bestY = pts[bestI].y;
  for (let s = -1; s <= 0; s++) {
    const a = pts[((bestI + s) % N + N) % N];
    const b = pts[((bestI + s + 1) % N + N) % N];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len2 = ex * ex + ez * ez;
    if (len2 < 1e-6) continue;
    let t = ((wx - a.x) * ex + (wz - a.z) * ez) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const fx = a.x + ex * t;
    const fz = a.z + ez * t;
    const dx = fx - wx;
    const dz = fz - wz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestDist) { bestDist = dist; bestY = a.y + (b.y - a.y) * t; }
  }
  if (bestDist > roadGround.blendW) return null;
  // weight: flatW 内 = 1(完全平路);flatW..blendW 之间线性过渡到 0(回归丘陵)
  const weight = bestDist <= roadGround.flatW ? 1 : Math.max(0, 1 - (bestDist - roadGround.flatW) / (roadGround.blendW - roadGround.flatW));
  return { y: bestY, weight };
}
// 车辆/地形共用:近路处用路面高度,远路用 exGroundY。w 返回当前点的「平路权重」(0..1)。
function groundYWithRoad(wx: number, wz: number): { y: number; roadW: number } {
  const rg = sampleRoadGround(wx, wz);
  if (!rg) return { y: exGroundY(wx, wz), roadW: 0 };
  const g = exGroundY(wx, wz);
  return { y: g + (rg.y - g) * rg.weight, roadW: rg.weight };
}
// 世界点到环路中心线的最近距离(朴素遍历 280 采样点)。供清除路带上的房子/树等障碍共用。
function distToRoadCenter(wx: number, wz: number): number {
  const pts = roadGround.pts;
  let m = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - wx;
    const dz = pts[i].z - wz;
    const d = dx * dx + dz * dz;
    if (d < m) m = d;
  }
  return Math.sqrt(m);
}

// ── 真实海岛布景工具:让散落物只长在草地、彼此不堆叠、不侵入沙滩水域 ──────────
// 海滩 / 浅滩 / 水面判定(与 buildExploreTerrain 的沙岸配色完全同一套公式)。
// 返回 true = 该点是沙/水,不该长树灌花 → 杜绝「树长进海里 / 沙滩里冒树」的穿模与失真。
function isBeachOrWater(wx: number, wz: number): boolean {
  const h = groundYWithRoad(wx, wz).y;
  if (h < 0.3) return true; // 真实沙/水线(地形 h<0.12 即沙)留小余量;再低就是滩涂/浅水,不长植被
  const rNorm = Math.hypot(wx, wz) / (ISLAND_RADIUS * EXS);
  let dBay = Math.atan2(wz, wx) - 0.55; // 东南海湾方位(与地形 beachEdge 同一基准)
  while (dBay > Math.PI) dBay -= Math.PI * 2;
  while (dBay < -Math.PI) dBay += Math.PI * 2;
  const bayWiden = Math.exp(-(dBay * dBay) / (0.62 * 0.62)) * 0.15; // 海湾侧沙带内移
  const beachEdge = 0.71 - bayWiden + (valueNoise(wx * 0.04, -wz * 0.04) - 0.5) * 0.08;
  return rNorm > beachEdge && h < 2.2; // 外圈低地 = 沙滩带
}

// 简易空间网格间距器:让散落物彼此保持最小间距,消除「随机撒点堆叠 → 树干/树冠互插」的穿模与杂乱。
// cell 取最小间距;返回的 accept(x,z,minDist) 仅当与已接受点都 >= minDist 时落子。确定性(按调用顺序)。
function makeSpacer(cell: number) {
  const grid = new Map<number, { x: number; z: number }[]>();
  const key = (gx: number, gz: number) => (gx + 4096) * 8192 + (gz + 4096);
  return (x: number, z: number, minDist: number): boolean => {
    const gx = Math.floor(x / cell), gz = Math.floor(z / cell), md2 = minDist * minDist;
    for (let ix = gx - 1; ix <= gx + 1; ix++)
      for (let iz = gz - 1; iz <= gz + 1; iz++) {
        const arr = grid.get(key(ix, iz));
        if (arr) for (const p of arr) { const dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz < md2) return false; }
      }
    const k = key(gx, gz);
    let arr = grid.get(k);
    if (!arr) { arr = []; grid.set(k, arr); }
    arr.push({ x, z });
    return true;
  };
}

// 环岛路控制点(顺时针:正北→东北→东→南→西南→西→西北→回正北)。
// 走 r≈115 的干净环带,已数值验证:路边到全部地标(浴场/街区/风车/灯塔/鸟居/码头…)最小间隙 > 14,不穿模。
// 西北段外推绕开风车(-62,80);东南侧内收避开海湾海滩道具。起点在正北,对齐车出生点。
// 注意:闭环交给 CatmullRomCurve3(closed=true) / smoothClosedPath 自动完成,这里只列「唯一」控制点,
// 切勿把首点 [0,118] 再补到末尾 —— 否则起点处会生成一个退化小环(切线翻转~180°、路面自交叠),正北出生点正好踩在裂缝上。
const ROAD_CTRL_PTS: [number, number][] = [
  [0, 118], [70, 98], [118, 40], [108, -35], [78, -95],
  [20, -120], [-50, -118], [-100, -92], [-135, -45], [-140, 30],
  [-108, 82], [-50, 112],
];
const ROAD_HALF_W = 3.0; // 路面半宽(整路宽 6,容得下车碰撞 1.35×2 + 余量)
const ROAD_SURFACE_RAISE = 0.14; // 柏油 ribbon 高出地形网格的薄层;车/人贴地时按路权重加上 → 正好站/压在路面上,不陷进路里。略加厚(0.08→0.14)给地形网格(格宽~2.1m)的线性插值留余量,坡段也不被草地三角顶穿
// 用控制点 + 闭合 CatmullRom 样条生成中心线采样,并赋予「平滑高度」:
// 只跟岛屿大盘基底(低频) + 沿弧长的宏观缓起伏(2 个长波,坡度<4%)→ 有上下坡但不颠。
// 在模块加载时立即算好并写入 roadGround.pts,保证 buildExploreTerrain / 车辆 / 路面贴图三处拿到的都是同一份。
function buildRoadSamples(): { x: number; z: number; y: number; yaw: number }[] {
  const curve = new THREE.CatmullRomCurve3(
    ROAD_CTRL_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true, // closed
    "catmullrom",
    0.5,
  );
  const N = 280;
  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  // 路高 = 真实地形(exGroundY,含丘陵)沿环线的「移动平均平滑版」。
  // 旧版用 islandHeight(无丘陵) + 独立 roll,会在原本是山/坡的地方把路抬到地形之上 → 路成悬在地形上的路堤,
  // 边缘露出竖直面像穿模。改成跟随真实山势的平滑高度后:路顺着坡缓缓起伏(开起来不颠)、贴着地形不悬空。
  const px: number[] = [];
  const pz: number[] = [];
  const yaws: number[] = [];
  const rawY: number[] = [];
  for (let i = 0; i < N; i++) {
    curve.getPointAt(i / N, p);
    curve.getTangentAt(i / N, tan);
    px.push(p.x);
    pz.push(p.z);
    yaws.push(Math.atan2(tan.x, tan.z));
    rawY.push(exGroundY(p.x, p.z));
  }
  const W = 20; // 平滑窗口半径(±20 段 ≈ ±57m):滤掉高频丘陵、保留宏观坡度 → 最大坡度~7%,不颠不穿穿
  const samples: { x: number; z: number; y: number; yaw: number }[] = [];
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let k = -W; k <= W; k++) sum += rawY[((i + k) % N + N) % N];
    samples.push({ x: px[i], z: pz[i], y: sum / (2 * W + 1), yaw: yaws[i] });
  }
  return samples;
}
// 模块加载即初始化(地形/车/路贴图都依赖它,必须早于 buildExploreTerrain 第一次调用)
roadGround.pts = buildRoadSamples();
roadGround.halfW = ROAD_HALF_W;

// 环岛跑道纹理:深沥青 + 左右浅边线 + 中线黄虚线(沿弧长重复)。横向铺满路宽,纵向每周期一段虚线。
function makeRingRoadTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 96;
  const x = c.getContext("2d")!;
  x.fillStyle = "#33363d"; // 深沥青底
  x.fillRect(0, 0, 64, 96);
  x.fillStyle = "#cfc8b6"; // 左右边线
  x.fillRect(3, 0, 3, 96);
  x.fillRect(58, 0, 3, 96);
  x.fillStyle = "#e8c34a"; // 中线黄虚线(每个纹理周期一段)
  x.fillRect(30, 16, 4, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping; // 横向铺满路宽
  t.wrapT = THREE.RepeatWrapping; // 纵向沿路重复
  t.anisotropy = 4;
  return t;
}

// 环岛跑道带状几何:沿中心线采样左右两边 → 一条连续 ribbon(曲线/坡道都无缝连续,无盒子分段的重叠与空隙)。
// 闭环:用 N+1 行(末行=首点)让纹理 v 连续;整圈纹理重复取整段数 → 接缝处虚线对齐。
function buildRingRoadGeometry(pts: { x: number; z: number; y: number; yaw: number }[], halfW: number, raise: number, period: number): THREE.BufferGeometry {
  const N = pts.length;
  let total = 0;
  for (let i = 0; i < N; i++) { const a = pts[i], b = pts[(i + 1) % N]; total += Math.hypot(b.x - a.x, b.z - a.z); }
  const repeats = Math.max(1, Math.round(total / period));
  const vPer = total / repeats; // 每段纹理弧长,整圈正好 repeats 次 → 无缝
  const rows = N + 1;
  const pos = new Float32Array(rows * 2 * 3);
  const uv = new Float32Array(rows * 2 * 2);
  const nor = new Float32Array(rows * 2 * 3);
  let arc = 0;
  for (let i = 0; i < rows; i++) {
    const s = pts[i % N];
    const nx = Math.cos(s.yaw); // 右法向(与路肩一致:右 = +cos/-sin)
    const nz = -Math.sin(s.yaw);
    const b = i * 6;
    pos[b] = s.x - nx * halfW; pos[b + 1] = s.y + raise; pos[b + 2] = s.z - nz * halfW; // 左
    pos[b + 3] = s.x + nx * halfW; pos[b + 4] = s.y + raise; pos[b + 5] = s.z + nz * halfW; // 右
    nor[b + 1] = 1; nor[b + 4] = 1; // 朝上
    const v = arc / vPer;
    const u = i * 4;
    uv[u] = 0; uv[u + 1] = v; uv[u + 2] = 1; uv[u + 3] = v;
    const nxt = pts[(i + 1) % N];
    arc += Math.hypot(nxt.x - s.x, nxt.z - s.z);
  }
  const idx = new Uint32Array(N * 6);
  for (let i = 0; i < N; i++) {
    const a = i * 2, c2 = (i + 1) * 2, o = i * 6;
    idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = c2;
    idx[o + 3] = a + 1; idx[o + 4] = c2 + 1; idx[o + 5] = c2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

const TERRAIN_GRASS_LOW = new THREE.Color("#5aa873");
const TERRAIN_GRASS_MID = new THREE.Color("#6fb37e");
const TERRAIN_GRASS_HIGH = new THREE.Color("#8cbf83");

function terrainGrassColor(wx: number, wz: number, h: number, target: THREE.Color): THREE.Color {
  if (h < 1.0) target.copy(TERRAIN_GRASS_LOW);
  else if (h < 4.5) target.copy(TERRAIN_GRASS_MID);
  else target.copy(TERRAIN_GRASS_HIGH);

  const py = -wz;
  const patch = 0.88 + valueNoise(wx * 0.05 + 7, py * 0.05 + 7) * 0.24;
  const fine = 0.97 + valueNoise(wx * 0.4, py * 0.4) * 0.06;
  return target.multiplyScalar(patch * fine);
}

function landmarkGrassColor(wx: number, wz: number, target: THREE.Color): THREE.Color {
  return terrainGrassColor(wx, wz, exGroundY(wx, wz), target);
}

// 建好的地形:按高度分区配色(草地 / 沙滩 / 水下),顶点色 + toon → 海岸自然过渡。
function buildExploreTerrain(): THREE.BufferGeometry {
  const S = ISLAND_SIZE * EXS;
  const SEG = 340;
  const geo = new THREE.PlaneGeometry(S, S, SEG, SEG);
  const pos = geo.attributes.position;
  const colors: number[] = [];
  const cSand = new THREE.Color("#dccaa0");
  const cUnder = new THREE.Color("#357884");
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    // 近环岛路处把地形顶点压向「平路地面」(weight 越高越平),让路面稳稳铺在平整地基上、不穿山不悬空
    const { y: terrainY, roadW } = groundYWithRoad(px, -py); // 与角色/车贴地同一套函数(含路平地)
    const onPad = onLandmarkPad(px, -py);
    const landmarkY = onPad ? landmarkGroundLift(px, -py) : -Infinity;
    const h = Math.max(terrainY, landmarkY);
    pos.setZ(i, h);
    void roadW; // 配色仍按高度走;路面上自有一层柏油 mesh 覆盖,无需据 roadW 改色
    const rNorm = Math.hypot(px, py) / (ISLAND_RADIUS * EXS);
    // 东南海湾(BAY_ANGLE≈0.55)处把沙滩带显著加宽,让整个 cove 成为连续沙地(世界 z = -py)
    let dBay = Math.atan2(-py, px) - 0.55;
    while (dBay > Math.PI) dBay -= Math.PI * 2;
    while (dBay < -Math.PI) dBay += Math.PI * 2;
    const bayWiden = Math.exp(-(dBay * dBay) / (0.62 * 0.62)) * 0.15; // 海湾中心沙带内移
    const beachEdge = 0.71 - bayWiden + (valueNoise(px * 0.04, py * 0.04) - 0.5) * 0.08; // 起伏的沙岸线(不死板)
    const isBeach = rNorm > beachEdge && h < 2.2; // 外圈低地 = 沙滩带
    if (h < -0.02) tmp.copy(cUnder);
    else if (isBeach || h < 0.12) tmp.copy(cSand);
    else if (landmarkY > terrainY) landmarkGrassColor(px, -py, tmp);
    else terrainGrassColor(px, -py, h, tmp);
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

// 手绘后期：Sobel 墨线描边 + 色阶(赛璐璐) + 纸纹颗粒。标准技术,自有实现,把渲染推向"会动的插画"。
const SKETCH_FRAG = `
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float grain(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 col = inputColor.rgb;                                 // 平涂交给 toon 材质,后期不做色阶(免得糊渐变)
  vec2 o = texelSize * 1.25;
  float a = lum(texture2D(inputBuffer, uv + vec2(-o.x, -o.y)).rgb);
  float b = lum(texture2D(inputBuffer, uv + vec2(0.0, -o.y)).rgb);
  float c = lum(texture2D(inputBuffer, uv + vec2(o.x, -o.y)).rgb);
  float d = lum(texture2D(inputBuffer, uv + vec2(-o.x, 0.0)).rgb);
  float e = lum(texture2D(inputBuffer, uv + vec2(o.x, 0.0)).rgb);
  float f = lum(texture2D(inputBuffer, uv + vec2(-o.x, o.y)).rgb);
  float g = lum(texture2D(inputBuffer, uv + vec2(0.0, o.y)).rgb);
  float h = lum(texture2D(inputBuffer, uv + vec2(o.x, o.y)).rgb);
  float gx = -a - 2.0 * d - f + c + 2.0 * e + h;
  float gy = -a - 2.0 * b - c + f + 2.0 * g + h;
  float edge = smoothstep(0.12, 0.45, sqrt(gx * gx + gy * gy)); // 墨线
  col = mix(col, vec3(0.09, 0.11, 0.15), edge * 0.82);
  float n = grain(floor(uv * resolution * 0.5));               // 纸纹颗粒
  col *= 0.95 + n * 0.07;
  outputColor = vec4(col, inputColor.a);
}`;
class SketchEffect extends Effect {
  constructor() {
    // 注意: 不用 CONVOLUTION —— postprocessing 6.39 + R3F 3.0.4 下 CONVOLUTION
    // 会导致 final output pass 把画面渲染到离屏 target、不呈现到主 canvas(黑屏)。
    // shader 本就手动用 inputBuffer + texelSize 做 3×3 邻域采样,无需 CONVOLUTION 机制。
    super("SketchEffect", SKETCH_FRAG, { attributes: EffectAttribute.NONE });
  }
}

// ───────────────────────────────────────────────────────────
// 自由探索模式：控制一个赛璐璐小人在心屿上走动、收集「心愿」。
// 深海玻璃氛围 + 卡通描边角色(融合)。键盘 WASD/方向键 + 触屏摇杆。
// 实时移动靠 frameloop="always"；逻辑全在 useFrame 里 ref 变异(不 setState)。
// ───────────────────────────────────────────────────────────

interface Input {
  x: number; // 横移 -1..1
  y: number; // 前后 -1(前)..1(后)
  jump?: boolean; // 一次性跳跃请求(Player 消费后置 false)
  wave?: boolean; // 一次性招手请求(Player 消费后置 false)
  flute?: boolean; // 一次性吹笛请求(Player 消费后置 false)
  plant?: boolean; // 一次性种花请求(MoodGarden 消费后置 false)
  action?: boolean; // 一次性交互键(E):车旁上车 / 车上下车(Player 消费后置 false)
  boost?: boolean; // 开车加速(持续):键盘 Shift / 触屏「»」踏板按住为 true
}

interface CompanionActionSignal {
  name: CompanionAnimation;
  nonce: number;
}

const CHATTER_MODE_KEY = "xinyu.companionChatter.v1"; // 「主动陪聊」开关持久化

const WALK_RADIUS = EXPLORE_WALK_RADIUS; // 可走范围(留出海岸,随大岛自动放大)
const FENCE_RADIUS = WALK_RADIUS + 0.6; // 护栏所在半径,岸边入口与玩家边界共用
const NEAR_SHORE_WALK_MARGIN = 2.8; // 允许走到护栏外一点点,够进入沙滩/浅滩,但不会远离岛屿
const BEACH_FENCE_GATE_HALF_WIDTH = 0.34; // 海湾护栏留口半角,视觉上就是沙滩入口
// 中心村落 / 岛上的固定设施与地标(坐标须与 Town/Village 的 GltfProp 摆放一致)。
// 散落树木与民居都避开它们 → 杜绝「树穿过凉亭/神社/灯塔、房子叠在水井上」之类的穿模。
const ISLE_PROPS: { x: number; z: number; r: number }[] = [
  { x: 7, z: -7, r: 3.2 },      // 神社
  { x: -4.0, z: 0.6, r: 2.2 },  // 售货机
  { x: -7, z: 6, r: 3.4 },      // 凉亭
  { x: 5, z: -5, r: 2.8 },      // 水井
  { x: -10, z: -2, r: 3.2 },    // 藤架
  { x: 6, z: 7.5, r: 2.8 },     // 摊位
  { x: -13, z: -8, r: 3.4 },    // 帐篷
  { x: 13, z: -9, r: 3.2 },     // 瞭望台
  { x: -5, z: -8, r: 2.8 },     // 秋千
  { x: 9, z: -4, r: 2.4 },      // 风铃
  { x: 8, z: 9.5, r: 3.4 },     // 石阶(阶梯实体:树/灌木/花/蘑菇/石块都别长穿过它)
  { x: WALK_RADIUS * 0.3, z: WALK_RADIUS * 0.3, r: 7.0 },            // 池塘
  { x: -WALK_RADIUS * 0.35, z: WALK_RADIUS * 0.45, r: 4.0 },         // 风车
  { x: -WALK_RADIUS * 0.92, z: -WALK_RADIUS * 0.3, r: 4.2 },         // 灯塔
  { x: -WALK_RADIUS * 0.92 + 8, z: -WALK_RADIUS * 0.3 + 6, r: 3.0 }, // 灯塔看守屋
  { x: -WALK_RADIUS * 0.9, z: 0, r: 3.4 },                          // 鸟居
];
function nearIsleProp(x: number, z: number, margin = 0): boolean {
  for (const p of ISLE_PROPS) { const dx = p.x - x, dz = p.z - z, rr = p.r + margin; if (dx * dx + dz * dz < rr * rr) return true; }
  return false;
}
const PLAYER_SPEED = 13.2; // 移动速度(稳一点的探索步速,长按后再过渡到跑步)
const JUMP_V = 11.0; // 起跳初速度
const GRAVITY = 34.0; // 重力加速度(跳跃抛物);跳跃高度 ≈ V²/2g ≈ 1.8 单位
const CAM_DIST = HEALING_WALK_CAMERA.distance; // 相机跟在身后的距离:近景散步,角色更大、更有代入感
const CAM_HEIGHT = HEALING_WALK_CAMERA.height; // 相机高度:保留一点俯角看路,但不再像航拍

// 模块级临时向量(单 Player 实例,逐帧复用,避开 react-hooks 对组件内值变异的规则)
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _camVel = { x: 0, z: 0 };
const _up = new THREE.Vector3(0, 1, 0);
const dist2 = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};

// ── 玩家碰撞:把树/房子/地标当成圆柱障碍,玩家撞不进去(不穿模) ──
// 圆形碰撞体 + 空间网格:逐帧只检查玩家所在格子的 3×3 邻域,千余棵树也不掉帧。
type Collider = { x: number; z: number; r: number };
type ExploreRevealDelay = {
  town: number;
  village: number;
  coastline: number;
  interactions: number;
  companion: number;
  car: number;
  lanterns: number;
  townblock: number;
  rhododendron: number;
  manor: number;
  bath: number;
};
const COL_CELL = 8; // 网格边长,须 ≥ 最大(障碍半径 + 车/人半径);车体多点采样 r≈1.3、最大障碍 r≈4.5 → 8 足够覆盖
const colKey = (gx: number, gz: number): string => gx + "|" + gz;
function buildColliderGrid(list: Collider[]): Map<string, Collider[]> {
  const grid = new Map<string, Collider[]>();
  for (const c of list) {
    const k = colKey(Math.floor(c.x / COL_CELL), Math.floor(c.z / COL_CELL));
    const cell = grid.get(k);
    if (cell) cell.push(c);
    else grid.set(k, [c]);
  }
  return grid;
}
// 就地把 pos 推到障碍边缘外,并削去朝向障碍的速度分量 → 沿障碍自然滑行,不被卡死
function resolveCollisions(grid: Map<string, Collider[]> | null, pos: THREE.Vector3, vel: { x: number; z: number }, pr: number): void {
  if (!grid) return;
  const cgx = Math.floor(pos.x / COL_CELL);
  const cgz = Math.floor(pos.z / COL_CELL);
  for (let ax = cgx - 1; ax <= cgx + 1; ax++) {
    for (let az = cgz - 1; az <= cgz + 1; az++) {
      const cell = grid.get(colKey(ax, az));
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) {
        const c = cell[i];
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const minD = c.r + pr;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const nz = dz / d;
          pos.x = c.x + nx * minD; // 推到障碍外缘
          pos.z = c.z + nz * minD;
          const vn = vel.x * nx + vel.z * nz; // 速度在法线上的分量
          if (vn < 0) { vel.x -= vn * nx; vel.z -= vn * nz; } // 去掉「撞进去」的那一份,保留切向 → 滑行
        }
      }
    }
  }
}
const PLAYER_COL_R = 0.45; // 玩家碰撞半径

function beachAngleDelta(wx: number, wz: number): number {
  let d = Math.atan2(wz, wx) - BAY_ANGLE;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function isBeachFenceGap(wx: number, wz: number): boolean {
  const d = beachAngleDelta(wx, wz);
  return bayMask(wx, wz) > 0.72 && Math.abs(d) < BEACH_FENCE_GATE_HALF_WIDTH;
}

function walkableRadius(wx: number, wz: number): number {
  const bay = bayMask(wx, wz);
  return FENCE_RADIUS + NEAR_SHORE_WALK_MARGIN * bay;
}

// 汽车摆放:直接停在环路起点 (0,118) 的路面上,朝向沿路切线(指向下一个控制点 (70,98))。
// 一上车就在柏油路上,踩油门即沿环线兜风,无需先开过草地/穿村。视觉与碰撞共用同一坐标。
const CAR_POS = { x: 0, z: 118, rot: 1.85 };
const CAR_SCALE = 0.05; // 原生约 98 长 → ~4.9 单位的车
const CAR_Y_OFFSET = 15.47 * CAR_SCALE; // 轮底在原点下 15.47 → 抬起让轮子落地(≈0.77)
// qiche 原点不在车体水平中心(车体 bbox X∈[37,81]、Z∈[-40,58],中心≈(59,9.5))。只抬 Y 会让「可见车」
// 偏出逻辑坐标 carState 约 2.95(>上车判定半径 3.6)→ 走到看得见的车旁也按不了 E、碰不到。反向平移回正。
const CAR_FIT_X = -59.1 * CAR_SCALE; // ≈ -2.955
const CAR_FIT_Z = -9.45 * CAR_SCALE; // ≈ -0.473
const CAR_MAX_SPEED = 28; // W 巡航速度(放慢一点,从容兜风;按住 Shift 增压到 CAR_BOOST_SPEED)
const CAR_BOOST_SPEED = 48; // 加速键(Shift / 触屏「»」)下的冲刺上限
const CAR_TURN = 2.1; // 转向速率(低速更灵活)
// 可开的汽车状态(模块单例:DrivableCar 读、Player 写)。driving 时玩家坐车里、用输入开车
const carState = { x: CAR_POS.x, z: CAR_POS.z, heading: CAR_POS.rot, speed: 0, turn: 0, driving: false, throttle: 0, boost: false };
const sceneEnv = { night: false }; // 夜间标记(ExploreScene 写,DrivableCar 读 → 车灯只在夜里亮)
// 天灯升空高度曲线:RisingLantern 与 Player 跟拍相机共用同一条 → 镜头与灯严丝合缝
function lanternRise(t: number): number {
  const r = t < 2.2 ? t * t * 0.85 : 4.1 + (t - 2.2) * 5.2;
  return Math.min(r, 175);
}
// 放飞天灯后的「仰头跟拍」信号:SkyLanterns 放飞瞬间写入(发射点 + 地面高 + 清零计时),Player 相机读它仰起镜头追天灯升空,数秒后回到角色
const lanternCam = { x: 0, z: 0, gy: 0, t: 0, on: false };
// 「放飞一片」万灯齐放信号:UI 按钮写 v++ 与发射中心,SkyLanterns 据此一次性放出一整片天灯
const lanternFlock = { v: 0, x: 0, z: 0 };
// 天灯模型(kmd.glb 2.9M)是否已加载进缓存:SkyLanterns 进岛即顶层预加载,载完置 true。
// 放飞前据此判断——没好就先等(见 ensureLantern),避免「点了放飞才加载解析」的卡顿尖峰。
let _lanternModelReady = false;
const _carTmp = new THREE.Vector3();
// 精灵防穿模:目标点碰撞推出复用(回调内同步用,不跨组件共享)
const _compTmp = new THREE.Vector3();
const _compVel = { x: 0, z: 0 };
// 车辆姿态 useFrame 专用复用临时量(单辆车、回调内同步使用,不与玩家/相机的 _fwd 等共享)→ 免每帧 new
const _carUp = new THREE.Vector3();
const _carFwd = new THREE.Vector3();
const _carRight = new THREE.Vector3();
const _carQ = new THREE.Quaternion();
const _carQ2 = new THREE.Quaternion();
const _carMtx = new THREE.Matrix4();
const _CAR_ROLL_AXIS = new THREE.Vector3(0, 0, 1);

// 杜鹃花(写实灌木):村里/车旁散几株做花丛;落地偏移 = 1.0(native 底深) * 各自 scale
const RHODOS: { x: number; z: number; s: number }[] = [
  { x: 4, z: 17, s: 1.2 }, { x: -4, z: 17, s: 1.0 }, { x: 7, z: 12, s: 1.3 },
  { x: -6, z: 12, s: 1.05 }, { x: 2.5, z: 21, s: 1.1 }, { x: -9, z: 9, s: 1.15 },
];
// 两座写实大地标(村外开阔空地,周围清树避免穿模);base = native 底在原点下的深度,落地偏移 = base*scale
const BATH = { x: 5.4, z: 51.7, rot: 0.4, scale: 15, base: 0.03, clear: 12 }; // 罗马浴场
// 注:此模型是「漂浮岛」式资产 —— 建筑坐在一块向下收窄的岩石上,岩石根尖一直拖到原点下 17.5。
// base 须取「建筑地坪」深度(Platform/ground 底 ≈ 原点下 0.65),让地坪落在地坪台上、岩石根埋进台下;
// 若按整体包围盒底(17.5)落地,会把岩石尖当脚 → 建筑被顶到半空(悬空)。
const BLOCK = { x: -10.8, z: -50.9, rot: 2.2, scale: 0.28, base: 0.65, clear: 8 }; // 建筑街区(漂浮岛式,岩石根埋台下)
// 第三座大地标:西侧山庄(复用 villa 精模放大;origin 在底 → base=0;toon 卡通材质,与村落统一）
const MANOR = { x: -54, z: 6, rot: 1.15, scale: 4.0, base: 0, clear: 13 };
const BATH_FRONT_OPENING: PadColliderOpening = {
  dirX: -Math.sin(BATH.rot),
  dirZ: -Math.cos(BATH.rot),
  halfAngle: 1.15,
  innerClear: 4.8,
}; // 浴场正面有台阶/门廊:地坪碰撞留出一条可走缺口,但中心主体仍挡住

// 用一圈互叠的圆形碰撞体铺满整块地坪 → 玩家/车从外面绕,贴边也蹭不进(杜绝穿模)。
// 每个子碰撞半径 < COL_CELL(8) 才能被空间网格命中;中心 1 个 + 外环 N 个(外沿略超坪沿,封住边角)。
type PadColliderOpening = { dirX: number; dirZ: number; halfAngle: number; innerClear: number };
function isPadColliderInOpening(cx: number, cz: number, c: Collider, opening: PadColliderOpening): boolean {
  const dx = c.x - cx;
  const dz = c.z - cz;
  const d = Math.hypot(dx, dz);
  if (d < opening.innerClear) return false;
  return (dx / d) * opening.dirX + (dz / d) * opening.dirZ > Math.cos(opening.halfAngle);
}
function fillPadColliders(cx: number, cz: number, padR: number, openings: PadColliderOpening[] = []): Collider[] {
  const out: Collider[] = [];
  const rr = Math.min(5.5, padR * 0.6);
  out.push({ x: cx, z: cz, r: rr });
  const ringR = Math.max(0.01, padR - rr * 0.5);
  const n = Math.max(6, Math.ceil((2 * Math.PI * ringR) / (rr * 1.3)));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = { x: cx + Math.cos(a) * ringR, z: cz + Math.sin(a) * ringR, r: rr };
    if (openings.some((opening) => isPadColliderInOpening(cx, cz, c, opening))) continue;
    out.push(c);
  }
  return out;
}

// ── 石阶(terrStairs):实心 + 可拾级而上 ────────────────────────────────
// 海岸石阶 glb 摆在村东 (8,9.5),朝向 = face(8,9.5)(绕 Y 转 atan2(8,9.5))。原来只有一个挡圈,
// 玩家只能绕着走、踩不上去。这里换成「斜坡贴地抬升 + 两侧栏挡圆」:从低(外)端正面拾级而上,
// 脚贴着真实台阶面升高;两侧圆挡防止从侧面瞬移穿进半空(穿模);高端正好抵到摊位挡圈自然停步。
const STAIRS = { x: 8, z: 9.5, scale: 1.0 };
const STAIRS_ROT = Math.atan2(STAIRS.x, STAIRS.z); // 与渲染 rotation={face(8,9.5)} 完全一致
const STAIRS_BASE_Y = exGroundY(STAIRS.x, STAIRS.z); // 石阶底坐落处的地面高
// glb 轴转换后的 three 本地系:X 宽 [-1.2,1.2];Z 深 前(低)缘 +0.35 → 后(高)缘 -2.75;
// 5 级踏面顶从 0.45 线性升到 2.05(lz=0→0.45,lz=-2.4→2.05,斜率 0.4/0.6)。
const STAIRS_HALF_W = 1.2;
const STAIRS_FRONT = 0.35;
const STAIRS_BACK = -2.75;
// 世界点 → 石阶本地坐标(逆 Y 旋转 + 去缩放)
function stairLocal(wx: number, wz: number): { lx: number; lz: number } {
  const c = Math.cos(STAIRS_ROT), s = Math.sin(STAIRS_ROT);
  const dx = (wx - STAIRS.x) / STAIRS.scale, dz = (wz - STAIRS.z) / STAIRS.scale;
  return { lx: c * dx - s * dz, lz: s * dx + c * dz };
}
// 石阶本地坐标 → 世界点(铺两侧栏挡用)
function stairWorld(lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(STAIRS_ROT), s = Math.sin(STAIRS_ROT);
  return { x: STAIRS.x + (c * lx + s * lz) * STAIRS.scale, z: STAIRS.z + (-s * lx + c * lz) * STAIRS.scale };
}
// 玩家/相机贴地抬升:站在踏面范围内时返回该处台阶面的世界高度,否则 -Infinity(被 Math.max 忽略)。
// 用斜坡(线性)而非离散台阶:贴地更顺滑、不抖,脚正好落在各级台阶鼻线上。
function stairsGroundLift(wx: number, wz: number): number {
  const { lx, lz } = stairLocal(wx, wz);
  if (Math.abs(lx) > STAIRS_HALF_W || lz > STAIRS_FRONT || lz < STAIRS_BACK) return -Infinity;
  const h = Math.min(2.05, Math.max(0, 0.45 - (0.4 / 0.6) * lz)); // 踏面斜坡高(本地)
  return STAIRS_BASE_Y + h * STAIRS.scale;
}
// 两侧栏挡圆(前低端留口供拾级而上,后高端由摊位挡圈封住):本地左右各一排互叠圆 → 世界圆。
// 半径 0.3、间距 0.45 → 相邻互叠成连续墙(玩家高速也穿不过);把走廊收到本地 |lx|≲0.7,从台阶正中拾级。
function stairRailColliders(): Collider[] {
  const out: Collider[] = [];
  for (let lz = 0.1; lz >= -2.0; lz -= 0.45) {
    for (const lx of [STAIRS_HALF_W + 0.25, -(STAIRS_HALF_W + 0.25)]) {
      const w = stairWorld(lx, lz);
      out.push({ x: w.x, z: w.z, r: 0.3 });
    }
  }
  return out;
}

// 三色阶 toon 渐变贴图(crisp 赛璐璐)
function makeToonGradient(): THREE.DataTexture {
  const data = new Uint8Array([90, 175, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// 程序生成的小人：身体/头/发/背包/两腿，toon 材质 + 描边；走动时摆腿、身体微颠。
// 实例化批量物件:几百个相同网格合成几次绘制(树/灌木/花/礁石/护栏/房子…),让大岛也不卡。
// s = 均匀缩放;sv = 非均匀缩放[x,y,z](房子长方体用)。
interface InstItem {
  p: [number, number, number];
  s?: number;
  sv?: [number, number, number];
  r?: [number, number, number];
}
// ── Blender glb 素材接线 ───────────────────────────────────────────────
// 载入 public/models 下的 glb → 克隆 → 把每个网格材质换成共享 MeshToonMaterial(保留底色);
// 材质名含 "Emissive" 的改成发光 StandardMaterial(可用 tint 覆盖为情绪色)。
const MODELS = {
  lighthouse: "/models/xy_landmark_lighthouse.glb",
  windmill: "/models/xy_landmark_windmill.glb",
  torii: "/models/xy_landmark_torii.glb",
  shrine: "/models/xy_landmark_shrine.glb",
  pier: "/models/xy_landmark_pier.glb",
  vending: "/models/xy_landmark_vending.glb",
  boat: "/models/xy_landmark_boat.glb",
  whalerock: "/models/xy_landmark_whalerock.glb",
  whale: "/models/xy_creature_whale.glb",
  wishlight: "/models/xy_item_wishlight.glb",
  imprint: "/models/xy_item_imprint.glb",
  driftbottle: "/models/xy_item_driftbottle.glb",
  riverlamp: "/models/xy_item_riverlamp.glb",
  paperboat: ARTIFACT_3D_REGISTRY.paper_boat.url!,
  companion: "/models/xy_pet_spirit_lighthouse.glb",
  stonelantern: "/models/xy_item_stonelantern.glb",
  bonfire: "/models/xy_item_bonfire.glb",
  cairn: "/models/xy_item_cairn.glb",
  kite: "/models/xy_item_kite.glb",
  shell: "/models/xy_item_shell.glb",
  nightflower: "/models/xy_item_nightflower.glb",
  candle: ARTIFACT_3D_REGISTRY.candle.url!,
  feather: ARTIFACT_3D_REGISTRY.feather.url!,
  leafnote: ARTIFACT_3D_REGISTRY.leaf_note.url!,
  starwish: ARTIFACT_3D_REGISTRY.star_wish.url!,
  sail: ARTIFACT_3D_REGISTRY.sail.url!,
  silentshell: ARTIFACT_3D_REGISTRY.silent_shell.url!,
  glyphstone: ARTIFACT_3D_REGISTRY.glyph_stone.url!,
  bloom: ARTIFACT_3D_REGISTRY.bloom.url!,
  avatar: "/models/xy_char_avatar.glb",
  villagerBase: "/models/xy_char_villager_base.glb",
  memoryTree: "/models/xy_item_memory_tree.glb",
  fishingBobber: "/models/xy_item_fishing_bobber.glb",
  shootingStar: "/models/xy_fx_shooting_star.glb",
  heroChar: "/models/xyshz_rigged.glb?v=6", // 新默认主角 xyshz；v=6 内置完整自然动作库
  guardianChar: "/models/xy_char_protagonist.glb?v=2", // 旧动画守护者备选；?v=2 缓存破坏:重导出加了 WalkLoop 等骨骼动画
  pocoyo: "/models/xy_char_pocoyo.glb", // Pocoyo 主角(专用 rig 负责修正 FBX 轴向与落脚点)
  // Batch 5 · 村落建筑(三风格混搭)
  houseCottage: "/models/xy_house_cottage.glb",
  houseLoft: "/models/xy_house_loft.glb",
  houseRound: "/models/xy_house_round.glb",
  houseShop: "/models/xy_house_shop.glb",
  houseCafe: "/models/xy_house_cafe.glb",
  houseLightkeeper: "/models/xy_house_lightkeeper.glb",
  houseMachiya: "/models/xy_house_machiya.glb",
  houseVilla: "/models/xy_house_villa.glb",
  // Batch 6 · 地形
  terrArchrock: "/models/xy_terrain_archrock.glb",
  terrSeastack: "/models/xy_terrain_seastack.glb",
  terrCliff: "/models/xy_terrain_cliff.glb",
  terrCave: "/models/xy_terrain_cave.glb",
  terrTerrace: "/models/xy_terrain_terrace.glb",
  terrStairs: "/models/xy_terrain_stairs.glb",
  terrIsle: "/models/xy_terrain_isle.glb",
  // Batch 6 · 海滩
  beachTidepool: "/models/xy_beach_tidepool.glb",
  beachStarfish: "/models/xy_beach_starfish.glb",
  beachDriftwood: "/models/xy_beach_driftwood.glb",
  beachSandcastle: "/models/xy_beach_sandcastle.glb",
  beachCoral: "/models/xy_beach_coral.glb",
  beachDeckchair: "/models/xy_beach_deckchair.glb",
  beachSurfboard: "/models/xy_beach_surfboard.glb",
  beachTikihut: "/models/xy_beach_tikihut.glb",
  beachDunegrass: "/models/xy_beach_dunegrass.glb",
  beachBall: "/models/xy_beach_ball.glb",
  // Batch 8 · 海滩精修与彩蛋
  beachPalm: "/models/xy_beach_palm.glb",
  beachRowboat: "/models/xy_beach_rowboat.glb",
  beachFirepit: "/models/xy_beach_firepit.glb",
  beachSign: "/models/xy_beach_sign.glb",
  beachBucket: "/models/xy_beach_bucket.glb",
  beachConch: "/models/xy_beach_conch.glb",
  beachJelly: "/models/xy_beach_jelly.glb",
  beachCrab: "/models/xy_beach_crab.glb",
  beachTurtle: "/models/xy_beach_turtle.glb",
  beachChest: "/models/xy_beach_chest.glb",
  beachFootprint: "/models/xy_beach_footprint.glb",
  // Batch 9 · 灵物(彩蛋小动物 + 祈愿铃)
  critterFox: "/models/xy_critter_fox.glb",
  critterCat: "/models/xy_critter_cat.glb",
  critterOwl: "/models/xy_critter_owl.glb",
  critterFish: "/models/xy_critter_fish.glb",
  critterBell: "/models/xy_critter_bell.glb",
  // Batch 6 · 海水(发光/可情绪 tint)
  waterWave: "/models/xy_water_wave.glb",
  waterFoam: "/models/xy_water_foam.glb",
  waterSplash: "/models/xy_water_splash.glb",
  waterSurface: "/models/xy_water_surface.glb",
  waterFall: "/models/xy_water_fall.glb",
  waterRing: "/models/xy_water_ring.glb",
  // Batch 7 · 岛上设施
  isleWell: "/models/xy_isle_well.glb",
  isleBridge: "/models/xy_isle_bridge.glb",
  isleGazebo: "/models/xy_isle_gazebo.glb",
  isleSwing: "/models/xy_isle_swing.glb",
  isleHammock: "/models/xy_isle_hammock.glb",
  islePergola: "/models/xy_isle_pergola.glb",
  isleWindchime: "/models/xy_isle_windchime.glb",
  isleTent: "/models/xy_isle_tent.glb",
  isleStall: "/models/xy_isle_stall.glb",
  isleStepstones: "/models/xy_isle_steppingstones.glb",
  isleLookout: "/models/xy_isle_lookout.glb",
  // 自然 kit(替换程序化植被,走 InstancedMesh-from-glb)
  natPine: "/models/xy_nat_tree_pine.glb",
  natBroad: "/models/xy_nat_tree_broadleaf.glb",
  natBush: "/models/xy_nat_bush.glb",
  natFlowers: "/models/xy_nat_flowers.glb",
  natRock: "/models/xy_nat_rock_a.glb",
  natLotus: "/models/xy_nat_lotus.glb",
  natMushroom: "/models/xy_nat_mushroom.glb",
  natReed: "/models/xy_nat_reed.glb",
  natCropSprout: "/models/xy_nat_crop_sprout.glb",
  // 小镇道具(替换程序化点缀)
  townParasol: "/models/xy_town_parasol.glb",
  townTowel: "/models/xy_town_towel.glb",
  townBuoy: "/models/xy_town_buoy.glb",
  townLamppost: "/models/xy_town_lamppost.glb",
  townSignpost: "/models/xy_town_signpost.glb",
  townMailbox: "/models/xy_town_mailbox.glb",
  townBench: "/models/xy_town_bench.glb",
  townFence: "/models/xy_town_fence.glb",
  townCrate: "/models/xy_town_crate.glb",
  townHaystack: "/models/xy_town_haystack.glb",
  qiche: "/models/qiche.glb", // 汽车(Porsche 911 Targa,原生约 98 长 → scale 0.05;轮底在原点下 15.47 → 落地偏移 +0.77)
  rhododendron: "/models/37867525-0d78-4134-9833-96758ac30bac.glb", // 杜鹃花(写实灌木,原生约 2 单位,底在原点下 1.0)
  bathhouse: "/models/80f108c7-cffb-40c7-a80d-1ecfc4507336.glb", // 罗马浴场建筑群(原生约 1 单位扁平,底在原点下 0.03)
  townblock: "/models/688215b008dc48e8a47295ef1211afb6.glb", // 建筑街区(原生约 35×38×42,底在原点下 17.5)
  skyLantern: "/models/kmd.glb", // 天灯(放飞升空)
} as const;
// 重模型(写实地标/车/天灯)不参与首屏预载:各自在独立 Suspense 边界内按需加载。
// 桌面端预载近百个小模型,移动端跳过顶层预载,避免导入探索 chunk 时触发一波请求/解析尖峰。
const HEAVY_DEFER = new Set<string>([
  MODELS.bathhouse,
  MODELS.rhododendron,
  MODELS.townblock,
  MODELS.qiche,
  MODELS.skyLantern,
  MODELS.companion, // 灯塔精灵 4.4M：移出首屏关键路径，世界先可走、精灵随后淡入（见下方独立 Suspense）
]);
const shouldPreloadLightModels = !isCoarsePointerDevice();
Object.values(MODELS).forEach((u) => {
  if (shouldPreloadLightModels && !HEAVY_DEFER.has(u)) useGLTF.preload(u);
});

// 首页空闲(或桌面 hover「上岛走走」)时由 Home 调用(import 本模块即已 preload 近百个非重小模型 = 进岛门所需)。
// 触摸设备跳过重模型后台预热:移动端最容易在点按、横屏、Canvas 挂载时与 GLB 解析撞车。
// 桌面再按「小→大」错峰交给 drei preload,避免手动 fetch 和 useGLTF 同时请求同一个重模型。
// 这个工具导出与默认组件同文件是有意的(依赖本模块的 MODELS 表),HMR fast-refresh 的告警在此豁免。
let _heavyWarmStarted = false;
let _exploreActive = false;            // 用户已进岛 → 立刻停后台预热,把 CPU/带宽全让给进岛自身的加载
let _warmAbort: AbortController | null = null;

// ExploreMode 进/出岛时调用:进岛即停后台重模型预热——否则解析会与进岛时的场景挂载
// (草丛 + 地形几何 + 模型解析)抢资源,反而让进岛更卡。
function setExploreActive(active: boolean): void {
  _exploreActive = active;
  if (active) _warmAbort?.abort();
}

function isCoarsePointerDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return Boolean(
    window.matchMedia?.("(pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0 ||
    /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua),
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function prefetchExploreAssets(): void {
  if (_heavyWarmStarted) return; // 幂等:首页 idle 与 hover/点按可能各调一次
  _heavyWarmStarted = true;
  if (isCoarsePointerDevice()) return;
  useGLTF.preload(MODELS.companion); // 精灵进岛即在 → 最高优先,立即预热
  // 写实/较重大件按「小→大」串行预热(skyLantern 2.9M → 浴场 28M 最后)
  const order = [MODELS.skyLantern, MODELS.townblock, MODELS.qiche, MODELS.rhododendron, MODELS.bathhouse];
  _warmAbort = new AbortController();
  const sig = _warmAbort.signal;
  void (async () => {
    // 先让模块顶层 preload 的近百小模型(进岛门所需关键件)跑在前头,再开始串行预热重地标 → 真正「按序」、不抢关键路径
    await new Promise((res) => setTimeout(res, 600));
    for (const url of order) {
      if (_exploreActive || sig.aborted) return; // 已进岛 → 停止,让进岛优先(其余重模型进岛后各自 Suspense 流式)
      try {
        useGLTF.preload(url);                            // 交 drei 拉取并解析入缓存
        await new Promise((res) => setTimeout(res, 900)); // 给解析/主线程喘息,再起下一个
      } catch {
        /* abort 或单个失败:不影响后续与进岛(进岛仍可各自 Suspense 流式) */
      }
    }
  })();
}

// 陪伴精灵:跟随玩家漂浮的小灵兽(强化「情感陪伴」)。保留 glb 原材质(半透+发光),不套 toon。
// 说话时：嘴部按音量开合（程序化合成「说话」动画，glb 无专门片段）+ 灯塔光随情绪变色。
// 两种「只为主人」的状态（程序化，不依赖 glb 新片段）：
//   singing=哼唱 → 左右打拍子摇摆 + 嘴随拍开合 + 头顶飘♪♫ + 灯随拍脉动；
//   sleeping=打瞌睡 → 整体下沉、起伏放慢、微微低头、不再追看玩家、灯转暗 + 头顶飘 Z，并循环播 SleepFloat。
function Companion({
  posRef,
  action,
  emotion,
  singing,
  sleeping,
  chatter,
  onInteract,
  collidersRef,
}: {
  posRef: React.RefObject<THREE.Vector3>;
  action: CompanionActionSignal | null;
  emotion?: string;
  singing?: boolean;
  sleeping?: boolean;
  chatter?: { text: string; nonce: number } | null;
  onInteract?: () => void;
  collidersRef?: React.RefObject<Map<string, Collider[]> | null>;
}) {
  const { scene, animations } = useGLTF(MODELS.companion);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = false;
      m.receiveShadow = false;
      m.frustumCulled = false;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((material) => {
        const mat = material as THREE.MeshStandardMaterial;
        if (!mat) return;
        if (mat.emissive && (mat.emissive.r || mat.emissive.g || mat.emissive.b)) mat.toneMapped = false;
        if (mat.transparent) mat.depthWrite = false;
      });
    });
    return c;
  }, [scene]);
  const ref = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  // 嘴部/表情节点：说话时按音量开合，合成「说话」动画（glb 无 Speak 片段，靠程序化）
  const mouthRef = useRef<THREE.Object3D[]>([]);
  const yaw = useRef(0); // 精灵朝向(平滑看向玩家,带角度环绕),避免机械摆头
  // 嘴部节点原始 scale，开合时围绕它缩放，不破坏模型默认比例
  const mouthBaseScale = useRef<THREE.Vector3[]>([]);
  useLayoutEffect(() => {
    const names = ["XYPS_tiny_smile_left", "XYPS_tiny_smile_right", "XYPS_tiny_nose"];
    const found: THREE.Object3D[] = [];
    const base: THREE.Vector3[] = [];
    names.forEach((n) => {
      const node = obj.getObjectByName(n);
      if (node) { found.push(node); base.push(node.scale.clone()); }
    });
    mouthRef.current = found;
    mouthBaseScale.current = base;
  }, [obj]);
  const { actions, mixer } = useAnimations(animations, ref);
  useEffect(() => {
    const idle = actions.IdleLoop;
    if (!idle) return;
    idle.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.25).play();
    return () => {
      idle.fadeOut(0.2);
    };
  }, [actions]);
  useEffect(() => {
    if (!action || action.name === "IdleLoop") return;
    const clip = actions[action.name] ?? actions[companionFallbackAction(action.name)];
    const idle = actions.IdleLoop;
    if (!clip) return;
    idle?.fadeOut(0.12);
    clip.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.08).play();
    const done = () => {
      clip.fadeOut(0.15);
      idle?.reset().fadeIn(0.2).play();
    };
    mixer.addEventListener("finished", done);
    return () => {
      mixer.removeEventListener("finished", done);
    };
  }, [action, actions, mixer]);
  // 预解析目标情绪色，useFrame 里只做 lerp，避免每帧 new Color / parse
  const targetColor = useMemo(() => new THREE.Color(companionLightColor(emotion)), [emotion]);
  const baseColor = useMemo(() => new THREE.Color(COMPANION_LIGHT_BASE), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const singEase = useRef(0); // 哼唱状态缓动 0..1（避免亮灭/摇摆硬切）
  const sleepEase = useRef(0); // 瞌睡状态缓动 0..1
  useFrame((s, dt) => {
    mixer.update(dt);
    const p = posRef.current;
    const g = ref.current;
    if (!p || !g) return;
    const t = s.clock.elapsedTime;
    const k = Math.min(1, dt * 2.5);
    // 哼唱 / 瞌睡缓动到目标（0..1），下面各项据此插值，状态切换不硬跳
    singEase.current += ((singing ? 1 : 0) - singEase.current) * Math.min(1, dt * 3);
    sleepEase.current += ((sleeping ? 1 : 0) - sleepEase.current) * Math.min(1, dt * 2.2);
    const sing = singEase.current;
    const sleep = sleepEase.current;
    const beat = Math.sin(t * 3.4); // 哼唱拍子
    // 说话音量(0..1)：云端音频接 AnalyserNode 采真实振幅，原生降级用节奏模拟。
    // 据此让精灵随声「轻轻颤」+ 灯塔光随声脉动 —— 眼睛能看见「它在说话」。
    const lvl = getCompanionLevel();
    const talk = Math.min(1, lvl);
    // 漂浮高度：睡着下沉 + 起伏放慢；哼唱时随拍轻跳
    const bob = (Math.sin(t * 1.5) * 0.14 + Math.sin(t * 0.73) * 0.07) * (1 - sleep * 0.7);
    // 漂浮锚点:玩家身侧 + 缓慢公转 → 精灵在身边轻轻游弋,不再钉死在固定一点
    const orbit = t * 0.5;
    let ax = p.x + 1.0 + Math.cos(orbit) * 0.4;
    let az = p.z + 1.0 + Math.sin(orbit * 0.9) * 0.4;
    // 防穿模:精灵的目标点也走玩家那套碰撞体推出 → 不再扎进树/房子/地标;
    // 漂浮高度按「精灵脚下」地面(含地标抬升台坪)算,而非玩家脚下 → 跨坡/上台也不插进地里。
    _compTmp.set(ax, 0, az);
    _compVel.x = 0;
    _compVel.z = 0;
    resolveCollisions(collidersRef?.current ?? null, _compTmp, _compVel, 0.7);
    ax = _compTmp.x;
    az = _compTmp.z;
    // 竖直保底:精灵脚下地面取「自己脚下地形 / 地标抬升台坪 / 玩家脚下高度」三者最高。
    // 关键修穿模:玩家站在抬升平台/台阶/栈道上时,exGroundY(精灵处) 仍返回底层地面 → 精灵浮在底层+1.5 → 扎进平台;
    // 用玩家实际脚下高度 p.y 兜底,精灵就不会沉到玩家所在台面之下。
    const ay = Math.max(groundYWithRoad(ax, az).y, landmarkGroundLift(ax, az), p.y) + 1.5 - sleep * 0.72 + bob + talk * 0.12 + sing * Math.abs(beat) * 0.12;
    g.position.x += (ax - g.position.x) * k;
    g.position.z += (az - g.position.z) * k;
    g.position.y += (ay - g.position.y) * Math.min(1, dt * 3.0);
    // 关键防穿模:只解「目标点」不够——精灵以 k≈dt*2.5 慢跟随 + 直线插值,lerp 后的实际渲染位置会斜穿过树/房子。
    // 对 lerp 之后的实际位置本身再推一次碰撞 → 任何一帧精灵中心都被挤到碰撞体外,不再插进模型。
    _compTmp.set(g.position.x, 0, g.position.z);
    _compVel.x = 0; _compVel.z = 0;
    resolveCollisions(collidersRef?.current ?? null, _compTmp, _compVel, 0.7);
    g.position.x = _compTmp.x;
    g.position.z = _compTmp.z;
    // 竖直防穿模(修「地面/车道往下沉」):y 是慢 lerp(dt*3),玩家走上路面/坡时地面升高、精灵 y 跟不上 →
    // 一瞬扎进地面/车道。每帧按精灵「实际所在位置」的地面(取地形/地标台坪/玩家脚下三者最高)把 y 钳到地面之上一点,
    // 任何一帧都不沉下去。0.9 是身体半径余量(睡着低伏时也不扎地)。
    const gGround = Math.max(groundYWithRoad(g.position.x, g.position.z).y, landmarkGroundLift(g.position.x, g.position.z), p.y);
    if (g.position.y < gGround + 0.9) g.position.y = gGround + 0.9;
    // 朝向:缓缓看向玩家(陪伴感);睡着时不再追看,停在当前朝向
    if (sleep < 0.5) {
      const faceYaw = Math.atan2(p.x - g.position.x, p.z - g.position.z);
      let dyaw = faceYaw - yaw.current;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      yaw.current += dyaw * Math.min(1, dt * 2.2);
    }
    g.rotation.y = yaw.current + Math.sin(t * 0.5) * 0.18 + Math.sin(t * 22) * 0.05 * talk;
    // 侧倾:待机轻摆;哼唱随拍左右打拍子(明显);睡着收住
    g.rotation.z = Math.sin(t * 1.3) * 0.07 * (1 - sleep) + Math.sin(t * 18) * 0.04 * talk + beat * 0.22 * sing;
    // 俯仰:待机轻摆;睡着微微低头
    g.rotation.x = Math.sin(t * 0.95 + 1.0) * 0.05 * (1 - sleep) + sleep * 0.34;
    // 嘴部「说话 / 哼唱」动画：按音量 + 哼唱按拍子开合，停了缓回原比例
    const mouths = mouthRef.current;
    const singMouth = sing * (0.5 + Math.abs(beat) * 0.5);
    for (let i = 0; i < mouths.length; i++) {
      const node = mouths[i];
      const base = mouthBaseScale.current[i];
      if (!node || !base) continue;
      const open = Math.min(1, talk * (0.7 + Math.abs(Math.sin(t * 14)) * 0.3) + singMouth); // 0..1
      node.scale.y = base.y * (1 + open * 0.55);
      node.scale.x = base.x * (1 - open * 0.12);
    }
    if (lightRef.current) {
      // 灯塔光：待机呼吸 + 说话加亮；哼唱随拍脉动；睡着转暗
      lightRef.current.intensity = (1.25 + Math.sin(t * 2.4) * 0.25 + talk * 2.2) * (1 - sleep * 0.72) + sing * (0.6 + Math.abs(beat) * 0.9);
      // 说话时颜色渐变到情绪色，停了缓回暖白；talk 权重做平滑过渡
      tmpColor.copy(baseColor).lerp(targetColor, Math.min(1, talk * 1.4));
      lightRef.current.color.lerp(tmpColor, Math.min(1, dt * 4));
    }
  });
  // 「主动陪聊」头顶气泡：收到新的一句(nonce 变化)就显示，几秒后自动收起。
  const [bubble, setBubble] = useState<string | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!chatter || !chatter.text) return;
    setBubble(chatter.text);
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), 4800);
    return () => { if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatter?.nonce]);
  return (
    <group
      ref={ref}
      position={[1.15, 1.5, 1.15]}
      onClick={(e) => {
        e.stopPropagation();
        onInteract?.();
      }}
    >
      <primitive object={obj} scale={0.24} />
      <pointLight ref={lightRef} color="#ffe2a0" intensity={1.4} distance={4.2} decay={1.6} />
      {bubble && (
        <Html position={[0, 1.35, 0]} center distanceFactor={9} zIndexRange={[40, 0]} style={{ pointerEvents: "none" }} prepend>
          <div
            style={{
              width: 168,
              textAlign: "center",
              whiteSpace: "normal",
              transform: "translateY(-50%)",
              background: "rgba(12,22,30,0.7)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              color: "#fdf4e3",
              font: '500 13px/1.5 -apple-system, system-ui, "PingFang SC", sans-serif',
              padding: "7px 13px",
              borderRadius: 13,
              border: "1px solid rgba(255,226,160,0.34)",
              boxShadow: "0 6px 18px rgba(0,0,0,0.3)",
            }}
          >
            <span style={{ opacity: 0.66, marginRight: 4 }}>✦</span>
            {bubble}
          </div>
        </Html>
      )}
    </group>
  );
}

// 精灵说话时，灯塔光偏向当前情绪色（开心暖金、低落冷蓝…），停了回归暖白。
// 颜色取自 sceneMap 各情绪 palette 的 celestial/暖光基调，克制温柔。
const COMPANION_EMOTION_LIGHT: Record<string, string> = {
  happy: "#ffd27a",
  calm: "#aef0e6",
  anxious: "#c9d4e0",
  sad: "#9fb4e0",
  tired: "#9fb4f0",
  lonely: "#cdbae6",
  angry: "#e6a08a",
  helpless: "#9fb2c6",
};
const COMPANION_LIGHT_BASE = "#ffe2a0"; // 待机暖白光（与既有一致）

function companionLightColor(emotion?: string): string {
  if (!emotion) return COMPANION_LIGHT_BASE;
  return COMPANION_EMOTION_LIGHT[emotion] ?? COMPANION_LIGHT_BASE;
}

function companionFallbackAction(name: CompanionAnimation): CompanionAnimation {
  if (name === "TalkListen") return "Worried";
  if (name === "SleepFloat") return "IdleLoop";
  return "Joyful";
}

function normalizeCompanionAnimation(value: string | undefined): CompanionAnimation {
  const allowed: CompanionAnimation[] = ["IdleLoop", "Joyful", "Worried", "FeedTreat", "TalkListen", "BondGlow", "SleepFloat", "SecretTwirl", "SingSong"];
  return allowed.includes(value as CompanionAnimation) ? (value as CompanionAnimation) : "BondGlow";
}

// 轻飘的 glb 道具(风筝等):上下浮 + 轻摆。
function FloatSway({ url, grad, position, scale, amp = 0.4, speed = 1.0, tint, baseRotation = [0, 0, 0] }: {
  url: string; grad?: THREE.Texture; position: [number, number, number]; scale?: number; amp?: number; speed?: number; tint?: string; baseRotation?: [number, number, number];
}) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => toonifyScene(scene, grad, tint), [scene, grad, tint]);
  const ref = useRef<THREE.Group>(null);
  const baseY = position[1];
  useFrame((s) => {
    const g = ref.current; if (!g) return;
    const t = s.clock.elapsedTime;
    g.position.y = baseY + Math.sin(t * speed) * amp;
    g.rotation.x = baseRotation[0];
    g.rotation.y = baseRotation[1] + Math.sin(t * speed * 0.5) * 0.18;
    g.rotation.z = baseRotation[2] + Math.sin(t * speed * 0.8) * 0.22;
  });
  return <group ref={ref} position={position} rotation={baseRotation}><primitive object={obj} scale={scale} /></group>;
}

// 写实精模:克隆但保留原始 PBR 材质(只关阴影),不做 toon 平涂
function rawClone(src: THREE.Object3D): THREE.Object3D {
  const root = src.clone(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; }
  });
  return root;
}

type ToonTint = string | {
  default?: string;
  materials?: Record<string, string>;
  emissiveIntensity?: number;
};

function tintForMaterial(tint: ToonTint | undefined, materialName: string): string | undefined {
  if (!tint) return undefined;
  if (typeof tint === "string") return tint;
  const normalized = materialName.toLowerCase();
  return tint.materials?.[materialName] ?? tint.materials?.[normalized] ?? tint.default;
}

function toonifyScene(src: THREE.Object3D, grad?: THREE.Texture, tint?: ToonTint): THREE.Object3D {
  const root = src.clone(true);
  const cache = new Map<THREE.Material, THREE.Material>();
  const conv = (m: THREE.Material): THREE.Material => {
    const hit = cache.get(m);
    if (hit) return hit;
    const std = m as THREE.MeshStandardMaterial;
    const base = std.color ? std.color.clone() : new THREE.Color("#ffffff");
    const name = m.name || "";
    let out: THREE.Material;
    if (/emissive/i.test(name)) {
      const lit = std.emissive && (std.emissive.r || std.emissive.g || std.emissive.b);
      const tintColor = tintForMaterial(tint, name);
      const col = tintColor ? new THREE.Color(tintColor) : lit ? std.emissive.clone() : base;
      const emissiveIntensity = typeof tint === "string" ? 2.2 : tint?.emissiveIntensity ?? 2.2;
      out = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity, toneMapped: false, transparent: std.transparent, opacity: std.opacity ?? 1 });
    } else {
      out = new THREE.MeshToonMaterial({ color: base, gradientMap: grad ?? null });
    }
    cache.set(m, out);
    return out;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material as THREE.Material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
  return root;
}

// 把「单网格多材质」glb 转成可实例化几何:烘焙世界矩阵 + modelScale 进几何(保留材质组),材质 toon 化。
// 配合 InstancedField 用一个 InstancedMesh 批量画几百株植被/道具(每材质组一次 draw call),不逐个 clone → 不掉帧。
function glbInstanceGeo(scene: THREE.Object3D, grad: THREE.Texture, modelScale = 1): { geometry: THREE.BufferGeometry; material: THREE.Material } | null {
  // GLTFLoader 把多 primitive 拆成多个子 Mesh。把它们「全部」烘焙世界矩阵后合并成一个
  // 带顶点色的几何(每 primitive 烤进其材质色),配单一 vertexColors toon 材质 → 一个 InstancedMesh
  // 一次绘制、完整多色,且不踩多材质 InstancedMesh 的坑。
  const root = scene.clone(true);
  root.scale.setScalar(modelScale);
  root.updateMatrixWorld(true);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const tmp = new THREE.Color();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const nor = g.getAttribute("normal") as THREE.BufferAttribute | undefined;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const lit = mat?.emissive && (mat.emissive.r || mat.emissive.g || mat.emissive.b) && /emissive/i.test(mat.name || "");
    tmp.copy(lit ? mat.emissive : mat?.color ?? new THREE.Color("#ffffff"));
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (nor) normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      colors.push(tmp.r, tmp.g, tmp.b);
    }
    g.dispose();
  });
  if (!positions.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length === positions.length) geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  if (normals.length !== positions.length) geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad ?? null });
  return { geometry: geo, material };
}

function GltfProp({
  url,
  grad,
  position,
  rotation,
  scale,
  tint,
  spin,
  raw,
}: {
  url: string;
  grad?: THREE.Texture;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  tint?: ToonTint;
  spin?: { node: string; speed: number; axis?: "x" | "y" | "z" }; // 让某个子节点绕自身局部轴自转(如风车 Blades)
  raw?: boolean; // 保留 glb 原始写实材质(不 toon 化)——给写实精模用(汽车/植物/建筑)
}) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => (raw ? rawClone(scene) : toonifyScene(scene, grad, tint)), [scene, grad, tint, raw]);
  const spinNode = useMemo(() => (spin ? obj.getObjectByName(spin.node) : undefined), [obj, spin]);
  useFrame((_, delta) => {
    if (!spinNode || !spin) return;
    const amount = delta * spin.speed;
    if (spin.axis === "x") spinNode.rotateX(amount);
    else if (spin.axis === "y") spinNode.rotateY(amount);
    else spinNode.rotateZ(amount);
  });
  return <primitive object={obj} position={position} rotation={rotation} scale={scale} />;
}

function GroundProp({ url, grad, x, z, scale = 1, rot = 0, yOffset = 0, tint }: {
  url: string;
  grad: THREE.Texture;
  x: number;
  z: number;
  scale?: number;
  rot?: number;
  yOffset?: number;
  tint?: string;
}) {
  return <GltfProp url={url} grad={grad} tint={tint} position={[x, exGroundY(x, z) + yOffset, z]} rotation={[0, rot, 0]} scale={scale} />;
}

type RitualArtifactKey = keyof typeof ARTIFACT_3D_REGISTRY;
type RitualArtifactPlacement = {
  key: RitualArtifactKey;
  x: number;
  z: number;
  rot?: number;
  scale?: number;
};

function RitualArtifactProp({ item, grad }: { item: RitualArtifactPlacement; grad: THREE.Texture }) {
  const entry = ARTIFACT_3D_REGISTRY[item.key];
  if (entry.kind !== "glb" || !entry.url) return null;

  const y = Math.max(exGroundY(item.x, item.z), 0) + (entry.yOffset ?? 0);
  const scale = item.scale ?? entry.scale;

  return (
    <GltfProp
      url={entry.url}
      grad={grad}
      position={[item.x, y, item.z]}
      rotation={[0, item.rot ?? 0, 0]}
      scale={scale}
    />
  );
}

// 可开的汽车:读模块级 carState,逐帧更新位置/朝向;toon 材质(传 grad,不再 raw)
function DrivableCar({ grad }: { grad: THREE.Texture }) {
  const g = useRef<THREE.Group>(null);
  const lights = useRef<THREE.Group>(null);
  const headSpot = useRef<THREE.SpotLight>(null); // 远光灯:朝前下方的前照 SpotLight
  const headSpotTarget = useRef<THREE.Object3D>(null);
  const roll = useRef(0);
  const clk = useRef(0);
  const gy = useRef(0); // 平滑后的车身贴地高度(跨帧阻尼,消除地形抖动)
  // —— 车尾尾焰(与林间土路 DriveScene 同款):3 层火焰 + 脉动暖光 + 迸射火星 + 起步/增压爆燃 ——
  const flameL = useRef<THREE.Group>(null);
  const flameR = useRef<THREE.Group>(null);
  const flame = useRef(0); // 火焰强度 0→1(平滑)
  const flameLight = useRef<THREE.PointLight>(null);
  const lowTier = getPerfTier() === "low";
  const flameHaloGeo = useMemo(() => new THREE.ConeGeometry(0.3, 1.55, 14, 1, true), []);
  const flameOuterGeo = useMemo(() => new THREE.ConeGeometry(0.2, 1.28, 14, 1, true), []);
  const flameInnerGeo = useMemo(() => new THREE.ConeGeometry(0.11, 0.9, 14, 1, true), []);
  const flameHaloMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ff3a06", transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
  const flameOuterMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ff6a1a", transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
  const flameInnerMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffe6a6", transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
  // —— 远光灯素材:可见光柱(顶点色自灯泡端向远端渐隐的 additive 圆锥)+ 灯泡 + 柔光晕,左右共享几何/材质 ——
  const beamGeo = useMemo(() => {
    const len = 12, r = 1.85;
    const cone = new THREE.ConeGeometry(r, len, 20, 1, true);
    cone.translate(0, -len / 2, 0); // 锥尖移到原点
    cone.rotateX(-Math.PI / 2);     // 轴转到 +Z:锥尖锚在灯泡、粗口朝前
    const pos = cone.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const a = Math.pow(Math.max(0, 1 - pos.getZ(i) / len), 1.1) * 0.5 + 0.05; // 近灯柔亮、远端渐隐(削平高光峰)
      col[i * 3] = a; col[i * 3 + 1] = a * 0.95; col[i * 3 + 2] = a * 0.8;
    }
    cone.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return cone;
  }, []);
  const beamMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false }), []);
  const bulbGeo = useMemo(() => new THREE.SphereGeometry(0.17, 14, 12), []);
  const bulbMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#fff2d4", toneMapped: false }), []);
  const haloGeo = useMemo(() => new THREE.SphereGeometry(0.36, 12, 10), []);
  const haloMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffe2b0", transparent: true, opacity: 0.36, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), []);
  const sparks = useRef<THREE.InstancedMesh>(null);
  const sparkArr = useRef(Array.from({ length: 44 }, () => ({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, sz: 0 })));
  const sph = useRef(0);
  const sparkAcc = useRef(0);
  const burst = useRef(0); // 起步/增压点火爆燃(先放大再回落)
  const prevGas = useRef(false);
  const prevBoost = useRef(false);
  const sparkGeo = useMemo(() => new THREE.SphereGeometry(1, 6, 5), []);
  const sparkMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffc24a", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), []);
  const sparkMtx = useMemo(() => new THREE.Matrix4(), []);
  useEffect(() => () => { flameHaloGeo.dispose(); flameOuterGeo.dispose(); flameInnerGeo.dispose(); flameHaloMat.dispose(); flameOuterMat.dispose(); flameInnerMat.dispose(); sparkGeo.dispose(); sparkMat.dispose(); beamGeo.dispose(); beamMat.dispose(); bulbGeo.dispose(); bulbMat.dispose(); haloGeo.dispose(); haloMat.dispose(); }, [flameHaloGeo, flameOuterGeo, flameInnerGeo, flameHaloMat, flameOuterMat, flameInnerMat, sparkGeo, sparkMat, beamGeo, beamMat, bulbGeo, bulbMat, haloGeo, haloMat]);
  useEffect(() => { if (headSpot.current && headSpotTarget.current) headSpot.current.target = headSpotTarget.current; }, []); // 远光灯朝向锚到前下方目标点
  useFrame((_, dt) => {
    const o = g.current;
    if (!o) return;
    clk.current += dt;
    // 贴地高度用「路地面」(近路处压平) + 跨帧阻尼 → 在路上又稳又顺,不再随丘陵颠簸
    const targetGY = groundYWithRoad(carState.x, carState.z).y;
    gy.current += (targetGY - gy.current) * Math.min(1, dt * 12);
    const bob = carState.driving && Math.abs(carState.speed) > 0.5 ? Math.sin(clk.current * 13) * 0.025 : 0; // 悬挂微颠(幅值小)
    o.position.set(carState.x, gy.current + CAR_Y_OFFSET + bob, carState.z);
    // 顺着路面坡度躺平(用路地面有限差分求法线,analytic 无需射线)→ 缓上下坡自然俯仰,路上接近水平
    const e = 1.8;
    const up = _carUp.set(groundYWithRoad(carState.x - e, carState.z).y - groundYWithRoad(carState.x + e, carState.z).y, 2 * e, groundYWithRoad(carState.x, carState.z - e).y - groundYWithRoad(carState.x, carState.z + e).y).normalize();
    const fwd = _carFwd.set(Math.sin(carState.heading), 0, Math.cos(carState.heading));
    fwd.addScaledVector(up, -fwd.dot(up));
    if (fwd.lengthSq() < 1e-6) fwd.set(Math.sin(carState.heading), 0, Math.cos(carState.heading));
    fwd.normalize();
    const right = _carRight.crossVectors(up, fwd).normalize();
    const tRoll = -carState.turn * 0.11 * Math.max(-1, Math.min(1, carState.speed / 8)); // 转向侧倾(略收敛,更稳)
    roll.current += (tRoll - roll.current) * Math.min(1, dt * 7);
    const q = _carQ.setFromRotationMatrix(_carMtx.makeBasis(right, up, fwd));
    q.multiply(_carQ2.setFromAxisAngle(_CAR_ROLL_AXIS, roll.current));
    o.quaternion.slerp(q, Math.min(1, dt * 8)); // 姿态阻尼,过弯/起伏不突兀
    if (lights.current) lights.current.visible = carState.driving && sceneEnv.night; // 车头灯:只在夜里亮

    // —— 车尾尾焰:踩油门(carState.throttle<0=前进给油)迸发 + 起步/增压爆燃 + 迸射火星 ——
    const driving = carState.driving;
    const boosting = driving && carState.boost;
    const want = driving && carState.throttle < 0 ? 1 : 0;
    const fk = want > flame.current ? dt * 16 : dt * 9; // 窜火快、收火稍慢
    flame.current += (want - flame.current) * Math.min(1, fk);
    const gasOn = want === 1;
    const gasEdge = gasOn && !prevGas.current;
    const boostEdge = boosting && !prevBoost.current;
    if (gasEdge) { burst.current = Math.max(burst.current, 0.8); playAccelRev(1); } // 踩油门「轰」一下
    if (boostEdge) { burst.current = 1.3; playAccelRev(1.7); emitCompanionEvent("drive_boost"); } // 增压:加速声更猛 + 精灵搭话
    prevGas.current = gasOn;
    prevBoost.current = boosting;
    burst.current = Math.max(0, burst.current - dt * 4.5);
    const fl = flame.current;
    const flB = Math.min(1.7, fl + burst.current); // 叠加爆燃后的有效火焰强度
    const showFlame = flB > 0.02;
    const flick = 0.8 + Math.sin(clk.current * 46) * 0.13 + Math.sin(clk.current * 22.7) * 0.07 + (Math.random() - 0.5) * 0.08;
    const frac = Math.min(1, Math.abs(carState.speed) / CAR_BOOST_SPEED);
    const flameLen = flB * flick * (0.88 + frac * 0.9) * (boosting ? 1.22 : 1);
    const flameWid = flB * (0.92 + flick * 0.22) * (boosting ? 1.12 : 1);
    if (flameL.current) { flameL.current.visible = showFlame; if (showFlame) flameL.current.scale.set(flameWid, flameWid, flameLen); }
    if (flameR.current) { flameR.current.visible = showFlame; if (showFlame) flameR.current.scale.set(flameWid, flameWid, flameLen); }
    if (flameLight.current) flameLight.current.intensity = flB * (10 + flick * 6);

    // 迸射火星:从两喷口向车后下方喷洒 additive 亮点;喷口世界坐标 = 车位 + heading 旋转后的局部偏移
    const spm = sparks.current;
    if (spm) {
      const arr = sparkArr.current;
      const baseY = gy.current + CAR_Y_OFFSET + 0.34; // 喷口世界高度(车身原点 + 局部 0.34)
      const EXZ = -1.95;
      const emitSpark = (sign: number, power: number) => {
        const p = arr[sph.current % arr.length];
        sph.current++;
        const back = (2 + Math.random() * 2.5 + (boosting ? 2 : 0)) * power; // 相对车向后喷
        const sideS = (Math.random() - 0.5) * 1.6 * power;
        const upS = (0.5 + Math.random() * 1.3) * power;
        p.x = carState.x + 0.46 * sign * Math.cos(carState.heading) + EXZ * Math.sin(carState.heading);
        p.z = carState.z - 0.46 * sign * Math.sin(carState.heading) + EXZ * Math.cos(carState.heading);
        p.y = baseY;
        p.vx = Math.sin(carState.heading) * (carState.speed - back) + Math.cos(carState.heading) * sideS;
        p.vz = Math.cos(carState.heading) * (carState.speed - back) - Math.sin(carState.heading) * sideS;
        p.vy = upS;
        p.life = 1;
        p.sz = (0.07 + Math.random() * 0.07) * (0.8 + power * 0.35);
      };
      if (gasEdge) for (let k = 0; k < 6; k++) emitSpark(k % 2 ? 1 : -1, 1.5); // 起步爆燃迸射一簇
      if (boostEdge) for (let k = 0; k < 10; k++) emitSpark(k % 2 ? 1 : -1, 1.9); // 增压点火更大一簇
      if (fl > 0.3 && gasOn) { // 持续喷火稳定发射(增压更密)
        sparkAcc.current += dt;
        const itv = boosting ? 0.012 : 0.024;
        let guard = 0;
        while (sparkAcc.current > itv && guard++ < 8) { sparkAcc.current -= itv; emitSpark(sph.current % 2 ? 1 : -1, 1); }
      }
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (p.life > 0) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 7 * dt; p.life -= dt * 2; }
        const sc = p.life > 0 ? p.sz * Math.max(0, Math.min(1, p.life * 1.4)) : 0;
        sparkMtx.makeScale(sc, sc, sc);
        sparkMtx.setPosition(p.x, p.y, p.z);
        spm.setMatrixAt(i, sparkMtx);
      }
      spm.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <>
      <group ref={g} position={[carState.x, groundYWithRoad(carState.x, carState.z).y + CAR_Y_OFFSET, carState.z]} rotation={[0, carState.heading, 0]}>
        <GltfProp url={MODELS.qiche} grad={grad} position={[CAR_FIT_X, 0, CAR_FIT_Z]} scale={CAR_SCALE} />
        <group ref={lights} visible={false}>
          {/* 灯泡:发光球 + additive 柔光晕 */}
          <mesh geometry={bulbGeo} material={bulbMat} position={[0.62, 0.6, 2.28]} />
          <mesh geometry={bulbGeo} material={bulbMat} position={[-0.62, 0.6, 2.28]} />
          <mesh geometry={haloGeo} material={haloMat} position={[0.62, 0.6, 2.3]} />
          <mesh geometry={haloGeo} material={haloMat} position={[-0.62, 0.6, 2.3]} />
          {/* 可见光柱:两束 additive 圆锥,锥尖锚在灯泡、向前下方投射(略外扩) */}
          <mesh geometry={beamGeo} material={beamMat} position={[0.62, 0.56, 2.34]} rotation={[0.15, 0.05, 0]} />
          <mesh geometry={beamGeo} material={beamMat} position={[-0.62, 0.56, 2.34]} rotation={[0.15, -0.05, 0]} />
          {/* 前照 SpotLight:朝前下方打出狭长光斑(替代原全向 pointLight 的圆形漏光),配近端补光照亮车头 */}
          <spotLight ref={headSpot} position={[0, 0.66, 2.3]} color="#ffeccb" intensity={lowTier ? 6 : 10} distance={lowTier ? 24 : 34} angle={0.58} penumbra={0.92} decay={1.5} />
          <object3D ref={headSpotTarget} position={[0, -2.4, 20]} />
          <pointLight color="#ffe9c0" intensity={1.8} distance={6} decay={1.7} position={[0, 0.5, 2.9]} />
        </group>
        {/* 车尾双喷尾焰:喷口锚在车尾(-Z),锥尖朝后;3 层(光晕/橙焰/白热焰芯) + 脉动暖光。visible/scale 由 useFrame 按油门驱动 */}
        <group ref={flameL} position={[-0.46, 0.34, -1.86]} visible={false}>
          <mesh geometry={flameHaloGeo} material={flameHaloMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.775]} />
          <mesh geometry={flameOuterGeo} material={flameOuterMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.64]} />
          <mesh geometry={flameInnerGeo} material={flameInnerMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.45]} />
        </group>
        <group ref={flameR} position={[0.46, 0.34, -1.86]} visible={false}>
          <mesh geometry={flameHaloGeo} material={flameHaloMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.775]} />
          <mesh geometry={flameOuterGeo} material={flameOuterMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.64]} />
          <mesh geometry={flameInnerGeo} material={flameInnerMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.45]} />
        </group>
        {!lowTier && <pointLight ref={flameLight} color="#ff7a2a" position={[0, 0.42, -2.0]} distance={11} decay={2} intensity={0} />}
      </group>
      {/* 车尾迸射火星(世界空间;踩油门/增压时从喷口喷洒,additive 自发光亮点) */}
      <instancedMesh ref={sparks} args={[sparkGeo, sparkMat, 44]} frustumCulled={false} />
    </>
  );
}

// 轮胎尘土:开车快跑时车后扬起的沙尘(世界空间留存,渐升渐扩渐淡;池循环复用)
function TireDust() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const N = 22;
  const geo = useMemo(() => new THREE.SphereGeometry(0.5, 6, 5), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#d8c7a2", transparent: true, opacity: 0.42, depthWrite: false }), []);
  const mm = useMemo(() => new THREE.Matrix4(), []);
  const puffs = useRef(Array.from({ length: N }, () => ({ x: 0, y: -999, z: 0, life: 0, vy: 0, sz: 0 })));
  const head = useRef(0);
  const acc = useRef(0);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame((_, dt) => {
    const m = ref.current; if (!m) return;
    if (carState.driving && Math.abs(carState.speed) > 6) {
      acc.current += dt;
      if (acc.current > 0.05) {
        acc.current = 0;
        const p = puffs.current[head.current % N]; head.current++;
        const side = (Math.random() - 0.5) * 1.1;
        p.x = carState.x - Math.sin(carState.heading) * 2.2 + Math.cos(carState.heading) * side; // 贴车尾
        p.z = carState.z - Math.cos(carState.heading) * 2.2 - Math.sin(carState.heading) * side;
        p.y = exGroundY(p.x, p.z) + 0.18; p.life = 1; p.vy = 0.25 + Math.random() * 0.3; p.sz = 0.42 + Math.random() * 0.4;
      }
    }
    for (let i = 0; i < N; i++) {
      const p = puffs.current[i];
      if (p.life > 0) { p.life -= dt * 1.4; p.y += p.vy * dt; p.vy *= 0.95; }
      const fade = p.life < 0.35 ? Math.max(0, p.life / 0.35) : 1;
      const s = p.life > 0 ? p.sz * (0.35 + (1 - p.life) * 0.8) * fade : 0;
      mm.makeScale(s, s, s); mm.setPosition(p.x, p.y, p.z); m.setMatrixAt(i, mm);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, N]} frustumCulled={false} />;
}

// 大地标地坪:平台顶取 footprint 范围内地形最高点,往下延伸填满起伏 → 建筑稳稳落在平台上(不悬空、不被埋、不歪)
// 地坪外缘另铺一圈「草坡裙边」:从 padTop(padR 处)向外、向下接到自然地形 →
// 消除地坪侧壁外露的竖直墙与「走过去陷下去/踩空/侧壁穿模」。玩家在裙边范围内贴地高度垫到 padTop。
const LANDMARK_SKIRT = 14; // 裙边外扩宽度(padR 之外再铺这么宽的缓坡草地,够接到周围地形)
function landmarkPadTop(cx: number, cz: number, padR: number): number {
  let m = exGroundY(cx, cz);
  for (let a = 0; a < 10; a++) {
    const ang = (a / 10) * Math.PI * 2;
    m = Math.max(m, exGroundY(cx + Math.cos(ang) * padR * 0.85, cz + Math.sin(ang) * padR * 0.85));
  }
  return m + 0.05;
}
// 三座大地标的(中心 / 地坪半径 / 坪顶高度)。保持模块级静态数据,让地形、草丛、贴地与渲染共用同一份高度。
const LANDMARK_PADS = [
  { x: BLOCK.x, z: BLOCK.z, padR: 7.5, padTop: landmarkPadTop(BLOCK.x, BLOCK.z, 7.5) },
  { x: MANOR.x, z: MANOR.z, padR: 9, padTop: landmarkPadTop(MANOR.x, MANOR.z, 9) },
  { x: BATH.x, z: BATH.z, padR: 10, padTop: landmarkPadTop(BATH.x, BATH.z, 10) },
] as const;
// 玩家/车贴地用:在任一地标地坪(+裙边)范围内,把地表高度抬到 padTop → 走上去稳稳落地,不陷下去。
// 越靠中心权重越高(到 padR 外缘 SKIRT 距离内线性过渡到 0),与裙边 mesh 的可见坡度一致。
function landmarkGroundLift(wx: number, wz: number): number {
  let lift = 0;
  for (const p of LANDMARK_PADS) {
    const dx = wx - p.x, dz = wz - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const edge = p.padR + LANDMARK_SKIRT;
    if (d <= p.padR) {
      lift = Math.max(lift, p.padTop);
    } else if (d < edge) {
      const t = 1 - (d - p.padR) / LANDMARK_SKIRT; // 外缘 0 → 内缘 1
      lift = Math.max(lift, p.padTop * t + exGroundY(wx, wz) * (1 - t));
    }
  }
  return lift;
}
// 散落物(树/石/灌木)避让:落在任一地标地坪或裙边缓坡上的点都拒收 →
// 杜绝「树长在裙边草坡上却按原地形贴地 → 沉进坡里/穿模」。LANDMARK_PADS 是模块级静态数据,
// 散落 useMemo 和地标渲染共用同一组地坪范围,不依赖挂载顺序。
function onLandmarkPad(wx: number, wz: number): boolean {
  for (const p of LANDMARK_PADS) {
    if (Math.hypot(wx - p.x, wz - p.z) < p.padR + LANDMARK_SKIRT) return true;
  }
  return false;
}
// 延迟挂载:进岛后过 ms 毫秒才渲染 children。给写实重地标(浴场 28M/街区/杜鹃/山庄)用 →
// 它们的 GltfProp 深 clone(大几何同步开销)从「进岛首帧」挪到「世界已显示、可走之后」,
// 错开几秒逐个到位 → 进岛瞬间只渲地形+小物件(轻),不再被重地标 clone 卡出长空白。
function DelayedMount({ ms, children }: { ms: number; children: React.ReactNode }) {
  const [show, setShow] = useState(ms <= 0);
  useEffect(() => {
    if (ms <= 0) {
      setShow(true);
      return;
    }
    setShow(false);
    const t = window.setTimeout(() => setShow(true), ms);
    return () => window.clearTimeout(t);
  }, [ms]);
  return show ? <>{children}</> : null;
}

// 运行时帧率「分级」自适应:平均帧率偏低时分两档降画质,保流畅。单向(不回弹,避免来回抖动;想恢复刷新即可)。
//   ① 轻度卡(FPS<46,移动时最常见的「有点掉帧」):先把 dpr 砍到 1 → 像素 −~30%,多数轻掉帧靠这步就回来,
//      且保住 Sobel 手绘风;
//   ② 仍重度卡(FPS<28):再关掉最贵的 Sobel 全屏后期 + dpr 进一步降到 0.85,优先保流畅。
// useFrame 只读 dt,仅在跨档时触发一次 setDpr/setState,符合「useFrame 不每帧 setState」红线。
function PerfWatch({ tier, onDegrade }: { tier: PerfTier; onDegrade: () => void }) {
  const setDpr = useThree((s) => s.setDpr);
  const stage = useRef(tier === "low" ? 1 : 0); // 0=满画质 1=降dpr 2=低dpr+关Sobel/继续降
  const acc = useRef({ t: 0, n: 0, mild: 0, hard: 0 });
  useFrame((_, dt) => {
    if (stage.current >= 2) return;
    const a = acc.current;
    a.t += dt;
    a.n += 1;
    if (a.t >= 1) { // 每秒评估一次平均帧率
      const fps = a.n / a.t;
      a.mild = fps < 46 ? a.mild + 1 : 0;
      a.hard = fps < 28 ? a.hard + 1 : 0;
      if (stage.current < 1 && a.mild >= 2) { stage.current = 1; setDpr(1); }   // 连续 2s 轻度卡 → 降 dpr
      if (a.hard >= 2) {
        stage.current = 2;
        setDpr(tier === "low" ? 0.75 : 0.85);
        onDegrade();
      } // 连续 2s 重度卡 → 再关 Sobel/低档继续降像素
      a.t = 0;
      a.n = 0;
    }
  });
  return null;
}

function LandmarkOnPad({ cfg, url, padR, grad, raw = true }: {
  cfg: { x: number; z: number; rot: number; scale: number; base: number };
  url: string;
  padR: number;
  grad: THREE.Texture;
  raw?: boolean; // 默认保留写实材质(浴场/街区);raw={false} 走 toon 卡通化(山庄复用村屋精模)
}) {
  const padTop = useMemo(() => landmarkPadTop(cfg.x, cfg.z, padR), [cfg, padR]);
  return (
    <group>
      <GltfProp url={url} raw={raw} grad={grad} position={[cfg.x, padTop + cfg.base * cfg.scale, cfg.z]} rotation={[0, cfg.rot, 0]} scale={cfg.scale} />
    </group>
  );
}

function InstancedField({ geo, material, items }: { geo: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; items: InstItem[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const d = new THREE.Object3D();
    items.forEach((it, i) => {
      d.position.set(it.p[0], it.p[1], it.p[2]);
      if (it.r) d.rotation.set(it.r[0], it.r[1], it.r[2]);
      else d.rotation.set(0, 0, 0);
      if (it.sv) d.scale.set(it.sv[0], it.sv[1], it.sv[2]);
      else d.scale.setScalar(it.s ?? 1);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={ref} args={[geo, material, items.length]} frustumCulled={false} />;
}

// ===== 可换装角色 =====
interface Avatar {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  hat: boolean;
}
const DEFAULT_AVATAR: Avatar = { skin: "#f4d4b4", hair: "#2b2f3a", shirt: "#eef1f4", pants: "#2f3947", hat: false };
const SKIN_SWATCHES = ["#f6dcc0", "#eecaa2", "#dca878", "#bd8350", "#9c6638"];
const HAIR_SWATCHES = ["#2b2f3a", "#4a3526", "#6f4e37", "#a9743f", "#d9b06a", "#b0b6c2", "#e7e3da", "#caa0d8"];
const SHIRT_SWATCHES = ["#eef1f4", "#7fa8d8", "#e08e8e", "#86b98a", "#e6c878", "#b69ad8", "#e89ab0", "#5fb6c4"];
const PANTS_SWATCHES = ["#2f3947", "#5a6470", "#6a533c", "#8a6f8e", "#4a6a5a", "#9c5a5a"];
function loadAvatar(): Avatar {
  try {
    const s = typeof localStorage !== "undefined" && localStorage.getItem("xy_avatar");
    if (s) return { ...DEFAULT_AVATAR, ...JSON.parse(s) };
  } catch {
    /* ignore */
  }
  return DEFAULT_AVATAR;
}
// 给岛上居民一套确定但各不相同的外观:按身份(村民/海滩/农人)微调衣色与戴帽概率,凑成一个有人气的小社区
function npcAvatar(seed: number, group: "village" | "beach" | "farm"): Avatar {
  const pick = (arr: string[], k: number) => arr[Math.floor(hash2(seed, k) * arr.length) % arr.length];
  const shirtPool =
    group === "beach"
      ? ["#eef1f4", "#7fa8d8", "#e89ab0", "#e6c878", "#5fb6c4", "#b69ad8"] // 海滩:明亮清爽
      : group === "farm"
        ? ["#86b98a", "#e6c878", "#d98a8a", "#7fa8d8"] // 农人:草绿麦黄
        : SHIRT_SWATCHES;
  return {
    skin: pick(SKIN_SWATCHES, 11.1),
    hair: pick(HAIR_SWATCHES, 12.3),
    shirt: pick(shirtPool, 13.5),
    pants: pick(PANTS_SWATCHES, 14.7),
    hat: hash2(seed, 15.9) < (group === "village" ? 0.22 : 0.6), // 海滩/农人多戴草帽
  };
}

// 角色外观(主角与换装预览共用):Q 版大头 + 眼睛/腮红 + 手臂 + 可选草帽,赛璐璐 + 描边。
function CharacterModel({ avatar, legL, legR }: { avatar: Avatar; legL?: React.RefObject<THREE.Mesh | null>; legR?: React.RefObject<THREE.Mesh | null> }) {
  const grad = useMemo(() => makeToonGradient(), []);
  const m = useMemo(
    () => ({
      skin: new THREE.MeshToonMaterial({ gradientMap: grad }),
      hair: new THREE.MeshToonMaterial({ gradientMap: grad }),
      shirt: new THREE.MeshToonMaterial({ gradientMap: grad }),
      pants: new THREE.MeshToonMaterial({ gradientMap: grad }),
      eye: new THREE.MeshToonMaterial({ color: "#222732", gradientMap: grad }),
      blush: new THREE.MeshBasicMaterial({ color: "#ff9fb0", transparent: true, opacity: 0.55 }),
      hat: new THREE.MeshToonMaterial({ color: "#e0c074", gradientMap: grad }),
    }),
    [grad],
  );
  useLayoutEffect(() => {
    m.skin.color.set(avatar.skin);
    m.hair.color.set(avatar.hair);
    m.shirt.color.set(avatar.shirt);
    m.pants.color.set(avatar.pants);
  }, [avatar, m]);
  useEffect(() => () => { grad.dispose(); Object.values(m).forEach((x) => x.dispose()); }, [grad, m]);

  return (
    <>
      {/* 身体 */}
      <mesh material={m.shirt} position={[0, 0.36, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.16, 4, 12]} />
        <Outlines thickness={0.02} color="#1a2230" />
      </mesh>
      {/* 手臂(短袖) */}
      <mesh material={m.shirt} position={[-0.19, 0.42, 0]} rotation={[0, 0, 0.45]}>
        <capsuleGeometry args={[0.045, 0.12, 4, 8]} />
        <Outlines thickness={0.02} color="#1a2230" />
      </mesh>
      <mesh material={m.shirt} position={[0.19, 0.42, 0]} rotation={[0, 0, -0.45]}>
        <capsuleGeometry args={[0.045, 0.12, 4, 8]} />
        <Outlines thickness={0.02} color="#1a2230" />
      </mesh>
      {/* 手 */}
      <mesh material={m.skin} position={[-0.235, 0.3, 0]}>
        <sphereGeometry args={[0.05, 10, 10]} />
      </mesh>
      <mesh material={m.skin} position={[0.235, 0.3, 0]}>
        <sphereGeometry args={[0.05, 10, 10]} />
      </mesh>
      {/* 大头 */}
      <mesh material={m.skin} position={[0, 0.73, 0]}>
        <sphereGeometry args={[0.2, 20, 20]} />
        <Outlines thickness={0.018} color="#1a2230" />
      </mesh>
      {/* 头发(盖顶) */}
      <mesh material={m.hair} position={[0, 0.77, -0.008]} scale={[1.06, 0.96, 1.06]}>
        <sphereGeometry args={[0.205, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
      </mesh>
      {/* 眼睛 */}
      <mesh material={m.eye} position={[-0.07, 0.75, 0.173]} scale={[1, 1.3, 0.6]}>
        <sphereGeometry args={[0.032, 12, 12]} />
      </mesh>
      <mesh material={m.eye} position={[0.07, 0.75, 0.173]} scale={[1, 1.3, 0.6]}>
        <sphereGeometry args={[0.032, 12, 12]} />
      </mesh>
      {/* 腮红 */}
      <mesh material={m.blush} position={[-0.125, 0.7, 0.155]} scale={[1.3, 0.8, 0.4]}>
        <sphereGeometry args={[0.03, 10, 10]} />
      </mesh>
      <mesh material={m.blush} position={[0.125, 0.7, 0.155]} scale={[1.3, 0.8, 0.4]}>
        <sphereGeometry args={[0.03, 10, 10]} />
      </mesh>
      {/* 草帽(可选) */}
      {avatar.hat && (
        <group position={[0, 0.9, 0]}>
          <mesh material={m.hat} position={[0, 0.05, 0]}>
            <coneGeometry args={[0.16, 0.16, 16]} />
            <Outlines thickness={0.018} color="#1a2230" />
          </mesh>
          <mesh material={m.hat} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.27, 22]} />
          </mesh>
        </group>
      )}
      {/* 两腿(以髋为轴摆动) */}
      <group position={[-0.07, 0.2, 0]}>
        <mesh ref={legL} material={m.pants} position={[0, -0.08, 0]}>
          <capsuleGeometry args={[0.05, 0.14, 4, 8]} />
          <Outlines thickness={0.02} color="#1a2230" />
        </mesh>
      </group>
      <group position={[0.07, 0.2, 0]}>
        <mesh ref={legR} material={m.pants} position={[0, -0.08, 0]}>
          <capsuleGeometry args={[0.05, 0.14, 4, 8]} />
          <Outlines thickness={0.02} color="#1a2230" />
        </mesh>
      </group>
    </>
  );
}

// 换装面板里的实时预览:小 Canvas,角色正面朝你,缓慢自转。
function PreviewSpin({ children }: { children: React.ReactNode }) {
  const r = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (r.current) r.current.rotation.y += dt * 0.6;
  });
  return (
    <group ref={r} position={[0, -0.42, 0]}>
      {children}
    </group>
  );
}
function AvatarPreview({ avatar }: { avatar: Avatar }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0.08, 1.55], fov: 34 }} gl={{ alpha: true }} style={{ width: "100%", height: "100%" }}>
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 3, 2]} intensity={1.1} />
      <PreviewSpin>
        <CharacterModel avatar={avatar} />
      </PreviewSpin>
    </Canvas>
  );
}

type VillagerMaterialName = "Skin" | "Hair" | "Shirt" | "Pants" | "Hat" | "Eye" | "Blush";

function GltfNpcCharacter({ avatar }: { avatar: Avatar }) {
  const { scene } = useGLTF(MODELS.villagerBase);
  const grad = useMemo(() => makeToonGradient(), []);
  const mats = useMemo(
    () => ({
      Skin: new THREE.MeshToonMaterial({ gradientMap: grad }),
      Hair: new THREE.MeshToonMaterial({ gradientMap: grad }),
      Shirt: new THREE.MeshToonMaterial({ gradientMap: grad }),
      Pants: new THREE.MeshToonMaterial({ gradientMap: grad }),
      Hat: new THREE.MeshToonMaterial({ color: "#e0c074", gradientMap: grad }),
      Eye: new THREE.MeshToonMaterial({ color: "#222732", gradientMap: grad }),
      Blush: new THREE.MeshBasicMaterial({ color: "#ff9fb0", transparent: true, opacity: 0.62 }),
    }),
    [grad],
  );
  const obj = useMemo(() => {
    const c = scene.clone(true);
    const convert = (src: THREE.Material): THREE.Material => {
      const mapped = (mats as Record<VillagerMaterialName, THREE.Material>)[src.name as VillagerMaterialName];
      return mapped ?? src.clone();
    };
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material as THREE.Material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
    });
    return c;
  }, [scene, mats]);
  useLayoutEffect(() => {
    mats.Skin.color.set(avatar.skin);
    mats.Hair.color.set(avatar.hair);
    mats.Shirt.color.set(avatar.shirt);
    mats.Pants.color.set(avatar.pants);
    const hat = obj.getObjectByName("Hat");
    if (hat) hat.visible = avatar.hat;
  }, [avatar, mats, obj]);
  useEffect(() => () => { grad.dispose(); Object.values(mats).forEach((x) => x.dispose()); }, [grad, mats]);
  return <primitive object={obj} scale={1.0} />;
}

// glb 主角:载入 Q版 base mesh,按材质槽名(Skin/Hair/Shirt/Pants)套 toon 并随「捏人」实时改色。
// 含独立四肢节点(LegL/LegR/ArmL/ArmR,枢轴在髋/肩),通过 ref 暴露给 Player 做走路/跳跃摆动。
function GltfAvatar({ avatar, legL, legR, armL, armR }: {
  avatar: Avatar;
  legL?: React.RefObject<THREE.Object3D | null>;
  legR?: React.RefObject<THREE.Object3D | null>;
  armL?: React.RefObject<THREE.Object3D | null>;
  armR?: React.RefObject<THREE.Object3D | null>;
}) {
  const { scene } = useGLTF(MODELS.avatar);
  const grad = useMemo(() => makeToonGradient(), []);
  const mats = useMemo(
    () => ({
      Skin: new THREE.MeshToonMaterial({ gradientMap: grad }),
      Hair: new THREE.MeshToonMaterial({ gradientMap: grad }),
      Shirt: new THREE.MeshToonMaterial({ gradientMap: grad }),
      Pants: new THREE.MeshToonMaterial({ gradientMap: grad }),
      Avatar_Eye: new THREE.MeshToonMaterial({ color: "#222732", gradientMap: grad }),
      Avatar_Blush: new THREE.MeshBasicMaterial({ color: "#ff9fb0" }),
    }),
    [grad],
  );
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const nm = (mesh.material as THREE.Material)?.name || "";
      const mapped = (mats as Record<string, THREE.Material>)[nm];
      mesh.material = mapped ?? new THREE.MeshToonMaterial({ color: (mesh.material as THREE.MeshStandardMaterial).color?.clone?.() ?? new THREE.Color("#ffffff"), gradientMap: grad });
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    return c;
  }, [scene, mats, grad]);
  useLayoutEffect(() => {
    mats.Skin.color.set(avatar.skin);
    mats.Hair.color.set(avatar.hair);
    mats.Shirt.color.set(avatar.shirt);
    mats.Pants.color.set(avatar.pants);
  }, [avatar, mats]);
  useEffect(() => () => { grad.dispose(); Object.values(mats).forEach((x) => x.dispose()); }, [grad, mats]);
  // 把四肢节点交给 Player 摆动
  useLayoutEffect(() => {
    if (legL) legL.current = obj.getObjectByName("LegL") ?? null;
    if (legR) legR.current = obj.getObjectByName("LegR") ?? null;
    if (armL) armL.current = obj.getObjectByName("ArmL") ?? null;
    if (armR) armR.current = obj.getObjectByName("ArmR") ?? null;
  }, [obj, legL, legR, armL, armR]);
  // glb 脸朝 -Z(Blender +Y → glTF -Z),程序化角色脸朝 +Z;转 180° 对齐,使脸朝移动方向。
  return <primitive object={obj} scale={0.72} rotation={[0, Math.PI, 0]} />;
}

// xyshz 新默认主角:Blender 重新绑骨骼后的 GLB；动作全部优先播放模型内作者动画。
// GLTFLoader 实测包围盒约 36.9 × 99.9 × 67.2，Y 轴已经竖直；缩放到探索模式角色量级后补足落脚点。
const XYSHZ_MODEL_SCALE = 0.0145;
const XYSHZ_FOOT_OFFSET_Y = 49.9846 * XYSHZ_MODEL_SCALE;
const XYSHZ_MODEL_ROTATION: [number, number, number] = [0, -Math.PI / 2, 0];
const XYSHZ_WALK_TIMESCALE = 1.5;
const XYSHZ_RUN_HOLD_SECONDS = 0.36;
const XYSHZ_RUN_TIMESCALE = 1.38;
const XYSHZ_ACTION_CLIPS = ["Idle", "WalkLoop", "RunLoop", "Jump", "Wave", "Flute", "Sit", "Cheer"] as const;

function isXyshzActionClip(clip: CharacterActionClip): clip is (typeof XYSHZ_ACTION_CLIPS)[number] {
  return (XYSHZ_ACTION_CLIPS as readonly CharacterActionClip[]).includes(clip);
}

function GltfHero({ actionRef }: { actionRef?: React.RefObject<CharacterActionClip> }) {
  const { scene, animations } = useGLTF(MODELS.heroChar);
  const ref = useRef<THREE.Group>(null);
  const obj = useMemo(() => {
    const root = cloneSkeleton(scene);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.receiveShadow = false;
        m.frustumCulled = false;
      }
    });
    return root;
  }, [scene]);
  const { actions, mixer } = useAnimations(animations, ref);
  const activeClip = useRef<string>("");
  const activeAction = useRef<THREE.AnimationAction | null>(null);
  useFrame(() => {
    const requested = actionRef?.current ?? "Idle";
    const next = isXyshzActionClip(requested) && actions[requested] ? requested : "Idle";
    if (next !== activeClip.current) {
      activeAction.current?.fadeOut(0.12);
      const nextAction = actions[next];
      if (nextAction) {
        nextAction.reset();
        const looped = next === "Idle" || next === "RunLoop" || next === "WalkLoop";
        nextAction.clampWhenFinished = !looped;
        nextAction.timeScale = next === "RunLoop" ? XYSHZ_RUN_TIMESCALE : next === "WalkLoop" ? XYSHZ_WALK_TIMESCALE : 1;
        nextAction.setLoop(looped ? THREE.LoopRepeat : THREE.LoopOnce, looped ? Infinity : 1);
        nextAction.fadeIn(next === "RunLoop" ? 0.12 : next === "WalkLoop" ? 0.18 : 0.12).play();
      }
      activeAction.current = nextAction ?? null;
      activeClip.current = next;
    }
  });
  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);
  return (
    <group ref={ref}>
      <primitive
        object={obj}
        scale={XYSHZ_MODEL_SCALE}
        rotation={XYSHZ_MODEL_ROTATION}
        position={[0, XYSHZ_FOOT_OFFSET_Y, 0]}
      />
    </group>
  );
}

// 旧 glb 主角「记忆的守护者」:载入精修角色,保留其自带配色 + 海浪贴图(有 map 的材质保图) + Emissive_* 发光。
// 暴露 LegL/LegR/ArmL/ArmR + Cape 节点给 Player 做待机兜底;运动/手势优先播放 GLB 内 NLA 动作。
function GltfGuardian({ legL, legR, armL, armR, shinL, shinR, foreArmL, foreArmR, cape, faces, actionRef }: {
  legL?: React.RefObject<THREE.Object3D | null>;
  legR?: React.RefObject<THREE.Object3D | null>;
  armL?: React.RefObject<THREE.Object3D | null>;
  armR?: React.RefObject<THREE.Object3D | null>;
  shinL?: React.RefObject<THREE.Object3D | null>;
  shinR?: React.RefObject<THREE.Object3D | null>;
  foreArmL?: React.RefObject<THREE.Object3D | null>;
  foreArmR?: React.RefObject<THREE.Object3D | null>;
  cape?: React.RefObject<THREE.Object3D | null>;
  faces?: React.RefObject<Record<string, THREE.Object3D> | null>;
  actionRef?: React.RefObject<CharacterActionClip>;
}) {
  const { scene, animations } = useGLTF(MODELS.guardianChar);
  const ref = useRef<THREE.Group>(null);
  const grad = useMemo(() => makeToonGradient(), []);
  // 卡通描边:法线外扩的背面黑壳(inverted hull),让角色轮廓清晰、从背景里跳出来
  const outlineMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#22222e") }, uWidth: { value: 0.02 } },
    vertexShader: "uniform float uWidth; void main(){ vec3 p = position + normalize(normal) * uWidth; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }",
    fragmentShader: "uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0); }",
    side: THREE.BackSide,
  }), []);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    const cache = new Map<THREE.Material, THREE.Material>();
    const conv = (src: THREE.Material): THREE.Material => {
      const hit = cache.get(src);
      if (hit) return hit;
      const std = src as THREE.MeshStandardMaterial;
      const base = std.color ? std.color.clone() : new THREE.Color("#ffffff");
      let out: THREE.Material;
      if (/emissive/i.test(src.name || "")) {
        const lit = std.emissive && (std.emissive.r || std.emissive.g || std.emissive.b);
        const col = lit ? std.emissive.clone() : base;
        out = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.2, toneMapped: false });
      } else {
        out = new THREE.MeshToonMaterial({ color: base, gradientMap: grad, map: std.map ?? null }); // 保留花纹贴图
      }
      cache.set(src, out);
      return out;
    };
    const shellTargets: THREE.Mesh[] = [];
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material as THREE.Material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (!/^Face/.test(mesh.name)) shellTargets.push(mesh); // 脸不描边(免糊五官),其余收集做描边壳
    });
    // 给身体/四肢/披风各挂描边子壳:共享几何 → 跟随关节动画;背面外扩 → 只露黑色轮廓
    for (const m of shellTargets) {
      const shell = new THREE.Mesh(m.geometry, outlineMat);
      shell.castShadow = false; shell.receiveShadow = false; shell.frustumCulled = false;
      m.add(shell);
    }
    return c;
  }, [scene, grad, outlineMat]);
  useLayoutEffect(() => {
    if (legL) legL.current = obj.getObjectByName("LegL") ?? null;
    if (legR) legR.current = obj.getObjectByName("LegR") ?? null;
    if (armL) armL.current = obj.getObjectByName("ArmL") ?? null;
    if (armR) armR.current = obj.getObjectByName("ArmR") ?? null;
    if (shinL) shinL.current = obj.getObjectByName("ShinL") ?? null;
    if (shinR) shinR.current = obj.getObjectByName("ShinR") ?? null;
    if (foreArmL) foreArmL.current = obj.getObjectByName("ForeArmL") ?? null;
    if (foreArmR) foreArmR.current = obj.getObjectByName("ForeArmR") ?? null;
    if (cape) cape.current = obj.getObjectByName("Cape") ?? null;
    if (faces) {                                                    // 4 套表情节点 → 交给 Player 按状态切显隐
      const map: Record<string, THREE.Object3D> = {};
      for (const [k, nm] of [["cheerful", "Face_Cheerful"], ["calm", "Face_Calm"], ["determined", "Face_Determined"], ["curious", "Face_Curious"]] as const) {
        const n = obj.getObjectByName(nm);
        if (n) { n.visible = k === "cheerful"; map[k] = n; }       // 初始只显开心
      }
      faces.current = map;
    }
  }, [obj, legL, legR, armL, armR, shinL, shinR, foreArmL, foreArmR, cape, faces]);
  const { actions, mixer } = useAnimations(animations, ref);
  const activeClip = useRef<CharacterActionClip>("Idle");
  const activeAction = useRef<THREE.AnimationAction | null>(null);
  useFrame((_, dt) => {
    const next = actionRef?.current ?? "Idle";
    if (next !== activeClip.current) {
      activeAction.current?.fadeOut(0.12);
      const nextAction = next === "Idle" ? null : actions[next];
      if (nextAction) {
        nextAction.reset();
        nextAction.clampWhenFinished = next !== "WalkLoop";
        nextAction.setLoop(next === "WalkLoop" ? THREE.LoopRepeat : THREE.LoopOnce, next === "WalkLoop" ? Infinity : 1);
        nextAction.fadeIn(next === "WalkLoop" ? 0.18 : 0.08).play();
      }
      activeAction.current = nextAction ?? null;
      activeClip.current = next;
    }
    mixer.update(dt);
  });
  useEffect(() => () => { grad.dispose(); mixer.stopAllAction(); }, [grad, mixer]);
  return (
    <group ref={ref} scale={0.6} rotation={[0, Math.PI, 0]}>
      <primitive object={obj} />
    </group>
  );
}

// 可切换主角的种类
type CharKind = "hero" | "guardian" | "pocoyo" | "avatar";
const CHAR_ORDER: CharKind[] = ["hero", "guardian", "pocoyo", "avatar"];
const CHAR_LABEL: Record<CharKind, string> = { hero: "心屿守护者", guardian: "记忆的守护者", pocoyo: "Pocoyo", avatar: "用捏的人" };

// Pocoyo 的 FBX 转 GLB 后仍保留「头在 -Z、脚在 +Z」的卧倒轴向;Three.js 里 Y 才是站立方向。
// 下面数值来自 Blender/Three 包围盒实测:Z 长 1.0114,旋正后脚底 minY=-0.3367。
const POCOYO_MODEL_SCALE = 1.06;
const POCOYO_FOOT_OFFSET_Y = 0.3367 * POCOYO_MODEL_SCALE;
const POCOYO_UPRIGHT_ROTATION: [number, number, number] = [Math.PI / 2, 0, 0];

// Pocoyo 主角:静态 glb(手臂已在 Blender 烘焙成自然下垂,不再 T-pose)。
// 整体随玩家位移/转向/起伏(Player 的 group 负责走路 bob/前倾/侧倾);自身再加一点待机轻晃,站着也有生气。
function GltfPocoyo({ actionRef }: { actionRef?: React.RefObject<CharacterActionClip> }) {
  const { scene } = useGLTF(MODELS.pocoyo);
  const obj = useMemo(() => rawClone(scene), [scene]);
  const ref = useRef<THREE.Group>(null);
  useFrame((s, dt) => {
    if (!ref.current) return;
    const t = s.clock.elapsedTime;
    const action = actionRef?.current ?? "Idle";
    let y = Math.sin(t * 1.9) * 0.02;
    let rx = 0;
    let rz = Math.sin(t * 1.3) * 0.03;
    let sx = 1;
    let sy = 1;
    if (action === "WalkLoop") {
      y = Math.abs(Math.sin(t * 7.2)) * 0.045;
      rz = Math.sin(t * 7.2) * 0.09;
    } else if (action === "Jump") {
      y = 0.08;
      rx = -0.12;
      rz = Math.sin(t * 8) * 0.05;
      sx = 1.04; sy = 0.94;
    } else if (action === "Wave") {
      y = Math.sin(t * 4.4) * 0.025;
      rz = 0.13 + Math.sin(t * 7.2) * 0.08;
    } else if (action === "Flute") {
      y = Math.sin(t * 1.7) * 0.024;
      rx = 0.08;
      rz = Math.sin(t * 2.2) * 0.025;
    } else if (action === "Sit") {
      y = -0.18 + Math.sin(t * 1.2) * 0.01;
      rx = -0.06;
      sx = 1.08; sy = 0.78;
    }
    const k = Math.min(1, dt * 12);
    ref.current.position.y += (y - ref.current.position.y) * k;
    ref.current.rotation.x += (rx - ref.current.rotation.x) * k;
    ref.current.rotation.z += (rz - ref.current.rotation.z) * k;
    ref.current.scale.x += (sx - ref.current.scale.x) * k;
    ref.current.scale.y += (sy - ref.current.scale.y) * k;
    ref.current.scale.z += (sx - ref.current.scale.z) * k;
  });
  return (
    <group ref={ref}>
      <primitive
        object={obj}
        scale={POCOYO_MODEL_SCALE}
        rotation={POCOYO_UPRIGHT_ROTATION}
        position={[0, POCOYO_FOOT_OFFSET_Y, 0]}
      />
    </group>
  );
}

// 「吹笛子」短句：五声音阶(C D E G A)的一段柔和旋律，与风铃心曲同调式，依次用 playFluteNote 吹出。
const FLUTE_MELODY = [659.25, 783.99, 880.0, 783.99, 659.25, 587.33, 523.25]; // E G A G E D C
const FLUTE_NOTE_GAP = 0.42; // 每音间隔(秒)
const FLUTE_DUR = FLUTE_MELODY.length * FLUTE_NOTE_GAP + 0.55; // 整段时长(含起手 + 尾韵)
const NOTE_POOL = 8;     // 音符♪精灵池大小(循环复用)
const NOTE_TTL = 1.7;    // 单枚音符飘升时长(秒)
const NOTE_RISE = 0.95;  // 音符飘升高度

// 画一枚发光的音符贴图(♪/♫),供吹笛时的 Sprite 复用。柔光描边,海上也看得清。
function makeNoteTexture(glyph: string, color: string): THREE.Texture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.font = "46px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = color;
  ctx.shadowBlur = 9;
  ctx.fillStyle = color;
  ctx.fillText(glyph, 32, 35);
  ctx.fillText(glyph, 32, 35); // 二次叠加,描边更实
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 2;
  return tex;
}

function Player({
  inputRef,
  posRef,
  headingRef,
  avatar,
  character,
  expression,
  collidersRef,
  cheerRef,
  nearRef,
  onCar,
  onCarEnter,
}: {
  inputRef: React.RefObject<Input>;
  posRef: React.RefObject<THREE.Vector3>;
  headingRef?: React.RefObject<number>;
  avatar: Avatar;
  character: CharKind;
  expression?: string;
  collidersRef?: React.RefObject<Map<string, Collider[]> | null>;
  cheerRef?: React.RefObject<number>;
  nearRef?: React.RefObject<number>;
  onCar?: (s: "enter" | "exit" | null) => void;
  onCarEnter?: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Object3D>(null);
  const legR = useRef<THREE.Object3D>(null);
  const armL = useRef<THREE.Object3D>(null);
  const armR = useRef<THREE.Object3D>(null);
  const shinL = useRef<THREE.Object3D>(null);
  const shinR = useRef<THREE.Object3D>(null);
  const foreArmL = useRef<THREE.Object3D>(null);
  const foreArmR = useRef<THREE.Object3D>(null);
  const cape = useRef<THREE.Object3D>(null);
  const waveT = useRef(0); // 招手剩余时长
  const baseFacing = useRef(0); // 待机张望基准朝向
  const prevCheer = useRef(0); // 上帧拾取计数(变化 → 欢呼)
  const cheerT = useRef(0); // 欢呼剩余时长
  const facesRef = useRef<Record<string, THREE.Object3D> | null>(null); // 4 套表情节点(GltfHero 填充)
  const characterActionRef = useRef<CharacterActionClip>("Idle"); // 当前角色动作:旧守护者播完整 GLB clip，新主角移动时播 WalkLoop/RunLoop 骨骼 clip
  const idleT = useRef(0); // 连续待机时长(→ 久站坐下 + 平静表情)
  const curiousT = useRef(0); // 好奇表情剩余时长(靠近 NPC 触发)
  const prevNear = useRef(-1); // 上帧最近 NPC(检测靠近边沿)
  const sit = useRef(0); // 坐下程度 0→1
  const lastFace = useRef(""); // 上次生效表情(仅变化时切显隐)
  const ripple = useRef<THREE.Mesh>(null);
  const carPrompt = useRef<"enter" | "exit" | null>(null); // 上/下车提示状态(变化时回调 UI)
  const facing = useRef(0);
  const walkPhase = useRef(0);
  const moveHoldT = useRef(0);
  const vel = useRef({ x: 0, z: 0 }); // 当前水平速度(用于加速/减速平滑)
  const vy = useRef(0); // 垂直速度(跳跃)
  const airborne = useRef(false); // 是否腾空
  const sq = useRef(0); // 落地压扁量(衰减)
  const introT = useRef(0); // 开场俯冲运镜进度 0→1
  const stepT = useRef(0); // 脚步/涉水音效冷却计时（限频，避免每帧触发）
  const fluteT = useRef(0); // 吹笛剩余时长（>0 时摆吹奏姿 + 显笛 + 依次吹音）
  const fluteNote = useRef(0); // 本段已吹出的音符数（按节奏依次触发）
  const fluteRef = useRef<THREE.Group>(null); // 笛子道具组（仅吹奏时显示）
  const noteRefs = useRef<(THREE.Sprite | null)[]>([]); // 飘出的音符♪精灵
  const noteLife = useRef<number[]>([]); // 每枚音符剩余生命 1→0
  const noteDX = useRef<number[]>([]);   // 音符水平漂移(偏笛尾方向)
  const noteDZ = useRef<number[]>([]);
  const noteSpin = useRef<number[]>([]); // 音符旋摆量
  const noteCursor = useRef(0);          // 下一个可用音符槽
  const camLook = useRef(new THREE.Vector3(0, 1.5, 0)); // 平滑注视点,减少地形/输入抖动带来的晕眩
  const camLookReady = useRef(false);
  const fluteGrad = useMemo(() => makeToonGradient(), []);
  const fluteMats = useMemo(() => ({
    body: new THREE.MeshToonMaterial({ color: "#e6cd9c", gradientMap: fluteGrad }), // 竹身
    band: new THREE.MeshToonMaterial({ color: "#6f4f2e", gradientMap: fluteGrad }), // 缠线/孔
    tassel: new THREE.MeshBasicMaterial({ color: "#e2554f" }),                      // 红流苏
  }), [fluteGrad]);
  const noteTex = useMemo(() => [makeNoteTexture("♪", "#ffe7b0"), makeNoteTexture("♫", "#bfe9d6")], []);
  useEffect(() => () => { fluteGrad.dispose(); Object.values(fluteMats).forEach((m) => m.dispose()); noteTex.forEach((t) => t.dispose()); }, [fluteGrad, fluteMats, noteTex]);
  const { camera } = useThree();

  useFrame((s, dtRaw) => {
    const g = group.current;
    const pos = posRef.current;
    if (!g || !pos) return;
    const dt = Math.min(dtRaw, 0.05);
    const input = inputRef.current ?? { x: 0, y: 0 };

    // 🛠️ DEBUG 瞬移:离线截图脚本设 window.__XYWARP={x,z} 时,把玩家瞬移到该处(截海湾垂钓/风铃/车旁等需走位的玩法)。
    // 生产环境无此全局 → 整段跳过,零影响;瞬移后立即清空,只生效一帧,之后照常走路。
    const _warp = (window as unknown as { __XYWARP?: { x: number; z: number } }).__XYWARP;
    if (_warp && !carState.driving) {
      pos.set(_warp.x, exGroundY(_warp.x, _warp.z), _warp.z);
      (window as unknown as { __XYWARP?: unknown }).__XYWARP = undefined;
    }

    // ── 开车:E 在车旁上车 / 车上下车 ──
    // 阈值留出余量:车碰撞把人推到 ~2.85 处,判定取 4.2 避免在边界抖动时按 E 落空。
    const CAR_BOARD_DIST = 4.2;
    const carDist2 = dist2(pos.x, pos.z, carState.x, carState.z);
    const carBoardDist2 = CAR_BOARD_DIST * CAR_BOARD_DIST;
    if (input.action) {
      input.action = false;
      if (carState.driving) {
        carState.driving = false; carState.speed = 0; carState.turn = 0;
        pos.x = carState.x + Math.cos(carState.heading) * 2.6; // 下车站到车侧
        pos.z = carState.z - Math.sin(carState.heading) * 2.6;
        playSfx("tap"); stopEngine(); // 下车:停引擎
      } else if (carDist2 < carBoardDist2) {
        onCarEnter?.(); // 走近车按 E → 弹「选地图」菜单(当前岛 / 林间土路);不直接开走
      }
    }
    const prompt = carState.driving ? "exit" : carDist2 < carBoardDist2 ? "enter" : null;
    if (prompt !== carPrompt.current) { carPrompt.current = prompt; onCar?.(prompt); }
    if (carState.driving) {
      g.visible = false; // 坐进车里,藏起小人
      const steer = -input.x; // A=左 / D=右(修正此前左右相反);侧倾与转向共用,自然「向外倾」过弯
      carState.turn = steer; // 转向输入(车身侧倾用)
      const boosting = !!input.boost && input.y < 0; // 加速键(Shift / 触屏「»」):仅前进时增压
      carState.throttle = input.y; // 供 DrivableCar 驱动车尾尾焰(input.y<0=前进给油)
      carState.boost = boosting;
      const maxSpd = boosting ? CAR_BOOST_SPEED : CAR_MAX_SPEED;
      const targetSpeed = -input.y * maxSpd;
      carState.speed += (targetSpeed - carState.speed) * (1 - Math.pow(boosting ? 0.01 : 0.04, dt)); // 增压时更快逼近目标 → 推背感
      if (Math.abs(carState.speed) > 0.4) { const cf = Math.min(1, Math.abs(carState.speed) / CAR_MAX_SPEED); carState.heading += steer * (CAR_TURN - cf * 0.7) * dt * (carState.speed >= 0 ? 1 : -1); } // 低速灵活、高速沉稳(像真车);高速衰减收一点,免得太钝
      carState.x += Math.sin(carState.heading) * carState.speed * dt;
      carState.z += Math.cos(carState.heading) * carState.speed * dt;
      // 车身多点采样(前/中/后)各自推出障碍 → 长车不穿模;撞到则减速,不硬穿
      let _hit = false;
      for (const sgn of [1.9, 0, -1.9]) {
        const px = carState.x + Math.sin(carState.heading) * sgn, pz = carState.z + Math.cos(carState.heading) * sgn;
        _carTmp.set(px, 0, pz);
        resolveCollisions(collidersRef?.current ?? null, _carTmp, { x: 0, z: 0 }, 1.35);
        if (Math.abs(_carTmp.x - px) > 1e-3 || Math.abs(_carTmp.z - pz) > 1e-3) { _hit = true; carState.x += _carTmp.x - px; carState.z += _carTmp.z - pz; }
      }
      if (_hit) carState.speed *= 0.75; // 撞墙减速更柔和(原 0.5 太顿),轻蹭不会急停
      setEngineSpeed(Math.min(1, Math.abs(carState.speed) / CAR_BOOST_SPEED)); // 引擎低鸣随车速(以增压上限为满量程,加速时拉得更高)
      const cr = Math.hypot(carState.x, carState.z), cmax = WALK_RADIUS * 0.98;
      if (cr > cmax) { carState.x *= cmax / cr; carState.z *= cmax / cr; carState.speed *= 0.4; }
      const _cgy = groundYWithRoad(carState.x, carState.z).y; // 车贴地用路地面 → 在路上又稳又顺
      pos.set(carState.x, _cgy, carState.z);
      const sf = Math.min(1, Math.abs(carState.speed) / CAR_BOOST_SPEED); // 速度感:越快镜头拉越远、抬越高
      const cb = 13.5 + sf * 4, cu = 7.2 + sf * 1.2; // 相机跟在车后上方
      _camTarget.set(carState.x - Math.sin(carState.heading) * cb, _cgy + cu, carState.z - Math.cos(carState.heading) * cb);
      camera.position.lerp(_camTarget, Math.min(1, dt * 3.2)); // 镜头跟车更跟手(原 2.6 偏滞后)
      _camLookTarget.set(carState.x, _cgy + 1.3, carState.z);
      if (!camLookReady.current) {
        camLook.current.copy(_camLookTarget);
        camLookReady.current = true;
      } else {
        camLook.current.lerp(_camLookTarget, Math.min(1, dt * 6));
      }
      camera.lookAt(camLook.current);
      moveHoldT.current = 0;
      return; // 跳过走路逻辑
    }
    g.visible = true;

    // 相机相对方向(投影到水平面)
    camera.getWorldDirection(_fwd);
    _fwd.setY(0).normalize();
    _right.crossVectors(_fwd, _up).normalize();
    _move.set(0, 0, 0).addScaledVector(_fwd, -input.y).addScaledVector(_right, input.x);
    const moving = _move.lengthSq() > 0.0001;
    moveHoldT.current += moving ? dt : -dt * 2;
    moveHoldT.current = Math.max(0, Math.min(XYSHZ_RUN_HOLD_SECONDS + 0.6, moveHoldT.current));
    const runBlend = character === "hero" ? smoothstep01(XYSHZ_RUN_HOLD_SECONDS, XYSHZ_RUN_HOLD_SECONDS + 0.22, moveHoldT.current) : 0;
    const moveSpeed = PLAYER_SPEED * (1 + runBlend * 0.46);

    if (moving) {
      _move.normalize();
      facing.current = Math.atan2(_move.x, _move.z);
      baseFacing.current = facing.current;
    } else if (waveT.current > 0) {
      // 招手时转过身正对镜头(你)→ 像在认真跟你打招呼;招呼完仍朝着你,不回弹
      const camDir = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z);
      facing.current = camDir;
      baseFacing.current = camDir;
    } else {
      facing.current = baseFacing.current + Math.sin(s.clock.elapsedTime * 0.4) * 0.15; // 待机时左右缓缓张望
    }

    // 加速/减速平滑(有重量感):速度向目标缓动,而非瞬时
    const tvx = moving ? _move.x * moveSpeed : 0;
    const tvz = moving ? _move.z * moveSpeed : 0;
    // 加减速更柔(降低「灵敏度」):base 调大 → 起步/收步更有重量感,不再一推就窜、一松就停。
    const accel = 1 - Math.pow(0.02, dt); // 帧率无关;时间常数 ~0.14s → ~0.26s
    vel.current.x += (tvx - vel.current.x) * accel;
    vel.current.z += (tvz - vel.current.z) * accel;
    pos.x += vel.current.x * dt;
    pos.z += vel.current.z * dt;
    // 障碍碰撞:把玩家推出树/房子/地标,并沿其滑行(障碍是整柱高,跳跃也穿不过去)
    resolveCollisions(collidersRef?.current ?? null, pos, vel.current, PLAYER_COL_R);
    // 停着的车也挡住玩家(开车时玩家在车里,跳过):动态圆碰撞,人不能穿过车身
    if (!carState.driving) {
      const cdx = pos.x - carState.x, cdz = pos.z - carState.z, cmd = 2.4 + PLAYER_COL_R, cd2 = cdx * cdx + cdz * cdz;
      if (cd2 < cmd * cmd && cd2 > 1e-6) {
        const cd = Math.sqrt(cd2), cnx = cdx / cd, cnz = cdz / cd;
        pos.x = carState.x + cnx * cmd; pos.z = carState.z + cnz * cmd;
        const cvn = vel.current.x * cnx + vel.current.z * cnz;
        if (cvn < 0) { vel.current.x -= cvn * cnx; vel.current.z -= cvn * cnz; }
      }
    }
    const speedMag = Math.hypot(vel.current.x, vel.current.z);

    // 限制在岛上:常规岸线到护栏附近为止;海湾入口允许多走一点,能踏上沙滩/浅滩。
    const maxR = walkableRadius(pos.x, pos.z);
    const r2 = pos.x * pos.x + pos.z * pos.z;
    if (r2 > maxR * maxR) {
      const r = Math.sqrt(r2);
      pos.x *= maxR / r;
      pos.z *= maxR / r;
      vel.current.x *= 0.3;
      vel.current.z *= 0.3;
    }

    // 步态相位
    const gait = Math.min(1, speedMag / (PLAYER_SPEED * 0.7));
    walkPhase.current += dt * speedMag * 0.9;

    // 贴地 + 跳跃:陆上随丘陵起伏,浅滩可没到小腿(WADE_FLOOR);腾空时按重力抛物
    // 地标地坪(浴场/街区/山庄)范围内把地表抬到坪顶 → 走上去稳稳落地,不陷下去/不踩空
    // 贴地走「路地面」(近路压平 + 柏油薄层 ROAD_SURFACE_RAISE),与地形网格 / 车同一套函数 → 走在路上稳稳贴在柏油面上,不再陷进路里
    const { y: gwrY, roadW: gwrW } = groundYWithRoad(pos.x, pos.z);
    const groundY = Math.max(gwrY + gwrW * ROAD_SURFACE_RAISE, landmarkGroundLift(pos.x, pos.z), stairsGroundLift(pos.x, pos.z), WADE_FLOOR);
    if (input.jump && !airborne.current) {
      vy.current = JUMP_V; airborne.current = true;
      // 起跳音:合成「Q 弹 boing」(playJump,弹性上扬的腾起音),贴合可爱治愈基调。一次性消费,天然不连响。
      playJump();
      emitCompanionEvent("jump"); // 精灵「主动陪聊」:跳一下它可能搭句话(由 ExploreMode 套节流)
    }
    if (input.jump) input.jump = false; // 一次性消费
    if (input.wave) { waveT.current = 1.5; input.wave = false; } // 招手:仅 F 键 / ✋ 按钮触发(缓起缓落更暖)
    if (input.flute) { fluteT.current = FLUTE_DUR; fluteNote.current = 0; input.flute = false; } // 吹笛:Q 键 / 🎵 按钮
    const cc = cheerRef?.current ?? 0;                            // 拾取(计数变化)→ 欢呼
    if (cc !== prevCheer.current) { cheerT.current = 0.85; prevCheer.current = cc; }
    waveT.current = Math.max(0, waveT.current - dt);
    cheerT.current = Math.max(0, cheerT.current - dt);
    // 吹笛:按节奏依次吹出 melody 各音(elapsed 每跨过一个 GAP 就补吹下一音,掉帧也不漏/不重)
    if (fluteT.current > 0) {
      const elapsed = FLUTE_DUR - fluteT.current;
      const due = Math.min(FLUTE_MELODY.length, Math.floor(elapsed / FLUTE_NOTE_GAP) + 1);
      while (fluteNote.current < due) {
        playFluteNote(FLUTE_MELODY[fluteNote.current]);
        const slot = noteCursor.current % NOTE_POOL; noteCursor.current++; // 取一个槽,从笛口飘出一枚音符♪
        noteLife.current[slot] = 1;
        noteDX.current[slot] = 0.1 + Math.random() * 0.42;   // 偏向笛尾(右)方向飘
        noteDZ.current[slot] = (Math.random() - 0.5) * 0.5;
        noteSpin.current[slot] = (Math.random() - 0.5) * 1.5;
        fluteNote.current++;
      }
    }
    fluteT.current = Math.max(0, fluteT.current - dt);
    const near = nearRef?.current ?? -1;                          // 靠近 NPC(从无到有)→ 好奇表情
    if (near >= 0 && prevNear.current < 0) curiousT.current = 1.6;
    prevNear.current = near; curiousT.current = Math.max(0, curiousT.current - dt);
    const settled = !airborne.current && gait < 0.06 && waveT.current <= 0 && cheerT.current <= 0 && fluteT.current <= 0;
    idleT.current = settled ? idleT.current + dt : 0;             // 连续待机计时
    sit.current += ((idleT.current > 7 ? 1 : 0) - sit.current) * Math.min(1, dt * 2.0); // 久站→坐下(更缓地落座/起身,缓入缓出)
    if (airborne.current) {
      vy.current -= GRAVITY * dt;
      pos.y += vy.current * dt;
      if (pos.y <= groundY) {
        pos.y = groundY; vy.current = 0; airborne.current = false; sq.current = 1; // 落地触发压扁
        // 落地音:涉水(脚在水面下)用水花声,否则闷响落地声。采样优先,未命中回退合成。
        // 该分支仅在落地瞬间进入(下帧走 else),天然单次触发,不会连响。
        if (pos.y < 0.02) {
          if (!playSample("water_splash", { gain: 0.5, rate: 0.9 + Math.random() * 0.2 })) {
            // 涉水无合成水花 → 用落地合成兜底(略轻)
            playLand(0.2);
          }
        } else if (!playSample("land", { gain: 0.45 })) {
          playLand(0.3);
        }
      }
    } else {
      pos.y = groundY;
    }
    const wading = !airborne.current && pos.y < 0.02; // 脚在水面以下 = 涉水
    // 脚步 / 涉水音：移动中（gait 够大）按步频触发，涉水播水花、陆上播脚步。
    // 采样未就绪时静默（无合成对应，断网可接受）。stepT 限频(慢走 0.46s/步、涉水 0.5s)。
    stepT.current -= dt;
    if (!airborne.current && gait > 0.25 && stepT.current <= 0) {
      stepT.current = wading ? 0.5 - runBlend * 0.08 : 0.46 - runBlend * 0.1;
      playSample(wading ? "water_splash" : "footstep", { gain: wading ? 0.5 : 0.6, rate: 0.9 + Math.random() * 0.2 });
    }
    sq.current = Math.max(0, sq.current - dt * 3.5); // 压扁回弹衰减
    characterActionRef.current = selectCharacterAction({
      moving: gait > 0.12,
      running: character === "hero" && moveHoldT.current >= XYSHZ_RUN_HOLD_SECONDS,
      airborne: airborne.current,
      cheerActive: cheerT.current > 0,
      waveActive: waveT.current > 0,
      fluteActive: fluteT.current > 0,
      sitAmount: sit.current,
    });
    const glbClipActive = (character === "guardian" && characterActionRef.current !== "Idle") || (character === "hero" && characterActionRef.current !== "Idle");
    const breathe = !airborne.current && gait < 0.12 ? Math.sin(s.clock.elapsedTime * 1.6) * 0.012 : 0; // 待机呼吸起伏
    const bob = airborne.current ? 0 : Math.abs(Math.sin(walkPhase.current)) * 0.088 * gait; // 走路身体起伏(每步一颠,弹性更足)
    const cheerHop = cheerT.current > 0 ? Math.sin((1 - cheerT.current / 0.85) * Math.PI) * 0.18 : 0; // 欢呼小跳
    const greetBob = waveT.current > 0 ? Math.sin(s.clock.elapsedTime * 4.4) * 0.016 : 0; // 招手时身体轻晃,更亲切
    const fluteBob = fluteT.current > 0 ? Math.sin(s.clock.elapsedTime * 1.7) * 0.02 : 0; // 吹奏时随气息缓缓起伏
    g.position.set(
      pos.x,
      pos.y + (glbClipActive ? 0 : bob + breathe + greetBob + fluteBob - sit.current * 0.34) - sq.current * 0.12 + cheerHop,
      pos.z,
    );
    g.scale.set(1 + sq.current * 0.12, 1 - sq.current * 0.2, 1 + sq.current * 0.12); // 落地压扁

    // 朝向(缓转) + 移动前倾 + 转身侧倾
    let dy = facing.current - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * Math.min(1, dt * 6.5); // 转身更柔和(降灵敏度),不再急转
    if (headingRef) headingRef.current = carState.driving ? carState.heading : g.rotation.y; // 供小地图箭头朝向(开车时跟车头)
    g.rotation.order = "YXZ"; // 朝向(y)→前倾(x)→侧倾(z) 在朝向坐标系内复合
    const stepPitch = Math.sin(walkPhase.current * 2) * 0.044 * gait; // 每步前后微颠(像点头般的步态弹性,更足)
    const greetNod = waveT.current > 0 && !moving ? Math.sin(s.clock.elapsedTime * 4.4) * 0.05 : 0; // 招手时轻轻点头致意
    g.rotation.x += (0.12 * gait + stepPitch + greetNod - sit.current * 0.06 - g.rotation.x) * Math.min(1, dt * 8); // 移动前倾 / 坐下轻松后倚 / 招手点头
    const sway = Math.sin(walkPhase.current) * 0.088 * gait; // 走路重心左右轻移(自然摆胯,更明显)
    const greetTilt = waveT.current > 0 && !moving ? 0.11 : 0; // 招手时头/身向举手侧微倾,更亲切
    const seatLean = sit.current > 0.01 ? Math.sin(s.clock.elapsedTime * 0.9) * 0.03 * sit.current : 0; // 坐着时上身随重心极缓微晃,有呼吸感
    const bank = Math.max(-0.2, Math.min(0.2, dy * 0.5));
    g.rotation.z += (bank + sway + greetTilt + seatLean - g.rotation.z) * Math.min(1, dt * 6); // 转身侧倾 + 走路摆胯 + 招手微倾 + 坐姿微晃

    // 四肢:先算目标姿态,再阻尼平滑到位(消除直接赋值的僵硬,带自然跟随/缓动)
    // Lx/Rx=大腿(髋摆) · KLx/KRx=小腿(屈膝,正值向后弯,Blender 校准) · ALx/ARx=大臂(肩摆)+ALz/ARz外展 · ELx/ERx=小臂(屈肘,负值前屈)
    const tw = s.clock.elapsedTime;
    // 四肢目标姿态:下方 if/else 三分支必然给大部分变量赋值,再由 sit/wave/cheer/flute 叠加改写。
    // 其中 ALz/ARz/KLx/KRx/ELx/ERx 的初值恒被分支覆盖,但 no-useless-assignment 会误报;
    // 同时 TS 的明确赋值分析需要这些初值才能放行下方 sit 分支的「先读后写」。故显式豁免该规则。
    // eslint-disable-next-line no-useless-assignment
    let Lx = 0, Rx = 0, ALx: number, ARx: number, ALz = 0, ARz = 0;  // 大腿/大臂;Z=外展(避免贴身穿模)
    // eslint-disable-next-line no-useless-assignment
    let KLx = 0.04, KRx = 0.04, ELx = -0.3, ERx = -0.3;              // 小腿屈膝 / 小臂屈肘:留一点自然弯,不锁成直棍
    if (airborne.current) {
      const up = vy.current > 0 ? 1 : 0.55;
      Lx = -0.5 * up; Rx = -0.75 * up; ALx = -1.3; ARx = -1.3; ALz = 0.16; ARz = -0.16; // 腾空收臂略张
      KLx = 0.75 * up; KRx = 1.0 * up; ELx = -0.5; ERx = -0.5;       // 蜷腿屈膝(起跳收得多)+ 屈肘,腾空更灵动
    } else if (gait > 0.12) {                                       // 走/跑:速度越快步幅越大
      const sw = Math.sin(walkPhase.current) * (0.6 + 0.42 * gait) * gait; // 步幅更大,迈腿更明显
      Lx = sw; Rx = -sw; ALx = 0.14 - sw * 0.72; ARx = 0.14 + sw * 0.72;   // 摆臂对侧于腿,前后甩动明显
      ALz = 0.06 + 0.05 * gait; ARz = -(0.06 + 0.05 * gait);       // 摆臂时手臂微外展,不蹭身体
      // 屈膝:摆动腿(前摆抬脚)膝盖弯起、支撑腿(后蹬)近伸直 → 告别剪刀直棍。相位 +0.5 让弯曲略提前,像真实抬脚。
      const kneeAmp = 0.6 + 0.5 * gait;
      KLx = 0.14 * gait + Math.max(0, -Math.sin(walkPhase.current + 0.5)) * kneeAmp;
      KRx = 0.14 * gait + Math.max(0, Math.sin(walkPhase.current + 0.5)) * kneeAmp;
      // 屈肘:手臂常带放松的弯(不再直棍),前摆时小臂再多收一点 → 自然甩臂
      ELx = -0.5 - Math.max(0, 0.14 - ALx) * 0.7;
      ERx = -0.5 - Math.max(0, 0.14 - ARx) * 0.7;
    } else {                                                        // 待机:轻摆 + 每 ~6.5s 抬提灯端详
      const sway = Math.sin(tw * 1.1) * 0.05;
      const gp = tw % 6.5; const lift = gp < 1.6 ? Math.sin((gp / 1.6) * Math.PI) : 0;
      ALx = 0.1 + sway; ARx = 0.1 - sway - lift * 0.95;
      ALz = 0.06; ARz = -0.06;                                      // 静息手臂自然微张
      KLx = 0.03 + Math.sin(tw * 1.6) * 0.015; KRx = 0.03 - Math.sin(tw * 1.6) * 0.015; // 膝随呼吸极轻屈伸,挺拔不僵
      ELx = -0.28; ERx = -0.28 - lift * 0.55;                        // 抬灯端详那侧屈肘,把灯举近脸前
    }
    if (sit.current > 0.01) {                                       // 久站坐下:屈膝抱坐 + 双手松搭膝上 + 极缓重心微晃 → 自然惬意,不僵成雕像
      const sv = sit.current;
      const seatSway = Math.sin(tw * 0.9) * 0.045 * sv;             // 坐着时缓缓换重心(左右腿/手臂反相微动)
      Lx = Lx * (1 - sv) + (1.4 + seatSway) * sv; Rx = Rx * (1 - sv) + (1.5 - seatSway) * sv; // 两腿略不对称更像真人
      KLx = KLx * (1 - sv) + 1.0 * sv; KRx = KRx * (1 - sv) + 0.9 * sv; // 小腿自然垂落(左右略不同)
      ALx = ALx * (1 - sv) + (0.42 + seatSway) * sv; ARx = ARx * (1 - sv) + (0.42 - seatSway) * sv;
      ALz = ALz * (1 - sv) + 0.14 * sv; ARz = ARz * (1 - sv) - 0.14 * sv; // 手臂内收搭膝
      ELx = ELx * (1 - sv) - 0.6 * sv; ERx = ERx * (1 - sv) - 0.6 * sv; // 手松松搭在膝上,肘自然弯
    }
    if (waveT.current > 0) {                                        // 招手(F / ✋):举手到头侧,主要靠肘/腕来回挥、手臂随之轻摆 → 暖而不僵
      const env = Math.max(0, Math.min((1.5 - waveT.current) * 3.6, waveT.current * 5, 1)); // 缓起~0.28s + 缓落~0.2s
      const w = Math.sin(tw * 7.2);                                 // 挥手节拍(~1.15Hz,温暖不机械,告别旧的 9.2 急抖)
      ALx = -1.85 * env;                                            // 大臂随 env 缓缓抬到头侧(不再瞬间弹到位)
      ALz = (0.5 + w * 0.22) * env;                                 // 向外打开 + 随挥轻摆(辅助,主挥在肘)
      ELx = -0.2 + (-0.95 + w * 0.55) * env;                        // 小臂折起把手举到头侧,肘/腕来回甩(主挥在这,幅度真实)
      ARx = 0.24; ARz = -0.07; ERx = -0.3;                          // 另一手自然垂落、略屈肘平衡
    }
    if (cheerT.current > 0) { ALx = -2.3; ARx = -2.3; ALz = 0.18; ARz = -0.18; ELx = -0.5; ERx = -0.5; } // 拾取欢呼:双手上举略张+屈肘
    if (fluteT.current > 0) {                                       // 吹笛:双臂抬到嘴前“持笛”,屈肘让手在嘴前会合,指尖随旋律轻颤
      const trill = Math.sin(tw * 11) * 0.05;
      ALx = -1.98 + trill; ARx = -1.9 - trill;
      ALz = 0.46; ARz = -0.46;                                      // 双臂内收,手在身前会合
      ELx = -0.6 - trill; ERx = -0.6 + trill;                       // 屈肘让前臂折回,持笛更像样
    }
    const kd = Math.min(1, dt * 13);                                // 阻尼系数(平滑跟随,告别僵硬)
    const kdWave = waveT.current > 0 ? Math.min(1, dt * 24) : kd;   // 招手侧手臂跟得更紧 → ~1.15Hz 的挥动不被低通阻尼磨平(原 9.2 急抖正是被磨平才显僵)
    if (!glbClipActive) {
      if (legL.current) legL.current.rotation.x += (Lx - legL.current.rotation.x) * kd;
      if (legR.current) legR.current.rotation.x += (Rx - legR.current.rotation.x) * kd;
      if (shinL.current) shinL.current.rotation.x += (KLx - shinL.current.rotation.x) * kd; // 小腿屈膝
      if (shinR.current) shinR.current.rotation.x += (KRx - shinR.current.rotation.x) * kd;
      if (armR.current) {
        armR.current.rotation.x += (ARx - armR.current.rotation.x) * kd;
        armR.current.rotation.z += (ARz - armR.current.rotation.z) * kd;
      }
      if (armL.current) {
        armL.current.rotation.x += (ALx - armL.current.rotation.x) * kdWave;
        armL.current.rotation.z += (ALz - armL.current.rotation.z) * kdWave;
      }
      if (foreArmR.current) foreArmR.current.rotation.x += (ERx - foreArmR.current.rotation.x) * kd; // 小臂屈肘
      if (foreArmL.current) foreArmL.current.rotation.x += (ELx - foreArmL.current.rotation.x) * kdWave;
      if (cape.current) {  // 披风随动:走动后摆 + 腾空上扬 + 轻微待机飘
        const t = s.clock.elapsedTime;
        const fly = airborne.current ? 0.4 : 0;
        cape.current.rotation.x = -0.12 * gait - fly + Math.sin(t * 1.6) * 0.05 + Math.sin(t * 0.6) * 0.03;
      }
    }

    // 笛子道具:吹奏时显形,随气息/指颤轻摆(rotation.x 由动画驱动,见下)。
    const fluteOn = fluteT.current > 0 && !(character === "guardian" && characterActionRef.current === "Flute");
    if (fluteRef.current) {
      fluteRef.current.visible = fluteOn;
      if (fluteOn) fluteRef.current.rotation.x = 0.14 + Math.sin(tw * 11) * 0.03 + Math.sin(tw * 1.7) * 0.02; // 指颤(快) + 气息(慢)
    }
    // 音符♪:按拍从笛口冒出(spawn 见上),沿世界坐标上飘、随风轻摆、快显末淡。
    const mouthY = pos.y + 1.16;
    for (let i = 0; i < NOTE_POOL; i++) {
      const sp = noteRefs.current[i];
      if (!sp) continue;
      const life = noteLife.current[i] ?? 0;
      if (life <= 0) { if (sp.visible) sp.visible = false; continue; }
      const nl = Math.max(0, life - dt / NOTE_TTL);
      noteLife.current[i] = nl;
      const k = 1 - nl;                                                // 0→1 上升进度
      sp.visible = true;
      sp.position.set(
        pos.x + (noteDX.current[i] ?? 0) * k + Math.sin(k * 6 + i) * 0.06, // 边升边随风左右摇
        mouthY + k * NOTE_RISE,
        pos.z + (noteDZ.current[i] ?? 0) * k,
      );
      const mat = sp.material as THREE.SpriteMaterial;
      const appear = Math.min(1, nl * 4);                             // 快显(出生瞬间淡入)
      const fade = nl < 0.45 ? nl / 0.45 : 1;                         // 末段淡出
      mat.opacity = Math.min(appear, fade) * 0.92;
      mat.rotation = (noteSpin.current[i] ?? 0) * k;                  // 轻轻打转
      const sc = 0.2 + k * 0.14;                                      // 越飘越大一点
      sp.scale.set(sc, sc, 1);
    }

    // 表情:auto 时按游戏状态切(招手/拾取→开心·跳跃→坚定·靠近→好奇·久站→平静),否则用手动选定;仅变化时切节点显隐
    let eff = expression || "auto";
    if (eff === "auto") {
      if (cheerT.current > 0 || waveT.current > 0) eff = "cheerful";
      else if (airborne.current) eff = "determined";
      else if (curiousT.current > 0) eff = "curious";
      else if (idleT.current > 6) eff = "calm";
      else eff = "cheerful";
    }
    if (eff !== lastFace.current && facesRef.current) {
      for (const k of ["cheerful", "calm", "determined", "curious"]) {
        const n = facesRef.current[k];
        if (n) n.visible = k === eff;
      }
      lastFace.current = eff;
    }

    // 第三人称跟随相机;开场从低位斜后方缓入,避免第一眼变成航拍全岛。
    const ry = g.rotation.y;
    // 放飞天灯后:相机仰起跟拍天灯升空(入 / 保持 / 出 缓动),约 6s 后回到角色
    let watch = 0;
    if (lanternCam.on) {
      lanternCam.t += dt;
      if (lanternCam.t > 6.2) lanternCam.on = false;
      else { const w = lanternCam.t; watch = w < 0.7 ? w / 0.7 : w > 4.6 ? Math.max(0, 1 - (w - 4.6) / 1.6) : 1; }
    }
    introT.current = Math.min(1, introT.current + dt / HEALING_WALK_CAMERA.introSeconds);
    if (introT.current < 1) {
      const e = introT.current * introT.current * (3 - 2 * introT.current); // smoothstep 缓动
      const ang = ry + (1 - e) * HEALING_WALK_CAMERA.introSideAngle; // 起始小侧偏 → 收束到身后
      const dist = CAM_DIST + (1 - e) * HEALING_WALK_CAMERA.introExtraDist;
      const ht = CAM_HEIGHT + (1 - e) * HEALING_WALK_CAMERA.introExtraHeight;
      _camTarget.set(pos.x - Math.sin(ang) * dist, pos.y + ht, pos.z - Math.cos(ang) * dist);
      _camVel.x = 0; _camVel.z = 0;
      resolveCollisions(collidersRef?.current ?? null, _camTarget, _camVel, HEALING_WALK_CAMERA.collisionRadius);
      camera.position.lerp(_camTarget, Math.min(1, dt * HEALING_WALK_CAMERA.followLerp));
    } else {
      // 跟拍天灯时:略微后撤 + 抬高,腾出仰视天空的余地
      const cd = CAM_DIST + HEALING_WALK_CAMERA.lanternExtraDist * watch;
      const ch = CAM_HEIGHT + HEALING_WALK_CAMERA.lanternExtraHeight * watch;
      _camTarget.set(pos.x - Math.sin(ry) * cd, pos.y + ch, pos.z - Math.cos(ry) * cd);
      // 轻量避障:相机若被丘陵/地形挡住(镜头处地面高于镜头 y),沿「角色→相机」方向抬一点、收近,
      // 避免穿山/卡到地下。纯解析判断(用 groundYWithRoad + 地标地坪抬升,无射线),零额外开销。
      const camGround = Math.max(groundYWithRoad(_camTarget.x, _camTarget.z).y, landmarkGroundLift(_camTarget.x, _camTarget.z));
      if (camGround > _camTarget.y - 0.5) {
        const push = Math.min(4.5, (camGround - (_camTarget.y - 0.5)) * 1.6);
        _camTarget.y += push;
        _camTarget.x -= Math.sin(ry) * -push * 0.4; // 沿镜头方向靠近角色一点
        _camTarget.z -= Math.cos(ry) * -push * 0.4;
      }
      _camVel.x = 0; _camVel.z = 0;
      resolveCollisions(collidersRef?.current ?? null, _camTarget, _camVel, HEALING_WALK_CAMERA.collisionRadius);
      camera.position.lerp(_camTarget, Math.min(1, dt * HEALING_WALK_CAMERA.followLerp));
    }
    // 注视点:平时看角色;放飞天灯后按 watch 缓动插值到天灯所在的高空(略抬,把上方烟花也带进画面)
    if (watch > 0) {
      const ly = lanternCam.gy + 1.3 + lanternRise(lanternCam.t) + 6;
      _camLookTarget.set(pos.x + (lanternCam.x - pos.x) * watch, pos.y + 1.5 + (ly - (pos.y + 1.5)) * watch, pos.z + (lanternCam.z - pos.z) * watch);
    } else {
      _camLookTarget.set(
        pos.x + Math.sin(ry) * HEALING_WALK_CAMERA.lookAhead,
        pos.y + HEALING_WALK_CAMERA.lookHeight,
        pos.z + Math.cos(ry) * HEALING_WALK_CAMERA.lookAhead,
      );
    }
    if (!camLookReady.current) {
      camLook.current.copy(_camLookTarget);
      camLookReady.current = true;
    } else {
      camLook.current.lerp(_camLookTarget, Math.min(1, dt * HEALING_WALK_CAMERA.lookLerp));
    }
    camera.lookAt(camLook.current);
    // 🛠️ DEBUG 鸟瞰:离线截图脚本设 window.__XYCAM={px,py,pz,tx,ty,tz} 时,相机改用该机位(查穿模用)。
    // 生产环境无此全局 → 整段跳过,零影响。覆盖在常规运镜之后,直接定死机位。
    const _dbgCam = (window as unknown as { __XYCAM?: { px: number; py: number; pz: number; tx: number; ty: number; tz: number } }).__XYCAM;
    if (_dbgCam) {
      camera.position.set(_dbgCam.px, _dbgCam.py, _dbgCam.pz);
      camera.up.set(0, 1, 0);
      camera.lookAt(_dbgCam.tx, _dbgCam.ty, _dbgCam.tz);
    }

    // 涉水时脚下泛起一圈圈涟漪
    if (ripple.current) {
      ripple.current.visible = wading;
      if (wading) {
        const t = (s.clock.elapsedTime * 0.8) % 1;
        const sc = 0.5 + t * 1.3;
        ripple.current.position.set(pos.x, 0.06, pos.z);
        ripple.current.scale.set(sc, sc, sc);
        (ripple.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.5;
      }
    }
  });

  return (
    <>
      <group ref={group}>
        {character === "hero" ? (
          <GltfHero actionRef={characterActionRef} />
        ) : character === "guardian" ? (
          <GltfGuardian legL={legL} legR={legR} armL={armL} armR={armR} shinL={shinL} shinR={shinR} foreArmL={foreArmL} foreArmR={foreArmR} cape={cape} faces={facesRef} actionRef={characterActionRef} />
        ) : character === "pocoyo" ? (
          <GltfPocoyo actionRef={characterActionRef} />
        ) : (
          <GltfAvatar avatar={avatar} legL={legL} legR={legR} armL={armL} armR={armR} />
        )}
        {/* 竹笛道具:仅吹奏时显形。横笛朝右伸出,前侧开吹/指孔,笛尾垂红流苏。挂在身上,随身体起伏转向。
            位置抬到嘴下(略低于音符冒出的 mouthY=+1.16),与抬起的双手会合,读作"贴唇吹奏"。 */}
        <group ref={fluteRef} visible={false} position={[0, 1.08, 0.22]}>
          <group rotation={[0, 0, Math.PI / 2]}>
            {/* 笛身(竹) */}
            <mesh material={fluteMats.body}>
              <cylinderGeometry args={[0.017, 0.017, 0.5, 12]} />
              <Outlines thickness={0.01} color="#2a2018" />
            </mesh>
            {/* 两道缠线(竹节) */}
            <mesh material={fluteMats.band} position={[0, 0.16, 0]}><cylinderGeometry args={[0.0195, 0.0195, 0.018, 12]} /></mesh>
            <mesh material={fluteMats.band} position={[0, -0.16, 0]}><cylinderGeometry args={[0.0195, 0.0195, 0.018, 12]} /></mesh>
            {/* 吹孔 + 三指孔(朝前的小孔) */}
            {[0.2, 0.05, -0.03, -0.11].map((y, i) => (
              <mesh key={i} material={fluteMats.band} position={[0, y, 0.016]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.006, 0.006, 0.012, 8]} />
              </mesh>
            ))}
          </group>
          {/* 笛尾红流苏 */}
          <mesh material={fluteMats.tassel} position={[0.265, -0.06, 0]} rotation={[0, 0, 0.12]}>
            <coneGeometry args={[0.016, 0.12, 6]} />
          </mesh>
        </group>
      </group>
      {/* 涉水涟漪(贴水面,世界坐标,跟随脚下) */}
      <mesh ref={ripple} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.5, 0.72, 24]} />
        <meshBasicMaterial color="#e6f6f8" transparent opacity={0.5} depthWrite={false} />
      </mesh>
      {/* 吹笛飘出的音符♪(世界坐标,从笛口升起;动画在 useFrame 里按生命池驱动) */}
      <group>
        {Array.from({ length: NOTE_POOL }).map((_, i) => (
          <sprite key={i} ref={(el) => { noteRefs.current[i] = el; }} visible={false} scale={[0.24, 0.24, 1]}>
            <spriteMaterial map={noteTex[i % noteTex.length]} transparent opacity={0} depthWrite={false} toneMapped={false} />
          </sprite>
        ))}
      </group>
    </>
  );
}

// 心愿之光收集物：玩家走近即收集(消失 + 计数)。距离检测在 useFrame,仅在「新收集」时回调 setState。
function Wishes({
  posRef,
  color,
  onCollect,
  total,
}: {
  posRef: React.RefObject<THREE.Vector3>;
  color: string;
  onCollect: () => void;
  total: number;
}) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const taken = useRef<boolean[]>(Array(total).fill(false));
  const spots = useMemo(() => {
    const out: { x: number; z: number; gy: number }[] = [];
    let tries = 0;
    while (out.length < total && tries < total * 30) {
      tries += 1;
      const ang = hash2(tries * 1.3, 7.7) * Math.PI * 2;
      const rad = (0.25 + hash2(tries * 2.1, 3.3) * 0.6) * WALK_RADIUS;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      out.push({ x, z, gy: exGroundY(x, z) }); // 地面高随静态坐标固定 → 预算一次,免每帧重算
    }
    return out;
  }, [total]);

  useFrame((state) => {
    const pos = posRef.current;
    if (!pos) return;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      if (taken.current[i]) continue;
      const g = refs.current[i];
      if (g) {
        g.position.y = s.gy + 0.55 + Math.sin(state.clock.elapsedTime * 2 + i) * 0.08;
        g.rotation.y += 0.02;
      }
      if (dist2(pos.x, pos.z, s.x, s.z) < 0.36) {
        taken.current[i] = true;
        if (g) g.visible = false;
        onCollect();
      }
    }
  });

  return (
    <>
      {spots.map((s, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[s.x, s.gy + 0.55, s.z]}
        >
          <GltfProp url={MODELS.wishlight} position={[0, 0, 0]} scale={0.5} tint={color} />
          <pointLight color={color} intensity={2} distance={2.2} decay={1.6} />
        </group>
      ))}
    </>
  );
}

// 心灵印记收集物:每条历史记忆 → 一枚发光印记(颜色随情绪),散落岛上。走近即拾起,弹出来源卡。
interface Imprint {
  emotion: string;
  label: string;
  color: string;
  when: string;
  words: string;
  line: string;
}

function GltfMemoryImprint({ imprint }: { imprint: Imprint }) {
  const entry = IMPRINT_3D_REGISTRY[imprintShapeForEmotion(imprint.emotion)];
  const { scene } = useGLTF(entry.url);
  const grad = useMemo(() => makeToonGradient(), []);
  const obj = useMemo(() => {
    const root = scene.clone(true);
    const tint = new THREE.Color(imprint.color);
    const cache = new Map<THREE.Material, THREE.Material>();
    const convert = (src: THREE.Material): THREE.Material => {
      const hit = cache.get(src);
      if (hit) return hit;
      const material = /emissive/i.test(src.name || "")
        ? new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 1.8, toneMapped: false })
        : new THREE.MeshToonMaterial({ color: tint, gradientMap: grad });
      cache.set(src, material);
      return material;
    };
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material as THREE.Material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
    });
    return root;
  }, [scene, grad, imprint.color]);
  useEffect(() => {
    return () => {
      grad.dispose();
      const seen = new Set<THREE.Material>();
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material as THREE.Material];
        materials.forEach((material) => {
          if (!seen.has(material)) {
            seen.add(material);
            material.dispose();
          }
        });
      });
    };
  }, [grad, obj]);
  return <primitive object={obj} scale={entry.scale} position={[0, entry.yOffset, 0]} />;
}

function GltfMemoryTree({ grad }: { grad: THREE.Texture }) {
  const { scene } = useGLTF(MODELS.memoryTree);
  const obj = useMemo(() => toonifyScene(scene, grad), [scene, grad]);
  return <primitive object={obj} scale={1.0} />;
}

function MemoryImprints({ posRef, imprints, onPick }: { posRef: React.RefObject<THREE.Vector3>; imprints: Imprint[]; onPick: (i: number) => void }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const taken = useRef<boolean[]>(imprints.map(() => false));
  const spots = useMemo(
    () =>
      imprints.map((_, i) => {
        const ang = hash2(i * 1.7 + 13, 7.7) * Math.PI * 2;
        const rad = (0.3 + hash2(i * 2.3 + 5, 3.3) * 0.55) * WALK_RADIUS;
        const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
        return { x, z, gy: exGroundY(x, z) }; // 静态坐标的地面高预算一次,免每帧重算
      }),
    [imprints],
  );
  useFrame((state) => {
    const pos = posRef.current;
    if (!pos) return;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      if (taken.current[i]) continue;
      const g = refs.current[i];
      if (g) {
        g.position.y = s.gy + 0.7 + Math.sin(state.clock.elapsedTime * 1.6 + i) * 0.12;
        g.rotation.y += 0.015;
      }
      if (dist2(pos.x, pos.z, s.x, s.z) < 6.76) {
        taken.current[i] = true;
        if (g) g.visible = false;
        onPick(i);
      }
    }
  });
  return (
    <>
      {spots.map((s, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }} position={[s.x, s.gy + 0.7, s.z]}>
          <GltfMemoryImprint imprint={imprints[i]} />
          {/* 用叠加辉光 sprite 代替逐印记 pointLight:同样发光,但 sprite 不计入实时光照——
              ① 省掉「N 枚印记 = N 个动态点光源」的每帧光照开销;
              ② 关键:拾起时原本会让场景点光源数 -1 → three.js 把光源数烘进 shader,数量一变就重新编译全场所有材质
                 → 每拾一枚都卡一下。改 sprite 后光源数恒定,拾取不再触发重编译,卡顿消除。 */}
          <sprite scale={[1.7, 1.7, 1.7]}>
            <spriteMaterial map={glowTexture()} color={imprints[i].color} transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
          </sprite>
        </group>
      ))}
    </>
  );
}

// 记忆之树:拾齐所有心灵印记后,在岛心长出——树冠是你收集到的每段情绪之色,轻轻明灭。
function MemoryTree({ colors }: { colors: string[] }) {
  const groupRef = useRef<THREE.Group>(null);
  const orbRefs = useRef<(THREE.Mesh | null)[]>([]);
  const baseY = exGroundY(0, 0);
  const grad = useMemo(() => makeToonGradient(), []);
  const orbMats = useMemo(() => colors.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.5, toneMapped: false })), [colors]);
  useEffect(() => () => { grad.dispose(); orbMats.forEach((m) => m.dispose()); }, [grad, orbMats]);
  const orbs = useMemo(
    () =>
      colors.map((_, i) => {
        const a = (i / Math.max(1, colors.length)) * Math.PI * 2 + i * 0.7;
        const r = 0.6 + (i % 2) * 0.5;
        return { x: Math.cos(a) * r, y: 3.3 + (i % 3) * 0.6, z: Math.sin(a) * r };
      }),
    [colors],
  );
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (groupRef.current) groupRef.current.position.y = baseY + Math.sin(t * 0.8) * 0.06;
    orbRefs.current.forEach((m, i) => {
      if (m) m.scale.setScalar(0.85 + Math.sin(t * 1.6 + i) * 0.18);
    });
  });
  return (
    <group ref={groupRef} position={[0, baseY, 0]}>
      <GltfMemoryTree grad={grad} />
      <pointLight position={[0, 3.8, 0]} color="#fff0c8" intensity={2.6} distance={8} decay={1.5} />
      {orbs.map((o, i) => (
        <mesh key={i} ref={(el) => { orbRefs.current[i] = el; }} material={orbMats[i]} position={[o.x, o.y, o.z]}>
          <icosahedronGeometry args={[0.2, 0]} />
        </mesh>
      ))}
    </group>
  );
}

// 程序生成的小镇:房子 + 店招/雨棚 + 路 + 护栏 + 树/灌木 + 路牌/灯/售货机/邮筒/长椅/木箱。
// toon 平涂,墨线由后期统一勾。
function Town({
  toonGrad,
  accent,
  collidersRef,
  isNight,
  revealDelay,
}: {
  toonGrad: THREE.Texture;
  accent: string;
  collidersRef?: React.RefObject<Map<string, Collider[]> | null>;
  isNight?: boolean;
  revealDelay: ExploreRevealDelay;
}) {
  const wall = useMemo(() => new THREE.MeshToonMaterial({ color: "#ece6d6", gradientMap: toonGrad }), [toonGrad]);
  const wall2 = useMemo(() => new THREE.MeshToonMaterial({ color: "#d6ccb4", gradientMap: toonGrad }), [toonGrad]);
  const wall3 = useMemo(() => new THREE.MeshToonMaterial({ color: "#c9b89a", gradientMap: toonGrad }), [toonGrad]);
  const roof = useMemo(() => new THREE.MeshToonMaterial({ color: "#a85a48", gradientMap: toonGrad }), [toonGrad]);
  const roof2 = useMemo(() => new THREE.MeshToonMaterial({ color: "#4f7a86", gradientMap: toonGrad }), [toonGrad]);
  const roof3 = useMemo(() => new THREE.MeshToonMaterial({ color: "#5b6b4a", gradientMap: toonGrad }), [toonGrad]);
  const wood = useMemo(() => new THREE.MeshToonMaterial({ color: "#7c6a52", gradientMap: toonGrad }), [toonGrad]);
  const trunk = useMemo(() => new THREE.MeshToonMaterial({ color: "#6a533c", gradientMap: toonGrad }), [toonGrad]);
  const leaf = useMemo(() => new THREE.MeshToonMaterial({ color: "#6fa867", gradientMap: toonGrad }), [toonGrad]);
  const leaf2 = useMemo(() => new THREE.MeshToonMaterial({ color: "#8bbd6b", gradientMap: toonGrad }), [toonGrad]); // 第二种叶色(暖黄绿,做树冠层次)
  const pine = useMemo(() => new THREE.MeshToonMaterial({ color: "#4f8a64", gradientMap: toonGrad }), [toonGrad]); // 针叶林(偏冷绿)
  const bush = useMemo(() => new THREE.MeshToonMaterial({ color: "#5b9457", gradientMap: toonGrad }), [toonGrad]);
  const dark = useMemo(() => new THREE.MeshToonMaterial({ color: "#3a4252", gradientMap: toonGrad }), [toonGrad]);
  const stone = useMemo(() => new THREE.MeshToonMaterial({ color: "#cabfa8", gradientMap: toonGrad }), [toonGrad]);
  const red = useMemo(() => new THREE.MeshToonMaterial({ color: "#c0504a", gradientMap: toonGrad }), [toonGrad]);
  const sign = useMemo(() => new THREE.MeshToonMaterial({ color: accent, gradientMap: toonGrad }), [toonGrad, accent]);
  const petal = useMemo(() => new THREE.MeshToonMaterial({ color: "#e89ab0", gradientMap: toonGrad }), [toonGrad]);
  const petal2 = useMemo(() => new THREE.MeshToonMaterial({ color: "#f3d27a", gradientMap: toonGrad }), [toonGrad]);
  const rock = useMemo(() => new THREE.MeshToonMaterial({ color: "#7c8794", gradientMap: toonGrad }), [toonGrad]);
  const pond = useMemo(() => new THREE.MeshToonMaterial({ color: "#5fb6c4", gradientMap: toonGrad, transparent: true, opacity: 0.88 }), [toonGrad]);
  const hay = useMemo(() => new THREE.MeshToonMaterial({ color: "#d8b86a", gradientMap: toonGrad }), [toonGrad]);
  const shell = useMemo(() => new THREE.MeshToonMaterial({ color: "#f0e0cf", gradientMap: toonGrad }), [toonGrad]);
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffe6a0", emissive: "#ffe6a0", emissiveIntensity: 2, toneMapped: false }), []);
  // 环岛柏油路:深灰柏油路面 + 双黄中线 + 浅灰路肩,与步行石板路明显区分(车可开,纯视觉无碰撞)
  // 环岛跑道:一张连续 ribbon 网格 + 烤好的路面纹理(深沥青 + 黄中线虚线 + 浅边线),替代旧的盒子分段
  const roadTex = useMemo(() => makeRingRoadTexture(), []);
  // polygonOffset:把路面深度往相机方向微偏,和压平后的地形再有零点几毫米的高度并列时,路面稳赢深度测试 → 杜绝接缝处 z-fighting 闪烁
  const roadMat = useMemo(() => new THREE.MeshToonMaterial({ map: roadTex, gradientMap: toonGrad, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), [roadTex, toonGrad]);
  useEffect(
    () => () => [wall, wall2, wall3, roof, roof2, roof3, wood, trunk, leaf, leaf2, pine, bush, dark, stone, red, sign, petal, petal2, rock, pond, hay, glow, roadMat, roadTex].forEach((m) => m.dispose()),
    [wall, wall2, wall3, roof, roof2, roof3, wood, trunk, leaf, leaf2, pine, bush, dark, stone, red, sign, petal, petal2, rock, pond, hay, glow, roadMat, roadTex],
  );
  // 浅滩礁石(岛外一圈水里)
  // 浅滩礁石(大岛外一圈水里)
  const rocks = useMemo(() => {
    const out: { x: number; z: number; s: number; ry: number }[] = [];
    for (let i = 0; i < 640; i++) {
      const a = hash2(i + 70, 4.4) * Math.PI * 2;
      const r = WALK_RADIUS + 1.5 + hash2(i + 70, 9.1) * 6.0;
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.6 + hash2(i + 70, 2.7) * 1.5, ry: hash2(i + 70, 1.1) * 3 });
    }
    return out;
  }, []);

  // 房子:沿一圈散布、朝向中心,大小/材质/店铺随机(填满大岛)
  const buildings = useMemo(() => {
    const wms = [wall, wall2, wall3];
    const rms = [roof, roof2, roof3];
    const out: { x: number; z: number; rot: number; w: number; d: number; h: number; wm: THREE.Material; rm: THREE.Material }[] = [];
    const spacer = makeSpacer(7); // 网格边长 ≥ 最大最小间距(7),房子之间留巷子、绝不互穿
    // 这是岛,不是城市:房子聚成一个中央村落,其余大片留给自然。小而矮的尖顶小屋。
    const VILLAGE = 26; // 中央村落
    const cluster = Math.min(34, WALK_RADIUS * 0.2);
    for (let i = 0; i < VILLAGE; i++) {
      const a = hash2(i, 1.1) * Math.PI * 2;
      const r = 4 + Math.sqrt(hash2(i, 2.2)) * cluster;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (isBeachOrWater(x, z)) continue; // 村落房子也不落在沙滩 / 水里
      if (nearIsleProp(x, z, 1.0)) continue; // 不叠在神社 / 水井 / 凉亭等设施上
      if (!spacer(x, z, 6.5)) continue; // 房子互不重叠
      out.push({
        x,
        z,
        rot: hash2(i, 3.3) * Math.PI * 2,
        w: 1.8 + hash2(i, 4.4) * 1.0,
        d: 1.8 + hash2(i, 5.5) * 0.8,
        h: 1.5 + hash2(i, 6.6) * 1.0,
        wm: wms[i % 3],
        rm: rms[i % 3],
      });
    }
    const COTTAGES = 16; // 岛上零星独立小屋
    for (let i = 0; i < COTTAGES; i++) {
      const a = (i / COTTAGES) * Math.PI * 2 + hash2(i + 50, 1.7) * 1.2;
      const r = WALK_RADIUS * (0.28 + hash2(i + 50, 2.3) * 0.58);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // 清掉落在环岛柏油路上的独立小屋(房子有碰撞,不清则车穿模撞墙)。路带 = 路面半宽 + 房子半径 + 余量
      if (distToRoadCenter(x, z) < ROAD_HALF_W + 4) continue;
      if (isBeachOrWater(x, z)) continue; // 小屋不建在沙滩 / 水里
      if (onLandmarkPad(x, z)) continue; // 小屋不压地标地坪/裙边
      if (nearIsleProp(x, z, 1.0)) continue;
      if (!spacer(x, z, 7)) continue; // 与村落 / 彼此都不重叠
      out.push({
        x,
        z,
        rot: hash2(i + 50, 3.1) * Math.PI * 2,
        w: 1.7 + hash2(i + 50, 4.2) * 0.7,
        d: 1.7 + hash2(i + 50, 5.1) * 0.6,
        h: 1.4 + hash2(i + 50, 6.3) * 0.7,
        wm: wms[i % 3],
        rm: rms[(i + 1) % 3],
      });
    }
    return out;
  }, [wall, wall2, wall3, roof, roof2, roof3]);

  const bushes = useMemo(() => {
    const out: { x: number; z: number; s: number }[] = [];
    const spacer = makeSpacer(2.6);
    for (let i = 0; i < 2400; i++) {
      const a = hash2(i + 20, 5.5) * Math.PI * 2;
      const r = 2 + Math.sqrt(hash2(i + 20, 8.8)) * (WALK_RADIUS * 0.96 - 2);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (isBeachOrWater(x, z)) continue; // 灌木只长草地
      if (onLandmarkPad(x, z)) continue; // 地标地坪 + 裙边缓坡上不生灌木(同树)
      if (distToRoadCenter(x, z) < ROAD_HALF_W + 1.5) continue; // 清掉环岛柏油路上的灌木(否则穿透路面)
      if (nearIsleProp(x, z, 0.6)) continue; // 不堵在设施/石阶门口(原 0.3 太贴,会蹭进门廊)
      let onHouse = false;
      for (const b of buildings) { if (Math.hypot(x - b.x, z - b.z) < Math.max(b.w, b.d) * 0.7 + 1.0) { onHouse = true; break; } } // 不长进房子(同树,只是余量略小)
      if (onHouse) continue;
      if (!spacer(x, z, 2.2)) continue; // 最小间距:不堆叠(更密的林下灌木)
      out.push({ x, z, s: 0.6 + hash2(i + 20, 1.4) * 0.6 });
    }
    return out;
  }, [buildings]);

  // 主路 + 一条支路(逐块贴地,横跨大岛)
  const pathTiles = useMemo(() => {
    const out: { x: number; z: number; rot: number }[] = [];
    const L = WALK_RADIUS * 0.92;
    const M = 96;
    for (let i = 0; i < M; i++) {
      const t = i / (M - 1);
      const x = (t - 0.5) * 2 * L;
      const z = Math.sin(t * Math.PI * 1.4) * L * 0.32;
      if (onLandmarkPad(x, z)) continue; // 方砖步道不铺上地标台坪/裙边(否则平砖按裸地形高散落在抬升台坡上 → 半埋/悬空穿插)
      out.push({ x, z, rot: Math.cos(t * Math.PI * 1.4) * 0.5 });
    }
    const B = 22;
    for (let i = 0; i < B; i++) {
      const t = i / (B - 1);
      const x = Math.sin(t * Math.PI) * 2.0 - 1.0;
      const z = (t - 0.5) * 2 * (L * 0.7);
      if (onLandmarkPad(x, z)) continue; // 纵向支路同理(它纵穿浴场/街区台坪)
      out.push({ x, z, rot: Math.PI / 2 + Math.cos(t * Math.PI) * 0.4 });
    }
    return out;
  }, []);

  // ── 环岛柏油路(车专属大环线) ──────────────────────────────────────────
  // 中心线采样 + 平滑高度在模块加载时已算好(roadGround.pts),地形/车/路贴图三处共用同一份。
  // 这里直接引用,不再重复计算,保证三者严格一致 → 路面不悬空、车不颠。
  const ringRoad = useMemo(() => roadGround.pts as { x: number; z: number; y: number; yaw: number }[], []);


  // 点到环路的最近距离:用模块级 distToRoadCenter(roadGround.pts 在模块加载时已填),不再单独 memo。

  // 护栏:大岛缘一整圈
  const fence = useMemo(() => {
    const out: { x: number; z: number; rot: number }[] = [];
    const fr = FENCE_RADIUS;
    const n = Math.round((2 * Math.PI * fr) / 1.6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * fr;
      const z = Math.sin(a) * fr;
      if (isBeachFenceGap(x, z)) continue;
      out.push({ x, z, rot: a });
    }
    return out;
  }, []);

  // 电线杆(沿主路一侧)
  const poleSpots = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    const L = WALK_RADIUS * 0.9;
    const N = 18;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x = (t - 0.5) * 2 * L;
      const z = Math.sin(t * Math.PI * 1.4) * L * 0.32 + 2.2;
      if (onLandmarkPad(x, z)) continue; // 杆不立在地标地坪/裙边上(否则埋进被抬升的坪里、电线横穿台顶 → 穿模)
      out.push({ x, z });
    }
    return out;
  }, []);

  // 电线杆 3 段几何各自的实例数据(原本每杆一个 group+3 mesh → 现每种几何一次实例绘制)
  const poleItems = useMemo<InstItem[]>(() => poleSpots.map((p) => ({ p: [p.x, exGroundY(p.x, p.z) + 1.15, p.z] })), [poleSpots]);
  const crossAItems = useMemo<InstItem[]>(() => poleSpots.map((p) => ({ p: [p.x, exGroundY(p.x, p.z) + 2.1, p.z] })), [poleSpots]);
  const crossBItems = useMemo<InstItem[]>(() => poleSpots.map((p) => ({ p: [p.x, exGroundY(p.x, p.z) + 1.85, p.z] })), [poleSpots]);
  // 电线(每档再细分多段:杆顶间走直线下垂,遇土丘/地坪则随地抬起 → 永不穿地、不横切台顶)。
  // 直接产出 InstItem[](单位柱按段长 sv.y 缩放 + quat→euler 朝向),整片电线一次实例绘制。
  const wireItems = useMemo<InstItem[]>(() => {
    const out: InstItem[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const SEG = 5;         // 每档分段数(够贴合起伏,绘制量仍很小)
    const TOP = 2.3;       // 线在杆顶的离地高
    const MIN_CLEAR = 1.4; // 跨档离地最小净空(翻过土丘也不入地)
    for (let i = 0; i < poleSpots.length - 1; i++) {
      const a = poleSpots[i];
      const b = poleSpots[i + 1];
      // 整档若有任一处掠过地标地坪 → 不连这档(否则线横穿被抬升的台顶);相邻杆被剔除后留下的大跨档也由此挡掉
      let skip = false;
      for (let s = 0; s <= SEG; s++) { const t = s / SEG; if (onLandmarkPad(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) { skip = true; break; } }
      if (skip) continue;
      const ay = exGroundY(a.x, a.z) + TOP;
      const by = exGroundY(b.x, b.z) + TOP;
      let px = a.x, py = ay, pz = a.z;
      for (let s = 1; s <= SEG; s++) {
        const t = s / SEG;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const y = Math.max(ay + (by - ay) * t, exGroundY(x, z) + MIN_CLEAR); // 直线垂落,遇地形隆起则抬起
        const dx = x - px, dy = y - py, dz = z - pz;
        const len = Math.hypot(dx, dy, dz);
        q.setFromUnitVectors(up, dir.set(dx, dy, dz).normalize());
        e.setFromQuaternion(q);
        out.push({ p: [(px + x) / 2, (py + y) / 2, (pz + z) / 2], sv: [1, len, 1], r: [e.x, e.y, e.z] });
        px = x; py = y; pz = z;
      }
    }
    return out;
  }, [poleSpots]);

  // 路灯排(沿主路另一侧)
  const lampRow = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    const L = WALK_RADIUS * 0.85;
    const N = 15;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x = (t - 0.5) * 2 * L;
      const z = Math.sin(t * Math.PI * 1.4) * L * 0.32 - 2.0;
      if (onLandmarkPad(x, z)) continue; // 路灯同理不立在地标坪上(否则灯柱埋进抬升的台坪 → 穿模)
      out.push({ x, z });
    }
    return out;
  }, []);

  const dashes = useMemo(() => pathTiles.filter((_, i) => i % 2 === 0), [pathTiles]);

  const flowers = useMemo(() => {
    const out: { x: number; z: number; c: number }[] = [];
    const spacer = makeSpacer(1.5);
    for (let i = 0; i < 4200; i++) {
      const a = hash2(i + 40, 2.1) * Math.PI * 2;
      const r = 1.5 + Math.sqrt(hash2(i + 40, 6.3)) * (WALK_RADIUS * 0.95 - 1.5);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (isBeachOrWater(x, z)) continue; // 花不开在沙滩 / 水里
      if (onLandmarkPad(x, z)) continue; // 不开在地标地坪/裙边(否则浮在台坡上)
      if (distToRoadCenter(x, z) < ROAD_HALF_W + 1.2) continue; // 清掉环岛柏油路上的小花(否则穿透路面)
      if (nearIsleProp(x, z, 0.5)) continue; // 不从神社/水井/石阶等设施里钻出来
      let inHouse = false;
      for (const b of buildings) { if (Math.hypot(x - b.x, z - b.z) < Math.max(b.w, b.d) * 0.7 + 0.4) { inHouse = true; break; } } // 不从屋里长出来(贴墙脚仍可)
      if (inHouse) continue;
      if (!spacer(x, z, 1.4)) continue; // 轻度去重,打散成片堆叠
      out.push({ x, z, c: i % 2 });
    }
    return out;
  }, [buildings]);

  const trees = useMemo(() => {
    const out: { x: number; z: number; s: number; pineKind: boolean; warm: boolean }[] = [];
    const spacer = makeSpacer(5.0); // 网格边长 ≥ 最大最小间距(5.0)才能保证 3×3 邻域覆盖
    // 候选加密到 2600:间距器削掉过密的堆叠、空处被均匀填满 → 真实森林的「多删少补」。
    for (let i = 0; i < 5500; i++) {
      const a = hash2(i + 1, 3.3) * Math.PI * 2;
      const r = 2.2 + Math.sqrt(hash2(i + 1, 7.1)) * (WALK_RADIUS * 0.97 - 2.2);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (isBeachOrWater(x, z)) continue; // 不长在沙滩 / 海里
      // 清出大地标 / 中心设施 / 民居,避免树穿过建筑
      if (onLandmarkPad(x, z)) continue; // 地标地坪 + 裙边缓坡上不长树(否则按原地形贴地会沉进裙边/穿模)
      if (nearIsleProp(x, z, 1.5)) continue;
      let onHouse = false;
      for (const b of buildings) { if (Math.hypot(x - b.x, z - b.z) < Math.max(b.w, b.d) * 0.7 + 2.0) { onHouse = true; break; } }
      if (onHouse) continue;
      // 环岛路净空(加宽到 4.5,树冠不压路面)
      if (distToRoadCenter(x, z) < ROAD_HALF_W + 4.5) continue;
      const high = groundYWithRoad(x, z).y > 9; // 高地
      const pine = high ? hash2(i + 1, 8.8) < 0.62 : hash2(i + 1, 8.8) < 0.26; // 高处针叶林更多 → 真实垂直植被带
      const minD = pine ? 4.0 : 4.8; // 阔叶冠大 → 间距更大;松较窄可更密成林(树干仍不互插)
      if (!spacer(x, z, minD)) continue; // 最小间距:消除树干 / 树冠互插
      out.push({
        x,
        z,
        s: 0.9 + hash2(i + 1, 2.2) * 0.7,
        pineKind: pine,
        warm: hash2(i + 1, 4.5) > 0.62, // 部分阔叶偏暖绿,做色彩层次
      });
    }
    return out;
  }, [buildings]); // 依赖 buildings 做避让(均为稳定 memo)
  // 陆地石块 / 巨砾:给森林坡地添自然岩石。同样「只长草地 + 间距 + 避路/设施/建筑/树」,带碰撞体不被穿过。
  const landRocks = useMemo(() => {
    const out: { x: number; z: number; s: number; rot: number }[] = [];
    const spacer = makeSpacer(4);
    for (let i = 0; i < 460; i++) {
      const a = hash2(i + 730, 2.9) * Math.PI * 2;
      const r = 8 + Math.sqrt(hash2(i + 730, 5.7)) * (WALK_RADIUS * 0.95 - 8);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (isBeachOrWater(x, z)) continue; // 石块也只落在草地(不进海/沙)
      if (onLandmarkPad(x, z)) continue; // 地标地坪 + 裙边缓坡上不落石(同树)
      if (nearIsleProp(x, z, 1.0)) continue;
      if (distToRoadCenter(x, z) < ROAD_HALF_W + 3.0) continue; // 不堵路面
      let blocked = false;
      for (const b of buildings) { if (Math.hypot(x - b.x, z - b.z) < Math.max(b.w, b.d) * 0.7 + 1.5) { blocked = true; break; } }
      if (!blocked) for (const t of trees) { if (Math.hypot(x - t.x, z - t.z) < 2.0) { blocked = true; break; } } // 不压树干
      if (blocked) continue;
      if (!spacer(x, z, 3.5)) continue;
      out.push({ x, z, s: 0.6 + hash2(i + 730, 7.3) * 1.5, rot: hash2(i + 730, 9.1) * 6.28 });
    }
    return out;
  }, [buildings, trees]);
  // 障碍碰撞体:树(整株)+ 房子(占地)+ 石块 + 大地标 → 空间网格,交给 Player 逐帧解算(玩家撞不进去)
  useEffect(() => {
    if (!collidersRef) return;
    const list: Collider[] = [];
    for (const t of trees) list.push({ x: t.x, z: t.z, r: 0.5 + t.s * 0.12 }); // 树:树干 + 下层树冠
    for (const rk of landRocks) list.push({ x: rk.x, z: rk.z, r: 0.4 + rk.s * 0.5 }); // 石块:按体量给碰撞圈
    for (const b of buildings) list.push({ x: b.x, z: b.z, r: Math.max(b.w, b.d) * 0.62 }); // 房子占地
    const lhX = -WALK_RADIUS * 0.92;
    const lhZ = -WALK_RADIUS * 0.3;
    // 大地标坐标须与 Town/Village 中 GltfProp 摆放一致(鸟居是可穿过的门,不设碰撞)
    list.push(
      { x: lhX, z: lhZ, r: 2.4 }, // 灯塔
      { x: lhX + 8, z: lhZ + 6, r: 1.5 }, // 灯塔看守屋
      { x: -WALK_RADIUS * 0.35, z: WALK_RADIUS * 0.45, r: 1.9 }, // 风车
      { x: 7, z: -7, r: 1.4 }, // 神社
      { x: -4.0, z: 0.6, r: 0.7 }, // 售货机
      { x: -7, z: 6, r: 1.6 }, // 凉亭
      { x: 5, z: -5, r: 0.9 }, // 水井
      { x: -10, z: -2, r: 1.3 }, // 藤架
      { x: 6, z: 7.5, r: 1.1 }, // 摊位
      { x: -13, z: -8, r: 1.4 }, // 帐篷
      { x: 13, z: -9, r: 1.3 }, // 瞭望台
    );
    // 汽车不入碰撞网格(可上车驾驶,会移动;走近即可按 E 上车)
    // 杜鹃花:小灌木碰撞
    for (const rh of RHODOS) list.push({ x: rh.x, z: rh.z, r: 0.55 + rh.s * 0.15 });
    // 浴场 / 街区 / 山庄:沿地坪铺满互叠碰撞圈(贴边也不穿模);浴场正面台阶留出可走入口
    for (const c of fillPadColliders(BATH.x, BATH.z, 10, [BATH_FRONT_OPENING])) list.push(c);
    for (const c of fillPadColliders(BLOCK.x, BLOCK.z, 7.5)) list.push(c);
    for (const c of fillPadColliders(MANOR.x, MANOR.z, 9)) list.push(c);
    // 近海可达地形(车/人会撞到):梯田 / 海蚀洞 / 崖 + 5 根风铃柱(坐标须与 Coastline/WindChimes 一致)
    list.push(
      { x: Math.cos(2.0) * WALK_RADIUS * 0.4, z: Math.sin(2.0) * WALK_RADIUS * 0.4, r: 1.6 }, // 梯田
      { x: Math.cos(-1.2) * WALK_RADIUS * 0.97, z: Math.sin(-1.2) * WALK_RADIUS * 0.97, r: 1.8 }, // 海蚀洞
      { x: Math.cos(5.5) * WALK_RADIUS * 0.985, z: Math.sin(5.5) * WALK_RADIUS * 0.985, r: 2.0 }, // 崖
    );
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.7, rr = WALK_RADIUS * (0.42 + (i % 2) * 0.16); list.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, r: 0.5 }); } // 风铃柱
    // 村落散布道具 + 岛上独立装置 + 东岸停船:这些实心可达物原来没碰撞,玩家能直接穿过/踩踏 → 补上(坐标与各自 GltfProp 渲染一致)
    list.push(
      { x: 1.6, z: 2.2, r: 0.45 }, // 邮筒
      { x: -1.8, z: 2.6, r: 0.7 }, // 长椅
      { x: 3.4, z: -0.6, r: 0.6 }, // 木箱堆
      { x: 0.8, z: 1.4, r: 0.35 }, // 路牌
      { x: -6, z: -3, r: 1.0 }, // 村口篝火
      { x: 9, z: -4, r: 0.5 }, // 风铃(岛上装饰,非风铃柱玩法的那 5 根)
      { x: -5, z: -8, r: 1.1 }, // 秋千架
      { x: WALK_RADIUS + 2, z: 2.5, r: 1.4 }, { x: WALK_RADIUS + 1, z: -2.2, r: 1.4 }, { x: WALK_RADIUS + 3.2, z: 0.2, r: 1.4 }, // 东岸停泊小船
    );
    // 石阶:实心 + 可踩 → 由 stairsGroundLift 斜坡贴地负责拾级而上,这里只补两侧栏挡圆防侧穿;不再用单挡圈(那样只能绕、踩不上去)
    for (const c of stairRailColliders()) list.push(c);
    // 心屿湾海滩固体(棕榈/草棚/篝火/小船/潮池/指路牌/海螺礁/藏宝箱)碰撞体 —— 与渲染同一数据源,绝不脱节
    for (const c of getBeach().colliders) list.push(c);
    collidersRef.current = buildColliderGrid(list);
  }, [trees, buildings, landRocks, collidersRef]);

  const mushrooms = useMemo(() => {
    const out: { x: number; z: number; s: number; red: boolean }[] = [];
    const spacer = makeSpacer(2.2);
    for (let i = 0; i < 150; i++) {
      const a = hash2(i + 510, 1.7) * Math.PI * 2;
      const r = 4 + Math.sqrt(hash2(i + 510, 3.1)) * (WALK_RADIUS * 0.9 - 4);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (isBeachOrWater(x, z)) continue; // 蘑菇只长林间草地
      if (onLandmarkPad(x, z)) continue; // 不长在地标地坪/裙边
      if (distToRoadCenter(x, z) < ROAD_HALF_W + 1.0) continue; // 蘑菇也避开路面
      if (nearIsleProp(x, z, 0.5)) continue; // 不从设施/石阶里钻出来
      let inHouse = false;
      for (const b of buildings) { if (Math.hypot(x - b.x, z - b.z) < Math.max(b.w, b.d) * 0.7 + 0.5) { inHouse = true; break; } } // 不从屋里冒出来(树底下仍可,森林蘑菇本就该长树根旁)
      if (inHouse) continue;
      if (!spacer(x, z, 1.8)) continue; // 自身不再堆成一坨(原先无间距,常见两三朵叠穿)
      out.push({ x, z, s: 0.7 + hash2(i + 510, 5.2) * 0.7, red: hash2(i + 510, 6.4) > 0.45 });
    }
    return out;
  }, [buildings]);

  // 实例化用的共享几何
  const gTrunk = useMemo(() => new THREE.CylinderGeometry(0.07, 0.1, 0.8, 6), []);
  const gLeaf = useMemo(() => new THREE.IcosahedronGeometry(0.5, 0), []);
  const gBush = useMemo(() => new THREE.IcosahedronGeometry(0.32, 0), []);
  const gFlower = useMemo(() => new THREE.IcosahedronGeometry(0.09, 0), []);
  const gRock = useMemo(() => new THREE.IcosahedronGeometry(0.6, 0), []);
  const gBuoy = useMemo(() => new THREE.ConeGeometry(0.28, 0.7, 8), []);
  const gFencePost = useMemo(() => new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5), []);
  const gFenceRail = useMemo(() => new THREE.BoxGeometry(0.06, 0.1, 1.5), []);
  const gPathTile = useMemo(() => new THREE.BoxGeometry(1.4, 1.2, 0.06), []);
  const gDash = useMemo(() => new THREE.BoxGeometry(0.2, 0.55, 0.04), []);
  const gUnitBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []); // 房子体(非均匀缩放)
  const gRoofPeak = useMemo(() => new THREE.ConeGeometry(0.72, 1, 4), []); // 四坡尖顶(小屋感)
  const gDoor = useMemo(() => new THREE.BoxGeometry(0.5, 1.0, 0.06), []);
  const gWindow = useMemo(() => new THREE.BoxGeometry(0.46, 0.46, 0.05), []);
  const gHay = useMemo(() => new THREE.CylinderGeometry(0.5, 0.5, 0.7, 8), []);
  const gShell = useMemo(() => new THREE.ConeGeometry(0.14, 0.1, 7), []); // 沙滩贝壳/卵石
  const gPine = useMemo(() => new THREE.ConeGeometry(0.5, 0.95, 7), []); // 针叶树冠(分层堆叠)
  const gMushStem = useMemo(() => new THREE.CylinderGeometry(0.04, 0.055, 0.18, 6), []);
  const gMushCap = useMemo(() => new THREE.SphereGeometry(0.13, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), []); // 蘑菇伞盖(半球)
  const gLily = useMemo(() => new THREE.CircleGeometry(0.42, 9), []); // 荷叶
  // 电线杆 / 电线实例化几何(原本逐杆 3 mesh + 逐段电线 = ~135 draw call;实例化后每种 1 次绘制)
  const gPole = useMemo(() => new THREE.CylinderGeometry(0.06, 0.08, 2.3, 6), []); // 杆柱
  const gCrossA = useMemo(() => new THREE.BoxGeometry(0.9, 0.07, 0.07), []); // 横担(长)
  const gCrossB = useMemo(() => new THREE.BoxGeometry(0.7, 0.07, 0.07), []); // 横担(短)
  const gWire = useMemo(() => new THREE.CylinderGeometry(0.02, 0.02, 1, 4), []); // 电线(单位高,按段长 sv.y 缩放)
  // 环岛柏油路几何:路面(宽 6) + 双黄中线短块 + 浅灰路肩(窄长条,非均匀缩放铺长)
  // 环岛跑道带状几何(沿 ringRoad 生成连续 ribbon,raise=0.08 稳稳压在压平后的地基上,period=6m 一段中线虚线)
  const roadRibbonGeo = useMemo(() => buildRingRoadGeometry(ringRoad, ROAD_HALF_W, ROAD_SURFACE_RAISE, 6), [ringRoad]);
  useEffect(
    () => () => [gTrunk, gLeaf, gBush, gFlower, gRock, gBuoy, gFencePost, gFenceRail, gPathTile, gDash, gUnitBox, gRoofPeak, gDoor, gWindow, gHay, gPine, gMushStem, gMushCap, gLily, gPole, gCrossA, gCrossB, gWire, roadRibbonGeo].forEach((g) => g.dispose()),
    [gTrunk, gLeaf, gBush, gFlower, gRock, gBuoy, gFencePost, gFenceRail, gPathTile, gDash, gUnitBox, gRoofPeak, gDoor, gWindow, gHay, gPine, gMushStem, gMushCap, gLily, gPole, gCrossA, gCrossB, gWire, roadRibbonGeo],
  );

  // 实例化布点(由散布数组换算到世界矩阵)
  // 整株 glb 的实例布点(基座落地;glb 自带树干/树冠/各部件)
  // 高度统一走 groundYWithRoad:近环岛路处地形已被压平到路面高度,若仍按 exGroundY(原始丘陵)
  // 摆放,会整片悬空或陷入地下、穿透路面 = 穿模。远离路面时 groundYWithRoad === exGroundY,其余区域零影响。
  const broadItems = useMemo(() => trees.filter((t) => !t.pineKind).map((t) => ({ p: [t.x, groundYWithRoad(t.x, t.z).y, t.z] as [number, number, number], s: t.s, r: [0, hash2(t.x + 9, 5.1) * 6.28, 0] as [number, number, number] })), [trees]);
  const pineItems = useMemo(() => trees.filter((t) => t.pineKind).map((t) => ({ p: [t.x, groundYWithRoad(t.x, t.z).y, t.z] as [number, number, number], s: t.s, r: [0, hash2(t.z + 9, 5.1) * 6.28, 0] as [number, number, number] })), [trees]);
  const mushItems = useMemo(() => mushrooms.map((mu) => ({ p: [mu.x, groundYWithRoad(mu.x, mu.z).y, mu.z] as [number, number, number], s: mu.s })), [mushrooms]);
  const bushItems = useMemo(() => bushes.map((b) => ({ p: [b.x, groundYWithRoad(b.x, b.z).y, b.z] as [number, number, number], s: b.s })), [bushes]);
  const flowerItems = useMemo(() => flowers.map((f) => ({ p: [f.x, groundYWithRoad(f.x, f.z).y, f.z] as [number, number, number], s: 1 })), [flowers]);
  const rockItems = useMemo(() => rocks.map((r) => ({ p: [r.x, -0.1, r.z] as [number, number, number], s: r.s, r: [0, r.ry, 0] as [number, number, number] })), [rocks]);
  const landRockItems = useMemo(() => landRocks.map((rk) => ({ p: [rk.x, groundYWithRoad(rk.x, rk.z).y - 0.08, rk.z] as [number, number, number], s: rk.s, r: [0, rk.rot, 0] as [number, number, number] })), [landRocks]);
  // glb 自然/道具几何:取出几何+材质组,喂 InstancedMesh(整株批量绘制,不掉帧)。modelScale 由实测 glb 高度对齐旧程序化尺寸。
  const { scene: pineScene } = useGLTF(MODELS.natPine);
  const { scene: broadScene } = useGLTF(MODELS.natBroad);
  const { scene: bushScene } = useGLTF(MODELS.natBush);
  const { scene: flowerScene } = useGLTF(MODELS.natFlowers);
  const { scene: rockScene } = useGLTF(MODELS.natRock);
  const { scene: mushScene } = useGLTF(MODELS.natMushroom);
  const { scene: cropSproutScene } = useGLTF(MODELS.natCropSprout);
  const { scene: buoyScene } = useGLTF(MODELS.townBuoy);
  const { scene: hayScene } = useGLTF(MODELS.townHaystack);
  const pineG = useMemo(() => glbInstanceGeo(pineScene, toonGrad, 0.55), [pineScene, toonGrad]);
  const broadG = useMemo(() => glbInstanceGeo(broadScene, toonGrad, 0.6), [broadScene, toonGrad]);
  const bushG = useMemo(() => glbInstanceGeo(bushScene, toonGrad, 0.5), [bushScene, toonGrad]);
  const flowerG = useMemo(() => glbInstanceGeo(flowerScene, toonGrad, 0.5), [flowerScene, toonGrad]);
  const rockG = useMemo(() => glbInstanceGeo(rockScene, toonGrad, 0.5), [rockScene, toonGrad]);
  const mushG = useMemo(() => glbInstanceGeo(mushScene, toonGrad, 0.9), [mushScene, toonGrad]);
  const cropSproutG = useMemo(() => glbInstanceGeo(cropSproutScene, toonGrad, 0.95), [cropSproutScene, toonGrad]);
  const buoyG = useMemo(() => glbInstanceGeo(buoyScene, toonGrad, 0.9), [buoyScene, toonGrad]);
  const hayG = useMemo(() => glbInstanceGeo(hayScene, toonGrad, 0.9), [hayScene, toonGrad]);

  // 浮标(实例化,水里漂)
  const buoyItems = useMemo(() => {
    const out: { p: [number, number, number]; s: number }[] = [];
    for (let i = 0; i < 150; i++) {
      const a = hash2(i + 130, 3.7) * Math.PI * 2;
      const r = WALK_RADIUS + 3 + hash2(i + 130, 5.2) * 46;
      out.push({ p: [Math.cos(a) * r, 0.18, Math.sin(a) * r], s: 0.7 + hash2(i + 130, 1.9) * 0.6 });
    }
    return out;
  }, []);
  // 小船(停泊在东岸栈桥附近的浅水)
  const boats = useMemo(
    () =>
      [
        { x: WALK_RADIUS + 2, z: 2.5, rot: -0.6 },
        { x: WALK_RADIUS + 1, z: -2.2, rot: 0.5 },
        { x: WALK_RADIUS + 3.2, z: 0.2, rot: -0.2 },
      ],
    [],
  );
  // 沙滩遮阳伞:东南岸聚成一片"海湾沙滩",另沿岸零散几把(摆在近水沙带上)
  // 阳伞 / 浴巾 / 吊床 已并入「心屿湾」海滩布局(getBeach → Coastline 渲染),此处不再单独散布。
  // 贝壳/卵石:沿整圈沙地零散,海湾里更密
  const shellItems = useMemo(() => {
    const out: { p: [number, number, number]; s: number; r: [number, number, number] }[] = [];
    const beachA = 0.55;
    for (let i = 0; i < 60; i++) {
      const inBay = i < 34;
      const a = inBay ? beachA + (hash2(i + 110, 2.2) - 0.5) * 0.6 : hash2(i + 110, 3.4) * Math.PI * 2;
      const r = WALK_RADIUS * (0.95 + hash2(i + 110, 4.6) * 0.1);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      out.push({ p: [x, Math.max(exGroundY(x, z), 0.04) + 0.04, z], s: 0.6 + hash2(i + 110, 8.1) * 0.7, r: [Math.PI, hash2(i + 110, 9.2) * 6.28, 0] });
    }
    return out;
  }, []);

  // 护栏 / 路砖 / 中线 实例化布点(原本是绘制大户)
  const fencePosts = useMemo(() => fence.map((p) => ({ p: [p.x, exGroundY(p.x, p.z) + 0.45, p.z] as [number, number, number], s: 1, r: [0, p.rot, 0] as [number, number, number] })), [fence]);
  const fenceRails = useMemo(() => fence.map((p) => ({ p: [p.x, exGroundY(p.x, p.z) + 0.62, p.z] as [number, number, number], s: 1, r: [0, p.rot + Math.PI / 2, 0] as [number, number, number] })), [fence]);
  // 方砖 / 中线虚线贴「路地面」(groundYWithRoad,含近环路压平),不再用裸 exGroundY:
  // 这条步道东西向横穿全岛、会进入环岛路带,用裸地形高度会让砖块在已压平的路基上方悬空/陷入 → 改用同一套地面函数后严丝贴地。
  const pathItems = useMemo(() => pathTiles.map((p) => ({ p: [p.x, groundYWithRoad(p.x, p.z).y + 0.02, p.z] as [number, number, number], s: 1, r: [-Math.PI / 2, 0, p.rot] as [number, number, number] })), [pathTiles]);
  const dashItems = useMemo(() => dashes.map((p) => ({ p: [p.x, groundYWithRoad(p.x, p.z).y + 0.05, p.z] as [number, number, number], s: 1, r: [-Math.PI / 2, 0, p.rot] as [number, number, number] })), [dashes]);

  // 环岛跑道改为连续 ribbon(roadRibbonGeo + roadMat),路面/中线/边线全烤进一张纹理,
  // 曲线与坡道都无缝连续 → 不再有盒子分段在弯道内侧重叠、外侧露空隙的问题。

  // 房子:用 glb 模型替换旧程序化方块屋(循环 7 种民居款,朝向村心,缩放由旧「体宽」派生)。
  // 灯塔看守屋不进循环(它专属灯塔旁,在 Village 里单独摆)。
  const houseProps = useMemo(() => {
    const models = [MODELS.houseCottage, MODELS.houseMachiya, MODELS.houseLoft, MODELS.houseShop, MODELS.houseCafe, MODELS.houseRound, MODELS.houseVilla];
    return buildings.map((b, i) => ({
      url: models[i % models.length],
      p: [b.x, groundYWithRoad(b.x, b.z).y, b.z] as [number, number, number], // 近路散布小屋同样贴压平后的路面地基,避免悬空/陷地
      r: [0, Math.atan2(b.x, b.z) + (b.rot - Math.PI) * 0.14, 0] as [number, number, number], // 朝村心 + 轻微随机偏转
      s: 0.62 + (b.w - 1.7) * 0.18,
    }));
  }, [buildings]);

  // 农田:村外几块地,成排作物(实例化)+ 干草垛(乡野气息)
  const farms = useMemo(
    () => [
      { x: -58, z: -22, rot: 0.25, w: 16, d: 11 },
      { x: 50, z: 46, rot: -0.4, w: 14, d: 10 },
      { x: 14, z: -68, rot: 0.5, w: 13, d: 9 },
    ],
    [],
  );
  const cropItems = useMemo(() => {
    const out: InstItem[] = [];
    const sp = 1.3;
    for (const f of farms) {
      const c = Math.cos(f.rot);
      const s = Math.sin(f.rot);
      const nx = Math.floor(f.w / sp);
      const nz = Math.floor(f.d / sp);
      for (let ix = 0; ix < nx; ix++) {
        for (let iz = 0; iz < nz; iz++) {
          const lx = (ix - (nx - 1) / 2) * sp;
          const lz = (iz - (nz - 1) / 2) * sp;
          const wx = f.x + lx * c - lz * s;
          const wz = f.z + lx * s + lz * c;
          if (onLandmarkPad(wx, wz)) continue; // 作物不长在地标地坪/裙边上(否则沉进/穿出被抬升的台坡)
          if (Math.hypot(wx - POND.x, wz - POND.z) < POND_CROP_CLEARANCE) continue; // 第二块农田贴近池塘,留出水面和岸边空间
          out.push({ p: [wx, exGroundY(wx, wz), wz], r: [0, f.rot, 0] });
        }
      }
    }
    return out;
  }, [farms]);
  const hayItems = useMemo(() => {
    const out: InstItem[] = [];
    for (const f of farms) {
      for (let k = 0; k < 3; k++) {
        const wx = f.x + (hash2(f.x + k, 1.3) - 0.5) * f.w * 1.4;
        const wz = f.z + (hash2(f.z + k, 2.7) - 0.5) * f.d * 1.4;
        if (onLandmarkPad(wx, wz)) continue; // 干草垛同样避开地标地坪/裙边
        out.push({ p: [wx, exGroundY(wx, wz), wz], s: 0.8 + hash2(k, 3.1) * 0.5 });
      }
    }
    return out;
  }, [farms]);
  const ritualArtifacts = useMemo<RitualArtifactPlacement[]>(
    () => [
      { key: "paper_boat", x: WALK_RADIUS * 0.3 - 1.2, z: WALK_RADIUS * 0.3 + 3.8, rot: 0.7, scale: 0.95 },
      { key: "candle", x: -WALK_RADIUS * 0.92 + 4.2, z: -WALK_RADIUS * 0.3 + 2.8, rot: -0.4, scale: 0.9 },
      { key: "feather", x: -2.6, z: 5.2, rot: 1.2, scale: 0.9 },
      { key: "leaf_note", x: WALK_RADIUS * 0.3 - 5.6, z: WALK_RADIUS * 0.3 - 1.5, rot: -0.6, scale: 0.9 },
      { key: "star_wish", x: -18.5, z: -18.0, rot: 0.9, scale: 0.8 },
      { key: "sail", x: WALK_RADIUS + 4.8, z: -5.5, rot: -0.35, scale: 0.3 },
      { key: "silent_shell", x: Math.cos(0.42) * WALK_RADIUS * 0.94, z: Math.sin(0.42) * WALK_RADIUS * 0.94, rot: 1.5, scale: 0.85 },
      { key: "glyph_stone", x: WALK_RADIUS * 0.3 + 7.8, z: WALK_RADIUS * 0.3 + 2.6, rot: Math.PI + 0.2, scale: 0.68 },
      { key: "bloom", x: 18.5, z: -18.0, rot: -0.2, scale: 0.9 },
    ],
    [],
  );

  return (
    <group>
      {/* 房子(glb,替换旧程序化方块屋;26 村落 + 16 散布,循环 7 种民居款) */}
      {houseProps.map((h, i) => (
        <GltfProp key={`house${i}`} url={h.url} grad={toonGrad} position={h.p} rotation={h.r} scale={h.s} />
      ))}

      {/* 路面方砖(实例化) */}
      <InstancedField geo={gPathTile} material={stone} items={pathItems} />

      {/* 环岛跑道(车专属大环线):一条连续 ribbon 网格,路面/黄中线虚线/边线全在纹理里。纯视觉无碰撞,车可自由碾过/偏离。 */}
      <mesh geometry={roadRibbonGeo} material={roadMat} renderOrder={1} />

      {/* 岛缘护栏(实例化:柱 + 横杆) */}
      <InstancedField geo={gFencePost} material={wood} items={fencePosts} />
      <InstancedField geo={gFenceRail} material={wood} items={fenceRails} />

      {/* 灌木(glb) */}
      {bushG && <InstancedField geo={bushG.geometry} material={bushG.material} items={bushItems} />}

      {/* 邮筒(glb) */}
      <GltfProp url={MODELS.townMailbox} grad={toonGrad} position={[1.6, exGroundY(1.6, 2.2), 2.2]} rotation={[0, -0.5, 0]} scale={1.0} />

      {/* 长椅(glb) */}
      <GltfProp url={MODELS.townBench} grad={toonGrad} position={[-1.8, exGroundY(-1.8, 2.6), 2.6]} rotation={[0, 0.4, 0]} scale={1.0} />

      {/* 木箱堆(glb) */}
      <GltfProp url={MODELS.townCrate} grad={toonGrad} position={[3.4, exGroundY(3.4, -0.6), -0.6]} rotation={[0, 0.3, 0]} scale={1.0} />
      {/* 树 / 蘑菇(glb 整株,InstancedMesh 批量,每材质组一次绘制) */}
      {broadG && <InstancedField geo={broadG.geometry} material={broadG.material} items={broadItems} />}
      {pineG && <InstancedField geo={pineG.geometry} material={pineG.material} items={pineItems} />}
      {mushG && <InstancedField geo={mushG.geometry} material={mushG.material} items={mushItems} />}
      {/* 路牌(glb) */}
      <GltfProp url={MODELS.townSignpost} grad={toonGrad} position={[0.8, exGroundY(0.8, 1.4), 1.4]} rotation={[0, 0.3, 0]} scale={1.0} />
      {/* 灯柱 ×2(glb + 暖光) */}
      {([[-2.4, 2.6], [2.8, -1.2]] as const).map(([x, z], i) => (
        <group key={i} position={[x, exGroundY(x, z), z]}>
          <GltfProp url={MODELS.townLamppost} grad={toonGrad} position={[0, 0, 0]} scale={1.0} />
          {isNight && <pointLight position={[0, 2.6, 0]} color="#ffe6a0" intensity={2.4} distance={4.5} decay={1.6} />}
        </group>
      ))}
      {/* 售货机(glb) */}
      <GltfProp url={MODELS.vending} grad={toonGrad} position={[-4.0, exGroundY(-4.0, 0.6), 0.6]} rotation={[0, 0.8, 0]} scale={0.7} />

      {/* 电线杆(实例化:杆柱 / 长横担 / 短横担 各一次绘制,替代原逐杆 group+3 mesh) */}
      <InstancedField geo={gPole} material={dark} items={poleItems} />
      <InstancedField geo={gCrossA} material={dark} items={crossAItems} />
      <InstancedField geo={gCrossB} material={dark} items={crossBItems} />

      {/* 电线(实例化:单位柱按段长 sv.y 缩放 + quat→euler 朝向,整片一次绘制) */}
      <InstancedField geo={gWire} material={dark} items={wireItems} />

      {/* 路灯排(glb + 暖光) */}
      {lampRow.map((p, i) => (
        <group key={i} position={[p.x, exGroundY(p.x, p.z), p.z]}>
          <GltfProp url={MODELS.townLamppost} grad={toonGrad} position={[0, 0, 0]} scale={0.95} />
          {isNight && <pointLight position={[0, 2.5, 0]} color="#ffe6a0" intensity={2} distance={4} decay={1.6} />}
        </group>
      ))}

      {/* 路面中线虚线(实例化) */}
      <InstancedField geo={gDash} material={wall} items={dashItems} />

      {/* 鸟居(glb,主路尽头的入口地标,跨在路上) */}
      <GltfProp url={MODELS.torii} grad={toonGrad} position={[-WALK_RADIUS * 0.9, exGroundY(-WALK_RADIUS * 0.9, 0), 0]} rotation={[0, Math.PI / 2, 0]} scale={0.78} />

      {/* 小花(glb 花丛) */}
      {flowerG && <InstancedField geo={flowerG.geometry} material={flowerG.material} items={flowerItems} />}

      {/* 农田作物(glb) + 干草垛(glb) */}
      {cropSproutG && <InstancedField geo={cropSproutG.geometry} material={cropSproutG.material} items={cropItems} />}
      {hayG && <InstancedField geo={hayG.geometry} material={hayG.material} items={hayItems} />}

      {/* 中央广场(铺石) */}
      <mesh material={stone} position={[0, exGroundY(0, 0) + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4.5, 32]} />
      </mesh>

      {/* 木栈桥(glb,从大岛东岸伸进海里;原点在陆端,+Z 朝海 → 转 +90° 朝 +X) */}
      <GltfProp url={MODELS.pier} grad={toonGrad} position={[WALK_RADIUS - 1.5, -0.35, 0]} rotation={[0, Math.PI / 2, 0]} scale={0.5} />

      {/* 浅滩礁石(glb) */}
      {rockG && <InstancedField geo={rockG.geometry} material={rockG.material} items={rockItems} />}
      {rockG && <InstancedField geo={rockG.geometry} material={rockG.material} items={landRockItems} />}

      {/* 小神社(glb,岛上地标) */}
      <GltfProp url={MODELS.shrine} grad={toonGrad} position={[7, exGroundY(7, -7), -7]} rotation={[0, 0.5, 0]} scale={0.8} />

      {/* 灯塔(glb,呼应心屿灯塔) */}
      <group position={[-WALK_RADIUS * 0.92, exGroundY(-WALK_RADIUS * 0.92, -WALK_RADIUS * 0.3), -WALK_RADIUS * 0.3]}>
        <GltfProp url={MODELS.lighthouse} grad={toonGrad} position={[0, 0, 0]} scale={0.6} />
        {isNight && <pointLight position={[0, 9.6, 0]} color="#ffeec0" intensity={8} distance={22} decay={1.3} />}
      </group>

      {/* 小船(glb,停泊在东岸) */}
      {boats.map((b, i) => (
        <GltfProp key={i} url={MODELS.boat} grad={toonGrad} position={[b.x, 0.2, b.z]} rotation={[0, b.rot, 0]} scale={0.42} />
      ))}

      {/* 浮标(glb,水里漂) */}
      {buoyG && <InstancedField geo={buoyG.geometry} material={buoyG.material} items={buoyItems} />}

      {/* 阳伞 / 浴巾 → 已并入海滩布局(Coastline) */}
      {/* 贝壳 / 卵石(实例化,沿岸沙地) */}
      <InstancedField geo={gShell} material={shell} items={shellItems} />

      {/* 风车(glb,岛屿地标;叶片 Blades 节点缓缓自转) */}
      <GltfProp url={MODELS.windmill} grad={toonGrad} position={[-WALK_RADIUS * 0.35, exGroundY(-WALK_RADIUS * 0.35, WALK_RADIUS * 0.45), WALK_RADIUS * 0.45]} scale={0.78} spin={{ node: "Blades", speed: -0.9, axis: "y" }} />

      {/* 汽车(glb,村里停一辆;toon 卡通 + 可上车驾驶)——3.4M 重模型,独立 Suspense 边界:
          首屏地形/小物件先可见可走,车随后异步浮现,不再整场景卡在加载界面 */}
      <DelayedMount ms={revealDelay.car}>
        <Suspense fallback={null}>
          <DrivableCar grad={toonGrad} />
        </Suspense>
      </DelayedMount>
      <TireDust />

      {/* 写实重地标:延迟挂载 + 独立 Suspense,错开几秒在「世界已可走」后逐个到位,深 clone 不卡进岛首帧。
          延迟「轻→重」错峰:街区 → 杜鹃 → 山庄 → 浴场(28M 最重,最后)。 */}
      {/* 建筑街区(写实地标,村南) */}
      <DelayedMount ms={revealDelay.townblock}>
        <Suspense fallback={null}>
          <LandmarkOnPad cfg={BLOCK} url={MODELS.townblock} padR={7.5} grad={toonGrad} />
        </Suspense>
      </DelayedMount>

      {/* 杜鹃花(写实灌木,花丛点缀) */}
      <DelayedMount ms={revealDelay.rhododendron}>
        <Suspense fallback={null}>
          {RHODOS.map((r, i) => (
            <GltfProp key={`rh${i}`} url={MODELS.rhododendron} raw position={[r.x, exGroundY(r.x, r.z) + 1.0 * r.s, r.z]} rotation={[0, hash2(r.x + 2.3, 3.1) * 6.28, 0]} scale={r.s} />
          ))}
        </Suspense>
      </DelayedMount>

      {/* 山庄(复用 villa 精模放大为西侧第三座大地标;toon 卡通材质,带地坪+碰撞,不穿模) */}
      <DelayedMount ms={revealDelay.manor}>
        <Suspense fallback={null}>
          <LandmarkOnPad cfg={MANOR} url={MODELS.houseVilla} padR={9} grad={toonGrad} raw={false} />
        </Suspense>
      </DelayedMount>

      {/* 罗马浴场建筑群(写实地标,村北;28M 最重 → 最后挂载) */}
      <DelayedMount ms={revealDelay.bath}>
        <Suspense fallback={null}>
          <LandmarkOnPad cfg={BATH} url={MODELS.bathhouse} padR={10} grad={toonGrad} />
        </Suspense>
      </DelayedMount>

      {/* 池塘 + 芦苇 */}
      <mesh material={pond} position={[WALK_RADIUS * 0.3, exGroundY(WALK_RADIUS * 0.3, WALK_RADIUS * 0.3) + 0.04, WALK_RADIUS * 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[6, 30]} />
      </mesh>
      {/* 河灯(glb,漂在池塘上——呼应「放河灯」仪式) */}
      {([[-2.2, 1.4], [1.6, -1.8], [2.8, 2.2]] as const).map(([dx, dz], i) => {
        const pcx = WALK_RADIUS * 0.3;
        const py = exGroundY(pcx, pcx) + 0.14;
        return <GltfProp key={`riverlamp${i}`} url={MODELS.riverlamp} grad={toonGrad} position={[pcx + dx, py, pcx + dz]} rotation={[0, i * 1.3, 0]} scale={0.7} />;
      })}
      {/* 荷叶 + 荷花 */}
      {Array.from({ length: 9 }).map((_, k) => {
        const a = hash2(k + 600, 1.3) * Math.PI * 2;
        const rr = Math.sqrt(hash2(k + 600, 2.4)) * 4.6;
        const px = WALK_RADIUS * 0.3 + Math.cos(a) * rr;
        const pz = WALK_RADIUS * 0.3 + Math.sin(a) * rr;
        const py = exGroundY(WALK_RADIUS * 0.3, WALK_RADIUS * 0.3) + 0.07;
        const s = 0.7 + hash2(k + 600, 3.5) * 0.7;
        return (
          <group key={`lily${k}`} position={[px, py, pz]}>
            <mesh geometry={gLily} material={leaf} rotation={[-Math.PI / 2, 0, hash2(k + 600, 4.6) * 6.28]} scale={s} />
            {hash2(k + 600, 7.7) > 0.55 && (
              <mesh material={petal} position={[0, 0.12 * s, 0]} scale={0.5 * s}>
                <icosahedronGeometry args={[0.16, 0]} />
              </mesh>
            )}
          </group>
        );
      })}
      {Array.from({ length: 16 }).map((_, k) => {
        const a = (k / 16) * Math.PI * 2;
        const px = WALK_RADIUS * 0.3 + Math.cos(a) * 6.3;
        const pz = WALK_RADIUS * 0.3 + Math.sin(a) * 6.3;
        return (
          <mesh key={k} material={bush} position={[px, exGroundY(px, pz) + 0.4, pz]}>
            <cylinderGeometry args={[0.03, 0.05, 0.85, 4]} />
          </mesh>
        );
      })}

      {/* 石灯笼已抽成可点亮 / 熄灭的 <StoneLanterns/>(渲染于 ExploreScene,需 posRef 做就近探测) */}
      {/* 仪式艺术品散布岛上(对应岛屿仪式 ARTIFACTS) */}
      {ritualArtifacts.map((item) => (
        <RitualArtifactProp key={item.key} item={item} grad={toonGrad} />
      ))}
      {/* 篝火(村口空地) */}
      <group position={[-6, exGroundY(-6, -3), -3]}>
        <GltfProp url={MODELS.bonfire} grad={toonGrad} position={[0, 0, 0]} scale={1.0} />
        <pointLight position={[0, 0.7, 0]} color="#ff9a4a" intensity={3} distance={7} decay={1.6} />
      </group>
      {/* 心境石(海湾沙地 + 池畔) */}
      {([[Math.cos(0.5) * WALK_RADIUS * 0.9, Math.sin(0.5) * WALK_RADIUS * 0.9], [Math.cos(0.62) * WALK_RADIUS * 0.86, Math.sin(0.62) * WALK_RADIUS * 0.86], [WALK_RADIUS * 0.3 + 6.5, WALK_RADIUS * 0.3 + 1]] as const).map(([cx, cz], i) => (
        <GltfProp key={`cairn${i}`} url={MODELS.cairn} grad={toonGrad} position={[cx, exGroundY(cx, cz), cz]} rotation={[0, i * 1.1, 0]} scale={0.85} />
      ))}
      {/* 贝壳(海湾沙地,精模点缀) */}
      {([[Math.cos(0.48) * WALK_RADIUS * 0.95, Math.sin(0.48) * WALK_RADIUS * 0.95], [Math.cos(0.58) * WALK_RADIUS * 0.93, Math.sin(0.58) * WALK_RADIUS * 0.93]] as const).map(([sx, sz], i) => (
        <GltfProp key={`shell${i}`} url={MODELS.shell} grad={toonGrad} position={[sx, Math.max(exGroundY(sx, sz), 0.05) + 0.03, sz]} rotation={[0, i * 2, 0]} scale={1.1} />
      ))}
      {/* 夜来香(神社旁) */}
      {([[5.5, -7.5], [8.2, -6.4]] as const).map(([fx, fz], i) => (
        <GltfProp key={`nf${i}`} url={MODELS.nightflower} grad={toonGrad} position={[fx, exGroundY(fx, fz), fz]} scale={1.2} />
      ))}
      {/* 风筝(风车上空,随风轻摆) */}
      <FloatSway url={MODELS.kite} grad={toonGrad} position={[-WALK_RADIUS * 0.35 + 6, exGroundY(-WALK_RADIUS * 0.35, WALK_RADIUS * 0.45) + 7, WALK_RADIUS * 0.45 - 3]} baseRotation={[0, Math.PI, 0]} scale={1.4} amp={0.5} speed={0.9} />
    </group>
  );
}

// NPC:程序生成的卡通小人(与主角同套,原创),不同衣色,在村里/海滩/农田慢慢溜达。
// 共享几何/材质 + 单 useFrame 驱动全部(性能友好)。
// 走近 NPC 会说的话(分村民 / 海滩 / 农人三组语气,温柔、岛屿风)
const NPC_LINES_VILLAGE = [
  "你也来岛上走走啊？慢慢来，不着急。",
  "这村子小是小，住着挺安心的。",
  "遇见你，今天就有点不一样了。",
  "灯塔晚上一直亮着，不怕迷路的。",
  "走累了，就找个屋檐底下歇歇。",
];
const NPC_LINES_BEACH = [
  "今天的海，看起来很温柔呢。",
  "我在沙滩上坐了一下午，舒服得很。",
  "把心事说给海听，它会替你记着。",
  "脱了鞋踩踩沙子吧，凉凉的。",
  "浪一遍遍地来，又一遍遍地走，挺好。",
];
const NPC_LINES_FARM = ["今年的庄稼，长得不赖。", "对土地好一点，它就给你结果。", "地里的活儿急不来，歇会儿吧。"];
// 情绪联动：你带着什么心情上岛，第一句话就会被对方读出来(由 visual.motion 决定)
const MOOD_LINES: Record<SceneMotionMood, string> = {
  soothe: "今天的你，看起来平静了些，真好。",
  bright: "你今天气色真好，是遇上什么好事了吧？",
  restless: "别太急——岛会一直在这儿等你。",
  heavy: "看你眉头紧着……要不，先坐下歇会儿？",
};
// 送出心愿后对方的道谢
const GRATEFUL_LINES = [
  "谢谢你，我会把它种在心里。",
  "收到啦——这份心意，沉甸甸的。",
  "你也要记得，对自己好一点。",
  "这份温柔，我替这座岛收下了。",
];
// 接真实情绪:岛上的人会"读出"你这次上岛带的心情(后端识别的 emotion),开场更贴你
const EMOTION_OPENERS: Record<string, string> = {
  sad: "今天的你，心里是不是沉沉的？没关系，慢慢说给岛听。",
  anxious: "深呼吸——这座岛上，没有什么需要你赶着做。",
  tired: "看你累着了，先找个地方坐下来歇歇吧。",
  lonely: "一个人来的？没事，岛上有我们陪着你呢。",
  calm: "今天的你看着很安稳，真好。",
  happy: "你今天笑意都藏不住啦，是遇上好事了吧？",
  angry: "心里有团火也没关系，海风会帮你吹一吹的。",
  helpless: "就算现在什么都做不了，你能来这儿，就已经很好了。",
};
const NPC_TOTAL = 9 + 6 + 3; // 岛上 NPC 总数(村民+海滩+农人)→ 送完所有人触发庆祝
const TALK_RANGE = 4.6; // 走到这么近,对方就会停下跟你说话
const BAY_ANGLE = 0.55; // 东南海湾中心方位(海滩 / 浅滩都聚在这一侧)
const BAY_WIDTH = 0.55; // 海湾角度半宽(高斯落差)
const WADE_FLOOR = -0.32; // 涉水时脚最深到这里(没到小腿,不沉底)
// 海湾遮罩:0..1,海湾中心最大 —— 决定哪里能多走出去 / 哪里铺浅滩
function bayMask(wx: number, wz: number): number {
  let d = Math.atan2(wz, wx) - BAY_ANGLE;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.exp(-(d * d) / (BAY_WIDTH * BAY_WIDTH));
}

// ============================== 心屿湾 · 海滩单一数据源 ==============================
// 在「海岸坐标系」(u 沿岸 / v 离岸,正交单位基 → 世界距离 = √(du²+dv²),重叠检测即在此系内)
// 里精心铺陈整片海滩。computeBeach() 一次算出:① dress 静态道具 ② colliders 碰撞体
// ③ 各彩蛋坐标。Coastline 渲染道具、Town 追加碰撞体、彩蛋组件取各自坐标 —— 位置与碰撞永不脱节。
type BeachItem = { url: string; x: number; z: number; y: number; rot: number; s: number };
type Pt = { x: number; z: number };
type BeachLayout = {
  dress: BeachItem[];
  colliders: Collider[];
  crab: Pt; turtle: Pt; turtleSea: Pt;
  jelly: Pt[];
  conch: { x: number; z: number; y: number; rot: number };
  treasure: { x: number; z: number; y: number; rot: number };
  footprints: { x: number; z: number; rot: number }[];
  along: { x: number; z: number }; // 沿岸单位向量(供彩蛋复用)
  waterY: number;
};

// 各模型局部最低点(Blender 实测) → 贴地时 y = max(地面,floor) − baseY·scale,使最低面正好落在沙面
const BEACH_BASE_Y: Record<string, number> = {
  palm: -0.02, rowboat: 0, firepit: -0.06, sign: 0, bucket: 0, conch: -0.13, turtle: -0.17, chest: -0.08,
  deckchair: 0, surfboard: -0.16, tikihut: 0, dunegrass: 0, ball: 0, sandcastle: 0.02, driftwood: 0.03, tidepool: 0.01, coral: -0.17, starfish: -0.09, parasol: 0, towel: 0, hammock: 0,
};

let _beach: BeachLayout | null = null;
function getBeach(): BeachLayout {
  if (_beach) return _beach;
  const A = BAY_ANGLE;
  const BR = WALK_RADIUS * 0.9;                       // 干沙带锚点半径
  const cx0 = Math.cos(A) * BR, cz0 = Math.sin(A) * BR;
  const rx = Math.cos(A), rz = Math.sin(A);           // 离岸单位(+v → 朝海)
  const tx = -Math.sin(A), tz = Math.cos(A);          // 沿岸单位(+u)
  const W = (u: number, v: number): [number, number] => [cx0 + u * tx + v * rx, cz0 + u * tz + v * rz];
  const g = (x: number, z: number, by: number, s: number): number => Math.max(exGroundY(x, z), WADE_FLOOR) - by * s;
  const faceSea = Math.atan2(rx, rz);                 // 正脸朝 +Y(Blender)→ -Z;面朝海
  const alongRot = Math.atan2(tx, tz);
  const dress: BeachItem[] = [];
  const colliders: Collider[] = [];
  const add = (url: string, key: string, u: number, v: number, s: number, rot: number, col?: number) => {
    const [x, z] = W(u, v);
    dress.push({ url, x, z, y: g(x, z, BEACH_BASE_Y[key] ?? 0, s), rot, s });
    if (col) colliders.push({ x, z, r: col });
  };

  // —— 干沙后排:棕榈林 + 草棚 + 篝火 + 指路牌 ——
  add(MODELS.beachPalm, "palm", -16, -7, 1.3, 2.1, 0.55);
  add(MODELS.beachPalm, "palm", -9, -9.5, 1.55, 0.7, 0.62);
  add(MODELS.beachPalm, "palm", 11, -8.5, 1.4, 3.6, 0.58);
  add(MODELS.beachPalm, "palm", 18.5, -6, 1.2, 5.0, 0.5);
  add(MODELS.beachTikihut, "tikihut", 0, -7.5, 1.0, faceSea, 1.7);
  add(MODELS.beachFirepit, "firepit", -19, -1.5, 1.0, 0, 1.1);
  add(MODELS.beachSign, "sign", 6.5, -8, 1.0, 0.3, 0.35);
  // —— 中段躺椅 / 阳伞 / 毛巾 / 吊床 ——
  add(MODELS.beachDeckchair, "deckchair", -6, -3.5, 0.95, faceSea, 0);
  add(MODELS.beachDeckchair, "deckchair", -2.6, -4, 0.95, faceSea + 0.25, 0);
  add(MODELS.townParasol, "parasol", -4.4, -5.4, 1.05, 0, 0);
  add(MODELS.townParasol, "parasol", 3.2, -4.6, 1.1, 0, 0);
  add(MODELS.townParasol, "parasol", 14.5, -7.5, 1.0, 0, 0);
  add(MODELS.isleHammock, "hammock", 15, -6.4, 0.9, alongRot, 0.7);
  for (let i = 0; i < 5; i++) {
    const tu = -7 + i * 2.4 + (hash2(i + 70, 1.3) - 0.5) * 1.2, tv = -2.4 + (hash2(i + 70, 3.7) - 0.5) * 1.6;
    add(MODELS.townTowel, "towel", tu, tv, 1.0, hash2(i + 70, 5.5) * 6.28, 0);
  }
  // —— 玩具区:沙堡 + 沙桶 + 沙滩球 ——
  add(MODELS.beachSandcastle, "sandcastle", 4.5, 1, 0.85, 0.4, 0.7);
  add(MODELS.beachBucket, "bucket", 6.2, 1.4, 0.9, 1.0, 0);
  add(MODELS.beachBall, "ball", 2, 2.2, 0.8, 0, 0);
  // —— 潮间带:漂木 + 潮池 + 珊瑚 + 海星 + 沙草 ——
  add(MODELS.beachDriftwood, "driftwood", 9, 5, 0.95, 1.2, 0);
  add(MODELS.beachTidepool, "tidepool", 16.5, 4.5, 0.85, 0, 0.8);
  add(MODELS.beachCoral, "coral", 18, 6, 0.7, 0.5, 0);
  add(MODELS.beachSurfboard, "surfboard", 1, 8, 0.9, alongRot, 0);
  for (let i = 0; i < 6; i++) {
    const su = -14 + hash2(i + 40, 2.1) * 30, sv = 2.5 + hash2(i + 40, 4.2) * 5.5;
    add(MODELS.beachStarfish, "starfish", su, sv, 0.7 + hash2(i + 40, 6.3) * 0.2, hash2(i + 40, 7.4) * 6.28, 0);
  }
  for (let i = 0; i < 4; i++) {
    const du = -21 + i * 14 + (hash2(i + 55, 1.9) - 0.5) * 4, dv = -4 + (hash2(i + 55, 3.1) - 0.5) * 3;
    add(MODELS.beachDunegrass, "dunegrass", du, dv, 1.0 + hash2(i + 55, 5.2) * 0.4, hash2(i + 55, 6.1) * 6.28, 0);
  }
  // —— 沙滩小船(沿岸而卧,长船身 3 点碰撞) ——
  {
    const s = 1.0, [bx, bz] = W(-12.5, 4.5), rot = alongRot;
    dress.push({ url: MODELS.beachRowboat, x: bx, z: bz, y: g(bx, bz, 0, s), rot, s });
    const dirx = Math.cos(rot), dirz = -Math.sin(rot);              // 模型局部 +X 经 Y 旋转后的世界方向
    for (const off of [-1.5 * s, 0, 1.5 * s]) colliders.push({ x: bx + dirx * off, z: bz + dirz * off, r: 0.85 * s });
  }

  // —— 彩蛋坐标(不入 dress;各自组件渲染 + 动画) ——
  const [crX, crZ] = W(3.5, 6.5);
  const [tuX, tuZ] = W(-5, 4), [tsX, tsZ] = W(-5, 14.5);
  const [coX, coZ] = W(10.5, 6.8); const conchRot = faceSea + Math.PI;
  const [trX, trZ] = W(-20.5, 2.5); const treRot = faceSea;
  colliders.push({ x: coX, z: coZ, r: 0.7 });                       // 海螺所在礁石
  colliders.push({ x: trX, z: trZ, r: 0.9 });                       // 藏宝箱
  const jelly: Pt[] = [[-3, 13], [5.5, 15], [11.5, 12.5]].map(([u, v]) => { const [x, z] = W(u, v); return { x, z }; });
  const footprints = Array.from({ length: 6 }, (_, i) => {          // 从浅水通向藏宝箱的脚印
    const v = 11 - i * 1.6, [x, z] = W(-20.5, v);
    return { x, z, rot: faceSea + Math.PI };                        // 朝陆(朝宝箱)行进
  });

  _beach = {
    dress, colliders,
    crab: { x: crX, z: crZ }, turtle: { x: tuX, z: tuZ }, turtleSea: { x: tsX, z: tsZ },
    jelly, conch: { x: coX, z: coZ, y: Math.max(exGroundY(coX, coZ), 0) + 0.13 * 0.8, rot: conchRot },
    treasure: { x: trX, z: trZ, y: Math.max(exGroundY(trX, trZ), 0) + 0.08 * 0.95, rot: treRot },
    footprints, along: { x: tx, z: tz }, waterY: 0.16,
  };
  return _beach;
}

// 🦀 彩蛋「寄居蟹」:潮间带横着挪步的小螃蟹,走近 → 一句温柔的话。
function BeachCrab({ posRef, onFind }: { posRef: React.RefObject<THREE.Vector3>; onFind: () => void }) {
  const b = getBeach();
  const { obj } = useToonGlb(MODELS.beachCrab);
  const clawL = useMemo(() => obj.getObjectByName("ClawL"), [obj]);
  const clawR = useMemo(() => obj.getObjectByName("ClawR"), [obj]);
  const grp = useRef<THREE.Group>(null);
  const [found, setFound] = useState(false); const foundRef = useRef(false);
  const baseRot = Math.atan2(Math.cos(BAY_ANGLE), Math.sin(BAY_ANGLE)); // 面朝海(横向挪步)
  const u = useRef(0); const tgt = useRef(0); const nextTurn = useRef(1.5); const wave = useRef(0); const nextWave = useRef(3);
  useFrame((s, dt) => {
    const grpc = grp.current; if (!grpc) return;
    const t = s.clock.elapsedTime; const pp = posRef.current;
    const near = pp ? Math.hypot(pp.x - b.crab.x, pp.z - b.crab.z) : 99;
    // 目标位移:玩家近→快闪到背对的一侧;否则每隔几秒挑个小目标,中间停顿(不再匀速 sin)
    if (near < 5.5) { const side = pp && ((pp.x - b.crab.x) * b.along.x + (pp.z - b.crab.z) * b.along.z) > 0 ? -1 : 1; tgt.current = side * 3.4; nextTurn.current = 0.4; }
    else { nextTurn.current -= dt; if (nextTurn.current <= 0) { tgt.current = (Math.random() * 2 - 1) * 2.8; nextTurn.current = 1.6 + Math.random() * 2.6; } }
    const prevU = u.current;
    u.current = THREE.MathUtils.damp(u.current, tgt.current, near < 5.5 ? 6 : 2.2, dt); // 加减速自然
    const vel = (u.current - prevU) / Math.max(dt, 1e-4);
    const x = b.crab.x + b.along.x * u.current, z = b.crab.z + b.along.z * u.current;
    const stepBob = Math.abs(Math.sin(t * 13)) * Math.min(0.055, Math.abs(vel) * 0.02); // 走得越快碎步越明显,停下不抖
    grpc.position.set(x, Math.max(exGroundY(x, z), b.waterY) + 0.1 + stepBob, z);
    grpc.rotation.y = THREE.MathUtils.damp(grpc.rotation.y, baseRot + THREE.MathUtils.clamp(vel * 0.12, -0.14, 0.14), 8, dt); // 朝移动侧微倾
    // 钳子:平时一只偶尔挥一下,玩家近时双钳举起戒备
    wave.current = Math.max(0, wave.current - dt * 1.4);
    nextWave.current -= dt; if (nextWave.current <= 0 && near > 6) { wave.current = 1; nextWave.current = 3 + Math.random() * 4; }
    const guard = near < 6 ? 1 : 0;
    if (clawL) clawL.rotation.x = THREE.MathUtils.damp(clawL.rotation.x, -(guard * 0.55 + wave.current * 0.75) - 0.05, 9, dt);
    if (clawR) clawR.rotation.x = THREE.MathUtils.damp(clawR.rotation.x, -(guard * 0.55) - 0.05 - Math.sin(t * 2.2) * 0.05, 9, dt);
    if (pp && !foundRef.current && near < 4.2) { foundRef.current = true; setFound(true); onFind(); }
  });
  return (
    <group ref={grp} position={[b.crab.x, 0.1, b.crab.z]} rotation={[0, baseRot, 0]}>
      <primitive object={obj} scale={0.6} />
      {found && <BeachCard y={1.1} label="🦀 寄居蟹" line="它换了一个更合身的壳 —— 你也可以慢慢长大，换一个更舒服的自己。" />}
    </group>
  );
}

// 🐢 彩蛋「归海的小海龟」:在沙滩上一点点爬向海,走近 → 一句话。
function BabyTurtle({ posRef, onFind }: { posRef: React.RefObject<THREE.Vector3>; onFind: () => void }) {
  const b = getBeach();
  const { obj } = useToonGlb(MODELS.beachTurtle);
  const flipL = useMemo(() => obj.getObjectByName("FlipperL"), [obj]);
  const flipR = useMemo(() => obj.getObjectByName("FlipperR"), [obj]);
  const grp = useRef<THREE.Group>(null);
  const [found, setFound] = useState(false); const foundRef = useRef(false);
  const ang = Math.atan2(b.turtleSea.x - b.turtle.x, b.turtleSea.z - b.turtle.z); // 朝海
  const k = useRef(0); const rest = useRef(0);
  useFrame((s, dt) => {
    const grpc = grp.current; if (!grpc) return;
    const t = s.clock.elapsedTime;
    const stroke = t * 2.6;
    const push = Math.max(0, Math.sin(stroke));                   // 划水推进相 0..1
    // 一推一停:划水时前进一截,收鳍时几乎不动;到海里歇一会再从头来
    if (k.current >= 1) { rest.current += dt; if (rest.current > 2.6) { k.current = 0; rest.current = 0; } }
    else k.current = Math.min(1, k.current + dt * 0.014 * (0.3 + push * 1.5));
    const cyc = k.current;
    const x = b.turtle.x + (b.turtleSea.x - b.turtle.x) * cyc, z = b.turtle.z + (b.turtleSea.z - b.turtle.z) * cyc;
    const onSand = cyc < 0.9;
    const gy = (onSand ? Math.max(exGroundY(x, z), b.waterY) : b.waterY) + 0.153;
    grpc.position.set(x, gy + Math.sin(stroke) * 0.02, z);       // 划水时身体一沉一起
    if (flipL) flipL.rotation.z = Math.sin(stroke) * 0.7;        // 前鳍交替划水
    if (flipR) flipR.rotation.z = Math.sin(stroke + Math.PI) * 0.7;
    grpc.rotation.set(push * 0.05, ang + Math.sin(stroke) * 0.05, Math.sin(stroke) * 0.05); // 用力低头 + 左右摇摆(waddle)
    const pp = posRef.current;
    if (pp && !foundRef.current && Math.hypot(pp.x - x, pp.z - z) < 4.6) { foundRef.current = true; setFound(true); onFind(); }
  });
  return (
    <group ref={grp} position={[b.turtle.x, 0.15, b.turtle.z]} rotation={[0, ang, 0]}>
      <primitive object={obj} scale={0.9} rotation={[0, Math.PI, 0]} />
      {found && <BeachCard y={0.9} label="🐢 归海的小海龟" line="一只迷路的小海龟，正努力爬回海里 —— 每个走散的，最后都会找到回家的路。" />}
    </group>
  );
}

const JELLYFISH_TINT: ToonTint = {
  default: "#5fd8ff",
  materials: {
    emissive_bell: "#5fd8ff",
    emissive_tent: "#b795ff",
  },
  emissiveIntensity: 1.45,
};

// 🪼 彩蛋「夜光水母」:浅滩里随情绪发光、轻轻一鼓一缩漂浮的水母群(纯氛围)。
function Jellyfish() {
  const b = getBeach();
  const grad = useMemo(() => makeToonGradient(), []);
  useEffect(() => () => grad.dispose(), [grad]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    for (let i = 0; i < b.jelly.length; i++) {
      const grpc = refs.current[i]; if (!grpc) continue;
      const swim = t * 0.5 + i * 1.7; const ph = swim - Math.floor(swim);
      const contract = ph < 0.32 ? Math.sin((ph / 0.32) * Math.PI) : 0;   // 快速收缩相(喷射式)
      grpc.scale.set(1 + contract * 0.2, 1 - contract * 0.32, 1 + contract * 0.2); // 收缩压扁鼓宽
      const jet = contract * 0.45 - ph * 0.18;                            // 收缩喷上、其后缓沉
      grpc.position.x = b.jelly[i].x + (valueNoise(i * 3.1 + t * 0.05, 5) - 0.5) * 1.2; // 缓慢漂移
      grpc.position.z = b.jelly[i].z + (valueNoise(i * 3.1 + 9, t * 0.05) - 0.5) * 1.2;
      grpc.position.y = b.waterY + 0.55 + jet + Math.sin(t * 0.4 + i) * 0.04;
      grpc.rotation.y += dt * 0.12;
    }
  });
  return (
    <>
      {b.jelly.map((j, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }} position={[j.x, b.waterY + 0.55, j.z]}>
          <GltfProp url={MODELS.beachJelly} grad={grad} tint={JELLYFISH_TINT} position={[0, 0, 0]} scale={0.78} />
        </group>
      ))}
    </>
  );
}

// 🐚 彩蛋「听海的海螺」:礁石上的大海螺 —— 走近报告 onNear,ExploreMode 给「贴近耳朵」按钮(放浪声)。
function BeachConch({ posRef, onNear }: { posRef: React.RefObject<THREE.Vector3>; onNear: (b: boolean) => void }) {
  const b = getBeach();
  const grad = useMemo(() => makeToonGradient(), []);
  useEffect(() => () => grad.dispose(), [grad]);
  const near = useRef(false);
  useFrame(() => {
    const pp = posRef.current; if (!pp) return;
    const n = dist2(pp.x, pp.z, b.conch.x, b.conch.z) < 19.36;
    if (n !== near.current) { near.current = n; onNear(n); }
  });
  return <GltfProp url={MODELS.beachConch} grad={grad} position={[b.conch.x, b.conch.y, b.conch.z]} rotation={[0, b.conch.rot, 0]} scale={0.8} />;
}

// 💎 彩蛋「退潮的宝藏」:半埋沙里的箱子,脚印引路;走近箱盖缓缓掀开,露出微光 + 一句话(可用历史记忆)。
function BeachTreasure({ posRef, onFind, note }: { posRef: React.RefObject<THREE.Vector3>; onFind: () => void; note?: string }) {
  const b = getBeach();
  const { scene } = useGLTF(MODELS.beachChest);
  const grad = useMemo(() => makeToonGradient(), []);
  const obj = useMemo(() => toonifyScene(scene, grad), [scene, grad]);
  const lid = useMemo(() => obj.getObjectByName("Lid"), [obj]);
  const [found, setFound] = useState(false);
  const foundRef = useRef(false);
  const openT = useRef(0);
  const gradFp = useMemo(() => makeToonGradient(), []);
  useEffect(() => () => { grad.dispose(); gradFp.dispose(); }, [grad, gradFp]);
  useFrame((_, dt) => {
    const pp = posRef.current;
    if (pp && !foundRef.current && dist2(pp.x, pp.z, b.treasure.x, b.treasure.z) < 16) {
      foundRef.current = true; setFound(true); onFind();
    }
    if (foundRef.current && openT.current < 1) openT.current = Math.min(1, openT.current + dt * 1.1);
    if (lid) lid.rotation.x = openT.current * 1.9;                // 掀盖(铰链在后缘)
  });
  return (
    <>
      {b.footprints.map((f, i) => (
        <GltfProp key={i} url={MODELS.beachFootprint} grad={gradFp} position={[f.x, Math.max(exGroundY(f.x, f.z), 0) + 0.02, f.z]} rotation={[0, f.rot, 0]} scale={1.0} />
      ))}
      <group position={[b.treasure.x, b.treasure.y, b.treasure.z]} rotation={[0, b.treasure.rot, 0]}>
        <primitive object={obj} scale={0.95} />
        {found && <BeachCard y={1.5} label="💎 退潮后的宝藏" line={note ?? "潮水来过又退去，有些珍贵的东西，时间冲不走。"} />}
      </group>
    </>
  );
}

// 海滩彩蛋共用的玻璃小卡(drei Html)
function BeachCard({ y, label, line }: { y: number; label: string; line: string }) {
  return (
    <Html position={[0, y, 0]} center distanceFactor={11} zIndexRange={[44, 0]} style={{ pointerEvents: "none" }} prepend>
      <div className="panel-glass-2 rounded-card px-4 py-2 text-center" style={{ width: 210 }}>
        <p className="text-caption tracking-[0.22em] text-white/55">{label}</p>
        <p className="font-display text-[13px] leading-relaxed tracking-wide text-white/90 mt-0.5">{line}</p>
      </div>
    </Html>
  );
}

// ============================== 🏝️ 岛屿奇遇(世界彩蛋) ==============================
// 走近触发的小动物 / 夜晚魔法 / 海与水秘密 / 可互动仪式。每个发现 onDiscover(key) → HUD 聚合「奇遇 N/M」。
type EggP = { posRef: React.RefObject<THREE.Vector3>; onDiscover: (k: string) => void };
const EGG = {
  fox: { x: -WALK_RADIUS * 0.4, z: -WALK_RADIUS * 0.5 }, // 西北林间
  cat: { x: 9.5, z: 6.5 }, // 村中向阳处
  owl: { x: -WALK_RADIUS * 0.92 + 6, z: -WALK_RADIUS * 0.3 + 6 }, // 灯塔旁
  bell: { x: 10, z: -8 }, // 神社旁(神社在 7,-7)
  mushroom: { x: -WALK_RADIUS * 0.28, z: WALK_RADIUS * 0.34 }, // 林间空地
  star: { x: 15, z: -12 }, // 瞭望台旁观星点(瞭望台 13,-9)
  pond: { x: WALK_RADIUS * 0.3, z: WALK_RADIUS * 0.3 }, // 池塘
};
// 加载 + toon 化一个 glb,并可取一个子节点(尾巴/铃),组件复用
function useToonGlb(url: string, node?: string) {
  const { scene } = useGLTF(url);
  const grad = useMemo(() => makeToonGradient(), []);
  const obj = useMemo(() => toonifyScene(scene, grad), [scene, grad]);
  const nodeObj = useMemo(() => (node ? obj.getObjectByName(node) ?? null : null), [obj, node]);
  useEffect(() => () => grad.dispose(), [grad]);
  return { obj, node: nodeObj };
}

// 角度阻尼(走最短弧,帧率无关) —— 让所有转向/朝向都柔顺,不再瞬间硬切
function dampAngle(cur: number, target: number, lambda: number, dt: number): number {
  let diff = ((target - cur + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return cur + diff * (1 - Math.exp(-lambda * dt));
}

// 🦊 林间小狐狸:走近怯生生退开(一跳一跳)、阻尼望向你;松弛时缓缓四下张望,尾巴偶尔快摆一下。
function ForestFox({ posRef, onDiscover }: EggP) {
  const home = EGG.fox;
  const { obj, node: tail } = useToonGlb(MODELS.critterFox, "Tail");
  const grp = useRef<THREE.Group>(null);
  const [seen, setSeen] = useState(false); const seenRef = useRef(false);
  const flee = useRef(0); const yaw = useRef(0); const lookT = useRef(0); const idleYaw = useRef(0); const flick = useRef(0); const nextFlick = useRef(2);
  const gy = useMemo(() => Math.max(exGroundY(home.x, home.z), 0) + 0.16, [home]);
  useFrame((s, dt) => {
    const g = grp.current; if (!g) return; const t = s.clock.elapsedTime; const pp = posRef.current;
    const d = pp ? Math.hypot(pp.x - g.position.x, pp.z - g.position.z) : 99;
    flee.current = THREE.MathUtils.damp(flee.current, d < 5.5 ? 1 : 0, d < 5.5 ? 4 : 1.5, dt); // 警觉/松弛都渐变
    if (d < 5.5 && !seenRef.current) { seenRef.current = true; setSeen(true); onDiscover("fox"); }
    const aAng = pp ? Math.atan2(home.x - pp.x, home.z - pp.z) : 0;
    const back = flee.current * 2.6;
    const fx = home.x + Math.sin(aAng) * back, fz = home.z + Math.cos(aAng) * back;
    const hop = flee.current > 0.05 ? Math.abs(Math.sin(t * 7)) * flee.current * 0.12 : 0; // 退避一跳一跳
    g.position.set(fx, Math.max(exGroundY(fx, fz), 0) + 0.16 + hop + (1 - flee.current) * Math.sin(t * 1.4) * 0.012, fz);
    lookT.current -= dt; if (lookT.current <= 0) { idleYaw.current = (valueNoise(home.x + t, home.z) - 0.5) * 1.6; lookT.current = 1.5 + Math.random() * 2.5; }
    const wantYaw = pp && d < 9 ? Math.atan2(pp.x - fx, pp.z - fz) : idleYaw.current;
    yaw.current = dampAngle(yaw.current, wantYaw, d < 9 ? 7 : 2.5, dt);
    g.rotation.y = yaw.current;
    flick.current = Math.max(0, flick.current - dt * 2.2); nextFlick.current -= dt;
    if (nextFlick.current <= 0) { flick.current = 1; nextFlick.current = 2 + Math.random() * 3; }
    if (tail) tail.rotation.z = THREE.MathUtils.damp(tail.rotation.z, 0.12 + Math.sin(t * 1.2) * 0.06 + flick.current * Math.sin(t * 18) * 0.4, 12, dt);
  });
  return (
    <group ref={grp} position={[home.x, gy, home.z]}>
      <primitive object={obj} scale={0.85} rotation={[0, Math.PI, 0]} />
      {seen && <BeachCard y={1.5} label="🦊 林间的小狐狸" line="它怯生生地望着你，又悄悄退开半步 —— 有些靠近，急不得。" />}
    </group>
  );
}

// 🐱 岛上橘猫:晒太阳,你来了会眯眼、慢悠悠跟你走几步。
function IslandCat({ posRef, onDiscover }: EggP) {
  const home = EGG.cat;
  const { obj, node: tail } = useToonGlb(MODELS.critterCat, "Tail");
  const grp = useRef<THREE.Group>(null); const cur = useRef(new THREE.Vector3(home.x, 0, home.z));
  const [seen, setSeen] = useState(false); const seenRef = useRef(false);
  const yaw = useRef(0); const greet = useRef(0); const flick = useRef(0); const nextFlick = useRef(3);
  useFrame((s, dt) => {
    const g = grp.current; if (!g) return; const t = s.clock.elapsedTime; const pp = posRef.current;
    const d = pp ? Math.hypot(pp.x - cur.current.x, pp.z - cur.current.z) : 99;
    if (d < 4.5 && !seenRef.current) { seenRef.current = true; setSeen(true); onDiscover("cat"); playSfx("settle"); greet.current = 1; }
    greet.current = Math.max(0, greet.current - dt * 0.8);
    let tx = home.x, tz = home.z; // 玩家在 2.5~11 内则缓缓踱步跟随,保持约 2.5 距离;否则回 home
    if (pp && d > 2.5 && d < 11) { const f = (d - 2.5) / d; tx = cur.current.x + (pp.x - cur.current.x) * f; tz = cur.current.z + (pp.z - cur.current.z) * f; }
    const px = cur.current.x, pz = cur.current.z;
    cur.current.x = THREE.MathUtils.damp(cur.current.x, tx, 1.4, dt); cur.current.z = THREE.MathUtils.damp(cur.current.z, tz, 1.4, dt); // 踱步慢而稳
    const sp = Math.hypot(cur.current.x - px, cur.current.z - pz) / Math.max(dt, 1e-4);
    const stepping = Math.min(1, sp * 0.6);
    const sway = Math.abs(Math.sin(t * 4)) * stepping * 0.02;
    g.position.set(cur.current.x, Math.max(exGroundY(cur.current.x, cur.current.z), 0) + 0.14 + sway + (1 - stepping) * Math.sin(t * 1.3) * 0.012, cur.current.z);
    const wantYaw = pp && d < 12 ? Math.atan2(pp.x - cur.current.x, pp.z - cur.current.z) : Math.atan2(home.x - cur.current.x, home.z - cur.current.z);
    yaw.current = dampAngle(yaw.current, wantYaw, 4, dt);
    g.rotation.set(-greet.current * 0.12 + stepping * Math.sin(t * 4) * 0.03, yaw.current, stepping * Math.sin(t * 4) * 0.04); // 抬头打招呼 + 行走一摇一摆
    flick.current = Math.max(0, flick.current - dt * 1.8); nextFlick.current -= dt;
    if (nextFlick.current <= 0) { flick.current = 1; nextFlick.current = 2.5 + Math.random() * 4; }
    if (tail) tail.rotation.z = THREE.MathUtils.damp(tail.rotation.z, Math.sin(t * 1.1) * 0.22 + flick.current * Math.sin(t * 16) * 0.3, 10, dt); // 慵懒 S 摆 + 尾尖偶尔一弹
  });
  return (
    <group ref={grp} position={[home.x, Math.max(exGroundY(home.x, home.z), 0) + 0.14, home.z]}>
      <primitive object={obj} scale={0.8} rotation={[0, Math.PI, 0]} />
      {seen && <BeachCard y={1.5} label="🐱 岛上的橘猫" line="它眯着眼，慢悠悠跟了你几步 —— 不为什么，就是想陪你走走。" />}
    </group>
  );
}

// 🦉 灯塔守夜猫头鹰:只在夜里现身,金眼随你转动,偶尔咕咕一声。
function LighthouseOwl({ posRef, night, onDiscover }: EggP & { night: boolean }) {
  const home = EGG.owl;
  const { obj } = useToonGlb(MODELS.critterOwl);
  const eyeMat = useMemo((): THREE.MeshStandardMaterial | null => { let m: THREE.MeshStandardMaterial | null = null; obj.traverse((o) => { const mesh = o as THREE.Mesh; const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []; for (const x of mats) if (/eyes/i.test(x.name)) m = x as THREE.MeshStandardMaterial; }); return m; }, [obj]);
  const grp = useRef<THREE.Group>(null);
  const [seen, setSeen] = useState(false); const seenRef = useRef(false);
  const hoot = useRef(2); const yaw = useRef(0); const tgtYaw = useRef(0); const turnT = useRef(1.5); const blink = useRef(0); const nextBlink = useRef(3);
  const gy = useMemo(() => Math.max(exGroundY(home.x, home.z), 0) + 0.05, [home]);
  useFrame((s, dt) => {
    const g = grp.current; if (!g || !night) return; const t = s.clock.elapsedTime; const pp = posRef.current;
    const d = pp ? Math.hypot(pp.x - home.x, pp.z - home.z) : 99;
    if (d < 5 && !seenRef.current) { seenRef.current = true; setSeen(true); onDiscover("owl"); }
    // 头:平时盯着不动,偶尔「咔」地急转;你靠近时锁定你(像真猫头鹰)
    if (pp && d < 9) { tgtYaw.current = Math.atan2(pp.x - home.x, pp.z - home.z) * 0.6; turnT.current = 1.2; }
    else { turnT.current -= dt; if (turnT.current <= 0) { tgtYaw.current = (Math.random() - 0.5) * 1.4; turnT.current = 2 + Math.random() * 3; } }
    yaw.current = dampAngle(yaw.current, tgtYaw.current, 11, dt); // 快阻尼=急转到位即停
    g.rotation.y = yaw.current;
    g.position.y = gy + Math.sin(t * 1.6) * 0.012; // 轻微呼吸
    blink.current = Math.max(0, blink.current - dt * 5); nextBlink.current -= dt;
    if (nextBlink.current <= 0) { blink.current = 1; nextBlink.current = 2.5 + Math.random() * 4; }
    if (eyeMat) eyeMat.emissiveIntensity = (0.7 + Math.sin(t * 1.5) * 0.15) * (1 - blink.current * 0.9); // 金眼呼吸光 + 偶尔眨眼
    hoot.current -= dt; if (d < 13 && hoot.current <= 0) { hoot.current = 5 + Math.random() * 3.5; playSfx("chime"); }
  });
  if (!night) return null;
  return (
    <group ref={grp} position={[home.x, gy, home.z]}>
      <primitive object={obj} scale={0.9} rotation={[0, Math.PI, 0]} />
      {seen && <BeachCard y={1.6} label="🦉 灯塔的守夜人" line="一只猫头鹰停在灯塔边，金色的眼睛眨了眨 —— 夜再黑，也有人替你守着。" />}
    </group>
  );
}

// 🍄 精灵蘑菇圈:林间一圈小蘑菇,夜里踩进圈中 → 萤火绕你打转 + 一句话。
function MushroomRing({ posRef, night, onDiscover }: EggP & { night: boolean }) {
  const c = EGG.mushroom;
  const grad = useMemo(() => makeToonGradient(), []);
  useEffect(() => () => grad.dispose(), [grad]);
  const ring = useMemo(() => Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; const x = c.x + Math.cos(a) * 3.2, z = c.z + Math.sin(a) * 3.2; return { x, y: Math.max(exGroundY(x, z), 0), z, s: 0.8 + hash2(i + 5, 1.3) * 0.5, rot: hash2(i + 5, 2.1) * 6.28 }; }), [c]);
  const fref = useRef<THREE.InstancedMesh>(null);
  const fgeo = useMemo(() => new THREE.SphereGeometry(0.07, 6, 5), []);
  const fmat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#cdeaff", emissive: new THREE.Color("#bfe3ff"), emissiveIntensity: 3, toneMapped: false, transparent: true }), []);
  const FN = 24;
  const fseeds = useMemo(() => Array.from({ length: FN }, (_, i) => ({ a: hash2(i + 9, 1.1) * 6.28, r: 0.6 + hash2(i + 9, 2.2) * 2.4, h: 0.4 + hash2(i + 9, 3.3) * 2.2, ph: hash2(i + 9, 4.4) * 6.28 })), []);
  useEffect(() => () => { fgeo.dispose(); fmat.dispose(); }, [fgeo, fmat]);
  const active = useRef(0); const _q = useMemo(() => new THREE.Quaternion(), []); const _v = useMemo(() => new THREE.Vector3(), []); const _sc = useMemo(() => new THREE.Vector3(), []); const _m = useMemo(() => new THREE.Matrix4(), []);
  const [seen, setSeen] = useState(false); const seenRef = useRef(false);
  useFrame((s) => {
    const t = s.clock.elapsedTime; const pp = posRef.current;
    const inside = night && pp ? dist2(pp.x, pp.z, c.x, c.z) < 11.56 : false;
    active.current += ((inside ? 1 : 0) - active.current) * 0.05;
    if (inside && !seenRef.current) { seenRef.current = true; setSeen(true); onDiscover("mushroom"); playSfx("bloom"); }
    const m = fref.current; if (m) {
      for (let i = 0; i < FN; i++) { const sd = fseeds[i]; const x = c.x + Math.cos(sd.a + t * 0.4 + sd.ph) * sd.r; const z = c.z + Math.sin(sd.a + t * 0.4 + sd.ph) * sd.r; const y = Math.max(exGroundY(x, z), 0) + sd.h + Math.sin(t * 1.2 + sd.ph) * 0.3; _v.set(x, y, z); _sc.setScalar(active.current); _m.compose(_v, _q, _sc); m.setMatrixAt(i, _m); }
      m.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <group>
      {ring.map((r, i) => <GltfProp key={i} url={MODELS.natMushroom} grad={grad} position={[r.x, r.y, r.z]} rotation={[0, r.rot, 0]} scale={r.s} />)}
      <instancedMesh ref={fref} args={[fgeo, fmat, FN]} frustumCulled={false} />
      {seen && <group position={[c.x, 0, c.z]}><BeachCard y={2.2} label="🍄 精灵的蘑菇圈" line="你踩进了一圈小蘑菇，萤火被惊起绕着你打转 —— 这里收留每一个走神的人。" /></group>}
    </group>
  );
}

// 🌙 池中月:夜里池塘浮起一轮月亮倒影,走近 → 一句话。
function MoonReflection({ posRef, night, onDiscover }: EggP & { night: boolean }) {
  const c = EGG.pond;
  const py = useMemo(() => Math.max(exGroundY(c.x, c.z), -0.3) + 0.06, [c]);
  const disc = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.CircleGeometry(2.2, 32), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#eaf2ff", transparent: true, opacity: 0, toneMapped: false, depthWrite: false }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const [seen, setSeen] = useState(false); const seenRef = useRef(false);
  useFrame((s) => {
    const t = s.clock.elapsedTime; const pp = posRef.current;
    const target = night ? 0.5 + Math.sin(t * 0.8) * 0.08 : 0;
    mat.opacity += (target - mat.opacity) * 0.05;
    if (disc.current) disc.current.scale.setScalar(1 + Math.sin(t * 0.5) * 0.03);
    if (night && pp && dist2(pp.x, pp.z, c.x, c.z) < 36 && !seenRef.current) { seenRef.current = true; setSeen(true); onDiscover("moon"); }
  });
  return (
    <group position={[c.x, py, c.z]}>
      <mesh ref={disc} geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} />
      {seen && <BeachCard y={2.0} label="🌙 池中月" line="池塘里盛着一轮月亮 —— 抬头它在天上，低头它在你心里，两个都是真的。" />}
    </group>
  );
}

// 🌠 流星许愿:夜里走到观星点,流星会一次次划过夜空 + 一句话。
function GltfShootingStar() {
  const { scene } = useGLTF(MODELS.shootingStar);
  const obj = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    return root;
  }, [scene]);
  return <primitive object={obj} scale={8.0} rotation={[0, 0, -0.18]} />;
}

function StarWish({ posRef, night, onDiscover }: EggP & { night: boolean }) {
  const c = EGG.star;
  const star = useRef<THREE.Group>(null);
  const shoot = useRef(3); const DUR = 1.6;
  const [seen, setSeen] = useState(false); const seenRef = useRef(false);
  useFrame((_s, dt) => {
    const pp = posRef.current;
    const isNear = night && pp ? dist2(pp.x, pp.z, c.x, c.z) < 324 : false;
    if (isNear && !seenRef.current) { seenRef.current = true; setSeen(true); onDiscover("star"); }
    if (isNear) { shoot.current -= dt; if (shoot.current <= -DUR) shoot.current = 4 + Math.random() * 3; }
    const active = isNear && shoot.current <= 0 && shoot.current > -DUR;
    const k = active ? -shoot.current / DUR : 0; // 0→1 划过
    const sg = star.current; if (sg) {
      sg.visible = active;
      sg.position.set(-70 + k * 140, 78 - k * 34, -46 + k * 26);
      sg.scale.setScalar(active ? 0.55 + Math.sin(k * Math.PI) * 0.45 : 0.1);
    }
  });
  return (
    <group>
      <group ref={star} visible={false}>
        <GltfShootingStar />
      </group>
      {seen && night && <group position={[c.x, 0, c.z]}><BeachCard y={2.4} label="🌠 对着流星许个愿" line="一颗流星划过 —— 你来不及说出口的那个愿望，它都听见了。" /></group>}
    </group>
  );
}

// —— 海与水秘密 / 可互动仪式 —— 模块级信号 + 海滩坐标
const eggSignals = { bell: 0, stone: 0, future: 0 };
const _EA = BAY_ANGLE, _EBR = WALK_RADIUS * 0.9;
function beachPt(u: number, v: number): { x: number; z: number } {
  return { x: Math.cos(_EA) * _EBR + u * -Math.sin(_EA) + v * Math.cos(_EA), z: Math.sin(_EA) * _EBR + u * Math.cos(_EA) + v * Math.sin(_EA) };
}
const SEA = { fish: beachPt(0, 13), bench: beachPt(-26, -5), stone: beachPt(-23, 1.5), future: beachPt(23, -1) };

// 🐟 浅滩发光鱼群:绕圈游,玩家涉水靠近 → 散开 + 一句话(随情绪 tint)。
function FishSchool({ posRef, accent, onDiscover }: EggP & { accent: string }) {
  const home = SEA.fish;
  const grad = useMemo(() => makeToonGradient(), []);
  useEffect(() => () => grad.dispose(), [grad]);
  const refs = useRef<(THREE.Group | null)[]>([]); const scatter = useRef(0);
  const [seen, setSeen] = useState(false); const seenRef = useRef(false);
  const seeds = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ a: hash2(i + 1, 2.1) * 6.28, r: 1 + hash2(i + 1, 3.3) * 2.2, ph: hash2(i + 1, 4.4) * 6.28 })), []);
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime; const pp = posRef.current; const wy = getBeach().waterY;
    const d2 = pp ? dist2(pp.x, pp.z, home.x, home.z) : Infinity;
    const close = d2 < 25;
    if (d2 < 36 && !seenRef.current) { seenRef.current = true; setSeen(true); onDiscover("fish"); }
    scatter.current = THREE.MathUtils.damp(scatter.current, close ? 1 : 0, close ? 5 : 1.5, dt);
    const cx = home.x + (valueNoise(t * 0.08, 1.3) - 0.5) * 4; // 鱼群中心缓慢游弋(不再原地打转)
    const cz = home.z + (valueNoise(2.7, t * 0.08) - 0.5) * 4;
    seeds.forEach((sd, i) => {
      const g = refs.current[i]; if (!g) return;
      const rr = sd.r * (1 + scatter.current * 2.2); const spd = 0.5 + sd.r * 0.12; const ax = sd.a + t * spd * (1 + scatter.current);
      g.position.x = THREE.MathUtils.damp(g.position.x, cx + Math.cos(ax) * rr, 4, dt); // 松散跟游,有快慢
      g.position.z = THREE.MathUtils.damp(g.position.z, cz + Math.sin(ax) * rr, 4, dt);
      g.position.y = wy + 0.08 + Math.sin(t * 2 + sd.ph) * 0.05;
      g.rotation.y = dampAngle(g.rotation.y, ax + Math.PI / 2, 6, dt);
      g.rotation.z = THREE.MathUtils.damp(g.rotation.z, Math.sin(t * spd * 2 + sd.ph) * 0.3, 4, dt); // 转弯侧倾
    });
  });
  return (
    <>
      {seeds.map((sd, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }} position={[home.x + Math.cos(sd.a) * sd.r, getBeach().waterY + 0.08, home.z + Math.sin(sd.a) * sd.r]}>
          <GltfProp url={MODELS.critterFish} grad={grad} tint={accent} position={[0, 0, 0]} scale={0.7} rotation={[0, Math.PI, 0]} />
        </group>
      ))}
      {seen && <group position={[home.x, getBeach().waterY + 1, home.z]}><BeachCard y={0.4} label="🐟 浅滩的发光鱼" line="一群小鱼亮着微光绕着你打转，又倏地散开 —— 像一句没说出口的欢迎。" /></group>}
    </>
  );
}

// 🌅 看海的长椅:朝海而坐,走近 → 一句话。
function SunsetBench({ posRef, onDiscover }: EggP) {
  const home = SEA.bench;
  const grad = useMemo(() => makeToonGradient(), []);
  useEffect(() => () => grad.dispose(), [grad]);
  const gy = useMemo(() => Math.max(exGroundY(home.x, home.z), 0), [home]);
  const faceSea = Math.atan2(Math.cos(BAY_ANGLE), Math.sin(BAY_ANGLE));
  const [seen, setSeen] = useState(false); const seenRef = useRef(false);
  useFrame(() => { const pp = posRef.current; if (pp && dist2(pp.x, pp.z, home.x, home.z) < 16 && !seenRef.current) { seenRef.current = true; setSeen(true); onDiscover("sunset"); } });
  return (
    <group position={[home.x, gy, home.z]} rotation={[0, faceSea, 0]}>
      <GltfProp url={MODELS.townBench} grad={grad} position={[0, 0, 0]} scale={1.1} />
      {seen && <BeachCard y={1.6} label="🌅 看海的长椅" line="坐下来，什么都不用做 —— 海一直在，夕阳也在，你也在，这就够了。" />}
    </group>
  );
}

// ⛩️ 神社祈愿铃:按钮摇铃 → 铃身摆动 + 铃声 + 一句祝福(读 eggSignals.bell)。
function ShrineBell({ onDiscover }: { onDiscover: (k: string) => void }) {
  const home = EGG.bell;
  const { obj, node: bell } = useToonGlb(MODELS.critterBell, "Bell");
  const gy = useMemo(() => Math.max(exGroundY(home.x, home.z), 0), [home]);
  const last = useRef(eggSignals.bell); const swing = useRef(0);
  const [card, setCard] = useState(false); const cardT = useRef(0);
  useFrame((s, dt) => {
    if (eggSignals.bell !== last.current) { last.current = eggSignals.bell; swing.current = 1; chimeNote(660); chimeNote(990); setCard(true); cardT.current = 4.5; onDiscover("bell"); }
    swing.current = Math.max(0, swing.current - dt * 1.1);
    if (bell) bell.rotation.x = Math.sin(s.clock.elapsedTime * 9) * swing.current * 0.42;
    if (cardT.current > 0) { cardT.current -= dt; if (cardT.current <= 0) setCard(false); }
  });
  return (
    <group position={[home.x, gy, home.z]} rotation={[0, Math.PI, 0]}>
      <primitive object={obj} scale={0.95} />
      {card && <BeachCard y={3} label="⛩️ 祈愿铃" line="铃声荡开 —— 愿你所念之人皆平安，愿你也被这世界温柔以待。" />}
    </group>
  );
}

// 🪨 许愿石:按钮逐块叠石,叠满成塔 → 心愿封存(读 eggSignals.stone,跨次保存)。
function WishingStones({ onDiscover }: { onDiscover: (k: string) => void }) {
  const home = SEA.stone; const MAXS = 7;
  const grad = useMemo(() => makeToonGradient(), []);
  useEffect(() => () => grad.dispose(), [grad]);
  const gy = useMemo(() => Math.max(exGroundY(home.x, home.z), 0), [home]);
  const [count, setCount] = useState<number>(() => { try { return Math.min(MAXS, parseInt(localStorage.getItem("xy_wishstones") || "0") || 0); } catch { return 0; } });
  const last = useRef(eggSignals.stone); const prev = useRef(count); const sealedRef = useRef(count >= MAXS); const [sealed, setSealed] = useState(count >= MAXS);
  useFrame(() => { if (eggSignals.stone !== last.current) { last.current = eggSignals.stone; setCount((c) => Math.min(MAXS, c + 1)); } });
  useEffect(() => {
    if (count === prev.current) return; prev.current = count;
    try { localStorage.setItem("xy_wishstones", String(count)); } catch { /* ignore */ }
    if (count >= MAXS && !sealedRef.current) { sealedRef.current = true; setSealed(true); onDiscover("wishstone"); playSfx("reveal"); } else playSfx("shell");
  }, [count, onDiscover]);
  const stones = useMemo(() => Array.from({ length: count }, (_, i) => ({ y: i * 0.32, s: 0.52 - i * 0.04, rot: hash2(i + 3, 1.7) * 6.28, off: (hash2(i + 3, 2.3) - 0.5) * 0.12 })), [count]);
  return (
    <group position={[home.x, gy, home.z]}>
      {stones.map((st, i) => <GltfProp key={i} url={MODELS.natRock} grad={grad} position={[st.off, st.y, st.off]} rotation={[0, st.rot, 0]} scale={st.s} />)}
      {sealed && <BeachCard y={count * 0.32 + 0.9} label="🪨 许愿石" line="石头叠成一座小塔 —— 把心愿压在最底下，风也吹不走，海也带不动。" />}
    </group>
  );
}

// 🍾 寄给未来的瓶中信:小投递牌 + 投出的瓶子漂向海(读 eggSignals.future)。文本在 ExploreMode 模态里写。
function FutureBottle() {
  const home = SEA.future; const POOL = 4;
  const grad = useMemo(() => makeToonGradient(), []);
  useEffect(() => () => grad.dispose(), [grad]);
  const gy = useMemo(() => Math.max(exGroundY(home.x, home.z), 0), [home]);
  const seaFacing = Math.atan2(Math.cos(BAY_ANGLE), Math.sin(BAY_ANGLE));
  const last = useRef(eggSignals.future);
  const slots = useRef(Array.from({ length: POOL }, () => ({ active: false, t: 0 })));
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame((_, dt) => {
    const wy = getBeach().waterY;
    if (eggSignals.future !== last.current) { last.current = eggSignals.future; const free = slots.current.find((s) => !s.active); if (free) { free.active = true; free.t = 0; } }
    slots.current.forEach((sl, i) => {
      const g = refs.current[i]; if (!g) return;
      if (!sl.active) { g.visible = false; return; }
      g.visible = true; sl.t += dt; const dist = sl.t * 3.0;
      g.position.set(home.x + Math.cos(BAY_ANGLE) * dist, wy + 0.12 + Math.sin(sl.t * 1.5 + i) * 0.06, home.z + Math.sin(BAY_ANGLE) * dist);
      g.rotation.set(0, sl.t * 0.5, 0.95);
      if (sl.t > 11) sl.active = false;
    });
  });
  return (
    <group>
      <GltfProp url={MODELS.beachSign} grad={grad} position={[home.x, gy, home.z]} rotation={[0, seaFacing, 0]} scale={0.55} />
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }} visible={false} position={[home.x, getBeach().waterY + 0.12, home.z]}>
          <GltfProp url={MODELS.driftbottle} grad={grad} position={[0, 0.18, 0]} scale={0.5} />
        </group>
      ))}
    </group>
  );
}

// 可互动仪式就近探测:报告最近可互动点(铃 / 邮筒 / 许愿石 / 瓶中信)给 HUD 出按钮。
const INTERACTS: { kind: string; label: string; x: number; z: number; r: number }[] = [
  { kind: "bell", label: "🔔 摇响祈愿铃", x: EGG.bell.x, z: EGG.bell.z, r: 4 },
  { kind: "mailbox", label: "📮 给岛屿写一封信", x: 1.6, z: 2.2, r: 3.5 },
  { kind: "stone", label: "🪨 叠一块许愿石", x: SEA.stone.x, z: SEA.stone.z, r: 4 },
  { kind: "future", label: "🍾 写一封给未来的信", x: SEA.future.x, z: SEA.future.z, r: 4 },
];
function InteractProximity({ posRef, onNear }: { posRef: React.RefObject<THREE.Vector3>; onNear: (v: { kind: string; label: string } | null) => void }) {
  const cur = useRef<string | null>(null);
  useFrame(() => {
    const pp = posRef.current; if (!pp) return;
    let best: { kind: string; label: string } | null = null; let bd = 1e9;
    for (const it of INTERACTS) {
      const d = dist2(pp.x, pp.z, it.x, it.z);
      const rr = it.r * it.r;
      if (d < rr && d < bd) { bd = d; best = { kind: it.kind, label: it.label }; }
    }
    const k = best?.kind ?? null;
    if (k !== cur.current) { cur.current = k; onNear(best); }
  });
  return null;
}

// 写信小模态(邮筒给岛屿 / 寄给未来的自己共用,自管理 textarea)
function WriteModal({ title, hint, placeholder, action, onSubmit, onClose }: { title: string; hint: string; placeholder: string; action: string; onSubmit: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/45 px-6" onClick={onClose}>
      <div className="panel-glass-2 rounded-card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-[17px] tracking-wider text-white/90">{title}</p>
        <p className="text-caption text-white/50 mt-1">{hint}</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} rows={3} className="mt-3 w-full resize-none rounded-xl bg-white/10 px-3 py-2 text-[15px] text-white/90 placeholder:text-white/35 outline-none" autoFocus />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full px-4 py-2 text-caption text-white/55">取消</button>
          <button onClick={() => { if (text.trim()) onSubmit(text.trim()); onClose(); }} className="panel-glass-2 rounded-full px-5 py-2 font-display text-[14px] tracking-wider text-white/90 active:scale-95">{action}</button>
        </div>
      </div>
    </div>
  );
}

function Npcs({
  animate,
  posRef,
  mood,
  emotion,
  giftedIds,
  onNear,
}: {
  animate: boolean;
  posRef: React.RefObject<THREE.Vector3>;
  mood: SceneMotionMood;
  emotion?: string;
  giftedIds: number[];
  onNear: (id: number) => void;
}) {
  const npcs = useMemo(() => {
    const out: { x: number; z: number; phase: number; speed: number; leash: number; pool: string[]; avatar: Avatar }[] = [];
    for (let i = 0; i < 9; i++) {
      const a = hash2(i + 200, 1.3) * Math.PI * 2;
      const r = 6 + hash2(i + 200, 2.1) * 26;
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, phase: hash2(i + 200, 3.3) * 6.28, speed: 0.18 + hash2(i + 200, 4.4) * 0.22, leash: 2 + hash2(i + 200, 5.5) * 3, pool: NPC_LINES_VILLAGE, avatar: npcAvatar(i + 200, "village") });
    }
    // 海滩游客:聚在东南海湾(与遮阳伞同侧),沿岸三三两两
    for (let i = 0; i < 6; i++) {
      const a = BAY_ANGLE + (hash2(i + 300, 1.9) - 0.5) * 0.55;
      const r = WALK_RADIUS * (0.9 + hash2(i + 300, 2.6) * 0.05);
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, phase: hash2(i + 300, 3.3) * 6.28, speed: 0.16 + hash2(i + 300, 4.4) * 0.18, leash: 2.4, pool: NPC_LINES_BEACH, avatar: npcAvatar(i + 300, "beach") });
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 1.1;
      const r = WALK_RADIUS * 0.36;
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, phase: hash2(i + 400, 3.3) * 6.28, speed: 0.2, leash: 2.5, pool: NPC_LINES_FARM, avatar: npcAvatar(i + 400, "farm") });
    }
    return out;
  }, []);

  const refs = useRef<(THREE.Group | null)[]>([]);
  const stt = useRef(npcs.map((n) => ({ px: n.x, pz: n.z, fy: 0 })));
  const [active, setActive] = useState(-1); // 当前正在搭话的 NPC 下标(-1=无)
  const [activeLine, setActiveLine] = useState(""); // 当前这次搭话显示的台词(在 useFrame 切换时定好,避免 render 读 ref)
  const activeRef = useRef(-1);
  const turns = useRef<number[]>(npcs.map(() => -1)); // 每个 NPC 被搭话过几次 → 轮换台词(-1:还没开口)

  useFrame((s) => {
    const pp = posRef.current;
    const act = activeRef.current;
    let nearest = -1;
    let nd = TALK_RANGE * TALK_RANGE;
    for (let i = 0; i < npcs.length; i++) {
      const g = refs.current[i];
      const n = npcs[i];
      const st = stt.current[i];
      if (!g) continue;
      const talking = i === act && !!pp;
      let wx = st.px;
      let wz = st.pz;
      let bob = 0;
      if (talking && pp) {
        st.fy = Math.atan2(pp.x - st.px, pp.z - st.pz); // 停下,转过来面对你
      } else if (!animate) {
        wx = n.x;
        wz = n.z;
      } else {
        const t = s.clock.elapsedTime * n.speed + n.phase;
        wx = n.x + Math.sin(t) * n.leash + Math.sin(t * 0.6 + 1) * n.leash * 0.4;
        wz = n.z + Math.cos(t * 0.8) * n.leash;
        const dx = wx - st.px;
        const dz = wz - st.pz;
        if (dx * dx + dz * dz > 1e-5) st.fy = Math.atan2(dx, dz);
        bob = Math.abs(Math.sin(s.clock.elapsedTime * 6 + n.phase)) * 0.04;
      }
      st.px = wx;
      st.pz = wz;
      g.position.set(wx, Math.max(exGroundY(wx, wz), 0) + bob, wz);
      let d = st.fy - g.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y += d * (talking ? 0.2 : 0.12);
      if (pp) {
        const dist = dist2(pp.x, pp.z, wx, wz);
        if (dist < nd) {
          nd = dist;
          nearest = i;
        }
      }
    }
    if (nearest !== activeRef.current) {
      if (nearest >= 0) {
        turns.current[nearest] += 1; // 每次重新走近 → 下一句台词
        const opener = (emotion && EMOTION_OPENERS[emotion]) || MOOD_LINES[mood]; // 第 0 句:优先贴你真实情绪,否则按场景基调
        const seq = [opener, ...npcs[nearest].pool];
        setActiveLine(seq[turns.current[nearest] % seq.length]);
      }
      activeRef.current = nearest;
      setActive(nearest);
      onNear(nearest);
    }
  });

  return (
    <>
      {npcs.map((n, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[n.x, Math.max(exGroundY(n.x, n.z), 0), n.z]}
          scale={0.92 + hash2(i + 210, 6.6) * 0.16}
        >
          <GltfNpcCharacter avatar={n.avatar} />
          {active === i &&
            (() => {
              const gifted = giftedIds.includes(i);
              const text = gifted ? GRATEFUL_LINES[i % GRATEFUL_LINES.length] : activeLine;
              return (
                <Html position={[0, 1.28, 0]} center distanceFactor={9} zIndexRange={[40, 0]} style={{ pointerEvents: "none" }} prepend>
                  <div
                    style={{
                      width: 150,
                      textAlign: "center",
                      whiteSpace: "normal",
                      transform: "translateY(-50%)",
                      background: "rgba(12,22,30,0.66)",
                      backdropFilter: "blur(6px)",
                      WebkitBackdropFilter: "blur(6px)",
                      color: "#eaf2f5",
                      font: '500 13px/1.45 -apple-system, system-ui, "PingFang SC", sans-serif',
                      padding: "7px 13px",
                      borderRadius: 13,
                      border: "1px solid rgba(255,255,255,0.18)",
                      boxShadow: "0 6px 18px rgba(0,0,0,0.28)",
                    }}
                  >
                    <style>{"@keyframes xyHeart{0%{transform:translateY(2px);opacity:.5}100%{transform:translateY(-16px);opacity:0}}"}</style>
                    {text}
                    {gifted && <span style={{ display: "inline-block", marginLeft: 4, color: "#ff9bb0", animation: "xyHeart 1.1s ease-out infinite" }}>♡</span>}
                  </div>
                </Html>
              );
            })()}
        </group>
      ))}
    </>
  );
}

// 🐋 彩蛋「鲸落之海」:北岸藏着一块观鲸石,走近它,远海会有鲸鱼缓缓跃出 + 一句只有找到的人才看见的话。
function SecretWhale({ posRef, onFound, night }: { posRef: React.RefObject<THREE.Vector3>; onFound: () => void; night: boolean }) {
  const LOOK_A = -1.35; // 观鲸石方位(北偏东,远离其他地标,易被错过)
  const lookX = Math.cos(LOOK_A) * WALK_RADIUS * 0.99;
  const lookZ = Math.sin(LOOK_A) * WALK_RADIUS * 0.99;
  const lookY = Math.max(exGroundY(lookX, lookZ), 0);
  const whaleX = Math.cos(LOOK_A) * (WALK_RADIUS + 78);
  const whaleZ = Math.sin(LOOK_A) * (WALK_RADIUS + 78);

  const whale = useRef<THREE.Group>(null);
  const spout = useRef<THREE.Group>(null);
  const [found, setFound] = useState(false);
  const foundRef = useRef(false);

  const grad = useMemo(() => makeToonGradient(), []);
  // 夜里:鲸鱼泛起冷蓝微光(emissive),喷水更亮。night 每场固定,直接烘进材质,不在 effect 里改属性。
  const mats = useMemo(
    () => ({
      body: new THREE.MeshToonMaterial({ color: "#41607a", emissive: night ? "#19586b" : "#000000", emissiveIntensity: night ? 0.65 : 0, gradientMap: grad }),
      belly: new THREE.MeshToonMaterial({ color: "#a9c2cc", gradientMap: grad }),
      rock: new THREE.MeshToonMaterial({ color: "#6b7480", gradientMap: grad }),
      eye: new THREE.MeshBasicMaterial({ color: "#10151b" }),
      spout: new THREE.MeshBasicMaterial({ color: "#eaf6f8", transparent: true, opacity: night ? 0.9 : 0.72, depthWrite: false }),
      glow: new THREE.MeshBasicMaterial({ color: "#7fe9ff", toneMapped: false }), // 夜间生物荧光斑点
    }),
    [grad, night],
  );
  useEffect(() => () => { grad.dispose(); Object.values(mats).forEach((m) => m.dispose()); }, [grad, mats]);

  useFrame((s) => {
    const pp = posRef.current;
    if (pp && !foundRef.current && dist2(pp.x, pp.z, lookX, lookZ) < 56.25) {
      foundRef.current = true;
      setFound(true);
      onFound();
    }
    const t = s.clock.elapsedTime;
    const cyc = (t * (night ? 0.26 : 0.16)) % 1; // 夜里跃得更勤
    const breach = cyc < 0.28 ? Math.sin((cyc / 0.28) * Math.PI) : 0;
    const w = whale.current;
    if (w) {
      w.position.y = foundRef.current ? -2.4 + breach * 9 + Math.sin(t * 0.8) * 0.35 : -80;
      w.rotation.z = -breach * 0.55;
      w.rotation.x = Math.sin(t * 0.5) * 0.05;
    }
    if (spout.current) {
      spout.current.visible = foundRef.current && cyc > 0.16 && cyc < 0.46;
      const ph = (t * 1.6) % 1;
      spout.current.scale.set(1, 0.6 + ph * 1.5, 1);
    }
  });

  return (
    <>
      {/* 观鲸石(地标) */}
      <group position={[lookX, lookY, lookZ]}>
        <GltfProp url={MODELS.whalerock} grad={grad} position={[0, 0, 0]} rotation={[0, LOOK_A, 0]} scale={0.62} />
        {found && (
          <Html position={[0, 2.8, 0]} center distanceFactor={13} zIndexRange={[45, 0]} style={{ pointerEvents: "none" }} prepend>
            <div
              style={{
                width: 188,
                textAlign: "center",
                transform: "translateY(-50%)",
                background: "rgba(14,24,32,0.72)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                color: "#f3ead2",
                font: '600 14px/1.5 -apple-system, system-ui, "PingFang SC", sans-serif',
                padding: "9px 14px",
                borderRadius: 14,
                border: "1px solid rgba(240,220,150,0.45)",
                boxShadow: "0 6px 20px rgba(0,0,0,0.32)",
              }}
            >
              🐋 鲸落之海
              <div style={{ marginTop: 4, fontWeight: 400, fontSize: 12, color: "#dfe7ea" }}>据说，看见鲸鱼的人，会被温柔地记住。</div>
            </div>
          </Html>
        )}
      </group>

      {/* 远海鲸鱼(默认沉在水下,发现后缓缓跃出) */}
      <group ref={whale} position={[whaleX, -80, whaleZ]} rotation={[0, LOOK_A + Math.PI / 2, 0]}>
        {/* glb 鲸鱼:头朝 +X,自带喷水 + 夜间 Emissive_Spots 荧光 */}
        <GltfProp url={MODELS.whale} grad={grad} position={[0, 0, 0]} scale={2.6} />
      </group>
    </>
  );
}

// 彩蛋②:漂流瓶里陌生人的留言(温柔、跨越距离的连接)
const BOTTLE_NOTES = [
  "嘿,看到这张纸条的你——今天也辛苦了,真的。",
  "我把一个秘密交给了海。如果它漂到你这儿,就当我们认识过吧。",
  "无论你现在是什么心情,都有人在很远的地方,盼你好好的。",
  "如果你也常常觉得孤单,那我们其实,是同一种人。",
  "愿你被这个世界,温柔以待。",
];
const BOTTLE_ANGLES = [1.7, 2.9, 4.1]; // 散在远离海湾/观鲸石的三段僻静海岸
// 🍾 彩蛋「漂流瓶」:几只半埋在沙里的玻璃瓶,走近会浮起、开盖,读到一句漂来的留言。
function DriftBottles({ posRef, onFind, notes }: { posRef: React.RefObject<THREE.Vector3>; onFind: (i: number) => void; notes?: string[] }) {
  const spots = useMemo(
    () =>
      BOTTLE_ANGLES.map((a, i) => {
        const r = WALK_RADIUS * 0.95; // 冲上岸的沙地(不在水里)
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        // 有历史记忆时,前几只瓶子装"过去的你"写的话;否则是陌生人的留言
        const personal = !!notes && i < notes.length;
        return { x, z, y: Math.max(exGroundY(x, z), 0.05), note: personal ? notes![i] : BOTTLE_NOTES[i % BOTTLE_NOTES.length], label: personal ? "一张旧字条 · 你写过的" : "漂流瓶里的字条", rot: a };
      }),
    [notes],
  );
  const refs = useRef<(THREE.Group | null)[]>([]);
  const [found, setFound] = useState<boolean[]>(() => spots.map(() => false));
  const foundRef = useRef<boolean[]>(spots.map(() => false));
  const grad = useMemo(() => makeToonGradient(), []);
  const mats = useMemo(
    () => ({
      glass: new THREE.MeshToonMaterial({ color: "#bfe6d8", gradientMap: grad, transparent: true, opacity: 0.6 }),
      cork: new THREE.MeshToonMaterial({ color: "#b08a5a", gradientMap: grad }),
    }),
    [grad],
  );
  useEffect(() => () => { grad.dispose(); Object.values(mats).forEach((m) => m.dispose()); }, [grad, mats]);

  useFrame((s) => {
    const pp = posRef.current;
    const t = s.clock.elapsedTime;
    for (let i = 0; i < spots.length; i++) {
      const g = refs.current[i];
      if (!g) continue;
      const sp = spots[i];
      if (pp && !foundRef.current[i] && dist2(pp.x, pp.z, sp.x, sp.z) < 17.64) {
        foundRef.current[i] = true;
        setFound((f) => f.map((v, k) => (k === i ? true : v)));
        onFind(i);
      }
      const lifted = foundRef.current[i];
      g.position.y = sp.y + (lifted ? 0.55 + Math.sin(t * 1.5 + i) * 0.08 : 0.02);
      g.rotation.set(0, lifted ? t * 0.5 : sp.rot, lifted ? 0 : 0.95); // 发现后浮起转正,否则半埋侧躺
    }
  });

  return (
    <>
      {spots.map((sp, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[sp.x, sp.y, sp.z]}
          rotation={[0, sp.rot, 0.95]}
        >
          <GltfProp url={MODELS.driftbottle} grad={grad} position={[0, 0.18, 0]} scale={0.5} />
          {found[i] && (
            <Html position={[0, 1.0, 0]} center distanceFactor={9} zIndexRange={[44, 0]} style={{ pointerEvents: "none" }} prepend>
              <div
                style={{
                  width: 172,
                  textAlign: "center",
                  transform: "translateY(-50%) rotate(-2deg)",
                  background: "#f4ecd6",
                  color: "#5b4a32",
                  font: '500 12.5px/1.55 -apple-system, system-ui, "PingFang SC", sans-serif',
                  padding: "8px 13px",
                  borderRadius: 6,
                  border: "1px solid rgba(120,90,50,0.3)",
                  boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
                }}
              >
                <div style={{ fontSize: 11, color: "#8a7a55", marginBottom: 3 }}>{sp.label}</div>
                {sp.note}
              </div>
            </Html>
          )}
        </group>
      ))}
    </>
  );
}

// 地表草丛:走在岛上脚边的随风草(实例化一张绘制),避开中央广场与沙滩;toon + 双色 + 顶部随风摆。
function GroundGrass({ count, animate, grad }: { count: number; animate: boolean; grad: THREE.DataTexture }) {
  const blades = useMemo(() => {
    const out: { x: number; z: number; y: number; s: number; rot: number }[] = [];
    let tries = 0;
    const maxR = WALK_RADIUS * 0.66; // 集中在常走的核心区(巨岛全铺不现实),外圈交给树
    while (out.length < count && tries < count * 6) {
      tries += 1;
      const a = hash2(tries * 1.7, 9.1) * Math.PI * 2;
      const r = Math.sqrt(hash2(tries * 2.3, 4.7)) * maxR;
      if (r < 6) continue; // 避开中央广场
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // 避开环岛柏油路:否则 5.2 万根草叶里靠路的那些会直接穿透路面、把路"切碎"。
      // 环路在半径 ~113..143,只对靠外圈(r>105)的草做路带判定,省掉绝大多数草的 O(N) 距离计算。
      if (r > 105 && distToRoadCenter(x, z) < ROAD_HALF_W + 1.0) continue;
      // 近路草改用平路地面高度;地标草改用抬升后的草坪面高度。
      // 否则草叶仍按原始地形生成,会被地标草坪顶面盖住,看起来像一块没有草尖的平涂色面。
      const terrainY = r > 105 ? groundYWithRoad(x, z).y : exGroundY(x, z);
      const landmarkY = landmarkGroundLift(x, z);
      const h = Math.max(terrainY, landmarkY);
      if (h < 0.2) continue; // 避开沙滩 / 水
      out.push({ x, z, y: h, s: 0.7 + hash2(tries, 3.1) * 0.7, rot: hash2(tries, 7.7) * 6.28 });
    }
    return out;
  }, [count]);
  const geo = useMemo(() => new THREE.ConeGeometry(0.06, 0.4, 5, 2), []);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const shaderRef = useRef<THREE.WebGLProgramParametersWithUniforms | null>(null);
  const material = useMemo(() => {
    const m = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: grad, emissive: new THREE.Color("#3f7a4f"), emissiveIntensity: 0.3 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 };
      sh.vertexShader =
        "uniform float uTime;\n" +
        sh.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           float bladeH = clamp((position.y + 0.2) / 0.4, 0.0, 1.0);
           float ph = instanceMatrix[3].x + instanceMatrix[3].z;
           float sway = sin(uTime * 1.5 + ph * 0.7) * 0.12 + sin(uTime * 2.6 + ph * 1.2) * 0.05;
           transformed.x += sway * bladeH * bladeH;
           transformed.z += sway * 0.4 * bladeH * bladeH;`,
        );
      shaderRef.current = sh;
    };
    return m;
  }, [grad]);
  useEffect(() => () => { geo.dispose(); material.dispose(); }, [geo, material]);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const d = new THREE.Object3D();
    const cCool = new THREE.Color("#5aa06a");
    const cWarm = new THREE.Color("#9ac76e");
    const col = new THREE.Color();
    blades.forEach((b, i) => {
      d.position.set(b.x, b.y + 0.2 * b.s, b.z);
      d.rotation.set(0, b.rot, 0);
      d.scale.setScalar(b.s);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      col.copy(cCool).lerp(cWarm, hash2(b.x * 0.7, b.z * 0.7));
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [blades]);
  useFrame((s) => {
    if (animate && shaderRef.current) shaderRef.current.uniforms.uTime.value = s.clock.elapsedTime;
  });
  return <instancedMesh ref={meshRef} args={[geo, material, blades.length]} frustumCulled={false} />;
}

// 海岛村落:房子绕广场成街(脸朝广场) + 岛上设施(凉亭/水井/拱桥/秋千/吊床…)。
// 房子正脸朝 +Y(Blender)→ 游戏内 -Z;rotation=[0, atan2(x,z), 0] 使 -Z 面朝原点。
function Village({ toonGrad }: { toonGrad: THREE.Texture }) {
  // 村落房子已改由 Town 的 buildings 直接用 glb 渲染(替换旧程序化方块屋);这里只放设施 + 灯塔看守屋。
  const lhX = -WALK_RADIUS * 0.92, lhZ = -WALK_RADIUS * 0.3;
  const pondX = WALK_RADIUS * 0.3, pondZ = WALK_RADIUS * 0.3;
  const face = (x: number, z: number): [number, number, number] => [0, Math.atan2(x, z), 0];
  return (
    <group>
      {/* 灯塔看守小屋:紧贴灯塔 */}
      <GltfProp url={MODELS.houseLightkeeper} grad={toonGrad} position={[lhX + 8, exGroundY(lhX + 8, lhZ + 6), lhZ + 6]} rotation={face(lhX + 8, lhZ + 6)} scale={0.9} />
      {/* 岛上设施散布村落 */}
      <GltfProp url={MODELS.isleGazebo} grad={toonGrad} position={[-7, exGroundY(-7, 6), 6]} scale={0.9} />
      <GltfProp url={MODELS.isleWell} grad={toonGrad} position={[5, exGroundY(5, -5), -5]} scale={0.9} />
      <GltfProp url={MODELS.islePergola} grad={toonGrad} position={[-10, exGroundY(-10, -2), -2]} rotation={face(-10, -2)} scale={0.9} />
      <GltfProp url={MODELS.isleWindchime} grad={toonGrad} position={[9, exGroundY(9, -4), -4]} scale={0.9} />
      <GltfProp url={MODELS.isleStall} grad={toonGrad} position={[6, exGroundY(6, 7.5), 7.5]} rotation={face(6, 7.5)} scale={0.9} />
      <GltfProp url={MODELS.isleSwing} grad={toonGrad} position={[-5, exGroundY(-5, -8), -8]} rotation={[0, 0.4, 0]} scale={0.9} />
      <GltfProp url={MODELS.isleTent} grad={toonGrad} position={[-13, exGroundY(-13, -8), -8]} rotation={[0, 0.7, 0]} scale={0.9} />
      <GltfProp url={MODELS.isleLookout} grad={toonGrad} position={[13, exGroundY(13, -9), -9]} scale={0.95} />
      {/* 池塘景:拱桥 + 汀步 */}
      <GltfProp url={MODELS.isleBridge} grad={toonGrad} position={[pondX, exGroundY(pondX, pondZ - 7) + 0.1, pondZ - 7]} scale={0.95} />
      <GltfProp url={MODELS.isleStepstones} grad={toonGrad} position={[pondX - 5, exGroundY(pondX - 5, pondZ + 3) + 0.05, pondZ + 3]} scale={0.95} />
      {/* 海湾吊床 → 已并入海滩布局(Coastline) */}
    </group>
  );
}

// 海岸线:近海地形(海蚀拱/礁柱/浮岛/崖/穴/梯田/石阶) + 海湾沙滩物 + 发光海水(染场景 accent,随浪浮动)。
function Coastline({ toonGrad, accent }: { toonGrad: THREE.Texture; accent: string }) {
  const off = (a: number, r: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];
  const face = (x: number, z: number): [number, number, number] => [0, Math.atan2(x, z), 0];
  const coveX = Math.cos(BAY_ANGLE) * WALK_RADIUS * 0.92, coveZ = Math.sin(BAY_ANGLE) * WALK_RADIUS * 0.92;
  const dress = getBeach().dress; // 精心铺陈的海滩道具(无重叠 + 精确贴地,单一数据源)
  const [arX, arZ] = off(4.2, WALK_RADIUS + 30);
  const [ssX, ssZ] = off(5.2, WALK_RADIUS + 24);
  const [isX, isZ] = off(3.0, WALK_RADIUS + 95);
  const [clX, clZ] = off(5.5, WALK_RADIUS * 0.985);
  const [cvX, cvZ] = off(-1.2, WALK_RADIUS * 0.97);
  const [teX, teZ] = off(2.0, WALK_RADIUS * 0.4);
  const [wvX, wvZ] = off(BAY_ANGLE, WALK_RADIUS * 1.0);
  const [spX, spZ] = off(5.2, WALK_RADIUS + 19);
  return (
    <group>
      {/* 近海地形(海面 y≈0;浮岛微浮) */}
      <GltfProp url={MODELS.terrArchrock} grad={toonGrad} position={[arX, 0, arZ]} rotation={[0, 1.0, 0]} scale={1.8} />
      <GltfProp url={MODELS.terrSeastack} grad={toonGrad} position={[ssX, 0, ssZ]} scale={1.6} />
      <GltfProp url={MODELS.terrIsle} grad={toonGrad} position={[isX, 3.0, isZ]} scale={3.0} />
      <GltfProp url={MODELS.terrCliff} grad={toonGrad} position={[clX, 0, clZ]} rotation={face(clX, clZ)} scale={1.4} />
      <GltfProp url={MODELS.terrCave} grad={toonGrad} position={[cvX, 0, cvZ]} rotation={face(cvX, cvZ)} scale={1.3} />
      <GltfProp url={MODELS.terrTerrace} grad={toonGrad} position={[teX, exGroundY(teX, teZ) - 0.6, teZ]} scale={1.1} />
      <GltfProp url={MODELS.terrStairs} grad={toonGrad} position={[8, exGroundY(8, 9.5), 9.5]} rotation={face(8, 9.5)} scale={1.0} />
      {/* 心屿湾:精心铺陈的海滩道具(棕榈/草棚/篝火/躺椅/小船/沙堡… 来自 getBeach 单一数据源) */}
      {dress.map((b, i) => (
        <GltfProp key={`b${i}`} url={b.url} grad={toonGrad} position={[b.x, b.y, b.z]} rotation={[0, b.rot, 0]} scale={b.s} />
      ))}
      {/* 发光海水:浪头(朝岸,随浪浮) + 泡沫/涟漪 + 浪花 + 浅滩水面 + 崖边瀑布 */}
      <group position={[wvX, 0.2, wvZ]} rotation={face(wvX, wvZ)}>
        <FloatSway url={MODELS.waterWave} grad={toonGrad} tint={accent} position={[0, 0, 0]} scale={1.4} amp={0.16} speed={1.1} />
      </group>
      <FloatSway url={MODELS.waterFoam} grad={toonGrad} tint={accent} position={[coveX + 1, 0.08, coveZ + 4]} scale={1.2} amp={0.05} speed={0.8} />
      <FloatSway url={MODELS.waterRing} grad={toonGrad} tint={accent} position={[coveX - 2, 0.1, coveZ + 3]} scale={1.3} amp={0.04} speed={1.4} />
      <FloatSway url={MODELS.waterSurface} grad={toonGrad} tint={accent} position={[coveX + 3, 0.06, coveZ - 1]} scale={1.6} amp={0.03} speed={0.6} />
      <GltfProp url={MODELS.waterSplash} grad={toonGrad} tint={accent} position={[spX, 0.2, spZ]} scale={1.2} />
      <GltfProp url={MODELS.waterFall} grad={toonGrad} tint={accent} position={[clX, 0.0, clZ]} rotation={face(clX, clZ)} scale={1.3} />
    </group>
  );
}

// ============================== 新玩法组件 ==============================

// 🌸 心情花田:在草地按 🌱/E 种下当前情绪色的花,实例化渲染,跨次保存,走近回报「何时·心情」
type Flower = { x: number; z: number; color: string; t: number };
function MoodGarden({ inputRef, posRef, accent, flowers, onPlant, onNear }: {
  inputRef: React.RefObject<Input>;
  posRef: React.RefObject<THREE.Vector3>;
  accent: string;
  flowers: Flower[];
  onPlant: (x: number, z: number, color: string) => void;
  onNear: (f: Flower | null) => void;
}) {
  const MAX = 120;
  const bloom = useRef<THREE.InstancedMesh>(null);
  const stem = useRef<THREE.InstancedMesh>(null);
  const nearKey = useRef(-1);
  const cool = useRef(0);
  const bloomGeo = useMemo(() => new THREE.IcosahedronGeometry(0.32, 0), []);
  const stemGeo = useMemo(() => new THREE.CylinderGeometry(0.04, 0.05, 0.7, 5), []);
  const grad = useMemo(() => makeToonGradient(), []);
  const bloomMat = useMemo(() => new THREE.MeshToonMaterial({ gradientMap: grad }), [grad]);
  const stemMat = useMemo(() => new THREE.MeshToonMaterial({ color: "#5f8a52", gradientMap: grad }), [grad]);
  useEffect(() => () => { bloomGeo.dispose(); stemGeo.dispose(); bloomMat.dispose(); stemMat.dispose(); grad.dispose(); }, [bloomGeo, stemGeo, bloomMat, stemMat, grad]);
  useLayoutEffect(() => {
    const bm = bloom.current, sm = stem.current;
    if (!bm || !sm) return;
    const m = new THREE.Matrix4(); const col = new THREE.Color();
    const n = Math.min(flowers.length, MAX);
    for (let i = 0; i < n; i++) {
      const f = flowers[flowers.length - n + i];
      const gy = exGroundY(f.x, f.z);
      m.makeTranslation(f.x, gy + 0.68, f.z); bm.setMatrixAt(i, m); bm.setColorAt(i, col.set(f.color));
      m.makeTranslation(f.x, gy + 0.35, f.z); sm.setMatrixAt(i, m);
    }
    bm.count = n; sm.count = n;
    bm.instanceMatrix.needsUpdate = true; sm.instanceMatrix.needsUpdate = true;
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
  }, [flowers]);
  useFrame((_, dt) => {
    const p = posRef.current; const inp = inputRef.current; if (!p) return;
    cool.current = Math.max(0, cool.current - dt);
    if (inp?.plant) { inp.plant = false; if (cool.current <= 0) { cool.current = 0.4; onPlant(p.x, p.z, accent); } }
    let best = -1, bestD = 2.6 * 2.6;
    for (let i = 0; i < flowers.length; i++) { const dx = p.x - flowers[i].x, dz = p.z - flowers[i].z; const d = dx * dx + dz * dz; if (d < bestD) { bestD = d; best = i; } }
    if (best !== nearKey.current) { nearKey.current = best; onNear(best >= 0 ? flowers[best] : null); }
  });
  return (
    <group>
      <instancedMesh ref={stem} args={[stemGeo, stemMat, MAX]} frustumCulled={false} />
      <instancedMesh ref={bloom} args={[bloomGeo, bloomMat, MAX]} frustumCulled={false} />
    </group>
  );
}

// 🏮 暮色天灯:放飞后从玩家处升起的暖光灯,缓缓上升+摇曳+淡出,自移除
// ── 柔光晕贴图(惰性单例,只建一次):天灯光晕 / 火星 / 烟花粒子 / 亮星 / 流星共用 ──
let _glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (_glowTex) return _glowTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const x = cv.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.72)");
  g.addColorStop(0.5, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  _glowTex = t;
  return t;
}

// ── 光环贴图(惰性单例):中空亮环——用于烟花冲击波 / 放飞祝福光环 ──
let _ringTex: THREE.Texture | null = null;
function ringTexture(): THREE.Texture {
  if (_ringTex) return _ringTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const x = cv.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.6, "rgba(255,255,255,0)");
  g.addColorStop(0.8, "rgba(255,255,255,0.55)");
  g.addColorStop(0.9, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  _ringTex = t;
  return t;
}

// 🏮 石灯笼:可点亮 / 熄灭——熄灭后不全黑,留一盏微光(用户要的「调暗·留微光」)。
// lampSignals 跨组件传「切换当前最近一盏」的请求(同 eggSignals 思路);
// <StoneLanterns/> 自管 4 盏的开关状态 + 就近探测 + 持久化(localStorage: xy_lamps)。
const LAMP_SPOTS = [[7, -13], [13, -6], [-9, 11], [11, 9]] as const;
const LAMP_NEAR = 3.4; // 走进这个半径即可点 / 熄
const lampSignals = { toggle: 0 };

// 单盏石灯笼的灯火:亮↔暗平滑过渡 + 火苗轻颤 + 暖色光晕;熄灭只留一丝微光。
function LampGlow({ on }: { on: boolean }) {
  const light = useRef<THREE.PointLight>(null);
  const halo = useRef<THREE.Sprite>(null);
  const lit = useRef(on ? 1 : 0); // 0..1,亮灭之间缓动(不硬切)
  const haloMat = useMemo(
    () => new THREE.SpriteMaterial({ map: glowTexture(), color: "#ffdf9b", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, toneMapped: false }),
    [],
  );
  useEffect(() => () => haloMat.dispose(), [haloMat]); // 只销毁材质,贴图是共享单例
  useFrame((s, dt) => {
    lit.current += ((on ? 1 : 0) - lit.current) * Math.min(1, dt * 4); // 缓动点亮 / 熄灭
    const k = lit.current;
    const t = s.clock.elapsedTime;
    const flick = 1 + Math.sin(t * 8 + 1.3) * 0.05 + Math.sin(t * 13.7) * 0.025; // 火苗呼吸轻颤
    if (light.current) {
      light.current.intensity = (0.3 + k * 1.95) * flick; // 暗:微光 ~0.3 / 亮:~2.25
      light.current.distance = 2.3 + k * 3.0;
    }
    if (halo.current) {
      halo.current.scale.setScalar((0.46 + k * 0.66) * flick);
      haloMat.opacity = (0.1 + k * 0.5) * flick; // 暗:残烬般微晕 / 亮:暖光晕
    }
  });
  return (
    <group position={[0, 0.85, 0]}>
      <pointLight ref={light} color="#ffdf9b" intensity={2.2} distance={5} decay={1.7} />
      <sprite ref={halo} material={haloMat} scale={0.8} />
    </group>
  );
}

// 4 盏石灯笼(岛上石径)。走近任意一盏 → 报告给 HUD 出「点灯 / 熄灯」按钮;
// 收到 lampSignals.toggle 变化 → 翻转当前最近那盏的亮灭,并即时刷新按钮文案。
function StoneLanterns({ posRef, grad, onNearLamp }: {
  posRef: React.RefObject<THREE.Vector3>;
  grad: THREE.Texture;
  onNearLamp: (v: { idx: number; on: boolean } | null) => void;
}) {
  const [on, setOn] = useState<boolean[]>(() => {
    try {
      const raw = localStorage.getItem("xy_lamps");
      if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) return LAMP_SPOTS.map((_, i) => a[i] !== false); }
    } catch { /* ignore */ }
    return LAMP_SPOTS.map(() => true); // 默认全亮(与原行为一致)
  });
  const onRef = useRef(on); // 给 useFrame 读最新值(避免闭包过期)
  const near = useRef(-1);
  const lastToggle = useRef(lampSignals.toggle);
  // 在 effect 里同步 ref + 落盘,不在渲染阶段改 ref.current(React 规则)
  useEffect(() => {
    onRef.current = on;
    try { localStorage.setItem("xy_lamps", JSON.stringify(on)); } catch { /* ignore */ }
  }, [on]);
  useFrame(() => {
    const p = posRef.current; if (!p) return;
    let best = -1, bd = LAMP_NEAR * LAMP_NEAR;
    for (let i = 0; i < LAMP_SPOTS.length; i++) {
      const dx = p.x - LAMP_SPOTS[i][0], dz = p.z - LAMP_SPOTS[i][1];
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = i; }
    }
    // 切换请求:翻转当前最近一盏 + 立刻刷新 HUD 按钮文案
    if (lampSignals.toggle !== lastToggle.current) {
      lastToggle.current = lampSignals.toggle;
      if (best >= 0) {
        const next = onRef.current.slice(); next[best] = !next[best];
        onRef.current = next; setOn(next);
        near.current = best; onNearLamp({ idx: best, on: next[best] });
        return;
      }
    }
    // 进 / 出某盏的范围:更新 HUD
    if (best !== near.current) { near.current = best; onNearLamp(best >= 0 ? { idx: best, on: onRef.current[best] } : null); }
  });
  return (
    <>
      {LAMP_SPOTS.map(([lx, lz], i) => (
        <group key={`lan${i}`} position={[lx, exGroundY(lx, lz), lz]}>
          <GltfProp url={MODELS.stonelantern} grad={grad} position={[0, 0, 0]} scale={0.8} />
          <LampGlow on={on[i]} />
        </group>
      ))}
    </>
  );
}

const LANTERN_SCALE = 2.0; // kmd.glb 天灯缩放(glb 内含 0.305 node scale → 实际约 1.2 单位高)
// 🏮 升空天灯:火苗呼吸明灭 + 暖色光晕 + 灯口火星打转,缓缓加速升空、越远越小,最后隐入夜空。
function RisingLantern({ x, z, lit, onDone }: { x: number; z: number; lit: boolean; onDone: () => void }) {
  const { scene } = useGLTF(MODELS.skyLantern);
  const g = useRef<THREE.Group>(null);
  const flame = useRef<THREE.PointLight>(null);
  const halo = useRef<THREE.Sprite>(null);
  const core = useRef<THREE.Mesh>(null);
  const emit = useRef<THREE.Points>(null);
  const t = useRef(0);
  const done = useRef(false);
  const y0 = useMemo(() => exGroundY(x, z) + 1.3, [x, z]);
  const seed = useMemo(() => hash2(x * 0.7 + 3.1, z * 0.9 + 1.7) * 10, [x, z]);
  // 克隆 glb + 复制材质(每盏独立淡出),叠暖色自发光让纸灯像被点亮
  const obj = useMemo(() => {
    const cl = scene.clone(true);
    const mats: THREE.MeshStandardMaterial[] = [];
    cl.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const nm = (m.material as THREE.MeshStandardMaterial).clone();
      nm.transparent = true; nm.emissive = new THREE.Color("#ffbf6a"); nm.emissiveIntensity = 1.7; nm.toneMapped = false;
      m.material = nm; mats.push(nm);
    });
    return { cl, mats };
  }, [scene]);
  // 火星:绕灯口轻轻打转、明灭的暖色小光点
  // 火星粒子只给「单灯放飞」(lit)。「放飞一片」的十几盏若各带一套每帧更新的 additive 粒子 →
  // 海量 overdraw + 逐帧位置数组更新,是放飞一片卡顿的大头;flock 灯(lit=false)直接不建、不渲、不更新。
  const ember = useMemo(() => {
    if (!lit) return null;
    const N = 9;
    const pos = new Float32Array(N * 3);
    // 用 (x,z) 派生确定性随机,而非 Math.random()(渲染须纯函数);每盏灯相位不同但稳定。
    const rnd = makeRng(x * 13.1 + z * 7.7 + 1.3);
    const ph: number[] = [];
    for (let i = 0; i < N; i++) ph.push(rnd() * 6.28);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.45, map: glowTexture(), color: "#ffd27a", transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    return { geo, mat, ph, N };
  }, [x, z, lit]);
  useEffect(() => () => { obj.mats.forEach((m) => m.dispose()); ember?.geo.dispose(); ember?.mat.dispose(); }, [obj, ember]);
  useFrame((_, dt) => {
    t.current += dt; const tt = t.current; const go = g.current; if (!go) return;
    // 起步轻柔上浮 → 稳稳加速升空(可达 ~95,贴近远空微光带)
    const yy = y0 + lanternRise(tt);
    go.position.set(x + Math.sin(tt * 0.5 + seed) * (0.5 + tt * 0.05), yy, z + Math.cos(tt * 0.42 + seed) * (0.45 + tt * 0.045));
    go.rotation.y = tt * 0.3 + seed;
    const shrink = 1 - Math.min(0.4, ((yy - y0) / 175) * 0.4); // 越升越小一点点,强化"远去"
    go.scale.setScalar(shrink);
    const flick = 0.82 + Math.sin(tt * 6 + seed) * 0.1 + Math.sin(tt * 14.5 + seed * 2) * 0.05; // 火苗呼吸:慢而温柔,像安静的烛火
    const born = Math.min(1, tt / 1.1);
    const fade = tt < 15 ? 1 : Math.max(0, 1 - (tt - 15) / 4.5); // 飞够高(15s 后)才缓缓隐去
    const f = Math.max(0, Math.min(1, born * fade));
    obj.mats.forEach((m) => { m.opacity = f; m.emissiveIntensity = 1.7 * flick * Math.max(0.18, f); });
    if (flame.current) flame.current.intensity = 3.6 * flick * f;
    if (core.current) { const cm = core.current.material as THREE.MeshBasicMaterial; cm.opacity = 0.85 * flick * f; core.current.scale.setScalar(0.5 + flick * 0.18); }
    if (halo.current) { const hm = halo.current.material as THREE.SpriteMaterial; hm.opacity = 0.5 * flick * f; const hs = 1.7 + Math.sin(tt * 2 + seed) * 0.12; halo.current.scale.set(hs, hs, hs); }
    if (emit.current && ember) {
      const arr = ember.geo.attributes.position.array as Float32Array;
      for (let i = 0; i < ember.N; i++) {
        const a = ember.ph[i] + tt * (0.8 + (i % 3) * 0.3);
        const rr = 0.34 + Math.sin(tt * 1.7 + ember.ph[i]) * 0.12;
        arr[i * 3] = Math.cos(a) * rr;
        arr[i * 3 + 1] = 0.5 + Math.sin(tt * 2.3 + ember.ph[i]) * 0.22 + (i % 4) * 0.06;
        arr[i * 3 + 2] = Math.sin(a) * rr;
      }
      ember.geo.attributes.position.needsUpdate = true;
      ember.mat.opacity = 0.8 * f * (0.6 + Math.sin(tt * 6 + seed) * 0.4);
    }
    if (tt > 20 && !done.current) { done.current = true; onDone(); }
  });
  return (
    <group ref={g}>
      <primitive object={obj.cl} scale={LANTERN_SCALE} />
      {/* 地面暖光仅给「单灯放飞」(1~2 盏);「放飞一片」的天灯不带光源——避免十几个动态点光源拖垮全场材质光照 */}
      {lit && <pointLight ref={flame} color="#ffce82" intensity={3.6} distance={8} decay={2} position={[0, 0.6, 0]} />}
      {/* 内辉光球只给单灯;flock 靠发光本体 + 下面的 halo 光晕即可,省掉十几个 additive 球 */}
      {lit && (
        <mesh ref={core} position={[0, 0.5, 0]}>
          <sphereGeometry args={[0.4, 12, 10]} />
          <meshBasicMaterial color="#ffd98a" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
        </mesh>
      )}
      <sprite ref={halo} position={[0, 0.6, 0]} scale={[1.7, 1.7, 1.7]}>
        <spriteMaterial map={glowTexture()} color="#ffcf86" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
      </sprite>
      {/* 火星粒子只给单灯(见 ember useMemo);flock 不渲染 → 省海量 additive 绘制 + 逐帧粒子更新 */}
      {lit && ember && <points ref={emit} geometry={ember.geo} material={ember.mat} frustumCulled={false} />}
    </group>
  );
}
// 🌟 放飞祝福:放天灯瞬间在起点绽放——地面一圈暖光涟漪向外扩散 + 一束萤火螺旋升腾,
// 给「放飞」一个温柔的仪式起手。自生自灭(~2.6s);坐标取确定性派生(渲染须纯函数)。
function GroundBlessing({ x, z, onDone }: { x: number; z: number; onDone: () => void }) {
  const ring = useRef<THREE.Mesh>(null);
  const motes = useRef<THREE.Points>(null);
  const t = useRef(0); const done = useRef(false);
  const gy = useMemo(() => Math.max(exGroundY(x, z), 0) + 0.12, [x, z]);
  const data = useMemo(() => {
    const N = 16;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const mat = new THREE.PointsMaterial({ size: 0.5, map: glowTexture(), color: "#ffe6a8", transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    // 每颗萤火的螺旋参数:确定性派生(不用 Math.random(),渲染须纯函数)。
    const seeds = Array.from({ length: N }, (_, i) => ({
      a: hash2(x + i * 1.3, z + 2.1) * 6.28,
      r: 0.5 + hash2(x + i, 3.4) * 2.2,
      sp: 2.4 + hash2(x + i, 4.7) * 2.6,
    }));
    return { N, geo, mat, seeds };
  }, [x, z]);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ map: ringTexture(), color: "#ffd98a", transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, side: THREE.DoubleSide }), []);
  useEffect(() => () => { data.geo.dispose(); data.mat.dispose(); ringMat.dispose(); }, [data, ringMat]);
  useFrame((_, dt) => {
    t.current += dt; const tt = t.current;
    if (ring.current) {
      const k = Math.min(1, tt / 1.7);
      const s = 1 + k * 9; ring.current.scale.set(s, s, s); // 光环快速向外扩张
      ringMat.opacity = (1 - k) * 0.85;
    }
    if (motes.current) {
      const arr = data.geo.attributes.position.array as Float32Array;
      for (let i = 0; i < data.N; i++) {
        const sd = data.seeds[i];
        const spiral = sd.a + tt * 1.1;
        const shrink = sd.r * Math.max(0.2, 1 - tt * 0.18); // 螺旋收拢着上升
        arr[i * 3] = Math.cos(spiral) * shrink;
        arr[i * 3 + 1] = sd.sp * tt;
        arr[i * 3 + 2] = Math.sin(spiral) * shrink;
      }
      data.geo.attributes.position.needsUpdate = true;
      data.mat.opacity = Math.max(0, 1 - tt / 2.4);
    }
    if (tt > 2.6 && !done.current) { done.current = true; onDone(); }
  });
  return (
    <group position={[x, gy, z]}>
      <mesh ref={ring} material={ringMat} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3, 3]} />
      </mesh>
      <points ref={motes} geometry={data.geo} material={data.mat} frustumCulled={false} />
    </group>
  );
}
function SkyLanterns({ launchRef, posRef }: { launchRef: React.RefObject<number>; posRef: React.RefObject<THREE.Vector3> }) {
  // 进岛即预先加载天灯模型:顶层 useGLTF 让本组件在自己的 Suspense 里挂起直到 kmd.glb 载完,
  // 而非等首次放飞才加载。载完(本组件成功挂载)即置位全局就绪标志,供放飞前判断「缓存好没」。
  useGLTF(MODELS.skyLantern);
  useEffect(() => { _lanternModelReady = true; }, []);
  type Lan = { id: number; x: number; z: number; lit: boolean };
  const [list, setList] = useState<Lan[]>([]);
  const [bless, setBless] = useState<{ id: number; x: number; z: number }[]>([]);
  const prev = useRef(0); const idc = useRef(0); const bid = useRef(0); const prevFlock = useRef(0);
  const pending = useRef<Lan[]>([]); // 「放飞一片」的天灯排队挂载,逐帧少量挂上 → 摊平 glb 克隆开销,避免一帧卡死
  const lowTier = getPerfTier() === "low";
  const CAP = lowTier ? 10 : 24; // 同时存在的天灯上限(连同其逐帧粒子/材质开销)
  useFrame(() => {
    if (launchRef.current !== prev.current) {
      prev.current = launchRef.current; const p = posRef.current;
      const px = p ? p.x : 0, pz = p ? p.z : 0;
      // 触发仰头跟拍:记录发射点 + 地面高,清零计时(Player 相机据此仰起追灯)
      lanternCam.x = px; lanternCam.z = pz; lanternCam.gy = exGroundY(px, pz); lanternCam.t = 0; lanternCam.on = true;
      setList((l) => [...l, { id: idc.current++, x: px, z: pz, lit: true }].slice(-CAP)); // 单灯带地面暖光
      setBless((b) => [...b, { id: bid.current++, x: px, z: pz }].slice(-6));
    }
    // 万灯齐放:从发射中心四周放出一整片天灯——压入待挂载队列(无光源 + 错峰),不一帧全挂
    if (lanternFlock.v !== prevFlock.current) {
      prevFlock.current = lanternFlock.v;
      const FN = lowTier ? 6 : 12; // 一片天灯的数量(原 18,降量保流畅)
      for (let i = 0; i < FN; i++) {
        const a = Math.random() * Math.PI * 2, r = 2 + Math.sqrt(Math.random()) * 13;
        pending.current.push({ id: idc.current++, x: lanternFlock.x + Math.cos(a) * r, z: lanternFlock.z + Math.sin(a) * r, lit: false });
      }
      setBless((b) => [...b, { id: bid.current++, x: lanternFlock.x, z: lanternFlock.z }].slice(-6));
    }
    // 每帧最多挂载 3 盏待挂载天灯 → 把十几次 glb 克隆摊到数帧,杜绝瞬时掉帧
    if (pending.current.length) {
      const batch = pending.current.splice(0, 3);
      setList((l) => [...l, ...batch].slice(-CAP));
    }
  });
  return (
    <>
      {list.map((L) => <RisingLantern key={L.id} x={L.x} z={L.z} lit={L.lit} onDone={() => setList((l) => l.filter((q) => q.id !== L.id))} />)}
      {bless.map((B) => <GroundBlessing key={B.id} x={B.x} z={B.z} onDone={() => setBless((b) => b.filter((q) => q.id !== B.id))} />)}
    </>
  );
}

// 🎣 拾海垂钓:回报玩家是否在海湾岸边(可垂钓);抛竿时在玩家径向外侧水面显示浮标
function GltfFishingBobber() {
  const { scene } = useGLTF(MODELS.fishingBobber);
  const grad = useMemo(() => makeToonGradient(), []);
  const obj = useMemo(() => toonifyScene(scene, grad), [scene, grad]);
  useEffect(() => () => { grad.dispose(); }, [grad]);
  return <primitive object={obj} scale={1.0} />;
}

function FishingSpot({ posRef, onAtWater, casting }: { posRef: React.RefObject<THREE.Vector3>; onAtWater: (b: boolean) => void; casting: boolean }) {
  const was = useRef(false); const bob = useRef<THREE.Group>(null);
  useFrame((s) => {
    const p = posRef.current; if (!p) return;
    const r2 = p.x * p.x + p.z * p.z;
    const shore = WALK_RADIUS * 0.78;
    const at = r2 > shore * shore && bayMask(p.x, p.z) > 0.32;
    if (at !== was.current) { was.current = at; onAtWater(at); }
    const b = bob.current; if (b) {
      b.visible = casting;
      if (casting) {
        const r = Math.sqrt(r2) || 1;
        const ux = p.x / r, uz = p.z / r;
        b.position.set(p.x + ux * 4.5, 0.15 + Math.sin(s.clock.elapsedTime * 3) * 0.07, p.z + uz * 4.5);
      }
    }
  });
  return (
    <group ref={bob} visible={false}>
      <GltfFishingBobber />
    </group>
  );
}

// 🌊🪵 位置感知音频：按玩家所在区域切换循环底噪 + 靠近地标触发点状音。
// 区域判定用 exGroundY(高度) + bayMask(海湾) + 离心半径；地标用固定坐标+半径边沿触发。
// 位置底噪与情绪底噪并行（lib/locationAmbience.ts 独立运行）；地标音走 envGain 独立常响。
const POND = { x: WALK_RADIUS * 0.3, z: WALK_RADIUS * 0.3 }; // 池塘中心(~53,53)
const POND_CROP_CLEARANCE = 8.5;
const BONFIRE = { x: -6, z: -3 }; // 篝火
const LIGHTHOUSE = { x: -WALK_RADIUS * 0.92, z: -WALK_RADIUS * 0.3 }; // 灯塔(~-163,-53)
const PIER = { x: WALK_RADIUS - 1.5, z: 0 }; // 码头(~176,0)
function LocationAudio({ posRef, night }: { posRef: React.RefObject<THREE.Vector3>; night: boolean }) {
  const zoneT = useRef(0); // 区域检查节流计时
  const curZone = useRef<LocationZone | null>(null);
  const foghornNear = useRef(false); const foghornCool = useRef(0); // 灯塔雾笛：边沿+冷却
  const conchNear = useRef(false); const conchCool = useRef(0); // 码头海螺：边沿+冷却

  useEffect(() => () => { stopLocationAmbience(); }, []); // 卸载即停

  useFrame((_, dt) => {
    const p = posRef.current; if (!p) return;

    // —— 区域底噪：每 0.3s 判定一次，避免每帧切换 ——
    zoneT.current -= dt;
    if (zoneT.current <= 0) {
      zoneT.current = 0.3;
      const r2 = p.x * p.x + p.z * p.z;
      const gy = exGroundY(p.x, p.z);
      const bay = bayMask(p.x, p.z);
      const district = findExploreZone(p.x, p.z);
      const districtZone = exploreZoneAmbience(district, night);
      // 优先级：注册表区块 → 小范围特殊区 → 大范围地貌
      let zone: LocationZone;
      if (districtZone) zone = districtZone;
      else if (dist2(p.x, p.z, POND.x, POND.z) < 144) zone = "brook";
      else if (dist2(p.x, p.z, BONFIRE.x, BONFIRE.z) < 64) zone = "campfire";
      else if (r2 > WALK_RADIUS * WALK_RADIUS * 1.1025) zone = "ocean"; // 远海
      else if ((bay > 0.32 && r2 > WALK_RADIUS * WALK_RADIUS * 0.6084) || gy < 0.12) zone = "bay"; // 海湾/海滩
      else if (gy > 4.5) zone = "mountain"; // 山地
      else if (r2 > WALK_RADIUS * WALK_RADIUS * 0.2025 && r2 <= WALK_RADIUS * WALK_RADIUS * 0.6084) zone = "forest"; // 岛中外圈森林
      else zone = night ? "meadow_night" : "meadow_day"; // 草地/村落
      if (zone !== curZone.current) { curZone.current = zone; setLocationZone(zone, true); }
    }

    // —— 地标点状音：灯塔雾笛（进 12 半径，60s 冷却）——
    foghornCool.current -= dt;
    const lhNear = dist2(p.x, p.z, LIGHTHOUSE.x, LIGHTHOUSE.z) < 144;
    if (lhNear && !foghornNear.current && foghornCool.current <= 0) {
      playSample("foghorn_zone", { gain: 0.5 }); foghornCool.current = 60;
    }
    foghornNear.current = lhNear;

    // —— 地标点状音：码头海螺（进 10 半径，45s 冷却）——
    conchCool.current -= dt;
    const piNear = dist2(p.x, p.z, PIER.x, PIER.z) < 100;
    if (piNear && !conchNear.current && conchCool.current <= 0) {
      playSample("conch_zone", { gain: 0.5 }); conchCool.current = 45;
    }
    conchNear.current = piNear;
  });
  return null;
}

function DistrictProximity({ posRef, onNear }: { posRef: React.RefObject<THREE.Vector3>; onNear: (zone: ExploreZone | null) => void }) {
  const lastKey = useRef<string | null>(null);
  const tick = useRef(0);
  useFrame((_, dt) => {
    tick.current -= dt;
    if (tick.current > 0) return;
    tick.current = 0.25;
    const p = posRef.current;
    const zone = p ? findExploreZone(p.x, p.z) : null;
    const key = zone?.key ?? null;
    if (key !== lastKey.current) {
      lastKey.current = key;
      onNear(zone);
    }
  });
  return null;
}

// ═══════════════ 岛屿小地图 ═══════════════
// 世界坐标(x,z) → 地图 SVG(0..MAP_VIEW)。约定:+z=北=上,+x=东=右(与环岛路控制点一致)。
// 玩家位置/朝向通过 posRef/headingRef 实时读取;地标用各自的世界坐标常量,单一可信源。
const MAP_VIEW = 240; // SVG 画布边长(user units)
const MAP_C = MAP_VIEW / 2; // 中心
const MAP_EXTENT = WALK_RADIUS * 1.12; // 视野半径(含海岸/码头/一圈海)
const mapX = (wx: number) => MAP_C + (wx / MAP_EXTENT) * MAP_C;
const mapY = (wz: number) => MAP_C - (wz / MAP_EXTENT) * MAP_C; // +z 在上
const MAP_ISLAND_R = (WALK_RADIUS / MAP_EXTENT) * MAP_C; // 岛(可走圈)在地图上的半径

type PoiKind = ExplorePoiKind;
interface MapPoi { x: number; z: number; label: string; icon: string; kind: PoiKind; color: string; dx?: number; dy?: number }
const MAP_POIS: MapPoi[] = EXPLORE_MAP_POIS;

// —— 平滑闭合路径(CatmullRom→三次贝塞尔):有机海岸线 / 环岛路共用 ——
function smoothClosedPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n < 3) return "";
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + "Z";
}
// 有机岛形(确定性多频起伏):scaleR=世界半径基准 → 投影屏幕点;海岸/沙岸/浅水/等深线共用同一形状不同半径
const COAST_N = 58;
const coastK = (a: number) => 1 + 0.042 * Math.sin(a * 3 + 0.9) + 0.028 * Math.sin(a * 5 + 2.3) + 0.016 * Math.sin(a * 8 + 4.1) + 0.01 * Math.sin(a * 13 + 1.2);
const coastPath = (scaleR: number) => smoothClosedPath(Array.from({ length: COAST_N }, (_, i) => {
  const a = (i / COAST_N) * Math.PI * 2, r = scaleR * coastK(a);
  return [mapX(Math.cos(a) * r), mapY(Math.sin(a) * r)] as [number, number];
}));
const COAST_LAND = coastPath(WALK_RADIUS * 1.0);
const COAST_SAND = coastPath(WALK_RADIUS * 1.075);
const COAST_SHELF = coastPath(WALK_RADIUS * 1.17);
const COAST_DEEP = coastPath(WALK_RADIUS * 1.34);
const COAST_DEEP2 = coastPath(WALK_RADIUS * 1.52);
const MAP_ROAD_PATH = smoothClosedPath(ROAD_CTRL_PTS.map(([x, z]) => [mapX(x), mapY(z)] as [number, number]));
const MAP_BAY_EDGE = { x: Math.cos(BAY_ANGLE) * WALK_RADIUS * 0.9, z: Math.sin(BAY_ANGLE) * WALK_RADIUS * 0.9 }; // 海湾(陆地东南缘的浅水沙湾)

// 森林:聚簇成林(每簇一个林心,周围散布),按屏幕 y 排序→下方树覆盖上方树,出层次;避开地标与出岛
interface MapTree { cx: number; cy: number; r: number; t: number }
const MAP_TREES: MapTree[] = (() => {
  const out: MapTree[] = [];
  for (let cl = 0; cl < 11; cl++) {
    const ca = hash2(cl, 9.13) * Math.PI * 2;
    const cr = (0.32 + hash2(cl, 2.31) * 0.6) * WALK_RADIUS;
    const ccx = Math.cos(ca) * cr, ccz = Math.sin(ca) * cr;
    const cnt = 5 + Math.floor(hash2(cl, 4.77) * 7);
    for (let k = 0; k < cnt; k++) {
      const idx = cl * 23 + k;
      const ra = hash2(idx, 1.31) * Math.PI * 2, rr = hash2(idx, 3.91) * 17;
      const wx = ccx + Math.cos(ra) * rr, wz = ccz + Math.sin(ra) * rr;
      if (Math.hypot(wx, wz) > WALK_RADIUS * 0.99) continue;
      if (MAP_POIS.some((p) => Math.hypot(wx - p.x, wz - p.z) < 14)) continue;
      out.push({ cx: mapX(wx), cy: mapY(wz), r: (2.5 + hash2(idx, 1.97) * 2.7) * (MAP_C / MAP_EXTENT), t: hash2(idx, 5.31) });
    }
  }
  out.sort((a, b) => a.cy - b.cy);
  return out;
})();

// 草地明暗斑:打破单色草地,给地表加起伏质感(裁剪在陆地内)
interface MapBlob { cx: number; cy: number; rx: number; ry: number; dark: boolean }
const MAP_GRASS: MapBlob[] = Array.from({ length: 5 }, (_, i) => {
  const a = hash2(i, 11.3) * Math.PI * 2, r = (0.18 + hash2(i, 6.1) * 0.5) * WALK_RADIUS;
  return { cx: mapX(Math.cos(a) * r), cy: mapY(Math.sin(a) * r), rx: (20 + hash2(i, 3.3) * 24) * (MAP_C / MAP_EXTENT), ry: (15 + hash2(i, 7.7) * 18) * (MAP_C / MAP_EXTENT), dark: i % 2 === 0 };
});

// —— 地标矢量小图标(卡通俯视风,统一描边 + 落地阴影 + 门窗细节;仅放大图显示) ——
function PoiIcon({ kind, night }: { kind: PoiKind; night: boolean }) {
  const ink = night ? "#0b1733" : "#46341f";
  const wall = night ? "#cfd8ec" : "#fbf3e0";
  const roof = night ? "#9f6b7e" : "#d9613f";
  const wood = night ? "#6a5640" : "#b07a44";
  const win = night ? "#3a4a66" : "#7fb0c8";
  const co = { stroke: ink, strokeWidth: 0.9, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const shadow = <ellipse cx={0} cy={5} rx={6.2} ry={2.1} fill="#000" opacity={night ? 0.3 : 0.16} />;
  switch (kind) {
    case "home":
      return (<g>{shadow}
        <rect x={-4.4} y={-0.6} width={8.8} height={5.6} rx={0.9} fill={wall} {...co} />
        <path d="M-5.6 -0.6 L0 -5.3 L5.6 -0.6 Z" fill={roof} {...co} />
        <rect x={-1.1} y={1.5} width={2.2} height={3.5} rx={0.35} fill={wood} {...co} />
        <circle cx={2.8} cy={1.6} r={1.1} fill={win} /></g>);
    case "rice":
      return (<g>{shadow}
        <rect x={-5.5} y={-4.2} width={11} height={8.5} rx={1.2} fill={night ? "#69805e" : "#b8d776"} {...co} />
        <path d="M-3.7 -3.2 V3.3 M-1.2 -3.5 V3.6 M1.2 -3.5 V3.6 M3.7 -3.2 V3.3" stroke={night ? "#d8e2a0" : "#f7f0a8"} strokeWidth={0.75} strokeLinecap="round" />
        <path d="M-5.1 -1.5 H5.1 M-5.1 1.4 H5.1" stroke={night ? "#4f6448" : "#87b55d"} strokeWidth={0.75} /></g>);
    case "farm":
      return (<g>{shadow}
        <rect x={-4.8} y={-0.4} width={9.6} height={5.4} rx={0.8} fill={wall} {...co} />
        <path d="M-5.8 -0.4 L0 -4.7 L5.8 -0.4 Z" fill={night ? "#8f5f4f" : "#c96b42"} {...co} />
        <path d="M-5.6 5.3 H5.6 M-4.4 3.6 H4.4" stroke={wood} strokeWidth={0.9} strokeLinecap="round" /></g>);
    case "mountain":
      return (<g>{shadow}
        <path d="M-6 4.8 L-1.6 -5.2 L1.1 0.2 L3 -3.6 L6 4.8 Z" fill={night ? "#65758a" : "#9ab29a"} {...co} />
        <path d="M-1.6 -5.2 L-0.1 -2.1 L-2.4 -2.4 Z" fill="#eef5f7" stroke="none" />
        <path d="M3 -3.6 L4.2 -1 L2.2 -1.2 Z" fill="#eef5f7" stroke="none" /></g>);
    case "forest":
      return (<g>{shadow}
        <path d="M-4.2 3.8 L-1.6 -1.2 L-3.2 -1.2 L-0.7 -5 L1.8 -1.2 H0.3 L3 3.8 Z" fill={night ? "#315641" : "#4f9a57"} {...co} />
        <path d="M1.8 4.4 L4.7 4.4 L3.2 -0.2 L4.4 -0.2 L2.5 -3.2 L0.6 -0.2 H1.8 Z" fill={night ? "#284735" : "#6fb46a"} {...co} /></g>);
    case "zoo":
      return (<g>{shadow}
        <rect x={-5.2} y={-4.2} width={10.4} height={8.8} rx={1.4} fill={night ? "#4a5365" : "#f1d2a0"} {...co} />
        <path d="M-3.8 -2.4 V3.6 M-1.2 -2.4 V3.6 M1.2 -2.4 V3.6 M3.8 -2.4 V3.6" stroke={wood} strokeWidth={0.85} />
        <circle cx={-1.4} cy={-0.2} r={1.1} fill={night ? "#d6c2a0" : "#8f6b52"} />
        <circle cx={1.4} cy={-0.2} r={1.1} fill={night ? "#d6c2a0" : "#8f6b52"} /></g>);
    case "swamp":
      return (<g>{shadow}
        <ellipse cx={0} cy={1.4} rx={6.1} ry={4.2} fill={night ? "#315c55" : "#8fc5a7"} {...co} />
        <path d="M-4.5 2.8 C-2.4 0.8 -0.8 4 1.1 1.8 C2.7 0 4.2 2.4 5.2 1" fill="none" stroke={night ? "#b7dec4" : "#e6ffe8"} strokeWidth={0.8} strokeLinecap="round" />
        <path d="M-3.6 -2.5 C-3.2 -0.8 -3.2 0.4 -3.7 1.7 M3.6 -2.6 C3.1 -0.7 3.2 0.5 3.7 1.8" stroke={wood} strokeWidth={0.75} strokeLinecap="round" /></g>);
    case "scenic":
      return (<g>{shadow}
        <path d="M-5 4.4 H5 M-3.8 2.5 H3.8 M-2.8 0.7 H2.8" stroke={wood} strokeWidth={1} strokeLinecap="round" />
        <path d="M0 -5 L1.2 -1.3 L5 -1.3 L1.9 0.9 L3.1 4.4 L0 2.1 L-3.1 4.4 L-1.9 0.9 L-5 -1.3 L-1.2 -1.3 Z" fill={night ? "#ffe9a0" : "#ffcf5a"} stroke={ink} strokeWidth={0.7} strokeLinejoin="round" /></g>);
    case "town":
      return (<g>{shadow}
        <rect x={-4.6} y={-1.2} width={3.4} height={6.2} rx={0.5} fill={wall} {...co} />
        <rect x={-1} y={-3.6} width={3} height={8.6} rx={0.5} fill={wall} {...co} />
        <rect x={2.2} y={0.2} width={3} height={4.8} rx={0.5} fill={wall} {...co} />
        <rect x={-3.9} y={0.4} width={1.1} height={1.1} fill={win} /><rect x={-3.9} y={2.3} width={1.1} height={1.1} fill={win} />
        <rect x={-0.1} y={-1.8} width={1.2} height={1.2} fill={win} /><rect x={-0.1} y={0.6} width={1.2} height={1.2} fill={win} />
        <rect x={3.1} y={1.5} width={1.1} height={1.1} fill={win} /></g>);
    case "beach":
      return (<g>{shadow}
        <path d="M0.4 4.6 L-1.4 -2" stroke={wood} strokeWidth={1} strokeLinecap="round" />
        <path d="M-5 -1.8 A5 5 0 0 1 3.4 -3 Z" fill={night ? "#e08a6a" : "#ff8a5c"} {...co} />
        <path d="M-1.2 -2.1 A4.4 4.4 0 0 1 -4.7 -1.7" fill="none" stroke={night ? "#cfd8ec" : "#fff2dd"} strokeWidth={0.7} opacity={0.7} /></g>);
    default:
      return null;
  }
}

// 静态地图体(海/浪/浅滩/沙岸/草地质感/森林/环岛路/海湾/地标)。labeled 时:矢量建筑图标 + 标签牌 + 指北针(放大后的全岛大图)。
function IslandMapBody({ night, labeled }: { night: boolean; labeled: boolean }) {
  const uid = useId().replace(/:/g, "");
  const seaG = `xy-sea-${uid}`, landG = `xy-land-${uid}`, landClip = `xy-clip-${uid}`;
  const c = night
    ? { shelf: "#173a63", sand: "#39414f", landEdge: "#22323a", road: "#525162", roadEdge: "#33333f", roadLine: "#7a7a8a", bayW: "#1c3e6b", baySand: "#3a4250", treeB: "#234a3e", treeL: "#2f5b49", treeD: "#15302a", grassD: "#16302a", grassL: "#33564a", seaLine: "#2a4a7a", foam: "#7fa8d8", shadow: "#081026", ink: "#0b1733", txt: "#eef4ff", labelBg: "rgba(11,23,51,0.82)" }
    : { shelf: "#bfe6f2", sand: "#f0dcab", landEdge: "#86bb63", road: "#dcb878", roadEdge: "#b48a4c", roadLine: "#f3ead0", bayW: "#bfe9f2", baySand: "#f3e3bb", treeB: "#5fa356", treeL: "#84c46a", treeD: "#3f7e44", grassD: "#7bb35e", grassL: "#abdc86", seaLine: "#aedcea", foam: "#ffffff", shadow: "#3f7da0", ink: "#46341f", txt: "#243038", labelBg: "rgba(255,255,255,0.86)" };
  const seaStops = night ? ["#1a2e54", "#12224a", "#0a1430"] : ["#9bd8ec", "#6fbfdd", "#4b97c2"];
  const landStops = night ? ["#33454c", "#293a40", "#22323a"] : ["#b6de8b", "#9fd07b", "#86bb63"];
  return (
    <g>
      <defs>
        <radialGradient id={seaG} cx="50%" cy="50%" r="62%">
          <stop offset="0%" stopColor={seaStops[0]} /><stop offset="58%" stopColor={seaStops[1]} /><stop offset="100%" stopColor={seaStops[2]} />
        </radialGradient>
        <radialGradient id={landG} cx="45%" cy="40%" r="70%">
          <stop offset="0%" stopColor={landStops[0]} /><stop offset="62%" stopColor={landStops[1]} /><stop offset="100%" stopColor={landStops[2]} />
        </radialGradient>
        <clipPath id={landClip}><path d={COAST_LAND} /></clipPath>
      </defs>
      {/* 海面 */}
      <rect x={0} y={0} width={MAP_VIEW} height={MAP_VIEW} fill={`url(#${seaG})`} />
      {/* 远海等深虚线(海图味,两圈) */}
      <path d={COAST_DEEP2} fill="none" stroke={c.seaLine} strokeWidth={0.7} strokeDasharray="2 5" opacity={night ? 0.28 : 0.38} />
      <path d={COAST_DEEP} fill="none" stroke={c.seaLine} strokeWidth={0.8} strokeDasharray="3 4" opacity={night ? 0.4 : 0.5} />
      {/* 近岸浅水肩 */}
      <path d={COAST_SHELF} fill={c.shelf} opacity={night ? 0.5 : 0.7} />
      {/* 岛屿水下投影(立体感) */}
      <path d={COAST_SAND} transform="translate(0 2.6)" fill={c.shadow} opacity={night ? 0.3 : 0.24} />
      {/* 沙岸 → 草地 */}
      <path d={COAST_SAND} fill={c.sand} />
      <path d={COAST_LAND} fill={`url(#${landG})`} stroke={c.landEdge} strokeWidth={1.4} strokeLinejoin="round" />
      {/* 草地明暗斑(裁在陆地内) */}
      <g clipPath={`url(#${landClip})`}>
        {MAP_GRASS.map((b, i) => (
          <ellipse key={i} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill={b.dark ? c.grassD : c.grassL} opacity={night ? 0.18 : 0.22} />
        ))}
      </g>
      {/* 岸边浪花线 */}
      <path d={COAST_LAND} fill="none" stroke={c.foam} strokeWidth={1} strokeDasharray="1.5 3" opacity={night ? 0.3 : 0.55} />
      {/* 海湾:陆地东南缘一处浅水沙湾 + 浪花 */}
      <circle cx={mapX(MAP_BAY_EDGE.x)} cy={mapY(MAP_BAY_EDGE.z)} r={MAP_ISLAND_R * 0.32} fill={c.baySand} opacity={0.9} />
      <circle cx={mapX(MAP_BAY_EDGE.x)} cy={mapY(MAP_BAY_EDGE.z)} r={MAP_ISLAND_R * 0.22} fill={c.bayW} opacity={0.92} />
      <circle cx={mapX(MAP_BAY_EDGE.x)} cy={mapY(MAP_BAY_EDGE.z)} r={MAP_ISLAND_R * 0.27} fill="none" stroke={c.foam} strokeWidth={0.8} strokeDasharray="1.5 3" opacity={night ? 0.3 : 0.55} />
      {/* 森林树丛 */}
      {MAP_TREES.map((t, i) => (
        <g key={i}>
          <circle cx={t.cx} cy={t.cy + t.r * 0.34} r={t.r} fill={c.treeD} opacity={0.5} />
          <circle cx={t.cx} cy={t.cy} r={t.r * (0.84 + t.t * 0.22)} fill={c.treeB} />
          <circle cx={t.cx - t.r * 0.26} cy={t.cy - t.r * 0.26} r={t.r * 0.48} fill={c.treeL} opacity={0.9} />
        </g>
      ))}
      {/* 环岛公路(平滑闭环:描边 + 路面 + 虚线分道) */}
      <path d={MAP_ROAD_PATH} fill="none" stroke={c.roadEdge} strokeWidth={4.6} strokeLinejoin="round" opacity={0.9} />
      <path d={MAP_ROAD_PATH} fill="none" stroke={c.road} strokeWidth={2.9} strokeLinejoin="round" />
      <path d={MAP_ROAD_PATH} fill="none" stroke={c.roadLine} strokeWidth={0.5} strokeDasharray="2 3" opacity={0.6} />
      {/* 地标:缩略图只显光点;大图显矢量图标 + 标签牌(分两层,标签压在图标之上) */}
      {!labeled
        ? MAP_POIS.map((p, i) => (
            <g key={i}>
              <circle cx={mapX(p.x)} cy={mapY(p.z)} r={4.6} fill={p.color} opacity={0.28} />
              <circle cx={mapX(p.x)} cy={mapY(p.z)} r={2.4} fill={p.color} stroke={c.ink} strokeWidth={0.7} />
            </g>
          ))
        : (<>
            {MAP_POIS.map((p, i) => (
              <g key={`ic${i}`} transform={`translate(${mapX(p.x)} ${mapY(p.z)})`}><PoiIcon kind={p.kind} night={night} /></g>
            ))}
            {MAP_POIS.map((p, i) => {
              const lw = p.label.length * 6.5 + 9;
              return (
                <g key={`lb${i}`} transform={`translate(${mapX(p.x) + (p.dx ?? 0)} ${mapY(p.z) + (p.dy ?? -11)})`}>
                  <rect x={-lw / 2} y={-6.2} width={lw} height={11.4} rx={5.7} fill={c.labelBg} stroke={c.ink} strokeWidth={0.5} />
                  <text x={0} y={2.1} fontSize={6.3} textAnchor="middle" fill={c.txt} style={{ fontWeight: 700 }}>{p.label}</text>
                </g>
              );
            })}
          </>)}
      {/* 指北针(仅大图) */}
      {labeled && (
        <g transform={`translate(${MAP_VIEW - 22} ${MAP_VIEW - 22})`}>
          <circle r={11} fill={c.labelBg} stroke={c.ink} strokeWidth={1} />
          <path d="M0 -8 L2.6 0 L0 -2 L-2.6 0 Z" fill="#ff3b6b" />
          <path d="M0 8 L2.6 0 L0 2 L-2.6 0 Z" fill={night ? "#9fb0d8" : "#8595ab"} />
          <text x={0} y={-12.4} fontSize={5.5} textAnchor="middle" fill={c.txt} style={{ fontWeight: 700 }}>N</text>
        </g>
      )}
    </g>
  );
}

// 小地图:左上常驻缩略图(点开 → 可缩放/平移的全岛大图,带地标标注与图例)。
// 玩家箭头用 rAF 直接改 transform(不触发 React 重渲),位置/朝向取自 posRef/headingRef。
function Minimap({ posRef, headingRef, night }: { posRef: React.RefObject<THREE.Vector3>; headingRef: React.RefObject<number>; night: boolean }) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 }); // 大图平移(SVG user 单位)
  const miniArrow = useRef<SVGGElement>(null);
  const bigArrow = useRef<SVGGElement>(null);
  const bigSvg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // 实时跟随玩家(rAF):缩略图箭头 + 大图箭头(后者随当前缩放/平移换算屏幕位置,自身不缩放)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = posRef.current;
      if (p) {
        const deg = ((headingRef.current ?? 0) * 180) / Math.PI;
        const mx = mapX(p.x), my = mapY(p.z);
        if (miniArrow.current) miniArrow.current.setAttribute("transform", `translate(${mx.toFixed(2)} ${my.toFixed(2)}) rotate(${deg.toFixed(1)})`);
        if (bigArrow.current) bigArrow.current.setAttribute("transform", `translate(${(pan.x + zoom * mx).toFixed(2)} ${(pan.y + zoom * my).toFixed(2)}) rotate(${deg.toFixed(1)})`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [posRef, headingRef, zoom, pan]);

  const clampPan = (z: number, px: number, py: number) => {
    const lo = MAP_VIEW - MAP_VIEW * z; // ≤ 0
    return { x: Math.min(0, Math.max(lo, px)), y: Math.min(0, Math.max(lo, py)) };
  };
  // 以(ax,ay)为锚点缩放到 nz:锚点下的地图点保持不动
  const applyZoom = (nz: number, ax: number, ay: number) => {
    nz = Math.min(5, Math.max(1, nz));
    const bx = (ax - pan.x) / zoom, by = (ay - pan.y) / zoom;
    setPan(clampPan(nz, ax - bx * nz, ay - by * nz));
    setZoom(nz);
  };
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const svg = bigSvg.current; if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ax = ((e.clientX - rect.left) / rect.width) * MAP_VIEW;
    const ay = ((e.clientY - rect.top) / rect.height) * MAP_VIEW;
    applyZoom(zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), ax, ay);
  };
  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current, svg = bigSvg.current; if (!d || !svg) return;
    const k = MAP_VIEW / svg.getBoundingClientRect().width;
    setPan(clampPan(zoom, d.px + (e.clientX - d.x) * k, d.py + (e.clientY - d.y) * k));
  };
  const onUp = () => { drag.current = null; };
  const recenter = () => {
    const p = posRef.current; if (!p) return;
    setPan(clampPan(zoom, MAP_C - zoom * mapX(p.x), MAP_C - zoom * mapY(p.z)));
  };
  const openMap = () => { setZoom(1); setPan({ x: 0, y: 0 }); setOpen(true); playSfx("tap"); };

  return (
    <>
      {/* 左上常驻缩略图(在 ☰ 菜单按钮下方) */}
      <button
        type="button"
        onClick={openMap}
        aria-label="打开全岛地图"
        className="xy-explore-minimap panel-glass-2 absolute z-10 rounded-2xl p-1 active:scale-95 transition-transform sm:p-1.5"
        style={{ position: "absolute", left: "calc(0.85rem + env(safe-area-inset-left))", top: "calc(4.25rem + env(safe-area-inset-top))" }}
      >
        <svg viewBox={`0 0 ${MAP_VIEW} ${MAP_VIEW}`} className="block h-24 w-24 rounded-xl sm:h-[116px] sm:w-[116px]">
          <IslandMapBody night={night} labeled={false} />
          <g ref={miniArrow}>
            <circle r={9} fill={night ? "#ffd0d8" : "#ffffff"} opacity={0.22} />
            <path d="M0,-11 L7,7 L0,3 L-7,7 Z" fill="#ff3b6b" stroke="#ffffff" strokeWidth={1.4} strokeLinejoin="round" />
          </g>
        </svg>
        <span className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/45 px-2 py-0.5 text-[10px] leading-none tracking-wide text-white/85">🔍 地图</span>
      </button>

      {/* 放大后的全岛地图(可缩放/平移 + 标注 + 图例) */}
      {open && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 px-4" onClick={() => setOpen(false)}>
          <div className="panel-glass-2 rounded-card p-3 w-[min(94vw,40rem)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="font-display text-[15px] tracking-wider text-white/90">心屿 · 全岛地图</span>
              <button onClick={() => setOpen(false)} aria-label="关闭地图" className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:bg-white/10 active:scale-90 transition">✕</button>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-white/10">
              <svg
                ref={bigSvg}
                viewBox={`0 0 ${MAP_VIEW} ${MAP_VIEW}`}
                className="block w-full select-none"
                style={{ aspectRatio: "1 / 1", touchAction: "none", cursor: "grab" }}
                onWheel={onWheel}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerLeave={onUp}
              >
                <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                  <IslandMapBody night={night} labeled />
                </g>
                <g ref={bigArrow}>
                  <circle r={6.5} fill="#ffffff" opacity={0.28} />
                  <path d="M0,-7.5 L5,5 L0,2 L-5,5 Z" fill="#ff3b6b" stroke="#ffffff" strokeWidth={1.1} strokeLinejoin="round" />
                </g>
              </svg>
              {/* 缩放比例 */}
              <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/40 px-2 py-0.5 text-[11px] text-white/85">{zoom.toFixed(1)}×</div>
              {/* 缩放 / 回到我 控件 */}
              <div className="absolute right-2 top-2 flex flex-col gap-1.5">
                <button onClick={() => applyZoom(zoom * 1.5, MAP_C, MAP_C)} aria-label="放大" className="flex h-9 w-9 items-center justify-center rounded-full panel-glass-2 text-[18px] leading-none text-white/90 active:scale-90 transition">＋</button>
                <button onClick={() => applyZoom(zoom / 1.5, MAP_C, MAP_C)} aria-label="缩小" className="flex h-9 w-9 items-center justify-center rounded-full panel-glass-2 text-[18px] leading-none text-white/90 active:scale-90 transition">－</button>
                <button onClick={recenter} aria-label="回到我的位置" className="flex h-9 w-9 items-center justify-center rounded-full panel-glass-2 text-[15px] leading-none text-white/90 active:scale-90 transition">◎</button>
              </div>
            </div>
            {/* 图例 / 标注 */}
            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 px-1 text-[11px] text-white/72 sm:grid-cols-3">
              <span className="text-[#ff8aa3]">▲ 你的位置</span>
              {MAP_POIS.map((p) => (
                <span key={p.label} className="truncate">{p.icon} {p.label}</span>
              ))}
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-white/45">滚轮 / ＋－ 缩放 · 拖动平移 · ◎ 回到我的位置</p>
          </div>
        </div>
      )}
    </>
  );
}

// 🎐 风铃心曲:5 个散布风铃,走近(进入半径的瞬间)敲响其音;ExploreMode 比对目标曲序
const CHIME_FREQS = [523.25, 587.33, 659.25, 783.99, 880.0]; // C D E G A 五声音阶
// 引导光标:下一个该敲的风铃只保留低调光环 + 微弱点光,避免近镜头出现大片黄色光幕。
function ChimeBeacon({ pos }: { pos: { x: number; y: number; z: number } }) {
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#dffcff", transparent: true, opacity: 0.36, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
  useEffect(() => () => { ringMat.dispose(); }, [ringMat]);
  useFrame((s) => {
    const pulse = 0.5 + Math.sin(s.clock.elapsedTime * 3) * 0.5;
    const r = ring.current; if (r) { const k = 1 + pulse * 0.3; r.scale.set(k, k, 1); }
    ringMat.opacity = 0.14 + pulse * 0.2;
  });
  return (
    <group position={[pos.x, pos.y, pos.z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]} material={ringMat}><ringGeometry args={[1.1, 1.6, 32]} /></mesh>
      <pointLight color="#dffcff" intensity={1.2} distance={5.5} decay={1.9} position={[0, 2.2, 0]} />
    </group>
  );
}
function WindChimes({ posRef, onRing, grad, nextChime = -1 }: { posRef: React.RefObject<THREE.Vector3>; onRing: (i: number) => void; grad: THREE.Texture; nextChime?: number }) {
  const spots = useMemo(() => CHIME_FREQS.map((_, i) => {
    const a = (i / CHIME_FREQS.length) * Math.PI * 2 + 0.7;
    const r = WALK_RADIUS * (0.42 + (i % 2) * 0.16);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    return { x, z, y: exGroundY(x, z) };
  }), []);
  const inside = useRef(-1);
  useFrame(() => {
    const p = posRef.current; if (!p) return;
    let cur = -1;
    for (let i = 0; i < spots.length; i++) { if (dist2(p.x, p.z, spots[i].x, spots[i].z) < 12.96) { cur = i; break; } }
    if (cur !== inside.current) { inside.current = cur; if (cur >= 0) onRing(cur); }
  });
  return (
    <>
      {spots.map((s, i) => <GltfProp key={i} url={MODELS.isleWindchime} grad={grad} position={[s.x, s.y, s.z]} scale={0.95} />)}
      {nextChime >= 0 && nextChime < spots.length && <ChimeBeacon key={nextChime} pos={spots[nextChime]} />}
    </>
  );
}

// ✨ 萤火:风铃心曲奏成后升起的奖励光点群
function Fireflies({ count = 46 }: { count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.SphereGeometry(0.09, 6, 5), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#fff4b0", emissive: new THREE.Color("#ffe98a"), emissiveIntensity: 3, toneMapped: false }), []);
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({ a: hash2(i, 1.1) * 6.28, r: 6 + hash2(i, 2.2) * WALK_RADIUS * 0.42, h: 2 + hash2(i, 3.3) * 5, ph: hash2(i, 4.4) * 6.28 })), [count]);
  const mm = useMemo(() => new THREE.Matrix4(), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame((s) => {
    const m = ref.current; if (!m) return; const t = s.clock.elapsedTime;
    for (let i = 0; i < count; i++) { const sd = seeds[i]; const x = Math.cos(sd.a + Math.sin(t * 0.2 + sd.ph) * 0.12) * sd.r; const z = Math.sin(sd.a + Math.cos(t * 0.2 + sd.ph) * 0.12) * sd.r; const y = exGroundY(x, z) + sd.h + Math.sin(t * 0.8 + sd.ph) * 0.5; mm.makeTranslation(x, y, z); m.setMatrixAt(i, mm); }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, count]} frustumCulled={false} />;
}

// 🌌 远空微光:放飞过的天灯化作夜空里渐远的暖光(仅夜晚显形)
function DistantGlows({ count }: { count: number }) {
  const n = Math.min(count, 30);
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.SphereGeometry(0.7, 6, 5), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffd98f", transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return; const mm = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = hash2(i + 31, 1.7) * Math.PI * 2;
      const rr = (1.4 + hash2(i + 31, 2.3) * 1.5) * WALK_RADIUS;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const y = 52 + hash2(i + 31, 3.1) * 96;
      mm.makeTranslation(x, y, z); m.setMatrixAt(i, mm);
    }
    m.count = n; m.instanceMatrix.needsUpdate = true;
  }, [n]);
  useFrame((s) => { mat.opacity = 0.5 + Math.sin(s.clock.elapsedTime * 0.7) * 0.22; });
  if (n === 0) return null;
  return <instancedMesh ref={ref} args={[geo, mat, 30]} frustumCulled={false} />;
}

// 🌙 夜空明月:心屿统一「卡通手绘睡月」(见 CartoonMoon.tsx)贴在朝相机的 billboard 上,
// 背后叠一层暖色月华向夜空散开。关 fog/toneMapped,夜里通透不被雾吃掉;整体缓慢呼吸。
const MOON_GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const MOON_GLOW_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying vec2 vUv;
  void main(){
    vec2 q = (vUv - 0.5) * 2.0;
    float r = length(q);
    float core = pow(max(0.0, 1.0 - r), 2.4);          // 单层径向辉光(贴月聚拢,左边那种形态)
    float a = clamp(core * 0.40, 0.0, 1.0);            // 适中亮度(更明显↑0.58 / 更隐约↓0.24)
    a *= 0.9 + 0.1 * sin(uTime * 0.6);                 // 微弱呼吸
    vec3 c = mix(vec3(0.74, 0.83, 1.0), vec3(0.95, 0.97, 1.0), core); // 冷月光白:远端冷蓝白 ← 近端亮白,无暖黄
    gl_FragColor = vec4(c, a);
  }`;
useTexture.preload(MOON_TEXTURE_URL);
function Moon() {
  const tex = useTexture(MOON_TEXTURE_URL);
  useLayoutEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
  }, [tex]);
  const glowU = useMemo(() => ({ uTime: { value: 0 } }), []);
  const grp = useRef<THREE.Group>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    glowU.uTime.value = t;
    if (grp.current) grp.current.scale.setScalar(1 + 0.02 * Math.sin(t * 0.5)); // 缓慢呼吸
  });
  return (
    <Billboard position={[430, 470, -1240]}>
      <group ref={grp}>
        {/* 暖色月华:向夜空散开的柔光 */}
        <mesh position={[0, 0, -4]}>
          <planeGeometry args={[720, 720]} />
          <shaderMaterial uniforms={glowU} vertexShader={MOON_GLOW_VERT} fragmentShader={MOON_GLOW_FRAG} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
        </mesh>
        {/* 卡通手绘睡月:同一张 SVG 贴图,正脸朝相机 */}
        <mesh>
          <planeGeometry args={[300, 300]} />
          <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} fog={false} alphaTest={0.02} />
        </mesh>
      </group>
    </Billboard>
  );
}

// 🎆 一发完整烟花:升空拖尾 → 爆心闪光 → 粒子绽放(牡丹 / 垂柳 / 环)。
// 粒子「白炽→本色→余烬」渐变 + 随机明灭(噼啪)+ 空气阻尼与重力下坠;坐标取本组局部(组锚在发射点)。
type FwShape = "peony" | "willow" | "ring" | "heart" | "chrysanthemum";
function FireworkShell({ ox, oz, apex, color, color2, shape, delay, big, reduced, onBurst, onDone }: {
  ox: number; oz: number; apex: number; color: string; color2: string; shape: FwShape; delay: number; big: boolean; reduced: boolean; onBurst: () => void; onDone: () => void;
}) {
  const baseY = useMemo(() => exGroundY(ox, oz) + 1.5, [ox, oz]);
  const RISE = 1.15;
  const LIFE = shape === "willow" ? 3.4 : 2.8;
  const N = reduced ? (shape === "willow" ? 56 : 44) : shape === "willow" ? 128 : shape === "chrysanthemum" ? 144 : shape === "heart" ? 104 : big ? 120 : 92; // 粒子数:additive 叠加下肉眼几乎无差,降约 1/4 减 CPU/上传
  const TRAIL = reduced ? 6 : 10;
  const head = useRef<THREE.Sprite>(null);
  const flash = useRef<THREE.Sprite>(null);
  const trail = useRef<THREE.Points>(null);
  const burstPts = useRef<THREE.Points>(null);
  const shock = useRef<THREE.Sprite>(null);
  const t = useRef(-delay);
  const phase = useRef(0); // 0 升空 · 1 绽放 · 2 结束
  const hist = useRef<number[]>([]);
  const burstAt = useRef(0);

  const data = useMemo(() => {
    const dir: number[] = [];
    const spd: number[] = [];
    const tw: number[] = [];
    // 用 (ox,oz,delay) 派生确定性随机,而非 Math.random()(渲染须纯函数);每发烟花形态各异但稳定。
    const rnd = makeRng(ox * 3.1 + oz * 5.7 + delay * 11.3 + 2.9);
    const tilt = rnd() * Math.PI;
    for (let i = 0; i < N; i++) {
      let dx: number, dy: number, dz: number;
      if (shape === "ring") {
        const a = (i / N) * Math.PI * 2 + rnd() * 0.06;
        dx = Math.cos(a); dy = Math.sin(a) * 0.16; dz = Math.sin(a);
        const cy = Math.cos(tilt), sy = Math.sin(tilt);
        const ny = dy * cy - dz * sy, nz = dy * sy + dz * cy; dy = ny; dz = nz; // 绕 X 轴倾斜 → 环有透视
      } else if (shape === "heart") {
        // 心形线参数方程:粒子等距铺成一颗爱心,绕 Y 轴朝 tilt 方向竖立(治愈主题——写下心事 → 绽一朵心形花火)。
        const a = (i / N) * Math.PI * 2;
        const hx = (16 * Math.pow(Math.sin(a), 3)) / 17;
        const hy = (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17;
        const jz = (rnd() - 0.5) * 0.1; // 一点面外厚度,免得纯平
        dx = hx * Math.cos(tilt) - Math.sin(tilt) * jz;
        dz = hx * Math.sin(tilt) + Math.cos(tilt) * jz;
        dy = hy;
      } else {
        const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r2 = Math.sqrt(1 - u * u);
        dx = Math.cos(th) * r2; dy = u; dz = Math.sin(th) * r2; // 球面均匀 → 圆整(peony / chrysanthemum)
      }
      dir.push(dx, dy, dz);
      spd.push(
        shape === "willow" ? 5 + rnd() * 3
          : shape === "heart" ? (big ? 10 : 8.5)                       // 等速 → 心形清晰不散
            : shape === "chrysanthemum" ? (big ? 12 : 10) + rnd() * 8  // 速度宽分布 → 细密蓬松如菊
              : (big ? 11 : 9) + rnd() * 6,
      );
      tw.push(8 + rnd() * 16);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const mat = new THREE.PointsMaterial({ size: big ? 10 : 8, map: glowTexture(), vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: false, fog: false });
    const tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    tgeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    const tmat = new THREE.PointsMaterial({ size: 7, map: glowTexture(), vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: false, fog: false });
    return { dir, spd, tw, geo, mat, tgeo, tmat, c1: new THREE.Color(color), c2: new THREE.Color(color2), ember: new THREE.Color("#ff4d1a") };
  }, [N, TRAIL, shape, big, color, color2, ox, oz, delay]);
  useEffect(() => () => { data.geo.dispose(); data.mat.dispose(); data.tgeo.dispose(); data.tmat.dispose(); }, [data]);

  useFrame((_, dt) => {
    t.current += dt; const tt = t.current;
    const hd = head.current, fl = flash.current, tr = trail.current, bp = burstPts.current, sk = shock.current;
    if (tt < 0) { if (hd) hd.visible = false; if (tr) tr.visible = false; if (fl) fl.visible = false; if (bp) bp.visible = false; if (sk) sk.visible = false; return; }
    if (phase.current === 0) {
      // 升空:头部沿 ease-out 上升到爆点,身后拖一段渐隐尾迹
      const k = Math.min(1, tt / RISE);
      const hy = (1 - (1 - k) * (1 - k)) * apex;
      if (hd) {
        hd.visible = true; hd.position.set(0, hy, 0);
        (hd.material as THREE.SpriteMaterial).opacity = 0.9 * (0.6 + Math.sin(tt * 40) * 0.4);
        const hs = 2.4 - k * 1.2; hd.scale.set(hs, hs, hs);
      }
      const h = hist.current; h.unshift(0, hy, 0); if (h.length > TRAIL * 3) h.length = TRAIL * 3;
      if (tr) {
        tr.visible = true;
        const a = data.tgeo.attributes.position.array as Float32Array;
        const cc = data.tgeo.attributes.color.array as Float32Array;
        for (let i = 0; i < TRAIL; i++) {
          const j = Math.min(h.length - 2, i * 3 + 1);
          a[i * 3] = 0; a[i * 3 + 1] = h[j] ?? hy; a[i * 3 + 2] = 0;
          const w = (1 - i / TRAIL) * 0.85;
          cc[i * 3] = w; cc[i * 3 + 1] = 0.8 * w; cc[i * 3 + 2] = 0.45 * w;
        }
        data.tgeo.attributes.position.needsUpdate = true; data.tgeo.attributes.color.needsUpdate = true;
      }
      if (k >= 1) { phase.current = 1; burstAt.current = tt; if (hd) hd.visible = false; if (tr) tr.visible = false; if (bp) bp.visible = true; if (fl) fl.visible = true; if (sk) sk.visible = true; onBurst(); }
      return;
    }
    if (phase.current === 1) {
      const bt = tt - burstAt.current;
      const L = bt / LIFE;
      if (fl) {
        const fk = Math.max(0, 1 - bt / 0.22);
        (fl.material as THREE.SpriteMaterial).opacity = fk * 0.9;
        const fs = 8 + (1 - fk) * 34; fl.scale.set(fs, fs, fs); fl.position.set(0, apex, 0);
      }
      if (sk) {
        // 冲击波光环:绽放瞬间一圈快速扩张 + 淡出的亮环,强化「砰」的张力。
        const sek = Math.max(0, 1 - bt / 0.36);
        (sk.material as THREE.SpriteMaterial).opacity = sek * sek * 0.6;
        const ss = 5 + (1 - sek) * (big ? 64 : 46); sk.scale.set(ss, ss, ss); sk.position.set(0, apex, 0);
        sk.visible = sek > 0.02;
      }
      const arr = data.geo.attributes.position.array as Float32Array;
      const col = data.geo.attributes.color.array as Float32Array;
      const grav = shape === "willow" ? 6.2 : shape === "chrysanthemum" ? 4.4 : shape === "heart" ? 1.5 : 3.2; // 心形低重力保形 / 菊花略垂 / 垂柳坠落
      const drag = shape === "willow" ? 0.5 : 0.9;
      const radial = (1 - Math.exp(-drag * bt)) / drag; // 空气阻尼:迸射后迅速减速成「花」
      const coreMix = Math.min(1, bt / 0.22);            // 白炽 → 本色
      const emberMix = Math.max(0, (L - 0.55) / 0.45);   // 后段 → 余烬
      const gfade = Math.max(0, 1 - Math.max(0, (L - 0.7) / 0.3));
      const mr = data.c1.r * 0.6 + data.c2.r * 0.4, mg = data.c1.g * 0.6 + data.c2.g * 0.4, mb = data.c1.b * 0.6 + data.c2.b * 0.4;
      for (let i = 0; i < N; i++) {
        const s = data.spd[i] * radial;
        arr[i * 3] = data.dir[i * 3] * s;
        arr[i * 3 + 1] = apex + data.dir[i * 3 + 1] * s - 0.5 * grav * bt * bt;
        arr[i * 3 + 2] = data.dir[i * 3 + 2] * s;
        const baseR = 1 - coreMix + mr * coreMix, baseG = 1 - coreMix + mg * coreMix, baseB = 1 - coreMix + mb * coreMix;
        const r = baseR * (1 - emberMix) + data.ember.r * emberMix;
        const gg = baseG * (1 - emberMix) + data.ember.g * emberMix;
        const bb = baseB * (1 - emberMix) + data.ember.b * emberMix;
        const twi = 0.6 + 0.4 * Math.sin(bt * data.tw[i] + i);
        const crackle = 1 + emberMix * 1.1 * (0.5 + 0.5 * Math.sin(bt * data.tw[i] * 1.7 + i * 2)); // 余烬期闪烁(噼啪,不过曝)
        const b = gfade * twi * crackle;
        col[i * 3] = r * b; col[i * 3 + 1] = gg * b; col[i * 3 + 2] = bb * b;
      }
      data.geo.attributes.position.needsUpdate = true; data.geo.attributes.color.needsUpdate = true;
      data.mat.size = (big ? 10 : 8) * (0.55 + gfade * 0.45);
      if (bt > LIFE) { phase.current = 2; onDone(); }
      return;
    }
  });

  return (
    <group position={[ox, baseY, oz]}>
      <points ref={trail} geometry={data.tgeo} material={data.tmat} frustumCulled={false} visible={false} />
      <sprite ref={head} visible={false}>
        <spriteMaterial map={glowTexture()} color="#fff1c2" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
      </sprite>
      <sprite ref={flash} visible={false}>
        <spriteMaterial map={glowTexture()} color={color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
      </sprite>
      <sprite ref={shock} visible={false}>
        <spriteMaterial map={ringTexture()} color={color2} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
      </sprite>
      <points ref={burstPts} geometry={data.geo} material={data.mat} frustumCulled={false} visible={false} />
    </group>
  );
}

// 放天灯时(仅夜晚)从玩家四周次第升起一束烟花(5~8 发,含 心形 / 菊 / 牡丹 / 垂柳 / 环),呼应「放飞 → 庆祝」。每发自生自灭;弱设备降数量。
function Fireworks({ launchRef, posRef, active, tier }: { launchRef: React.RefObject<number>; posRef: React.RefObject<THREE.Vector3>; active: boolean; tier: PerfTier }) {
  type Shell = { id: number; ox: number; oz: number; apex: number; color: string; color2: string; shape: FwShape; delay: number; big: boolean };
  const [list, setList] = useState<Shell[]>([]);
  const prev = useRef(0); const idc = useRef(0);
  const pending = useRef<Shell[]>([]); // 整轮烟花排队挂载:逐帧少量挂上 → 摊平每发 geometry 构建 + GPU 上传,杜绝整轮一帧卡顿
  const reduced = tier === "low";
  useFrame(() => {
    // 逐帧最多挂 2 发(弱机 1 发):把一轮 4~6 发的构建摊到数帧(每发自带 delay 错峰,视觉无差)
    if (pending.current.length) {
      const batch = pending.current.splice(0, reduced ? 1 : 2);
      setList((l) => [...l, ...batch].slice(reduced ? -8 : -20));
    }
    if (launchRef.current === prev.current) return;
    prev.current = launchRef.current;
    if (!active) return;
    const p = posRef.current; const px = p ? p.x : 0, pz = p ? p.z : 0;
    const PALETTE: [string, string][] = [
      ["#ff5d73", "#ffd2dc"], ["#ffd166", "#fff1b8"], ["#7be0ff", "#d9f6ff"],
      ["#b48cff", "#ecdcff"], ["#7CFC9E", "#daffe6"], ["#ff9a4a", "#ffd9b0"], ["#ff7bd5", "#ffd6f1"],
      ["#ffc93c", "#fff4cf"], ["#9bf0ff", "#e9fdff"], ["#ff6f9f", "#ffd6e6"], // + 金 / 冰蓝 / 玫红
    ];
    const HEART_PAL: [string, string][] = [["#ff6f9f", "#ffd6e6"], ["#ff5d73", "#ffd2dc"]]; // 心形偏玫红 / 粉
    const shapes: FwShape[] = ["peony", "peony", "willow", "ring", "chrysanthemum", "heart", "peony"];
    const n = reduced ? 2 : 4 + Math.floor(Math.random() * 3); // high 4~6 发 / low 2 发(降量保流畅,仍热闹）
    const add: Shell[] = [];
    for (let i = 0; i < n; i++) {
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      const pal = shape === "heart" ? HEART_PAL[Math.floor(Math.random() * HEART_PAL.length)] : PALETTE[Math.floor(Math.random() * PALETTE.length)];
      add.push({
        id: idc.current++,
        ox: px + (Math.random() - 0.5) * 78,
        oz: pz + (Math.random() - 0.5) * 78,
        apex: 52 + Math.random() * 34,
        color: pal[0], color2: pal[1],
        shape,
        delay: 0.5 + i * (0.5 + Math.random() * 0.4),
        big: Math.random() < 0.3,
      });
    }
    // 编排:最后一发拔高放大为压轴(垂柳 / 大菊 / 大牡丹),稍迟绽放 → 一场小小的收束
    if (add.length && !reduced) {
      const fin = add[add.length - 1];
      fin.big = true; fin.apex += 18; fin.delay += 0.35;
      const r = Math.random();
      fin.shape = r < 0.4 ? "willow" : r < 0.72 ? "chrysanthemum" : "peony";
    }
    playFireworkLaunch();
    pending.current.push(...add); // 入队,由上方逐帧少量挂载(不一帧全挂 → 杜绝卡顿)
  });
  return <>{list.map((f) => (
    <FireworkShell key={f.id} {...f} reduced={reduced} onBurst={() => playFireworkBurst(f.big)} onDone={() => setList((l) => l.filter((q) => q.id !== f.id))} />
  ))}</>;
}

// ✨ 点睛亮星:二十余颗更亮的星,各自节律明灭(叠在 drei 星海之上添层次)。
function BrightStars() {
  const ref = useRef<THREE.Points>(null);
  const { geo, mat, ph, sp, tint, N } = useMemo(() => {
    const N = 34;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const ph: number[] = [], sp: number[] = [], tint: [number, number, number][] = [];
    for (let i = 0; i < N; i++) {
      const a = hash2(i + 5, 1.3) * Math.PI * 2;
      const el = 0.3 + hash2(i + 5, 2.7) * 0.95;
      const rr = 540 + hash2(i + 5, 3.9) * 340;
      pos[i * 3] = Math.cos(a) * Math.cos(el) * rr;
      pos[i * 3 + 1] = 100 + Math.sin(el) * rr;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * rr;
      ph.push(hash2(i + 5, 5.1) * 6.28);
      sp.push(0.35 + hash2(i + 5, 6.2) * 0.7); // 各自明灭速度
      const h = hash2(i + 5, 7.3);
      tint.push(h < 0.3 ? [1.0, 0.9, 0.78] : h > 0.72 ? [0.82, 0.9, 1.0] : [0.96, 0.97, 1.0]); // 暖 / 冷 / 白,星色有别
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 13, map: glowTexture(), vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: false, fog: false });
    return { geo, mat, ph, sp, tint, N };
  }, []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame((s) => {
    const tm = s.clock.elapsedTime;
    const col = geo.attributes.color.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const base = 0.5 + 0.5 * Math.sin(tm * sp[i] + ph[i]);
      const spark = Math.max(0, Math.sin(tm * sp[i] * 3.1 + ph[i] * 2)) ** 6; // 偶尔一记锐闪(真实星空的眨眼感)
      const w = 0.4 + base * 0.5 + spark * 0.5;
      col[i * 3] = tint[i][0] * w; col[i * 3 + 1] = tint[i][1] * w; col[i * 3 + 2] = tint[i][2] * w;
    }
    geo.attributes.color.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}

// 🌠 偶现流星:夜空里每隔一阵,一道流星拖着渐隐的尾巴斜划而过(氛围用,区别于观星点的「流星许愿」彩蛋)。
function ShootingStars() {
  const N = 2;
  // 初始时延用确定性随机(按 i 派生),避免渲染期 Math.random()(渲染须纯函数)。
  const state = useRef(Array.from({ length: N }, (_, i) => ({ t: 4 + i * 6 + hash2(i + 5.5, 9.1) * 6, dur: 1.1, from: new THREE.Vector3(), to: new THREE.Vector3() })));
  const refs = useRef<(THREE.Object3D | null)[]>([]);
  const items = useMemo(() => Array.from({ length: N }, () => {
    const T = 12;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(T * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(T * 3), 3));
    const m = new THREE.PointsMaterial({ size: 11, map: glowTexture(), vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: false, fog: false });
    return { g, m, T };
  }), []);
  useEffect(() => () => items.forEach((x) => { x.g.dispose(); x.m.dispose(); }), [items]);
  useFrame((_, dt) => {
    state.current.forEach((st, mi) => {
      const pts = refs.current[mi]; if (!pts) return;
      st.t -= dt;
      if (st.t <= -st.dur) {
        st.t = 4 + Math.random() * 7; st.dur = 0.9 + Math.random() * 0.6;
        const a = Math.random() * Math.PI * 2, rr = 480 + Math.random() * 220, h = 170 + Math.random() * 170;
        st.from.set(Math.cos(a) * rr, h + 130, Math.sin(a) * rr);
        const a2 = a + (Math.random() - 0.5) * 0.7;
        st.to.set(Math.cos(a2) * rr * 0.55, h - 50, Math.sin(a2) * rr * 0.55);
      }
      const active = st.t <= 0;
      pts.visible = active;
      if (!active) return;
      const k = Math.min(1, -st.t / st.dur);
      const env = Math.sin(k * Math.PI); // 头尾渐隐
      const arr = items[mi].g.attributes.position.array as Float32Array;
      const col = items[mi].g.attributes.color.array as Float32Array;
      for (let j = 0; j < items[mi].T; j++) {
        const kk = Math.max(0, k - j * 0.022);
        arr[j * 3] = st.from.x + (st.to.x - st.from.x) * kk;
        arr[j * 3 + 1] = st.from.y + (st.to.y - st.from.y) * kk;
        arr[j * 3 + 2] = st.from.z + (st.to.z - st.from.z) * kk;
        const w = (1 - j / items[mi].T) * env;
        col[j * 3] = 0.85 * w; col[j * 3 + 1] = 0.92 * w; col[j * 3 + 2] = w;
      }
      items[mi].g.attributes.position.needsUpdate = true;
      items[mi].g.attributes.color.needsUpdate = true;
    });
  });
  return <>{items.map((it, i) => <points key={i} ref={(el) => { refs.current[i] = el; }} geometry={it.g} material={it.m} frustumCulled={false} visible={false} />)}</>;
}

// 加载态：首次进岛/弱网时模型未就绪，给一个居中提示，避免移动端白屏困惑。
function ExploreLoading() {
  return (
    <Html center>
      <div style={{ color: "#fff", textAlign: "center", whiteSpace: "nowrap", textShadow: "0 1px 8px rgba(0,0,0,.6)", fontSize: 15 }}>
        岛屿正在浮出水面……
      </div>
    </Html>
  );
}

function ExploreRain({ active, opacity, tier }: { active: boolean; opacity: number; tier: PerfTier }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = tier === "low" ? HEALING_RAIN_PRESENTATION.lowCount : HEALING_RAIN_PRESENTATION.normalCount;
  const geo = useMemo(() => new THREE.CylinderGeometry(HEALING_RAIN_PRESENTATION.dropRadius, HEALING_RAIN_PRESENTATION.dropRadius, HEALING_RAIN_PRESENTATION.dropLength, 4), []);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#edf8ff", transparent: true, opacity, depthWrite: false, toneMapped: false }),
    [opacity],
  );
  const drops = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      x: (hash2(i, 1.2) - 0.5) * HEALING_RAIN_PRESENTATION.radius,
      y: HEALING_RAIN_PRESENTATION.startY + hash2(i, 3.4) * HEALING_RAIN_PRESENTATION.heightRange,
      z: (hash2(i, 5.6) - 0.5) * HEALING_RAIN_PRESENTATION.radius,
      speed: HEALING_RAIN_PRESENTATION.minSpeed + hash2(i, 7.8) * HEALING_RAIN_PRESENTATION.speedRange,
    })),
    [count],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || !active) return;
    for (let i = 0; i < drops.length; i++) {
      dummy.position.set(drops[i].x, drops[i].y, drops[i].z);
      dummy.rotation.set(HEALING_RAIN_PRESENTATION.tiltX, 0, HEALING_RAIN_PRESENTATION.tiltZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [active, drops, dummy]);

  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);

  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh || !active) return;
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      drop.y -= drop.speed * dt;
      if (drop.y < 2) drop.y = HEALING_RAIN_PRESENTATION.resetY;
      dummy.position.set(drop.x, drop.y, drop.z);
      dummy.rotation.set(HEALING_RAIN_PRESENTATION.tiltX, 0, HEALING_RAIN_PRESENTATION.tiltZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!active) return null;
  return <instancedMesh ref={ref} args={[geo, mat, count]} frustumCulled={false} />;
}

function DistrictGroundPatch(_props: {
  patch: {
    x: number;
    z: number;
    radius?: number;
    width?: number;
    depth?: number;
    color: string;
    ring: string;
    opacity: number;
    ringOpacity: number;
  };
  shape?: "circle" | "rect";
}) {
  return null;
}

function DistrictFlatTile({
  x,
  z,
  width,
  depth,
  color,
  opacity = 0.32,
  rot = 0,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  color: string;
  opacity?: number;
  rot?: number;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, rot]} position={[x, exGroundY(x, z) + 0.07, z]}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function DistrictCircleTile({
  x,
  z,
  radius,
  color,
  opacity = 0.3,
}: {
  x: number;
  z: number;
  radius: number;
  color: string;
  opacity?: number;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, exGroundY(x, z) + 0.072, z]}>
      <circleGeometry args={[radius, 64]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function DistrictLanternPair({ grad, x, z, night, rot = 0 }: { grad: THREE.Texture; x: number; z: number; night: boolean; rot?: number }) {
  const glow = night ? "#ffe9a0" : undefined;
  return (
    <group>
      <GroundProp url={MODELS.stonelantern} grad={grad} x={x - 3.4} z={z} rot={rot + 0.2} scale={0.9} tint={glow} />
      <GroundProp url={MODELS.stonelantern} grad={grad} x={x + 3.4} z={z} rot={rot - 0.2} scale={0.9} tint={glow} />
    </group>
  );
}

function HomeDistrict({ grad, night }: { grad: THREE.Texture; night: boolean }) {
  const lamps = night ? "#ffd98a" : undefined;
  return (
    <group>
      <DistrictGroundPatch patch={HEALING_DISTRICT_PRESENTATION.home} />
      <DistrictFlatTile x={-24} z={-23} width={26} depth={5} color="#ffe6b2" opacity={0.28} rot={-0.35} />
      <GroundProp url={MODELS.houseCottage} grad={grad} x={-39} z={-32} rot={0.55} scale={1.12} />
      <GroundProp url={MODELS.houseLoft} grad={grad} x={-9} z={-15} rot={-0.4} scale={0.86} />
      <GroundProp url={MODELS.townMailbox} grad={grad} x={-31} z={-13} rot={0.8} scale={1.08} tint={lamps} />
      <GroundProp url={MODELS.townBench} grad={grad} x={-23} z={-17} rot={1.35} scale={1.05} />
      <GroundProp url={MODELS.isleWell} grad={grad} x={-19} z={-31} scale={0.92} />
      <GroundProp url={MODELS.stonelantern} grad={grad} x={-11} z={-28} rot={-0.2} scale={0.82} tint={lamps} />
    </group>
  );
}

function BeachDistrict({ grad }: { grad: THREE.Texture }) {
  const p = HEALING_DISTRICT_PRESENTATION.beach;
  return (
    <group>
      <DistrictGroundPatch patch={p} shape="rect" />
      <DistrictFlatTile x={p.x + 6} z={p.z - 6} width={44} depth={7} color="#f7e3bc" opacity={0.44} rot={0.55} />
      <DistrictFlatTile x={p.x - 8} z={p.z + 7} width={32} depth={4} color="#bfe6ee" opacity={0.28} rot={0.5} />
      <GroundProp url={MODELS.beachDeckchair} grad={grad} x={p.x - 18} z={p.z + 4} rot={0.8} scale={1.25} />
      <GroundProp url={MODELS.beachSurfboard} grad={grad} x={p.x - 7} z={p.z - 9} rot={1.2} scale={1.12} />
      <GroundProp url={MODELS.beachBucket} grad={grad} x={p.x + 9} z={p.z + 5} rot={-0.5} scale={1.18} />
      <GroundProp url={MODELS.beachBall} grad={grad} x={p.x + 17} z={p.z - 2} rot={0.2} scale={1.04} />
      <GroundProp url={MODELS.beachSign} grad={grad} x={p.x - 23} z={p.z - 11} rot={0.25} scale={1.15} />
      <GroundProp url={MODELS.beachPalm} grad={grad} x={p.x + 22} z={p.z + 11} rot={-0.35} scale={1.1} />
      <GroundProp url={MODELS.beachFirepit} grad={grad} x={p.x + 3} z={p.z + 14} rot={0.1} scale={1.0} />
      <GroundProp url={MODELS.beachFootprint} grad={grad} x={p.x - 3} z={p.z + 1} rot={0.65} scale={1.45} />
      <GroundProp url={MODELS.beachStarfish} grad={grad} x={p.x + 24} z={p.z - 9} rot={0.5} scale={1.1} />
      <GroundProp url={MODELS.beachTidepool} grad={grad} x={p.x - 18} z={p.z + 13} rot={-0.2} scale={1.16} />
      <GroundProp url={MODELS.beachSandcastle} grad={grad} x={p.x + 15} z={p.z + 10} rot={0.35} scale={1.08} />
    </group>
  );
}

function RiceFieldDistrict({ grad, lowTier }: { grad: THREE.Texture; lowTier: boolean }) {
  const rows = lowTier ? 9 : 16;
  const cols = lowTier ? 8 : 13;
  const items = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 40 + c * 3.15 + (r % 2) * 0.8;
      const z = -101 + r * 3.05;
      items.push(<GroundProp key={`${r}-${c}`} url={MODELS.natCropSprout} grad={grad} x={x} z={z} rot={(c * 0.37 + r * 0.21) % 6.28} scale={0.96} />);
    }
  }
  return (
    <group>
      <DistrictGroundPatch patch={HEALING_DISTRICT_PRESENTATION.rice} shape="rect" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[58, exGroundY(58, -80) + 0.04, -80]}>
        <planeGeometry args={[55, 42]} />
        <meshBasicMaterial color="#d7ecaa" transparent opacity={0.18} depthWrite={false} toneMapped={false} />
      </mesh>
      {[47, 58, 69].map((x) => <DistrictFlatTile key={x} x={x} z={-80} width={2.2} depth={43} color="#bfe9dc" opacity={0.34} />)}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[58, exGroundY(58, -80) + 0.055, -80]}>
        <planeGeometry args={[56, 3.2]} />
        <meshBasicMaterial color="#bfe9dc" transparent opacity={0.28} depthWrite={false} toneMapped={false} />
      </mesh>
      {items}
      <GroundProp url={MODELS.townHaystack} grad={grad} x={79} z={-86} rot={0.4} scale={1.38} />
      <GroundProp url={MODELS.paperboat} grad={grad} x={47} z={-73} rot={-0.6} scale={1.05} />
      <GroundProp url={MODELS.townSignpost} grad={grad} x={38} z={-62} rot={0.45} scale={1.12} />
      <GroundProp url={MODELS.townFence} grad={grad} x={80} z={-70} rot={0.1} scale={1.35} />
    </group>
  );
}

function MountainDistrict({ grad, night }: { grad: THREE.Texture; night: boolean }) {
  const p = HEALING_DISTRICT_PRESENTATION.mountain;
  const rocks = [
    [p.x - 18, p.z - 8, 1.4, 0.2],
    [p.x - 6, p.z + 12, 1.1, 1.2],
    [p.x + 16, p.z + 6, 1.35, -0.4],
    [p.x + 22, p.z - 12, 1.0, 0.8],
  ] as const;
  return (
    <group>
      <DistrictGroundPatch patch={p} />
      <DistrictFlatTile x={p.x - 10} z={p.z - 12} width={8} depth={30} color="#d6c8ad" opacity={0.3} rot={-0.78} />
      <DistrictFlatTile x={p.x + 7} z={p.z + 4} width={8} depth={28} color="#d6c8ad" opacity={0.28} rot={-0.35} />
      <GroundProp url={MODELS.isleStepstones} grad={grad} x={p.x - 11} z={p.z - 15} rot={-0.75} scale={1.55} />
      <GroundProp url={MODELS.torii} grad={grad} x={p.x - 25} z={p.z - 20} rot={0.82} scale={1.24} />
      <GroundProp url={MODELS.isleLookout} grad={grad} x={p.x + 18} z={p.z + 16} rot={-0.55} scale={1.12} />
      <DistrictLanternPair grad={grad} x={p.x - 14} z={p.z - 3} night={night} rot={-0.4} />
      {rocks.map(([x, z, s, r], i) => <GroundProp key={i} url={MODELS.natRock} grad={grad} x={x} z={z} rot={r} scale={s} />)}
      <GroundProp url={MODELS.townSignpost} grad={grad} x={p.x + 2} z={p.z - 23} rot={0.35} scale={1.05} />
    </group>
  );
}

function ForestDistrict({ grad, lowTier }: { grad: THREE.Texture; lowTier: boolean }) {
  const p = HEALING_DISTRICT_PRESENTATION.forest;
  const treeSpots = lowTier
    ? [[-30, -18, 1.8], [-18, 17, 1.55], [4, -23, 1.65], [24, -8, 1.75], [28, 18, 1.45], [-2, 3, 1.3]]
    : [[-34, -21, 2.0], [-29, 18, 1.72], [-18, -13, 1.78], [-10, 26, 1.5], [5, -25, 1.74], [17, 18, 1.62], [28, -11, 1.9], [34, 18, 1.55], [-2, 2, 1.38], [22, 4, 1.42]];
  const bushSpots = [[-26, 0, 1.2], [-12, -23, 1.1], [10, 23, 1.0], [30, 3, 1.15], [-4, 15, 0.95]] as const;
  const mushrooms = [[-10, -1, 1.25], [-5, 5, 1.05], [2, 4, 1.0], [7, -3, 1.1], [-1, -7, 0.95], [12, 8, 0.9], [-15, 9, 0.92]] as const;
  return (
    <group>
      <DistrictGroundPatch patch={p} />
      <DistrictCircleTile x={p.x + 1} z={p.z} radius={22} color="#376f4b" opacity={0.22} />
      <DistrictFlatTile x={p.x + 4} z={p.z} width={12} depth={58} color="#9fca84" opacity={0.32} rot={1.05} />
      {treeSpots.map(([dx, dz, s], i) => (
        <GroundProp
          key={i}
          url={i % 2 === 0 ? MODELS.natPine : MODELS.natBroad}
          grad={grad}
          x={p.x + dx}
          z={p.z + dz}
          rot={hash2(i + 401, 2.5) * Math.PI * 2}
          scale={s}
        />
      ))}
      {bushSpots.map(([dx, dz, s], i) => <GroundProp key={i} url={MODELS.natBush} grad={grad} x={p.x + dx} z={p.z + dz} rot={i * 0.7} scale={s} />)}
      {mushrooms.map(([dx, dz, s], i) => <GroundProp key={i} url={MODELS.natMushroom} grad={grad} x={p.x + dx} z={p.z + dz} rot={i * 0.9} scale={s} />)}
      <GroundProp url={MODELS.isleSwing} grad={grad} x={p.x - 5} z={p.z - 2} rot={0.38} scale={1.08} />
      <GroundProp url={MODELS.isleHammock} grad={grad} x={p.x + 15} z={p.z + 4} rot={-0.5} scale={1.16} />
      <GroundProp url={MODELS.isleTent} grad={grad} x={p.x - 23} z={p.z + 24} rot={0.25} scale={1.15} />
      <GroundProp url={MODELS.townSignpost} grad={grad} x={p.x + 30} z={p.z - 21} rot={-0.25} scale={1.18} />
      <GroundProp url={MODELS.natFlowers} grad={grad} x={p.x - 2} z={p.z + 14} rot={0.2} scale={1.22} />
    </group>
  );
}

function TownDistrict({ grad, night }: { grad: THREE.Texture; night: boolean }) {
  const p = HEALING_DISTRICT_PRESENTATION.town;
  const lamps = night ? "#ffe9a0" : undefined;
  return (
    <group>
      <DistrictGroundPatch patch={p} />
      <DistrictFlatTile x={p.x} z={p.z} width={40} depth={18} color="#d8c0a0" opacity={0.36} rot={0.08} />
      <DistrictFlatTile x={p.x + 4} z={p.z + 4} width={8} depth={42} color="#efe0bd" opacity={0.24} rot={Math.PI / 2} />
      <GroundProp url={MODELS.houseCottage} grad={grad} x={p.x - 24} z={p.z - 11} rot={0.45} scale={0.95} />
      <GroundProp url={MODELS.houseLoft} grad={grad} x={p.x + 24} z={p.z - 14} rot={-0.4} scale={0.9} />
      <GroundProp url={MODELS.isleStall} grad={grad} x={p.x - 7} z={p.z + 3} rot={0.1} scale={1.05} />
      <GroundProp url={MODELS.townParasol} grad={grad} x={p.x + 8} z={p.z + 8} rot={-0.2} scale={1.05} />
      <GroundProp url={MODELS.townCrate} grad={grad} x={p.x - 14} z={p.z + 10} rot={0.4} scale={1.18} />
      <GroundProp url={MODELS.townBench} grad={grad} x={p.x + 16} z={p.z - 1} rot={1.55} scale={1.0} />
      <GroundProp url={MODELS.townMailbox} grad={grad} x={p.x - 2} z={p.z - 19} rot={0.2} scale={1.02} tint={lamps} />
      <GroundProp url={MODELS.townLamppost} grad={grad} x={p.x - 19} z={p.z + 7} rot={0} scale={1.06} tint={lamps} />
      <GroundProp url={MODELS.townLamppost} grad={grad} x={p.x + 20} z={p.z + 4} rot={0} scale={1.06} tint={lamps} />
    </group>
  );
}

function FarmDistrict({ grad }: { grad: THREE.Texture }) {
  return (
    <group>
      <DistrictGroundPatch patch={HEALING_DISTRICT_PRESENTATION.farm} />
      <DistrictFlatTile x={-56} z={-78} width={42} depth={8} color="#c9d779" opacity={0.22} rot={0.08} />
      <DistrictFlatTile x={-57} z={-88} width={42} depth={8} color="#c9d779" opacity={0.2} rot={0.08} />
      <GroundProp url={MODELS.houseVilla} grad={grad} x={-58} z={-93} rot={-0.8} scale={1.16} />
      <GroundProp url={MODELS.townHaystack} grad={grad} x={-43} z={-82} rot={0.3} scale={1.55} />
      <GroundProp url={MODELS.townHaystack} grad={grad} x={-66} z={-78} rot={1.4} scale={1.18} />
      <GroundProp url={MODELS.townFence} grad={grad} x={-51} z={-70} rot={0.1} scale={1.62} />
      <GroundProp url={MODELS.townFence} grad={grad} x={-67} z={-88} rot={Math.PI / 2} scale={1.45} />
      <GroundProp url={MODELS.windmill} grad={grad} x={-72} z={-104} rot={0.7} scale={1.28} />
    </group>
  );
}

function ZooDistrict({ grad, night }: { grad: THREE.Texture; night: boolean }) {
  const tint = night ? "#ffe9a0" : undefined;
  const p = HEALING_DISTRICT_PRESENTATION.zoo;
  const fences = [
    [p.x - 12, p.z + 9, 0, 1.72],
    [p.x + 9, p.z + 9, 0, 1.72],
    [p.x - 12, p.z - 11, 0, 1.72],
    [p.x + 9, p.z - 11, 0, 1.72],
    [p.x - 24, p.z - 1, Math.PI / 2, 1.55],
    [p.x + 22, p.z - 1, Math.PI / 2, 1.55],
    [p.x - 2, p.z - 22, Math.PI / 2, 1.65],
    [p.x - 2, p.z + 19, Math.PI / 2, 1.65],
  ] as const;
  return (
    <group>
      <DistrictGroundPatch patch={p} />
      <DistrictCircleTile x={p.x} z={p.z - 1} radius={20} color="#d8b977" opacity={0.28} />
      <DistrictCircleTile x={p.x + 13} z={p.z + 3} radius={6.5} color="#7fc7d4" opacity={0.35} />
      <DistrictFlatTile x={p.x - 8} z={p.z + 15} width={20} depth={5} color="#f1d99e" opacity={0.32} rot={0.12} />
      {fences.map(([x, z, r, s], i) => <GroundProp key={i} url={MODELS.townFence} grad={grad} x={x} z={z} rot={r} scale={s} />)}
      <GroundProp url={MODELS.townSignpost} grad={grad} x={p.x - 24} z={p.z - 20} rot={0.5} scale={1.35} tint={tint} />
      <GroundProp url={MODELS.townCrate} grad={grad} x={p.x - 11} z={p.z + 15} rot={0.4} scale={1.12} />
      <GroundProp url={MODELS.townHaystack} grad={grad} x={p.x - 1} z={p.z + 15} rot={-0.2} scale={1.1} />
      <GroundProp url={MODELS.townBench} grad={grad} x={p.x + 14} z={p.z - 14} rot={1.45} scale={0.95} />
      <GroundProp url={MODELS.critterFox} grad={grad} x={p.x - 7} z={p.z - 1} rot={0.5} scale={1.28} />
      <GroundProp url={MODELS.critterCat} grad={grad} x={p.x + 5} z={p.z - 6} rot={-0.8} scale={1.2} />
      <GroundProp url={MODELS.critterOwl} grad={grad} x={p.x - 3} z={p.z + 9} rot={0.2} scale={1.16} />
      <GroundProp url={MODELS.critterFish} grad={grad} x={p.x + 13} z={p.z + 3} rot={-0.6} scale={0.9} />
      <GroundProp url={MODELS.natBush} grad={grad} x={p.x + 22} z={p.z + 16} rot={0.2} scale={1.1} />
    </group>
  );
}

function SwampDistrict({ grad, accent, lowTier }: { grad: THREE.Texture; accent: string; lowTier: boolean }) {
  const count = lowTier ? 10 : 18;
  const reeds = Array.from({ length: count }, (_, i) => {
    const a = hash2(i + 31, 2.2) * Math.PI * 2;
    const r = 5 + hash2(i + 31, 4.4) * 20;
    return <GroundProp key={i} url={MODELS.natReed} grad={grad} x={92 + Math.cos(a) * r} z={-104 + Math.sin(a) * r} rot={a} scale={0.9 + hash2(i, 6.6) * 0.5} />;
  });
  const fixedReeds = [
    [-21, -11, 1.35], [-15, 15, 1.2], [-7, -24, 1.42], [4, 22, 1.18], [15, -18, 1.32], [22, 8, 1.25],
  ] as const;
  return (
    <group>
      <DistrictGroundPatch patch={HEALING_DISTRICT_PRESENTATION.swamp} />
      <DistrictCircleTile x={92} z={-104} radius={28} color="#4f887d" opacity={0.42} />
      <DistrictCircleTile x={81} z={-116} radius={24} color="#5f9d91" opacity={0.42} />
      <DistrictCircleTile x={82} z={-96} radius={10} color="#6ca79d" opacity={0.34} />
      <DistrictCircleTile x={104} z={-113} radius={9} color="#5c9189" opacity={0.34} />
      <DistrictFlatTile x={92} z={-104} width={9} depth={50} color="#a6875f" opacity={0.46} rot={0.85} />
      <DistrictFlatTile x={86} z={-97} width={7} depth={24} color="#bd9a64" opacity={0.32} rot={1.34} />
      <DistrictFlatTile x={85} z={-116} width={34} depth={16} color="#79b6ad" opacity={0.32} rot={0.22} />
      <DistrictFlatTile x={80} z={-116} width={7} depth={25} color="#b58d58" opacity={0.38} rot={0.85} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[92, exGroundY(92, -104) + 0.05, -104]}>
        <circleGeometry args={[29, 56]} />
        <meshStandardMaterial color="#4a8279" roughness={0.48} metalness={0.08} transparent opacity={0.3} depthWrite={false} />
      </mesh>
      {reeds}
      {fixedReeds.map(([dx, dz, s], i) => <GroundProp key={`fixed-${i}`} url={MODELS.natReed} grad={grad} x={92 + dx} z={-104 + dz} rot={i * 0.75} scale={s} />)}
      <GroundProp url={MODELS.isleBridge} grad={grad} x={91} z={-103} rot={0.85} scale={0.64} />
      <GroundProp url={MODELS.isleBridge} grad={grad} x={84} z={-95} rot={1.32} scale={0.46} />
      <GroundProp url={MODELS.isleBridge} grad={grad} x={80} z={-116} rot={0.85} scale={0.42} />
      <GroundProp url={MODELS.natLotus} grad={grad} x={84} z={-97} rot={0.4} scale={1.42} />
      <GroundProp url={MODELS.natLotus} grad={grad} x={77} z={-116} rot={-0.25} scale={1.42} />
      <GroundProp url={MODELS.natLotus} grad={grad} x={89} z={-118} rot={0.36} scale={1.12} />
      <GroundProp url={MODELS.natLotus} grad={grad} x={101} z={-111} rot={-0.5} scale={1.26} />
      <GroundProp url={MODELS.natLotus} grad={grad} x={95} z={-92} rot={0.1} scale={1.0} />
      <GroundProp url={MODELS.critterFish} grad={grad} x={101} z={-103} rot={0.4} scale={0.78} tint={accent} />
      <GroundProp url={MODELS.natReed} grad={grad} x={72} z={-117} rot={0.2} scale={1.34} />
      <GroundProp url={MODELS.natReed} grad={grad} x={83} z={-123} rot={-0.4} scale={1.18} />
      <GroundProp url={MODELS.natReed} grad={grad} x={91} z={-115} rot={0.7} scale={1.26} />
      <GroundProp url={MODELS.natReed} grad={grad} x={87} z={-110} rot={-0.15} scale={1.18} />
      <GroundProp url={MODELS.natMushroom} grad={grad} x={109} z={-96} rot={0.8} scale={1.42} />
      <GroundProp url={MODELS.townSignpost} grad={grad} x={75} z={-119} rot={0.7} scale={1.05} />
    </group>
  );
}

function ScenicDistrict({ grad, night }: { grad: THREE.Texture; night: boolean }) {
  const glow = night ? "#ffe9a0" : undefined;
  return (
    <group>
      <DistrictGroundPatch patch={HEALING_DISTRICT_PRESENTATION.scenic} />
      <DistrictFlatTile x={23} z={106} width={8} depth={34} color="#e7d8a6" opacity={0.24} rot={1.2} />
      <GroundProp url={MODELS.torii} grad={grad} x={18} z={112} rot={Math.PI} scale={1.26} />
      <GroundProp url={MODELS.isleLookout} grad={grad} x={31} z={105} rot={-0.5} scale={1.18} />
      <GroundProp url={MODELS.stonelantern} grad={grad} x={8} z={104} rot={0.4} scale={1.1} tint={glow} />
      <GroundProp url={MODELS.stonelantern} grad={grad} x={38} z={115} rot={-0.3} scale={1.1} tint={glow} />
      <GroundProp url={MODELS.isleWindchime} grad={grad} x={23} z={98} rot={0.2} scale={1.02} />
    </group>
  );
}

function IslandDistricts({ grad, accent, environment, tier }: { grad: THREE.Texture; accent: string; environment: ExploreEnvironment; tier: PerfTier }) {
  const night = environment.timeOfDay === "night";
  const lowTier = tier === "low";
  return (
    <group>
      <HomeDistrict grad={grad} night={night} />
      <BeachDistrict grad={grad} />
      <RiceFieldDistrict grad={grad} lowTier={lowTier} />
      <MountainDistrict grad={grad} night={night} />
      <ForestDistrict grad={grad} lowTier={lowTier} />
      <TownDistrict grad={grad} night={night} />
      <FarmDistrict grad={grad} />
      <ZooDistrict grad={grad} night={night} />
      <SwampDistrict grad={grad} accent={accent} lowTier={lowTier} />
      <ScenicDistrict grad={grad} night={night} />
    </group>
  );
}

function ExploreScene({
  visual,
  environment,
  inputRef,
  posRef,
  headingRef,
  onCollect,
  total,
  giftedIds,
  onNear,
  emotion,
  avatar,
  onWhale,
  onBottle,
  bottleNotes,
  imprints,
  onPickImprint,
  treeColors,
  companionAction,
  companionSinging,
  companionSleeping,
  companionChatter,
  onCompanionInteract,
  character,
  expression,
  flowers,
  onPlantFlower,
  onNearFlower,
  lanternLaunch,
  onAtWater,
  fishingCasting,
  onRingChime,
  songDone,
  nextChime,
  lanternCount,
  onCar,
  onCarEnter,
  onCrab,
  onTurtle,
  onTreasure,
  onConchNear,
  treasureNote,
  onDiscover,
  onNearInteract,
  onNearLamp,
  onNearDistrict,
  tier,
}: {
  visual: SceneVisual;
  environment: ExploreEnvironment;
  inputRef: React.RefObject<Input>;
  posRef: React.RefObject<THREE.Vector3>;
  headingRef: React.RefObject<number>;
  onCollect: () => void;
  total: number;
  giftedIds: number[];
  onNear: (id: number) => void;
  emotion?: string;
  avatar: Avatar;
  onWhale: () => void;
  onBottle: (i: number) => void;
  bottleNotes?: string[];
  imprints: Imprint[];
  onPickImprint: (i: number) => void;
  treeColors: string[];
  companionAction: CompanionActionSignal | null;
  companionSinging?: boolean;
  companionSleeping?: boolean;
  companionChatter?: { text: string; nonce: number } | null;
  onCompanionInteract?: () => void;
  character: CharKind;
  expression: string;
  flowers: Flower[];
  onPlantFlower: (x: number, z: number, color: string) => void;
  onNearFlower: (f: Flower | null) => void;
  lanternLaunch: React.RefObject<number>;
  onAtWater: (b: boolean) => void;
  fishingCasting: boolean;
  onRingChime: (i: number) => void;
  songDone: boolean;
  nextChime?: number;
  lanternCount: number;
  onCar?: (s: "enter" | "exit" | null) => void;
  onCarEnter?: () => void;
  onCrab: () => void;
  onTurtle: () => void;
  onTreasure: () => void;
  onConchNear: (b: boolean) => void;
  treasureNote?: string;
  onDiscover: (k: string) => void;
  onNearInteract: (v: { kind: string; label: string } | null) => void;
  onNearLamp: (v: { idx: number; on: boolean } | null) => void;
  onNearDistrict: (zone: ExploreZone | null) => void;
  tier: PerfTier;
}) {
  const terrain = useMemo(() => buildExploreTerrain(), []);
  useEffect(() => () => terrain.dispose(), [terrain]);
  const envVisual = useMemo(() => resolveExploreEnvironmentVisual(visual, environment), [visual, environment]);
  const forceNight = environment.timeOfDay === "night";
  useEffect(() => { sceneEnv.night = forceNight; }, [forceNight]); // 夜间标记 → 车头灯只在夜里亮
  useEffect(() => {
    setWeatherAmbience(environment.weather, environment.weather === "rain");
    return () => setWeatherAmbience("clear", false);
  }, [environment.weather]);
  // posRef / headingRef 由父级 ExploreMode 持有并下传(Canvas 外的小地图也要实时读到玩家位置/朝向)
  const collidersRef = useRef<Map<string, Collider[]> | null>(null); // 障碍碰撞网格(Town 填充,Player 读取)
  const cheerRef = useRef(0); // 拾取计数(Player 读 → 欢呼)
  const nearRef = useRef(-1); // 最近 NPC(Player 读 → 好奇表情)
  const shallowHex = useMemo(() => new THREE.Color(visual.seaHighlight).lerp(new THREE.Color("#eafdff"), 0.5).getStyle(), [visual.seaHighlight]); // 浅滩:海面高光再提亮
  const sketch = useMemo(() => new SketchEffect(), []);
  useEffect(() => () => sketch.dispose(), [sketch]);
  // 帧率持续偏低时自动降级:关掉 Sobel 手绘后期 + 降 dpr(由 PerfWatch 触发,见下方)
  const [degraded, setDegraded] = useState(false);
  const lowTier = tier === "low";
  const revealDelay = {
    town: lowTier ? 5200 : 250,
    village: lowTier ? 7600 : 250,
    coastline: lowTier ? 9600 : 250,
    districts: lowTier ? 12500 : 500,
    interactions: lowTier ? 11200 : 0,
    companion: lowTier ? 14000 : 0,
    car: lowTier ? 9000 : 0,
    lanterns: lowTier ? 15000 : 0,
    townblock: lowTier ? 14000 : 2000,
    rhododendron: lowTier ? 16500 : 2800,
    manor: lowTier ? 19000 : 3600,
    bath: lowTier ? 22000 : 4400,
  };
  // 渐变天空作 scene.background(放进 3D,否则 EffectComposer 会把空域清成黑)
  const skyTex = useMemo(() => {
    const W = 64, H = 512; // 提分辨率:低分辨率渐变拉伸到全天空会出明显色带(banding)
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (ctx) {
      const grd = ctx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, envVisual.skyTop);
      grd.addColorStop(0.5, envVisual.skyMid);
      grd.addColorStop(1, envVisual.skyBottom);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
      // 抖动:打散 8-bit 量化造成的色带(banding 根因),夜空尤其明显。确定性噪声(自带 LCG),不在渲染期用 Math.random。
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      let seed = forceNight ? 9173 : 1337;
      for (let i = 0; i < d.length; i += 4) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const n = (seed / 4294967296 - 0.5) * 5; // ±2.5
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
      }
      ctx.putImageData(img, 0, 0);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [envVisual.skyTop, envVisual.skyMid, envVisual.skyBottom, forceNight]);
  useEffect(() => () => skyTex.dispose(), [skyTex]);
  // toon 渐变(地形平涂赛璐璐)
  const toonGrad = useMemo(() => makeToonGradient(), []);
  // 山顶薄雪:散布在高坡(exGroundY 高处)的扁平白雪块
  const snowMat = useMemo(() => new THREE.MeshToonMaterial({ color: "#eef5f7", gradientMap: toonGrad, emissive: new THREE.Color("#d8e6ec"), emissiveIntensity: 0.2 }), [toonGrad]);
  const gSnow = useMemo(() => new THREE.IcosahedronGeometry(1.1, 0), []);
  useEffect(() => () => { snowMat.dispose(); gSnow.dispose(); }, [snowMat, gSnow]);
  const snowItems = useMemo<InstItem[]>(() => {
    const out: InstItem[] = [];
    for (let i = 0; i < 2000; i++) {
      const a = hash2(i + 700, 1.3) * Math.PI * 2;
      const r = Math.sqrt(hash2(i + 700, 2.7)) * WALK_RADIUS * 0.88;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = exGroundY(x, z);
      if (h < 11.5) continue; // 只盖最高的几座丘(地形 exGroundY 可达 ~16)
      out.push({ p: [x, h + 0.05, z], sv: [1.1 + hash2(i, 3.1) * 1.0, 0.3, 1.1 + hash2(i, 4.2) * 1.0], r: [0, hash2(i, 5.3) * 6.28, 0] });
    }
    return out;
  }, []);
  useEffect(() => () => toonGrad.dispose(), [toonGrad]);

  const isNight = forceNight || visual.time === "night" || visual.stars; // 夜空(手动🌙 或 情绪夜):月亮/星星/烟花共用此判定

  return (
    <>
      <primitive object={skyTex} attach="background" />
      <fog attach="fog" args={[new THREE.Color(envVisual.fog).getHex(), envVisual.fogNear, envVisual.fogFar]} />
      <ambientLight intensity={envVisual.ambient} />
      <hemisphereLight args={[new THREE.Color(envVisual.skyMid).getHex(), new THREE.Color(visual.sea).getHex(), envVisual.hemi]} />
      <directionalLight position={environment.timeOfDay === "sunset" ? [-7, 5, -4] : [5, 8, 3]} intensity={forceNight ? 0.46 : 1.2} color={envVisual.directional} />
      {isNight && <Stars radius={340} depth={80} count={4200} factor={4.5} saturation={0} fade speed={0.4} />}
      {isNight && <MilkyWay />}
      {isNight && <BrightStars />}
      {isNight && <ShootingStars />}
      {isNight && <Moon />}
      {isNight && tier !== "low" && <Aurora />}
      {isNight && <MeteorShower count={tier === "low" ? 5 : 11} />}
      {isNight && tier !== "low" && <NightMotes count={64} posRef={posRef} />}
      {forceNight && lanternCount > 0 && <DistantGlows count={lanternCount} />}
      {environment.weather === "rain" && <ExploreRain active opacity={envVisual.rainOpacity} tier={tier} />}

      {/* 地形:草地/沙滩/水下分区配色,toon 平涂 */}
      <mesh geometry={terrain} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <meshToonMaterial vertexColors gradientMap={toonGrad} />
      </mesh>
      {/* 脚边随风草丛 */}
      <GroundGrass count={lowTier ? 12000 : 52000} animate={!lowTier} grad={toonGrad} />
      {/* 山顶薄雪 */}
      <InstancedField geo={gSnow} material={snowMat} items={snowItems} />
      {/* 近岸浪花:贴水线一圈柔白(陆地处被沙挡住,只在水边显形) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[WALK_RADIUS * 1.0, WALK_RADIUS * 1.1, 96]} />
        <meshBasicMaterial color="#e6f6f8" transparent opacity={0.3} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* 程序小镇 / 村落 / 海岸:模型量最大。移动端分段错峰挂载,首段只保留地形/水/玩家与输入响应。 */}
      <DelayedMount ms={revealDelay.town}>
        <Suspense fallback={null}>
          {/* 程序小镇 */}
          <Town toonGrad={toonGrad} accent={visual.accent} collidersRef={collidersRef} isNight={isNight} revealDelay={revealDelay} />
        </Suspense>
      </DelayedMount>
      <DelayedMount ms={revealDelay.village}>
        <Suspense fallback={null}>
          {/* 海岛村落建筑 + 岛上设施(Batch 5/7) */}
          <Village toonGrad={toonGrad} />
        </Suspense>
      </DelayedMount>
      <DelayedMount ms={revealDelay.coastline}>
        <Suspense fallback={null}>
          {/* 近海地形 + 海滩物 + 发光海水(Batch 6) */}
          <Coastline toonGrad={toonGrad} accent={visual.accent} />
        </Suspense>
      </DelayedMount>
      <DelayedMount ms={revealDelay.districts}>
        <Suspense fallback={null}>
          <IslandDistricts grad={toonGrad} accent={visual.accent} environment={environment} tier={tier} />
        </Suspense>
      </DelayedMount>
      {/* 海面(大) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[10000, 10000]} />
        <meshStandardMaterial color={visual.sea} roughness={0.3} metalness={0.5} transparent opacity={0.92} />
      </mesh>
      {/* 海湾浅滩:近岸一片更浅更亮的水,可以走进去踩水(陆地处被地形挡住,只在水里显形) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[Math.cos(BAY_ANGLE) * WALK_RADIUS * 1.04, 0.05, Math.sin(BAY_ANGLE) * WALK_RADIUS * 1.04]}
      >
        <circleGeometry args={[50, 44]} />
        <meshStandardMaterial color={shallowHex} roughness={0.22} metalness={0.3} transparent opacity={0.62} depthWrite={false} />
      </mesh>
      {environment.weather === "rain" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]}>
          <circleGeometry args={[WALK_RADIUS * 0.92, 96]} />
          <meshBasicMaterial color="#dbeafe" transparent opacity={Math.min(HEALING_RAIN_PRESENTATION.wetGroundMaxOpacity, envVisual.rainOpacity * HEALING_RAIN_PRESENTATION.wetGroundOpacityFactor)} depthWrite={false} toneMapped={false} />
        </mesh>
      )}

      {/* 玩家(角色模型,小、加载快):自己一个 Suspense → 不被建筑/道具拖住,相机&角色尽快就位 */}
      <Suspense fallback={null}>
        <Player inputRef={inputRef} posRef={posRef} headingRef={headingRef} avatar={avatar} character={character} expression={expression} collidersRef={collidersRef} cheerRef={cheerRef} nearRef={nearRef} onCar={onCar} onCarEnter={onCarEnter} />
      </Suspense>
      {/* 灯塔精灵 4.4M 重模型：独立 Suspense，不阻塞「可上岛」，世界就绪后随即淡入 */}
      <DelayedMount ms={revealDelay.companion}>
        <Suspense fallback={null}>
          <Companion posRef={posRef} action={companionAction} emotion={emotion} singing={companionSinging} sleeping={companionSleeping} chatter={companionChatter} onInteract={onCompanionInteract} collidersRef={collidersRef} />
        </Suspense>
      </DelayedMount>
      {/* 其余道具 / 彩蛋 / NPC / 互动(大多用模型):统一包进 Suspense → 加载时不挂起整场，
          世界(地形/海/光 + 已就位的建筑)先可见可走，这些随后陆续淡入，不再整屏空白等加载。 */}
      <DelayedMount ms={revealDelay.interactions}>
        <Suspense fallback={null}>
        <Npcs animate posRef={posRef} mood={visual.motion} emotion={emotion} giftedIds={giftedIds} onNear={(id) => { nearRef.current = id; onNear(id); }} />
        <SecretWhale posRef={posRef} onFound={onWhale} night={visual.time === "night" || visual.stars} />
        <DriftBottles posRef={posRef} onFind={onBottle} notes={bottleNotes} />
        {/* 🏖️ 心屿湾彩蛋:寄居蟹 / 归海小海龟 / 夜光水母 / 听海海螺 / 退潮的宝藏 */}
        <BeachCrab posRef={posRef} onFind={onCrab} />
        <BabyTurtle posRef={posRef} onFind={onTurtle} />
        <Jellyfish />
        <BeachConch posRef={posRef} onNear={onConchNear} />
        <BeachTreasure posRef={posRef} onFind={onTreasure} note={treasureNote} />
        {/* 🏝️ 岛屿奇遇 · 小动物:林间狐狸 / 岛上橘猫 / 灯塔猫头鹰(夜) */}
        <ForestFox posRef={posRef} onDiscover={onDiscover} />
        <IslandCat posRef={posRef} onDiscover={onDiscover} />
        <LighthouseOwl posRef={posRef} onDiscover={onDiscover} night={isNight} />
        {/* 🌠 夜晚魔法:精灵蘑菇圈 / 池中月 / 流星许愿(夜间) */}
        <MushroomRing posRef={posRef} onDiscover={onDiscover} night={isNight} />
        <MoonReflection posRef={posRef} onDiscover={onDiscover} night={isNight} />
        <StarWish posRef={posRef} onDiscover={onDiscover} night={isNight} />
        {/* 🌊 海与水秘密:发光鱼群 / 看海长椅 / 寄给未来的瓶中信 */}
        <FishSchool posRef={posRef} accent={visual.accent} onDiscover={onDiscover} />
        <SunsetBench posRef={posRef} onDiscover={onDiscover} />
        <FutureBottle />
        {/* ⛩️ 可互动仪式:祈愿铃 / 许愿石(+ 邮筒/瓶中信走 InteractProximity 出按钮) */}
        <ShrineBell onDiscover={onDiscover} />
        <WishingStones onDiscover={onDiscover} />
        <InteractProximity posRef={posRef} onNear={onNearInteract} />
        <DistrictProximity posRef={posRef} onNear={onNearDistrict} />
        <StoneLanterns posRef={posRef} grad={toonGrad} onNearLamp={onNearLamp} />
        {imprints.length > 0 ? <MemoryImprints posRef={posRef} imprints={imprints} onPick={(i) => { cheerRef.current += 1; onPickImprint(i); }} /> : <Wishes posRef={posRef} color={visual.accent} onCollect={() => { cheerRef.current += 1; onCollect(); }} total={total} />}
        {treeColors.length > 0 && <MemoryTree colors={treeColors} />}

        {/* 🌸 心情花田 · 🏮 暮色天灯 · 🎣 拾海垂钓 · 🎐 风铃心曲 */}
        <MoodGarden inputRef={inputRef} posRef={posRef} accent={visual.accent} flowers={flowers} onPlant={onPlantFlower} onNear={onNearFlower} />
        {/* 天灯 2.7M 重模型:独立 Suspense,首屏不等它(夜晚放飞时早已就绪) */}
        <DelayedMount ms={revealDelay.lanterns}>
          <Suspense fallback={null}><SkyLanterns launchRef={lanternLaunch} posRef={posRef} /></Suspense>
        </DelayedMount>
        <Fireworks launchRef={lanternLaunch} posRef={posRef} active={isNight} tier={tier} />
        <FishingSpot posRef={posRef} onAtWater={onAtWater} casting={fishingCasting} />
        <WindChimes posRef={posRef} grad={toonGrad} onRing={onRingChime} nextChime={nextChime} />
        <LocationAudio posRef={posRef} night={isNight} />
        {songDone && <Fireflies count={tier === "low" ? 24 : 46} />}
        </Suspense>
      </DelayedMount>

      {/* 帧率自适应:高档掉帧会关 Sobel;低档继续掉帧则再降 dpr,机器忙时自动保流畅 */}
      <PerfWatch tier={tier} onDegrade={() => setDegraded(true)} />

      {/* 手绘后期:墨线 + 色阶 + 纸纹。low 档(移动端/弱设备)跳过 Sobel 后期，
          直接用 toon 材质的卡通感——Sobel 是本场景最大开销。?perf=high 仍可解锁。
          运行时帧率持续偏低(degraded)也自动跳过它,优先保流畅。 */}
      {tier !== "low" && !degraded && (
        <EffectComposer>
          <primitive object={sketch} />
        </EffectComposer>
      )}
    </>
  );
}

// 触屏摇杆(左下)。pointer 拖动写入 inputRef；松开归零。
function Joystick({ inputRef }: { inputRef: React.RefObject<Input> }) {
  const base = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const active = useRef(false);

  const update = (clientX: number, clientY: number) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (clientX - cx) / (r.width / 2);
    let dy = (clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(-50%,-50%) translate(${dx * 36}px, ${dy * 36}px)`;
    }
    if (inputRef.current) {
      inputRef.current.x = dx;
      inputRef.current.y = dy;
    }
  };
  const end = () => {
    active.current = false;
    if (knobRef.current) {
      knobRef.current.style.transform = "translate(-50%,-50%) translate(0px, 0px)";
    }
    if (inputRef.current) {
      inputRef.current.x = 0;
      inputRef.current.y = 0;
    }
  };

  return (
    <div
      ref={base}
      className="xy-explore-joystick absolute h-28 w-28 rounded-full border border-white/25 bg-white/10 backdrop-blur-md touch-none select-none"
      style={{ left: "calc(1.4rem + env(safe-area-inset-left))", bottom: "calc(1.6rem + env(safe-area-inset-bottom))" }}
      onPointerDown={(e) => {
        active.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (active.current) update(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        ref={knobRef}
        className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white/70"
        style={{ transform: "translate(-50%,-50%) translate(0px, 0px)" }}
      />
    </div>
  );
}

// 换装面板里的一行色卡
function SwatchRow({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-caption text-white/55 w-8 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            className="h-6 w-6 rounded-full transition"
            style={{
              background: c,
              border: value === c ? "2px solid rgba(255,255,255,0.95)" : "1px solid rgba(255,255,255,0.25)",
              boxShadow: value === c ? "0 0 8px rgba(255,255,255,0.4)" : "none",
            }}
            aria-label={`${label} ${c}`}
          />
        ))}
      </div>
    </div>
  );
}

function CompanionPanel({
  state,
  message,
  speaking,
  secret,
  talkText,
  busy,
  autoVoice,
  chatterMode,
  voices,
  ttsConfigured,
  voiceId,
  previewVoice,
  onToggleAutoVoice,
  onToggleChatter,
  onPickVoice,
  onPreviewVoice,
  onTalkTextChange,
  onFeed,
  onTalk,
  onPet,
  onRest,
  singing,
  sleeping,
  onSing,
  onSleepToggle,
  onRename,
  onSpeakMessage,
  onClose,
  onDismissSecret,
}: {
  state: CompanionState;
  message: string;
  speaking: boolean;
  secret: CompanionSecretId | null;
  talkText: string;
  busy: boolean;
  autoVoice: boolean;
  chatterMode: boolean;
  voices: TtsVoice[];
  ttsConfigured: boolean | null;
  voiceId: string | null;
  previewVoice: string | null;
  onToggleAutoVoice: () => void;
  onToggleChatter: () => void;
  onPickVoice: (id: string) => void;
  onPreviewVoice: (id: string) => void;
  onTalkTextChange: (text: string) => void;
  onFeed: (food: CompanionFoodId) => void;
  onTalk: () => void;
  onPet: () => void;
  onRest: () => void;
  singing: boolean;
  sleeping: boolean;
  onSing: () => void;
  onSleepToggle: () => void;
  onRename: (name: string) => void;
  onSpeakMessage: () => void;
  onClose: () => void;
  onDismissSecret: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(state.name);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  // 折叠态显示当前生效音色名：选了就用所选，否则用清单里标了 default 的那个（龙可）。
  const currentVoiceLabel = (voiceId ? voices.find((v) => v.id === voiceId) : voices.find((v) => v.default))?.label ?? "默认嗓音";
  const bond = getCompanionBondLabel(state.affinity);
  return (
    <section
      className="panel-glass-2 absolute z-10 rounded-card p-3 text-white/85"
      style={{
        position: "absolute",
        top: "calc(4.2rem + env(safe-area-inset-top))",
        right: "calc(1.2rem + env(safe-area-inset-right))",
        width: "min(22rem, calc(100vw - 2.2rem))",
        maxHeight: "calc(100vh - 9rem)",
        overflow: "auto",
      }}
      aria-label="专属精灵"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption tracking-[0.24em] text-white/45">专属精灵</p>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => onRename(nameDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="min-w-0 flex-1 bg-transparent font-display text-[18px] tracking-wider text-white/90 outline-none"
              aria-label="精灵名字"
            />
            <span className="shrink-0 text-[13px] text-white/50">{bond}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleChatter}
            className="chip"
            aria-pressed={chatterMode}
            style={chatterMode ? { background: "rgba(255,226,160,0.22)", borderColor: "rgba(255,226,160,0.5)" } : undefined}
            aria-label={chatterMode ? "关闭主动陪聊" : "开启主动陪聊"}
            title={chatterMode ? "精灵会随你的动作主动搭话（点此关闭）" : "让精灵随你的动作主动和你说说话（点此开启）"}
          >
            {chatterMode ? "💬 陪聊·开" : "💬 陪聊"}
          </button>
          <button
            type="button"
            onClick={onToggleAutoVoice}
            className="chip"
            aria-label={autoVoice ? "关闭精灵自动语音" : "开启精灵自动语音"}
            title={autoVoice ? "精灵会自动说给你听（点此关闭）" : "精灵暂不自动开口（点此开启）"}
          >
            {autoVoice ? "🔊 语音" : "🔇 语音"}
          </button>
          <button type="button" onClick={onPet} className="chip" aria-label="摸摸精灵">
            抚光
          </button>
          <button type="button" onClick={onClose} className="chip px-2" aria-label="收起专属精灵">
            ×
          </button>
        </div>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/12">
        <div className="h-full rounded-full bg-[#ffe2a0]" style={{ width: `${state.affinity}%` }} />
      </div>
      <p className="mt-1 text-caption text-white/45">亲密度 {state.affinity} / 100 · 投喂 {state.feedCount} 次 · 对话 {state.talkCount} 次</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {COMPANION_FOODS.map((food) => (
          <button
            key={food.id}
            type="button"
            onClick={() => onFeed(food.id)}
            disabled={busy}
            className="rounded-card border border-white/12 bg-white/10 px-2 py-2 text-center active:scale-95 transition"
          >
            <span className="block text-[18px] leading-none">{food.icon}</span>
            <span className="mt-1 block text-caption text-white/70">{food.label}</span>
          </button>
        ))}
      </div>

      {/* 音色选择：配了云端 TTS 才显示清单（可试听 + 单选）；否则提示用系统语音 */}
      {ttsConfigured === false ? (
        <p className="mt-3 rounded-card bg-white/8 px-3 py-2 text-caption leading-relaxed text-white/50">
          🎙️ 云端音色未启用，精灵暂时用系统自带声音朗读。
        </p>
      ) : voices.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setVoicePickerOpen((o) => !o)}
            aria-expanded={voicePickerOpen}
            title={voicePickerOpen ? "收起嗓音选择" : "更换精灵的嗓音"}
            className="flex w-full items-center justify-between rounded-card border border-white/12 bg-white/8 px-3 py-2 text-left transition hover:bg-white/12"
          >
            <span className="min-w-0 truncate text-[13px] text-white/80">
              <span className="text-caption tracking-[0.14em] text-white/45">精灵的嗓音 · </span>
              <span className="text-[#ffe7b5]">{currentVoiceLabel}</span>
            </span>
            <span className="shrink-0 text-caption text-white/45">{voicePickerOpen ? "收起 ▴" : "更换 ▾"}</span>
          </button>
          {voicePickerOpen && (
            <>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {voices.map((v) => {
              const active = voiceId === v.id;
              const previewing = previewVoice === v.id && speaking;
              return (
                <div
                  key={v.id}
                  className={`flex items-center gap-1 rounded-full border px-2 py-1 transition ${active ? "border-[#ffe2a0]/55 bg-[#ffe2a0]/12" : "border-white/12 bg-white/8"}`}
                >
                  <button
                    type="button"
                    onClick={() => onPickVoice(v.id)}
                    title={active ? `已选：${v.label}（再点用回默认）` : `选这个：${v.desc}`}
                    className="text-[12px] text-white/85"
                  >
                    <span className={active ? "text-[#ffe7b5]" : ""}>{v.label}</span>
                    <span className="ml-1 text-caption text-white/40">{v.desc}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onPreviewVoice(v.id)}
                    disabled={busy}
                    title={previewing ? "停止试听" : "试听"}
                    className="text-[12px] leading-none text-white/55 transition hover:text-white/90 disabled:opacity-35"
                    aria-label={previewing ? "停止试听" : `试听${v.label}`}
                  >
                    {previewing ? "■" : "▷"}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-caption text-white/35">{voiceId === null ? "当前：默认嗓音" : "已选，再点同款可切回默认"}</p>
            </>
          )}
        </div>
      )}

      <div className="mt-3">
        <textarea
          value={talkText}
          onChange={(e) => onTalkTextChange(e.target.value)}
          placeholder="跟它说一句话，或点麦克风说出来..."
          rows={2}
          className="w-full resize-none rounded-card border border-white/12 bg-white/10 px-3 py-2 text-[13px] leading-relaxed text-white/85 outline-none placeholder:text-white/35"
        />
        <div className="mt-2 flex items-center gap-2">
          <div className="shrink-0">
            <VoiceInputButton disabled={busy} onTranscript={onTalkTextChange} />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={onTalk} disabled={busy} className="btn-primary py-2 text-[13px] disabled:opacity-55">
            {busy ? "聆听中..." : "对话"}
          </button>
          <button type="button" onClick={onRest} disabled={busy} className="btn-ghost py-2 text-[13px] disabled:opacity-55">
            静坐
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={onSing} disabled={busy || sleeping} className="btn-ghost py-2 text-[13px] disabled:opacity-55">
            {singing ? "🎶 一起哼" : "🎵 唱歌"}
          </button>
          <button type="button" onClick={onSleepToggle} disabled={busy} className="btn-ghost py-2 text-[13px] disabled:opacity-55">
            {sleeping ? "☀️ 叫醒它" : "😴 哄睡"}
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-card bg-white/10 px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-white/78">{message}</p>
          <button
            type="button"
            onClick={onSpeakMessage}
            disabled={!message.trim()}
            className="shrink-0 text-[15px] leading-none text-white/55 transition hover:text-white/90 disabled:opacity-35"
            aria-label={speaking ? "停止朗读" : "朗读这句"}
            title={speaking ? "停止朗读" : "让它说给你听"}
          >
            {speaking ? "■" : "🔊"}
          </button>
        </div>
        {speaking && (
          <p className="mt-1 text-caption text-[#ffe2a0]/80">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#ffe2a0]" />
              正在说给你听…
            </span>
          </p>
        )}
      </div>

      {state.unlockedSecrets.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {state.unlockedSecrets.map((item) => (
            <span key={item} className="rounded-full border border-[#ffe2a0]/25 bg-[#ffe2a0]/10 px-2 py-1 text-caption text-[#ffe7b5]">
              {secretLabel(item)}
            </span>
          ))}
        </div>
      )}

      {secret && (
        <button
          type="button"
          onClick={onDismissSecret}
          className="mt-3 w-full rounded-card border border-[#ffe2a0]/25 bg-[#ffe2a0]/10 px-3 py-2 text-left text-caption leading-relaxed text-[#fff0c7]"
        >
          ✦ {getSecretText(secret)}
        </button>
      )}
    </section>
  );
}

// 极简菜单里的一行：图标 + 文字，点击触发动作。统一风格，hover/active 反馈。
function MenuButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-card px-2.5 py-2 text-left text-[13px] text-white/82 transition hover:bg-white/10 active:scale-[0.98]"
    >
      <span className="w-5 text-center text-[15px] leading-none">{icon}</span>
      {label}
    </button>
  );
}

function secretLabel(secret: CompanionSecretId): string {
  switch (secret) {
    case "tideShell":
      return "潮汐贝壳";
    case "firstWhisper":
      return "第一段悄悄话";
    case "lighthouseKeeper":
      return "灯塔守望者";
    case "nightGlow":
      return "夜航微光";
    case "firstSong":
      return "为你唱的歌";
    case "duetSong":
      return "和你的合唱";
    case "midnightVigil":
      return "深夜相伴";
    case "sleepyWard":
      return "撒娇的瞌睡";
  }
}

export default function ExploreMode({ visual, onExit, emotion, bottleNotes, imprints = [], userId = "local-guest" }: { visual: SceneVisual; onExit: () => void; emotion?: string; bottleNotes?: string[]; imprints?: Imprint[]; userId?: string }) {
  const inputRef = useRef<Input>({ x: 0, y: 0 });
  const posRef = useRef(new THREE.Vector3(0, 0, 0)); // 玩家世界坐标(Player 写,小地图/场景读)
  const headingRef = useRef(0); // 玩家朝向弧度(供小地图箭头)
  const keys = useRef(new Set<string>());
  const total = 5;
  const isTouch = useIsTouch();
  const tier = getPerfTier(); // 弱设备/移动端降档：去后期 + 降 dpr，避免卡顿（?perf=high 可强制解锁）
  // 进岛即掐断首页的后台重模型预热,把 CPU/带宽全让给进岛时的场景挂载(否则两边抢资源 → 进岛更卡)。
  useEffect(() => { setExploreActive(true); return () => setExploreActive(false); }, []);
  const [collected, setCollected] = useState(0);
  const imp = imprints;
  const [pickedImprints, setPickedImprints] = useState<number[]>([]); // 已拾起的心灵印记下标
  const [shownImprint, setShownImprint] = useState<Imprint | null>(null); // 当前展开的来源卡
  const hasImprints = imp.length > 0;
  const [nearNpc, setNearNpc] = useState(-1); // 当前可搭话的 NPC(-1=无),由场景内 onNear 回报
  const [carPrompt, setCarPrompt] = useState<"enter" | "exit" | null>(null); // 车交互提示(由 Player 回报)
  const [giftedIds, setGiftedIds] = useState<number[]>([]); // 已送过心愿的 NPC
  const [avatar, setAvatar] = useState<Avatar>(loadAvatar); // 你捏的人物外观(本地保存)
  const [character, setCharacter] = useState<CharKind>(() => { // 可切换主角:心屿守护者 / 记忆的守护者 / Pocoyo / 捏的人(迁移旧 xy_use_hero)
    try {
      const v = localStorage.getItem("xy_char");
      if (v === "hero" || v === "guardian" || v === "pocoyo" || v === "avatar") return v;
      return localStorage.getItem("xy_use_hero") === "0" ? "avatar" : "hero";
    } catch { return "hero"; }
  });
  const [expression, setExpression] = useState<string>(() => { try { return localStorage.getItem("xy_expr") || "auto"; } catch { return "auto"; } }); // 主角表情(auto 跟随状态 / 开心 / 平静 / 坚定 / 好奇)
  const [dressOpen, setDressOpen] = useState(false); // 换装面板开关
  const [mapMenu, setMapMenu] = useState(false); // 上车后「选地图」菜单
  const [menuOpen, setMenuOpen] = useState(false); // 左上极简菜单(收纳低频功能)
  const [forestDrive, setForestDrive] = useState(false); // 进入林间土路驾驶场景(独立 Canvas 覆盖层)
  const [whaleFound, setWhaleFound] = useState(false); // 🐋 彩蛋:发现鲸落之海
  const [bottles, setBottles] = useState<number[]>([]); // 🍾 彩蛋:拾到的漂流瓶下标
  // 🏖️ 心屿湾彩蛋
  const [crabFound, setCrabFound] = useState(false);    // 🦀 寄居蟹
  const [turtleFound, setTurtleFound] = useState(false); // 🐢 归海小海龟
  const [treasureFound, setTreasureFound] = useState(false); // 💎 退潮的宝藏
  const [nearConch, setNearConch] = useState(false);    // 🐚 听海海螺(走近)
  const [conchHush, setConchHush] = useState(false);    // 🐚 海螺贴耳 → 「听海」卡片
  const beachEggs = [crabFound, turtleFound, treasureFound].filter(Boolean).length;
  // 🏝️ 岛屿奇遇:统一收集集合(跨次保存),HUD 聚合「奇遇 N/总」
  const [discoveries, setDiscoveries] = useState<Set<string>>(() => { try { return new Set<string>(JSON.parse(localStorage.getItem("xy_discoveries") || "[]")); } catch { return new Set(); } });
  const discover = (k: string) => setDiscoveries((s) => { if (s.has(k)) return s; const n = new Set(s); n.add(k); try { localStorage.setItem("xy_discoveries", JSON.stringify([...n])); } catch { /* ignore */ } emitCompanionEvent("discover"); return n; });
  // ⛩️ 可互动仪式:就近点 + 写信模态(邮筒 / 寄给未来)
  const [nearInteract, setNearInteract] = useState<{ kind: string; label: string } | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [futureOpen, setFutureOpen] = useState(false);
  const [mailReply, setMailReply] = useState<string | null>(null);
  const doInteract = (kind: string) => {
    if (kind === "bell") eggSignals.bell++;
    else if (kind === "stone") eggSignals.stone++;
    else if (kind === "mailbox") setMailOpen(true);
    else if (kind === "future") setFutureOpen(true);
  };
  // 🏮 石灯笼:走近某盏 → nearLamp 记录是哪盏 + 当前亮灭;点按钮即切换(亮→「settle」熄、灭→「reveal」点)
  const [nearLamp, setNearLamp] = useState<{ idx: number; on: boolean } | null>(null);
  const doLamp = () => { playSfx(nearLamp?.on ? "settle" : "reveal"); lampSignals.toggle++; };
  const MAIL_REPLIES = [
    "岛屿收到了你的信。它说:「你愿意写下来，就已经很勇敢了。」",
    "海风把你的信读了一遍又一遍。它说:「慢慢来，我等你。」",
    "岛屿回信:「你说的我都记住了。下次来，灯还为你亮着。」",
  ];
  // 退潮宝藏的留言:有历史则藏一句「过去的你」,否则给一句温柔的默认话
  const treasureNote = bottleNotes && bottleNotes.length > 0
    ? `箱底压着一句你说过的话 —— ${bottleNotes[bottleNotes.length - 1]}`
    : undefined;
  const [companionState, setCompanionState] = useState<CompanionState>(() => loadCompanionState(userId, typeof window === "undefined" ? undefined : window.localStorage));
  const [companionMessage, setCompanionMessage] = useState(pickCompanionOpenLine); // 每次进岛挑一句开场白，像它一直在等你
  const [companionTalkText, setCompanionTalkText] = useState("");
  const [companionAction, setCompanionAction] = useState<CompanionActionSignal | null>(null);
  const [companionSecret, setCompanionSecret] = useState<CompanionSecretId | null>(null);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [companionThinking, setCompanionThinking] = useState(false);
  const [companionSinging, setCompanionSinging] = useState(false); // 它正在哼唱(随拍摇摆+灯脉动),一曲后自动收声
  const [companionSleeping, setCompanionSleeping] = useState(false); // 它正打瞌睡(下沉低头+灯转暗),叫醒才醒
  const singTimer = useRef<number | null>(null);
  const [autoVoice, setAutoVoice] = useState<boolean>(() => loadAutoVoice());
  // 「主动陪聊」模式：开启后精灵会按玩家操作(跳跃/开车/种花/发现奇遇…)主动冒一句话(头顶气泡 + 可选语音)。
  const [chatterMode, setChatterMode] = useState<boolean>(() => { try { return localStorage.getItem(CHATTER_MODE_KEY) !== "0"; } catch { return true; } });
  const [companionChatter, setCompanionChatter] = useState<{ text: string; nonce: number } | null>(null); // 当前头顶气泡
  const [companionSpeaking, setCompanionSpeaking] = useState(false);
  // 音色：ttsVoices 为后端可选清单（未配置云端 TTS 时为空 → 用系统语音，UI 给降级提示）；
  // voiceId 为用户当前选择（null = 后端默认音色）；previewVoice 为正在试听的那个 id。
  const [ttsVoices, setTtsVoices] = useState<TtsVoice[]>([]);
  const [ttsConfigured, setTtsConfigured] = useState<boolean | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(() => loadCompanionVoiceId());
  const [previewVoice, setPreviewVoice] = useState<string | null>(null);
  const voiceRef = useRef<CompanionVoiceController | null>(null);
  useEffect(() => {
    // 惰性初始化语音控制器（只建一次）；ref 不在 render 中访问，避免 lint 规则告警
    if (!voiceRef.current) voiceRef.current = createCompanionVoice();
  }, []);
  // 首次打开精灵面板时拉一次音色清单（未配置云端 TTS 则 voices 为空）。
  // provider 可能和上次不同（阿里云/腾讯云），旧的 voiceId 不在新清单里就清掉，
  // 避免选了个当前 provider 不存在的音色。
  useEffect(() => {
    if (!companionOpen || ttsConfigured !== null) return;
    let alive = true;
    fetchTtsVoices().then((r) => {
      if (!alive) return;
      setTtsConfigured(r.configured);
      setTtsVoices(r.voices);
      setVoiceId((cur) => {
        if (cur === null) return cur;
        const stillValid = r.voices.some((v) => v.id === cur);
        if (!stillValid) {
          saveCompanionVoiceId(null);
          return null;
        }
        return cur;
      });
    });
    return () => { alive = false; };
  }, [companionOpen, ttsConfigured]);
  // 用音量总线判定「是否还在说」：level 归零持续一小段（留出说话间隙停顿）
  // 才认定结束。比按字数估算时长准，且和 3D 随声动共用同一信号源。
  const silentSinceRef = useRef<number>(0);
  useEffect(() => {
    const unsub = subscribeCompanionLevel((level) => {
      if (level > 0.02) {
        silentSinceRef.current = 0;
      } else if (silentSinceRef.current === 0) {
        silentSinceRef.current = Date.now();
      } else if (Date.now() - silentSinceRef.current > 700) {
        // 连续静音 0.7s → 这句说完了
        setCompanionSpeaking(false);
        setPreviewVoice(null);
        silentSinceRef.current = 0;
      }
    });
    return unsub;
  }, []);
  // 拿到一句「最终回复」就自动说给用户听（语音开关关闭时静默）。读出的是
  // 那一刻的 message 文本，情绪取当前心情（与精灵语气一致）。
  const speakCompanion = (text: string) => {
    const ctrl = voiceRef.current;
    if (!ctrl || !autoVoice) return;
    const clean = (text || "").trim();
    if (!clean) return;
    silentSinceRef.current = 0;
    setCompanionSpeaking(true);
    void ctrl.speak(clean, emotion, voiceId);
  };
  const toggleCompanionVoice = () => {
    setAutoVoice((v) => {
      const next = !v;
      saveAutoVoice(next);
      if (!next) {
        voiceRef.current?.stop();
        setCompanionSpeaking(false);
      }
      return next;
    });
  };
  // ── 精灵「主动陪聊」：按玩家操作主动冒一句（头顶气泡 + 可选语音），套节流防刷屏 ──
  const chatterModeRef = useRef(chatterMode);
  useEffect(() => { chatterModeRef.current = chatterMode; }, [chatterMode]);
  const companionOpenRef = useRef(companionOpen);
  useEffect(() => { companionOpenRef.current = companionOpen; }, [companionOpen]);
  const forestDriveChatRef = useRef(forestDrive);
  useEffect(() => { forestDriveChatRef.current = forestDrive; }, [forestDrive]);
  const lastChatterAtRef = useRef(0);
  const lastChatterLineRef = useRef("");
  const sayChatterRef = useRef<(e: CompanionChatterEvent) => void>(() => {});
  // 每次渲染刷新实现，让它始终闭包到最新的 emotion / voiceId / autoVoice
  useEffect(() => {
    sayChatterRef.current = (event: CompanionChatterEvent) => {
      if (!chatterModeRef.current) return;
      if (forestDriveChatRef.current) return; // 林间土路全屏驾驶时不抢话
      if (companionOpenRef.current && event !== "greet") return; // 面板开着(在直接对话)时不插嘴，但「刚开启陪聊」的招呼例外
      const now = Date.now();
      const gap = event === "idle" ? 16000 : 6500; // 全局节流；闲聊间隔更长
      if (now - lastChatterAtRef.current < gap) return;
      const line = pickChatterLine(event, lastChatterLineRef.current);
      if (!line) return;
      lastChatterAtRef.current = now;
      lastChatterLineRef.current = line;
      setCompanionChatter({ text: line, nonce: now });
      // 配一个应景的小动作：发现 / 钓到 / 放灯 → 雀跃；其余 → 羁绊微光
      triggerCompanionAction(event === "discover" || event === "fish_catch" || event === "lantern" ? "Joyful" : "BondGlow");
      speakCompanion(line); // 语音开关关时自动静默
    };
  });
  // 订阅玩家操作事件总线（只订阅一次；实现走 ref，永远调到最新闭包）
  useEffect(() => subscribeCompanionEvents((e) => sayChatterRef.current?.(e)), []);
  // 闲聊：开启陪聊且久无操作时，精灵偶尔轻声碎语一句
  useEffect(() => {
    if (!chatterMode) return;
    const id = window.setInterval(() => {
      if (Date.now() - lastChatterAtRef.current > 22000) sayChatterRef.current?.("idle");
    }, 9000);
    return () => window.clearInterval(id);
  }, [chatterMode]);
  const toggleChatterMode = () => {
    const next = !chatterMode;
    setChatterMode(next);
    try { localStorage.setItem(CHATTER_MODE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
    if (next) {
      chatterModeRef.current = true; // 立刻生效，别等 effect
      lastChatterAtRef.current = 0; // 忽略节流，开口打个招呼
      emitCompanionEvent("greet");
    } else {
      setCompanionChatter(null);
    }
  };
  // 试听某个音色：用一句固定的温柔样例，按该音色读出来。
  const handlePreviewVoice = (id: string) => {
    const ctrl = voiceRef.current;
    if (!ctrl) return;
    if (previewVoice === id && companionSpeaking) {
      ctrl.stop();
      setCompanionSpeaking(false);
      setPreviewVoice(null);
      return;
    }
    silentSinceRef.current = 0;
    setPreviewVoice(id);
    setCompanionSpeaking(true);
    void ctrl.speak("我在这里，陪你把这一刻慢慢放轻。", "calm", id);
  };
  const handlePickVoice = (id: string) => {
    setVoiceId((cur) => {
      const next = cur === id ? null : id; // 再点一次 = 用回默认音色
      saveCompanionVoiceId(next);
      return next;
    });
  };
  const handleSpeakMessage = () => {
    const ctrl = voiceRef.current;
    if (!ctrl) return;
    if (companionSpeaking) {
      ctrl.stop();
      setCompanionSpeaking(false);
      setPreviewVoice(null);
      return;
    }
    const clean = companionMessage.trim();
    if (!clean) return;
    silentSinceRef.current = 0;
    setCompanionSpeaking(true);
    void ctrl.speak(clean, emotion, voiceId);
  };
  useEffect(() => {
    saveCompanionState(companionState, typeof window === "undefined" ? undefined : window.localStorage);
  }, [companionState]);
  // 关闭精灵面板 / 卸载探索模式时停掉语音，避免人走了它还在说
  useEffect(() => {
    if (!companionOpen) {
      voiceRef.current?.stop();
      setCompanionSpeaking(false);
      // 收起面板时复位「哼唱 / 瞌睡」，下次打开是清醒的它
      if (singTimer.current) { window.clearTimeout(singTimer.current); singTimer.current = null; }
      setCompanionSinging(false);
      setCompanionSleeping(false);
    }
  }, [companionOpen]);
  // 🌙 深夜(21:00–05:00)打开精灵 → 一次性解锁「深夜相伴」(nightVisitCompanion 自带时段/去重判断)
  useEffect(() => {
    if (!companionOpen) return;
    const result = nightVisitCompanion(companionState);
    if (!result) return;
    setCompanionState(result.state);
    setCompanionMessage(result.reply);
    setCompanionSecret(result.unlockedNow[0] ?? null);
    triggerCompanionAction(result.animation);
    playSfx("reveal");
    speakCompanion(result.reply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companionOpen]);
  useEffect(() => () => { voiceRef.current?.stop(); if (singTimer.current) window.clearTimeout(singTimer.current); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      const editing = tag === "input" || tag === "textarea" || Boolean(el?.isContentEditable);
      if (editing) return;
      const key = e.key.toLowerCase();
      if (key === "c" && !e.repeat) {
        setCompanionOpen((open) => !open);
        playSfx("tap");
      }
      if (key === "escape") setCompanionOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("xy_avatar", JSON.stringify(avatar));
    } catch {
      /* ignore */
    }
  }, [avatar]);

  // ====================== 新玩法:花田 / 天灯 / 垂钓 / 风铃心曲 ======================
  const [flowers, setFlowers] = useState<Flower[]>(() => { try { return JSON.parse(localStorage.getItem("xy_garden") || "[]"); } catch { return []; } });
  const [nearFlower, setNearFlower] = useState<Flower | null>(null);
  const [nearDistrict, setNearDistrict] = useState<ExploreZone | null>(null);
  const [environment, setEnvironment] = useState<ExploreEnvironment>(() => { try { return loadExploreEnvironment(localStorage); } catch { return DEFAULT_EXPLORE_ENVIRONMENT; } });
  const [lanternOpen, setLanternOpen] = useState(false);
  const [lanternText, setLanternText] = useState("");
  const [lanternCount, setLanternCount] = useState<number>(() => { try { return parseInt(localStorage.getItem("xy_lanterns") || "0", 10) || 0; } catch { return 0; } });
  const lanternLaunch = useRef(0);
  const [lanternPrep, setLanternPrep] = useState(false); // 天灯模型还没缓存好时:显示「准备中」,就绪后自动放飞
  const lanternWaitRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [atWater, setAtWater] = useState(false);
  const [fishing, setFishing] = useState<"idle" | "cast" | "bite">("idle");
  const [shownCatch, setShownCatch] = useState<{ icon: string; title: string; line: string } | null>(null);
  const [catchCount, setCatchCount] = useState<number>(() => { try { return parseInt(localStorage.getItem("xy_catch") || "0", 10) || 0; } catch { return 0; } });
  const [songProgress, setSongProgress] = useState(0);
  const [songDone, setSongDone] = useState<boolean>(() => { try { return localStorage.getItem("xy_song") === "1"; } catch { return false; } });
  const [songFlash, setSongFlash] = useState(false);
  const SONG = [2, 0, 3, 1, 4]; // 风铃心曲目标序(五声)
  useEffect(() => { try { localStorage.setItem("xy_garden", JSON.stringify(flowers.slice(-120))); } catch { /* ignore */ } }, [flowers]);
  useEffect(() => { try { saveExploreEnvironment(localStorage, environment); } catch { /* ignore */ } }, [environment]);
  useEffect(() => { try { localStorage.setItem("xy_lanterns", String(lanternCount)); } catch { /* ignore */ } }, [lanternCount]);
  // 天灯曲目后台预热；kmd.glb 仅非 low 档提前拉取，移动端把模型解析留到更晚的场景延迟里。
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
    let idle = 0; let to: ReturnType<typeof setTimeout> | undefined;
    const warm = () => {
      prewarmLanternCues();
      if (tier !== "low") useGLTF.preload(MODELS.skyLantern);
    };
    if (w.requestIdleCallback) idle = w.requestIdleCallback(warm);
    else to = setTimeout(warm, 4000);
    return () => { if (idle && w.cancelIdleCallback) w.cancelIdleCallback(idle); if (to) clearTimeout(to); };
  }, [tier]);
  useEffect(() => { try { localStorage.setItem("xy_song", songDone ? "1" : "0"); } catch { /* ignore */ } }, [songDone]);
  useEffect(() => { try { localStorage.setItem("xy_catch", String(catchCount)); } catch { /* ignore */ } }, [catchCount]);
  // 垂钓:抛竿 → 鱼讯(随机 1.6~3.8s) → 未及时收线则溜走;离开水边自动取消
  useEffect(() => {
    if (fishing === "cast") { const t = setTimeout(() => setFishing("bite"), 1600 + Math.random() * 2200); return () => clearTimeout(t); }
    if (fishing === "bite") { playSfx("ripple"); const t = setTimeout(() => setFishing("idle"), 2600); return () => clearTimeout(t); }
  }, [fishing]);
  useEffect(() => { if (!atWater && fishing !== "idle") setFishing("idle"); }, [atWater, fishing]);
  // 风铃心曲:奏齐目标序 → 满岛萤火 + 持久解锁
  useEffect(() => {
    if (!songDone && songProgress >= SONG.length) { setSongDone(true); setSongFlash(true); playSfx("bloom"); const t = setTimeout(() => setSongFlash(false), 4500); return () => clearTimeout(t); }
  }, [songProgress, songDone, SONG.length]);
  const plantFlower = (x: number, z: number, color: string) => { setFlowers((f) => [...f, { x, z, color, t: Date.now() }].slice(-120)); playSfx("bloom"); emitCompanionEvent("plant"); };
  const doReleaseLantern = () => {
    lanternLaunch.current += 1;
    setTimeout(() => { lanternLaunch.current += 1; }, 850); // 再补一轮 → 单灯也连放两束烟花
    setLanternCount((c) => c + 1); setLanternOpen(false); setLanternText("");
    playSfx("reveal"); playLanternRelease();
    if (!playLanternCue("single")) playLanternMelody(false); // 真实曲目优先(Frost Waltz),未就绪/静音回退八音盒合成
    emitCompanionEvent("lantern");
  };
  // 放飞一片:一次性放出一整片天灯 + 仰头跟拍 + 一连串盛大烟花
  const doReleaseLanternFlock = () => {
    const p = posRef.current; const px = p ? p.x : 0, pz = p ? p.z : 0;
    lanternFlock.x = px; lanternFlock.z = pz; lanternFlock.v += 1;
    lanternCam.x = px; lanternCam.z = pz; lanternCam.gy = exGroundY(px, pz); lanternCam.t = 0; lanternCam.on = true;
    setLanternCount((c) => c + 18); setMenuOpen(false);
    playSfx("reveal"); playLanternRelease();
    if (!playLanternCue("flock")) playLanternMelody(true); // 真实曲目优先(Skye Cuillin),未就绪/静音回退八音盒合成
    emitCompanionEvent("lantern");
    // 连放几轮烟花(每轮触发一次 show)→ 像一场盛大烟火秀;镜头随每轮重置而持续仰望(原 5 轮过载,降为 3 轮 / 弱机 2 轮)
    const rounds = tier === "low" ? 2 : 3;
    for (let k = 0; k < rounds; k++) setTimeout(() => { lanternLaunch.current += 1; }, 350 + k * 620);
  };
  // 放飞前确保天灯模型已缓存好:就绪 → 立刻放;还没好 → 关面板 + 提示「准备中」,轮询到就绪即自动放飞,
  // 这样「放天灯,等缓存好再放」不会出现「点了才加载解析 kmd.glb」的卡顿尖峰。6s 兜底防极端情况卡死。
  const ensureLantern = (kind: "single" | "flock") => {
    const go = () => (kind === "single" ? doReleaseLantern() : doReleaseLanternFlock());
    if (_lanternModelReady) { go(); return; }
    if (kind === "single") setLanternOpen(false); else setMenuOpen(false);
    setLanternPrep(true);
    if (lanternWaitRef.current) clearInterval(lanternWaitRef.current);
    let waited = 0;
    lanternWaitRef.current = setInterval(() => {
      waited += 120;
      if (_lanternModelReady || waited > 6000) {
        if (lanternWaitRef.current) clearInterval(lanternWaitRef.current);
        lanternWaitRef.current = null; setLanternPrep(false); go();
      }
    }, 120);
  };
  const releaseLantern = () => ensureLantern("single");
  const releaseLanternFlock = () => ensureLantern("flock");
  useEffect(() => () => { if (lanternWaitRef.current) clearInterval(lanternWaitRef.current); }, []); // 卸载时清掉等待轮询
  const CATCHES: { icon: string; title: string; lines: string[] }[] = [
    { icon: "🐚", title: "一枚贝壳", lines: ["贴近耳边,你听见很远很远的海。", "它把潮声收了起来,等你想听的时候。", "纹路温温的,像谁的指纹。"] },
    { icon: "🍾", title: "一只漂流瓶", lines: ["「今天也辛苦了,记得好好吃饭。」", "「看见这行字的此刻,你正被惦记着。」", "「慢慢来,海不会催你。」"] },
    { icon: "🐟", title: "一条小鱼", lines: ["你把它放回海里,水面漾开一圈星光。", "它绕你一圈,像在道谢,然后游远了。"] },
    { icon: "⭐", title: "一尾星海鱼", lines: ["稀客——鳞片随你此刻的心情变色。", "钓到它的人,心里大多都藏着光。"] },
  ];
  const onCast = () => {
    if (fishing === "idle") { setFishing("cast"); playSfx("tap"); return; }
    if (fishing === "bite") {
      const c = CATCHES[Math.floor(Math.random() * CATCHES.length)];
      const line = c.lines[Math.floor(Math.random() * c.lines.length)];
      setShownCatch({ icon: c.icon, title: c.title, line }); setCatchCount((n) => n + 1); setFishing("idle"); playSfx(c.icon === "🐟" ? "ripple" : "shell");
      emitCompanionEvent("fish_catch");
    }
  };
  const ringChime = (i: number) => { chimeNote(CHIME_FREQS[i]); emitCompanionEvent("chime"); if (songDone) return; setSongProgress((p) => (i === SONG[p] ? p + 1 : i === SONG[0] ? 1 : 0)); };
  const fmtWhen = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日`; };
  const districtLine = (zone: ExploreZone): string => {
    switch (zone.key) {
      case "home": return "回家坐一会儿，窗边的光会慢慢安静下来。";
      case "beach": return "海滩把浪声推到脚边，适合拾起一枚贝壳。";
      case "rice": return "稻田在风里轻轻摆，水面把天空切成细碎的光。";
      case "mountain": return "山路往上，能从这里登高望岛。";
      case "forest": return "森林把脚步声收得很轻，也许有小动物看见了你。";
      case "town": return "小镇的路灯和招牌都在等一个慢慢走过的人。";
      case "farm": return "农村的小路绕过干草堆，风车把今天翻到下一页。";
      case "zoo": return "动物园的小伙伴们很安静，靠近一点也没关系。";
      case "swamp": return "沼泽回声从芦苇里冒出来，雨天会更亮一点。";
      case "scenic": return "风景区的观景台正对着全岛，日出和夕阳最适合停留。";
    }
  };
  const activeTime = EXPLORE_TIME_OPTIONS.find((item) => item.value === environment.timeOfDay) ?? EXPLORE_TIME_OPTIONS[1];
  const activeWeather = EXPLORE_WEATHER_OPTIONS.find((item) => item.value === environment.weather) ?? EXPLORE_WEATHER_OPTIONS[0];
  const isExploreNight = environment.timeOfDay === "night";
  const setExploreTime = (timeOfDay: ExploreEnvironment["timeOfDay"]) => {
    if (timeOfDay === "night" && environment.timeOfDay !== "night") emitCompanionEvent("night");
    setEnvironment((current) => ({ ...current, timeOfDay }));
    playSfx("tap");
  };
  const setExploreWeather = (weather: ExploreEnvironment["weather"]) => {
    setEnvironment((current) => ({ ...current, weather }));
    playSfx(weather === "rain" ? "ripple" : "tap");
  };

  const nearRef = useRef(-1);
  const giftedRef = useRef<number[]>([]);
  useEffect(() => {
    nearRef.current = nearNpc;
    if (nearNpc >= 0) emitCompanionEvent("near_npc"); // 走近岛民 → 精灵可能提醒去打招呼
  }, [nearNpc]);
  useEffect(() => {
    giftedRef.current = giftedIds;
  }, [giftedIds]);
  const giveWish = () => {
    const id = nearRef.current;
    if (id < 0) return;
    setGiftedIds((g) => (g.includes(id) ? g : [...g, id]));
  };
  const triggerCompanionAction = (name: CompanionAnimation) => {
    setCompanionAction({ name, nonce: Date.now() });
  };
  const handleCompanionFeed = (food: CompanionFoodId) => {
    const result = feedCompanion(companionState, food);
    setCompanionState(result.state);
    setCompanionMessage(result.reply);
    setCompanionSecret(result.unlockedNow[0] ?? null);
    triggerCompanionAction(result.unlockedNow.length ? "SecretTwirl" : result.animation);
    playSfx(result.unlockedNow.length ? "reveal" : "shell");
    speakCompanion(result.reply);
  };
  const handleCompanionTalk = async () => {
    if (companionThinking) return;
    const said = companionTalkText.trim().slice(0, 42);
    const result = talkToCompanion(companionState, emotion);
    setCompanionState(result.state);
    setCompanionTalkText("");
    setCompanionSecret(result.unlockedNow[0] ?? null);
    if (!said) {
      setCompanionMessage(result.reply);
      triggerCompanionAction(result.unlockedNow.length ? "SecretTwirl" : result.animation);
      playSfx(result.unlockedNow.length ? "reveal" : "chime");
      speakCompanion(result.reply);
      return;
    }
    setCompanionThinking(true);
    setCompanionMessage(`${result.state.name}把你的话收进灯塔里，正轻轻听着...`);
    triggerCompanionAction("TalkListen");
    playSfx("chime");
    const ai = await requestCompanionChat({
      user_id: userId,
      message: said,
      companion_name: result.state.name,
      affinity: result.state.affinity,
      emotion,
      feed_count: result.state.feedCount,
      talk_count: result.state.talkCount,
      unlocked_secrets: result.state.unlockedSecrets,
    });
    setCompanionThinking(false);
    if (ai?.reply) {
      setCompanionMessage(ai.reply);
      triggerCompanionAction(result.unlockedNow.length ? "SecretTwirl" : normalizeCompanionAnimation(ai.animation));
      speakCompanion(ai.reply);
      if (ai.safety.triggered) playSfx("settle");
      return;
    }
    setCompanionMessage(`它认真听完「${said}」。${result.reply}`);
    triggerCompanionAction(result.unlockedNow.length ? "SecretTwirl" : result.animation);
    speakCompanion(result.reply);
  };
  const handleCompanionPet = () => {
    const reply = `${companionState.name}轻轻蹭了蹭你的身边，灯塔光像呼吸一样亮了一下。`;
    setCompanionMessage(reply);
    triggerCompanionAction("BondGlow");
    playSfx("tap");
    speakCompanion(reply);
  };
  const handleCompanionRest = () => {
    const reply = `${companionState.name}陪你安静地漂着。这里不需要证明什么，停一会儿也很好。`;
    setCompanionMessage(reply);
    triggerCompanionAction("SleepFloat");
    playSfx("settle");
    speakCompanion(reply);
  };
  // 🎵 唱歌：第一次唱 → 解锁 firstSong；它正在唱时再点 → 你跟着合唱 → duetSong。一曲终了自动收声。
  const handleCompanionSing = () => {
    if (companionThinking) return;
    const duet = companionSinging; // 它已在唱 → 这次是你跟着一起哼
    const result = singCompanion(companionState, { duet });
    setCompanionState(result.state);
    setCompanionMessage(result.reply);
    setCompanionSecret(result.unlockedNow[0] ?? null);
    setCompanionSleeping(false);
    setCompanionSinging(true);
    triggerCompanionAction(result.unlockedNow.length ? "SecretTwirl" : "SingSong");
    const durSec = playCompanionSong(result.state.songCount); // 每次换一句，返回时长(秒)
    if (result.unlockedNow.length) playSfx("reveal");
    speakCompanion(result.reply);
    if (singTimer.current) window.clearTimeout(singTimer.current);
    singTimer.current = window.setTimeout(() => setCompanionSinging(false), Math.max(2500, durSec * 1000 + 600));
  };
  // 😴 哄睡 / ☀️ 叫醒：睡着后再点是叫醒；累计叫醒满 3 次 → 它撒娇赖着不肯醒(sleepyWard)。
  const handleCompanionSleepToggle = () => {
    if (companionThinking) return;
    if (companionSleeping) {
      const result = wakeCompanion(companionState);
      setCompanionState(result.state);
      setCompanionMessage(result.reply);
      setCompanionSecret(result.unlockedNow[0] ?? null);
      setCompanionSleeping(false);
      triggerCompanionAction(result.unlockedNow.length ? "SecretTwirl" : result.animation);
      playSfx(result.unlockedNow.length ? "reveal" : "tap");
      speakCompanion(result.reply);
      return;
    }
    if (singTimer.current) window.clearTimeout(singTimer.current);
    setCompanionSinging(false);
    setCompanionSleeping(true);
    const reply = `${companionState.name}打了个小哈欠，缩进灯塔的光里，慢慢睡着了。`;
    setCompanionMessage(reply);
    triggerCompanionAction("SleepFloat");
    playSfx("settle");
    speakCompanion(reply);
  };
  const handleCompanionRename = (name: string) => {
    setCompanionState((state) => renameCompanion(state, name));
  };

  useEffect(() => {
    const recompute = () => {
      const k = keys.current;
      let x = 0;
      let y = 0;
      if (k.has("w") || k.has("arrowup")) y -= 1;
      if (k.has("s") || k.has("arrowdown")) y += 1;
      if (k.has("a") || k.has("arrowleft")) x -= 1;
      if (k.has("d") || k.has("arrowright")) x += 1;
      inputRef.current.x = x;
      inputRef.current.y = y;
      inputRef.current.boost = k.has("shift"); // 按住 Shift = 开车加速
    };
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "e" && !e.repeat) {
        const id = nearRef.current;
        if (id >= 0) setGiftedIds((g) => (g.includes(id) ? g : [...g, id])); // 近 NPC → 送心愿
        inputRef.current.action = true; // 近车 → 上/下车(Player 据距离消费)
      }
      if (key === " ") {
        e.preventDefault(); // 防止空格滚动页面
        if (!e.repeat) inputRef.current.jump = true; // 空格 = 跳跃
      }
      if (key === "f" && !e.repeat) inputRef.current.wave = true; // F = 招手
      if (key === "q" && !e.repeat) inputRef.current.flute = true; // Q = 吹笛
      if (key === "g" && !e.repeat && inputRef.current) inputRef.current.plant = true; // G = 种花
      keys.current.add(key);
      recompute();
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase());
      recompute();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const envVisual = resolveExploreEnvironmentVisual(visual, environment);
  const sky = `linear-gradient(to bottom, ${envVisual.skyTop} 0%, ${envVisual.skyMid} 48%, ${envVisual.skyBottom} 82%)`;
  const done = collected >= total;
  const imprintsDone = hasImprints && pickedImprints.length >= imp.length;
  const allGifted = giftedIds.length >= NPC_TOTAL; // 送完岛上所有人 → 庆祝

  // —— 音景：进入俯冲、彩蛋发现、完成峰值（均为 sfx.ts 零素材合成音，跟随音乐静音）——
  useEffect(() => { playSfx("whoosh"); }, []); // 俯冲入岛
  useEffect(() => { if (whaleFound) playSfx("chime"); }, [whaleFound]); // 🐋 鲸落之海
  useEffect(() => { if (bottles.length > 0) playSfx("collect"); }, [bottles.length]); // 🍾 拾到漂流瓶
  useEffect(() => { if (crabFound) playSfx("shell"); }, [crabFound]); // 🦀 寄居蟹
  useEffect(() => { if (turtleFound) playSfx("ripple"); }, [turtleFound]); // 🐢 归海小海龟
  useEffect(() => { if (treasureFound) playSfx("reveal"); }, [treasureFound]); // 💎 退潮的宝藏
  // 🐚 海螺贴耳:放浪声(wave),约 5s 后自动收起;走远也收起
  useEffect(() => {
    if (!conchHush) return;
    playSfx("wave");
    const t1 = setTimeout(() => playSfx("wave"), 1500);
    const t2 = setTimeout(() => setConchHush(false), 5200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [conchHush]);
  useEffect(() => { if (!nearConch) setConchHush(false); }, [nearConch]);
  useEffect(() => { if (giftedIds.length > 0) playSfx("tap"); }, [giftedIds.length]); // 送出一个心愿
  useEffect(() => { if (done) playSfx("bloom"); }, [done]); // 心愿收齐
  useEffect(() => { if (imprintsDone) playSfx("bloom"); }, [imprintsDone]); // 记忆之树成形
  useEffect(() => { if (allGifted) playSfx("bloom"); }, [allGifted]); // 温暖了全岛

  const hearts = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        i,
        left: hash2(i + 1, 2.3) * 100,
        size: 14 + hash2(i + 1, 5.1) * 24,
        dur: 4 + hash2(i + 1, 7.7) * 4,
        delay: hash2(i + 1, 9.2) * 5,
        color: ["#ff9bb0", "#ffd1dc", "#ffe9a8", "#bfe0e6"][i % 4],
      })),
    [],
  );

  return (
    <div className="xy-explore-mode fixed inset-0 z-[70] overflow-hidden" style={{ background: sky }}>
      <Canvas
        // antialias 跟随性能分档（对齐 Island3D）：低端/软渲染/移动端关掉 MSAA 省开销，
        // 反正这档已走 toon 材质、跳过 Sobel 手绘后期，画面观感损失极小。
        gl={{ antialias: tier === "high", alpha: false, powerPreference: "high-performance" }}
        // dpr 上限收一档(高端 1.75→1.4):Retina 上每帧像素 −36%,写实模型逐帧渲染 + Sobel 全屏后期都更轻。
        // low 档再降到 0.85~1，移动端优先保触控响应和稳定帧率。
        dpr={tier === "low" ? [0.85, 1] : [1, 1.4]}
        camera={{ position: [HEALING_WALK_CAMERA.canvasPosition[0], HEALING_WALK_CAMERA.canvasPosition[1], HEALING_WALK_CAMERA.canvasPosition[2]], fov: HEALING_WALK_CAMERA.canvasFov, near: 0.1, far: 3400 }}
        // 林间土路(DriveScene)是覆盖在上方的独立 Canvas,且与本场景共用 inputRef——
        // 不冻结的话踩油门(W)会让被遮住的小人在底下「走路」,蹭出脚步声(还白白渲染全遮挡场景)。
        // 覆盖期间冻结本场景:脚步声消失,而加油门/引擎声由 DriveScene 自管,不受影响。
        frameloop={forestDrive ? "never" : "always"}
      >
        <Suspense fallback={<ExploreLoading />}>
          <ExploreScene visual={visual} environment={environment} inputRef={inputRef} posRef={posRef} headingRef={headingRef} onCollect={() => { playSfx("collect"); setCollected((c) => c + 1); emitCompanionEvent("collect"); }} total={total} giftedIds={giftedIds} onNear={setNearNpc} emotion={emotion} avatar={avatar} onWhale={() => setWhaleFound(true)} onBottle={(i) => setBottles((b) => (b.includes(i) ? b : [...b, i]))} bottleNotes={bottleNotes} imprints={imp} onPickImprint={(i) => { playSfx("shell"); setPickedImprints((p) => (p.includes(i) ? p : [...p, i])); setShownImprint(imp[i]); }} treeColors={imprintsDone ? pickedImprints.map((i) => imp[i].color) : []} companionAction={companionAction} companionSinging={companionSinging} companionSleeping={companionSleeping} companionChatter={companionChatter} onCompanionInteract={() => setCompanionOpen(true)} character={character} expression={expression} flowers={flowers} onPlantFlower={plantFlower} onNearFlower={setNearFlower} lanternLaunch={lanternLaunch} onAtWater={setAtWater} fishingCasting={fishing !== "idle"} onRingChime={ringChime} songDone={songDone} nextChime={songDone ? -1 : (SONG[songProgress] ?? -1)} lanternCount={lanternCount} onCar={setCarPrompt} onCarEnter={() => setMapMenu(true)} onCrab={() => setCrabFound(true)} onTurtle={() => setTurtleFound(true)} onTreasure={() => setTreasureFound(true)} onConchNear={setNearConch} treasureNote={treasureNote} onDiscover={discover} onNearInteract={setNearInteract} onNearLamp={setNearLamp} onNearDistrict={setNearDistrict} tier={tier} />
        </Suspense>
      </Canvas>

      <button
        type="button"
        onClick={() => { setCompanionOpen((open) => !open); playSfx("tap"); }}
        className="panel-glass-2 absolute z-10 flex items-center gap-1.5 rounded-full px-3 py-2 font-display text-[13px] tracking-wider text-white/85 active:scale-95 transition-transform"
        style={{ right: "calc(1.2rem + env(safe-area-inset-right))", top: "calc(1.2rem + env(safe-area-inset-top))" }}
        aria-label={companionOpen ? "收起专属精灵" : "打开专属精灵"}
      >
        <span className="text-[#ffe2a0]">✦</span>
        <span>精灵</span>
      </button>

      {companionOpen && (
        <CompanionPanel
          state={companionState}
          message={companionMessage}
          speaking={companionSpeaking}
          secret={companionSecret}
          talkText={companionTalkText}
          busy={companionThinking}
          autoVoice={autoVoice}
          chatterMode={chatterMode}
          voices={ttsVoices}
          ttsConfigured={ttsConfigured}
          voiceId={voiceId}
          previewVoice={previewVoice}
          onToggleAutoVoice={toggleCompanionVoice}
          onToggleChatter={toggleChatterMode}
          onPickVoice={handlePickVoice}
          onPreviewVoice={handlePreviewVoice}
          onTalkTextChange={setCompanionTalkText}
          onFeed={handleCompanionFeed}
          onTalk={handleCompanionTalk}
          onPet={handleCompanionPet}
          onRest={handleCompanionRest}
          singing={companionSinging}
          sleeping={companionSleeping}
          onSing={handleCompanionSing}
          onSleepToggle={handleCompanionSleepToggle}
          onRename={handleCompanionRename}
          onSpeakMessage={handleSpeakMessage}
          onClose={() => setCompanionOpen(false)}
          onDismissSecret={() => setCompanionSecret(null)}
        />
      )}

      {/* 任务 HUD：主进度突出，次要发现（心愿/鲸落/漂流瓶）收成一行淡出，避免堆叠多行。
          顶部居中整列用 flex-col + gap 排布——风铃提示作为次级 pill 自动叠在主面板下方，绝不重叠。 */}
      <div className="xy-explore-hud pointer-events-none absolute inset-x-0 top-0 flex flex-col items-end gap-1.5 pl-[8.4rem] pr-3 sm:items-center sm:gap-2 sm:px-3" style={{ paddingTop: "calc(1.2rem + env(safe-area-inset-top))" }}>
        {/* 主目标收成一颗 slim 胶囊：去掉教学副标题（计数已自明），次要发现压成图标+数字缀在后面，整体更轻、更像游戏 HUD */}
        <div className="panel-glass-2 flex min-w-0 max-w-[calc(100vw-9.2rem)] items-center gap-2 rounded-full px-4 py-1.5 sm:max-w-[92vw]">
          <span className="shrink-0 whitespace-nowrap font-display text-[15px] tracking-wide text-white/90">
            {hasImprints
              ? (imprintsDone ? "✦ 你走过的每一刻，都还在 ✦" : `✦ 心灵印记 ${pickedImprints.length}/${imp.length}`)
              : (done ? "✦ 谢谢你来岛上走走 ✦" : `♡ 心愿 ${collected}/${total}`)}
          </span>
          {((giftedIds.length > 0) || whaleFound || bottles.length > 0 || beachEggs > 0 || discoveries.size > 0) && (
            <span className="min-w-0 truncate border-l border-white/15 pl-2 text-caption text-white/45">
              {[
                giftedIds.length > 0 ? (allGifted ? "💝" : `🎁${giftedIds.length}/${NPC_TOTAL}`) : "",
                whaleFound ? "🐋" : "",
                bottles.length > 0 ? `🍾${bottles.length}/${BOTTLE_ANGLES.length}` : "",
                beachEggs > 0 ? `🏖️${beachEggs}/3` : "",
                discoveries.size > 0 ? `✨${discoveries.size}/12` : "",
              ].filter(Boolean).join("  ")}
            </span>
          )}
        </div>
        {nearDistrict && (
          <div className="panel-glass-1 max-w-[calc(100vw-9.2rem)] truncate rounded-full px-3.5 py-1 text-caption text-white/72 sm:max-w-[92vw]">
            {nearDistrict.icon} {nearDistrict.label} · {districtLine(nearDistrict)}
          </div>
        )}
        {/* 风铃心曲：精简引导——进度圆点已表达「依次」，只留一句方向提示 */}
        {!songDone && (
          <div className="panel-glass-1 max-w-[calc(100vw-9.2rem)] truncate whitespace-nowrap rounded-full px-3.5 py-1 text-caption text-white/70 sm:max-w-[92vw]">🎐 跟着发光的风铃 {SONG.map((_, i) => (i < songProgress ? "◍" : "○")).join(" ")}</div>
        )}
      </div>

      {/* 走近 NPC：送心愿交互按钮(底部居中) */}
      {nearNpc >= 0 && (
        <div className="absolute inset-x-0 flex justify-center px-4" style={{ bottom: "calc(2.4rem + env(safe-area-inset-bottom))" }}>
          {giftedIds.includes(nearNpc) ? (
            <div className="panel-glass-1 rounded-full px-5 py-2 text-center text-caption text-white/60">已经把心愿送给 TA 了 ♡</div>
          ) : (
            <button onClick={giveWish} className="panel-glass-2 rounded-full px-6 py-2.5 font-display text-[15px] tracking-wider text-white/90 active:scale-95 transition-transform">
              送 TA 一个心愿 ♡<span className="text-caption text-white/45"> (E)</span>
            </button>
          )}
        </div>
      )}

      {/* 上/下车提示(近车且不在 NPC 旁) */}
      {carPrompt && nearNpc < 0 && (
        <div className="absolute inset-x-0 flex justify-center px-4" style={{ bottom: "calc(2.4rem + env(safe-area-inset-bottom))" }}>
          <button onClick={() => {
            if (carPrompt === "enter") setMapMenu(true);
            else inputRef.current.action = true;
          }} className="panel-glass-2 rounded-full px-6 py-2.5 font-display text-[15px] tracking-wider text-white/90 active:scale-95 transition-transform">
            {carPrompt === "enter" ? "🚗 上车开一开" : "🚶 下车"}<span className="text-caption text-white/45"> (E)</span>
          </button>
        </div>
      )}

      {/* 左上小地图(常驻缩略图,点开 → 可缩放全岛图) */}
      <Minimap posRef={posRef} headingRef={headingRef} night={isExploreNight || visual.time === "night" || !!visual.stars} />

      {/* 左上极简菜单：低频功能（捏人/昼夜/天灯/种花/回到岸上）收进 ☰，平时只留一个圆按钮 */}
      <div className="xy-explore-menu absolute z-20" style={{ left: "calc(1.2rem + env(safe-area-inset-left))", top: "calc(1.2rem + env(safe-area-inset-top))" }}>
        <button
          type="button"
          onClick={() => { setMenuOpen((v) => !v); playSfx("tap"); }}
          aria-label={menuOpen ? "收起菜单" : "打开菜单"}
          aria-expanded={menuOpen}
          className="flex h-11 w-11 items-center justify-center rounded-full panel-glass-2 text-white/85 active:scale-90 transition-transform"
        >
          <span className="text-[18px] leading-none">{menuOpen ? "✕" : "☰"}</span>
        </button>
        {menuOpen && (
          <>
            {/* 点空白处收起 */}
            <div className="fixed inset-0 z-[-1]" onClick={() => setMenuOpen(false)} />
            <div
              className="panel-glass-2 mt-2 w-[11rem] max-w-[calc(100vw-2.4rem)] rounded-card p-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <MenuButton icon="✎" label="捏人" onClick={() => { setDressOpen(true); setMenuOpen(false); }} />
              {/* 日出 / 中午 / 夕阳 / 夜晚 / 晴天 / 下雨 */}
              <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-[0.18em] text-white/38">时辰</div>
              <div className="grid grid-cols-2 gap-1">
                {EXPLORE_TIME_OPTIONS.map((item) => (
                  <MenuButton
                    key={item.value}
                    icon={item.icon}
                    label={item.value === activeTime.value ? `${item.label} ✓` : item.label}
                    onClick={() => setExploreTime(item.value)}
                  />
                ))}
              </div>
              <div className="my-1 h-px bg-white/10" />
              <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-[0.18em] text-white/38">天气</div>
              <div className="grid grid-cols-2 gap-1">
                {EXPLORE_WEATHER_OPTIONS.map((item) => (
                  <MenuButton
                    key={item.value}
                    icon={item.icon}
                    label={item.value === activeWeather.value ? `${item.label} ✓` : item.label}
                    onClick={() => setExploreWeather(item.value)}
                  />
                ))}
              </div>
              <MenuButton icon="🏮" label="放天灯" onClick={() => { setLanternOpen(true); setMenuOpen(false); }} />
              <MenuButton icon="🪔" label="放飞一片" onClick={releaseLanternFlock} />
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); if (inputRef.current) inputRef.current.plant = true; }}
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-card px-2.5 py-2 text-left text-[13px] text-white/82 transition hover:bg-white/10 active:scale-[0.98]"
              >
                <span className="w-5 text-center text-[15px] leading-none">🌱</span>种花
              </button>
              <div className="my-1 h-px bg-white/10" />
              <MenuButton icon="↩" label="回到岸上" onClick={onExit} />
            </div>
          </>
        )}
      </div>

      {/* 换装面板:左侧实时预览 + 色卡,选完即时上身、本地保存 */}
      {dressOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/35 px-4" onClick={() => setDressOpen(false)}>
          <div className="panel-glass-2 rounded-card p-4 w-[20rem] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-[17px] tracking-wider text-white/90 text-center mb-2">捏一个你</p>
            <div className="h-44 rounded-card overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.06)" }}>
              <AvatarPreview avatar={avatar} />
            </div>
            <SwatchRow label="肤色" colors={SKIN_SWATCHES} value={avatar.skin} onPick={(c) => setAvatar((a) => ({ ...a, skin: c }))} />
            <SwatchRow label="发色" colors={HAIR_SWATCHES} value={avatar.hair} onPick={(c) => setAvatar((a) => ({ ...a, hair: c }))} />
            <SwatchRow label="上衣" colors={SHIRT_SWATCHES} value={avatar.shirt} onPick={(c) => setAvatar((a) => ({ ...a, shirt: c }))} />
            <SwatchRow label="裤子" colors={PANTS_SWATCHES} value={avatar.pants} onPick={(c) => setAvatar((a) => ({ ...a, pants: c }))} />
            <div className="flex items-center justify-between mt-1 mb-1">
              <span className="text-caption text-white/55">草帽</span>
              <button
                type="button"
                onClick={() => setAvatar((a) => ({ ...a, hat: !a.hat }))}
                className="chip"
                style={{ opacity: avatar.hat ? 1 : 0.55 }}
              >
                {avatar.hat ? "戴着 ✓" : "不戴"}
              </button>
            </div>
            <div className="flex items-center justify-between mt-1 mb-1">
              <span className="text-caption text-white/55">主角形象</span>
              <button
                type="button"
                onClick={() => setCharacter((c) => { const nx = CHAR_ORDER[(CHAR_ORDER.indexOf(c) + 1) % CHAR_ORDER.length]; try { localStorage.setItem("xy_char", nx); } catch { /* ignore */ } return nx; })}
                className="chip"
              >
                {CHAR_LABEL[character]} ⇄
              </button>
            </div>
            {character === "guardian" && (
              <div className="flex items-center justify-between mt-1 mb-1">
                <span className="text-caption text-white/55">表情</span>
                <div className="flex gap-1">
                  {([["auto", "自动"], ["cheerful", "开心"], ["calm", "平静"], ["determined", "坚定"], ["curious", "好奇"]] as const).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => { setExpression(k); try { localStorage.setItem("xy_expr", k); } catch { /* ignore */ } }}
                      className="chip"
                      style={{ opacity: expression === k ? 1 : 0.5 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setDressOpen(false)} className="btn-primary w-full mt-3">
              完成
            </button>
          </div>
        </div>
      )}

      {/* 操作提示 */}
      <p
        className="xy-explore-control-hint absolute hidden text-caption text-white/45 sm:block"
        style={{ right: "calc(1.6rem + env(safe-area-inset-right))", bottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        {carPrompt === "exit"
          ? isTouch
            ? "摇杆驾驶 · 按住「»」加速"
            : "W/S 油门 · A/D 转向 · 按住 Shift 加速"
          : isTouch
            ? "左下摇杆移动 · 右侧跳跃 / 招手 / 吹笛"
            : "WASD / 方向键 移动 · 空格跳跃 · F 招手 · Q 吹笛"}
      </p>

      {/* 右下动作按钮组(触屏):吹笛 + 招手 + 跳跃，统一 44 圆;开车时隐藏,改显加速踏板。
          精灵面板打开时一并隐藏——面板右贴边、窄屏近乎满宽,这组按钮会压在面板下半部(消息气泡+秘密标签)上;
          且吹笛/招手/跳跃是世界动作,看面板时用不到。精灵入口保留顶部唯一按钮,避免同屏出现两个入口。 */}
      {carPrompt !== "exit" && !companionOpen && (
      <div className="xy-explore-action-pad absolute z-10 flex flex-col items-center gap-2.5" style={{ right: "calc(1.4rem + env(safe-area-inset-right))", bottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
        <button
          onPointerDown={(e) => { e.preventDefault(); if (inputRef.current) inputRef.current.flute = true; }}
          className="flex h-11 w-11 items-center justify-center rounded-full panel-glass-2 text-white/85 select-none active:scale-90 transition-transform"
          style={{ touchAction: "none" }}
          aria-label="吹笛"
        >
          <span className="text-[16px] leading-none">🎵</span>
        </button>
        <button
          onPointerDown={(e) => { e.preventDefault(); if (inputRef.current) inputRef.current.wave = true; }}
          className="flex h-11 w-11 items-center justify-center rounded-full panel-glass-2 text-white/85 select-none active:scale-90 transition-transform"
          style={{ touchAction: "none" }}
          aria-label="招手"
        >
          <span className="text-[17px] leading-none">✋</span>
        </button>
        <button
          onPointerDown={(e) => { e.preventDefault(); if (inputRef.current) inputRef.current.jump = true; }}
          className="flex h-11 w-11 items-center justify-center rounded-full panel-glass-2 text-white/85 select-none active:scale-90 transition-transform"
          style={{ touchAction: "none" }}
          aria-label="跳跃"
        >
          <span className="text-[17px] leading-none">⤴</span>
        </button>
      </div>
      )}
      {/* 开车时(触屏):右下「按住加速」踏板,对应键盘 Shift */}
      {isTouch && carPrompt === "exit" && (
        <button
          onPointerDown={(e) => { e.preventDefault(); if (inputRef.current) inputRef.current.boost = true; }}
          onPointerUp={(e) => { e.preventDefault(); if (inputRef.current) inputRef.current.boost = false; }}
          onPointerLeave={() => { if (inputRef.current) inputRef.current.boost = false; }}
          onPointerCancel={() => { if (inputRef.current) inputRef.current.boost = false; }}
          className="xy-explore-boost absolute z-10 flex h-16 w-16 items-center justify-center rounded-full panel-glass-2 text-white/90 select-none active:scale-90 transition-transform"
          style={{ right: "calc(1.6rem + env(safe-area-inset-right))", bottom: "calc(6rem + env(safe-area-inset-bottom))", touchAction: "none" }}
          aria-label="加速"
        >
          <span className="text-[26px] leading-none">»</span>
        </button>
      )}

      {/* 送完所有人:满岛飘心 + 收尾 */}
      {allGifted && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
          <style>{"@keyframes xyRise{0%{transform:translateY(0) scale(.6);opacity:0}12%{opacity:.95}100%{transform:translateY(-78vh) scale(1.15);opacity:0}}"}</style>
          {hearts.map((h) => (
            <span
              key={h.i}
              style={{ position: "absolute", left: `${h.left}%`, bottom: "-6%", fontSize: h.size, color: h.color, animation: `xyRise ${h.dur}s ease-in ${h.delay}s infinite` }}
            >
              ♡
            </span>
          ))}
          <div className="panel-glass-2 rounded-card px-7 py-5 text-center max-w-[18rem]">
            <p className="font-display text-[20px] tracking-wider text-white/90">这座岛，因你而暖</p>
            <p className="text-caption text-white/65 mt-2 leading-relaxed">你把心愿分给了岛上的每一个人。<br />他们会替你，把这份温柔留在这儿。</p>
          </div>
        </div>
      )}

      {/* 心灵印记来源卡:拾起一枚印记 → 看见那天的自己 */}
      {shownImprint && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/35 px-4" onClick={() => setShownImprint(null)}>
          <div
            className="panel-glass-2 rounded-card p-5 w-[20rem] max-w-[92vw] text-center"
            style={{ borderTop: `2px solid ${shownImprint.color}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-caption text-white/55">
              {shownImprint.when}的你 · <span style={{ color: shownImprint.color }}>{shownImprint.label}</span>
            </p>
            <p className="font-serif text-[15px] text-white/90 mt-2 leading-relaxed">「{shownImprint.words}」</p>
            <p className="text-caption text-white/70 mt-3 leading-relaxed">{shownImprint.line}</p>
            <button onClick={() => setShownImprint(null)} className="btn-primary mt-4 w-full">
              收下这枚印记
            </button>
          </div>
        </div>
      )}

      {/* —— 新玩法 HUD —— */}
      {/* 海湾岸边:垂钓按钮(底部居中,避开送心愿) */}
      {atWater && nearNpc < 0 && (
        <div className="absolute inset-x-0 flex justify-center px-4" style={{ bottom: "calc(2.4rem + env(safe-area-inset-bottom))" }}>
          <button onClick={onCast} className="panel-glass-2 rounded-full px-6 py-2.5 font-display text-[15px] tracking-wider text-white/90 active:scale-95 transition-transform">
            {fishing === "idle" ? "🎣 垂钓" : fishing === "cast" ? "抛竿中…" : "❗ 收线!"}
          </button>
        </div>
      )}

      {/* 🐚 听海海螺:走近礁石 → 贴近耳朵(放浪声 + 一句话) */}
      {nearConch && nearNpc < 0 && !atWater && !conchHush && (
        <div className="absolute inset-x-0 flex justify-center px-4" style={{ bottom: "calc(2.4rem + env(safe-area-inset-bottom))" }}>
          <button onClick={() => setConchHush(true)} className="panel-glass-2 rounded-full px-6 py-2.5 font-display text-[15px] tracking-wider text-white/90 active:scale-95 transition-transform">
            🐚 贴近耳朵，听听海
          </button>
        </div>
      )}
      {conchHush && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center px-4" style={{ bottom: "calc(7.5rem + env(safe-area-inset-bottom))" }}>
          <div className="panel-glass-2 rounded-card px-5 py-3 text-center max-w-[80vw]" style={{ animation: "xyRise 0.5s ease-out" }}>
            <p className="text-caption tracking-[0.22em] text-white/55">🐚 把海螺贴近耳朵</p>
            <p className="font-display text-[15px] leading-relaxed tracking-wide text-white/90 mt-1">海螺里没有海 —— 是你心里的那片海，在轻轻回响。</p>
          </div>
        </div>
      )}

      {/* 🏮 石灯笼:就近点灯 / 熄灯(熄灭留一盏微光) */}
      {nearLamp && !nearInteract && nearNpc < 0 && !atWater && !nearConch && (
        <div className="absolute inset-x-0 flex justify-center px-4" style={{ bottom: "calc(2.4rem + env(safe-area-inset-bottom))" }}>
          <button onClick={doLamp} className="panel-glass-2 rounded-full px-6 py-2.5 font-display text-[15px] tracking-wider text-white/90 active:scale-95 transition-transform">
            {nearLamp.on ? "🌙 熄灯 · 留一盏微光" : "🏮 点亮石灯"}
          </button>
        </div>
      )}

      {/* ⛩️ 可互动仪式:就近按钮(摇铃 / 写信 / 叠石) */}
      {nearInteract && nearNpc < 0 && !atWater && !nearConch && (
        <div className="absolute inset-x-0 flex justify-center px-4" style={{ bottom: "calc(2.4rem + env(safe-area-inset-bottom))" }}>
          <button onClick={() => doInteract(nearInteract.kind)} className="panel-glass-2 rounded-full px-6 py-2.5 font-display text-[15px] tracking-wider text-white/90 active:scale-95 transition-transform">
            {nearInteract.label}
          </button>
        </div>
      )}
      {mailOpen && (
        <WriteModal title="给岛屿写一封信" hint="说点什么都好，岛屿一直在听。" placeholder="亲爱的岛屿…" action="投进邮筒" onClose={() => setMailOpen(false)}
          onSubmit={(text) => { try { const arr = JSON.parse(localStorage.getItem("xy_letters") || "[]"); arr.push({ t: text, at: Date.now() }); localStorage.setItem("xy_letters", JSON.stringify(arr)); } catch { /* ignore */ } playSfx("page"); discover("mailbox"); setMailReply(MAIL_REPLIES[Math.floor(Math.random() * MAIL_REPLIES.length)]); }} />
      )}
      {futureOpen && (
        <WriteModal title="写一封给未来的自己" hint="把它交给海，某天它会漂回你心里。" placeholder="嘿，未来的我…" action="放进瓶子，交给海" onClose={() => setFutureOpen(false)}
          onSubmit={(text) => { try { const arr = JSON.parse(localStorage.getItem("xy_future_letters") || "[]"); arr.push({ t: text, at: Date.now() }); localStorage.setItem("xy_future_letters", JSON.stringify(arr)); } catch { /* ignore */ } eggSignals.future++; playSfx("ripple"); discover("future"); }} />
      )}
      {mailReply && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center px-8" onClick={() => setMailReply(null)}>
          <div className="panel-glass-2 rounded-card max-w-sm p-6 text-center" style={{ animation: "xyRise 0.5s ease-out" }}>
            <p className="text-caption tracking-[0.22em] text-white/55">📮 岛屿的回信</p>
            <p className="font-display text-[16px] leading-relaxed tracking-wide text-white/90 mt-2">{mailReply}</p>
            <button onClick={() => setMailReply(null)} className="mt-4 text-caption text-white/45">轻触收起</button>
          </div>
        </div>
      )}

      {/* 走近花朵:何时种下 */}
      {nearFlower && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center px-4" style={{ bottom: "calc(8.6rem + env(safe-area-inset-bottom))" }}>
          <div className="panel-glass-1 rounded-full px-4 py-1.5 text-caption text-white/70">🌸 这朵开于 {fmtWhen(nearFlower.t)} · <span style={{ color: nearFlower.color }}>那时的心情</span></div>
        </div>
      )}

      {/* 风铃心曲:成曲闪现(进度提示已并入顶部任务 HUD 列) */}
      {songFlash && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="panel-glass-2 rounded-card px-7 py-5 text-center max-w-[16rem]">
            <p className="font-display text-[19px] tracking-wider text-white/90">心曲已成 🎐</p>
            <p className="text-caption text-white/65 mt-2 leading-relaxed">岛屿的摇篮曲被你唤齐了，<br />满岛萤火轻轻升起。</p>
          </div>
        </div>
      )}

      {/* 放天灯:写下心事 → 升空 */}
      {lanternOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 px-4" onClick={() => setLanternOpen(false)}>
          <div className="panel-glass-2 rounded-card p-5 w-[20rem] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-[17px] tracking-wider text-white/90 text-center">放一盏天灯</p>
            <p className="text-caption text-white/55 text-center mt-1 mb-3">写下一个心事或愿望，让它随灯远去。</p>
            <textarea value={lanternText} onChange={(e) => setLanternText(e.target.value)} placeholder="把它交给夜空…" rows={3} className="w-full resize-none rounded-card border border-white/12 bg-white/10 px-3 py-2 text-[13px] text-white/90 placeholder:text-white/35" />
            <button onClick={releaseLantern} className="btn-primary w-full mt-3">放飞 🏮</button>
            {lanternCount > 0 && <p className="text-caption text-white/45 text-center mt-2">你已放下 {lanternCount} 盏</p>}
          </div>
        </div>
      )}
      {/* 天灯模型还没缓存好时的轻提示:就绪后 ensureLantern 自动放飞并撤下此条 */}
      {lanternPrep && (
        <div className="absolute inset-x-0 top-[20%] z-40 flex justify-center px-4 pointer-events-none">
          <div className="panel-glass-2 rounded-full px-4 py-2 flex items-center gap-2 text-[13px] text-white/90">
            <span className="animate-pulse">🏮</span> 天灯准备中，马上为你放飞…
          </div>
        </div>
      )}

      {/* 垂钓收获卡 */}
      {shownCatch && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/35 px-4" onClick={() => setShownCatch(null)}>
          <div className="panel-glass-2 rounded-card p-5 w-[19rem] max-w-[92vw] text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-[34px] leading-none">{shownCatch.icon}</p>
            <p className="font-display text-[16px] tracking-wider text-white/90 mt-2">{shownCatch.title}</p>
            <p className="font-serif text-caption text-white/75 mt-2 leading-relaxed">{shownCatch.line}</p>
            <p className="text-caption text-white/40 mt-3">已拾得 {catchCount} 件</p>
            <button onClick={() => setShownCatch(null)} className="btn-primary mt-3 w-full">收下</button>
          </div>
        </div>
      )}

      {/* 上车:选地图(当前岛 / 林间土路) */}
      {mapMenu && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 px-4" onClick={() => setMapMenu(false)}>
          <div className="panel-glass-2 rounded-card p-5 w-[20rem] max-w-[92vw] text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-[17px] tracking-wider text-white/90">上车,去哪兜风?</p>
            <p className="text-caption text-white/55 mt-1 mb-4">选一张地图开起来</p>
            <div className="grid grid-cols-1 gap-2.5">
              <button onClick={() => { carState.driving = true; if (inputRef.current) inputRef.current.boost = false; startEngine(); playSfx("whoosh"); emitCompanionEvent("drive_enter"); setMapMenu(false); }} className="btn-primary py-3">🏝️ 就在这座岛上开</button>
              <button onClick={() => { setForestDrive(true); setMapMenu(false); }} className="btn-ghost py-3">🌲 去林间土路<span className="text-caption text-white/45"> (大地图,首次载入稍候)</span></button>
            </div>
            <button onClick={() => setMapMenu(false)} className="text-caption text-white/45 mt-3">取消</button>
          </div>
        </div>
      )}
      {forestDrive && <DriveScene inputRef={inputRef} onExit={() => setForestDrive(false)} />}

      <Joystick inputRef={inputRef} />
    </div>
  );
}
