/* eslint-disable react-hooks/immutability -- R3F frame loops intentionally mutate Three.js objects. */
import { Suspense, useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Html } from "@react-three/drei";
import * as THREE from "three";
import { startEngine, stopEngine, setEngineSpeed, playAccelRev, play as playSfx } from "../lib/sfx";
import { getPerfTier } from "../lib/perfTier";
import { useIsTouch } from "../lib/device";
import { makeTrack, type Track, type Decoration } from "../lib/track";
import { tinted, makeToonGrad, mergeToonGeometries } from "../lib/toonGeo";
import DriveWorld from "./DriveWorld";
import { EffectComposer, Bloom, Vignette, HueSaturation } from "@react-three/postprocessing";

// 「巡游长公路」开车地图:程序化样条赛道 + 街机车辆物理。零大模型、零逐帧射线 → 秒加载、稳 60fps、开不完。
// 车辆 = qiche.glb 黄色 Porsche 车身(合并时跳过原装轮子) + 四个轮位换装可驱动轮(前轮随操作转向、全轮随车速滚动)。
// 路面网格画在中心线高度 cy 之上 0.06(见 track.buildRoadGeometry),车要正好贴在这个面上 → 不陷不浮。
const ROAD_RAISE = 0.06;
const GRASS_Y = -0.04; // 草地平面高度(与 Scenery 草地共用);出路面时车贴到这个面,不悬在草地上方

// —— 车辆(qiche.glb)——
const QICHE_URL = "/models/qiche.glb";
const CAR_SCALE = 0.05;
// 车身水平居中 + 轮底落到外层 group 原点(=路面)。值来自 glb 包围盒(与 ExploreMode CAR_FIT/CAR_Y_OFFSET 同源)。
const CAR_FIT: [number, number, number] = [-2.955, 0.7735, -0.473];
const MAX_STEER_VIS = 0.5; // 前轮最大视觉转角(rad)
const WHEEL_ROLL_R = 0.38; // 滚动用平均轮半径(m),ω = v / R
// 四个轮位(g 空间,已含 CAR_FIT):由 glb 轮子簇包围盒中心 *0.05 + CAR_FIT 算得。前轮 z>0(车头朝 +Z),后轮略大。
const WHEELS: { x: number; y: number; z: number; r: number; front: boolean }[] = [
  { x: -0.852, y: 0.372, z: 1.343, r: 0.37, front: true }, // 左前
  { x: 0.852, y: 0.372, z: 1.343, r: 0.37, front: true }, // 右前
  { x: -0.832, y: 0.391, z: -1.314, r: 0.39, front: false }, // 左后
  { x: 0.832, y: 0.391, z: -1.314, r: 0.39, front: false }, // 右后
];

// —— 车辆物理(调这些就能改手感)——
const ENGINE_ACCEL = 24; // 油门加速度 m/s²
const BOOST_ACCEL = 40; // 加速键(Shift)下的增压油门 → 更猛的推背
const BRAKE_DECEL = 46; // 刹车减速
const REVERSE_ACCEL = 12; // 倒车加速
const MAX_FWD = 22; // W 巡航最高速(更慢一点 ≈79km/h;按住 Shift 增压到 BOOST_FWD)
const BOOST_FWD = 38; // 加速键(Shift / 触屏「»」)下的冲刺上限 ≈137km/h
const MAX_REV = 9;
const LIN_DRAG = 0.5; // 线性阻力(决定自然限速与松油门滑行)
const OFFROAD_DRAG = 4.5; // 压到草地的额外阻力(拖慢但不卡死)
const STEER_RATE = 1.55; // 最大转向角速度 rad/s

interface DriveInput {
  x: number; // 转向 -1 左 / +1 右
  y: number; // 油门 +1 前 / -1 刹车·倒车
  boost?: boolean; // 加速(持续):键盘 Shift / 触屏「»」按住为 true
}

const _camTarget = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _dm = new THREE.Matrix4();
const _dummy = new THREE.Object3D();
const _c = new THREE.Color();

// 路面纹理:暖灰柏油 + 两侧米白边线 + 中间暖黄虚线。横向铺满路宽,沿弧长重复(UV 已驱动)。
function makeRoadTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const x = c.getContext("2d")!;
  x.fillStyle = "#8b8893";
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = "#efe9dc";
  x.fillRect(4, 0, 5, 128);
  x.fillRect(119, 0, 5, 128);
  x.fillStyle = "#f4cf73";
  x.fillRect(60, 14, 8, 54); // 中线虚线(每个纹理周期一段)
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// 草甸纹理:柔和草绿底 + 软色块(明暗深浅) + 点点野花/草簇。平铺成有设计感的草地,告别纯色平面。
function makeMeadowTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const x = c.getContext("2d")!;
  x.fillStyle = "#86b86a";
  x.fillRect(0, 0, 256, 256);
  // 软色块(用径向渐变模拟柔边),交错深浅,营造光斑/草色变化
  const patches: [number, number, number, string][] = [
    [60, 70, 90, "#79ad5d"], [190, 60, 80, "#96c47a"], [120, 170, 100, "#7bab5b"],
    [210, 200, 76, "#b6c98c"], [40, 200, 70, "#8fbf6e"], [165, 120, 64, "#9cc77e"], [90, 30, 56, "#82b566"],
  ];
  for (const [cx, cy, r, col] of patches) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, col);
    g.addColorStop(1, "rgba(134,184,106,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
  }
  // 点点:暗草簇 + 野花(粉/黄/白),稀疏
  const hsh = (n: number) => { const v = Math.sin(n * 91.7 + 13.1) * 47453.7; return v - Math.floor(v); };
  for (let i = 0; i < 150; i++) {
    const px = hsh(i) * 256;
    const py = hsh(i + 99) * 256;
    const r = hsh(i + 7);
    if (r < 0.45) { x.fillStyle = "rgba(86,143,77,0.5)"; x.fillRect(px, py, 2, 3); } // 暗草簇
    else { x.fillStyle = r < 0.62 ? "#f3a8c8" : r < 0.78 ? "#f4d36a" : r < 0.9 ? "#f4f4ea" : "#c89bf0"; x.beginPath(); x.arc(px, py, 1.4, 0, Math.PI * 2); x.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(80, 80);
  t.anisotropy = 8;
  return t;
}

function WebGLContextLossExit({ onExit }: { onExit: () => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onExit();
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    return () => canvas.removeEventListener("webglcontextlost", handleContextLost);
  }, [gl, onExit]);
  return null;
}

