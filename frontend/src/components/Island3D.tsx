/* eslint-disable react-hooks/immutability, react-hooks/refs -- R3F scene setup and frame loops intentionally mutate Three.js refs. */
import { forwardRef, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MeshReflectorMaterial, Sparkles, Stars, Float, Outlines, useGLTF, OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, GodRays } from "@react-three/postprocessing";
import { Effect, EffectAttribute } from "postprocessing";
import * as THREE from "three";
import type { SceneVisual } from "../lib/sceneMap";
import { getPerfTier, type PerfTier } from "../lib/perfTier";

interface Props {
  visual: SceneVisual;
  features?: string[];
  // 是否允许动效（沉浸态）。false 时静态单帧 + 颜色直接吸附——reduced-motion / 静海红线。
  animate: boolean;
}

// ───────────────────────────────────────────────────────────
// 真 3D「深海玻璃·心屿」旗舰皮（react-three-fiber + postprocessing）
// 渐变天空贴图作 scene.background + 水面/岛体/天体/浮尘 + Bloom 辉光后期。
// 情绪切换：所有颜色（雾/水/岛/辉光/天体/光/天空）由 EmotionTint 集中 lerp，绝不硬切。
// 整套 gated on `animate`：静态时相机不漂、浮尘不动、frameloop="demand" 只渲一帧、颜色直接吸附。
// ───────────────────────────────────────────────────────────

// 卡通阶梯上色查找图(与「上岛走走」探索岛同一套 toon 风);3 档红通道,最近邻取样。
// 模块级单例:全场景植被共用一张 3×1 贴图(极小,常驻不 dispose)。
let _toonGrad: THREE.DataTexture | null = null;
function toonGradient(): THREE.DataTexture {
  if (!_toonGrad) {
    const t = new THREE.DataTexture(new Uint8Array([84, 150, 235]), 3, 1, THREE.RedFormat);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    _toonGrad = t;
  }
  return _toonGrad;
}

// Blender 真实建模的悬浮岛 glb（雪峰 + 松林 + 木栈道 + 青色水下辉光），套同一套 toon 材质。
// 默认接管 3D 岛屿皮；?island=proc 切回程序化地形（保留兜底）。缩放/抬升映射到程序岛的取景。
const GLB_ISLAND_URL = "/models/xy_scene_island.glb";
const GLB_SCALE = 0.23; // 原生半径 ~10 → 视觉半径 ~2.3，整岛（雪峰+辉光）尽收镜中
const GLB_Y = 0.3; // 岛坐在海里：沙滩/草地清楚高出水线（不再被海面盖住），沙岩岛底没入水中
const GLB_WATER_Y = -0.48; // 主页 GLB 岛专用水线：给沙滩台地留出明显干沙余量，避免反射海面把沙滩视觉上淹掉
const TURTLE_SCALE = 0.62; // 背景生灵比例：比主岛低一个视觉层级，避免抢走中心输入区注意力
const TURTLE_WATERLINE_OFFSET_Y = -0.09; // 相对主页水线半潜：腹部入水、龟壳仍露出
const TURTLE_SWIM_CENTER_Z = 1.25; // 保持在中远景水面，不贴到近镜头底边
const TURTLE_SWIM_RADIUS_Z = 0.9;
const USE_GLB_ISLAND = typeof location === "undefined" || !location.search.includes("island=proc");
const HOMEPAGE_DPR_RANGE: Record<PerfTier, [number, number]> = {
  low: [1, 1.5],
  high: [1, 1.75],
};
useGLTF.preload(GLB_ISLAND_URL);

// 抖动噪声瓦片(模块级构建一次):以 overlay 低透叠在天色渐变上,打散 8-bit 量化造成的色带(banding)。
// 天色每帧重绘,故用一次性瓦片 + 每帧 pattern fillRect(无 getImageData readback,开销低)。
let _skyNoise: HTMLCanvasElement | null = null;
function skyNoiseTile(): HTMLCanvasElement {
  if (_skyNoise) return _skyNoise;
  const n = document.createElement("canvas");
  n.width = n.height = 64;
  const nx = n.getContext("2d");
  if (nx) {
    const id = nx.createImageData(64, 64);
    let s = 0x9e3779b9 >>> 0;
    for (let i = 0; i < id.data.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const v = 123 + (s / 4294967296) * 10; // 灰噪声(123~133,紧贴中性灰 128):overlay 在暗夜空上会放大,故收紧到极轻,等效 ≈±3/255
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
    nx.putImageData(id, 0, 0);
  }
  _skyNoise = n;
  return n;
}

// 渐变天空：模块级工厂持有 canvas + CanvasTexture，暴露 draw/dispose。
// 命令式写入（含 needsUpdate）封在普通函数里，绕开 react-hooks 对组件内变异的规则。
function createSkyGradient() {
  const W = 16, H = 512; // 加高:vertical 渐变拉伸到全天空时减少插值色带
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  let pattern: CanvasPattern | null = null;
  const draw = (top: string, mid: string, bottom: string) => {
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(0.48, mid);
    g.addColorStop(0.82, bottom);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 叠抖动:打散量化色带(banding)。瓦片构建一次,这里只做廉价的 pattern fillRect。
    if (!pattern) pattern = ctx.createPattern(skyNoiseTile(), "repeat");
    if (pattern) {
      ctx.globalAlpha = 0.6;
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    texture.needsUpdate = true;
  };
  return { texture, draw, dispose: () => texture.dispose() };
}

// 水面涟漪扰动图：程序生成的正弦干涉噪声（周期性 → 无缝平铺），驱动反射 UV 微扰。
// advance() 每帧滚动 offset，让倒影随微浪荡漾；命令式写入封在普通函数里绕开 react-hooks 规则。
function createRippleDistortion() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const TAU = Math.PI * 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        let n =
          Math.sin(u * TAU * 2 + v * TAU) +
          Math.sin(u * TAU - v * TAU * 3) * 0.6 +
          Math.sin((u + v) * TAU * 2) * 0.4;
        n = (n / 2) * 0.5 + 0.5; // → 0..1
        const c = Math.max(0, Math.min(255, n * 255));
        const i = (y * size + x) * 4;
        img.data[i] = c;
        img.data[i + 1] = c;
        img.data[i + 2] = c;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  const advance = (dt: number) => {
    texture.offset.x += dt * 0.03;
    texture.offset.y += dt * 0.015;
  };
  return { texture, advance, dispose: () => texture.dispose() };
}

// 反射水面 + 涟漪：保留 MeshReflectorMaterial 的镜面倒影，叠加缓动扰动让倒影荡漾。
// 颜色由 EmotionTint 通过 waterRef 驱动（故 color 只给初值）。
function RippleWater({ waterRef, initialSea, animate, tier, waterY }: { waterRef: React.RefObject<THREE.MeshStandardMaterial | null>; initialSea: string; animate: boolean; tier: PerfTier; waterY: number }) {
  const ripple = useMemo(() => createRippleDistortion(), []);
  useEffect(() => () => ripple.dispose(), [ripple]);
  useFrame((_, delta) => {
    if (animate) ripple.advance(delta);
  });
  const hi = tier === "high";
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, waterY, 0]}>
      <planeGeometry args={[80, 80]} />
      <MeshReflectorMaterial
        // 子类实例向上赋给 MeshStandardMaterial 类型 ref（只需 .color 做 lerp）
        ref={(m) => {
          waterRef.current = m;
        }}
        // 弱设备：反射分辨率/模糊大幅压低，省 GPU
        resolution={hi ? 384 : 160}
        mixBlur={1}
        mixStrength={hi ? 0.6 : 0.5}
        blur={hi ? [260, 80] : [120, 40]}
        mirror={0.04}
        depthScale={1.1}
        minDepthThreshold={0.3}
        maxDepthThreshold={1.2}
        distortionMap={ripple.texture}
        distortion={hi ? 0.06 : 0.05}
        color={initialSea}
        roughness={0.95}
        metalness={0.04}
      />
    </mesh>
  );
}

