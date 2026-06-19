/* eslint-disable react-hooks/immutability, react-hooks/set-state-in-effect -- R3F animation refs/materials are mutated outside React render state. */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Outlines, Html, useAnimations, useGLTF, Stars } from "@react-three/drei";
import { EffectComposer } from "@react-three/postprocessing";
import { Effect, EffectAttribute } from "postprocessing";
import * as THREE from "three";
import type { SceneVisual } from "../lib/sceneMap";
import type { SceneMotionMood } from "../lib/sceneMotion";
import { requestCompanionChat } from "../lib/api";
import { hash2, islandHeight, valueNoise, smoothstep01, ISLAND_RADIUS, ISLAND_SIZE } from "../lib/islandTerrain";
import { play as playSfx, chimeNote, startEngine, stopEngine, setEngineSpeed } from "../lib/sfx";
import DriveScene from "./DriveScene";
import {
  COMPANION_FOODS,
  feedCompanion,
  getCompanionBondLabel,
  getSecretText,
  loadCompanionState,
  renameCompanion,
  saveCompanionState,
  talkToCompanion,
  type CompanionAnimation,
  type CompanionFoodId,
  type CompanionSecretId,
  type CompanionState,
} from "../lib/companionSpirit";

// 探索地形:岛屿轮廓大幅水平放大 → 一座很大很大的可走岛
const EXS = 80.0; // 水平放大(极巨大岛)
const EYS = 0.6; // 整体岛形高度系数
const HILLS = 15.0; // 世界尺度丘陵幅度(让岛明显起伏,不是平盘子)
// 地表高度:大岛盘形(含海岸) + 世界频率多倍频丘陵。村落中心保持平整(密集小屋不卡坡),
// 丘陵在村外中环隆起、近海岸渐隐(岛仍干净沉入海)。
function exGroundY(wx: number, wz: number): number {
  const base = islandHeight(wx / EXS, -wz / EXS) * EYS;
  const r = Math.hypot(wx, wz) / (ISLAND_RADIUS * EXS);
  const coast = 1 - smoothstep01(0.62, 0.8, r); // 丘陵向海岸收平,外圈留出平缓沙滩肩台
  const villageFlat = smoothstep01(0.05, 0.24, r); // 中央村落区压平,向外才起伏
  const hills =
    valueNoise(wx * 0.028 + 3, wz * 0.028 + 3) * 0.62 +
    valueNoise(wx * 0.08 + 1, wz * 0.08 + 1) * 0.28 +
    valueNoise(wx * 0.19, wz * 0.19) * 0.1; // 0..1(只加不减,从盘面隆起)
  return base + hills * HILLS * coast * villageFlat;
}

// 建好的地形:按高度分区配色(草地 / 沙滩 / 水下),顶点色 + toon → 海岸自然过渡。
function buildExploreTerrain(): THREE.BufferGeometry {
  const S = ISLAND_SIZE * EXS;
  const SEG = 340;
  const geo = new THREE.PlaneGeometry(S, S, SEG, SEG);
  const pos = geo.attributes.position;
  const colors: number[] = [];
  const cGrass = new THREE.Color("#5aa873");
  const cGrass2 = new THREE.Color("#6fb37e");
  const cHill = new THREE.Color("#8cbf83"); // 高处向阳坡(更亮)
  const cSand = new THREE.Color("#dccaa0");
  const cUnder = new THREE.Color("#357884");
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const h = exGroundY(px, -py); // 与角色贴地同一函数(含丘陵)→ 网格与地面一致
    pos.setZ(i, h);
    const rNorm = Math.hypot(px, py) / (ISLAND_RADIUS * EXS);
    const beachEdge = 0.71 + (valueNoise(px * 0.04, py * 0.04) - 0.5) * 0.08; // 起伏的沙岸线(不死板)
    const isBeach = rNorm > beachEdge && h < 2.2; // 外圈低地 = 沙滩带
    let grassish = false;
    if (h < -0.02) tmp.copy(cUnder);
    else if (isBeach || h < 0.12) tmp.copy(cSand);
    else if (h < 1.0) {
      tmp.copy(cGrass);
      grassish = true;
    } else if (h < 4.5) {
      tmp.copy(cGrass2);
      grassish = true;
    } else {
      tmp.copy(cHill);
      grassish = true;
    }
    if (grassish) {
      // 低频噪声给草地/坡地加明暗斑块,打散平涂的死板;再叠一点高频做草色细颗粒
      const patch = 0.88 + valueNoise(px * 0.05 + 7, py * 0.05 + 7) * 0.24;
      const fine = 0.97 + valueNoise(px * 0.4, py * 0.4) * 0.06;
      tmp.multiplyScalar(patch * fine);
    }
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
    super("SketchEffect", SKETCH_FRAG, { attributes: EffectAttribute.CONVOLUTION });
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
  plant?: boolean; // 一次性种花请求(MoodGarden 消费后置 false)
  action?: boolean; // 一次性交互键(E):车旁上车 / 车上下车(Player 消费后置 false)
}

interface CompanionActionSignal {
  name: CompanionAnimation;
  nonce: number;
}

const WALK_RADIUS = ISLAND_RADIUS * EXS * 0.74; // 可走范围(留出海岸,随大岛自动放大)
const PLAYER_SPEED = 34.0; // 移动速度(手感:加速平滑后这个值像轻快小跑)
const JUMP_V = 11.0; // 起跳初速度
const GRAVITY = 34.0; // 重力加速度(跳跃抛物);跳跃高度 ≈ V²/2g ≈ 1.8 单位
const CAM_DIST = 10.0; // 相机跟在身后的距离
const CAM_HEIGHT = 5.0; // 相机高度

// 模块级临时向量(单 Player 实例,逐帧复用,避开 react-hooks 对组件内值变异的规则)
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// ── 玩家碰撞:把树/房子/地标当成圆柱障碍,玩家撞不进去(不穿模) ──
// 圆形碰撞体 + 空间网格:逐帧只检查玩家所在格子的 3×3 邻域,千余棵树也不掉帧。
type Collider = { x: number; z: number; r: number };
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

// 汽车摆放(出生点正前方一处空地,最近房子 ~8.8 单位、不压房;视觉与碰撞共用同一坐标)
const CAR_POS = { x: 0, z: 14, rot: -0.6 };
const CAR_SCALE = 0.05; // 原生约 98 长 → ~4.9 单位的车
const CAR_Y_OFFSET = 15.47 * CAR_SCALE; // 轮底在原点下 15.47 → 抬起让轮子落地(≈0.77)
const CAR_MAX_SPEED = 30; // 开车速度(比走路快)
const CAR_TURN = 1.9; // 转向速率
// 可开的汽车状态(模块单例:DrivableCar 读、Player 写)。driving 时玩家坐车里、用输入开车
const carState = { x: CAR_POS.x, z: CAR_POS.z, heading: CAR_POS.rot, speed: 0, turn: 0, driving: false };
const sceneEnv = { night: false }; // 夜间标记(ExploreScene 写,DrivableCar 读 → 车灯只在夜里亮)
let carEnterCb: (() => void) | null = null; // 走近车按 E → 弹「选地图」菜单(Player 调,ExploreMode 设)
const _carTmp = new THREE.Vector3();

// 杜鹃花(写实灌木):村里/车旁散几株做花丛;落地偏移 = 1.0(native 底深) * 各自 scale
const RHODOS: { x: number; z: number; s: number }[] = [
  { x: 4, z: 17, s: 1.2 }, { x: -4, z: 17, s: 1.0 }, { x: 7, z: 12, s: 1.3 },
  { x: -6, z: 12, s: 1.05 }, { x: 2.5, z: 21, s: 1.1 }, { x: -9, z: 9, s: 1.15 },
];
// 两座写实大地标(村外开阔空地,周围清树避免穿模);base = native 底在原点下的深度,落地偏移 = base*scale
const BATH = { x: 5.4, z: 51.7, rot: 0.4, scale: 15, base: 0.03, clear: 12 }; // 罗马浴场
const BLOCK = { x: -10.8, z: -50.9, rot: 2.2, scale: 0.28, base: 17.5, clear: 8 }; // 建筑街区

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
  companion: "/models/xy_pet_spirit_lighthouse.glb",
  stonelantern: "/models/xy_item_stonelantern.glb",
  bonfire: "/models/xy_item_bonfire.glb",
  cairn: "/models/xy_item_cairn.glb",
  kite: "/models/xy_item_kite.glb",
  shell: "/models/xy_item_shell.glb",
  nightflower: "/models/xy_item_nightflower.glb",
  avatar: "/models/xy_char_avatar.glb",
  heroChar: "/models/xy_char_protagonist.glb",
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
  natMushroom: "/models/xy_nat_mushroom.glb",
  // 小镇道具(替换程序化点缀)
  townParasol: "/models/xy_town_parasol.glb",
  townTowel: "/models/xy_town_towel.glb",
  townBuoy: "/models/xy_town_buoy.glb",
  townLamppost: "/models/xy_town_lamppost.glb",
  townSignpost: "/models/xy_town_signpost.glb",
  townMailbox: "/models/xy_town_mailbox.glb",
  townBench: "/models/xy_town_bench.glb",
  townCrate: "/models/xy_town_crate.glb",
  townHaystack: "/models/xy_town_haystack.glb",
  qiche: "/models/qiche.glb", // 汽车(Porsche 911 Targa,原生约 98 长 → scale 0.05;轮底在原点下 15.47 → 落地偏移 +0.77)
  rhododendron: "/models/37867525-0d78-4134-9833-96758ac30bac.glb", // 杜鹃花(写实灌木,原生约 2 单位,底在原点下 1.0)
  bathhouse: "/models/80f108c7-cffb-40c7-a80d-1ecfc4507336.glb", // 罗马浴场建筑群(原生约 1 单位扁平,底在原点下 0.03)
  townblock: "/models/688215b008dc48e8a47295ef1211afb6.glb", // 建筑街区(原生约 35×38×42,底在原点下 17.5)
  skyLantern: "/models/kmd.glb", // 天灯(放飞升空)
} as const;
Object.values(MODELS).forEach((u) => useGLTF.preload(u));

// 陪伴精灵:跟随玩家漂浮的小灵兽(强化「情感陪伴」)。保留 glb 原材质(半透+发光),不套 toon。
function Companion({
  posRef,
  action,
  onInteract,
}: {
  posRef: React.RefObject<THREE.Vector3>;
  action: CompanionActionSignal | null;
  onInteract?: () => void;
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
  useFrame((s, dt) => {
    mixer.update(dt);
    const p = posRef.current;
    const g = ref.current;
    if (!p || !g) return;
    const t = s.clock.elapsedTime;
    const k = Math.min(1, dt * 2.5);
    const ty = exGroundY(p.x, p.z) + 1.48 + Math.sin(t * 1.8) * 0.14;
    g.position.x += (p.x + 1.15 - g.position.x) * k;
    g.position.z += (p.z + 1.15 - g.position.z) * k;
    g.position.y += (ty - g.position.y) * Math.min(1, dt * 3.5);
    g.rotation.y = Math.sin(t * 0.5) * 0.35;
    if (lightRef.current) lightRef.current.intensity = 1.25 + Math.sin(t * 2.4) * 0.25;
  });
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
    </group>
  );
}

function companionFallbackAction(name: CompanionAnimation): CompanionAnimation {
  if (name === "TalkListen") return "Worried";
  if (name === "SleepFloat") return "IdleLoop";
  return "Joyful";
}

function normalizeCompanionAnimation(value: string | undefined): CompanionAnimation {
  const allowed: CompanionAnimation[] = ["IdleLoop", "Joyful", "Worried", "FeedTreat", "TalkListen", "BondGlow", "SleepFloat", "SecretTwirl"];
  return allowed.includes(value as CompanionAnimation) ? (value as CompanionAnimation) : "BondGlow";
}

// 轻飘的 glb 道具(风筝等):上下浮 + 轻摆。
function FloatSway({ url, grad, position, scale, amp = 0.4, speed = 1.0, tint }: {
  url: string; grad?: THREE.Texture; position: [number, number, number]; scale?: number; amp?: number; speed?: number; tint?: string;
}) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => toonifyScene(scene, grad, tint), [scene, grad, tint]);
  const ref = useRef<THREE.Group>(null);
  const baseY = position[1];
  useFrame((s) => {
    const g = ref.current; if (!g) return;
    const t = s.clock.elapsedTime;
    g.position.y = baseY + Math.sin(t * speed) * amp;
    g.rotation.z = Math.sin(t * speed * 0.8) * 0.22;
    g.rotation.y = Math.sin(t * speed * 0.5) * 0.18;
  });
  return <group ref={ref} position={position}><primitive object={obj} scale={scale} /></group>;
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