// 8 种精致卡通植被(松/圆叶树/樱花/灌木/苔石/花丛/草丛/灯),各 merge 成单 geometry → instanced 渲染。
// 配色统一走治愈系协调色板;逐实例再用 instanceColor 微调明暗冷暖,避免"千篇一律"。kind 序号与 track.Decoration.kind 对应。
function buildDecoGeos() {
  // 0 松:三层锥(下深上浅) + 暖棕干 → 挺拔层次。
  const pine = mergeToonGeometries([
    tinted(new THREE.CylinderGeometry(0.16, 0.26, 1.4, 6).translate(0, 0.7, 0), "#6b4f38"),
    tinted(new THREE.ConeGeometry(1.2, 1.7, 8).translate(0, 1.75, 0), "#3f7a55"),
    tinted(new THREE.ConeGeometry(0.98, 1.5, 8).translate(0, 2.6, 0), "#4a8a60"),
    tinted(new THREE.ConeGeometry(0.7, 1.25, 8).translate(0, 3.4, 0), "#57976a"),
  ])!;
  // 1 圆叶树:干 + 三球叠成的饱满圆冠(底深顶亮)。
  const broadleaf = mergeToonGeometries([
    tinted(new THREE.CylinderGeometry(0.16, 0.22, 1.5, 6).translate(0, 0.75, 0), "#765539"),
    tinted(new THREE.IcosahedronGeometry(1.15, 1).translate(0, 2.1, 0), "#5f9e54"),
    tinted(new THREE.IcosahedronGeometry(0.85, 1).translate(-0.55, 2.5, 0.2), "#6cab5e"),
    tinted(new THREE.IcosahedronGeometry(0.8, 1).translate(0.5, 2.55, -0.2), "#73b566"),
  ])!;
  // 2 樱花:略弯干 + 粉白花冠(几团),premium 暖粉点缀。
  const blossom = mergeToonGeometries([
    tinted(new THREE.CylinderGeometry(0.14, 0.2, 1.6, 6).translate(0, 0.8, 0), "#7a5a44"),
    tinted(new THREE.IcosahedronGeometry(1.0, 1).translate(0, 2.15, 0), "#f7b8d0"),
    tinted(new THREE.IcosahedronGeometry(0.7, 1).translate(-0.55, 2.5, 0.15), "#ffc9dd"),
    tinted(new THREE.IcosahedronGeometry(0.62, 1).translate(0.5, 2.45, -0.2), "#ffd9e6"),
    tinted(new THREE.IcosahedronGeometry(0.4, 0).translate(0.1, 2.85, 0.1), "#fff2f7"),
  ])!;
  // 3 灌木:两三团贴地小球。
  const bush = mergeToonGeometries([
    tinted(new THREE.IcosahedronGeometry(0.55, 1).scale(1, 0.85, 1).translate(0, 0.45, 0), "#5e9a58"),
    tinted(new THREE.IcosahedronGeometry(0.42, 1).scale(1, 0.85, 1).translate(0.4, 0.38, 0.1), "#69a861"),
    tinted(new THREE.IcosahedronGeometry(0.38, 1).scale(1, 0.85, 1).translate(-0.35, 0.34, -0.1), "#558f50"),
  ])!;
  // 4 苔石:灰岩 + 顶上一抹青苔。
  const rock = mergeToonGeometries([
    tinted(new THREE.IcosahedronGeometry(0.8, 0).scale(1.1, 0.7, 1.0), "#9a9aa3"),
    tinted(new THREE.IcosahedronGeometry(0.5, 0).scale(1.2, 0.4, 1.1).translate(0.05, 0.42, 0), "#6f9a5a"),
  ])!;
  // 5 花丛:三支不同高、五瓣 + 花心,粉/黄/紫错落。
  const flowerParts: THREE.BufferGeometry[] = [];
  const fcols = ["#f6a5c0", "#f6d36b", "#c89bf0"];
  for (let s = 0; s < 3; s++) {
    const bx = (s - 1) * 0.24;
    const hgt = 0.4 + s * 0.12;
    flowerParts.push(tinted(new THREE.CylinderGeometry(0.035, 0.045, hgt, 4).translate(bx, hgt / 2, s * 0.1), "#4f8c46"));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      flowerParts.push(tinted(new THREE.SphereGeometry(0.12, 6, 5).scale(1, 0.6, 1).translate(bx + Math.cos(a) * 0.14, hgt + 0.02, s * 0.1 + Math.sin(a) * 0.14), fcols[s]));
    }
    flowerParts.push(tinted(new THREE.SphereGeometry(0.07, 6, 5).translate(bx, hgt + 0.04, s * 0.1), "#ffe9a0"));
  }
  const flower = mergeToonGeometries(flowerParts);
  // 6 草丛:五片扇形细叶(下宽上尖),叶尖偏亮。
  const tuftParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.32;
    tuftParts.push(tinted(new THREE.ConeGeometry(0.07, 0.7 + (i % 2) * 0.18, 4).translate(0, 0.35, 0).rotateZ(a).translate(i * 0.04 - 0.08, 0, (i % 2) * 0.05), i % 2 ? "#7fbf63" : "#6aae54"));
  }
  const tuft = mergeToonGeometries(tuftParts);
  // 7 灯:细杆 + 暖光球(偏亮 → 夜里被 Bloom 染成柔光) + 小帽。
  const lamp = mergeToonGeometries([
    tinted(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 6).translate(0, 1.6, 0), "#4a4a52"),
    tinted(new THREE.SphereGeometry(0.28, 10, 8).translate(0, 3.32, 0), "#fff2c0"),
    tinted(new THREE.ConeGeometry(0.26, 0.22, 8).translate(0, 3.62, 0), "#3a3a42"),
  ])!;
  return { pine, broadleaf, blossom, bush, rock, flower, tuft, lamp };
}