// 受情绪驱动、需平滑过渡的材质集中托管（颜色在 EmotionTint 里 lerp，故不绑 prop）
function useEmotionMaterials(init: SceneVisual) {
  const mats = useMemo(
    () => {
      // 岛体：海玻璃菲涅尔内透光。自发光(情绪色)只在掠射边缘显现 → 透光的玻璃边,
      // 棱面受光不被抹平,并保留 12% 体内微光;边缘亮度足以被 Bloom 晕成光边。
      // vertexColors:低坡偏草绿、高处偏岩灰(乘在情绪基色上,不破坏情绪反应);见 buildIslandGeometry 的 color 属性
      const island = new THREE.MeshStandardMaterial({ color: init.island, emissive: init.accent, emissiveIntensity: 1.3, flatShading: true, roughness: 0.9, metalness: 0.05, vertexColors: true });
      island.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
           float fresEdge = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6);
           totalEmissiveRadiance *= (0.06 + 0.92 * fresEdge);`,
        );
      };
      return {
        island,
        core: new THREE.MeshStandardMaterial({ color: init.accent, emissive: init.accent, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0.1 }),
        crystal: new THREE.MeshStandardMaterial({ color: init.accent, emissive: init.accent, emissiveIntensity: 1.5, roughness: 0.4 }),
        celestial: new THREE.MeshStandardMaterial({ color: init.celestial, emissive: init.celestial, emissiveIntensity: 3.2, toneMapped: false }),
      };
    },
    // 仅在首挂载用初始情绪构建；后续颜色全部走 lerp
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return mats;
}

type EmotionMats = ReturnType<typeof useEmotionMaterials>;

// 颜色总控：每帧把雾/水/岛/辉光/天体/光/天空向当前情绪目标 lerp（沉浸态）；
// 静海/reduced 态用 useLayoutEffect 在绘制前直接吸附，并 invalidate 触发一次按需渲染。
function EmotionTint({
  visual,
  animate,
  mats,
  fogRef,
  waterRef,
  hemiRef,
  dirRef,
  coreLightRef,
  glbMatsRef,
  sunMatRef,
}: {
  visual: SceneVisual;
  animate: boolean;
  mats: EmotionMats;
  fogRef: React.RefObject<THREE.Fog | null>;
  waterRef: React.RefObject<THREE.MeshStandardMaterial | null>;
  hemiRef: React.RefObject<THREE.HemisphereLight | null>;
  dirRef: React.RefObject<THREE.DirectionalLight | null>;
  coreLightRef: React.RefObject<THREE.PointLight | null>;
  // glb 岛的辉光材质（海光/光环/晶塔/心愿）；逐帧 lerp 到情绪 accent。可空（程序岛模式 / glb 未载入）。
  glbMatsRef?: React.RefObject<THREE.MeshStandardMaterial[] | null>;
  // glb 太阳材质（扁平 MeshBasicMaterial）；逐帧 lerp .color 到情绪 celestial（天体色）。
  sunMatRef?: React.RefObject<THREE.MeshBasicMaterial | null>;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const sky = useMemo(() => createSkyGradient(), []);
  useEffect(() => () => sky.dispose(), [sky]);

  const target = useMemo(
    () => ({
      sea: new THREE.Color(visual.sea),
      island: new THREE.Color(visual.island),
      accent: new THREE.Color(visual.accent),
      celestial: new THREE.Color(visual.celestial),
      skyTop: new THREE.Color(visual.skyTop),
      skyMid: new THREE.Color(visual.skyMid),
      skyBottom: new THREE.Color(visual.skyBottom),
    }),
    [visual.sea, visual.island, visual.accent, visual.celestial, visual.skyTop, visual.skyMid, visual.skyBottom],
  );

  // 当前天空三色（持久对象，逐帧向 target 逼近后重绘 16×256 渐变贴图）
  const skyCur = useMemo(
    () => ({
      top: new THREE.Color(visual.skyTop),
      mid: new THREE.Color(visual.skyMid),
      bottom: new THREE.Color(visual.skyBottom),
    }),
    // 仅首挂载用初值构建；后续走 lerp
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // t=1 即直接吸附（mount / 静海态切情绪）；0<t<1 为逐帧 lerp 系数
  const apply = (t: number) => {
    fogRef.current?.color.lerp(target.sea, t);
    waterRef.current?.color.lerp(target.sea, t);
    mats.island.color.lerp(target.island, t);
    mats.island.emissive.lerp(target.accent, t); // 玻璃边缘透光色随情绪
    mats.core.color.lerp(target.accent, t);
    mats.core.emissive.lerp(target.accent, t);
    mats.crystal.color.lerp(target.accent, t);
    mats.crystal.emissive.lerp(target.accent, t);
    mats.celestial.color.lerp(target.celestial, t);
    mats.celestial.emissive.lerp(target.celestial, t);
    hemiRef.current?.color.lerp(target.skyMid, t);
    hemiRef.current?.groundColor.lerp(target.sea, t);
    dirRef.current?.color.lerp(target.celestial, t);
    coreLightRef.current?.color.lerp(target.accent, t);
    // glb 岛辉光：海光/光环/晶塔/心愿随情绪 accent 实时变色（深海玻璃 → 暖金 → 薰衣草…）
    glbMatsRef?.current?.forEach((m) => {
      m.color.lerp(target.accent, t);
      m.emissive.lerp(target.accent, t);
    });
    if (sunMatRef?.current) sunMatRef.current.color.lerp(target.celestial, t); // 扁平日轮：只 lerp .color
    skyCur.top.lerp(target.skyTop, t);
    skyCur.mid.lerp(target.skyMid, t);
    skyCur.bottom.lerp(target.skyBottom, t);
    sky.draw(`#${skyCur.top.getHexString()}`, `#${skyCur.mid.getHexString()}`, `#${skyCur.bottom.getHexString()}`);
  };

  // 首挂载：把初始情绪颜色全部吸附到位（绘制前，无白闪）
  useLayoutEffect(() => {
    apply(1);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 静海/reduced 态切情绪：直接吸附 + 触发一次按需渲染（此时 useFrame 不连续跑）
  useLayoutEffect(() => {
    if (!animate) {
      apply(1);
      invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visual, animate]);

  // 沉浸态：逐帧平滑过渡（帧率无关，约 1.5s 收敛）
  useFrame((_, delta) => {
    if (!animate) return;
    apply(1 - Math.pow(0.05, delta));
  });

  return <primitive object={sky.texture} attach="background" />;
}

// 相机轻漂 + 指针视差（仅沉浸态）。ref 变异 + 插值，绝不 setState（r3f 头号铁律）。
function CameraRig({ animate }: { animate: boolean }) {
  const base = useMemo(() => new THREE.Vector3(0, 2.1, 7), []);
  useFrame((state, delta) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;
    const px = state.pointer.x * 0.5 + Math.sin(t * 0.18) * 0.25;
    const py = state.pointer.y * 0.28 + Math.sin(t * 0.13) * 0.12;
    const k = 1 - Math.pow(0.001, delta); // 帧率无关缓动
    state.camera.position.x += (base.x + px - state.camera.position.x) * k;
    state.camera.position.y += (base.y + py - state.camera.position.y) * k;
    state.camera.lookAt(0, 0.35, 0);
  });
  return null;
}

// 岛屿地形高度场(平面坐标)——地形网格与植被布点共用同一函数，保证草木精确贴地。
// hash 值噪声(纯 JS、确定性、无依赖)。
const ISLAND_SIZE = 9;
const ISLAND_SEG = 88;
const ISLAND_RADIUS = 3.0;
const ISLAND_PEAK = 1.7;
function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function smoothstep01(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function valueNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function islandHeight(x: number, y: number) {
  const r = Math.sqrt(x * x + y * y) / ISLAND_RADIUS;
  const fall = 1 - smoothstep01(0.15, 1.0, r); // 中心高、向外衰减
  let h = fall * ISLAND_PEAK;
  h += fall * (valueNoise(x * 0.7 + 11, y * 0.7 + 11) - 0.5) * 1.55; // 大尺度山丘(加强)
  h += fall * (1 - Math.abs(valueNoise(x * 1.05 + 5, y * 1.05 + 5) - 0.5) * 2) * 0.42; // 脊线(ridged)→ 山脊起伏
  h += fall * (valueNoise(x * 1.9, y * 1.9) - 0.5) * 0.55; // 中尺度
  h += fall * (valueNoise(x * 3.6, y * 3.6) - 0.5) * 0.22; // 细碎
  h -= smoothstep01(0.62, 1.15, r) * 1.4; // 边缘沉入海面 → 自然海岸线
  return h;
}

// 低多边形地形网格(替换原来的单锥)。flatShading 出棱面光。
function buildIslandGeometry() {
  const geo = new THREE.PlaneGeometry(ISLAND_SIZE, ISLAND_SIZE, ISLAND_SEG, ISLAND_SEG);
  const pos = geo.attributes.position;
  // 高度分层顶点色(乘在情绪基色上):近岸暖沙 → 低坡草绿 → 高处岩灰
  const colors: number[] = [];
  const cSand = new THREE.Color(1.0, 0.92, 0.7);
  const cGrass = new THREE.Color(0.56, 1.0, 0.44);
  const cRock = new THREE.Color(0.98, 0.95, 1.0);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const h = islandHeight(x, y);
    pos.setZ(i, h);
    tmp.copy(cGrass).lerp(cRock, smoothstep01(0.65, 1.7, h)); // 低坡草绿 → 高处岩灰
    tmp.lerp(cSand, 1 - smoothstep01(0.05, 0.32, h)); // 贴水线压回暖沙
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

// 在地形表面散布植被布点：拒绝采样落在指定高度带内的点，返回世界坐标 + 朝向/缩放。
// 世界坐标换算：地形 mesh 经 rotateX(-90°)，平面(px,py) → 世界(px, h, -py)。
function scatterOnIsland(count: number, seed: number, minH: number, maxH: number) {
  const out: { x: number; y: number; z: number; rot: number; s: number }[] = [];
  let tries = 0;
  while (out.length < count && tries < count * 10) {
    tries += 1;
    const ang = hash2(seed + tries * 1.7, 2.3) * Math.PI * 2;
    const rad = Math.sqrt(hash2(seed + tries * 2.9, 5.1)) * ISLAND_RADIUS * 0.92;
    const px = Math.cos(ang) * rad;
    const py = Math.sin(ang) * rad;
    const h = islandHeight(px, py);
    if (h < minH || h > maxH) continue;
    out.push({ x: px, y: h, z: -py, rot: hash2(seed + tries, 7.7) * Math.PI * 2, s: 0.7 + hash2(seed + tries, 3.1) * 0.6 });
  }
  return out;
}

// 实例化草地 + 顶点风场：每株草顶端随风摆动(底部固定)，仅沉浸态推进。
function Grass({ count, animate }: { count: number; animate: boolean }) {
  const blades = useMemo(() => scatterOnIsland(count, 31, 0.1, 1.02), [count]); // 草只长在中低坡,山顶留白
  const geo = useMemo(() => new THREE.ConeGeometry(0.055, 0.18, 5, 2), []); // 更矮更圆的草簇,不再是扎人的尖刺
  useEffect(() => () => geo.dispose(), [geo]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const shaderRef = useRef<THREE.WebGLProgramParametersWithUniforms | null>(null);
  const material = useMemo(() => {
    const m = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonGradient(), emissive: new THREE.Color("#386f4c"), emissiveIntensity: 0.32 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 };
      sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float bladeH = clamp((position.y + 0.09) / 0.18, 0.0, 1.0);
         float ph = instanceMatrix[3].x + instanceMatrix[3].z;
         float sway = sin(uTime * 1.6 + ph * 0.8) * 0.11 + sin(uTime * 2.7 + ph * 1.3) * 0.04;
         transformed.x += sway * bladeH * bladeH;
         transformed.z += sway * 0.4 * bladeH * bladeH;`,
      );
      shaderRef.current = sh;
    };
    return m;
  }, []);
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const cCool = new THREE.Color("#6ab47e");
    const cWarm = new THREE.Color("#a6d27f");
    const col = new THREE.Color();
    blades.forEach((b, i) => {
      dummy.position.set(b.x, b.y + 0.09 * b.s, b.z);
      dummy.rotation.set(0, b.rot, 0);
      dummy.scale.setScalar(b.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      col.copy(cCool).lerp(cWarm, hash2(b.x * 5.1, b.z * 5.1)); // 冷暖两种绿,逐株打散
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [blades]);
  useFrame((state) => {
    if (animate && shaderRef.current) shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return <instancedMesh ref={meshRef} args={[geo, material, blades.length]} frustumCulled={false} />;
}

// 低多边形树(数量随成长)：树干 + 二段树冠，静态栽在地形上(随整岛轻浮动)。
function Trees({ count }: { count: number }) {
  const trees = useMemo(() => scatterOnIsland(count, 97, 0.35, 1.05), [count]);
  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.035, 0.06, 0.5, 5), []);
  const leafBig = useMemo(() => new THREE.IcosahedronGeometry(0.34, 0), []);
  const leafTop = useMemo(() => new THREE.IcosahedronGeometry(0.22, 0), []);
  const pineGeo = useMemo(() => new THREE.ConeGeometry(0.3, 0.55, 6), []);
  const trunkMat = useMemo(() => new THREE.MeshToonMaterial({ color: "#5b4636", gradientMap: toonGradient() }), []);
  const leafMat = useMemo(() => new THREE.MeshToonMaterial({ color: "#4f9e72", gradientMap: toonGradient() }), []);
  const leaf2Mat = useMemo(() => new THREE.MeshToonMaterial({ color: "#6fb880", gradientMap: toonGradient() }), []); // 暖亮绿做树冠层次
  const pineMat = useMemo(() => new THREE.MeshToonMaterial({ color: "#3f8a64", gradientMap: toonGradient() }), []); // 针叶冷绿
  useEffect(
    () => () => {
      [trunkGeo, leafBig, leafTop, pineGeo].forEach((g) => g.dispose());
      [trunkMat, leafMat, leaf2Mat, pineMat].forEach((m) => m.dispose());
    },
    [trunkGeo, leafBig, leafTop, pineGeo, trunkMat, leafMat, leaf2Mat, pineMat],
  );
  return (
    <>
      {trees.map((t, i) => {
        const conifer = hash2(97 + i, 8.8) < 0.34; // ~1/3 针叶松
        const warm = hash2(97 + i, 4.5) > 0.58;
        return (
          <group key={i} position={[t.x, t.y, t.z]} rotation={[0, t.rot, 0]} scale={t.s}>
            <mesh geometry={trunkGeo} material={trunkMat} position={[0, 0.25, 0]}>
              <Outlines thickness={0.015} color="#243042" />
            </mesh>
            {conifer ? (
              <>
                <mesh geometry={pineGeo} material={pineMat} position={[0, 0.6, 0]}>
                  <Outlines thickness={0.012} color="#243042" />
                </mesh>
                <mesh geometry={pineGeo} material={pineMat} position={[0, 0.92, 0]} scale={0.64}>
                  <Outlines thickness={0.012} color="#243042" />
                </mesh>
              </>
            ) : (
              <>
                <mesh geometry={leafBig} material={warm ? leaf2Mat : leafMat} position={[0, 0.62, 0]}>
                  <Outlines thickness={0.012} color="#243042" />
                </mesh>
                <mesh geometry={leafTop} material={leaf2Mat} position={[0, 0.92, 0.02]}>
                  <Outlines thickness={0.012} color="#243042" />
                </mesh>
              </>
            )}
          </group>
        );
      })}
    </>
  );
}

// 野花：贴着草丛的小彩点,颜色随情绪 accent + 几种暖色,给山坡添生气。
function Flowers({ count, accent }: { count: number; accent: string }) {
  const spots = useMemo(() => scatterOnIsland(count, 53, 0.15, 0.92), [count]);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.05, 0), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial(), []); // 不受光,小花永远是亮色点(instanceColor 上色)
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const d = new THREE.Object3D();
    const palette = [new THREE.Color(accent), new THREE.Color("#fff3df"), new THREE.Color("#f3d27a"), new THREE.Color("#ef9ab4")];
    spots.forEach((s, i) => {
      d.position.set(s.x, s.y + 0.14 * s.s, s.z);
      d.scale.setScalar(0.7 + (i % 3) * 0.25);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      mesh.setColorAt(i, palette[Math.floor(hash2(s.x * 3.3, s.z * 7.7) * palette.length) % palette.length]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [spots, accent]);
  return <instancedMesh ref={ref} args={[geo, mat, spots.length]} frustumCulled={false} />;
}

// 低多边形礁石:灰岩,非均匀缩放 + 随机翻滚,点缀山坡结构感。
function Rocks({ count }: { count: number }) {
  const spots = useMemo(() => scatterOnIsland(count, 71, 0.2, 1.15), [count]);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.16, 0), []);
  const mat = useMemo(() => new THREE.MeshToonMaterial({ color: "#8b919b", gradientMap: toonGradient() }), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const d = new THREE.Object3D();
    spots.forEach((s, i) => {
      d.position.set(s.x, s.y + 0.04 * s.s, s.z);
      d.rotation.set(hash2(s.x, 1.1) * 3, s.rot, hash2(s.z, 2.2) * 1.4);
      d.scale.set(s.s * (0.8 + hash2(s.x, 3.3) * 0.6), s.s * (0.55 + hash2(s.z, 4.4) * 0.5), s.s * (0.8 + hash2(s.x, 5.5) * 0.6));
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return <instancedMesh ref={ref} args={[geo, mat, spots.length]} frustumCulled={false} />;
}

// 山顶薄雪:近峰顶散布的扁平白色雪块,贴着坡面。
function SnowCaps({ count, night }: { count: number; night: boolean }) {
  const spots = useMemo(() => scatterOnIsland(count, 88, 1.32, 1.72), [count]);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.24, 0), []);
  const mat = useMemo(
    () => new THREE.MeshToonMaterial({ color: "#eef5f7", gradientMap: toonGradient(), emissive: new THREE.Color(night ? "#86c4e0" : "#d8e6ec"), emissiveIntensity: night ? 0.5 : 0.22 }),
    [night],
  );
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const d = new THREE.Object3D();
    spots.forEach((s, i) => {
      d.position.set(s.x, s.y - 0.04 * s.s, s.z);
      d.rotation.set(0, s.rot, 0);
      d.scale.set(s.s * (1 + hash2(s.x, 6.1) * 0.7), s.s * 0.4, s.s * (1 + hash2(s.z, 6.2) * 0.7));
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return <instancedMesh ref={ref} args={[geo, mat, spots.length]} frustumCulled={false} />;
}

// 蜿蜒石径:从山脚螺旋盘上,一路通到峰顶辉光核。踩着地形高度铺,逐块朝路径方向。
function Path() {
  const tiles = useMemo(() => {
    const pts: { x: number; z: number; y: number }[] = [];
    const steps = 60;
    const startAng = 2.2;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const ang = startAng + t * Math.PI * 2.3; // 约 1.15 圈,前面看是一条连贯的路
      const r = ISLAND_RADIUS * (0.86 - t * 0.74); // 山脚 → 近峰顶
      const px = Math.cos(ang) * r;
      const py = Math.sin(ang) * r;
      const h = islandHeight(px, py);
      if (h < 0.06) continue; // 不铺进水里
      pts.push({ x: px, z: -py, y: h + 0.02 });
    }
    return pts.map((p, i) => {
      const nxt = pts[Math.min(i + 1, pts.length - 1)];
      const yaw = Math.atan2(nxt.x - p.x, nxt.z - p.z);
      return { ...p, yaw, s: 0.85 + hash2(p.x * 9.1, p.z * 9.1) * 0.4 };
    });
  }, []);
  const geo = useMemo(() => new THREE.BoxGeometry(0.36, 0.05, 0.28), []);
  const mat = useMemo(() => new THREE.MeshToonMaterial({ color: "#cdbf9f", gradientMap: toonGradient() }), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const d = new THREE.Object3D();
    tiles.forEach((t, i) => {
      d.position.set(t.x, t.y, t.z);
      d.rotation.set(0, t.yaw, 0);
      d.scale.set(t.s, 1, t.s);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [tiles]);
  return <instancedMesh ref={ref} args={[geo, mat, tiles.length]} frustumCulled={false} />;
}

// 瀑布水流贴图:竖向白色断流条,UV 向下滚动 → 落水感。
function createFallTexture() {
  const W = 8;
  const H = 48;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, W, H);
    for (let x = 0; x < W; x++) {
      const base = 0.3 + 0.55 * Math.abs(Math.sin(x * 1.7 + 1));
      for (let y = 0; y < H; y++) {
        if ((y + x * 3) % 7 < 5) {
          ctx.fillStyle = `rgba(255,255,255,${base})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 3);
  return { texture, advance: (dt: number) => (texture.offset.y -= dt * 0.9), dispose: () => texture.dispose() };
}

// 山间小湖 + 瀑布:湖嵌在山坡上,水从外缘垂落到海面,底部一圈浪花。
function LakeAndFall({ animate }: { animate: boolean }) {
  const LPX = -0.6;
  const LPY = -1.0; // 平面坐标 → 世界(px, h, -py);py 取负 → 世界 +z 朝相机的正面坡(左前开阔处)
  const lakeY = islandHeight(LPX, LPY);
  const wx = LPX;
  const wz = -LPY;
  const out = useMemo(() => new THREE.Vector2(wx, wz).normalize(), [wx, wz]); // 朝海的水平方向
  const fall = useMemo(() => createFallTexture(), []);
  useEffect(() => () => fall.dispose(), [fall]);
  useFrame((_, dt) => {
    if (animate) fall.advance(dt);
  });
  const fallH = lakeY + 0.4;
  return (
    <group>
      {/* 湖面 */}
      <mesh position={[wx, lakeY + 0.01, wz]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 24]} />
        <meshStandardMaterial color="#7fd0e0" emissive="#347f90" emissiveIntensity={0.45} transparent opacity={0.86} roughness={0.2} metalness={0.3} />
      </mesh>
      {/* 瀑布(竖帘,朝海面方向) */}
      <mesh position={[wx + out.x * 0.6, lakeY * 0.5, wz + out.y * 0.6]} rotation={[0, Math.atan2(out.x, out.y), 0]}>
        <planeGeometry args={[0.34, fallH]} />
        <meshBasicMaterial map={fall.texture} color="#eaf8fb" transparent opacity={0.82} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {/* 落水浪花 */}
      <mesh position={[wx + out.x * 1.05, 0.05, wz + out.y * 1.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.3, 18]} />
        <meshBasicMaterial color="#eef9fb" transparent opacity={0.5} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

// 飞鸟：低多边形剪影,沿高空缓慢环绕岛屿滑翔 + 振翅(仅沉浸态)。静态时停在散开的初始位。
function Bird({ geo, mat, radius, height, speed, phase, animate }: { geo: THREE.BufferGeometry; mat: THREE.Material; radius: number; height: number; speed: number; phase: number; animate: boolean }) {
  const g = useRef<THREE.Group>(null);
  const lw = useRef<THREE.Mesh>(null);
  const rw = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!animate || !g.current) return;
    const tt = state.clock.elapsedTime * speed + phase;
    g.current.position.set(Math.cos(tt) * radius, height + Math.sin(tt * 0.8) * 0.3, Math.sin(tt) * radius * 0.7 - 2);
    g.current.rotation.y = -tt;
    const flap = Math.sin(state.clock.elapsedTime * 7 + phase) * 0.5;
    if (lw.current) lw.current.rotation.z = 0.25 + flap;
    if (rw.current) rw.current.rotation.z = -0.25 - flap;
  });
  return (
    <group ref={g} scale={0.5} position={[Math.cos(phase) * radius, height, Math.sin(phase) * radius * 0.7 - 2]} rotation={[0, -phase, 0]}>
      <mesh ref={lw} geometry={geo} material={mat} position={[0.22, 0, 0]} rotation={[0, 0, 0.25]} />
      <mesh ref={rw} geometry={geo} material={mat} position={[-0.22, 0, 0]} rotation={[0, 0, -0.25]} />
    </group>
  );
}

function Birds({ count, animate }: { count: number; animate: boolean }) {
  const geo = useMemo(() => new THREE.BoxGeometry(0.44, 0.015, 0.13), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3a4a5a", roughness: 1 }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const flock = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ radius: 4.5 + i * 0.7, height: 3.4 + (i % 3) * 0.6, speed: 0.1 + i * 0.015, phase: i * 1.7 })),
    [count],
  );
  return (
    <>
      {flock.map((b, i) => (
        <Bird key={i} geo={geo} mat={mat} radius={b.radius} height={b.height} speed={b.speed} phase={b.phase} animate={animate} />
      ))}
    </>
  );
}

// 心愿之光：心事/记忆化作辉光球，从岛上缓缓升起→长大→消散，循环上浮(仅沉浸态)。
// 强自发光 → 被 Bloom 晕成光球。最贴《心屿》主题的"魔法"。
function WishLights({ count, color, animate }: { count: number; color: string; animate: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geo = useMemo(() => new THREE.SphereGeometry(0.07, 8, 8), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3, toneMapped: false }), [color]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (hash2(i + 1, 2.2) - 0.5) * 3,
        z: (hash2(i + 1, 9.4) - 0.5) * 3,
        phase: hash2(i + 1, 4.8) * 4,
        speed: 0.28 + hash2(i + 1, 6.6) * 0.3,
      })),
    [count],
  );
  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = animate ? state.clock.elapsedTime : 0;
    seeds.forEach((s, i) => {
      const cycle = (t * s.speed + s.phase) % 4; // 0..4 上浮周期
      const y = 1.0 + cycle; // 从 y=1 升到 y=5
      const fade = Math.sin((cycle / 4) * Math.PI); // 两端 0、中段 1
      dummy.position.set(s.x + Math.sin(t * 0.5 + s.phase) * 0.25, y, s.z);
      dummy.scale.setScalar(0.05 + fade * 1.1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={meshRef} args={[geo, mat, count]} frustumCulled={false} />;
}

// 流星：夜景里偶尔划过的拉长辉光(实例化,各自周期错开)。仅 visual.stars 的夜场 + 沉浸态。
function ShootingStars({ count, animate }: { count: number; animate: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geo = useMemo(() => new THREE.SphereGeometry(0.06, 6, 6), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#eaf2ff", emissiveIntensity: 4, toneMapped: false }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        period: 7 + hash2(i + 1, 3.3) * 6,
        offset: hash2(i + 1, 8.1) * 12,
        startX: 4 + hash2(i + 1, 2.1) * 4,
        startY: 5 + hash2(i + 1, 5.5) * 2,
        z: -8 - hash2(i + 1, 1.7) * 4,
      })),
    [count],
  );
  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = animate ? state.clock.elapsedTime : 0;
    seeds.forEach((s, i) => {
      const local = (t + s.offset) % s.period;
      if (local > 1.1) {
        dummy.scale.setScalar(0);
        dummy.position.set(0, -100, 0);
      } else {
        const p = local / 1.1; // 0..1
        const vis = Math.sin(p * Math.PI); // 两端淡入淡出
        dummy.position.set(s.startX - p * 9, s.startY - p * 4, s.z);
        dummy.rotation.set(0, 0, -0.42);
        dummy.scale.set(0.3 + vis * 1.6, 0.12, 0.12); // 沿 x 拉长成尾迹
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={meshRef} args={[geo, mat, count]} frustumCulled={false} />;
}

// 极光：夜空缓缓流动的光帘。自定义 GLSL — 垂直光帘 + 噪声流动 + 上下渐隐 + 青绿↔紫渐变,加性混合发光。
const AURORA_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const AURORA_FRAG = `
precision mediump float;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec2 vUv;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(vec2 p) {
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  fp = fp * fp * (3.0 - 2.0 * fp);
  float a = mix(hash(ip.x + ip.y * 57.0), hash(ip.x + 1.0 + ip.y * 57.0), fp.x);
  float b = mix(hash(ip.x + (ip.y + 1.0) * 57.0), hash(ip.x + 1.0 + (ip.y + 1.0) * 57.0), fp.x);
  return mix(a, b, fp.y);
}
void main() {
  vec2 uv = vUv;
  float curtain = noise(vec2(uv.x * 6.0 + uTime * 0.15, uv.y * 1.5 - uTime * 0.05));
  curtain += noise(vec2(uv.x * 12.0 - uTime * 0.1, uv.y * 2.0)) * 0.5;
  curtain = pow(clamp(curtain, 0.0, 1.5), 2.0);
  float vfade = smoothstep(0.0, 0.28, uv.y) * (1.0 - smoothstep(0.55, 1.0, uv.y));
  float intensity = curtain * vfade;
  vec3 col = mix(uColorA, uColorB, uv.y);
  gl_FragColor = vec4(col * intensity * 1.6, intensity * 0.7);
}`;
function Aurora({ animate }: { animate: boolean }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color("#3ad6a0") },
      uColorB: { value: new THREE.Color("#7a5cff") },
    }),
    [],
  );
  useFrame((state) => {
    if (animate && matRef.current) matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    <mesh position={[0, 6.6, -16]}>
      <planeGeometry args={[34, 11]} />
      <shaderMaterial ref={matRef} uniforms={uniforms} vertexShader={AURORA_VERT} fragmentShader={AURORA_FRAG} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
    </mesh>
  );
}

