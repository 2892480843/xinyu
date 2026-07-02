/* eslint-disable react-hooks/immutability -- R3F frame loops intentionally mutate Three.js objects. */
import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { tinted, makeToonGrad } from "../lib/toonGeo";
import { sampleSky, makeSkyState, CYCLE_SEC, type SkyState } from "../lib/daySky";
import type { Track, EggPlacement } from "../lib/track";

// 开车地图的动态背景:① 昼夜天色(shader 天穹 + 同步灯光/雾 + 月亮星空)② 天空生灵(云/热气球/鸟/流星)
// ③ 路边卡通彩蛋(彩虹/风车/小鹿/小兔/精灵/气球路牌)。全部程序化、随昼夜联动,不破坏「秒加载稳 60fps」。
// 开场即拂晓 → 缓慢推进日出/正午/夕阳/星夜循环(见 daySky.ts)。

const START_T = 0.96; // 开场时刻(拂晓,紧接着就日出)

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0);
const _white = new THREE.Color("#ffffff");
const _col = new THREE.Color();
const _dummy = new THREE.Object3D();

// ——————————————————————————————————————————————————————————
// 天穹 shader:竖直渐变(地平→中空→天顶) + 太阳圆盘光晕 + 反位月亮。全部由 uniform 驱动,改色零重建。
// ——————————————————————————————————————————————————————————
function makeSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color("#3f9fe0") },
      midColor: { value: new THREE.Color("#8fc8ec") },
      horizonColor: { value: new THREE.Color("#dcefF6") },
      sunColor: { value: new THREE.Color("#fff6da") },
      sunGlow: { value: new THREE.Color("#ffe6a8") },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunVisible: { value: 1 },
      moonOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor, midColor, horizonColor, sunColor, sunGlow, sunDir;
      uniform float sunVisible, moonOpacity;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y, -1.0, 1.0);
        vec3 col = mix(horizonColor, midColor, smoothstep(-0.02, 0.22, h));
        col = mix(col, topColor, smoothstep(0.18, 0.62, h));
        vec3 sd = normalize(sunDir);
        float d = dot(dir, sd);
        float disc = smoothstep(0.9988, 0.9994, d);
        float glow = pow(max(d, 0.0), 230.0) * 0.7 + pow(max(d, 0.0), 11.0) * 0.18;
        col += sunGlow * glow * sunVisible;
        col = mix(col, sunColor, clamp(disc * sunVisible, 0.0, 1.0));
        col += sunColor * disc * sunVisible * 1.2; // HDR 核心 → Bloom 强发光
        // 月亮 = 反太阳位(太阳落到地平线下时它正好升起)
        float md = dot(dir, -sd);
        float mdisc = smoothstep(0.9975, 0.9986, md);
        float mglow = pow(max(md, 0.0), 38.0) * 0.24;
        col += sunGlow * mglow * moonOpacity;
        col = mix(col, sunColor, clamp(mdisc * moonOpacity, 0.0, 1.0));
        col += sunColor * mdisc * moonOpacity * 0.6; // 月亮 HDR 核心
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

// 软云贴图:几团叠加的柔白径向光斑 → 蓬松卡通云轮廓。
function makeCloudTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 128;
  const x = cv.getContext("2d")!;
  const blob = (cx: number, cy: number, r: number) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.6, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
  };
  blob(96, 78, 46);
  blob(150, 70, 56);
  blob(196, 82, 40);
  blob(124, 60, 44);
  blob(168, 92, 38);
  const t = new THREE.CanvasTexture(cv);
  t.needsUpdate = true;
  return t;
}

// 柔软圆点贴图:花瓣 / 萤火 共用,中心实、边缘羽化。
function makeDotTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const x = cv.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.beginPath();
  x.arc(32, 32, 32, 0, Math.PI * 2);
  x.fill();
  const t = new THREE.CanvasTexture(cv);
  t.needsUpdate = true;
  return t;
}

// 流星拖尾纹理:横向「尾(透明)→头(亮)」渐变 + 纵向柔边,贴在沿速度方向对齐的细长 plane 上 → 真流星的锥化拖尾。
function makeMeteorStreak(): THREE.CanvasTexture {
  const W = 128, H = 16;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d")!;
  // 横向:左=尾(透明) → 右=头(最亮)。plane 经 setFromUnitVectors(_xAxis, 速度) 对齐,故 +X(u=1)=前进方向=头。
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.68, "rgba(255,255,255,0.42)");
  g.addColorStop(0.93, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0.7)");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // 纵向柔边:中间亮、上下渐隐(destination-out 抠掉上下)。
  const vg = x.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, "rgba(0,0,0,1)");
  vg.addColorStop(0.5, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,1)");
  x.globalCompositeOperation = "destination-out";
  x.fillStyle = vg; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = "source-over";
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// 远景大气山峦:相机相对的 3 层环(近绿→远雾蓝),启用雾 → 随昼夜自动做大气透视。营造designed景深。
const BAND_SPECS: { r: number; color: string; y: number; s: number; nHigh: number; nLow: number }[] = [
  { r: 470, color: "#6f9a72", y: -12, s: 0.95, nHigh: 18, nLow: 10 },
  { r: 520, color: "#8fa9ad", y: -18, s: 1.18, nHigh: 16, nLow: 9 },
  { r: 565, color: "#b3c6da", y: -24, s: 1.45, nHigh: 15, nLow: 8 },
];