// 可驱动轮胎(替换 glb 转不动的原装轮):深胎面 + 银轮毂盘 + 5 辐条 + 深银毂帽。半径 = 1(单位),渲染时 scale 到实际轮径。
// 几何整体 rotateZ(90°) 把柱轴放到 X 轴:于是 mesh.rotation.x = 滚动、父 group.rotation.y = 转向。
function buildWheel(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    tinted(new THREE.CylinderGeometry(1, 1, 0.72, 24).rotateZ(Math.PI / 2), "#18181c"), // 胎面(深)
    tinted(new THREE.CylinderGeometry(0.62, 0.62, 0.8, 24).rotateZ(Math.PI / 2), "#b7bac2"), // 轮毂盘(银,略宽两侧露出)
    tinted(new THREE.CylinderGeometry(0.17, 0.17, 0.84, 14).rotateZ(Math.PI / 2), "#7f828b"), // 毂帽(深银)
  ];
  for (let i = 0; i < 5; i++) {
    // 辐条沿 X 比胎面宽 → 在轮侧露出可见;先沿 +Y 伸出再绕 X 转到辐射角。
    parts.push(tinted(new THREE.BoxGeometry(0.84, 0.66, 0.14).translate(0, 0.5, 0).rotateX((i / 5) * Math.PI * 2), "#d8dbe2"));
  }
  return mergeToonGeometries(parts);
}

// 从 qiche.glb 合并出黄色车身:遍历所有 mesh,跳过轮子材质(Wheel/RIM/CALIPE)的网格(由可驱动轮替代),
// 其余烘焙世界矩阵并入单一 vertexColors 几何(保留各材质原色,黄漆即来自 PAINT_COLOR)→ 一个 draw call、toon 着色。
function buildCarBody(scene: THREE.Object3D, grad: THREE.Texture): { geometry: THREE.BufferGeometry; material: THREE.Material } {
  const root = scene.clone(true);
  root.updateMatrixWorld(true);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const tmp = new THREE.Color();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    if (/wheel|rim|calipe|tyre|tire/i.test(mat?.name || "")) return; // 跳过原装轮子(转不动) → 由可驱动轮替代
    let g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const nor = g.getAttribute("normal") as THREE.BufferAttribute | undefined;
    tmp.copy(mat?.color ?? new THREE.Color("#cccccc"));
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (nor) normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      colors.push(tmp.r, tmp.g, tmp.b);
    }
    g.dispose();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length === positions.length) geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  if (normals.length !== positions.length) geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return { geometry: geo, material: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad }) };
}

// 路面 + 草甸地面。远山改由 DriveWorld 的相机相对大气山峦层提供(更稳、随昼夜雾色联动)。
function Scenery({ track }: { track: Track; tier: "high" | "low" }) {
  const grad = useMemo(() => makeToonGrad(), []);
  const roadGeo = useMemo(() => track.buildRoadGeometry(), [track]);
  const roadTex = useMemo(() => makeRoadTexture(), []);
  const roadMat = useMemo(() => new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.96, metalness: 0, side: THREE.DoubleSide }), [roadTex]);
  const meadowTex = useMemo(() => makeMeadowTexture(), []);
  const groundMat = useMemo(() => new THREE.MeshToonMaterial({ map: meadowTex, gradientMap: grad }), [grad, meadowTex]);
  useEffect(() => () => { grad.dispose(); roadGeo.dispose(); roadTex.dispose(); roadMat.dispose(); meadowTex.dispose(); groundMat.dispose(); }, [grad, roadGeo, roadTex, roadMat, meadowTex, groundMat]);
  return (
    <>
      <mesh geometry={roadGeo} material={roadMat} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GRASS_Y, 0]} material={groundMat}>
        <planeGeometry args={[3600, 3600]} />
      </mesh>
    </>
  );
}

