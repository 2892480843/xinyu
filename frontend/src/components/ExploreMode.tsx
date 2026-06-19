import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Outlines, Html } from "@react-three/drei";
import { EffectComposer } from "@react-three/postprocessing";
import { Effect, EffectAttribute } from "postprocessing";
import * as THREE from "three";
import type { SceneVisual } from "../lib/sceneMap";
import type { SceneMotionMood } from "../lib/sceneMotion";
import { hash2, islandHeight, valueNoise, smoothstep01, ISLAND_RADIUS, ISLAND_SIZE } from "../lib/islandTerrain";

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
}

const WALK_RADIUS = ISLAND_RADIUS * EXS * 0.74; // 可走范围(留出海岸,随大岛自动放大)
const PLAYER_SPEED = 34.0; // 移动速度(手感:加速平滑后这个值像轻快小跑)
const CAM_DIST = 10.0; // 相机跟在身后的距离
const CAM_HEIGHT = 5.0; // 相机高度

// 模块级临时向量(单 Player 实例,逐帧复用,避开 react-hooks 对组件内值变异的规则)
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

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
function InstancedField({ geo, material, items }: { geo: THREE.BufferGeometry; material: THREE.Material; items: InstItem[] }) {
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

function Player({
  inputRef,
  posRef,
  avatar,
}: {
  inputRef: React.RefObject<Input>;
  posRef: React.RefObject<THREE.Vector3>;
  avatar: Avatar;
}) {
  const group = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const ripple = useRef<THREE.Mesh>(null);
  const facing = useRef(0);
  const walkPhase = useRef(0);
  const vel = useRef({ x: 0, z: 0 }); // 当前水平速度(用于加速/减速平滑)
  const introT = useRef(0); // 开场俯冲运镜进度 0→1
  const { camera } = useThree();

  useFrame((s, dtRaw) => {
    const g = group.current;
    const pos = posRef.current;
    if (!g || !pos) return;
    const dt = Math.min(dtRaw, 0.05);
    const input = inputRef.current ?? { x: 0, y: 0 };

    // 相机相对方向(投影到水平面)
    camera.getWorldDirection(_fwd);
    _fwd.setY(0).normalize();
    _right.crossVectors(_fwd, _up).normalize();
    _move.set(0, 0, 0).addScaledVector(_fwd, -input.y).addScaledVector(_right, input.x);
    const moving = _move.lengthSq() > 0.0001;

    if (moving) {
      _move.normalize();
      facing.current = Math.atan2(_move.x, _move.z);
    }

    // 加速/减速平滑(有重量感):速度向目标缓动,而非瞬时
    const tvx = moving ? _move.x * PLAYER_SPEED : 0;
    const tvz = moving ? _move.z * PLAYER_SPEED : 0;
    const accel = 1 - Math.pow(0.0009, dt); // 帧率无关
    vel.current.x += (tvx - vel.current.x) * accel;
    vel.current.z += (tvz - vel.current.z) * accel;
    pos.x += vel.current.x * dt;
    pos.z += vel.current.z * dt;
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

    // 贴地:浅滩可没到小腿(WADE_FLOOR),陆上随丘陵起伏
    pos.y = Math.max(exGroundY(pos.x, pos.z), WADE_FLOOR);
    const wading = pos.y < 0.02; // 脚在水面以下 = 涉水
    g.position.set(pos.x, pos.y, pos.z);

    // 朝向(缓转)
    let dy = facing.current - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * Math.min(1, dt * 9);

    // 走路:摆腿 + 身体微颠(频率/幅度随实际速度)
    const gait = Math.min(1, speedMag / (PLAYER_SPEED * 0.7));
    walkPhase.current += dt * speedMag * 0.9;
    const swing = Math.sin(walkPhase.current) * 0.6 * gait;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    g.position.y += Math.abs(Math.sin(walkPhase.current)) * 0.05 * gait;

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
        <CharacterModel avatar={avatar} legL={legL} legR={legR} />
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
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3, toneMapped: false }), [color]);
  useEffect(() => () => mat.dispose(), [mat]);

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
          <mesh material={mat}>
            <octahedronGeometry args={[0.14, 0]} />
          </mesh>
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
function Town({ toonGrad, accent }: { toonGrad: THREE.Texture; accent: string }) {
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
      out.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        s: 0.9 + hash2(i + 1, 2.2) * 0.7,
        pineKind: hash2(i + 1, 8.8) < 0.32, // ~1/3 针叶林
        warm: hash2(i + 1, 4.5) > 0.62, // 部分阔叶偏暖绿,做色彩层次
      });
    }
    return out;
  }, []);
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
  const gTowel = useMemo(() => new THREE.BoxGeometry(1.0, 0.04, 0.62), []); // 沙滩浴巾
  const gPine = useMemo(() => new THREE.ConeGeometry(0.5, 0.95, 7), []); // 针叶树冠(分层堆叠)
  const gMushStem = useMemo(() => new THREE.CylinderGeometry(0.04, 0.055, 0.18, 6), []);
  const gMushCap = useMemo(() => new THREE.SphereGeometry(0.13, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), []); // 蘑菇伞盖(半球)
  const gLily = useMemo(() => new THREE.CircleGeometry(0.42, 9), []); // 荷叶
  useEffect(
    () => () => [gTrunk, gLeaf, gBush, gFlower, gRock, gBuoy, gFencePost, gFenceRail, gPathTile, gDash, gUnitBox, gRoofPeak, gDoor, gWindow, gCrop, gHay, gPine, gMushStem, gMushCap, gLily].forEach((g) => g.dispose()),
    [gTrunk, gLeaf, gBush, gFlower, gRock, gBuoy, gFencePost, gFenceRail, gPathTile, gDash, gUnitBox, gRoofPeak, gDoor, gWindow, gCrop, gHay, gPine, gMushStem, gMushCap, gLily],
  );

  // 实例化布点(由散布数组换算到世界矩阵)
  const treeTrunks = useMemo(() => trees.map((t) => ({ p: [t.x, exGroundY(t.x, t.z) + 0.4 * t.s, t.z] as [number, number, number], s: t.s })), [trees]);
  // 阔叶树:下层主冠(冷/暖两种绿) + 上层小冠(亮绿),双层更饱满
  const blCool = useMemo(() => trees.filter((t) => !t.pineKind && !t.warm).map((t) => ({ p: [t.x, exGroundY(t.x, t.z) + 1.0 * t.s, t.z] as [number, number, number], s: t.s })), [trees]);
  const blWarm = useMemo(() => trees.filter((t) => !t.pineKind && t.warm).map((t) => ({ p: [t.x, exGroundY(t.x, t.z) + 1.0 * t.s, t.z] as [number, number, number], s: t.s })), [trees]);
  const blTop = useMemo(() => trees.filter((t) => !t.pineKind).map((t) => ({ p: [t.x, exGroundY(t.x, t.z) + 1.5 * t.s, t.z] as [number, number, number], s: 0.62 * t.s })), [trees]);
  // 针叶树:两层圆锥堆叠
  const pineLow = useMemo(() => trees.filter((t) => t.pineKind).map((t) => ({ p: [t.x, exGroundY(t.x, t.z) + 0.95 * t.s, t.z] as [number, number, number], s: t.s })), [trees]);
  const pineHigh = useMemo(() => trees.filter((t) => t.pineKind).map((t) => ({ p: [t.x, exGroundY(t.x, t.z) + 1.55 * t.s, t.z] as [number, number, number], s: 0.66 * t.s })), [trees]);
  // 蘑菇:奶白菌柄 + 红/褐伞盖
  const mushStems = useMemo(() => mushrooms.map((mu) => ({ p: [mu.x, exGroundY(mu.x, mu.z) + 0.09 * mu.s, mu.z] as [number, number, number], s: mu.s })), [mushrooms]);
  const mushCapRed = useMemo(() => mushrooms.filter((mu) => mu.red).map((mu) => ({ p: [mu.x, exGroundY(mu.x, mu.z) + 0.19 * mu.s, mu.z] as [number, number, number], s: mu.s })), [mushrooms]);
  const mushCapTan = useMemo(() => mushrooms.filter((mu) => !mu.red).map((mu) => ({ p: [mu.x, exGroundY(mu.x, mu.z) + 0.19 * mu.s, mu.z] as [number, number, number], s: mu.s })), [mushrooms]);
  const bushItems = useMemo(() => bushes.map((b) => ({ p: [b.x, exGroundY(b.x, b.z) + 0.12 * b.s, b.z] as [number, number, number], s: b.s })), [bushes]);
  const flowerPink = useMemo(() => flowers.filter((f) => f.c === 1).map((f) => ({ p: [f.x, exGroundY(f.x, f.z) + 0.08, f.z] as [number, number, number], s: 1 })), [flowers]);
  const flowerYellow = useMemo(() => flowers.filter((f) => f.c === 0).map((f) => ({ p: [f.x, exGroundY(f.x, f.z) + 0.08, f.z] as [number, number, number], s: 1 })), [flowers]);
  const rockItems = useMemo(() => rocks.map((r) => ({ p: [r.x, r.s * 0.3 - 0.05, r.z] as [number, number, number], s: r.s, r: [0.3, r.ry, 0.2] as [number, number, number] })), [rocks]);

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

  // 房子实例化:体/屋顶按材质分组(各一次绘制),门/窗各合一组。85 栋 ×6 → ~8 次绘制。
  const wallMats = useMemo(() => [wall, wall2, wall3], [wall, wall2, wall3]);
  const roofMats = useMemo(() => [roof, roof2, roof3], [roof, roof2, roof3]);
  const bodyGroups = useMemo(
    () =>
      wallMats.map((m) =>
        buildings
          .filter((b) => b.wm === m)
          .map((b) => ({ p: [b.x, exGroundY(b.x, b.z) - 0.1 + b.h / 2, b.z] as [number, number, number], sv: [b.w, b.h, b.d] as [number, number, number], r: [0, b.rot, 0] as [number, number, number] })),
      ),
    [wallMats, buildings],
  );
  const roofGroups = useMemo(
    () =>
      roofMats.map((m) =>
        buildings
          .filter((b) => b.rm === m)
          .map((b) => ({ p: [b.x, exGroundY(b.x, b.z) - 0.1 + b.h + 0.5, b.z] as [number, number, number], sv: [b.w * 1.05, 1.0, b.d * 1.05] as [number, number, number], r: [0, b.rot + Math.PI / 4, 0] as [number, number, number] })),
      ),
    [roofMats, buildings],
  );
  const doorItems = useMemo(
    () =>
      buildings.map((b) => {
        const dz = b.d / 2 + 0.02;
        return { p: [b.x + dz * Math.sin(b.rot), exGroundY(b.x, b.z) - 0.1 + 0.5, b.z + dz * Math.cos(b.rot)] as [number, number, number], r: [0, b.rot, 0] as [number, number, number] };
      }),
    [buildings],
  );
  const windowItems = useMemo(
    () =>
      buildings.flatMap((b) => {
        const dz = b.d / 2 + 0.02;
        const c = Math.cos(b.rot);
        const s = Math.sin(b.rot);
        const gy = exGroundY(b.x, b.z) - 0.1 + b.h * 0.62;
        return [b.w * 0.28, -b.w * 0.28].map((lx) => ({ p: [b.x + lx * c + dz * s, gy, b.z - lx * s + dz * c] as [number, number, number], r: [0, b.rot, 0] as [number, number, number] }));
      }),
    [buildings],
  );

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
        out.push({ p: [wx, exGroundY(wx, wz) + 0.35, wz], s: 0.8 + hash2(k, 3.1) * 0.5 });
      }
    }
    return out;
  }, [farms]);

  return (
    <group>
      {/* 房子(实例化:体/屋顶按材质分组 + 门 + 窗) */}
      {bodyGroups.map((items, k) => (
        <InstancedField key={`body${k}`} geo={gUnitBox} material={wallMats[k]} items={items} />
      ))}
      {roofGroups.map((items, k) => (
        <InstancedField key={`roof${k}`} geo={gRoofPeak} material={roofMats[k]} items={items} />
      ))}
      <InstancedField geo={gDoor} material={wood} items={doorItems} />
      <InstancedField geo={gWindow} material={dark} items={windowItems} />

      {/* 路面方砖(实例化) */}
      <InstancedField geo={gPathTile} material={stone} items={pathItems} />

      {/* 岛缘护栏(实例化:柱 + 横杆) */}
      <InstancedField geo={gFencePost} material={wood} items={fencePosts} />
      <InstancedField geo={gFenceRail} material={wood} items={fenceRails} />

      {/* 灌木(实例化) */}
      <InstancedField geo={gBush} material={bush} items={bushItems} />

      {/* 邮筒 */}
      <group position={[1.6, exGroundY(1.6, 2.2), 2.2]}>
        <mesh material={red} position={[0, 0.55, 0]}>
          <boxGeometry args={[0.34, 1.1, 0.34]} />
        </mesh>
        <mesh material={red} position={[0, 1.15, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.18, 10]} />
        </mesh>
      </group>

      {/* 长椅 */}
      <group position={[-1.8, exGroundY(-1.8, 2.6), 2.6]} rotation={[0, 0.4, 0]}>
        <mesh material={wood} position={[0, 0.28, 0]}>
          <boxGeometry args={[1.3, 0.08, 0.4]} />
        </mesh>
        <mesh material={wood} position={[0, 0.52, -0.18]}>
          <boxGeometry args={[1.3, 0.4, 0.06]} />
        </mesh>
      </group>

      {/* 木箱堆 */}
      <group position={[3.4, exGroundY(3.4, -0.6), -0.6]}>
        <mesh material={wood} position={[0, 0.3, 0]}>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
        </mesh>
        <mesh material={wood} position={[0.45, 0.25, 0.1]}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
        </mesh>
        <mesh material={wood} position={[0.05, 0.78, 0.05]} rotation={[0, 0.5, 0]}>
          <boxGeometry args={[0.45, 0.45, 0.45]} />
        </mesh>
      </group>
      {/* 树(实例化:树干 + 树冠) */}
      <InstancedField geo={gTrunk} material={trunk} items={treeTrunks} />
      {/* 阔叶树:双层树冠 + 冷暖两种绿 */}
      <InstancedField geo={gLeaf} material={leaf} items={blCool} />
      <InstancedField geo={gLeaf} material={leaf2} items={blWarm} />
      <InstancedField geo={gLeaf} material={leaf2} items={blTop} />
      {/* 针叶树:两层圆锥 */}
      <InstancedField geo={gPine} material={pine} items={pineLow} />
      <InstancedField geo={gPine} material={pine} items={pineHigh} />
      {/* 林间蘑菇 */}
      <InstancedField geo={gMushStem} material={wall} items={mushStems} />
      <InstancedField geo={gMushCap} material={red} items={mushCapRed} />
      <InstancedField geo={gMushCap} material={stone} items={mushCapTan} />
      {/* 路牌 */}
      <group position={[0.8, exGroundY(0.8, 1.4), 1.4]}>
        <mesh material={wood} position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 1.2, 6]} />
        </mesh>
        <mesh material={wall} position={[0, 1.05, 0]}>
          <boxGeometry args={[0.7, 0.3, 0.05]} />
        </mesh>
      </group>
      {/* 灯柱 ×2 */}
      {([[-2.4, 2.6], [2.8, -1.2]] as const).map(([x, z], i) => (
        <group key={i} position={[x, exGroundY(x, z), z]}>
          <mesh material={dark} position={[0, 0.8, 0]}>
            <cylinderGeometry args={[0.05, 0.06, 1.6, 6]} />
          </mesh>
          <mesh material={glow} position={[0, 1.7, 0]}>
            <boxGeometry args={[0.22, 0.22, 0.22]} />
          </mesh>
          <pointLight position={[0, 1.7, 0]} color="#ffe6a0" intensity={2.4} distance={4.5} decay={1.6} />
        </group>
      ))}
      {/* 售货机 */}
      <group position={[-4.0, exGroundY(-4.0, 0.6), 0.6]} rotation={[0, 0.8, 0]}>
        <mesh material={dark} position={[0, 0.7, 0]}>
          <boxGeometry args={[0.8, 1.4, 0.5]} />
        </mesh>
        <mesh material={glow} position={[0, 0.85, 0.27]}>
          <boxGeometry args={[0.55, 0.8, 0.04]} />
        </mesh>
      </group>

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

      {/* 路灯排 */}
      {lampRow.map((p, i) => (
        <group key={i} position={[p.x, exGroundY(p.x, p.z), p.z]}>
          <mesh material={dark} position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.05, 0.06, 1.8, 6]} />
          </mesh>
          <mesh material={glow} position={[0, 1.85, 0]}>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
          </mesh>
          <pointLight position={[0, 1.85, 0]} color="#ffe6a0" intensity={2} distance={4} decay={1.6} />
        </group>
      ))}

      {/* 路面中线虚线(实例化) */}
      <InstancedField geo={gDash} material={wall} items={dashItems} />

      {/* 鸟居(主路尽头的入口地标,跨在路上) */}
      <group position={[-WALK_RADIUS * 0.9, exGroundY(-WALK_RADIUS * 0.9, 0), 0]} rotation={[0, Math.PI / 2, 0]} scale={1.5}>
        <mesh material={red} position={[-0.9, 1.1, 0]}>
          <cylinderGeometry args={[0.12, 0.14, 2.2, 8]} />
        </mesh>
        <mesh material={red} position={[0.9, 1.1, 0]}>
          <cylinderGeometry args={[0.12, 0.14, 2.2, 8]} />
        </mesh>
        <mesh material={red} position={[0, 2.25, 0]}>
          <boxGeometry args={[2.5, 0.22, 0.3]} />
        </mesh>
        <mesh material={red} position={[0, 1.85, 0]}>
          <boxGeometry args={[2.1, 0.16, 0.22]} />
        </mesh>
      </group>

      {/* 小花(实例化,两色) */}
      <InstancedField geo={gFlower} material={petal} items={flowerPink} />
      <InstancedField geo={gFlower} material={petal2} items={flowerYellow} />

      {/* 农田作物 + 干草垛(实例化) */}
      <InstancedField geo={gCrop} material={crop} items={cropItems} />
      <InstancedField geo={gHay} material={hay} items={hayItems} />

      {/* 中央广场(铺石) */}
      <mesh material={stone} position={[0, exGroundY(0, 0) + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4.5, 32]} />
      </mesh>

      {/* 木栈桥(从大岛东岸伸进海里) */}
      <group position={[WALK_RADIUS + 0.5, 0, 0]}>
        <mesh material={wood} position={[0, 0.2, 0]}>
          <boxGeometry args={[6, 0.12, 1.7]} />
        </mesh>
        {[-2, 0, 2].map((dx, i) => (
          <group key={i}>
            <mesh material={wood} position={[dx, -0.4, 0.7]}>
              <cylinderGeometry args={[0.08, 0.08, 1.5, 6]} />
            </mesh>
            <mesh material={wood} position={[dx, -0.4, -0.7]}>
              <cylinderGeometry args={[0.08, 0.08, 1.5, 6]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* 浅滩礁石(实例化) */}
      <InstancedField geo={gRock} material={rock} items={rockItems} />

      {/* 小神社(岛上地标) */}
      <group position={[7, exGroundY(7, -7), -7]} rotation={[0, 0.5, 0]} scale={1.4}>
        <mesh material={wall3} position={[0, 0.55, 0]}>
          <boxGeometry args={[1.3, 1.1, 1.1]} />
        </mesh>
        <mesh material={red} position={[0, 1.35, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[1.15, 0.7, 4]} />
        </mesh>
      </group>

      {/* 灯塔(岛屿地标,呼应心屿灯塔) */}
      <group position={[-WALK_RADIUS * 0.92, exGroundY(-WALK_RADIUS * 0.92, -WALK_RADIUS * 0.3), -WALK_RADIUS * 0.3]} scale={1.8}>
        <mesh material={wall} position={[0, 2.2, 0]}>
          <cylinderGeometry args={[0.7, 1.05, 4.4, 14]} />
        </mesh>
        <mesh material={red} position={[0, 1.25, 0]}>
          <cylinderGeometry args={[0.92, 0.98, 0.55, 14]} />
        </mesh>
        <mesh material={red} position={[0, 3.0, 0]}>
          <cylinderGeometry args={[0.76, 0.8, 0.5, 14]} />
        </mesh>
        <mesh material={dark} position={[0, 4.55, 0]}>
          <cylinderGeometry args={[0.85, 0.85, 0.35, 14]} />
        </mesh>
        <mesh material={glow} position={[0, 5.05, 0]}>
          <cylinderGeometry args={[0.58, 0.58, 0.7, 12]} />
        </mesh>
        <pointLight position={[0, 5.05, 0]} color="#ffeec0" intensity={8} distance={22} decay={1.3} />
        <mesh material={red} position={[0, 5.65, 0]}>
          <coneGeometry args={[0.72, 0.6, 12]} />
        </mesh>
      </group>

      {/* 小船(停泊在东岸) */}
      {boats.map((b, i) => (
        <group key={i} position={[b.x, 0.12, b.z]} rotation={[0, b.rot, 0]}>
          <mesh material={wood} position={[0, 0.18, 0]}>
            <boxGeometry args={[1.8, 0.4, 0.8]} />
          </mesh>
          <mesh material={dark} position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 1.1, 5]} />
          </mesh>
          <mesh material={wall} position={[0, 0.75, 0.22]}>
            <boxGeometry args={[0.03, 0.8, 0.7]} />
          </mesh>
        </group>
      ))}

      {/* 浮标(实例化,水里漂) */}
      <InstancedField geo={gBuoy} material={red} items={buoyItems} />

      {/* 沙滩遮阳伞 */}
      {parasols.map((p, i) => (
        <group key={i} position={[p.x, Math.max(exGroundY(p.x, p.z), 0.05), p.z]}>
          <mesh material={dark} position={[0, 0.55, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 1.1, 5]} />
          </mesh>
          <mesh material={p.c ? petal : petal2} position={[0, 1.05, 0]}>
            <coneGeometry args={[0.7, 0.4, 12]} />
          </mesh>
        </group>
      ))}

      {/* 沙滩浴巾(海湾里铺一片) */}
      {towels.map((t, i) => (
        <group key={i} position={t.p} rotation={t.r}>
          <mesh geometry={gTowel} material={towelMats[t.c]} />
          <mesh geometry={gTowel} material={stone} position={[0, 0.025, 0]} scale={[1.02, 0.5, 0.34]} />
        </group>
      ))}

      {/* 贝壳 / 卵石(实例化,沿岸沙地) */}
      <InstancedField geo={gShell} material={shell} items={shellItems} />

      {/* 风车(岛屿地标) */}
      <group position={[-WALK_RADIUS * 0.35, exGroundY(-WALK_RADIUS * 0.35, WALK_RADIUS * 0.45), WALK_RADIUS * 0.45]} scale={1.8}>
        <mesh material={wall} position={[0, 1.6, 0]}>
          <cylinderGeometry args={[0.55, 0.9, 3.2, 10]} />
        </mesh>
        <mesh material={red} position={[0, 3.45, 0]}>
          <coneGeometry args={[0.78, 0.7, 10]} />
        </mesh>
        <group position={[0, 3.0, 0.7]}>
          <mesh material={dark} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.25, 8]} />
          </mesh>
          {[0, 1, 2, 3].map((k) => (
            <group key={k} rotation={[0, 0, (k * Math.PI) / 2]}>
              <mesh material={wood} position={[0, 0.95, 0]}>
                <boxGeometry args={[0.22, 1.8, 0.04]} />
              </mesh>
            </group>
          ))}
        </group>
      </group>

      {/* 池塘 + 芦苇 */}
      <mesh material={pond} position={[WALK_RADIUS * 0.3, exGroundY(WALK_RADIUS * 0.3, WALK_RADIUS * 0.3) + 0.04, WALK_RADIUS * 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[6, 30]} />
      </mesh>
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

      {/* 石灯笼(岛上) */}
      {([[7, -13], [13, -6], [-9, 11], [11, 9]] as const).map(([lx, lz], i) => (
        <group key={i} position={[lx, exGroundY(lx, lz), lz]}>
          <mesh material={stone} position={[0, 0.15, 0]}>
            <boxGeometry args={[0.4, 0.3, 0.4]} />
          </mesh>
          <mesh material={stone} position={[0, 0.55, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.6, 6]} />
          </mesh>
          <mesh material={glow} position={[0, 1.0, 0]}>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
          </mesh>
          <mesh material={stone} position={[0, 1.28, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[0.34, 0.28, 4]} />
          </mesh>
        </group>
      ))}
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
        <mesh material={mats.rock} position={[0, 1.0, 0]} rotation={[0.12, LOOK_A, 0.06]}>
          <icosahedronGeometry args={[1.2, 0]} />
          <Outlines thickness={0.02} color="#1a2230" />
        </mesh>
        <mesh material={mats.rock} position={[0.8, 0.4, 0.5]}>
          <icosahedronGeometry args={[0.5, 0]} />
        </mesh>
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
        <mesh material={mats.body} scale={[9, 3, 3.6]}>
          <icosahedronGeometry args={[1, 1]} />
          <Outlines thickness={0.012} color="#1a2230" />
        </mesh>
        <mesh material={mats.belly} position={[0.3, -0.7, 0]} scale={[8, 1.5, 3.1]}>
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
        {/* 夜间生物荧光斑点(白天不显) */}
        {night &&
          ([
            [-6.5, 1.4, 1.7],
            [-4, 2.0, 0.5],
            [-2, 1.9, -1.3],
            [0, 2.3, 1.1],
            [2, 2.0, -0.7],
            [4, 1.7, 1.5],
            [5.6, 1.4, -0.9],
            [-5, 1.6, -1.6],
          ] as [number, number, number][]).map((p, k) => (
            <mesh key={k} material={mats.glow} position={p} scale={0.13 + (k % 3) * 0.05}>
              <sphereGeometry args={[1, 6, 6]} />
            </mesh>
          ))}
        {/* 尾鳍 */}
        <mesh material={mats.body} position={[-9, 0.4, 1.2]} rotation={[0.5, 0, Math.PI / 2]} scale={[1.3, 2.4, 0.28]}>
          <coneGeometry args={[1, 1, 4]} />
        </mesh>
        <mesh material={mats.body} position={[-9, 0.4, -1.2]} rotation={[-0.5, 0, Math.PI / 2]} scale={[1.3, 2.4, 0.28]}>
          <coneGeometry args={[1, 1, 4]} />
        </mesh>
        {/* 眼睛(两侧各一,任何角度都能看见) */}
        <mesh material={mats.eye} position={[6.6, 0.7, 1.7]} scale={0.42}>
          <sphereGeometry args={[1, 8, 8]} />
        </mesh>
        <mesh material={mats.eye} position={[6.6, 0.7, -1.7]} scale={0.42}>
          <sphereGeometry args={[1, 8, 8]} />
        </mesh>
        {/* 喷水 */}
        <group ref={spout} position={[5.6, 3.0, 0]} visible={false}>
          <mesh material={mats.spout} position={[0, 0.6, 0]} scale={[0.6, 1.6, 0.6]}>
            <sphereGeometry args={[1, 8, 8]} />
          </mesh>
          <mesh material={mats.spout} position={[0.5, 1.4, 0.3]} scale={0.5}>
            <sphereGeometry args={[1, 8, 8]} />
          </mesh>
          <mesh material={mats.spout} position={[-0.45, 1.5, -0.2]} scale={0.45}>
            <sphereGeometry args={[1, 8, 8]} />
          </mesh>
        </group>
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
          <mesh material={mats.glass} position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.1, 0.11, 0.32, 10]} />
          </mesh>
          <mesh material={mats.glass} position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.045, 0.08, 0.14, 8]} />
          </mesh>
          <mesh material={mats.cork} position={[0, 0.49, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.06, 8]} />
          </mesh>
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
}) {
  const terrain = useMemo(() => buildExploreTerrain(), []);
  useEffect(() => () => terrain.dispose(), [terrain]);
  const posRef = useRef(new THREE.Vector3(0, 0, 0));
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
      grd.addColorStop(0, visual.skyTop);
      grd.addColorStop(0.5, visual.skyMid);
      grd.addColorStop(1, visual.skyBottom);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 16, 256);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [visual.skyTop, visual.skyMid, visual.skyBottom]);
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
      <fog attach="fog" args={[fogHex, 230, 1060]} />
      <ambientLight intensity={0.75} />
      <hemisphereLight args={[new THREE.Color(visual.skyMid).getHex(), new THREE.Color(visual.sea).getHex(), 0.6]} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} color={visual.celestial} />

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
      <Town toonGrad={toonGrad} accent={visual.accent} />
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

      <Player inputRef={inputRef} posRef={posRef} avatar={avatar} />
      <Npcs animate posRef={posRef} mood={visual.motion} emotion={emotion} giftedIds={giftedIds} onNear={onNear} />
      <SecretWhale posRef={posRef} onFound={onWhale} night={visual.time === "night" || visual.stars} />
      <DriftBottles posRef={posRef} onFind={onBottle} notes={bottleNotes} />
      {imprints.length > 0 ? <MemoryImprints posRef={posRef} imprints={imprints} onPick={onPickImprint} /> : <Wishes posRef={posRef} color={visual.accent} onCollect={onCollect} total={total} />}
      {treeColors.length > 0 && <MemoryTree colors={treeColors} />}

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