function FarMountains({ tier }: { tier: "high" | "low" }) {
  const { camera } = useThree();
  const follow = useRef<THREE.Group>(null);
  const grad = useMemo(() => makeToonGrad(), []);
  const chunk = useMemo(
    () =>
      mergeGeometries([
        new THREE.ConeGeometry(58, 92, 7).translate(0, 46, 0),
        new THREE.ConeGeometry(40, 60, 6).translate(-62, 30, 8),
        new THREE.ConeGeometry(46, 72, 6).translate(56, 36, -6),
        new THREE.ConeGeometry(30, 46, 6).translate(26, 23, 24),
      ])!,
    [],
  );
  const mats = useMemo(() => BAND_SPECS.map((b) => new THREE.MeshToonMaterial({ color: b.color, gradientMap: grad })), [grad]);
  const refs = [useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null)];
  useEffect(() => {
    for (let bi = 0; bi < BAND_SPECS.length; bi++) {
      const im = refs[bi].current;
      const b = BAND_SPECS[bi];
      const n = tier === "low" ? b.nLow : b.nHigh;
      if (!im) continue;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (((i * 37) % 13) / 13) * 0.25;
        _dummy.position.set(Math.cos(a) * b.r, b.y, Math.sin(a) * b.r);
        _dummy.rotation.set(0, a + Math.PI + (((i * 53) % 9) / 9) * 0.4, 0);
        const s = b.s * (0.82 + ((i * 17) % 10) / 24);
        _dummy.scale.set(s, s * (0.78 + ((i * 7) % 8) / 20), s);
        _dummy.updateMatrix();
        im.setMatrixAt(i, _dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, chunk, mats]);
  useFrame(() => {
    if (follow.current) follow.current.position.set(camera.position.x, 0, camera.position.z);
  });
  useEffect(() => () => { grad.dispose(); chunk.dispose(); mats.forEach((m) => m.dispose()); }, [grad, chunk, mats]);
  return (
    <group ref={follow}>
      {BAND_SPECS.map((b, bi) => (
        <instancedMesh key={bi} ref={refs[bi]} args={[chunk, mats[bi], tier === "low" ? b.nLow : b.nHigh]} frustumCulled={false} />
      ))}
    </group>
  );
}

// ——— 热气球:水滴形球囊(双色竖条纹) + 吊篮 + 两根绳。每个配色一份几何。———
const BALLOON_PALETTES: [string, string][] = [
  ["#ff8a8a", "#ffe6a0"],
  ["#7ec8ff", "#f3faff"],
  ["#b69bff", "#ffd6ef"],
  ["#7fe0a8", "#fff2c4"],
  ["#ffb24d", "#ffe8b0"],
];

function buildBalloon(a: string, b: string): THREE.BufferGeometry {
  // 球囊:大球向下收成水滴;按经度交替双色条纹。
  const env = new THREE.SphereGeometry(1.4, 16, 14);
  const pos = env.attributes.position;
  const col = new THREE.Color();
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    // 下半收口成水滴
    if (py < 0) pos.setXYZ(i, px * (1 + py * 0.18), py * 1.25, pz * (1 + py * 0.18));
    const lon = Math.atan2(pz, px);
    col.copy(Math.floor(((lon + Math.PI) / (Math.PI * 2)) * 12) % 2 ? ca : cb);
    arr[i * 3] = col.r;
    arr[i * 3 + 1] = col.g;
    arr[i * 3 + 2] = col.b;
  }
  pos.needsUpdate = true;
  env.computeVertexNormals();
  env.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  env.translate(0, 1.7, 0);
  const basket = tinted(new THREE.CylinderGeometry(0.32, 0.26, 0.4, 8).translate(0, -0.2, 0), "#8a5a32");
  const rope1 = tinted(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 4).translate(0.4, 0.6, 0), "#6b5640");
  const rope2 = tinted(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 4).translate(-0.4, 0.6, 0), "#6b5640");
  return mergeGeometries([env, basket, rope1, rope2])!;
}

// ——— 鸟:一道折角(两翼)。flock 用 InstancedMesh,逐帧写矩阵做扇翅。———
function buildBird(): THREE.BufferGeometry {
  const wL = tinted(new THREE.BoxGeometry(1.1, 0.06, 0.34).translate(-0.55, 0, 0).rotateZ(0.32), "#3a3a48");
  const wR = tinted(new THREE.BoxGeometry(1.1, 0.06, 0.34).translate(0.55, 0, 0).rotateZ(-0.32), "#3a3a48");
  return mergeGeometries([wL, wR])!;
}