// 远处的鲸：海平线那头偶尔拱起脊背 + 扬尾 + 沉没的低多边形鲸,罕见惊喜(仅沉浸态)。
function Whale({ animate }: { animate: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const bodyGeo = useMemo(() => new THREE.IcosahedronGeometry(0.6, 1), []);
  const flukeGeo = useMemo(() => new THREE.ConeGeometry(0.5, 0.5, 4), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2a3850", roughness: 0.85, flatShading: true }), []);
  useEffect(
    () => () => {
      bodyGeo.dispose();
      flukeGeo.dispose();
      mat.dispose();
    },
    [bodyGeo, flukeGeo, mat],
  );
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    if (!animate) {
      g.position.y = -8;
      return;
    }
    const period = 20;
    const active = 6;
    const local = (state.clock.elapsedTime + 1.5) % period;
    if (local > active) {
      g.position.y = -8; // 沉入海面下,隐藏
      return;
    }
    const p = local / active; // 0..1
    const arc = Math.sin(p * Math.PI); // 0..1..0
    g.position.set(9 - p * 3.5, -1.1 + arc * 1.5, -11);
    g.rotation.set(-0.4 + p * 1.0, 0.6, 0); // 前滚成弓背入水的弧
  });
  return (
    <group ref={ref} position={[9, -8, -11]} scale={1.3} rotation={[0, 0.6, 0]}>
      <mesh geometry={bodyGeo} material={mat} scale={[0.75, 0.68, 2.3]} />
      <mesh geometry={flukeGeo} material={mat} position={[0, 0.1, -1.55]} rotation={[0.5, 0, 0]} scale={[1.1, 0.18, 0.7]} />
    </group>
  );
}