function toonifyScene(src: THREE.Object3D, grad?: THREE.Texture, tint?: string): THREE.Object3D {
  const root = src.clone(true);
  const cache = new Map<THREE.Material, THREE.Material>();
  const conv = (m: THREE.Material): THREE.Material => {
    const hit = cache.get(m);
    if (hit) return hit;
    const std = m as THREE.MeshStandardMaterial;
    const base = std.color ? std.color.clone() : new THREE.Color("#ffffff");
    let out: THREE.Material;
    if (/emissive/i.test(m.name || "")) {
      const lit = std.emissive && (std.emissive.r || std.emissive.g || std.emissive.b);
      const col = tint ? new THREE.Color(tint) : lit ? std.emissive.clone() : base;
      out = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.2, toneMapped: false, transparent: std.transparent, opacity: std.opacity ?? 1 });
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
  tint?: string;
  spin?: { node: string; speed: number }; // 让某个子节点绕自身 Z 轴自转(如风车 Blades)
  raw?: boolean; // 保留 glb 原始写实材质(不 toon 化)——给写实精模用(汽车/植物/建筑)
}) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => (raw ? rawClone(scene) : toonifyScene(scene, grad, tint)), [scene, grad, tint, raw]);
  const spinNode = useMemo(() => (spin ? obj.getObjectByName(spin.node) : undefined), [obj, spin]);
  useFrame((_, delta) => {
    if (spinNode && spin) spinNode.rotateZ(delta * spin.speed);
  });
  return <primitive object={obj} position={position} rotation={rotation} scale={scale} />;
}