// ——— 路边卡通形象的几何构建 ———
function buildDeer(): THREE.BufferGeometry {
  const body = "#b5793f";
  const parts = [
    tinted(new THREE.SphereGeometry(0.5, 9, 7).scale(1.5, 1, 0.85).translate(0, 1.15, 0), body),
    tinted(new THREE.CylinderGeometry(0.16, 0.22, 0.7, 7).translate(0, 1.5, 0.5).rotateX(-0.5), body),
    tinted(new THREE.SphereGeometry(0.27, 8, 7).scale(1, 1.1, 1.4).translate(0, 1.86, 0.86), "#c08a4e"),
    tinted(new THREE.SphereGeometry(0.09, 6, 5).translate(0, 1.78, 1.18), "#3a2a1c"), // 鼻
    tinted(new THREE.ConeGeometry(0.12, 0.22, 5).translate(0.16, 2.08, 0.78), "#a06f3a"), // 耳
    tinted(new THREE.ConeGeometry(0.12, 0.22, 5).translate(-0.16, 2.08, 0.78), "#a06f3a"),
    tinted(new THREE.ConeGeometry(0.05, 0.45, 4).translate(0.14, 2.3, 0.82), "#d8c39a"), // 鹿角
    tinted(new THREE.ConeGeometry(0.05, 0.45, 4).translate(-0.14, 2.3, 0.82), "#d8c39a"),
  ];
  for (const [sx, sz] of [[0.42, 0.42], [-0.42, 0.42], [0.42, -0.42], [-0.42, -0.42]] as const) {
    parts.push(tinted(new THREE.CylinderGeometry(0.1, 0.08, 1.15, 6).translate(sx, 0.58, sz), "#8a5a2e"));
  }
  parts.push(tinted(new THREE.SphereGeometry(0.12, 6, 5).translate(0, 1.2, -0.75), "#e8ddc8")); // 尾
  return mergeGeometries(parts)!;
}

function buildBunny(): THREE.BufferGeometry {
  const fur = "#eae6e0";
  const parts = [
    tinted(new THREE.SphereGeometry(0.42, 9, 8).scale(1, 0.95, 1.15).translate(0, 0.46, 0), fur),
    tinted(new THREE.SphereGeometry(0.3, 9, 8).translate(0, 0.86, 0.28), fur),
    tinted(new THREE.SphereGeometry(0.13, 6, 6).scale(0.55, 1.6, 0.4).translate(0.13, 1.32, 0.2), fur), // 长耳
    tinted(new THREE.SphereGeometry(0.13, 6, 6).scale(0.55, 1.6, 0.4).translate(-0.13, 1.32, 0.2), fur),
    tinted(new THREE.SphereGeometry(0.06, 6, 5).translate(0.11, 1.4, 0.22), "#f6c0cf"),
    tinted(new THREE.SphereGeometry(0.06, 6, 5).translate(-0.11, 1.4, 0.22), "#f6c0cf"),
    tinted(new THREE.SphereGeometry(0.045, 6, 5).translate(0.1, 0.92, 0.55), "#2a2a30"), // 眼
    tinted(new THREE.SphereGeometry(0.045, 6, 5).translate(-0.1, 0.92, 0.55), "#2a2a30"),
    tinted(new THREE.SphereGeometry(0.13, 7, 6).translate(0, 0.3, -0.42), "#ffffff"), // 尾
  ];
  return mergeGeometries(parts)!;
}

function buildWindmillTower(): THREE.BufferGeometry {
  return mergeGeometries([
    tinted(new THREE.CylinderGeometry(0.55, 0.85, 6.4, 10).translate(0, 3.2, 0), "#f1ead6"),
    tinted(new THREE.BoxGeometry(1.1, 0.9, 1.2).translate(0, 6.6, 0.2), "#e7c08a"), // 顶舱
    tinted(new THREE.ConeGeometry(0.9, 0.8, 8).translate(0, 7.3, 0.2), "#c87b5a"), // 顶盖
  ])!;
}
function buildWindmillBlades(): THREE.BufferGeometry {
  const parts = [tinted(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8).rotateX(Math.PI / 2), "#6b5640")];
  for (let i = 0; i < 4; i++) {
    parts.push(tinted(new THREE.BoxGeometry(0.4, 3.0, 0.08).translate(0, 1.6, 0).rotateZ((i / 4) * Math.PI * 2), i % 2 ? "#f4f1e8" : "#ffd98a"));
  }
  return mergeGeometries(parts)!;
}

// 彩虹:7 条同心半环(由外到内 红→紫),无光照、半透明、不受雾,立在路肩外。
function buildRainbow(): THREE.BufferGeometry {
  const COLORS = ["#ff6b6b", "#ff9f43", "#ffd86b", "#7ed96b", "#5ec9e0", "#5b7fe0", "#a06be0"];
  const tube = 0.55;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < COLORS.length; i++) {
    const R = 16 - i * tube * 1.04;
    parts.push(tinted(new THREE.TorusGeometry(R, tube * 0.52, 7, 44, Math.PI), COLORS[i]));
  }
  return mergeGeometries(parts)!;
}

