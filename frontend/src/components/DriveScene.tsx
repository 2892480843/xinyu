/* eslint-disable react-hooks/immutability -- R3F frame loops intentionally mutate Three.js objects. */
import { Suspense, useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Html } from "@react-three/drei";
import * as THREE from "three";
import { startEngine, stopEngine, setEngineSpeed, play as playSfx } from "../lib/sfx";

// 第二张「可开车地图」:林间土路(~117MB → 只在进入此地图时按需加载,绝不预载)。自带 Canvas,与岛场景隔离。
// 不穿模:贴地用车头/车尾/中心三点射线取「最高地面」+ 顺坡法线躺平;前向射线挡住树/岩/陡壁(斜坡放行)。
const ROAD_URL = "/models/free_dirt_road_through_forest.glb";
const QICHE_URL = "/models/qiche.glb";
const CAR_SCALE = 0.05;
const CAR_LIFT = 0.6; // 贴地抬升
const MAX_SPEED = 34;
const FIT_SIZE = 300;
const WHEEL_F = 2.0; // 车头采样(沿航向)
const WHEEL_R = -2.0; // 车尾采样

interface DriveInput {
  x: number;
  y: number;
}

const _camTarget = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _o = new THREE.Vector3();
const _hitN = new THREE.Vector3(0, 1, 0);
const _tiltN = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qBank = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _fdir = new THREE.Vector3();
const _dm = new THREE.Matrix4();

function makeToonGrad() {
  const d = new Uint8Array([96, 96, 96, 255, 178, 178, 178, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// 载入土路 glb:按包围盒缩放 + 仅居中 XZ(Y 不动,交给射线探测路面)
function ForestRoad({ roadRef }: { roadRef: RefObject<THREE.Object3D | null> }) {
  const { scene } = useGLTF(ROAD_URL);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const s = FIT_SIZE / (Math.max(size.x, size.z) || 1);
    c.scale.setScalar(s);
    c.position.set(-center.x * s, 0, -center.z * s);
    c.updateMatrixWorld(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.receiveShadow = false;
      }
    });
    return c;
  }, [scene]);
  useEffect(() => {
    roadRef.current = obj;
    return () => {
      if (roadRef.current === obj) roadRef.current = null;
    };
  }, [obj, roadRef]);
  return <primitive object={obj} />;
}