// 路两侧装饰:8 种各一个 instancedMesh,逐实例 instanceColor 微调明暗冷暖。
function Decorations({ track, tier }: { track: Track; tier: "high" | "low" }) {
  const grad = useMemo(() => makeToonGrad(), []);
  const geos = useMemo(() => buildDecoGeos(), []);
  const mat = useMemo(() => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad }), [grad]);
  const groups = useMemo(() => {
    const all = track.decorations();
    const trimmed = tier === "low" ? all.filter((_, i) => i % 2 === 0) : all;
    const by: Decoration[][] = [[], [], [], [], [], [], [], []];
    for (const d of trimmed) by[d.kind]?.push(d);
    return by;
  }, [track, tier]);
  const refs = [
    useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null),
  ];
  const kinds = useMemo(() => [geos.pine, geos.broadleaf, geos.blossom, geos.bush, geos.rock, geos.flower, geos.tuft, geos.lamp], [geos]);
  useEffect(() => {
    for (let k = 0; k < kinds.length; k++) {
      const im = refs[k].current;
      const list = groups[k];
      if (!im) continue;
      for (let i = 0; i < list.length; i++) {
        const d = list[i];
        _dummy.position.set(d.x, d.y, d.z);
        _dummy.rotation.set(0, d.rot, 0);
        _dummy.scale.setScalar(d.scale);
        _dummy.updateMatrix();
        im.setMatrixAt(i, _dummy.matrix);
        const b = 0.82 + d.tint * 0.18; // 明暗
        const w = ((d.tint * 7.7) % 1) - 0.5; // 冷暖偏移
        _c.setRGB(Math.min(1, b + w * 0.06), b, Math.min(1, b - w * 0.05));
        im.setColorAt(i, _c);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, kinds]);
  useEffect(() => () => { grad.dispose(); mat.dispose(); kinds.forEach((g) => g.dispose()); }, [grad, mat, kinds]);
  return (
    <>
      {kinds.map((g, k) => (
        <instancedMesh key={k} ref={refs[k]} args={[g, mat, Math.max(1, groups[k].length)]} frustumCulled={false} castShadow={false} />
      ))}
    </>
  );
}

// 车辆:街机物理 + 贴地 + 姿态 + 速度感相机 + 车尾扬尘 + 引擎声 + 速度表回写。
function DriveCar({ inputRef, track, speedRef }: { inputRef: RefObject<DriveInput | null>; track: Track; speedRef: RefObject<HTMLSpanElement | null> }) {
  const { scene } = useGLTF(QICHE_URL);
  const carGrad = useMemo(() => makeToonGrad(), []);
  const { geometry: bodyGeo, material: bodyMat } = useMemo(() => buildCarBody(scene, carGrad), [scene, carGrad]);
  const wheelGeo = useMemo(() => buildWheel(), []);
  const wheelMat = useMemo(() => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: carGrad }), [carGrad]);
  useEffect(
    () => () => {
      carGrad.dispose();
      bodyGeo.dispose();
      bodyMat.dispose();
      wheelGeo.dispose();
      wheelMat.dispose();
    },
    [carGrad, bodyGeo, bodyMat, wheelGeo, wheelMat],
  );

  const g = useRef<THREE.Group>(null);
  const dust = useRef<THREE.InstancedMesh>(null);
  const sFL = useRef<THREE.Group>(null); // 前轮转向架(左/右):绕 Y 转向
  const sFR = useRef<THREE.Group>(null);
  const wFL = useRef<THREE.Mesh>(null); // 4 轮:绕 X 滚动
  const wFR = useRef<THREE.Mesh>(null);
  const wRL = useRef<THREE.Mesh>(null);
  const wRR = useRef<THREE.Mesh>(null);
  const st = useRef({ x: 0, z: 0, heading: 0, speed: 0, clk: 0, idx: 0, steerVis: 0, pitchVis: 0, wheelRoll: 0 });
  const inited = useRef(false);
  const dustGeo = useMemo(() => new THREE.SphereGeometry(0.45, 6, 5), []);
  const dustMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#cab39a", transparent: true, opacity: 0.5, depthWrite: false }), []);
  const puffs = useRef(Array.from({ length: 22 }, () => ({ x: 0, y: -999, z: 0, life: 0, sz: 0 })));
  const ph = useRef(0);
  const acc = useRef(0);
  // 车尾双喷加速火焰:两侧各一束(外橙焰光晕 + 内黄白焰芯),共享几何/材质;加速迸发、松油门即收(见 useFrame flame 段)。
  const flameL = useRef<THREE.Group>(null);
  const flameR = useRef<THREE.Group>(null);
  const flame = useRef(0); // 火焰强度 0→1(平滑)
  const flameHaloGeo = useMemo(() => new THREE.ConeGeometry(0.3, 1.55, 14, 1, true), []);
  const flameOuterGeo = useMemo(() => new THREE.ConeGeometry(0.2, 1.28, 14, 1, true), []);
  const flameInnerGeo = useMemo(() => new THREE.ConeGeometry(0.11, 0.9, 14, 1, true), []);
  const flameHaloMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ff3a06", transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
  const flameOuterMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ff6a1a", transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
  const flameInnerMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffe6a6", transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
  const flameLight = useRef<THREE.PointLight>(null); // 车尾随火焰强度脉动的暖光(夜里照亮地面/车身)
  const lowTier = getPerfTier() === "low"; // 低端机:省略车尾动态点光
  // 车尾迸射火星(additive 亮点,世界空间 instancedMesh,仿扬尘) + 起步/增压点火爆燃
  const sparks = useRef<THREE.InstancedMesh>(null);
  const sparkArr = useRef(Array.from({ length: 44 }, () => ({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, sz: 0 })));
  const sph = useRef(0); // 火星发射游标(左右喷口交替)
  const sparkAcc = useRef(0); // 持续喷射节流
  const burst = useRef(0); // 起步/增压点火爆燃强度(先放大再回落)
  const prevGas = useRef(false);
  const prevBoost = useRef(false);
  const sparkGeo = useMemo(() => new THREE.SphereGeometry(1, 6, 5), []); // 单位球,实例 scale 控大小
  const sparkMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffc24a", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), []);
  const { camera } = useThree();

  useEffect(() => {
    const sp = track.startPose();
    const s = st.current;
    s.x = sp.x;
    s.z = sp.z;
    s.heading = sp.heading;
    s.idx = 0;
    inited.current = true;
    startEngine();
    playSfx("whoosh");
    // 相机直接就位,避免开场从原点飞入
    _fwd.set(Math.sin(sp.heading), 0, Math.cos(sp.heading));
    camera.position.set(sp.x - _fwd.x * 12, sp.y + 5, sp.z - _fwd.z * 12);
    camera.lookAt(sp.x, sp.y + 1.2, sp.z);
    const amb = new Audio("/audio/ambience/wind_forest.m4a");
    amb.loop = true;
    amb.volume = 0;
    amb.play().then(() => { amb.volume = 0.35; }).catch(() => {});
    return () => {
      stopEngine();
      amb.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);
  useEffect(() => () => { dustGeo.dispose(); dustMat.dispose(); }, [dustGeo, dustMat]);
  useEffect(() => () => { flameHaloGeo.dispose(); flameOuterGeo.dispose(); flameInnerGeo.dispose(); flameHaloMat.dispose(); flameOuterMat.dispose(); flameInnerMat.dispose(); }, [flameHaloGeo, flameOuterGeo, flameInnerGeo, flameHaloMat, flameOuterMat, flameInnerMat]);
  useEffect(() => () => { sparkGeo.dispose(); sparkMat.dispose(); }, [sparkGeo, sparkMat]);

  useFrame((_, dtRaw) => {
    const o = g.current;
    if (!o || !inited.current) return;
    const dt = Math.min(dtRaw, 0.04);
    const inp = inputRef.current ?? { x: 0, y: 0, boost: false };
    const s = st.current;
    s.clk += dt;

    // 当前赛道最近点 → 横向偏移(判断在不在路面)、贴地高度。
    const near = track.nearest(s.x, s.z, s.idx);
    s.idx = near.idx;
    const offRoad = Math.abs(near.lateral) > track.halfWidth;

    // —— 纵向:油门 / 刹车 / 倒车 + 阻力(按住 Shift 增压:更猛的油门 + 更高限速)——
    const boosting = !!inp.boost && inp.y > 0; // 加速键仅在前进给油时增压
    let a = 0;
    if (inp.y > 0) a = (boosting ? BOOST_ACCEL : ENGINE_ACCEL) * inp.y;
    else if (inp.y < 0) a = (s.speed > 0.4 ? BRAKE_DECEL : REVERSE_ACCEL) * inp.y;
    a -= LIN_DRAG * s.speed;
    if (offRoad) a -= OFFROAD_DRAG * s.speed; // 草地拖慢
    s.speed += a * dt;
    const fwdCap = boosting ? BOOST_FWD : MAX_FWD;
    if (s.speed > fwdCap) s.speed += (fwdCap - s.speed) * Math.min(1, dt * 3); // 软限速:松开加速键平滑回落,不顿挫
    s.speed = Math.max(-MAX_REV, Math.min(BOOST_FWD, s.speed)); // 硬上限恒为增压上限
    if (inp.y === 0 && Math.abs(s.speed) < 0.5) s.speed *= 1 - Math.min(1, dt * 4); // 怠速缓停
    const frac = Math.min(1, Math.abs(s.speed) / BOOST_FWD); // 速度感以增压上限为满量程

    // —— 转向:静止不转、低速灵活、高速收敛;倒车反打 ——
    const v = Math.abs(s.speed);
    const agile = Math.min(1, v / 3.5); // 极低速才逐渐建立转向力(避免原地打方向)
    const calm = 1 - 0.4 * Math.min(1, v / MAX_FWD);
    s.heading -= inp.x * STEER_RATE * agile * calm * dt * (s.speed >= 0 ? 1 : -1); // A=左 / D=右(修正此前左右相反;前轮视觉与车身侧倾本就按此约定)

    // —— 位置 ——
    s.x += Math.sin(s.heading) * s.speed * dt;
    s.z += Math.cos(s.heading) * s.speed * dt;
    const gy = near.height;

    // —— 车身姿态:航向 + 过弯侧倾 + 加速/刹车俯仰 + 颠簸 ——
    s.steerVis += (inp.x - s.steerVis) * Math.min(1, dt * 8);
    const targetPitch = Math.max(-1, Math.min(1, a / ENGINE_ACCEL));
    s.pitchVis += (targetPitch - s.pitchVis) * Math.min(1, dt * 6);
    const bob = v > 1 ? Math.sin(s.clk * 13) * 0.025 * frac : 0;
    // 贴地高度:路面上贴在路面(cy+ROAD_RAISE),驶出路肩 2m 内平滑落到草地(GRASS_Y)→ 路上路下都不悬空。
    const offT = Math.max(0, Math.min(1, (Math.abs(near.lateral) - track.halfWidth) / 2));
    const surfaceY = (gy + ROAD_RAISE) * (1 - offT) + GRASS_Y * offT;
    o.position.set(s.x, surfaceY + bob, s.z);
    _e.set(s.pitchVis * 0.07 * frac, s.heading, -s.steerVis * 0.13 * frac * (s.speed >= 0 ? 1 : -1));
    o.quaternion.setFromEuler(_e);

    // —— 轮胎:全轮随速度滚动(ω = v/R) + 前轮随输入转向(原地打方向也会转)——
    s.wheelRoll = (s.wheelRoll + (s.speed / WHEEL_ROLL_R) * dt) % (Math.PI * 2);
    if (wFL.current) wFL.current.rotation.x = s.wheelRoll;
    if (wFR.current) wFR.current.rotation.x = s.wheelRoll;
    if (wRL.current) wRL.current.rotation.x = s.wheelRoll;
    if (wRR.current) wRR.current.rotation.x = s.wheelRoll;
    const steerY = -s.steerVis * MAX_STEER_VIS;
    if (sFL.current) sFL.current.rotation.y = steerY;
    if (sFR.current) sFR.current.rotation.y = steerY;

    setEngineSpeed(frac);
    if (speedRef.current) speedRef.current.textContent = String(Math.round(v * 3.6));

    // —— 车尾扬尘(快跑/草地时)——
    const dm = dust.current;
    if (dm) {
      const emit = frac > 0.16 || (offRoad && v > 3);
      if (emit) {
        acc.current += dt;
        if (acc.current > 0.045) {
          acc.current = 0;
          const p = puffs.current[ph.current % puffs.current.length];
          ph.current++;
          const side = (Math.random() - 0.5) * 1.3;
          p.x = s.x - Math.sin(s.heading) * 2.0 + Math.cos(s.heading) * side;
          p.z = s.z - Math.cos(s.heading) * 2.0 - Math.sin(s.heading) * side;
          p.y = gy + 0.25;
          p.life = 1;
          p.sz = (offRoad ? 0.6 : 0.45) + Math.random() * 0.4;
        }
      }
      for (let i = 0; i < puffs.current.length; i++) {
        const p = puffs.current[i];
        if (p.life > 0) {
          p.life -= dt * 1.1;
          p.y += dt * 0.5;
        }
        const fade = p.life < 0.3 ? Math.max(0, p.life / 0.3) : 1;
        const sc = p.life > 0 ? p.sz * (0.4 + (1 - p.life) * 1.0) * fade : 0;
        _dm.makeScale(sc, sc, sc);
        _dm.setPosition(p.x, p.y, p.z);
        dm.setMatrixAt(i, _dm);
      }
      dm.instanceMatrix.needsUpdate = true;
    }

    // —— 车尾双喷火焰 + 起步/增压点火爆燃(踩油门/按增压瞬间先放大再回落)——
    const want = inp.y > 0 ? 1 : 0;
    const fk = want > flame.current ? dt * 16 : dt * 9; // 窜火快、收火稍慢
    flame.current += (want - flame.current) * Math.min(1, fk);
    const gasOn = inp.y > 0;
    const gasEdge = gasOn && !prevGas.current; // 本帧刚踩下油门
    const boostEdge = boosting && !prevBoost.current; // 本帧刚进入增压
    if (gasEdge) { burst.current = Math.max(burst.current, 0.8); playAccelRev(1); } // 踩油门「轰」一下
    if (boostEdge) { burst.current = 1.3; playAccelRev(1.7); } // 增压点火更猛、加速声更长更亮
    prevGas.current = gasOn;
    prevBoost.current = boosting;
    burst.current = Math.max(0, burst.current - dt * 4.5); // ~0.3s 回落
    const fl = flame.current;
    const flB = Math.min(1.7, fl + burst.current); // 叠加爆燃后的有效火焰强度
    const showFlame = flB > 0.02;
    const flick = 0.8 + Math.sin(s.clk * 46) * 0.13 + Math.sin(s.clk * 22.7) * 0.07 + (Math.random() - 0.5) * 0.08;
    const flameLen = flB * flick * (0.88 + frac * 0.9) * (boosting ? 1.22 : 1); // 顶速/爆燃/增压火舌更长
    const flameWid = flB * (0.92 + flick * 0.22) * (boosting ? 1.12 : 1);
    if (flameL.current) { flameL.current.visible = showFlame; if (showFlame) flameL.current.scale.set(flameWid, flameWid, flameLen); }
    if (flameR.current) { flameR.current.visible = showFlame; if (showFlame) flameR.current.scale.set(flameWid, flameWid, flameLen); }
    if (flameLight.current) flameLight.current.intensity = flB * (10 + flick * 6); // 车尾暖光随火焰/爆燃脉动

    // —— 车尾迸射火星:从两喷口向车后下方喷洒 additive 亮点(被 Bloom 染亮);喷口世界坐标 = 车位 + heading 旋转后的局部偏移 ——
    const spm = sparks.current;
    if (spm) {
      const arr = sparkArr.current;
      const EXZ = -1.95; // 喷口 z(g 空间,火焰口稍后)
      const emitSpark = (sign: number, power: number) => {
        const p = arr[sph.current % arr.length];
        sph.current++;
        const back = (2 + Math.random() * 2.5 + (boosting ? 2 : 0)) * power; // 相对车向后喷的速度
        const sideS = (Math.random() - 0.5) * 1.6 * power;
        const upS = (0.5 + Math.random() * 1.3) * power;
        p.x = s.x + 0.46 * sign * Math.cos(s.heading) + EXZ * Math.sin(s.heading);
        p.z = s.z - 0.46 * sign * Math.sin(s.heading) + EXZ * Math.cos(s.heading);
        p.y = surfaceY + 0.34;
        p.vx = Math.sin(s.heading) * (s.speed - back) + Math.cos(s.heading) * sideS; // 跟车速 − 后喷 + 侧扩
        p.vz = Math.cos(s.heading) * (s.speed - back) - Math.sin(s.heading) * sideS;
        p.vy = upS;
        p.life = 1;
        p.sz = (0.07 + Math.random() * 0.07) * (0.8 + power * 0.35);
      };
      if (gasEdge) for (let k = 0; k < 6; k++) emitSpark(k % 2 ? 1 : -1, 1.5); // 起步爆燃迸射一簇
      if (boostEdge) for (let k = 0; k < 10; k++) emitSpark(k % 2 ? 1 : -1, 1.9); // 增压点火更大一簇
      if (fl > 0.3 && gasOn) { // 持续喷火时稳定发射(增压更密)
        sparkAcc.current += dt;
        const itv = boosting ? 0.012 : 0.024;
        let guard = 0;
        while (sparkAcc.current > itv && guard++ < 8) { sparkAcc.current -= itv; emitSpark(sph.current % 2 ? 1 : -1, 1); }
      }
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (p.life > 0) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 7 * dt; p.life -= dt * 2; }
        const sc = p.life > 0 ? p.sz * Math.max(0, Math.min(1, p.life * 1.4)) : 0;
        _dm.makeScale(sc, sc, sc);
        _dm.setPosition(p.x, p.y, p.z);
        spm.setMatrixAt(i, _dm);
      }
      spm.instanceMatrix.needsUpdate = true;
    }

    // —— 追尾相机:越快拉越远、看得越前、视野越开(速度感)——
    _fwd.set(Math.sin(s.heading), 0, Math.cos(s.heading));
    const back = 11 + frac * 7;
    const up = 4.4 + frac * 1.6;
    _camTarget.set(s.x - _fwd.x * back, gy + up, s.z - _fwd.z * back);
    camera.position.lerp(_camTarget, Math.min(1, dt * 3));
    _camLook.set(s.x + _fwd.x * 6, gy + 1.3, s.z + _fwd.z * 6);
    camera.lookAt(_camLook);
    const cam = camera as THREE.PerspectiveCamera;
    const fov = 56 + frac * 12;
    if (Math.abs(cam.fov - fov) > 0.1) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 3);
      cam.updateProjectionMatrix();
    }
  });

  return (
    <>
      <group ref={g}>
        {/* 黄色 Porsche 车身:CAR_FIT 把它水平居中、轮底落到 g 原点(路面);scale 到场景尺度 */}
        <group position={CAR_FIT}>
          <mesh geometry={bodyGeo} material={bodyMat} scale={CAR_SCALE} />
        </group>
        {/* 前轮:转向架(绕 Y)内含滚动 mesh(绕 X);单位轮 scale 到实测轮径 */}
        <group ref={sFL} position={[WHEELS[0].x, WHEELS[0].y, WHEELS[0].z]}>
          <mesh ref={wFL} geometry={wheelGeo} material={wheelMat} scale={WHEELS[0].r} />
        </group>
        <group ref={sFR} position={[WHEELS[1].x, WHEELS[1].y, WHEELS[1].z]}>
          <mesh ref={wFR} geometry={wheelGeo} material={wheelMat} scale={WHEELS[1].r} />
        </group>
        {/* 后轮:只滚动 */}
        <mesh ref={wRL} geometry={wheelGeo} material={wheelMat} position={[WHEELS[2].x, WHEELS[2].y, WHEELS[2].z]} scale={WHEELS[2].r} />
        <mesh ref={wRR} geometry={wheelGeo} material={wheelMat} position={[WHEELS[3].x, WHEELS[3].y, WHEELS[3].z]} scale={WHEELS[3].r} />
        {/* 车尾双喷加速火焰:喷口锚在车尾(-Z),锥尖朝后(rotateX(-90°) 把 +Y 锥尖转向 -Z,position.z=-height/2 让喷口落在 group 原点)。3 层:光晕 halo + 橙焰 outer + 白热焰芯 inner。visible/scale 由 useFrame 按油门驱动 */}
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
      <instancedMesh ref={dust} args={[dustGeo, dustMat, 22]} frustumCulled={false} />
      {/* 车尾迸射火星(世界空间,踩油门/增压时从喷口喷洒;发射与运动见 useFrame 火星段) */}
      <instancedMesh ref={sparks} args={[sparkGeo, sparkMat, 44]} frustumCulled={false} />
    </>
  );
}

