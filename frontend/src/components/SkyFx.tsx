// 夜空氛围特效:极光幕帘 + 流星雨 + 夜空浮尘。
// 独立成文件(与 ExploreMode 解耦,便于并行编辑不冲突);只在夜晚由 ExploreScene 渲染。
import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { makeRng } from "../lib/deterministic";

// 本文件自用的柔光点贴图(惰性单例)——流星 / 浮尘的发光点。
let _fxGlow: THREE.Texture | null = null;
function fxGlow(): THREE.Texture {
  if (_fxGlow) return _fxGlow;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const x = cv.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  _fxGlow = t;
  return t;
}

// ───────────────────────── 极光 Aurora ─────────────────────────
// 高悬天幕(大圆柱内壁)上随时间漂移的绿→青→紫波动幕帘,底亮顶淡,加色混合。
const AURORA_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const AURORA_FRAG = `
  varying vec2 vUv;
  uniform float uTime;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  void main(){
    float x = vUv.x, y = vUv.y;
    float t = uTime * 0.08;
    // 平滑流动的幕帘(fbm)+ 竖直射线纹理 → 像真极光的丝缕飘动
    float flow = fbm(vec2(x * 4.0 + t, y * 1.2 - t * 0.4));
    float curtain = fbm(vec2(x * 9.0 - t * 0.6 + flow * 1.3, y * 2.0));
    float rays = 0.55 + 0.45 * sin(x * 70.0 + curtain * 7.0);
    float v = smoothstep(0.42, 0.92, curtain) * (0.55 + 0.45 * rays);
    // 竖直衰减:底亮顶淡,底边柔收
    float vert = pow(1.0 - y, 1.4) * smoothstep(0.0, 0.1, y);
    float a = v * vert * 0.62;
    // 颜色:底翠绿 → 中青 → 顶品红紫,整体随时间轻轻流转
    vec3 col = mix(vec3(0.20, 1.0, 0.55), vec3(0.25, 0.85, 1.0), smoothstep(0.0, 0.5, y));
    col = mix(col, vec3(0.85, 0.40, 1.0), smoothstep(0.45, 1.0, y));
    col *= (0.85 + 0.3 * sin(x * 5.0 + t * 2.0));
    gl_FragColor = vec4(col, a);
  }
`;
export function Aurora() {
  const meshRef = useRef<THREE.Mesh>(null);
  const u = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((s) => {
    // 从已挂载材质改 uniform,不直接改 useMemo 产物 u(react-hooks/immutability)。
    const mat = meshRef.current?.material as THREE.ShaderMaterial | undefined;
    if (mat?.uniforms?.uTime) mat.uniforms.uTime.value = s.clock.elapsedTime;
  });
  return (
    <mesh ref={meshRef} position={[0, 190, 0]} renderOrder={-1}>
      <cylinderGeometry args={[640, 640, 300, 80, 1, true]} />
      <shaderMaterial
        uniforms={u}
        vertexShader={AURORA_VERT}
        fragmentShader={AURORA_FRAG}
        transparent
        depthWrite={false}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
}

// ───────────────────────── 银河 MilkyWay ─────────────────────────
// 手绘银河带:柔光带 + 青/紫/玫瑰星云团 + 密集星点 + 暗隙,贴在一面斜挂高空的大平面上(加色混合)。
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
let _mwTex: THREE.Texture | null = null;
function milkyWayTexture(): THREE.Texture {
  if (_mwTex) return _mwTex;
  const W = 1024, H = 256, cy = H * 0.5;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d")!;
  x.clearRect(0, 0, W, H);
  // 1) 底层辉光带(中央亮,上下渐隐)
  const band = x.createLinearGradient(0, cy - H * 0.34, 0, cy + H * 0.34);
  band.addColorStop(0, "rgba(120,150,210,0)");
  band.addColorStop(0.5, "rgba(176,192,232,0.5)");
  band.addColorStop(1, "rgba(120,150,210,0)");
  x.fillStyle = band; x.fillRect(0, 0, W, H);
  // 2) 星云色斑(青/紫/玫瑰/薄荷)沿带散布,加色叠加
  x.globalCompositeOperation = "lighter";
  const blobs: [string, number][] = [["#3fb0d8", 0.18], ["#9b6cff", 0.16], ["#ff7fb0", 0.12], ["#5fe0c0", 0.14]];
  for (let i = 0; i < 64; i++) {
    const bx = (i / 64) * W + (Math.random() - 0.5) * 40;
    const by = cy + (Math.random() - 0.5) * H * 0.5;
    const r = 30 + Math.random() * 95;
    const [c, al] = blobs[i % blobs.length];
    const g = x.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, hexA(c, al * (0.6 + Math.random() * 0.6)));
    g.addColorStop(1, hexA(c, 0));
    x.fillStyle = g; x.beginPath(); x.arc(bx, by, r, 0, 6.2832); x.fill();
  }
  // 3) 密集星点(幂律:多数暗、少数亮)
  for (let i = 0; i < 1000; i++) {
    const sx = Math.random() * W;
    const sy = cy + (Math.random() - 0.5) * H * 0.6 * (0.4 + Math.random() * 0.6);
    const b = Math.pow(Math.random(), 2.2);
    const rr = 0.4 + b * 1.6;
    x.fillStyle = `rgba(255,255,255,${0.22 + b * 0.72})`;
    x.beginPath(); x.arc(sx, sy, rr, 0, 6.2832); x.fill();
  }
  // 4) 暗隙(分裂的尘埃带)
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 16; i++) {
    const bx = Math.random() * W, by = cy + (Math.random() - 0.5) * H * 0.3, r = 18 + Math.random() * 75;
    const g = x.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, "rgba(0,0,0,0.55)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.beginPath(); x.arc(bx, by, r, 0, 6.2832); x.fill();
  }
  x.globalCompositeOperation = "source-over";
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  _mwTex = t;
  return t;
}
export function MilkyWay() {
  // 倾斜的大圆柱内壁:银河带绕成一道斜挂的大圆弧,环住玩家 → 不论朝哪看,都在高空划过(跟随相机看得见)
  return (
    <mesh position={[0, 230, 0]} rotation={[0.34, 0.6, 0.22]} renderOrder={-2}>
      <cylinderGeometry args={[950, 950, 640, 96, 1, true]} />
      <meshBasicMaterial map={milkyWayTexture()} transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} side={THREE.BackSide} />
    </mesh>
  );
}