// 汽车(卡通化 + 暖橙红,与岛上黄车区分)+ 驾驶 + 三点贴地不穿模 + 前向挡障 + 车尾扬尘 + 追尾相机 + 引擎声
function DriveCar({ inputRef, roadRef }: { inputRef: RefObject<DriveInput | null>; roadRef: RefObject<THREE.Object3D | null> }) {
  const { scene } = useGLTF(QICHE_URL);
  const carGrad = useMemo(() => makeToonGrad(), []);
  const car = useMemo(() => {
    const c = scene.clone(true);
    const tint = new THREE.Color("#e8643c"); // 卡通暖橙红
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const conv = (src: THREE.Material) => {
        const std = src as THREE.MeshStandardMaterial;
        const base = std.color ? std.color.clone().multiply(tint) : tint.clone();
        return new THREE.MeshToonMaterial({ color: base, gradientMap: carGrad });
      };
      m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
    });
    return c;
  }, [scene, carGrad]);
  useEffect(() => () => carGrad.dispose(), [carGrad]);

  const g = useRef<THREE.Group>(null);
  const dust = useRef<THREE.InstancedMesh>(null);
  const st = useRef({ x: 0, z: 0, heading: 0, speed: 0, clk: 0 });
  const groundY = useRef(0);
  const found = useRef(false);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const dustGeo = useMemo(() => new THREE.SphereGeometry(0.45, 6, 5), []);
  const dustMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#cab39a", transparent: true, opacity: 0.5, depthWrite: false }), []);
  const puffs = useRef(Array.from({ length: 20 }, () => ({ x: 0, y: -999, z: 0, life: 0, sz: 0 })));
  const ph = useRef(0);
  const acc = useRef(0);
  const { camera } = useThree();
  useEffect(() => {
    startEngine();
    playSfx("whoosh");
    return () => stopEngine();
  }, []);
  useEffect(() => () => { dustGeo.dispose(); dustMat.dispose(); }, [dustGeo, dustMat]);

  // 向下射线取地面高度;命中时把法线写入 _hitN。返回 y 或 null。
  const castGround = (x: number, z: number, fromY?: number, far = 50): number | null => {
    const road = roadRef.current;
    if (!road) return null;
    _o.set(x, fromY ?? groundY.current + 8, z); // 默认从车上方一点点打(忽略高处树冠);出生时传高空值
    ray.set(_o, _down);
    ray.far = far;
    const h = ray.intersectObject(road, true);
    if (!h.length) return null;
    if (h[0].face) {
      _hitN.copy(h[0].face.normal).transformDirection(h[0].object.matrixWorld);
      if (_hitN.y < 0) _hitN.negate();
    } else _hitN.set(0, 1, 0);
    return h[0].point.y;
  };

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const o = g.current;
    if (!o) return;
    const inp = inputRef.current ?? { x: 0, y: 0 };
    const s = st.current;
    s.clk += dt;
    const road = roadRef.current;

    // 首次落地:原点周围宽网格取命中中位数 = 稳健路面高度
    if (!found.current && road) {
      const ys: number[] = [];
      for (let dx = -80; dx <= 80; dx += 32) {
        for (let dz = -80; dz <= 80; dz += 32) {
          const y = castGround(dx, dz, 2000, 4000); // 高空起射 → 命中很高的路面(出生不再悬空)
          if (y !== null) ys.push(y);
        }
      }
      if (ys.length) {
        ys.sort((a, b) => a - b);
        groundY.current = ys[Math.floor(ys.length / 2)];
        found.current = true;
      }
    }

    // 油门/刹车(平滑,松手缓滑停);倒车上限低
    const target = inp.y < 0 ? -inp.y * MAX_SPEED : inp.y > 0 ? -inp.y * MAX_SPEED * 0.5 : 0;
    const k = inp.y !== 0 ? 1 - Math.pow(0.12, dt) : 1 - Math.pow(0.5, dt);
    s.speed += (target - s.speed) * k;
    if (Math.abs(s.speed) < 0.04) s.speed = 0;
    const frac = Math.min(1, Math.abs(s.speed) / MAX_SPEED);

    // 转向:A/方向左 = 左,D/方向右 = 右(inp.x:左 -1 右 +1);低速灵活、高速沉稳,静止不转
    const turnRate = (2.4 - frac * 1.1) * (Math.abs(s.speed) > 0.25 ? 1 : 0);
    s.heading += inp.x * turnRate * dt * (s.speed >= 0 ? 1 : -1);

    // 试探前进位置
    const nx = s.x + Math.sin(s.heading) * s.speed * dt;
    const nz = s.z + Math.cos(s.heading) * s.speed * dt;

    // 前向挡障:车前打一条射线,撞到接近垂直的面(树/岩/陡壁,法线偏横)→ 挡住;斜坡(法线偏上)放行
    let blocked = false;
    if (road && Math.abs(s.speed) > 0.5) {
      const dir = s.speed >= 0 ? 1 : -1;
      _fdir.set(Math.sin(s.heading) * dir, 0, Math.cos(s.heading) * dir);
      _o.set(s.x, groundY.current + 1.0, s.z);
      ray.set(_o, _fdir);
      ray.far = 2.2;
      const fh = ray.intersectObject(road, true);
      if (fh.length && fh[0].face) {
        _hitN.copy(fh[0].face.normal).transformDirection(fh[0].object.matrixWorld);
        if (Math.abs(_hitN.y) < 0.5) blocked = true; // 仅近乎垂直的面(树/岩/壁)才挡,斜坡放行
      }
    }
    if (blocked) s.speed *= 0.25;
    else {
      s.x = nx;
      s.z = nz;
    }
    const lim = FIT_SIZE * 0.5;
    const r = Math.hypot(s.x, s.z);
    if (r > lim) {
      s.x *= lim / r;
      s.z *= lim / r;
      s.speed *= 0.35;
    }

    // 贴地:车头/中心/车尾三点取「最高地面」→ 任何一处都不扎进坡;中心法线定姿态
    if (found.current && road) {
      const cy = castGround(s.x, s.z);
      if (cy !== null) _tiltN.lerp(_hitN, Math.min(1, dt * 6)).normalize();
      const fy = castGround(s.x + Math.sin(s.heading) * WHEEL_F, s.z + Math.cos(s.heading) * WHEEL_F);
      const ry = castGround(s.x + Math.sin(s.heading) * WHEEL_R, s.z + Math.cos(s.heading) * WHEEL_R);
      let top = -Infinity;
      if (cy !== null) top = Math.max(top, cy);
      if (fy !== null) top = Math.max(top, fy);
      if (ry !== null) top = Math.max(top, ry);
      if (top > -1e8) groundY.current += (top - groundY.current) * Math.min(1, dt * 22);
    }

    const gy = groundY.current;
    const bob = Math.abs(s.speed) > 1 ? Math.sin(s.clk * 14) * 0.03 * frac : 0;
    o.position.set(s.x, gy + CAR_LIFT + bob, s.z);
    // 姿态:up = 坡面法线,fwd = 航向投影到坡面 → 顺坡躺平;再叠转向侧倾
    _up.copy(_tiltN);
    _fwd.set(Math.sin(s.heading), 0, Math.cos(s.heading));
    _fwd.addScaledVector(_up, -_fwd.dot(_up));
    if (_fwd.lengthSq() < 1e-6) _fwd.set(Math.sin(s.heading), 0, Math.cos(s.heading));
    _fwd.normalize();
    _right.crossVectors(_up, _fwd).normalize();
    _basis.makeBasis(_right, _up, _fwd);
    _q.setFromRotationMatrix(_basis);
    _qBank.setFromAxisAngle(_zAxis, -inp.x * 0.13 * frac * (s.speed >= 0 ? 1 : -1));
    _q.multiply(_qBank);
    o.quaternion.slerp(_q, Math.min(1, dt * 9));
    setEngineSpeed(frac);

    // 车尾扬尘(贴着车尾,不要太远):快跑时在车尾偏下生成,渐扩渐淡
    const dm = dust.current;
    if (dm) {
      if (frac > 0.18) {
        acc.current += dt;
        if (acc.current > 0.05) {
          acc.current = 0;
          const p = puffs.current[ph.current % puffs.current.length];
          ph.current++;
          const side = (Math.random() - 0.5) * 1.2;
          p.x = s.x - Math.sin(s.heading) * 2.0 + Math.cos(s.heading) * side;
          p.z = s.z - Math.cos(s.heading) * 2.0 - Math.sin(s.heading) * side;
          p.y = gy + 0.25;
          p.life = 1;
          p.sz = 0.5 + Math.random() * 0.4;
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

    // 追尾相机:车速越快拉得越远、看得越前
    const cb = 12 + frac * 6;
    const cu = 5.5 + frac * 1.5;
    _camTarget.set(s.x - Math.sin(s.heading) * cb, gy + cu, s.z - Math.cos(s.heading) * cb);
    camera.position.lerp(_camTarget, Math.min(1, dt * 2.8));
    camera.lookAt(s.x + Math.sin(s.heading) * 4, gy + 1.4, s.z + Math.cos(s.heading) * 4);
  });
  return (
    <>
      <group ref={g}>
        <primitive object={car} scale={CAR_SCALE} />
      </group>
      <instancedMesh ref={dust} args={[dustGeo, dustMat, 20]} frustumCulled={false} />
    </>
  );
}