// 触屏控制:左侧转向(◄ ►)、右侧油门/刹车(▲ ▼)。
function HoldBtn({ label, onActive, style }: { label: string; onActive: (on: boolean) => void; style: React.CSSProperties }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onActive(true); }}
      onPointerUp={(e) => { e.preventDefault(); onActive(false); }}
      onPointerLeave={() => onActive(false)}
      onPointerCancel={() => onActive(false)}
      className="absolute z-10 flex items-center justify-center rounded-full panel-glass-2 text-white/85 select-none active:scale-90 transition-transform"
      style={{ width: 66, height: 66, touchAction: "none", ...style }}
    >
      <span className="text-[22px] leading-none">{label}</span>
    </button>
  );
}

export default function DriveScene({ inputRef, onExit }: { inputRef: RefObject<DriveInput | null>; onExit: () => void }) {
  const track = useMemo(() => makeTrack(), []);
  const startCam = useMemo(() => {
    const sp = track.startPose();
    return { position: [sp.x - Math.sin(sp.heading) * 12, sp.y + 5, sp.z - Math.cos(sp.heading) * 12] as [number, number, number], fov: 56 };
  }, [track]);
  const steer = useRef(0);
  const gas = useRef(0);
  const boost = useRef(false);
  const speedRef = useRef<HTMLSpanElement>(null);
  const phaseRef = useRef<HTMLSpanElement>(null);
  const isTouch = useIsTouch();
  const tier = getPerfTier();
  const apply = () => {
    if (inputRef.current) {
      inputRef.current.x = steer.current;
      inputRef.current.y = gas.current;
      inputRef.current.boost = boost.current;
    }
  };
  // 键盘:A/← 左,D/→ 右,W/↑ 油门,S/↓ 刹车·倒车,E 下车回岛;阻止方向键滚动页面。
  useEffect(() => {
    const shared = inputRef.current;
    const keys = new Set<string>();
    const resetInput = () => {
      if (inputRef.current) {
        inputRef.current.x = 0;
        inputRef.current.y = 0;
        inputRef.current.boost = false;
      }
    };
    const recompute = () => {
      let x = 0;
      let y = 0;
      if (keys.has("a") || keys.has("arrowleft")) x -= 1;
      if (keys.has("d") || keys.has("arrowright")) x += 1;
      if (keys.has("w") || keys.has("arrowup")) y += 1;
      if (keys.has("s") || keys.has("arrowdown")) y -= 1;
      if (inputRef.current) {
        inputRef.current.x = x;
        inputRef.current.y = y;
        inputRef.current.boost = keys.has("shift"); // 按住 Shift = 加速
      }
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "e") {
        e.preventDefault();
        keys.clear();
        resetInput();
        onExit();
        return;
      }
      if (k === "arrowup" || k === "arrowdown" || k === "arrowleft" || k === "arrowright" || k === " ") e.preventDefault();
      keys.add(k);
      recompute();
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
      recompute();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      if (shared) {
        shared.x = 0;
        shared.y = 0;
        shared.boost = false;
      }
    };
  }, [inputRef, onExit]);

  return (
    <div className="fixed inset-0 z-40" style={{ background: "linear-gradient(to bottom,#bfe0ef,#e8f1ec)" }}>
      <Canvas camera={startCam} dpr={tier === "low" ? [1, 1.25] : [1, 1.7]} gl={{ antialias: true }}>
        <WebGLContextLossExit onExit={onExit} />
        <fog attach="fog" args={["#cfe4ec", 90, 620]} />
        {/* 动态昼夜天色 + 灯光/雾 + 天空生灵 + 路边卡通彩蛋(替代原静态天穹与定光) */}
        <DriveWorld track={track} tier={tier} labelRef={phaseRef} />
        <Scenery track={track} tier={tier} />
        <Decorations track={track} tier={tier} />
        <Suspense
          fallback={
            <Html center>
              <div style={{ color: "#fff", textAlign: "center", whiteSpace: "nowrap", textShadow: "0 1px 8px rgba(0,0,0,.6)", fontSize: 15 }}>载入兜风小车…</div>
            </Html>
          }
        >
          <DriveCar inputRef={inputRef} track={track} speedRef={speedRef} />
        </Suspense>
        {/* 后期质感:柔光 Bloom(太阳/灯/萤火发光) + 微提饱和 + 暗角 → 高级电影感。low 档省略保 60fps。 */}
        {tier !== "low" && (
          <EffectComposer multisampling={4}>
            <Bloom mipmapBlur intensity={0.52} luminanceThreshold={0.82} luminanceSmoothing={0.3} radius={0.72} />
            <HueSaturation saturation={0.1} />
            <Vignette offset={0.3} darkness={0.52} />
          </EffectComposer>
        )}
      </Canvas>

      <button
        onClick={onExit}
        className="btn-link absolute z-10 text-white/85 py-2 px-2"
        style={{ top: "calc(1rem + env(safe-area-inset-top))", right: "calc(1rem + env(safe-area-inset-right))" }}
      >
        ↩ 回到岛上
      </button>
      <div className="absolute z-10 panel-glass-1 rounded-full px-4 py-1.5 text-caption text-white/80" style={{ top: "calc(1.4rem + env(safe-area-inset-top))", left: "calc(1.4rem + env(safe-area-inset-left))" }}>
        🚗 巡游公路 · {isTouch ? "左◄► 转向 · 右▲▼ 油门 · » 加速" : "W 油门 S 刹车 · A/D 转向 · Shift 加速 · E 下车"}
      </div>

      {/* 当前时段(随昼夜推进:日出→正午→黄昏→星夜) */}
      <div className="absolute z-10 left-1/2 -translate-x-1/2 panel-glass-1 rounded-full px-4 py-1.5 text-caption text-white/85" style={{ top: "calc(1.4rem + env(safe-area-inset-top))" }}>
        <span ref={phaseRef}>🌅 日出</span>
      </div>

      {/* 速度表 */}
      <div className="absolute z-10 panel-glass-1 rounded-card px-4 py-2 text-center" style={{ right: "calc(1.4rem + env(safe-area-inset-right))", bottom: "calc(1.4rem + env(safe-area-inset-bottom))", minWidth: 92 }}>
        <span ref={speedRef} className="font-display text-white/90" style={{ fontSize: 30, lineHeight: 1 }}>0</span>
        <span className="text-caption text-white/50 ml-1">km/h</span>
      </div>

      {/* 触屏:左转向 右油门 */}
      {isTouch && (
        <>
          <HoldBtn label="◄" onActive={(on) => { steer.current = on ? -1 : 0; apply(); }} style={{ left: "calc(1.6rem + env(safe-area-inset-left))", bottom: "calc(3.4rem + env(safe-area-inset-bottom))" }} />
          <HoldBtn label="►" onActive={(on) => { steer.current = on ? 1 : 0; apply(); }} style={{ left: "calc(8.6rem + env(safe-area-inset-left))", bottom: "calc(3.4rem + env(safe-area-inset-bottom))" }} />
          <HoldBtn label="▲" onActive={(on) => { gas.current = on ? 1 : 0; apply(); }} style={{ left: "calc(1.6rem + env(safe-area-inset-left))", bottom: "calc(11rem + env(safe-area-inset-bottom))" }} />
          <HoldBtn label="▼" onActive={(on) => { gas.current = on ? -1 : 0; apply(); }} style={{ left: "calc(8.6rem + env(safe-area-inset-left))", bottom: "calc(11rem + env(safe-area-inset-bottom))" }} />
          {/* 加速踏板(对应键盘 Shift):放右侧、速度表上方,拇指好按 */}
          <HoldBtn label="»" onActive={(on) => { boost.current = on; apply(); }} style={{ right: "calc(1.6rem + env(safe-area-inset-right))", bottom: "calc(7rem + env(safe-area-inset-bottom))" }} />
        </>
      )}
    </div>
  );
}