// ——————————————————————————————————————————————————————————
// Atmosphere:天穹 + 灯光 + 雾 + 星空,逐帧由 daySky 驱动,并把当前 SkyState 写入共享 skyRef 供其它组件读取。
// ——————————————————————————————————————————————————————————
function Atmosphere({ skyRef, tier, labelRef }: { skyRef: RefObject<SkyState>; tier: "high" | "low"; labelRef: RefObject<HTMLSpanElement | null> }) {
  const { camera, scene } = useThree();
  const skyMat = useMemo(() => makeSkyMaterial(), []);
  const domeGeo = useMemo(() => new THREE.SphereGeometry(900, 24, 16), []);
  const amb = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const dir = useRef<THREE.DirectionalLight>(null);
  const follow = useRef<THREE.Group>(null);
  const stars = useRef<THREE.Points>(null);
  const clock = useRef(START_T * CYCLE_SEC);
  const lastLabel = useRef("");

  const { starGeo, starTw } = useMemo(() => {
    const n = tier === "low" ? 160 : 360;
    const arr = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const ph = new Float32Array(n), sp = new Float32Array(n), bw = new Float32Array(n); // 各星:闪烁相位 / 速度 / 基础亮度
    for (let i = 0; i < n; i++) {
      const u = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const a = (i * 2.399963) % (Math.PI * 2);
      const y = 0.12 + Math.abs((u + 1) % 1) * 0.85;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      arr[i * 3] = Math.cos(a) * r * 858;
      arr[i * 3 + 1] = y * 858;
      arr[i * 3 + 2] = Math.sin(a) * r * 858;
      const h = Math.abs((Math.sin(i * 78.233) * 43758.5453) % 1);
      ph[i] = h * 6.2832;
      sp[i] = 0.5 + h * 1.8;
      bw[i] = 0.5 + Math.abs((Math.sin(i * 32.17) * 7341.17) % 1) * 0.5; // 明暗有别 → 星空有层次
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = bw[i];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return { starGeo: g, starTw: { n, ph, sp, bw } };
  }, [tier]);
  const starMat = useMemo(() => new THREE.PointsMaterial({ vertexColors: true, size: tier === "low" ? 2.4 : 3.0, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false }), [tier]);

  useEffect(
    () => () => {
      skyMat.dispose();
      domeGeo.dispose();
      starGeo.dispose();
      starMat.dispose();
    },
    [skyMat, domeGeo, starGeo, starMat],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const t = ((clock.current / CYCLE_SEC) % 1 + 1) % 1;
    const s = skyRef.current;
    if (!s) return;
    sampleSky(t, s);

    const u = skyMat.uniforms;
    u.topColor.value.copy(s.top);
    u.midColor.value.copy(s.mid);
    u.horizonColor.value.copy(s.horizon);
    u.sunColor.value.copy(s.sun);
    u.sunGlow.value.copy(s.sunGlow);
    u.sunDir.value.copy(s.sunDir);
    u.sunVisible.value = s.sunVisible;
    u.moonOpacity.value = s.nightness;

    if (amb.current) {
      amb.current.color.copy(s.ambient);
      amb.current.intensity = s.ambientI;
    }
    if (hemi.current) {
      hemi.current.color.copy(s.hemiSky);
      hemi.current.groundColor.copy(s.hemiGround);
      hemi.current.intensity = s.hemiI;
    }
    if (dir.current) {
      dir.current.color.copy(s.dir);
      dir.current.intensity = s.dirI;
      // 灯光始终来自天上:白天随太阳,夜晚随月亮(反太阳位)。
      _v.copy(s.sunDir);
      if (_v.y < 0.02) _v.multiplyScalar(-1);
      dir.current.position.copy(_v).multiplyScalar(400);
    }
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(s.fog);

    if (follow.current) follow.current.position.set(camera.position.x, 0, camera.position.z);
    if (stars.current) {
      (stars.current.material as THREE.PointsMaterial).opacity = s.nightness * 0.95;
      if (s.nightness > 0.02) {
        // 逐星明灭(twinkle):各星按自己的相位/速度做亮度呼吸,夜空不再呆滞。仅夜里更新。
        const cols = starGeo.attributes.color.array as Float32Array;
        const tt = clock.current;
        for (let i = 0; i < starTw.n; i++) {
          const w = starTw.bw[i] * (0.55 + 0.45 * Math.sin(tt * starTw.sp[i] + starTw.ph[i]));
          cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = w;
        }
        starGeo.attributes.color.needsUpdate = true;
      }
    }

    if (labelRef.current && lastLabel.current !== s.label) {
      lastLabel.current = s.label;
      labelRef.current.textContent = s.label;
    }
  });

  return (
    <>
      <ambientLight ref={amb} intensity={0.85} />
      <hemisphereLight ref={hemi} intensity={0.7} />
      <directionalLight ref={dir} intensity={1.2} position={[120, 160, 60]} />
      <group ref={follow}>
        <mesh geometry={domeGeo} material={skyMat} renderOrder={-2} frustumCulled={false} />
        <points ref={stars} geometry={starGeo} material={starMat} frustumCulled={false} />
      </group>
    </>
  );
}