// 低多边形岛屿：地形 + 草木(随成长) + 顶部情绪辉光核 + 漂浮心象结晶；整岛轻浮动(坐于海面的"呼吸")
// 全局卡通描边（后期边缘检测）：从深度缓冲检出物体边界，画柔和青墨线 —— 不受「单一大网格」限制，
// 连山体也能干净描边（反向外壳法做不到）。viewZ 线性化后比较邻域，只在真正的物体边界出线，内部棱面不噪。
const OUTLINE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uThickness;
uniform float uThreshold;
uniform float uOpacity;
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 px = uThickness / resolution;
  float zc = getViewZ(depth);
  float z1 = getViewZ(readDepth(uv + vec2(px.x, 0.0)));
  float z2 = getViewZ(readDepth(uv - vec2(px.x, 0.0)));
  float z3 = getViewZ(readDepth(uv + vec2(0.0, px.y)));
  float z4 = getViewZ(readDepth(uv - vec2(0.0, px.y)));
  float e = abs(zc - z1) + abs(zc - z2) + abs(zc - z3) + abs(zc - z4);
  float g = smoothstep(uThreshold, uThreshold * 2.5, e / max(0.6, -zc));
  outputColor = vec4(mix(inputColor.rgb, uColor, g * uOpacity), inputColor.a);
}
`;
class ToonOutlineEffect extends Effect {
  constructor() {
    super("ToonOutlineEffect", OUTLINE_FRAG, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ["uColor", new THREE.Uniform(new THREE.Color("#1c333c"))], // 柔和青墨，贴合治愈气质
        ["uThickness", new THREE.Uniform(2.0)],                    // 采样半径（像素）→ 更粗的卡通线
        ["uThreshold", new THREE.Uniform(0.32)],                   // 更低 → 连物体间的边界也描
        ["uOpacity", new THREE.Uniform(1.0)],
      ]),
    });
  }
}
const ToonOutline = forwardRef<ToonOutlineEffect>((_props, ref) => {
  const effect = useMemo(() => new ToonOutlineEffect(), []);
  return <primitive ref={ref} object={effect} dispose={null} />;
});

// 克隆 glb → 每个网格换共享 MeshToonMaterial（保留底色，由情绪灯光重新打光）；
// 名含 "emissive" 的改自发光 StandardMaterial。其中海光/光环/晶塔/心愿（非宝石）收集进 accentMats，
// 交给 EmotionTint 逐帧 lerp 到当前情绪 accent —— 这是 glb 岛的「实时情绪辉光」。
function toonifyIsland(src: THREE.Object3D, grad: THREE.Texture) {
  const root = src.clone(true);
  const accentMats: THREE.MeshStandardMaterial[] = [];
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
      const col = lit ? std.emissive.clone() : base.clone();
      const sm = new THREE.MeshStandardMaterial({ color: col, emissive: col.clone(), emissiveIntensity: 0.9, toneMapped: false, transparent: std.transparent, opacity: std.opacity ?? 1 });
      if (!/gem/i.test(name)) accentMats.push(sm); // 宝石保留各自彩色；其余辉光随情绪
      out = sm;
    } else {
      out = new THREE.MeshToonMaterial({ color: base, gradientMap: grad });
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
  return { root, accentMats };
}

// 卸载时释放 toon 克隆体里我们 new 出来的所有材质——几何体共享自缓存 GLTF，绝不在此 dispose。
function disposeToonMaterials(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat?.dispose());
  });
}

function GlbIsland({ matsRef, animate }: { matsRef: React.MutableRefObject<THREE.MeshStandardMaterial[] | null>; animate: boolean }) {
  const { scene } = useGLTF(GLB_ISLAND_URL);
  const grad = useMemo(() => toonGradient(), []);
  const { root, accentMats } = useMemo(() => toonifyIsland(scene, grad), [scene, grad]);
  // 渲染期写入：早于 EmotionTint 的 useLayoutEffect(apply(1))，确保首帧情绪辉光已吸附到位
  matsRef.current = accentMats;
  // 卸载时释放本组件 new 出来的 toon 材质 + 渐变贴图（几何体共享自缓存 GLTF，不动）。
  useEffect(() => () => { disposeToonMaterials(root); grad.dispose(); }, [root, grad]);
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!animate || !groupRef.current) return;
    groupRef.current.position.y = GLB_Y + Math.sin(state.clock.elapsedTime * 0.5) * 0.06; // 轻浮动呼吸
  });
  return (
    <group ref={groupRef} position={[0, GLB_Y, 0]} scale={GLB_SCALE}>
      <primitive object={root} />
    </group>
  );
}

// ───────── Blender 背景生灵 / 天体 glb（与岛同款 toon 工艺；高画质档自动获全局描边）─────────
const BG_CLOUD_URL = "/models/xy_bg_cloud.glb";
const BG_BIRD_URL = "/models/xy_bg_bird.glb";
const BG_TURTLE_URL = "/models/xy_creature_turtle.glb";
const BG_SUN_URL = "/models/xy_bg_sun.glb";
[BG_CLOUD_URL, BG_BIRD_URL, BG_TURTLE_URL, BG_SUN_URL].forEach((u) => useGLTF.preload(u));

// 通用 toon 克隆：每网格换 MeshToonMaterial（保留底色，由情绪天光重新打光）；名含 emissive 的发光。
function toonClone(src: THREE.Object3D, grad: THREE.Texture): THREE.Object3D {
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
      const col = lit ? std.emissive.clone() : base.clone();
      out = new THREE.MeshStandardMaterial({ color: col, emissive: col.clone(), emissiveIntensity: 2.0, toneMapped: false, transparent: std.transparent, opacity: std.opacity ?? 1 });
    } else {
      out = new THREE.MeshToonMaterial({ color: base, gradientMap: grad });
    }
    cache.set(m, out);
    return out;
  };
  root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh) return;
    me.material = Array.isArray(me.material) ? me.material.map(conv) : conv(me.material as THREE.Material);
    me.castShadow = false;
    me.receiveShadow = false;
  });
  return root;
}

// 漂浮云朵：低多边形 puff，缓缓横移、循环回绕；由情绪天光重新染色。
function Clouds({ animate }: { animate: boolean }) {
  const { scene } = useGLTF(BG_CLOUD_URL);
  const grad = useMemo(() => toonGradient(), []);
  const items = useMemo(() => {
    const variants = ["Cloud1", "Cloud2", "Cloud3"].map((n) => scene.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
    if (variants.length === 0) return []; // glb 缺节点名 → 避免 toonClone(undefined) 抛错使整个 Canvas 崩
    const specs = [
      { v: 0, x: -3.6, y: 4.7, z: -13, s: 1.4, sp: 0.4 },
      { v: 2, x: 3.8, y: 5.2, z: -14, s: 1.6, sp: 0.3 },
      { v: 1, x: -0.2, y: 5.8, z: -17, s: 1.5, sp: 0.25 },
      { v: 0, x: -6.5, y: 5.6, z: -16, s: 1.3, sp: 0.45 },
      { v: 2, x: 6.2, y: 4.3, z: -12, s: 1.3, sp: 0.5 },
    ];
    return specs.map((sp) => ({ obj: toonClone(variants[sp.v] ?? variants[0], grad), x: sp.x, y: sp.y, z: sp.z, s: sp.s, sp: sp.sp }));
  }, [scene, grad]);
  useEffect(() => () => { items.forEach((it) => disposeToonMaterials(it.obj)); grad.dispose(); }, [items, grad]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame((_, delta) => {
    if (!animate) return;
    items.forEach((it, i) => {
      const g = refs.current[i];
      if (!g) return;
      g.position.x += it.sp * delta;
      if (g.position.x > 17) g.position.x = -17;
    });
  });
  return (
    <>
      {items.map((it, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el)} position={[it.x, it.y, it.z]} scale={it.s}>
          <primitive object={it.obj} />
        </group>
      ))}
    </>
  );
}

// 小鸟群：glb 小鸟绕岛盘旋，翅膀拍动（WingL/WingR 子节点）。
function GlbBirds({ count, animate }: { count: number; animate: boolean }) {
  const { scene } = useGLTF(BG_BIRD_URL);
  const grad = useMemo(() => toonGradient(), []);
  const birds = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const obj = toonClone(scene, grad);
      return {
        obj,
        wingL: obj.getObjectByName("WingL") as THREE.Object3D | undefined,
        wingR: obj.getObjectByName("WingR") as THREE.Object3D | undefined,
        radius: 5.2 + i * 0.9,
        height: 4.4 + (i % 3) * 0.7,
        speed: 0.12 + i * 0.018,
        phase: i * 1.7,
      };
    });
  }, [scene, count, grad]);
  useEffect(() => () => { birds.forEach((b) => disposeToonMaterials(b.obj)); grad.dispose(); }, [birds, grad]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;
    birds.forEach((b, i) => {
      const g = refs.current[i];
      if (!g) return;
      const tt = t * b.speed + b.phase;
      g.position.set(Math.cos(tt) * b.radius, b.height + Math.sin(tt * 0.8) * 0.3, Math.sin(tt) * b.radius * 0.7 - 4);
      g.rotation.y = -tt + Math.PI / 2;
      const flap = Math.sin(t * 8 + b.phase) * 0.6;
      if (b.wingL) b.wingL.rotation.z = flap;
      if (b.wingR) b.wingR.rotation.z = -flap;
    });
  });
  return (
    <>
      {birds.map((b, i) => (
        <group
          key={i}
          ref={(el) => (refs.current[i] = el)}
          scale={0.5}
          position={[Math.cos(b.phase) * b.radius, b.height, Math.sin(b.phase) * b.radius * 0.7 - 4]}
        >
          <primitive object={b.obj} />
        </group>
      ))}
    </>
  );
}

// 海龟：在海面缓缓画圈巡游、半潜出水（倒影可见），前鳍轻划。
function Turtle({ animate }: { animate: boolean }) {
  const { scene } = useGLTF(BG_TURTLE_URL);
  const grad = useMemo(() => toonGradient(), []);
  const obj = useMemo(() => toonClone(scene, grad), [scene, grad]);
  useEffect(() => () => { disposeToonMaterials(obj); grad.dispose(); }, [obj, grad]);
  const flipL = useMemo(() => obj.getObjectByName("FlipperL") as THREE.Object3D | undefined, [obj]);
  const flipR = useMemo(() => obj.getObjectByName("FlipperR") as THREE.Object3D | undefined, [obj]);
  const ref = useRef<THREE.Group>(null);
  const turtleY = GLB_WATER_Y + TURTLE_WATERLINE_OFFSET_Y;
  const turtleRestZ = TURTLE_SWIM_CENTER_Z + TURTLE_SWIM_RADIUS_Z;
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    if (!animate) {
      g.position.set(2.3, turtleY, turtleRestZ);
      g.rotation.y = -1.1;
      return;
    }
    const t = state.clock.elapsedTime * 0.1;
    g.position.set(Math.cos(t) * 2.6, turtleY + Math.sin(t * 3) * 0.04, TURTLE_SWIM_CENTER_Z + Math.sin(t) * TURTLE_SWIM_RADIUS_Z);
    g.rotation.y = -t - Math.PI / 2;
    const paddle = Math.sin(state.clock.elapsedTime * 1.5) * 0.45;
    if (flipL) flipL.rotation.z = paddle;
    if (flipR) flipR.rotation.z = -paddle;
  });
  return (
    <group ref={ref} scale={TURTLE_SCALE} position={[2.3, turtleY, turtleRestZ]}>
      <primitive object={obj} />
    </group>
  );
}

// 太阳：Blender 建模的辐射暖阳。专属 **tone-mapped** 材质（不再 HDR 爆白）→ 暖金日轮 + 光芒清晰可辨，
// Bloom 只加一圈柔晕；颜色由 EmotionTint 随情绪 celestial lerp（sunMatRef）。核心 mesh 作 god-rays 光源。
function GlbSun({ setSunMesh, sunMatRef, initialCelestial }: { setSunMesh: (m: THREE.Mesh) => void; sunMatRef: React.RefObject<THREE.MeshBasicMaterial | null>; initialCelestial: string }) {
  const { scene } = useGLTF(BG_SUN_URL);
  const built = useMemo(() => {
    const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(initialCelestial), toneMapped: true }); // 扁平不打光 → 卡通日轮 + 全局描边裹边，不再爆白
    const root = scene.clone(true);
    let core: THREE.Mesh | null = null;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = sunMat;
      if (/core/i.test(m.name || "")) core = m;
    });
    return { root, core, sunMat };
  }, [scene, initialCelestial]);
  sunMatRef.current = built.sunMat; // 渲染期写入，供 EmotionTint 逐帧染色
  useEffect(() => {
    if (built.core) setSunMesh(built.core);
    return () => { built.sunMat.dispose(); };
  }, [built, setSunMesh]);
  return (
    <group position={[3.0, 3.1, -6]} rotation={[0, Math.PI, 0]} scale={1.05}>
      <primitive object={built.root} />
      <pointLight color={initialCelestial} intensity={28} distance={40} decay={1.4} />
    </group>
  );
}

function Island({ mats, features = [], animate, coreLightRef, tier, accent, night }: { mats: EmotionMats; features?: string[]; animate: boolean; coreLightRef: React.RefObject<THREE.PointLight | null>; tier: PerfTier; accent: string; night: boolean }) {
  const terrain = useMemo(() => buildIslandGeometry(), []);
  useEffect(() => () => terrain.dispose(), [terrain]);

  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!animate || !groupRef.current) return;
    groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.06; // 轻浮动呼吸
  });

  // 成长可视化：草木密度随岛屿元素(features)增多而繁茂；弱设备减量
  const lush = Math.min(8, features.length);
  const grassCount = (tier === "high" ? 540 : 200) + lush * (tier === "high" ? 60 : 20); // 矮草要更密才成片
  const treeCount = Math.min(tier === "high" ? 16 : 9, (tier === "high" ? 7 : 4) + lush); // 多栽点树,别让草尖唱主角
  const flowerCount = (tier === "high" ? 40 : 16) + lush * 4;
  const rockCount = Math.min(tier === "high" ? 12 : 6, 4 + lush);
  const snowCount = tier === "high" ? 14 : 7;

  const coreCount = Math.min(6, Math.max(1, features.length || 1));
  const crystals = useMemo(
    () =>
      Array.from({ length: coreCount }, (_, i) => {
        const a = (i / coreCount) * Math.PI * 2;
        const r = 1.3 + (i % 2) * 0.6;
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 1.3 + (i % 3) * 0.35, s: 0.1 + (i % 3) * 0.04 };
      }),
    [coreCount],
  );

  return (
    <group ref={groupRef}>
      {/* 主岛体：程序地形，flatShading 出棱面光，颜色由 EmotionTint 驱动 */}
      <mesh geometry={terrain} material={mats.island} rotation={[-Math.PI / 2, 0, 0]} />
      {/* 植被：随风草地 + 低多边形树，密度随成长 */}
      <Grass count={grassCount} animate={animate} />
      <Trees count={treeCount} />
      <Flowers count={flowerCount} accent={accent} />
      <Rocks count={rockCount} />
      <SnowCaps count={snowCount} night={night} />
      <Path />
      <LakeAndFall animate={animate} />
      {/* 近岸浪花:贴水线一圈柔白雾环,把岛"放"在海面上;夜里泛冷光 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[2.62, 3.2, 56]} />
        <meshBasicMaterial color={night ? "#bfe9f5" : "#e2f3f4"} transparent opacity={night ? 0.46 : 0.32} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* 顶部情绪辉光核：随情绪 accent 变色，呼吸式浮动，局部点光晕染地形 */}
      <Float speed={animate ? 1.4 : 0} rotationIntensity={animate ? 0.5 : 0} floatIntensity={animate ? 0.8 : 0}>
        <mesh position={[0, 1.95, 0]} material={mats.core}>
          <icosahedronGeometry args={[0.2, 0]} />
          <pointLight ref={coreLightRef} intensity={5.5} distance={7} decay={1.6} />
        </mesh>
      </Float>
      {/* 心象结晶：每个岛屿元素一枚漂浮辉光晶体，悬于山坡上方，呼应「岛屿生长」 */}
      {crystals.map((c, i) => (
        <Float key={i} speed={animate ? 1.1 + i * 0.1 : 0} floatIntensity={animate ? 0.7 : 0} rotationIntensity={animate ? 0.4 : 0}>
          <mesh position={[c.x, c.y, c.z]} material={mats.crystal}>
            <octahedronGeometry args={[c.s, 0]} />
          </mesh>
        </Float>
      ))}
    </group>
  );
}

function SceneContents({ visual, features, animate, tier }: Props & { tier: PerfTier }) {
  const hi = tier === "high";
  const [initial] = useState(visual); // 首帧情绪，用于构建初始材质/几何参数（捕获后不变）
  const mats = useEmotionMaterials(initial);

  const fogRef = useRef<THREE.Fog>(null);
  const waterRef = useRef<THREE.MeshStandardMaterial>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const dirRef = useRef<THREE.DirectionalLight>(null);
  const coreLightRef = useRef<THREE.PointLight>(null);
  const glbMatsRef = useRef<THREE.MeshStandardMaterial[] | null>(null); // glb 岛辉光材质，交 EmotionTint 逐帧染色
  const sunMatRef = useRef<THREE.MeshBasicMaterial | null>(null); // glb 太阳材质（扁平），交 EmotionTint 逐帧染色（celestial）
  // 天体 mesh 作 god rays 的光源；用 state 持有(回调 ref),编译好后再挂 GodRays 效果
  const [sunMesh, setSunMesh] = useState<THREE.Mesh | null>(null);

  return (
    <>
      <EmotionTint
        visual={visual}
        animate={animate}
        mats={mats}
        fogRef={fogRef}
        waterRef={waterRef}
        hemiRef={hemiRef}
        dirRef={dirRef}
        coreLightRef={coreLightRef}
        glbMatsRef={glbMatsRef}
        sunMatRef={sunMatRef}
      />
      <fog ref={fogRef} attach="fog" args={[initial.sea, 9, 26]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight ref={hemiRef} args={[initial.skyMid, initial.sea, 0.7]} />
      <directionalLight ref={dirRef} position={[5, 6, 2]} intensity={1.1} color={initial.celestial} />

      {/* 天体（强自发光，被 Bloom 晕成主光，并作 god rays 光源）。glb 模式用 Blender 辐射暖阳 */}
      {USE_GLB_ISLAND ? (
        <GlbSun setSunMesh={setSunMesh} sunMatRef={sunMatRef} initialCelestial={initial.celestial} />
      ) : (
        <group position={[5.5, 4.2, -6]}>
          <mesh ref={setSunMesh} material={mats.celestial}>
            <sphereGeometry args={[0.9, 24, 24]} />
          </mesh>
          <pointLight color={initial.celestial} intensity={28} distance={40} decay={1.4} />
        </group>
      )}

      {USE_GLB_ISLAND ? (
        <>
          {/* Blender 真实建模岛屿，套 toon 材质 + 情绪辉光（见 GlbIsland / toonifyIsland） */}
          <GlbIsland matsRef={glbMatsRef} animate={animate} />
          {/* 情绪核心点光：从悬浮岛中心向外晕染，颜色随 accent 由 EmotionTint 驱动 */}
          <pointLight ref={coreLightRef} position={[0, GLB_Y + 1.2, 0]} intensity={5} distance={9} decay={1.5} color={visual.accent} />
        </>
      ) : (
        <Island mats={mats} features={features} animate={animate} coreLightRef={coreLightRef} tier={tier} accent={visual.accent} night={!!visual.stars} />
      )}

      {/* 反射水面 + 涟漪（深海玻璃感核心）。颜色由 EmotionTint 驱动 */}
      <RippleWater waterRef={waterRef} initialSea={initial.sea} animate={animate} tier={tier} waterY={USE_GLB_ISLAND ? GLB_WATER_Y : -0.02} />

      {USE_GLB_ISLAND ? <GlbBirds count={hi ? 5 : 3} animate={animate} /> : <Birds count={hi ? 5 : 2} animate={animate} />}
      <WishLights count={hi ? 7 : 3} color={visual.accent} animate={animate} />
      <Whale animate={animate} />
      {USE_GLB_ISLAND && <Turtle animate={animate} />}
      {USE_GLB_ISLAND && <Clouds animate={animate} />}
      <Sparkles count={animate ? (hi ? 46 : 20) : hi ? 24 : 12} scale={[14, 6, 14]} position={[0, 2, 0]} size={3} speed={animate ? 0.4 : 0} opacity={0.6} color={visual.accent} />
      {visual.stars && <Stars radius={60} depth={30} count={hi ? 1200 : 450} factor={3} fade speed={animate ? 0.4 : 0} />}
      {visual.stars && <ShootingStars count={hi ? 3 : 1} animate={animate} />}
      {visual.stars && hi && <Aurora animate={animate} />}

      {USE_GLB_ISLAND ? (
        // 拖动环绕查看岛屿 + 缓慢自转展示；限制俯仰，不穿到水下/正顶，平移锁定保持取景
        <OrbitControls
          makeDefault
          target={[0, 0.1, 0]}
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI * 0.18}
          maxPolarAngle={Math.PI * 0.5}
          autoRotate={animate}
          autoRotateSpeed={0.25}
          enableDamping
          dampingFactor={0.06}
        />
      ) : (
        <CameraRig animate={animate} />
      )}

      {/* 后期：仅 high 档启用；弱设备直接走 r3f 自动渲染,省整条后期 pass。
          顺序: god rays(体积光束) → Bloom(辉光) → Vignette(暗角)。数组+filter 让条件效果满足类型 */}
      {hi && (
        <EffectComposer multisampling={4}>
          {([
            sunMesh ? <GodRays key="godrays" sun={sunMesh} samples={50} density={0.5} decay={0.95} weight={0.06} exposure={0.16} blur /> : null,
            <Bloom key="bloom" mipmapBlur luminanceThreshold={0.72} luminanceSmoothing={0.3} intensity={0.45} radius={0.55} />,
            USE_GLB_ISLAND ? <ToonOutline key="outline" /> : null,
            <Vignette key="vignette" eskil={false} offset={0.26} darkness={0.55} />,
          ].filter(Boolean) as React.ReactElement[])}
        </EffectComposer>
      )}
    </>
  );
}

export default function Island3D({ visual, features = [], animate }: Props) {
  const tier = getPerfTier(); // 设备能力分档：弱设备关后期、降反射分辨率；首页背景仍保留高分屏清晰度。
  // CSS 渐变天空作懒加载/首帧前兜底底色（Canvas 渲染出来后被不透明背景覆盖）
  const sky = `linear-gradient(to bottom, ${visual.skyTop} 0%, ${visual.skyMid} 48%, ${visual.skyBottom} 80%)`;

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: sky }}>
      <Canvas
        gl={{ antialias: tier === "high", alpha: false, powerPreference: "high-performance" }}
        dpr={HOMEPAGE_DPR_RANGE[tier]}
        camera={{ position: [0, 2.1, 7], fov: 46, near: 0.1, far: 100 }}
        frameloop={animate ? "always" : "demand"}
      >
        <Suspense fallback={null}>
          <SceneContents visual={visual} features={features} animate={animate} tier={tier} />
        </Suspense>
      </Canvas>
    </div>
  );
}