export default function ExploreMode({ visual, onExit, emotion, bottleNotes, imprints = [] }: { visual: SceneVisual; onExit: () => void; emotion?: string; bottleNotes?: string[]; imprints?: Imprint[] }) {
  const inputRef = useRef<Input>({ x: 0, y: 0 });
  const keys = useRef<Set<string>>(new Set());
  const total = 5;
  const [collected, setCollected] = useState(0);
  const imp = imprints;
  const [pickedImprints, setPickedImprints] = useState<number[]>([]); // 已拾起的心灵印记下标
  const [shownImprint, setShownImprint] = useState<Imprint | null>(null); // 当前展开的来源卡
  const hasImprints = imp.length > 0;
  const [nearNpc, setNearNpc] = useState(-1); // 当前可搭话的 NPC(-1=无),由场景内 onNear 回报
  const [giftedIds, setGiftedIds] = useState<number[]>([]); // 已送过心愿的 NPC
  const [avatar, setAvatar] = useState<Avatar>(loadAvatar); // 你捏的人物外观(本地保存)
  const [dressOpen, setDressOpen] = useState(false); // 换装面板开关
  const [whaleFound, setWhaleFound] = useState(false); // 🐋 彩蛋:发现鲸落之海
  const [bottles, setBottles] = useState<number[]>([]); // 🍾 彩蛋:拾到的漂流瓶下标
  useEffect(() => {
    try {
      localStorage.setItem("xy_avatar", JSON.stringify(avatar));
    } catch {
      /* ignore */
    }
  }, [avatar]);
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
      if ((key === "e" || key === " ") && !e.repeat) {
        const id = nearRef.current;
        if (id >= 0) setGiftedIds((g) => (g.includes(id) ? g : [...g, id]));
      }
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
          <ExploreScene visual={visual} inputRef={inputRef} onCollect={() => setCollected((c) => c + 1)} total={total} giftedIds={giftedIds} onNear={setNearNpc} emotion={emotion} avatar={avatar} onWhale={() => setWhaleFound(true)} onBottle={(i) => setBottles((b) => (b.includes(i) ? b : [...b, i]))} bottleNotes={bottleNotes} imprints={imp} onPickImprint={(i) => { setPickedImprints((p) => (p.includes(i) ? p : [...p, i])); setShownImprint(imp[i]); }} treeColors={imprintsDone ? pickedImprints.map((i) => imp[i].color) : []} />
        </Suspense>
      </Canvas>

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
        WASD / 方向键 移动 · 左下摇杆
      </p>

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

      <Joystick inputRef={inputRef} />
    </div>
  );
}