// ——————————————————————————————————————————————————————————
// SkyLife:云 + 热气球 + 鸟群 + 流星。跟随相机(总在你周围),配色随昼夜联动。
// ——————————————————————————————————————————————————————————
function SkyLife({ skyRef, tier }: { skyRef: RefObject<SkyState>; tier: "high" | "low" }) {
  const { camera } = useThree();
  const follow = useRef<THREE.Group>(null);
  const cloudGroup = useRef<THREE.Group>(null);
  const balloonsRef = useRef<THREE.Group>(null);
  const birds = useRef<THREE.InstancedMesh>(null);
  const shooting = useRef<THREE.Mesh>(null);
  const grad = useMemo(() => makeToonGrad(), []);

  const CLOUDS = tier === "low" ? 5 : 9;
  const BALLOONS = tier === "low" ? 3 : 5;
  const BIRDS = tier === "low" ? 5 : 9;

  const cloudTex = useMemo(() => makeCloudTexture(), []);
  const cloudMat = useMemo(() => new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.9, depthWrite: false, fog: false }), [cloudTex]);
  const clouds = useMemo(() => {
    return Array.from({ length: CLOUDS }, (_, i) => {
      const a = (i / CLOUDS) * Math.PI * 2;
      const r = 220 + ((i * 53) % 130);
      return { x: Math.cos(a) * r, y: 120 + ((i * 37) % 70), z: Math.sin(a) * r, s: 60 + ((i * 29) % 60), vx: 3 + ((i * 11) % 5) };
    });
  }, [CLOUDS]);

  const balloonGeos = useMemo(() => Array.from({ length: BALLOONS }, (_, i) => buildBalloon(...BALLOON_PALETTES[i % BALLOON_PALETTES.length])), [BALLOONS]);
  const balloonMat = useMemo(() => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad }), [grad]);
  const balloons = useMemo(
    () =>
      Array.from({ length: BALLOONS }, (_, i) => {
        const a = (i / BALLOONS) * Math.PI * 2 + 0.6;
        const r = 150 + ((i * 47) % 110);
        return { x: Math.cos(a) * r, y: 60 + ((i * 31) % 55), z: Math.sin(a) * r, ph: i * 1.7, sp: 0.05 + ((i * 7) % 5) / 90, ang: a };
      }),
    [BALLOONS],
  );

  const birdGeo = useMemo(() => buildBird(), []);
  const birdMat = useMemo(() => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad, transparent: true, opacity: 1 }), [grad]);
  const flock = useMemo(
    () =>
      Array.from({ length: BIRDS }, (_, i) => ({
        bx: -120 + (i % 4) * 12 + ((i * 13) % 20),
        by: 95 + ((i * 17) % 40),
        bz: -60 - ((i * 23) % 90),
        ph: i * 0.6,
        sp: 14 + ((i * 5) % 6),
      })),
    [BIRDS],
  );

  const shootMat = useMemo(() => new THREE.MeshBasicMaterial({ map: makeMeteorStreak(), color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }), []);
  const shootGeo = useMemo(() => new THREE.PlaneGeometry(8, 0.5), []); // 略放大 + 加高:配合锥化拖尾纹理的纵向柔边
  const shoot = useRef({ active: false, t: 0, next: 4, fx: 0, fy: 0, fz: 0, dx: 0, dy: 0, dz: 0 });
  const clk = useRef(0);

  // 氛围粒子:花瓣(白天飘落) + 萤火(夜里低空浮游),相机相对、随昼夜淡入淡出。萤火走加色 → 被 Bloom 染成光点。
  const dotTex = useMemo(() => makeDotTexture(), []);
  const PETALS = tier === "low" ? 0 : 40;
  const FLIES = tier === "low" ? 16 : 34;
  const petals = useRef<THREE.Points>(null);
  const petalGeo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(Math.max(1, PETALS) * 3), 3)); return g; }, [PETALS]);
  const petalMat = useMemo(() => new THREE.PointsMaterial({ map: dotTex, color: "#f7c0d6", size: 1.15, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false }), [dotTex]);
  const petalState = useMemo(() => Array.from({ length: Math.max(1, PETALS) }, (_, i) => ({ x: (((i * 7.3) % 1) - 0.5) * 70, y: ((i * 13.7) % 1) * 38, z: (((i * 3.9) % 1) - 0.5) * 70, vy: 2.2 + ((i * 5) % 5) * 0.4, ph: i * 0.7 })), [PETALS]);
  const flies = useRef<THREE.Points>(null);
  const flyGeo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FLIES * 3), 3)); return g; }, [FLIES]);
  const flyMat = useMemo(() => new THREE.PointsMaterial({ map: dotTex, color: "#fff0a0", size: 1.0, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }), [dotTex]);
  const flyState = useMemo(() => Array.from({ length: FLIES }, (_, i) => { const a = (i / FLIES) * Math.PI * 2; const r = 8 + ((i * 11) % 28); return { x: Math.cos(a) * r, y: 1.5 + ((i * 7) % 10), z: Math.sin(a) * r, ph: i * 1.3, ph2: i * 0.6 }; }), [FLIES]);

  useEffect(
    () => () => {
      grad.dispose();
      cloudTex.dispose();
      cloudMat.dispose();
      balloonMat.dispose();
      balloonGeos.forEach((g) => g.dispose());
      birdGeo.dispose();
      birdMat.dispose();
      shootMat.map?.dispose(); // 流星拖尾纹理:material.dispose() 不会连带释放,手动 dispose
      shootMat.dispose();
      shootGeo.dispose();
      dotTex.dispose();
      petalGeo.dispose();
      petalMat.dispose();
      flyGeo.dispose();
      flyMat.dispose();
    },
    [grad, cloudTex, cloudMat, balloonMat, balloonGeos, birdGeo, birdMat, shootMat, shootGeo, dotTex, petalGeo, petalMat, flyGeo, flyMat],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    clk.current += dt;
    const s = skyRef.current;
    if (!s) return;

    if (follow.current) follow.current.position.set(camera.position.x, 0, camera.position.z);

    // 云:随夕阳染暖、入夜压暗;缓慢平移、出界回绕。
    _col.copy(_white).lerp(s.horizon, s.sunsetness * 0.7).multiplyScalar(1 - s.nightness * 0.62);
    cloudMat.color.copy(_col);
    cloudMat.opacity = 0.92 - s.nightness * 0.5;
    const cg = cloudGroup.current;
    if (cg) {
      for (let i = 0; i < cg.children.length; i++) {
        const sp = cg.children[i] as THREE.Sprite;
        sp.position.x += clouds[i].vx * dt;
        if (sp.position.x > 320) sp.position.x = -320;
      }
    }

    // 热气球:缓慢上下浮 + 极慢绕行(轻微方位漂移)。
    const bg = balloonsRef.current;
    if (bg) {
      for (let i = 0; i < bg.children.length; i++) {
        const b = balloons[i];
        const m = bg.children[i] as THREE.Object3D;
        b.ang += b.sp * dt * 0.12;
        m.position.y = b.y + Math.sin(clk.current * 0.5 + b.ph) * 4;
        m.rotation.z = Math.sin(clk.current * 0.4 + b.ph) * 0.06;
      }
    }

    // 鸟群:白天可见(随 dayness 淡入),横向巡飞 + 扇翅;夜里隐去。
    const bm = birds.current;
    if (bm) {
      birdMat.opacity = s.dayness;
      const vis = s.dayness > 0.04;
      bm.visible = vis;
      if (vis) {
        for (let i = 0; i < flock.length; i++) {
          const b = flock[i];
          let bx = b.bx + ((clk.current * b.sp) % 320);
          if (bx > 160) bx -= 320;
          const flap = 1 + Math.sin(clk.current * 9 + b.ph) * 0.5;
          _dummy.position.set(bx, b.by + Math.sin(clk.current * 0.6 + b.ph) * 4, b.bz);
          _dummy.rotation.set(0, -Math.PI / 2, 0);
          _dummy.scale.set(2.2, 2.2 * flap, 2.2);
          _dummy.updateMatrix();
          bm.setMatrixAt(i, _dummy.matrix);
        }
        bm.instanceMatrix.needsUpdate = true;
      }
    }

    // 流星:仅夜深时,每隔几秒划过上空一次。
    const sh = shoot.current;
    const sm = shooting.current;
    if (sm) {
      if (!sh.active) {
        sh.next -= dt;
        if (sh.next <= 0 && s.nightness > 0.55) {
          sh.active = true;
          sh.t = 0;
          const a = ((clk.current * 1.7) % 1) * Math.PI * 2;
          sh.fx = Math.cos(a) * 180;
          sh.fz = -120 - ((clk.current * 53) % 80);
          sh.fy = 150 + ((clk.current * 31) % 60);
          sh.dx = -Math.cos(a) * 0.8 - 0.4;
          sh.dy = -0.5;
          sh.dz = 0.2;
          shootMat.opacity = 0;
        } else if (sh.next <= 0) {
          sh.next = 3;
        }
      }
      if (sh.active) {
        sh.t += dt / 1.1;
        const k = sh.t;
        sm.position.set(sh.fx + sh.dx * 120 * k, sh.fy + sh.dy * 120 * k, sh.fz + sh.dz * 120 * k);
        _v.set(sh.dx, sh.dy, sh.dz).normalize();
        _q.setFromUnitVectors(_xAxis, _v);
        sm.quaternion.copy(_q);
        shootMat.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.9;
        if (k >= 1) {
          sh.active = false;
          sh.next = 5 + ((clk.current * 17) % 11);
          shootMat.opacity = 0;
        }
      }
    }

    // 花瓣:白天飘落 + 横向摆动,落地回到高处。
    const pm = petals.current;
    if (pm && PETALS > 0) {
      petalMat.opacity = s.dayness * 0.9;
      if (s.dayness > 0.03) {
        const arr = (pm.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
        for (let i = 0; i < petalState.length; i++) {
          const p = petalState[i];
          p.y -= p.vy * dt;
          p.x += Math.sin(clk.current * 0.8 + p.ph) * dt * 0.9;
          if (p.y < 0) {
            p.y = 34 + ((i * 5) % 6);
            p.x = (((clk.current * 0.7 + i) % 1) - 0.5) * 70;
            p.z = (((clk.current * 0.9 + i * 3) % 1) - 0.5) * 70;
          }
          arr[i * 3] = p.x;
          arr[i * 3 + 1] = p.y;
          arr[i * 3 + 2] = p.z;
        }
        pm.geometry.attributes.position.needsUpdate = true;
      }
    }

    // 萤火:夜里低空浮游 + 群体明暗呼吸。
    const fm = flies.current;
    if (fm) {
      flyMat.opacity = s.nightness * (0.7 + 0.3 * Math.sin(clk.current * 3));
      if (s.nightness > 0.03) {
        const arr = (fm.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
        for (let i = 0; i < flyState.length; i++) {
          const f = flyState[i];
          arr[i * 3] = f.x + Math.sin(clk.current * 0.7 + f.ph) * 2.2;
          arr[i * 3 + 1] = f.y + Math.sin(clk.current * 1.3 + f.ph2) * 1.2;
          arr[i * 3 + 2] = f.z + Math.cos(clk.current * 0.6 + f.ph) * 2.2;
        }
        fm.geometry.attributes.position.needsUpdate = true;
      }
    }
  });

  return (
    <group ref={follow}>
      <group ref={cloudGroup}>
        {clouds.map((c, i) => (
          <sprite key={i} material={cloudMat} position={[c.x, c.y, c.z]} scale={[c.s, c.s * 0.6, 1]} />
        ))}
      </group>
      <group ref={balloonsRef}>
        {balloons.map((b, i) => (
          <group key={i} position={[b.x, b.y, b.z]} rotation={[0, b.ang, 0]}>
            <mesh geometry={balloonGeos[i]} material={balloonMat} scale={6} />
          </group>
        ))}
      </group>
      <instancedMesh ref={birds} args={[birdGeo, birdMat, Math.max(1, BIRDS)]} frustumCulled={false} />
      <mesh ref={shooting} geometry={shootGeo} material={shootMat} frustumCulled={false} />
      <points ref={petals} geometry={petalGeo} material={petalMat} frustumCulled={false} />
      <points ref={flies} geometry={flyGeo} material={flyMat} frustumCulled={false} />
    </group>
  );
}