// ───────────────────────── 流星雨 MeteorShower ─────────────────────────
// 一群独立循环的流星,从大致同一辐射方向斜划而下;各自有亮头 + 渐隐尾。
type Meteor = { t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; init: boolean; tint: [number, number, number]; flare: number };
function makeMeteorState(count: number, meteorMode: boolean): Meteor[] {
  return Array.from({ length: count }, (_, i) => {
    const rnd = makeRng(i + (meteorMode ? 41.7 : 0.3));
    const cool = rnd() > 0.42;
    return {
      t: rnd() * (meteorMode ? 3.8 : 6),
      dur: 1,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      init: false,
      tint: cool ? [0.72, 0.9, 1.0] : [1.0, 0.84, 0.62],
      flare: meteorMode ? 1.15 + rnd() * 0.45 : 1,
    };
  });
}
export function MeteorShower({ count = 10, meteorMode = false }: { count?: number; meteorMode?: boolean }) {
  const RADIANT = 3.6; // 辐射方位(弧度,北偏)
  const state = useRef<Meteor[]>(makeMeteorState(count, meteorMode));
  useEffect(() => { state.current = makeMeteorState(count, meteorMode); }, [count, meteorMode]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const items = useMemo(
    () =>
      Array.from({ length: count }, () => {
        const headCount = 2;
        const lineSegments = meteorMode ? 18 : 9;
        const sparkCount = meteorMode ? 7 : 0;
        const headGeo = new THREE.BufferGeometry();
        const lineGeo = new THREE.BufferGeometry();
        const sparkGeo = new THREE.BufferGeometry();
        headGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(headCount * 3), 3));
        headGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(headCount * 3), 3));
        lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(lineSegments * 2 * 3), 3));
        lineGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(lineSegments * 2 * 3), 3));
        sparkGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(sparkCount * 3), 3));
        sparkGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(sparkCount * 3), 3));
        const headMat = new THREE.PointsMaterial({ size: meteorMode ? 4.8 : 4.2, map: fxGlow(), vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: false, fog: false });
        const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: meteorMode ? 1 : 0.78, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
        const sparkMat = new THREE.PointsMaterial({ size: meteorMode ? 2.2 : 1.8, map: fxGlow(), vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: false, fog: false });
        return { headGeo, lineGeo, sparkGeo, headMat, lineMat, sparkMat, headCount, lineSegments, sparkCount };
      }),
    [count, meteorMode],
  );
  useEffect(() => () => items.forEach((x) => {
    x.headGeo.dispose(); x.lineGeo.dispose(); x.sparkGeo.dispose();
    x.headMat.dispose(); x.lineMat.dispose(); x.sparkMat.dispose();
  }), [items]);

  const reroll = (st: Meteor) => {
    const a = RADIANT + (Math.random() - 0.5) * (meteorMode ? 0.85 : 0.55);
    const rr = (meteorMode ? 360 : 420) + Math.random() * (meteorMode ? 360 : 280);
    const startY = (meteorMode ? 265 : 250) + Math.random() * (meteorMode ? 165 : 150);
    st.from.set(Math.cos(a) * rr, startY, Math.sin(a) * rr);
    const dir = new THREE.Vector3(
      -Math.cos(a) * (meteorMode ? 0.56 : 0.45) + (Math.random() - 0.5) * (meteorMode ? 0.42 : 0.3),
      meteorMode ? -0.86 : -1,
      -Math.sin(a) * (meteorMode ? 0.56 : 0.45) + (Math.random() - 0.5) * (meteorMode ? 0.42 : 0.3),
    ).normalize();
    st.to.copy(st.from).addScaledVector(dir, (meteorMode ? 300 : 230) + Math.random() * (meteorMode ? 220 : 170));
    st.dur = (meteorMode ? 0.66 : 0.8) + Math.random() * (meteorMode ? 0.55 : 0.7);
    const cool = Math.random() > 0.35;
    st.tint = cool ? [0.64 + Math.random() * 0.14, 0.86, 1.0] : [1.0, 0.76 + Math.random() * 0.15, 0.58];
    st.flare = meteorMode ? 1.05 + Math.random() * 0.75 : 1;
  };

  useFrame((_, dt) => {
    state.current.forEach((st, mi) => {
      const grp = refs.current[mi];
      if (!grp) return;
      if (!st.init) { st.init = true; reroll(st); }
      st.t -= dt;
      if (st.t <= -st.dur) { st.t = (meteorMode ? 0.25 : 1.0) + Math.random() * (meteorMode ? 2.6 : 4.5); reroll(st); }
      const active = st.t <= 0;
      grp.visible = active;
      if (!active) return;
      const k = Math.min(1, -st.t / st.dur);
      const env = Math.sin(k * Math.PI); // 头尾渐隐
      const item = items[mi];
      const headArr = item.headGeo.attributes.position.array as Float32Array;
      const headCol = item.headGeo.attributes.color.array as Float32Array;
      const lineArr = item.lineGeo.attributes.position.array as Float32Array;
      const lineCol = item.lineGeo.attributes.color.array as Float32Array;
      const sparkArr = item.sparkGeo.attributes.position.array as Float32Array;
      const sparkCol = item.sparkGeo.attributes.color.array as Float32Array;
      const tailSpan = meteorMode ? 0.44 : 0.26;

      for (let j = 0; j < item.headCount; j++) {
        const trail = j / Math.max(1, item.headCount - 1);
        const kk = Math.max(0, k - j * (meteorMode ? 0.02 : 0.035));
        const curl = meteorMode ? Math.sin(j * 0.72 + mi * 1.9) * trail * 2.1 * env : 0;
        headArr[j * 3] = st.from.x + (st.to.x - st.from.x) * kk;
        headArr[j * 3 + 1] = st.from.y + (st.to.y - st.from.y) * kk;
        headArr[j * 3 + 2] = st.from.z + (st.to.z - st.from.z) * kk + curl;
        const taper = Math.pow(1 - trail, meteorMode ? 1.55 : 1);
        const twinkle = meteorMode ? 0.86 + 0.14 * Math.sin(k * 18 + mi * 2.7) : 1;
        const w = taper * env * twinkle;
        const core = Math.max(0, 1 - trail * (meteorMode ? 5.2 : 4.2)) * env * st.flare;
        headCol[j * 3] = st.tint[0] * w + core;
        headCol[j * 3 + 1] = st.tint[1] * w + core * 0.96;
        headCol[j * 3 + 2] = st.tint[2] * w + core * 0.9;
      }

      for (let j = 0; j < item.lineSegments; j++) {
        const t0 = j / item.lineSegments;
        const t1 = (j + 1) / item.lineSegments;
        const kk0 = Math.max(0, k - t0 * tailSpan);
        const kk1 = Math.max(0, k - t1 * tailSpan);
        const curl0 = meteorMode ? Math.sin(j * 0.58 + mi * 1.9) * t0 * 3.2 * env : 0;
        const curl1 = meteorMode ? Math.sin((j + 1) * 0.58 + mi * 1.9) * t1 * 3.2 * env : 0;
        const base = j * 6;
        lineArr[base] = st.from.x + (st.to.x - st.from.x) * kk0;
        lineArr[base + 1] = st.from.y + (st.to.y - st.from.y) * kk0;
        lineArr[base + 2] = st.from.z + (st.to.z - st.from.z) * kk0 + curl0;
        lineArr[base + 3] = st.from.x + (st.to.x - st.from.x) * kk1;
        lineArr[base + 4] = st.from.y + (st.to.y - st.from.y) * kk1;
        lineArr[base + 5] = st.from.z + (st.to.z - st.from.z) * kk1 + curl1;
        const a0 = (Math.pow(1 - t0, meteorMode ? 2.0 : 1.55) + (t0 < 0.08 ? 0.45 : 0)) * env;
        const a1 = (Math.pow(1 - t1, meteorMode ? 2.0 : 1.55) + (t1 < 0.08 ? 0.45 : 0)) * env;
        lineCol[base] = st.tint[0] * a0; lineCol[base + 1] = st.tint[1] * a0; lineCol[base + 2] = st.tint[2] * a0;
        lineCol[base + 3] = st.tint[0] * a1; lineCol[base + 4] = st.tint[1] * a1; lineCol[base + 5] = st.tint[2] * a1;
      }

      for (let j = 0; j < item.sparkCount; j++) {
        const trail = 0.16 + j * 0.07;
        const kk = Math.max(0, k - trail);
        const drift = (0.35 + j * 0.16) * env;
        sparkArr[j * 3] = st.from.x + (st.to.x - st.from.x) * kk + Math.sin(mi * 2.1 + j * 1.7) * drift;
        sparkArr[j * 3 + 1] = st.from.y + (st.to.y - st.from.y) * kk + Math.cos(mi * 1.6 + j * 1.3) * drift * 0.45;
        sparkArr[j * 3 + 2] = st.from.z + (st.to.z - st.from.z) * kk + Math.cos(mi * 1.9 + j * 1.5) * drift;
        const w = Math.pow(1 - j / Math.max(1, item.sparkCount), 1.4) * env * 0.72;
        sparkCol[j * 3] = st.tint[0] * w;
        sparkCol[j * 3 + 1] = st.tint[1] * w;
        sparkCol[j * 3 + 2] = st.tint[2] * w;
      }

      item.headGeo.attributes.position.needsUpdate = true;
      item.headGeo.attributes.color.needsUpdate = true;
      item.lineGeo.attributes.position.needsUpdate = true;
      item.lineGeo.attributes.color.needsUpdate = true;
      item.sparkGeo.attributes.position.needsUpdate = true;
      item.sparkGeo.attributes.color.needsUpdate = true;
    });
  });

  return (
    <>
      {items.map((it, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }} frustumCulled={false} visible={false}>
          <lineSegments geometry={it.lineGeo} material={it.lineMat} frustumCulled={false} />
          <points geometry={it.headGeo} material={it.headMat} frustumCulled={false} />
          {it.sparkCount > 0 && <points geometry={it.sparkGeo} material={it.sparkMat} frustumCulled={false} />}
        </group>
      ))}
    </>
  );
}