// 可开的汽车:读模块级 carState,逐帧更新位置/朝向;toon 材质(传 grad,不再 raw)
function DrivableCar({ grad }: { grad: THREE.Texture }) {
  const g = useRef<THREE.Group>(null);
  const lights = useRef<THREE.Group>(null);
  const roll = useRef(0);
  const clk = useRef(0);
  useFrame((_, dt) => {
    const o = g.current;
    if (!o) return;
    clk.current += dt;
    const bob = carState.driving && Math.abs(carState.speed) > 0.5 ? Math.sin(clk.current * 13) * 0.04 : 0; // 悬挂微颠
    o.position.set(carState.x, exGroundY(carState.x, carState.z) + CAR_Y_OFFSET + bob, carState.z);
    // 顺着地形坡度躺平(exGroundY 有限差分求法线,analytic 无需射线)→ 上下坡不扎进地面;再叠转向侧倾
    const e = 1.6;
    const up = new THREE.Vector3(exGroundY(carState.x - e, carState.z) - exGroundY(carState.x + e, carState.z), 2 * e, exGroundY(carState.x, carState.z - e) - exGroundY(carState.x, carState.z + e)).normalize();
    const fwd = new THREE.Vector3(Math.sin(carState.heading), 0, Math.cos(carState.heading));
    fwd.addScaledVector(up, -fwd.dot(up));
    if (fwd.lengthSq() < 1e-6) fwd.set(Math.sin(carState.heading), 0, Math.cos(carState.heading));
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const tRoll = -carState.turn * 0.13 * Math.max(-1, Math.min(1, carState.speed / 8)); // 转向侧倾(随速度,倒车反向)
    roll.current += (tRoll - roll.current) * Math.min(1, dt * 8);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll.current));
    o.quaternion.slerp(q, Math.min(1, dt * 10));
    if (lights.current) lights.current.visible = carState.driving && sceneEnv.night; // 车头灯:只在夜里亮
  });
  return (
    <group ref={g} position={[carState.x, exGroundY(carState.x, carState.z) + CAR_Y_OFFSET, carState.z]} rotation={[0, carState.heading, 0]}>
      <GltfProp url={MODELS.qiche} grad={grad} position={[0, 0, 0]} scale={CAR_SCALE} />
      <group ref={lights} visible={false}>
        <mesh position={[0.62, 0.62, 2.25]}><sphereGeometry args={[0.16, 8, 6]} /><meshBasicMaterial color="#fff6d8" toneMapped={false} /></mesh>
        <mesh position={[-0.62, 0.62, 2.25]}><sphereGeometry args={[0.16, 8, 6]} /><meshBasicMaterial color="#fff6d8" toneMapped={false} /></mesh>
        <pointLight color="#ffe9c0" intensity={7} distance={16} decay={1.6} position={[0, 0.7, 4.2]} />
      </group>
    </group>
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
function LandmarkOnPad({ cfg, url, padR, padColor, grad }: {
  cfg: { x: number; z: number; rot: number; scale: number; base: number };
  url: string;
  padR: number;
  padColor: string;
  grad: THREE.Texture;
}) {
  const padTop = useMemo(() => {
    let m = exGroundY(cfg.x, cfg.z);
    for (let a = 0; a < 10; a++) {
      const ang = (a / 10) * Math.PI * 2;
      m = Math.max(m, exGroundY(cfg.x + Math.cos(ang) * padR * 0.85, cfg.z + Math.sin(ang) * padR * 0.85));
    }
    return m + 0.05;
  }, [cfg, padR]);
  return (
    <group>
      {/* 地坪(顶面 = padTop,往下 10 单位埋住地形起伏) */}
      <mesh position={[cfg.x, padTop - 5, cfg.z]} receiveShadow>
        <cylinderGeometry args={[padR, padR * 1.06, 10, 40]} />
        <meshToonMaterial color={padColor} gradientMap={grad} />
      </mesh>
      {/* 建筑(底贴地坪顶) */}
      <GltfProp url={url} raw position={[cfg.x, padTop + cfg.base * cfg.scale, cfg.z]} rotation={[0, cfg.rot, 0]} scale={cfg.scale} />
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

// glb 主角「记忆的守护者」:载入精修角色,保留其自带配色 + 海浪贴图(有 map 的材质保图) + Emissive_* 发光。
// 暴露 LegL/LegR/ArmL/ArmR + Cape 节点给 Player 做走/跳摆动 + 披风随动。固定形象(不走「捏人」改色)。
function GltfHero({ legL, legR, armL, armR, cape, faces }: {
  legL?: React.RefObject<THREE.Object3D | null>;
  legR?: React.RefObject<THREE.Object3D | null>;
  armL?: React.RefObject<THREE.Object3D | null>;
  armR?: React.RefObject<THREE.Object3D | null>;
  cape?: React.RefObject<THREE.Object3D | null>;
  faces?: React.RefObject<Record<string, THREE.Object3D> | null>;
}) {
  const { scene } = useGLTF(MODELS.heroChar);
  const grad = useMemo(() => makeToonGradient(), []);
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
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material as THREE.Material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    return c;
  }, [scene, grad]);
  useLayoutEffect(() => {
    if (legL) legL.current = obj.getObjectByName("LegL") ?? null;
    if (legR) legR.current = obj.getObjectByName("LegR") ?? null;
    if (armL) armL.current = obj.getObjectByName("ArmL") ?? null;
    if (armR) armR.current = obj.getObjectByName("ArmR") ?? null;
    if (cape) cape.current = obj.getObjectByName("Cape") ?? null;
    if (faces) {                                                    // 4 套表情节点 → 交给 Player 按状态切显隐
      const map: Record<string, THREE.Object3D> = {};
      for (const [k, nm] of [["cheerful", "Face_Cheerful"], ["calm", "Face_Calm"], ["determined", "Face_Determined"], ["curious", "Face_Curious"]] as const) {
        const n = obj.getObjectByName(nm);
        if (n) { n.visible = k === "cheerful"; map[k] = n; }       // 初始只显开心
      }
      faces.current = map;
    }
  }, [obj, legL, legR, armL, armR, cape, faces]);
  useEffect(() => () => grad.dispose(), [grad]);
  return <primitive object={obj} scale={0.6} rotation={[0, Math.PI, 0]} />;
}

// 可切换主角的种类
type CharKind = "hero" | "pocoyo" | "avatar";
const CHAR_ORDER: CharKind[] = ["hero", "pocoyo", "avatar"];
const CHAR_LABEL: Record<CharKind, string> = { hero: "记忆的守护者", pocoyo: "Pocoyo", avatar: "用捏的人" };

// Pocoyo 的 FBX 转 GLB 后仍保留「头在 -Z、脚在 +Z」的卧倒轴向;Three.js 里 Y 才是站立方向。
// 下面数值来自 Blender/Three 包围盒实测:Z 长 1.0114,旋正后脚底 minY=-0.3367。
const POCOYO_MODEL_SCALE = 1.06;
const POCOYO_FOOT_OFFSET_Y = 0.3367 * POCOYO_MODEL_SCALE;
const POCOYO_UPRIGHT_ROTATION: [number, number, number] = [Math.PI / 2, 0, 0];

// Pocoyo 主角:静态 glb(手臂已在 Blender 烘焙成自然下垂,不再 T-pose)。
// 整体随玩家位移/转向/起伏(Player 的 group 负责走路 bob/前倾/侧倾);自身再加一点待机轻晃,站着也有生气。
function GltfPocoyo() {
  const { scene } = useGLTF(MODELS.pocoyo);
  const obj = useMemo(() => rawClone(scene), [scene]);
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!ref.current) return;
    const t = s.clock.elapsedTime;
    ref.current.position.y = Math.sin(t * 1.9) * 0.02; // 呼吸起伏
    ref.current.rotation.z = Math.sin(t * 1.3) * 0.03; // 轻微左右晃
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

function Player({
  inputRef,
  posRef,
  avatar,
  character,
  expression,
  collidersRef,
  cheerRef,
  nearRef,
  onCar,
}: {
  inputRef: React.RefObject<Input>;
  posRef: React.RefObject<THREE.Vector3>;
  avatar: Avatar;
  character: CharKind;
  expression?: string;
  collidersRef?: React.RefObject<Map<string, Collider[]> | null>;
  cheerRef?: React.RefObject<number>;
  nearRef?: React.RefObject<number>;
  onCar?: (s: "enter" | "exit" | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Object3D>(null);
  const legR = useRef<THREE.Object3D>(null);
  const armL = useRef<THREE.Object3D>(null);
  const armR = useRef<THREE.Object3D>(null);
  const cape = useRef<THREE.Object3D>(null);
  const waveT = useRef(0); // 招手剩余时长
  const baseFacing = useRef(0); // 待机张望基准朝向
  const prevCheer = useRef(0); // 上帧拾取计数(变化 → 欢呼)
  const cheerT = useRef(0); // 欢呼剩余时长
  const facesRef = useRef<Record<string, THREE.Object3D> | null>(null); // 4 套表情节点(GltfHero 填充)
  const idleT = useRef(0); // 连续待机时长(→ 久站坐下 + 平静表情)
  const curiousT = useRef(0); // 好奇表情剩余时长(靠近 NPC 触发)
  const prevNear = useRef(-1); // 上帧最近 NPC(检测靠近边沿)
  const sit = useRef(0); // 坐下程度 0→1
  const lastFace = useRef(""); // 上次生效表情(仅变化时切显隐)
  const ripple = useRef<THREE.Mesh>(null);
  const carPrompt = useRef<"enter" | "exit" | null>(null); // 上/下车提示状态(变化时回调 UI)
  const facing = useRef(0);
  const walkPhase = useRef(0);
  const vel = useRef({ x: 0, z: 0 }); // 当前水平速度(用于加速/减速平滑)
  const vy = useRef(0); // 垂直速度(跳跃)
  const airborne = useRef(false); // 是否腾空
  const sq = useRef(0); // 落地压扁量(衰减)
  const introT = useRef(0); // 开场俯冲运镜进度 0→1
  const { camera } = useThree();

  useFrame((s, dtRaw) => {
    const g = group.current;
    const pos = posRef.current;
    if (!g || !pos) return;
    const dt = Math.min(dtRaw, 0.05);
    const input = inputRef.current ?? { x: 0, y: 0 };

    // ── 开车:E 在车旁上车 / 车上下车 ──
    const carDist = Math.hypot(pos.x - carState.x, pos.z - carState.z);
    if (input.action) {
      input.action = false;
      if (carState.driving) {
        carState.driving = false; carState.speed = 0; carState.turn = 0;
        pos.x = carState.x + Math.cos(carState.heading) * 2.6; // 下车站到车侧
        pos.z = carState.z - Math.sin(carState.heading) * 2.6;
        playSfx("tap"); stopEngine(); // 下车:停引擎
      } else if (carDist < 3.6) {
        carEnterCb?.(); // 走近车按 E → 弹「选地图」菜单(当前岛 / 林间土路);不直接开走
      }
    }
    const prompt = carState.driving ? "exit" : carDist < 3.6 ? "enter" : null;
    if (prompt !== carPrompt.current) { carPrompt.current = prompt; onCar?.(prompt); }
    if (carState.driving) {
      g.visible = false; // 坐进车里,藏起小人
      carState.turn = input.x; // 转向输入(车身侧倾用)
      const targetSpeed = -input.y * CAR_MAX_SPEED;
      carState.speed += (targetSpeed - carState.speed) * (1 - Math.pow(0.04, dt));
      if (Math.abs(carState.speed) > 0.4) { const cf = Math.min(1, Math.abs(carState.speed) / CAR_MAX_SPEED); carState.heading += input.x * (CAR_TURN - cf * 0.9) * dt * (carState.speed >= 0 ? 1 : -1); } // 低速灵活、高速沉稳(像真车)
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
      if (_hit) carState.speed *= 0.5;
      setEngineSpeed(Math.abs(carState.speed) / CAR_MAX_SPEED); // 引擎低鸣随车速
      const cr = Math.hypot(carState.x, carState.z), cmax = WALK_RADIUS * 0.98;
      if (cr > cmax) { carState.x *= cmax / cr; carState.z *= cmax / cr; carState.speed *= 0.3; }
      pos.set(carState.x, exGroundY(carState.x, carState.z), carState.z);
      const cb = 14, cu = 7.5; // 相机跟在车后上方
      _camTarget.set(carState.x - Math.sin(carState.heading) * cb, exGroundY(carState.x, carState.z) + cu, carState.z - Math.cos(carState.heading) * cb);
      camera.position.lerp(_camTarget, Math.min(1, dt * 2.6));
      camera.lookAt(carState.x, exGroundY(carState.x, carState.z) + 1.3, carState.z);
      return; // 跳过走路逻辑
    }
    g.visible = true;

    // 相机相对方向(投影到水平面)
    camera.getWorldDirection(_fwd);
    _fwd.setY(0).normalize();
    _right.crossVectors(_fwd, _up).normalize();
    _move.set(0, 0, 0).addScaledVector(_fwd, -input.y).addScaledVector(_right, input.x);
    const moving = _move.lengthSq() > 0.0001;

    if (moving) {
      _move.normalize();
      facing.current = Math.atan2(_move.x, _move.z);
      baseFacing.current = facing.current;
    } else {
      facing.current = baseFacing.current + Math.sin(s.clock.elapsedTime * 0.4) * 0.15; // 待机时左右缓缓张望
    }

    // 加速/减速平滑(有重量感):速度向目标缓动,而非瞬时
    const tvx = moving ? _move.x * PLAYER_SPEED : 0;
    const tvz = moving ? _move.z * PLAYER_SPEED : 0;
    const accel = 1 - Math.pow(0.0009, dt); // 帧率无关
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

    // 限制在岛上:海湾一侧允许多走出去一点(踏进浅滩),其余按 WALK_RADIUS
    const r = Math.hypot(pos.x, pos.z);
    const maxR = WALK_RADIUS * (1 + 0.16 * bayMask(pos.x, pos.z));
    if (r > maxR) {
      pos.x *= maxR / r;
      pos.z *= maxR / r;
      vel.current.x *= 0.3;
      vel.current.z *= 0.3;
    }

    // 步态相位
    const gait = Math.min(1, speedMag / (PLAYER_SPEED * 0.7));
    walkPhase.current += dt * speedMag * 0.9;

    // 贴地 + 跳跃:陆上随丘陵起伏,浅滩可没到小腿(WADE_FLOOR);腾空时按重力抛物
    const groundY = Math.max(exGroundY(pos.x, pos.z), WADE_FLOOR);
    if (input.jump && !airborne.current) { vy.current = JUMP_V; airborne.current = true; }
    if (input.jump) input.jump = false; // 一次性消费
    if (input.wave) { waveT.current = 1.3; input.wave = false; } // 招手:仅 F 键 / ✋ 按钮触发
    const cc = cheerRef?.current ?? 0;                            // 拾取(计数变化)→ 欢呼
    if (cc !== prevCheer.current) { cheerT.current = 0.85; prevCheer.current = cc; }
    waveT.current = Math.max(0, waveT.current - dt);
    cheerT.current = Math.max(0, cheerT.current - dt);
    const near = nearRef?.current ?? -1;                          // 靠近 NPC(从无到有)→ 好奇表情
    if (near >= 0 && prevNear.current < 0) curiousT.current = 1.6;
    prevNear.current = near; curiousT.current = Math.max(0, curiousT.current - dt);
    const settled = !airborne.current && gait < 0.06 && waveT.current <= 0 && cheerT.current <= 0;
    idleT.current = settled ? idleT.current + dt : 0;             // 连续待机计时
    sit.current += ((idleT.current > 7 ? 1 : 0) - sit.current) * Math.min(1, dt * 2.5); // 久站→坐下(缓入缓出)
    if (airborne.current) {
      vy.current -= GRAVITY * dt;
      pos.y += vy.current * dt;
      if (pos.y <= groundY) { pos.y = groundY; vy.current = 0; airborne.current = false; sq.current = 1; } // 落地触发压扁
    } else {
      pos.y = groundY;
    }
    const wading = !airborne.current && pos.y < 0.02; // 脚在水面以下 = 涉水
    sq.current = Math.max(0, sq.current - dt * 3.5); // 压扁回弹衰减
    const breathe = !airborne.current && gait < 0.12 ? Math.sin(s.clock.elapsedTime * 1.6) * 0.012 : 0; // 待机呼吸起伏
    const bob = airborne.current ? 0 : Math.abs(Math.sin(walkPhase.current)) * 0.05 * gait; // 走路身体微颠
    const cheerHop = cheerT.current > 0 ? Math.sin((1 - cheerT.current / 0.85) * Math.PI) * 0.18 : 0; // 欢呼小跳
    g.position.set(pos.x, pos.y + bob + breathe - sq.current * 0.12 + cheerHop - sit.current * 0.34, pos.z);
    g.scale.set(1 + sq.current * 0.12, 1 - sq.current * 0.2, 1 + sq.current * 0.12); // 落地压扁

    // 朝向(缓转) + 移动前倾 + 转身侧倾
    let dy = facing.current - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * Math.min(1, dt * 9);
    g.rotation.order = "YXZ"; // 朝向(y)→前倾(x)→侧倾(z) 在朝向坐标系内复合
    g.rotation.x += (0.12 * gait - sit.current * 0.12 - g.rotation.x) * Math.min(1, dt * 8); // 移动前倾 / 坐下后仰
    const bank = Math.max(-0.18, Math.min(0.18, dy * 0.5));
    g.rotation.z += (bank - g.rotation.z) * Math.min(1, dt * 6); // 转身侧倾

    // 四肢:先算目标姿态,再阻尼平滑到位(消除直接赋值的僵硬,带自然跟随/缓动)
    const tw = s.clock.elapsedTime;
    let Lx = 0, Rx = 0, ALx: number, ARx: number, ALz = 0;            // 手臂静息略前,不僵直
    if (airborne.current) {
      const up = vy.current > 0 ? 1 : 0.55;
      Lx = -0.5 * up; Rx = -0.75 * up; ALx = -1.3; ARx = -1.3;
    } else if (gait > 0.12) {                                       // 走/跑:速度越快步幅越大
      const sw = Math.sin(walkPhase.current) * (0.5 + 0.32 * gait) * gait;
      Lx = sw; Rx = -sw; ALx = 0.12 - sw * 0.55; ARx = 0.12 + sw * 0.55;
    } else {                                                        // 待机:轻摆 + 每 ~6.5s 抬提灯端详
      const sway = Math.sin(tw * 1.1) * 0.05;
      const gp = tw % 6.5; const lift = gp < 1.6 ? Math.sin((gp / 1.6) * Math.PI) : 0;
      ALx = 0.1 + sway; ARx = 0.1 - sway - lift * 0.95;
    }
    if (sit.current > 0.01) {                                       // 久站坐下:腿前伸 + 手搭膝
      const sv = sit.current;
      Lx = Lx * (1 - sv) + 1.45 * sv; Rx = Rx * (1 - sv) + 1.45 * sv;
      ALx = ALx * (1 - sv) + 0.4 * sv; ARx = ARx * (1 - sv) + 0.4 * sv;
    }
    if (waveT.current > 0) {                                        // 招手(仅 F 键 / ✋ 按钮):举左手缓摆
      const env = Math.max(0, Math.min((1.3 - waveT.current) * 4, waveT.current * 4, 1)); // 缓起0.25s+缓落0.25s
      ALx = -1.45; ALz = Math.sin(tw * 10.5) * 0.42 * env;
    }
    if (cheerT.current > 0) { ALx = -2.3; ARx = -2.3; ALz = 0; }    // 拾取欢呼:双手上举
    const kd = Math.min(1, dt * 13);                                // 阻尼系数(平滑跟随,告别僵硬)
    if (legL.current) legL.current.rotation.x += (Lx - legL.current.rotation.x) * kd;
    if (legR.current) legR.current.rotation.x += (Rx - legR.current.rotation.x) * kd;
    if (armR.current) armR.current.rotation.x += (ARx - armR.current.rotation.x) * kd;
    if (armL.current) {
      armL.current.rotation.x += (ALx - armL.current.rotation.x) * kd;
      armL.current.rotation.z += (ALz - armL.current.rotation.z) * kd;
    }
    if (cape.current) {  // 披风随动:走动后摆 + 腾空上扬 + 轻微待机飘
      const t = s.clock.elapsedTime;
      const fly = airborne.current ? 0.4 : 0;
      cape.current.rotation.x = -0.12 * gait - fly + Math.sin(t * 1.6) * 0.05 + Math.sin(t * 0.6) * 0.03;
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

    // 第三人称跟随相机;开场先来一段从高空侧俯、边降边收到身后的俯冲运镜(约 3.2s)
    const ry = g.rotation.y;
    introT.current = Math.min(1, introT.current + dt / 3.2);
    if (introT.current < 1) {
      const e = introT.current * introT.current * (3 - 2 * introT.current); // smoothstep 缓动
      const ang = ry + (1 - e) * 2.2; // 起始侧偏 → 收束到身后
      const dist = CAM_DIST + (1 - e) * 120; // 起始远
      const ht = CAM_HEIGHT + (1 - e) * 130; // 起始高
      _camTarget.set(pos.x - Math.sin(ang) * dist, pos.y + ht, pos.z - Math.cos(ang) * dist);
      camera.position.lerp(_camTarget, Math.min(1, dt * 3.0));
    } else {
      _camTarget.set(pos.x - Math.sin(ry) * CAM_DIST, pos.y + CAM_HEIGHT, pos.z - Math.cos(ry) * CAM_DIST);
      camera.position.lerp(_camTarget, Math.min(1, dt * 2.4));
    }
    camera.lookAt(pos.x, pos.y + 1.3, pos.z);

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
          <GltfHero legL={legL} legR={legR} armL={armL} armR={armR} cape={cape} faces={facesRef} />
        ) : character === "pocoyo" ? (
          <GltfPocoyo />
        ) : (
          <GltfAvatar avatar={avatar} legL={legL} legR={legR} armL={armL} armR={armR} />
        )}
      </group>
      {/* 涉水涟漪(贴水面,世界坐标,跟随脚下) */}
      <mesh ref={ripple} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.5, 0.72, 24]} />
        <meshBasicMaterial color="#e6f6f8" transparent opacity={0.5} depthWrite={false} />
      </mesh>
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
    const out: { x: number; z: number }[] = [];
    let tries = 0;
    while (out.length < total && tries < total * 30) {
      tries += 1;
      const ang = hash2(tries * 1.3, 7.7) * Math.PI * 2;
      const rad = (0.25 + hash2(tries * 2.1, 3.3) * 0.6) * WALK_RADIUS;
      out.push({ x: Math.cos(ang) * rad, z: Math.sin(ang) * rad });
    }
    return out;
  }, [total]);

  useFrame((state) => {
    const pos = posRef.current;
    if (!pos) return;
    spots.forEach((s, i) => {
      if (taken.current[i]) return;
      const g = refs.current[i];
      if (g) {
        g.position.y = exGroundY(s.x, s.z) + 0.55 + Math.sin(state.clock.elapsedTime * 2 + i) * 0.08;
        g.rotation.y += 0.02;
      }
      if (Math.hypot(pos.x - s.x, pos.z - s.z) < 0.6) {
        taken.current[i] = true;
        if (g) g.visible = false;
        onCollect();
      }
    });
  });

  return (
    <>
      {spots.map((s, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[s.x, exGroundY(s.x, s.z) + 0.55, s.z]}
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
function MemoryImprints({ posRef, imprints, onPick }: { posRef: React.RefObject<THREE.Vector3>; imprints: Imprint[]; onPick: (i: number) => void }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const taken = useRef<boolean[]>(imprints.map(() => false));
  const spots = useMemo(
    () =>
      imprints.map((_, i) => {
        const ang = hash2(i * 1.7 + 13, 7.7) * Math.PI * 2;
        const rad = (0.3 + hash2(i * 2.3 + 5, 3.3) * 0.55) * WALK_RADIUS;
        return { x: Math.cos(ang) * rad, z: Math.sin(ang) * rad };
      }),
    [imprints],
  );
  const mats = useMemo(() => imprints.map((im) => new THREE.MeshStandardMaterial({ color: im.color, emissive: im.color, emissiveIntensity: 1.4, toneMapped: false })), [imprints]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  // 印记按情绪取不同形状(呼应需求文档的「光点/贝壳/星/花/雨滴」)
  const geos = useMemo(
    () => ({
      star: new THREE.OctahedronGeometry(0.26, 0), // 星/光点
      shell: new THREE.ConeGeometry(0.24, 0.34, 7), // 贝壳
      flower: new THREE.IcosahedronGeometry(0.24, 0), // 花苞
      spark: new THREE.TetrahedronGeometry(0.3, 0), // 火花(尖)
      drop: new THREE.SphereGeometry(0.2, 12, 12), // 雨滴/水珠
    }),
    [],
  );
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
  const shapeOf = (e: string): "star" | "shell" | "flower" | "spark" | "drop" =>
    e === "happy" ? "star" : e === "calm" ? "shell" : e === "lonely" ? "flower" : e === "angry" ? "spark" : "drop";
  useFrame((state) => {
    const pos = posRef.current;
    if (!pos) return;
    spots.forEach((s, i) => {
      if (taken.current[i]) return;
      const g = refs.current[i];
      if (g) {
        g.position.y = exGroundY(s.x, s.z) + 0.7 + Math.sin(state.clock.elapsedTime * 1.6 + i) * 0.12;
        g.rotation.y += 0.015;
      }
      if (Math.hypot(pos.x - s.x, pos.z - s.z) < 2.6) {
        taken.current[i] = true;
        if (g) g.visible = false;
        onPick(i);
      }
    });
  });
  return (
    <>
      {spots.map((s, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }} position={[s.x, exGroundY(s.x, s.z) + 0.7, s.z]}>
          <mesh geometry={geos[shapeOf(imprints[i].emotion)]} material={mats[i]} />
          <pointLight color={imprints[i].color} intensity={2.4} distance={3} decay={1.6} />
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
  const trunkMat = useMemo(() => new THREE.MeshToonMaterial({ color: "#6a533c", gradientMap: grad }), [grad]);
  const orbMats = useMemo(() => colors.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.5, toneMapped: false })), [colors]);
  useEffect(() => () => { grad.dispose(); trunkMat.dispose(); orbMats.forEach((m) => m.dispose()); }, [grad, trunkMat, orbMats]);
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
      <mesh material={trunkMat} position={[0, 1.55, 0]}>
        <cylinderGeometry args={[0.18, 0.34, 3.1, 7]} />
        <Outlines thickness={0.02} color="#1a2230" />
      </mesh>
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
function Town({ toonGrad, accent, collidersRef }: { toonGrad: THREE.Texture; accent: string; collidersRef?: React.RefObject<Map<string, Collider[]> | null> }) {
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
  const crop = useMemo(() => new THREE.MeshToonMaterial({ color: "#7fa84a", gradientMap: toonGrad }), [toonGrad]);
  const hay = useMemo(() => new THREE.MeshToonMaterial({ color: "#d8b86a", gradientMap: toonGrad }), [toonGrad]);
  const shell = useMemo(() => new THREE.MeshToonMaterial({ color: "#f0e0cf", gradientMap: toonGrad }), [toonGrad]);
  const towelMats = useMemo(
    () => ["#e07a86", "#5fa9c4", "#e6c45f", "#7bb37a", "#b69ad8", "#e89ab0"].map((c) => new THREE.MeshToonMaterial({ color: c, gradientMap: toonGrad })),
    [toonGrad],
  );
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffe6a0", emissive: "#ffe6a0", emissiveIntensity: 2, toneMapped: false }), []);
  useEffect(
    () => () => [wall, wall2, wall3, roof, roof2, roof3, wood, trunk, leaf, leaf2, pine, bush, dark, stone, red, sign, petal, petal2, rock, pond, crop, hay, glow].forEach((m) => m.dispose()),
    [wall, wall2, wall3, roof, roof2, roof3, wood, trunk, leaf, leaf2, pine, bush, dark, stone, red, sign, petal, petal2, rock, pond, crop, hay, glow],
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
    // 这是岛,不是城市:房子聚成一个中央村落,其余大片留给自然。小而矮的尖顶小屋。
    const VILLAGE = 26; // 中央村落
    const cluster = Math.min(34, WALK_RADIUS * 0.2);
    for (let i = 0; i < VILLAGE; i++) {
      const a = hash2(i, 1.1) * Math.PI * 2;
      const r = 4 + Math.sqrt(hash2(i, 2.2)) * cluster;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
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
    for (let i = 0; i < 1400; i++) {
      const a = hash2(i + 20, 5.5) * Math.PI * 2;
      const r = 2 + Math.sqrt(hash2(i + 20, 8.8)) * (WALK_RADIUS * 0.95 - 2);
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.6 + hash2(i + 20, 1.4) * 0.6 });
    }
    return out;
  }, []);

  // 主路 + 一条支路(逐块贴地,横跨大岛)
  const pathTiles = useMemo(() => {
    const out: { x: number; z: number; rot: number }[] = [];
    const L = WALK_RADIUS * 0.92;
    const M = 96;
    for (let i = 0; i < M; i++) {
      const t = i / (M - 1);
      out.push({ x: (t - 0.5) * 2 * L, z: Math.sin(t * Math.PI * 1.4) * L * 0.32, rot: Math.cos(t * Math.PI * 1.4) * 0.5 });
    }
    const B = 22;
    for (let i = 0; i < B; i++) {
      const t = i / (B - 1);
      out.push({ x: Math.sin(t * Math.PI) * 2.0 - 1.0, z: (t - 0.5) * 2 * (L * 0.7), rot: Math.PI / 2 + Math.cos(t * Math.PI) * 0.4 });
    }
    return out;
  }, []);

  // 护栏:大岛缘一整圈
  const fence = useMemo(() => {
    const out: { x: number; z: number; rot: number }[] = [];
    const fr = WALK_RADIUS + 0.6;
    const n = Math.round((2 * Math.PI * fr) / 1.6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push({ x: Math.cos(a) * fr, z: Math.sin(a) * fr, rot: a });
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
      out.push({ x: (t - 0.5) * 2 * L, z: Math.sin(t * Math.PI * 1.4) * L * 0.32 + 2.2 });
    }
    return out;
  }, []);

  // 电线(逐段:中点 + 长度 + 朝向四元数)
  const wires = useMemo(() => {
    const out: { pos: [number, number, number]; len: number; quat: [number, number, number, number] }[] = [];
    for (let i = 0; i < poleSpots.length - 1; i++) {
      const a = poleSpots[i];
      const b = poleSpots[i + 1];
      const ay = exGroundY(a.x, a.z) + 2.3;
      const by = exGroundY(b.x, b.z) + 2.3;
      const dx = b.x - a.x;
      const dy = by - ay;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dy, dz);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
      out.push({ pos: [(a.x + b.x) / 2, (ay + by) / 2, (a.z + b.z) / 2], len, quat: [q.x, q.y, q.z, q.w] });
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
      out.push({ x: (t - 0.5) * 2 * L, z: Math.sin(t * Math.PI * 1.4) * L * 0.32 - 2.0 });
    }
    return out;
  }, []);

  const dashes = useMemo(() => pathTiles.filter((_, i) => i % 2 === 0), [pathTiles]);

  const flowers = useMemo(() => {
    const out: { x: number; z: number; c: number }[] = [];
    for (let i = 0; i < 2800; i++) {
      const a = hash2(i + 40, 2.1) * Math.PI * 2;
      const r = 1.5 + Math.sqrt(hash2(i + 40, 6.3)) * (WALK_RADIUS * 0.95 - 1.5);
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, c: i % 2 });
    }
    return out;
  }, []);

  const trees = useMemo(() => {
    const out: { x: number; z: number; s: number; pineKind: boolean; warm: boolean }[] = [];
    for (let i = 0; i < 1800; i++) {
      const a = hash2(i + 1, 3.3) * Math.PI * 2;
      const r = 2.2 + Math.sqrt(hash2(i + 1, 7.1)) * (WALK_RADIUS * 0.95 - 2.2);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // 清出两座大地标周围的树(否则树会穿过浴场/街区)
      if (Math.hypot(x - BATH.x, z - BATH.z) < BATH.clear) continue;
      if (Math.hypot(x - BLOCK.x, z - BLOCK.z) < BLOCK.clear) continue;
      out.push({
        x,
        z,
        s: 0.9 + hash2(i + 1, 2.2) * 0.7,
        pineKind: hash2(i + 1, 8.8) < 0.32, // ~1/3 针叶林
        warm: hash2(i + 1, 4.5) > 0.62, // 部分阔叶偏暖绿,做色彩层次
      });
    }
    return out;
  }, []);
  // 障碍碰撞体:树(整株)+ 房子(占地)+ 大地标 → 空间网格,交给 Player 逐帧解算(玩家撞不进去)
  useEffect(() => {
    if (!collidersRef) return;
    const list: Collider[] = [];
    for (const t of trees) list.push({ x: t.x, z: t.z, r: 0.5 + t.s * 0.12 }); // 树:树干 + 下层树冠
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
    // 浴场 / 街区:用几个大圆填满占地(玩家从外面绕,不穿墙;半径 < COL_CELL 6 保证网格命中)
    for (const dx of [-4, 4]) for (const dz of [-5, 5]) list.push({ x: BATH.x + dx, z: BATH.z + dz, r: 4.5 });
    for (const dx of [-2.6, 2.6]) for (const dz of [-2.6, 2.6]) list.push({ x: BLOCK.x + dx, z: BLOCK.z + dz, r: 3.6 });
    // 近海可达地形(车/人会撞到):梯田 / 海蚀洞 / 崖 / 草棚 + 5 根风铃柱(坐标须与 Coastline/WindChimes 一致)
    const cox = Math.cos(BAY_ANGLE) * WALK_RADIUS * 0.92, coz = Math.sin(BAY_ANGLE) * WALK_RADIUS * 0.92;
    list.push(
      { x: Math.cos(2.0) * WALK_RADIUS * 0.4, z: Math.sin(2.0) * WALK_RADIUS * 0.4, r: 1.6 }, // 梯田
      { x: Math.cos(-1.2) * WALK_RADIUS * 0.97, z: Math.sin(-1.2) * WALK_RADIUS * 0.97, r: 1.8 }, // 海蚀洞
      { x: Math.cos(5.5) * WALK_RADIUS * 0.985, z: Math.sin(5.5) * WALK_RADIUS * 0.985, r: 2.0 }, // 崖
      { x: cox - 5.5, z: coz - 2, r: 1.3 }, // 草棚 tikihut
    );
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.7, rr = WALK_RADIUS * (0.42 + (i % 2) * 0.16); list.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, r: 0.5 }); } // 风铃柱
    collidersRef.current = buildColliderGrid(list);
  }, [trees, buildings, collidersRef]);

  const mushrooms = useMemo(() => {
    const out: { x: number; z: number; s: number; red: boolean }[] = [];
    for (let i = 0; i < 150; i++) {
      const a = hash2(i + 510, 1.7) * Math.PI * 2;
      const r = 4 + Math.sqrt(hash2(i + 510, 3.1)) * (WALK_RADIUS * 0.9 - 4);
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.7 + hash2(i + 510, 5.2) * 0.7, red: hash2(i + 510, 6.4) > 0.45 });
    }
    return out;
  }, []);

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
  const gCrop = useMemo(() => new THREE.BoxGeometry(0.16, 0.55, 0.16), []);
  const gHay = useMemo(() => new THREE.CylinderGeometry(0.5, 0.5, 0.7, 8), []);
  const gShell = useMemo(() => new THREE.ConeGeometry(0.14, 0.1, 7), []); // 沙滩贝壳/卵石
  const gPine = useMemo(() => new THREE.ConeGeometry(0.5, 0.95, 7), []); // 针叶树冠(分层堆叠)
  const gMushStem = useMemo(() => new THREE.CylinderGeometry(0.04, 0.055, 0.18, 6), []);
  const gMushCap = useMemo(() => new THREE.SphereGeometry(0.13, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), []); // 蘑菇伞盖(半球)
  const gLily = useMemo(() => new THREE.CircleGeometry(0.42, 9), []); // 荷叶
  useEffect(
    () => () => [gTrunk, gLeaf, gBush, gFlower, gRock, gBuoy, gFencePost, gFenceRail, gPathTile, gDash, gUnitBox, gRoofPeak, gDoor, gWindow, gCrop, gHay, gPine, gMushStem, gMushCap, gLily].forEach((g) => g.dispose()),
    [gTrunk, gLeaf, gBush, gFlower, gRock, gBuoy, gFencePost, gFenceRail, gPathTile, gDash, gUnitBox, gRoofPeak, gDoor, gWindow, gCrop, gHay, gPine, gMushStem, gMushCap, gLily],
  );

  // 实例化布点(由散布数组换算到世界矩阵)
  // 整株 glb 的实例布点(基座落地 exGroundY;glb 自带树干/树冠/各部件)
  const broadItems = useMemo(() => trees.filter((t) => !t.pineKind).map((t) => ({ p: [t.x, exGroundY(t.x, t.z), t.z] as [number, number, number], s: t.s, r: [0, hash2(t.x + 9, 5.1) * 6.28, 0] as [number, number, number] })), [trees]);
  const pineItems = useMemo(() => trees.filter((t) => t.pineKind).map((t) => ({ p: [t.x, exGroundY(t.x, t.z), t.z] as [number, number, number], s: t.s, r: [0, hash2(t.z + 9, 5.1) * 6.28, 0] as [number, number, number] })), [trees]);
  const mushItems = useMemo(() => mushrooms.map((mu) => ({ p: [mu.x, exGroundY(mu.x, mu.z), mu.z] as [number, number, number], s: mu.s })), [mushrooms]);
  const bushItems = useMemo(() => bushes.map((b) => ({ p: [b.x, exGroundY(b.x, b.z), b.z] as [number, number, number], s: b.s })), [bushes]);
  const flowerItems = useMemo(() => flowers.map((f) => ({ p: [f.x, exGroundY(f.x, f.z), f.z] as [number, number, number], s: 1 })), [flowers]);
  const rockItems = useMemo(() => rocks.map((r) => ({ p: [r.x, -0.1, r.z] as [number, number, number], s: r.s, r: [0, r.ry, 0] as [number, number, number] })), [rocks]);
  // glb 自然/道具几何:取出几何+材质组,喂 InstancedMesh(整株批量绘制,不掉帧)。modelScale 由实测 glb 高度对齐旧程序化尺寸。
  const { scene: pineScene } = useGLTF(MODELS.natPine);
  const { scene: broadScene } = useGLTF(MODELS.natBroad);
  const { scene: bushScene } = useGLTF(MODELS.natBush);
  const { scene: flowerScene } = useGLTF(MODELS.natFlowers);
  const { scene: rockScene } = useGLTF(MODELS.natRock);
  const { scene: mushScene } = useGLTF(MODELS.natMushroom);
  const { scene: buoyScene } = useGLTF(MODELS.townBuoy);
  const { scene: hayScene } = useGLTF(MODELS.townHaystack);
  const pineG = useMemo(() => glbInstanceGeo(pineScene, toonGrad, 0.55), [pineScene, toonGrad]);
  const broadG = useMemo(() => glbInstanceGeo(broadScene, toonGrad, 0.6), [broadScene, toonGrad]);
  const bushG = useMemo(() => glbInstanceGeo(bushScene, toonGrad, 0.5), [bushScene, toonGrad]);
  const flowerG = useMemo(() => glbInstanceGeo(flowerScene, toonGrad, 0.5), [flowerScene, toonGrad]);
  const rockG = useMemo(() => glbInstanceGeo(rockScene, toonGrad, 0.5), [rockScene, toonGrad]);
  const mushG = useMemo(() => glbInstanceGeo(mushScene, toonGrad, 0.9), [mushScene, toonGrad]);
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
  const parasols = useMemo(() => {
    const out: { x: number; z: number; c: number }[] = [];
    const beachA = 0.55; // 海湾中心方位(东南)
    for (let i = 0; i < 9; i++) {
      const a = beachA + (hash2(i + 80, 1.7) - 0.5) * 0.4;
      const r = WALK_RADIUS * (0.99 + hash2(i + 80, 2.4) * 0.06);
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, c: i % 2 });
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 2.3;
      const r = WALK_RADIUS * 1.02;
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, c: (i + 1) % 2 });
    }
    return out;
  }, []);
  // 沙滩浴巾:海湾里铺一片(平躺,随机朝向)
  const towels = useMemo(() => {
    const out: { p: [number, number, number]; r: [number, number, number]; c: number }[] = [];
    const beachA = 0.55;
    for (let i = 0; i < 8; i++) {
      const a = beachA + (hash2(i + 90, 5.1) - 0.5) * 0.45;
      const r = WALK_RADIUS * (0.97 + hash2(i + 90, 6.2) * 0.06);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      out.push({ p: [x, Math.max(exGroundY(x, z), 0.05) + 0.03, z], r: [0, hash2(i + 90, 7.3) * Math.PI, 0], c: i % towelMats.length });
    }
    return out;
  }, [towelMats]);
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
  const pathItems = useMemo(() => pathTiles.map((p) => ({ p: [p.x, exGroundY(p.x, p.z) + 0.02, p.z] as [number, number, number], s: 1, r: [-Math.PI / 2, 0, p.rot] as [number, number, number] })), [pathTiles]);
  const dashItems = useMemo(() => dashes.map((p) => ({ p: [p.x, exGroundY(p.x, p.z) + 0.05, p.z] as [number, number, number], s: 1, r: [-Math.PI / 2, 0, p.rot] as [number, number, number] })), [dashes]);

  // 房子:用 glb 模型替换旧程序化方块屋(循环 7 种民居款,朝向村心,缩放由旧「体宽」派生)。
  // 灯塔看守屋不进循环(它专属灯塔旁,在 Village 里单独摆)。
  const houseProps = useMemo(() => {
    const models = [MODELS.houseCottage, MODELS.houseMachiya, MODELS.houseLoft, MODELS.houseShop, MODELS.houseCafe, MODELS.houseRound, MODELS.houseVilla];
    return buildings.map((b, i) => ({
      url: models[i % models.length],
      p: [b.x, exGroundY(b.x, b.z), b.z] as [number, number, number],
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
          out.push({ p: [wx, exGroundY(wx, wz) + 0.27, wz], r: [0, f.rot, 0] });
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
        out.push({ p: [wx, exGroundY(wx, wz), wz], s: 0.8 + hash2(k, 3.1) * 0.5 });
      }
    }
    return out;
  }, [farms]);

  return (
    <group>
      {/* 房子(glb,替换旧程序化方块屋;26 村落 + 16 散布,循环 7 种民居款) */}
      {houseProps.map((h, i) => (
        <GltfProp key={`house${i}`} url={h.url} grad={toonGrad} position={h.p} rotation={h.r} scale={h.s} />
      ))}

      {/* 路面方砖(实例化) */}
      <InstancedField geo={gPathTile} material={stone} items={pathItems} />

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
          <pointLight position={[0, 2.6, 0]} color="#ffe6a0" intensity={2.4} distance={4.5} decay={1.6} />
        </group>
      ))}
      {/* 售货机(glb) */}
      <GltfProp url={MODELS.vending} grad={toonGrad} position={[-4.0, exGroundY(-4.0, 0.6), 0.6]} rotation={[0, 0.8, 0]} scale={0.7} />

      {/* 电线杆 */}
      {poleSpots.map((p, i) => (
        <group key={i} position={[p.x, exGroundY(p.x, p.z), p.z]}>
          <mesh material={dark} position={[0, 1.15, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 2.3, 6]} />
          </mesh>
          <mesh material={dark} position={[0, 2.1, 0]}>
            <boxGeometry args={[0.9, 0.07, 0.07]} />
          </mesh>
          <mesh material={dark} position={[0, 1.85, 0]}>
            <boxGeometry args={[0.7, 0.07, 0.07]} />
          </mesh>
        </group>
      ))}

      {/* 电线 */}
      {wires.map((w, i) => (
        <mesh key={i} material={dark} position={w.pos} quaternion={w.quat}>
          <cylinderGeometry args={[0.02, 0.02, w.len, 4]} />
        </mesh>
      ))}

      {/* 路灯排(glb + 暖光) */}
      {lampRow.map((p, i) => (
        <group key={i} position={[p.x, exGroundY(p.x, p.z), p.z]}>
          <GltfProp url={MODELS.townLamppost} grad={toonGrad} position={[0, 0, 0]} scale={0.95} />
          <pointLight position={[0, 2.5, 0]} color="#ffe6a0" intensity={2} distance={4} decay={1.6} />
        </group>
      ))}

      {/* 路面中线虚线(实例化) */}
      <InstancedField geo={gDash} material={wall} items={dashItems} />

      {/* 鸟居(glb,主路尽头的入口地标,跨在路上) */}
      <GltfProp url={MODELS.torii} grad={toonGrad} position={[-WALK_RADIUS * 0.9, exGroundY(-WALK_RADIUS * 0.9, 0), 0]} rotation={[0, Math.PI / 2, 0]} scale={0.78} />

      {/* 小花(glb 花丛) */}
      {flowerG && <InstancedField geo={flowerG.geometry} material={flowerG.material} items={flowerItems} />}

      {/* 农田作物(程序化保留) + 干草垛(glb) */}
      <InstancedField geo={gCrop} material={crop} items={cropItems} />
      {hayG && <InstancedField geo={hayG.geometry} material={hayG.material} items={hayItems} />}

      {/* 中央广场(铺石) */}
      <mesh material={stone} position={[0, exGroundY(0, 0) + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4.5, 32]} />
      </mesh>

      {/* 木栈桥(glb,从大岛东岸伸进海里;原点在陆端,+Z 朝海 → 转 +90° 朝 +X) */}
      <GltfProp url={MODELS.pier} grad={toonGrad} position={[WALK_RADIUS - 1.5, -0.35, 0]} rotation={[0, Math.PI / 2, 0]} scale={0.5} />

      {/* 浅滩礁石(glb) */}
      {rockG && <InstancedField geo={rockG.geometry} material={rockG.material} items={rockItems} />}

      {/* 小神社(glb,岛上地标) */}
      <GltfProp url={MODELS.shrine} grad={toonGrad} position={[7, exGroundY(7, -7), -7]} rotation={[0, 0.5, 0]} scale={0.8} />

      {/* 灯塔(glb,呼应心屿灯塔) */}
      <group position={[-WALK_RADIUS * 0.92, exGroundY(-WALK_RADIUS * 0.92, -WALK_RADIUS * 0.3), -WALK_RADIUS * 0.3]}>
        <GltfProp url={MODELS.lighthouse} grad={toonGrad} position={[0, 0, 0]} scale={0.6} />
        <pointLight position={[0, 9.6, 0]} color="#ffeec0" intensity={8} distance={22} decay={1.3} />
      </group>

      {/* 小船(glb,停泊在东岸) */}
      {boats.map((b, i) => (
        <GltfProp key={i} url={MODELS.boat} grad={toonGrad} position={[b.x, 0.2, b.z]} rotation={[0, b.rot, 0]} scale={0.42} />
      ))}

      {/* 浮标(glb,水里漂) */}
      {buoyG && <InstancedField geo={buoyG.geometry} material={buoyG.material} items={buoyItems} />}

      {/* 沙滩遮阳伞(glb) */}
      {parasols.map((p, i) => (
        <GltfProp key={i} url={MODELS.townParasol} grad={toonGrad} position={[p.x, Math.max(exGroundY(p.x, p.z), 0.05), p.z]} rotation={[0, hash2(p.x, 3.3) * 6.28, 0]} scale={1.0} />
      ))}

      {/* 沙滩浴巾(glb) */}
      {towels.map((t, i) => (
        <GltfProp key={i} url={MODELS.townTowel} grad={toonGrad} position={t.p} rotation={t.r} scale={1.0} />
      ))}

      {/* 贝壳 / 卵石(实例化,沿岸沙地) */}
      <InstancedField geo={gShell} material={shell} items={shellItems} />

      {/* 风车(glb,岛屿地标;叶片 Blades 节点缓缓自转) */}
      <GltfProp url={MODELS.windmill} grad={toonGrad} position={[-WALK_RADIUS * 0.35, exGroundY(-WALK_RADIUS * 0.35, WALK_RADIUS * 0.45), WALK_RADIUS * 0.45]} scale={0.78} spin={{ node: "Blades", speed: -0.9 }} />

      {/* 汽车(glb,村里停一辆;toon 卡通 + 可上车驾驶) */}
      <DrivableCar grad={toonGrad} />
      <TireDust />

      {/* 杜鹃花(写实灌木,花丛点缀) */}
      {RHODOS.map((r, i) => (
        <GltfProp key={`rh${i}`} url={MODELS.rhododendron} raw position={[r.x, exGroundY(r.x, r.z) + 1.0 * r.s, r.z]} rotation={[0, hash2(r.x + 2.3, 3.1) * 6.28, 0]} scale={r.s} />
      ))}

      {/* 罗马浴场建筑群(写实地标,村北;地坪平整落地) */}
      <LandmarkOnPad cfg={BATH} url={MODELS.bathhouse} padR={10} padColor="#cabfa6" grad={toonGrad} />

      {/* 建筑街区(写实地标,村南;地坪平整落地) */}
      <LandmarkOnPad cfg={BLOCK} url={MODELS.townblock} padR={7.5} padColor="#b6a98f" grad={toonGrad} />

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

      {/* 石灯笼(glb,岛上石径) */}
      {([[7, -13], [13, -6], [-9, 11], [11, 9]] as const).map(([lx, lz], i) => (
        <group key={`lan${i}`} position={[lx, exGroundY(lx, lz), lz]}>
          <GltfProp url={MODELS.stonelantern} grad={toonGrad} position={[0, 0, 0]} scale={0.8} />
          <pointLight position={[0, 0.85, 0]} color="#ffdf9b" intensity={2.2} distance={5} decay={1.7} />
        </group>
      ))}
      {/* 仪式艺术品散布岛上(对应岛屿仪式 ARTIFACTS) */}
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
      <FloatSway url={MODELS.kite} grad={toonGrad} position={[-WALK_RADIUS * 0.35 + 6, exGroundY(-WALK_RADIUS * 0.35, WALK_RADIUS * 0.45) + 7, WALK_RADIUS * 0.45 - 3]} scale={1.4} amp={0.5} speed={0.9} />
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
    let nd = TALK_RANGE;
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
        const dist = Math.hypot(pp.x - wx, pp.z - wz);
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
          <CharacterModel avatar={n.avatar} />
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
    if (pp && !foundRef.current && Math.hypot(pp.x - lookX, pp.z - lookZ) < 7.5) {
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
      if (pp && !foundRef.current[i] && Math.hypot(pp.x - sp.x, pp.z - sp.z) < 4.2) {
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
      const h = exGroundY(x, z);
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
  const coveX = Math.cos(BAY_ANGLE) * WALK_RADIUS * 0.9, coveZ = Math.sin(BAY_ANGLE) * WALK_RADIUS * 0.9;
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
      {/* 海湾吊床(两柱之间,微浮) */}
      <GltfProp url={MODELS.isleHammock} grad={toonGrad} position={[coveX - 4, Math.max(exGroundY(coveX - 4, coveZ - 2), 0.1) + 0.3, coveZ - 2]} rotation={[0, BAY_ANGLE, 0]} scale={0.9} />
    </group>
  );
}