// ——————————————————————————————————————————————————————————
// 单个路边彩蛋:按 kind 选预建几何 + 各自的小动画(风车转、精灵浮、兔子跳、彩虹微闪)。
// ——————————————————————————————————————————————————————————
function EggItem({
  egg,
  geos,
  toonMat,
  rainbowMat,
  spiritCoreMat,
  spiritHaloMat,
  skyRef,
}: {
  egg: EggPlacement;
  geos: ReturnType<typeof useEggGeos>;
  toonMat: THREE.Material;
  rainbowMat: THREE.Material;
  spiritCoreMat: THREE.Material;
  spiritHaloMat: THREE.Material;
  skyRef: RefObject<SkyState>;
}) {
  const root = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Mesh>(null); // 风车扇叶
  const hop = useRef<THREE.Group>(null); // 兔子/精灵浮跳
  const halo = useRef<THREE.Mesh>(null);
  const clk = useRef(egg.seed % 100);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    clk.current += dt;
    const tt = clk.current;
    if (spin.current) spin.current.rotation.z = tt * 0.9;
    if (egg.kind === "bunny" && hop.current) {
      const h = Math.max(0, Math.sin(tt * 2.2));
      hop.current.position.y = h * h * 0.45;
    }
    if (egg.kind === "spirit" && hop.current) {
      hop.current.position.y = 1.1 + Math.sin(tt * 1.3) * 0.28;
      hop.current.rotation.y = tt * 0.5;
      if (halo.current) {
        const p = 1 + Math.sin(tt * 2) * 0.12;
        halo.current.scale.setScalar(p);
        // 夜里精灵更亮(萤火感)
        const s = skyRef.current;
        (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.32 + (s ? s.nightness * 0.4 : 0);
      }
    }
    if (egg.kind === "balloons" && hop.current) {
      hop.current.position.y = Math.sin(tt * 1.1) * 0.18;
      hop.current.rotation.z = Math.sin(tt * 0.8) * 0.08;
    }
  });

  const common = { ref: root as RefObject<THREE.Group>, position: [egg.x, egg.y, egg.z] as [number, number, number] };

  if (egg.kind === "rainbow") {
    return (
      <group {...common} rotation={[0, egg.heading, 0]}>
        <mesh geometry={geos.rainbow} material={rainbowMat} />
      </group>
    );
  }
  if (egg.kind === "windmill") {
    return (
      <group {...common} rotation={[0, egg.heading, 0]}>
        <mesh geometry={geos.mound} material={toonMat} />
        <mesh geometry={geos.windTower} material={toonMat} />
        <mesh ref={spin} geometry={geos.windBlades} material={toonMat} position={[0, 6.6, 0.85]} />
      </group>
    );
  }
  if (egg.kind === "deer") {
    return (
      <group {...common} rotation={[0, egg.heading + Math.PI / 2, 0]}>
        <mesh geometry={geos.deer} material={toonMat} />
      </group>
    );
  }
  if (egg.kind === "bunny") {
    return (
      <group {...common} rotation={[0, egg.heading + Math.PI / 2, 0]}>
        <group ref={hop}>
          <mesh geometry={geos.bunny} material={toonMat} />
        </group>
      </group>
    );
  }
  if (egg.kind === "spirit") {
    return (
      <group {...common} rotation={[0, egg.heading, 0]}>
        <group ref={hop}>
          <mesh ref={halo} geometry={geos.spiritHalo} material={spiritHaloMat} />
          <mesh geometry={geos.spiritCore} material={spiritCoreMat} />
          <mesh geometry={geos.spiritEyes} material={geos.eyeMat} />
        </group>
      </group>
    );
  }
  // balloons (地面气球路牌)
  return (
    <group {...common} rotation={[0, egg.heading, 0]}>
      <mesh geometry={geos.post} material={toonMat} />
      <group ref={hop} position={[0, 2.6, 0]}>
        <mesh geometry={geos.signBalloons} material={toonMat} />
      </group>
    </group>
  );
}