// ───────────────────────── 夜空浮尘 NightMotes ─────────────────────────
// 在玩家四周缓缓漂浮、明灭的暖色光尘,给夜里一层梦幻空气感。跟随相机中心区域。
export function NightMotes({ count = 60, posRef }: { count?: number; posRef?: { current: THREE.Vector3 | null } }) {
  const ref = useRef<THREE.Points>(null);
  const grp = useRef<THREE.Group>(null);
  const { geo, mat, base } = useMemo(() => {
    // 用确定性随机(makeRng)而非 Math.random():渲染须为纯函数,否则 StrictMode 下重复渲染抖动。
    const rnd = makeRng(count + 7);
    const pos = new Float32Array(count * 3);
    const base: [number, number, number][] = [];
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 6 + rnd() * 48;
      const x = Math.cos(a) * r, y = 1 + rnd() * 16, z = Math.sin(a) * r;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      base.push([x, y, z]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 7, map: fxGlow(), color: "#ffe6b0", transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: false, fog: false });
    return { geo, mat, base };
  }, [count]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame((s) => {
    // 从已挂载的 points 取 geometry/material 来改:不在帧回调里直接改 useMemo 产物(react-hooks/immutability)。
    const pts = ref.current; const g = pts?.geometry as THREE.BufferGeometry | undefined; const m = pts?.material as THREE.PointsMaterial | undefined;
    if (!g || !m) return;
    const t = s.clock.elapsedTime;
    const arr = g.attributes.position.array as Float32Array;
    for (let i = 0; i < base.length; i++) {
      arr[i * 3] = base[i][0] + Math.sin(t * 0.3 + i) * 1.4;
      arr[i * 3 + 1] = base[i][1] + Math.sin(t * 0.22 + i * 1.7) * 1.0;
      arr[i * 3 + 2] = base[i][2] + Math.cos(t * 0.27 + i * 0.7) * 1.4;
    }
    g.attributes.position.needsUpdate = true;
    m.opacity = 0.4 + Math.sin(t * 0.6) * 0.12;
    if (grp.current && posRef?.current) grp.current.position.set(posRef.current.x, 0, posRef.current.z); // 跟着玩家,走到哪儿夜尘绕到哪儿
  });
  return (
    <group ref={grp}>
      <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />
    </group>
  );
}