// 海岸线:近海地形(海蚀拱/礁柱/浮岛/崖/穴/梯田/石阶) + 海湾沙滩物 + 发光海水(染场景 accent,随浪浮动)。
function Coastline({ toonGrad, accent }: { toonGrad: THREE.Texture; accent: string }) {
  const off = (a: number, r: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];
  const face = (x: number, z: number): [number, number, number] => [0, Math.atan2(x, z), 0];
  const coveX = Math.cos(BAY_ANGLE) * WALK_RADIUS * 0.92, coveZ = Math.sin(BAY_ANGLE) * WALK_RADIUS * 0.92;
  const cove = (dx: number, dz: number): [number, number, number] => [coveX + dx, Math.max(exGroundY(coveX + dx, coveZ + dz), 0.04) + 0.02, coveZ + dz];
  const [arX, arZ] = off(4.2, WALK_RADIUS + 30);
  const [ssX, ssZ] = off(5.2, WALK_RADIUS + 24);
  const [isX, isZ] = off(3.0, WALK_RADIUS + 95);
  const [clX, clZ] = off(5.5, WALK_RADIUS * 0.985);
  const [cvX, cvZ] = off(-1.2, WALK_RADIUS * 0.97);
  const [teX, teZ] = off(2.0, WALK_RADIUS * 0.4);
  const [wvX, wvZ] = off(BAY_ANGLE, WALK_RADIUS * 1.0);
  const [spX, spZ] = off(5.2, WALK_RADIUS + 19);
  const beach: { url: string; dx: number; dz: number; s: number; rot?: number }[] = [
    { url: MODELS.beachTidepool, dx: -3, dz: 2, s: 0.8 },
    { url: MODELS.beachStarfish, dx: 2, dz: -1, s: 0.8 },
    { url: MODELS.beachDriftwood, dx: -1, dz: -3, s: 0.9 },
    { url: MODELS.beachSandcastle, dx: 1.5, dz: 1, s: 0.8 },
    { url: MODELS.beachCoral, dx: 3.5, dz: 2.5, s: 0.7 },
    { url: MODELS.beachDeckchair, dx: -2, dz: 0, s: 0.85, rot: BAY_ANGLE + Math.PI },
    { url: MODELS.beachSurfboard, dx: 0, dz: 2.4, s: 0.9 },
    { url: MODELS.beachTikihut, dx: -5.5, dz: -2, s: 1.0 },
    { url: MODELS.beachDunegrass, dx: 4, dz: -2.5, s: 1.0 },
    { url: MODELS.beachBall, dx: 1.6, dz: -2, s: 0.8 },
  ];
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
      {/* 海湾沙滩物 */}
      {beach.map((b, i) => (
        <GltfProp key={`b${i}`} url={b.url} grad={toonGrad} position={cove(b.dx, b.dz)} rotation={[0, b.rot ?? i * 1.3, 0]} scale={b.s} />
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
const LANTERN_SCALE = 2.0; // kmd.glb 天灯缩放(glb 内含 0.305 node scale → 实际约 1.2 单位高)
function RisingLantern({ x, z, onDone }: { x: number; z: number; onDone: () => void }) {
  const { scene } = useGLTF(MODELS.skyLantern);
  const g = useRef<THREE.Group>(null);
  const t = useRef(0);
  const done = useRef(false);
  const y0 = useMemo(() => exGroundY(x, z) + 1.3, [x, z]);
  // 克隆 glb + 复制材质(每盏独立淡出),并叠暖色自发光让它像点亮的纸灯
  const obj = useMemo(() => {
    const c = scene.clone(true);
    const mats: THREE.MeshStandardMaterial[] = [];
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const nm = (m.material as THREE.MeshStandardMaterial).clone();
      nm.transparent = true; nm.emissive = new THREE.Color("#ffc070"); nm.emissiveIntensity = 1.6; nm.toneMapped = false;
      m.material = nm; mats.push(nm);
    });
    return { c, mats };
  }, [scene]);
  useEffect(() => () => obj.mats.forEach((m) => m.dispose()), [obj]);
  useFrame((_, dt) => {
    t.current += dt; const tt = t.current; const go = g.current; if (!go) return;
    go.position.set(x + Math.sin(tt * 0.5) * (0.5 + tt * 0.06), y0 + Math.min(tt * 2.6, 80), z + Math.cos(tt * 0.42) * (0.45 + tt * 0.05));
    go.rotation.y = tt * 0.3;
    const fade = tt < 1 ? tt : Math.max(0, 1 - (tt - 9) / 4.5);
    const f = Math.max(0, Math.min(1, fade));
    obj.mats.forEach((m) => { m.opacity = f; m.emissiveIntensity = 1.6 * Math.max(0.15, f); });
    if (tt > 13.5 && !done.current) { done.current = true; onDone(); }
  });
  return (
    <group ref={g}>
      <primitive object={obj.c} scale={LANTERN_SCALE} />
      <pointLight color="#ffd98f" intensity={3.2} distance={7} decay={2} position={[0, 0.5, 0]} />
    </group>
  );
}
function SkyLanterns({ launchRef, posRef }: { launchRef: React.RefObject<number>; posRef: React.RefObject<THREE.Vector3> }) {
  const [list, setList] = useState<{ id: number; x: number; z: number }[]>([]);
  const prev = useRef(0); const idc = useRef(0);
  useFrame(() => {
    if (launchRef.current !== prev.current) {
      prev.current = launchRef.current; const p = posRef.current;
      setList((l) => [...l, { id: idc.current++, x: p ? p.x : 0, z: p ? p.z : 0 }].slice(-14));
    }
  });
  return <>{list.map((L) => <RisingLantern key={L.id} x={L.x} z={L.z} onDone={() => setList((l) => l.filter((q) => q.id !== L.id))} />)}</>;
}

// 🎣 拾海垂钓:回报玩家是否在海湾岸边(可垂钓);抛竿时在玩家径向外侧水面显示浮标
function FishingSpot({ posRef, onAtWater, casting }: { posRef: React.RefObject<THREE.Vector3>; onAtWater: (b: boolean) => void; casting: boolean }) {
  const was = useRef(false); const bob = useRef<THREE.Group>(null);
  useFrame((s) => {
    const p = posRef.current; if (!p) return;
    const r = Math.hypot(p.x, p.z);
    const at = r > WALK_RADIUS * 0.78 && bayMask(p.x, p.z) > 0.32;
    if (at !== was.current) { was.current = at; onAtWater(at); }
    const b = bob.current; if (b) {
      b.visible = casting;
      const ux = p.x / (r || 1), uz = p.z / (r || 1);
      b.position.set(p.x + ux * 4.5, 0.15 + Math.sin(s.clock.elapsedTime * 3) * 0.07, p.z + uz * 4.5);
    }
  });
  return (
    <group ref={bob} visible={false}>
      <mesh><sphereGeometry args={[0.2, 10, 7]} /><meshToonMaterial color="#ff7a6b" /></mesh>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.03, 0.03, 0.22, 5]} /><meshToonMaterial color="#fbfbfb" /></mesh>
    </group>
  );
}