// 路边彩蛋共用的几何与材质(构建一次)。
function useEggGeos() {
  return useMemo(() => {
    const mound = tinted(new THREE.SphereGeometry(4.5, 12, 8).scale(1, 0.32, 1).translate(0, -0.2, 0), "#8fbf6e");
    const eyeMat = new THREE.MeshBasicMaterial({ color: "#2a2a30" });
    // 精灵:核(柔白) + 光晕 + 两眼
    const spiritCore = new THREE.SphereGeometry(0.55, 14, 12).scale(1, 0.86, 1);
    const spiritHalo = new THREE.SphereGeometry(0.85, 14, 12);
    const spiritEyes = mergeGeometries([new THREE.SphereGeometry(0.07, 6, 5).translate(0.16, 0.06, 0.46), new THREE.SphereGeometry(0.07, 6, 5).translate(-0.16, 0.06, 0.46)])!;
    // 气球路牌:木桩 + 心形牌(两球+方块) + 三只小气球(各色)
    const post = mergeGeometries([
      tinted(new THREE.CylinderGeometry(0.1, 0.12, 2.4, 7).translate(0, 1.2, 0), "#8a5a32"),
      tinted(new THREE.CylinderGeometry(0.55, 0.55, 0.16, 18).rotateX(Math.PI / 2).translate(0, 2.2, 0.12), "#ffd0dc"),
      tinted(new THREE.BoxGeometry(0.34, 0.34, 0.06).rotateZ(Math.PI / 4).translate(0, 2.18, 0.22), "#ff7a98"),
      tinted(new THREE.SphereGeometry(0.2, 8, 7).translate(0.12, 2.32, 0.22), "#ff7a98"),
      tinted(new THREE.SphereGeometry(0.2, 8, 7).translate(-0.12, 2.32, 0.22), "#ff7a98"),
    ])!;
    const balParts: THREE.BufferGeometry[] = [];
    const cols = ["#ff8a8a", "#7ec8ff", "#ffd86b"];
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * 0.5;
      balParts.push(tinted(new THREE.SphereGeometry(0.34, 9, 8).scale(1, 1.2, 1).translate(ox, 0.4, 0), cols[i]));
      balParts.push(tinted(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4).translate(ox, -0.1, 0), "#cfcabf"));
    }
    const signBalloons = mergeGeometries(balParts)!;
    return {
      mound,
      deer: buildDeer(),
      bunny: buildBunny(),
      windTower: buildWindmillTower(),
      windBlades: buildWindmillBlades(),
      rainbow: buildRainbow(),
      spiritCore,
      spiritHalo,
      spiritEyes,
      eyeMat,
      post,
      signBalloons,
    };
  }, []);
}