// 触屏控制:左侧转向(◄ ►)、右侧油门/刹车(▲ ▼);键盘 A左 D右 W前 S后 + 方向键同(共用 inputRef)。
function HoldBtn({ label, onActive, style }: { label: string; onActive: (on: boolean) => void; style: React.CSSProperties }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onActive(true); }}
      onPointerUp={(e) => { e.preventDefault(); onActive(false); }}
      onPointerLeave={() => onActive(false)}
      onPointerCancel={() => onActive(false)}
      className="absolute z-10 flex items-center justify-center rounded-full panel-glass-2 text-white/85 select-none active:scale-90 transition-transform"
      style={{ width: 64, height: 64, touchAction: "none", ...style }}
    >
      <span className="text-[22px] leading-none">{label}</span>
    </button>
  );
}

export default function DriveScene({ inputRef, onExit }: { inputRef: RefObject<DriveInput | null>; onExit: () => void }) {
  const roadRef = useRef<THREE.Object3D | null>(null);
  const steer = useRef(0);
  const gas = useRef(0);
  const apply = () => {
    if (inputRef.current) {
      inputRef.current.x = steer.current;
      inputRef.current.y = gas.current;
    }
  };
  // 自带键盘:A/← 左,D/→ 右,W/↑ 前,S/↓ 后;并阻止方向键滚动页面
  useEffect(() => {
    const sharedInput = inputRef.current;
    const keys = new Set<string>();
    const recompute = () => {
      let x = 0;
      let y = 0;
      if (keys.has("a") || keys.has("arrowleft")) x -= 1;
      if (keys.has("d") || keys.has("arrowright")) x += 1;
      if (keys.has("w") || keys.has("arrowup")) y -= 1;
      if (keys.has("s") || keys.has("arrowdown")) y += 1;
      if (inputRef.current) {
        inputRef.current.x = x;
        inputRef.current.y = y;
      }
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
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
      if (sharedInput) {
        sharedInput.x = 0;
        sharedInput.y = 0;
      }
    };
  }, [inputRef]);
  return (
    <div className="fixed inset-0 z-40" style={{ background: "linear-gradient(to bottom,#9fc6da,#cfe3ea)" }}>
      <Canvas camera={{ position: [0, 9, 18], fov: 56 }} dpr={[1, 1.7]} gl={{ antialias: true }}>
        <color attach="background" args={["#bcd9e6"]} />
        <fog attach="fog" args={["#bcd9e6", 160, 540]} />
        <ambientLight intensity={0.9} />
        <hemisphereLight args={[new THREE.Color("#dcecf3").getHex(), new THREE.Color("#5a6a4a").getHex(), 0.7]} />
        <directionalLight position={[60, 120, 40]} intensity={1.3} />
        <Suspense
          fallback={
            <Html center>
              <div style={{ color: "#fff", textAlign: "center", whiteSpace: "nowrap", textShadow: "0 1px 8px rgba(0,0,0,.6)", fontSize: 15 }}>
                载入林间土路…
                <br />
                <span style={{ fontSize: 12, opacity: 0.8 }}>模型较大,首次稍候</span>
              </div>
            </Html>
          }
        >
          <ForestRoad roadRef={roadRef} />
          <DriveCar inputRef={inputRef} roadRef={roadRef} />
        </Suspense>
      </Canvas>

      <button
        onClick={onExit}
        className="btn-link absolute z-10 text-white/85"
        style={{ top: "calc(1.4rem + env(safe-area-inset-top))", right: "calc(1.4rem + env(safe-area-inset-right))" }}
      >
        ↩ 回到岛上
      </button>
      <div className="absolute z-10 panel-glass-1 rounded-full px-4 py-1.5 text-caption text-white/80" style={{ top: "calc(1.4rem + env(safe-area-inset-top))", left: "calc(1.4rem + env(safe-area-inset-left))" }}>
        🌲 林间土路 · A左 D右 W前 S后(方向键同)
      </div>

      {/* 触屏:左转向 右油门 */}
      <HoldBtn label="◄" onActive={(on) => { steer.current = on ? -1 : 0; apply(); }} style={{ left: "calc(1.6rem + env(safe-area-inset-left))", bottom: "calc(3.2rem + env(safe-area-inset-bottom))" }} />
      <HoldBtn label="►" onActive={(on) => { steer.current = on ? 1 : 0; apply(); }} style={{ left: "calc(8.4rem + env(safe-area-inset-left))", bottom: "calc(3.2rem + env(safe-area-inset-bottom))" }} />
      <HoldBtn label="▲" onActive={(on) => { gas.current = on ? -1 : 0; apply(); }} style={{ right: "calc(1.9rem + env(safe-area-inset-right))", bottom: "calc(7.4rem + env(safe-area-inset-bottom))" }} />
      <HoldBtn label="▼" onActive={(on) => { gas.current = on ? 1 : 0; apply(); }} style={{ right: "calc(1.9rem + env(safe-area-inset-right))", bottom: "calc(0.8rem + env(safe-area-inset-bottom))" }} />
    </div>
  );
}