// 🎐 风铃心曲:5 个散布风铃,走近(进入半径的瞬间)敲响其音;ExploreMode 比对目标曲序
const CHIME_FREQS = [523.25, 587.33, 659.25, 783.99, 880.0]; // C D E G A 五声音阶
// 引导光标:下一个该敲的风铃亮起脉动光环 + 光柱 + 点光 —— 玩家「跟着发光的风铃走」即可奏曲
function ChimeBeacon({ pos }: { pos: { x: number; y: number; z: number } }) {
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffe6a0", transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
  const beamMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffe6a0", transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
  useEffect(() => () => { ringMat.dispose(); beamMat.dispose(); }, [ringMat, beamMat]);
  useFrame((s) => {
    const pulse = 0.5 + Math.sin(s.clock.elapsedTime * 3) * 0.5;
    const r = ring.current; if (r) { const k = 1 + pulse * 0.3; r.scale.set(k, k, 1); }
    ringMat.opacity = 0.22 + pulse * 0.4; beamMat.opacity = 0.08 + pulse * 0.14;
  });
  return (
    <group position={[pos.x, pos.y, pos.z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]} material={ringMat}><ringGeometry args={[1.1, 1.6, 32]} /></mesh>
      <mesh position={[0, 3.2, 0]} material={beamMat}><cylinderGeometry args={[0.18, 0.7, 6.4, 10, 1, true]} /></mesh>
      <pointLight color="#ffe6a0" intensity={3.6} distance={10} decay={1.7} position={[0, 2.6, 0]} />
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
    for (let i = 0; i < spots.length; i++) { if (Math.hypot(p.x - spots[i].x, p.z - spots[i].z) < 3.6) { cur = i; break; } }
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
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame((s) => {
    const m = ref.current; if (!m) return; const mm = new THREE.Matrix4(); const t = s.clock.elapsedTime;
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

function ExploreScene({
  visual,
  inputRef,
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
  onCompanionInteract,
  character,
  expression,
  forceNight,
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
}: {
  visual: SceneVisual;
  inputRef: React.RefObject<Input>;
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
  onCompanionInteract?: () => void;
  character: CharKind;
  expression: string;
  forceNight: boolean;
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
}) {
  const terrain = useMemo(() => buildExploreTerrain(), []);
  useEffect(() => () => terrain.dispose(), [terrain]);
  useEffect(() => { sceneEnv.night = forceNight; }, [forceNight]); // 夜间标记 → 车头灯只在夜里亮
  const posRef = useRef(new THREE.Vector3(0, 0, 0));
  const collidersRef = useRef<Map<string, Collider[]> | null>(null); // 障碍碰撞网格(Town 填充,Player 读取)
  const cheerRef = useRef(0); // 拾取计数(Player 读 → 欢呼)
  const nearRef = useRef(-1); // 最近 NPC(Player 读 → 好奇表情)
  const fogHex = useMemo(() => new THREE.Color(visual.sea).getHex(), [visual.sea]);
  const shallowHex = useMemo(() => new THREE.Color(visual.seaHighlight).lerp(new THREE.Color("#eafdff"), 0.5).getStyle(), [visual.seaHighlight]); // 浅滩:海面高光再提亮
  const sketch = useMemo(() => new SketchEffect(), []);
  useEffect(() => () => sketch.dispose(), [sketch]);
  // 渐变天空作 scene.background(放进 3D,否则 EffectComposer 会把空域清成黑)
  const skyTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 256;
    const ctx = c.getContext("2d");
    if (ctx) {
      const grd = ctx.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, forceNight ? "#0e1430" : visual.skyTop);
      grd.addColorStop(0.5, forceNight ? "#1d2952" : visual.skyMid);
      grd.addColorStop(1, forceNight ? "#37406e" : visual.skyBottom);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 16, 256);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [visual.skyTop, visual.skyMid, visual.skyBottom, forceNight]);
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

  return (
    <>
      <primitive object={skyTex} attach="background" />
      <fog attach="fog" args={[forceNight ? 0x1a2440 : fogHex, 230, 1060]} />
      <ambientLight intensity={forceNight ? 0.36 : 0.75} />
      <hemisphereLight args={[new THREE.Color(forceNight ? "#2a3a66" : visual.skyMid).getHex(), new THREE.Color(visual.sea).getHex(), forceNight ? 0.32 : 0.6]} />
      <directionalLight position={[5, 8, 3]} intensity={forceNight ? 0.55 : 1.2} color={forceNight ? "#aab9e6" : visual.celestial} />
      {forceNight && <Stars radius={320} depth={70} count={1600} factor={6} saturation={0} fade speed={0.5} />}
      {forceNight && lanternCount > 0 && <DistantGlows count={lanternCount} />}

      {/* 地形:草地/沙滩/水下分区配色,toon 平涂 */}
      <mesh geometry={terrain} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <meshToonMaterial vertexColors gradientMap={toonGrad} />
      </mesh>
      {/* 脚边随风草丛 */}
      <GroundGrass count={52000} animate grad={toonGrad} />
      {/* 山顶薄雪 */}
      <InstancedField geo={gSnow} material={snowMat} items={snowItems} />
      {/* 近岸浪花:贴水线一圈柔白(陆地处被沙挡住,只在水边显形) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[WALK_RADIUS * 1.0, WALK_RADIUS * 1.1, 96]} />
        <meshBasicMaterial color="#e6f6f8" transparent opacity={0.3} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* 程序小镇 */}
      <Town toonGrad={toonGrad} accent={visual.accent} collidersRef={collidersRef} />
      {/* 海岛村落建筑 + 岛上设施(Batch 5/7) */}
      <Village toonGrad={toonGrad} />
      {/* 近海地形 + 海滩物 + 发光海水(Batch 6) */}
      <Coastline toonGrad={toonGrad} accent={visual.accent} />
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

      <Player inputRef={inputRef} posRef={posRef} avatar={avatar} character={character} expression={expression} collidersRef={collidersRef} cheerRef={cheerRef} nearRef={nearRef} onCar={onCar} />
      <Companion posRef={posRef} action={companionAction} onInteract={onCompanionInteract} />
      <Npcs animate posRef={posRef} mood={visual.motion} emotion={emotion} giftedIds={giftedIds} onNear={(id) => { nearRef.current = id; onNear(id); }} />
      <SecretWhale posRef={posRef} onFound={onWhale} night={visual.time === "night" || visual.stars} />
      <DriftBottles posRef={posRef} onFind={onBottle} notes={bottleNotes} />
      {imprints.length > 0 ? <MemoryImprints posRef={posRef} imprints={imprints} onPick={(i) => { cheerRef.current += 1; onPickImprint(i); }} /> : <Wishes posRef={posRef} color={visual.accent} onCollect={() => { cheerRef.current += 1; onCollect(); }} total={total} />}
      {treeColors.length > 0 && <MemoryTree colors={treeColors} />}

      {/* 🌸 心情花田 · 🏮 暮色天灯 · 🎣 拾海垂钓 · 🎐 风铃心曲 */}
      <MoodGarden inputRef={inputRef} posRef={posRef} accent={visual.accent} flowers={flowers} onPlant={onPlantFlower} onNear={onNearFlower} />
      <SkyLanterns launchRef={lanternLaunch} posRef={posRef} />
      <FishingSpot posRef={posRef} onAtWater={onAtWater} casting={fishingCasting} />
      <WindChimes posRef={posRef} grad={toonGrad} onRing={onRingChime} nextChime={nextChime} />
      {songDone && <Fireflies />}

      {/* 手绘后期:墨线 + 色阶 + 纸纹 */}
      <EffectComposer>
        <primitive object={sketch} />
      </EffectComposer>
    </>
  );
}

// 触屏摇杆(左下)。pointer 拖动写入 inputRef；松开归零。
function Joystick({ inputRef }: { inputRef: React.RefObject<Input> }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
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
    setKnob({ x: dx, y: dy });
    if (inputRef.current) {
      inputRef.current.x = dx;
      inputRef.current.y = dy;
    }
  };
  const end = () => {
    active.current = false;
    setKnob({ x: 0, y: 0 });
    if (inputRef.current) {
      inputRef.current.x = 0;
      inputRef.current.y = 0;
    }
  };

  return (
    <div
      ref={base}
      className="absolute h-28 w-28 rounded-full border border-white/25 bg-white/10 backdrop-blur-md touch-none select-none"
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
        className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white/70"
        style={{ transform: `translate(-50%,-50%) translate(${knob.x * 36}px, ${knob.y * 36}px)` }}
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
  secret,
  talkText,
  busy,
  onTalkTextChange,
  onFeed,
  onTalk,
  onPet,
  onRest,
  onRename,
  onClose,
  onDismissSecret,
}: {
  state: CompanionState;
  message: string;
  secret: CompanionSecretId | null;
  talkText: string;
  busy: boolean;
  onTalkTextChange: (text: string) => void;
  onFeed: (food: CompanionFoodId) => void;
  onTalk: () => void;
  onPet: () => void;
  onRest: () => void;
  onRename: (name: string) => void;
  onClose: () => void;
  onDismissSecret: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(state.name);
  const bond = getCompanionBondLabel(state.affinity);
  return (
    <section
      className="panel-glass-2 absolute z-10 rounded-card p-3 text-white/85"
      style={{
        position: "absolute",
        top: "calc(7.2rem + env(safe-area-inset-top))",
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

      <div className="mt-3">
        <textarea
          value={talkText}
          onChange={(e) => onTalkTextChange(e.target.value)}
          placeholder="跟它说一句话..."
          rows={2}
          className="w-full resize-none rounded-card border border-white/12 bg-white/10 px-3 py-2 text-[13px] leading-relaxed text-white/85 outline-none placeholder:text-white/35"
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={onTalk} disabled={busy} className="btn-primary py-2 text-[13px] disabled:opacity-55">
            {busy ? "聆听中..." : "对话"}
          </button>
          <button type="button" onClick={onRest} disabled={busy} className="btn-ghost py-2 text-[13px] disabled:opacity-55">
            静坐
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-card bg-white/10 px-3 py-2">
        <p className="text-[13px] leading-relaxed text-white/78">{message}</p>
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
  }
}

export default function ExploreMode({ visual, onExit, emotion, bottleNotes, imprints = [], userId = "local-guest" }: { visual: SceneVisual; onExit: () => void; emotion?: string; bottleNotes?: string[]; imprints?: Imprint[]; userId?: string }) {
  const inputRef = useRef<Input>({ x: 0, y: 0 });
  const keys = useRef<Set<string>>(new Set());
  const total = 5;
  const [collected, setCollected] = useState(0);
  const imp = imprints;
  const [pickedImprints, setPickedImprints] = useState<number[]>([]); // 已拾起的心灵印记下标
  const [shownImprint, setShownImprint] = useState<Imprint | null>(null); // 当前展开的来源卡
  const hasImprints = imp.length > 0;
  const [nearNpc, setNearNpc] = useState(-1); // 当前可搭话的 NPC(-1=无),由场景内 onNear 回报
  const [carPrompt, setCarPrompt] = useState<"enter" | "exit" | null>(null); // 车交互提示(由 Player 回报)
  const [giftedIds, setGiftedIds] = useState<number[]>([]); // 已送过心愿的 NPC
  const [avatar, setAvatar] = useState<Avatar>(loadAvatar); // 你捏的人物外观(本地保存)
  const [character, setCharacter] = useState<CharKind>(() => { // 可切换主角:记忆的守护者 / Pocoyo / 捏的人(迁移旧 xy_use_hero)
    try {
      const v = localStorage.getItem("xy_char");
      if (v === "hero" || v === "pocoyo" || v === "avatar") return v;
      return localStorage.getItem("xy_use_hero") === "0" ? "avatar" : "hero";
    } catch { return "hero"; }
  });
  const [expression, setExpression] = useState<string>(() => { try { return localStorage.getItem("xy_expr") || "auto"; } catch { return "auto"; } }); // 主角表情(auto 跟随状态 / 开心 / 平静 / 坚定 / 好奇)
  const [dressOpen, setDressOpen] = useState(false); // 换装面板开关
  const [mapMenu, setMapMenu] = useState(false); // 上车后「选地图」菜单
  const [forestDrive, setForestDrive] = useState(false); // 进入林间土路驾驶场景(独立 Canvas 覆盖层)
  useEffect(() => { carEnterCb = () => setMapMenu(true); return () => { carEnterCb = null; }; }, []);
  const [whaleFound, setWhaleFound] = useState(false); // 🐋 彩蛋:发现鲸落之海
  const [bottles, setBottles] = useState<number[]>([]); // 🍾 彩蛋:拾到的漂流瓶下标
  const [companionState, setCompanionState] = useState<CompanionState>(() => loadCompanionState(userId, typeof window === "undefined" ? undefined : window.localStorage));
  const [companionMessage, setCompanionMessage] = useState("它绕着你慢慢漂浮，灯塔里亮着一小盏只属于你的光。");
  const [companionTalkText, setCompanionTalkText] = useState("");
  const [companionAction, setCompanionAction] = useState<CompanionActionSignal | null>(null);
  const [companionSecret, setCompanionSecret] = useState<CompanionSecretId | null>(null);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [companionThinking, setCompanionThinking] = useState(false);
  useEffect(() => {
    saveCompanionState(companionState, typeof window === "undefined" ? undefined : window.localStorage);
  }, [companionState]);
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
  const [night, setNight] = useState<boolean>(() => { try { return localStorage.getItem("xy_night") === "1"; } catch { return false; } });
  const [lanternOpen, setLanternOpen] = useState(false);
  const [lanternText, setLanternText] = useState("");
  const [lanternCount, setLanternCount] = useState<number>(() => { try { return parseInt(localStorage.getItem("xy_lanterns") || "0", 10) || 0; } catch { return 0; } });
  const lanternLaunch = useRef(0);
  const [atWater, setAtWater] = useState(false);
  const [fishing, setFishing] = useState<"idle" | "cast" | "bite">("idle");
  const [shownCatch, setShownCatch] = useState<{ icon: string; title: string; line: string } | null>(null);
  const [catchCount, setCatchCount] = useState<number>(() => { try { return parseInt(localStorage.getItem("xy_catch") || "0", 10) || 0; } catch { return 0; } });
  const [songProgress, setSongProgress] = useState(0);
  const [songDone, setSongDone] = useState<boolean>(() => { try { return localStorage.getItem("xy_song") === "1"; } catch { return false; } });
  const [songFlash, setSongFlash] = useState(false);
  const SONG = [2, 0, 3, 1, 4]; // 风铃心曲目标序(五声)
  useEffect(() => { try { localStorage.setItem("xy_garden", JSON.stringify(flowers.slice(-120))); } catch { /* ignore */ } }, [flowers]);
  useEffect(() => { try { localStorage.setItem("xy_night", night ? "1" : "0"); } catch { /* ignore */ } }, [night]);
  useEffect(() => { try { localStorage.setItem("xy_lanterns", String(lanternCount)); } catch { /* ignore */ } }, [lanternCount]);
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
  const plantFlower = (x: number, z: number, color: string) => { setFlowers((f) => [...f, { x, z, color, t: Date.now() }].slice(-120)); playSfx("bloom"); };
  const releaseLantern = () => { lanternLaunch.current += 1; setLanternCount((c) => c + 1); setLanternOpen(false); setLanternText(""); playSfx("reveal"); };
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
    }
  };
  const ringChime = (i: number) => { chimeNote(CHIME_FREQS[i]); if (songDone) return; setSongProgress((p) => (i === SONG[p] ? p + 1 : i === SONG[0] ? 1 : 0)); };
  const fmtWhen = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日`; };

  const nearRef = useRef(-1);
  const giftedRef = useRef<number[]>([]);
  useEffect(() => {
    nearRef.current = nearNpc;
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
      if (ai.safety.triggered) playSfx("settle");
      return;
    }
    setCompanionMessage(`它认真听完「${said}」。${result.reply}`);
    triggerCompanionAction(result.unlockedNow.length ? "SecretTwirl" : result.animation);
  };
  const handleCompanionPet = () => {
    setCompanionMessage(`${companionState.name}轻轻蹭了蹭你的身边，灯塔光像呼吸一样亮了一下。`);
    triggerCompanionAction("BondGlow");
    playSfx("tap");
  };
  const handleCompanionRest = () => {
    setCompanionMessage(`${companionState.name}陪你安静地漂着。这里不需要证明什么，停一会儿也很好。`);
    triggerCompanionAction("SleepFloat");
    playSfx("settle");
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

  const sky = `linear-gradient(to bottom, ${visual.skyTop} 0%, ${visual.skyMid} 48%, ${visual.skyBottom} 82%)`;
  const done = collected >= total;
  const imprintsDone = hasImprints && pickedImprints.length >= imp.length;
  const allGifted = giftedIds.length >= NPC_TOTAL; // 送完岛上所有人 → 庆祝

  // —— 音景：进入俯冲、彩蛋发现、完成峰值（均为 sfx.ts 零素材合成音，跟随音乐静音）——
  useEffect(() => { playSfx("whoosh"); }, []); // 俯冲入岛
  useEffect(() => { if (whaleFound) playSfx("chime"); }, [whaleFound]); // 🐋 鲸落之海
  useEffect(() => { if (bottles.length > 0) playSfx("collect"); }, [bottles.length]); // 🍾 拾到漂流瓶
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
    <div className="fixed inset-0 z-[70] overflow-hidden" style={{ background: sky }}>
      <Canvas
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        dpr={[1, 1.75]}
        camera={{ position: [0, 150, 290], fov: 50, near: 0.1, far: 3400 }}
        frameloop="always"
      >
        <Suspense fallback={null}>
          <ExploreScene visual={visual} inputRef={inputRef} onCollect={() => { playSfx("collect"); setCollected((c) => c + 1); }} total={total} giftedIds={giftedIds} onNear={setNearNpc} emotion={emotion} avatar={avatar} onWhale={() => setWhaleFound(true)} onBottle={(i) => setBottles((b) => (b.includes(i) ? b : [...b, i]))} bottleNotes={bottleNotes} imprints={imp} onPickImprint={(i) => { playSfx("shell"); setPickedImprints((p) => (p.includes(i) ? p : [...p, i])); setShownImprint(imp[i]); }} treeColors={imprintsDone ? pickedImprints.map((i) => imp[i].color) : []} companionAction={companionAction} onCompanionInteract={() => setCompanionOpen(true)} character={character} expression={expression} forceNight={night} flowers={flowers} onPlantFlower={plantFlower} onNearFlower={setNearFlower} lanternLaunch={lanternLaunch} onAtWater={setAtWater} fishingCasting={fishing !== "idle"} onRingChime={ringChime} songDone={songDone} nextChime={songDone ? -1 : (SONG[songProgress] ?? -1)} lanternCount={lanternCount} onCar={setCarPrompt} />
        </Suspense>
      </Canvas>

      <button
        type="button"
        onClick={() => { setCompanionOpen((open) => !open); playSfx("tap"); }}
        className="panel-glass-2 absolute z-10 flex items-center gap-2 rounded-full px-4 py-2 font-display text-[14px] tracking-wider text-white/85 active:scale-95 transition-transform"
        style={{ right: "calc(1.2rem + env(safe-area-inset-right))", top: "calc(4.4rem + env(safe-area-inset-top))" }}
        aria-label={companionOpen ? "收起专属精灵" : "打开专属精灵"}
      >
        <span className="text-[#ffe2a0]">✦</span>
        <span>精灵</span>
        <span className="text-caption text-white/45">C</span>
      </button>

      {companionOpen && (
        <CompanionPanel
          state={companionState}
          message={companionMessage}
          secret={companionSecret}
          talkText={companionTalkText}
          busy={companionThinking}
          onTalkTextChange={setCompanionTalkText}
          onFeed={handleCompanionFeed}
          onTalk={handleCompanionTalk}
          onPet={handleCompanionPet}
          onRest={handleCompanionRest}
          onRename={handleCompanionRename}
          onClose={() => setCompanionOpen(false)}
          onDismissSecret={() => setCompanionSecret(null)}
        />
      )}

      {/* 任务 HUD */}
      <div className="absolute inset-x-0 top-0 flex justify-center" style={{ paddingTop: "calc(1.2rem + env(safe-area-inset-top))" }}>
        <div className="panel-glass-2 rounded-card px-5 py-2.5 text-center">
          {hasImprints ? (
            <>
              <p className="text-caption tracking-[0.28em] text-white/55">{imprintsDone ? "印记都拾起了" : "拾起岛上的心灵印记"}</p>
              <p className="font-display text-[18px] tracking-wider text-white/90">{imprintsDone ? "✦ 你走过的每一刻，都还在 ✦" : `心灵印记 ${pickedImprints.length} / ${imp.length}`}</p>
            </>
          ) : (
            <>
              <p className="text-caption tracking-[0.28em] text-white/55">{done ? "心愿都收齐了" : "拾起岛上的心愿"}</p>
              <p className="font-display text-[18px] tracking-wider text-white/90">{done ? "✦ 谢谢你来岛上走走 ✦" : `心愿 ${collected} / ${total}`}</p>
            </>
          )}
          {giftedIds.length > 0 && (
            <p className="text-caption text-white/55 mt-0.5">{allGifted ? "你温暖了岛上的每一个人 ♡" : `已把心愿分给 ${giftedIds.length} / ${NPC_TOTAL} 个岛上的人 ♡`}</p>
          )}
          {whaleFound && <p className="text-caption text-white/55 mt-0.5">🐋 鲸落之海 · 已发现</p>}
          {bottles.length > 0 && <p className="text-caption text-white/55 mt-0.5">🍾 漂流瓶 {bottles.length} / {BOTTLE_ANGLES.length} · 拾到陌生人的留言</p>}
        </div>
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
          <button onClick={() => { inputRef.current.action = true; }} className="panel-glass-2 rounded-full px-6 py-2.5 font-display text-[15px] tracking-wider text-white/90 active:scale-95 transition-transform">
            {carPrompt === "enter" ? "🚗 上车开一开" : "🚶 下车"}<span className="text-caption text-white/45"> (E)</span>
          </button>
        </div>
      )}

      {/* 退出 */}
      <button
        onClick={onExit}
        className="btn-link absolute z-10 text-white/70"
        style={{ top: "calc(1.4rem + env(safe-area-inset-top))", right: "calc(1.4rem + env(safe-area-inset-right))" }}
      >
        回到岸上
      </button>

      {/* 捏人 / 换装入口 */}
      <button
        onClick={() => setDressOpen(true)}
        className="btn-link absolute z-10 text-white/70"
        style={{ top: "calc(1.4rem + env(safe-area-inset-top))", left: "calc(1.4rem + env(safe-area-inset-left))" }}
      >
        ✎ 捏人
      </button>

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
            {character === "hero" && (
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
        className="absolute text-caption text-white/45"
        style={{ right: "calc(1.6rem + env(safe-area-inset-right))", bottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        WASD / 方向键 移动 · 空格跳跃 · 左下摇杆
      </p>

      {/* 跳跃按钮(右下,触屏) */}
      <button
        onPointerDown={(e) => { e.preventDefault(); if (inputRef.current) inputRef.current.jump = true; }}
        className="absolute z-10 flex items-center justify-center rounded-full panel-glass-2 text-white/85 select-none active:scale-90 transition-transform"
        style={{
          right: "calc(1.9rem + env(safe-area-inset-right))",
          bottom: "calc(5.4rem + env(safe-area-inset-bottom))",
          width: 66,
          height: 66,
          touchAction: "none",
        }}
        aria-label="跳跃"
      >
        <span className="text-[20px] leading-none">⤴</span>
      </button>

      {/* 招手按钮(右下,触屏;键盘 F) */}
      <button
        onPointerDown={(e) => { e.preventDefault(); if (inputRef.current) inputRef.current.wave = true; }}
        className="absolute z-10 flex items-center justify-center rounded-full panel-glass-2 text-white/85 select-none active:scale-90 transition-transform"
        style={{
          right: "calc(1.9rem + env(safe-area-inset-right))",
          bottom: "calc(12.6rem + env(safe-area-inset-bottom))",
          width: 58,
          height: 58,
          touchAction: "none",
        }}
        aria-label="招手"
      >
        <span className="text-[19px] leading-none">✋</span>
      </button>

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
      {/* 左侧竖排:昼夜 / 放天灯 / 种花 */}
      <div className="absolute z-10 flex flex-col gap-2" style={{ left: "calc(1.5rem + env(safe-area-inset-left))", top: "calc(4.8rem + env(safe-area-inset-top))" }}>
        <button onClick={() => { setNight((v) => !v); playSfx("tap"); }} aria-label="昼夜切换" className="flex h-11 w-11 items-center justify-center rounded-full panel-glass-2 text-white/85 active:scale-90 transition-transform"><span className="text-[18px] leading-none">{night ? "🌙" : "☀️"}</span></button>
        <button onClick={() => setLanternOpen(true)} aria-label="放天灯" className="flex h-11 w-11 items-center justify-center rounded-full panel-glass-2 text-white/85 active:scale-90 transition-transform"><span className="text-[18px] leading-none">🏮</span></button>
        <button onPointerDown={(e) => { e.preventDefault(); if (inputRef.current) inputRef.current.plant = true; }} aria-label="种花" className="flex h-11 w-11 items-center justify-center rounded-full panel-glass-2 text-white/85 select-none active:scale-90 transition-transform" style={{ touchAction: "none" }}><span className="text-[18px] leading-none">🌱</span></button>
      </div>

      {/* 海湾岸边:垂钓按钮(底部居中,避开送心愿) */}
      {atWater && nearNpc < 0 && (
        <div className="absolute inset-x-0 flex justify-center px-4" style={{ bottom: "calc(2.4rem + env(safe-area-inset-bottom))" }}>
          <button onClick={onCast} className="panel-glass-2 rounded-full px-6 py-2.5 font-display text-[15px] tracking-wider text-white/90 active:scale-95 transition-transform">
            {fishing === "idle" ? "🎣 垂钓" : fishing === "cast" ? "抛竿中…" : "❗ 收线!"}
          </button>
        </div>
      )}

      {/* 走近花朵:何时种下 */}
      {nearFlower && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center px-4" style={{ bottom: "calc(8.6rem + env(safe-area-inset-bottom))" }}>
          <div className="panel-glass-1 rounded-full px-4 py-1.5 text-caption text-white/70">🌸 这朵开于 {fmtWhen(nearFlower.t)} · <span style={{ color: nearFlower.color }}>那时的心情</span></div>
        </div>
      )}

      {/* 风铃心曲:进度 / 成曲 */}
      {!songDone && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top: "calc(5.6rem + env(safe-area-inset-top))" }}>
          <div className="panel-glass-1 rounded-full px-4 py-1 text-caption text-white/75">🎐 跟着发光的风铃，依次敲响 {SONG.map((_, i) => (i < songProgress ? "◍" : "○")).join(" ")}</div>
        </div>
      )}
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
              <button onClick={() => { carState.driving = true; startEngine(); playSfx("whoosh"); setMapMenu(false); }} className="btn-primary py-3">🏝️ 就在这座岛上开</button>
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