function RoadsideEggs({ track, skyRef, tier }: { track: Track; skyRef: RefObject<SkyState>; tier: "high" | "low" }) {
  const grad = useMemo(() => makeToonGrad(), []);
  const geos = useEggGeos();
  const toonMat = useMemo(() => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad }), [grad]);
  const rainbowMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false, fog: false, side: THREE.DoubleSide }), []);
  const spiritCoreMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#dffbff", fog: false }), []);
  const spiritHaloMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#8fe6ff", transparent: true, opacity: 0.34, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }), []);
  const eggs = useMemo(() => {
    const all = track.eggs();
    return tier === "low" ? all.filter((_, i) => i % 4 !== 3) : all;
  }, [track, tier]);

  useEffect(
    () => () => {
      grad.dispose();
      toonMat.dispose();
      rainbowMat.dispose();
      spiritCoreMat.dispose();
      spiritHaloMat.dispose();
      Object.values(geos).forEach((g) => (g as THREE.BufferGeometry | THREE.Material).dispose?.());
    },
    [grad, toonMat, rainbowMat, spiritCoreMat, spiritHaloMat, geos],
  );

  return (
    <>
      {eggs.map((egg, i) => (
        <EggItem key={i} egg={egg} geos={geos} toonMat={toonMat} rainbowMat={rainbowMat} spiritCoreMat={spiritCoreMat} spiritHaloMat={spiritHaloMat} skyRef={skyRef} />
      ))}
    </>
  );
}

// 对外:把昼夜天色 + 天空生灵 + 路边彩蛋一并接入。labelRef 用于把当前时段写到 HUD。
export default function DriveWorld({ track, tier, labelRef }: { track: Track; tier: "high" | "low"; labelRef: RefObject<HTMLSpanElement | null> }) {
  const skyRef = useRef<SkyState>(makeSkyState());
  return (
    <>
      <Atmosphere skyRef={skyRef} tier={tier} labelRef={labelRef} />
      <FarMountains tier={tier} />
      <SkyLife skyRef={skyRef} tier={tier} />
      <RoadsideEggs track={track} skyRef={skyRef} tier={tier} />
    </>
  );
}
