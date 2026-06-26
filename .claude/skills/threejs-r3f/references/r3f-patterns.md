# react-three-fiber 实战模式(本项目 v9 + React 19)

## 目录
- [Canvas 创建](#canvas-创建)
- [模型加载(glb/gltf)](#模型加载glbgltf)
- [深 clone 与材质替换](#深-clone-与材质替换)
- [drei 常用 helper](#drei-常用-helper)
- [自定义 hooks](#自定义-hooks)
- [声明式 vs 命令式](#声明式-vs-命令式)
- [常见坑](#常见坑)

## Canvas 创建

本项目的 Canvas 模板(见 `Island3D.tsx` 内 `<Canvas>`):

```tsx
<div className="absolute inset-0 overflow-hidden" style={{ background: sky }}>
  <Canvas
    gl={{ antialias: tier === "high", alpha: false, powerPreference: "high-performance" }}
    dpr={tier === "high" ? [1, 1.75] : [1, 1]}
    camera={{ position: [0, 2.1, 7], fov: 46, near: 0.1, far: 100 }}
    frameloop={animate ? "always" : "demand"}
  >
    {/* scene */}
  </Canvas>
</div>
```

要点:
- **父容器必须定位**(`absolute inset-0`),Canvas 才能全屏铺满。
- `dpr` 设上限数组 `[min, max]`,别让高分屏直接 ×3 渲染(性能杀手)。按 perfTier 调。
- `alpha: false` + 父容器背景色 = 省一层合成、天空背景由 div 兜底。
- `frameloop` 跟随是否需要连续动画(见 SKILL 红线 6 与 performance.md)。

## 模型加载(glb/gltf)

所有模型在 `frontend/public/models/`,以 URL 字符串引用(`"/models/xy_xxx.glb"`)。集中在一个 `MODELS` 对象里管理。

```tsx
import { useGLTF } from "@react-three/drei";

// 预加载小模型(首屏),重模型走 HEAVY_DEFER 不预载
const HEAVY_DEFER = new Set([MODELS.bathhouse, MODELS.qiche, MODELS.skyLantern /* … */]);
Object.values(MODELS).forEach((u) => { if (!HEAVY_DEFER.has(u)) useGLTF.preload(u); });

function MyProp() {
  const { scene } = useGLTF(MODELS.fox);
  const obj = useMemo(() => scene.clone(true), [scene]); // ← 必须 clone
  return <primitive object={obj} />;
}
```

重模型独立 Suspense,不阻塞首屏:

```tsx
<Suspense fallback={null}>
  <Bathhouse />   {/* 各自一个 Suspense,带宽不互抢,地形先可见可走 */}
</Suspense>
```

## 深 clone 与材质替换

`useGLTF` 返回**共享缓存**。改它的材质 = 改全部副本。模板(参考 `Island3D.tsx` 的 `toonifyIsland`):

```tsx
function toonify(src: THREE.Object3D, grad: THREE.Texture) {
  const root = src.clone(true);                      // 深 clone
  const cache = new Map<THREE.Material, THREE.Material>(); // 同材质只转一次
  const conv = (m: THREE.Material): THREE.Material => {
    if (cache.has(m)) return cache.get(m)!;
    const std = m as THREE.MeshStandardMaterial;
    const out = std.emissiveIntensity > 0
      ? new THREE.MeshStandardMaterial({ /* 自发光保 std */ })
      : new THREE.MeshToonMaterial({ color: std.color, gradientMap: grad });
    cache.set(m, out);
    return out;
  };
  root.traverse((o) => { if (o instanceof THREE.Mesh) o.material = conv(o.material); });
  return root;
}
```

glb 缺节点名时要兜底,别让 `clone(undefined)` 抛错:
```tsx
const variants = [...].filter(Boolean) as THREE.Object3D[];
if (variants.length === 0) return [];
```

## drei 常用 helper

本项目实际在用:
- `useGLTF` / `useGLTF.preload` — 模型加载。
- `MeshReflectorMaterial` — 水面反射(分辨率按 perfTier:high 384 / low 160)。
- `<EffectComposer>` + `<Bloom>` / `<GodRays>` / `<Vignette>` — 来自 postprocessing(见 assets-shaders.md)。
- `<Outlines>` / 自定义 `ToonOutlineEffect` — 卡通描边。

加 drei 组件前先确认 v10 的 props 签名(和老版本可能不同),以本仓现有用法为准。

## 自定义 hooks

- `useSkin3d()` — 读/订阅 3D 皮肤开关(localStorage)。决定是否渲染 Canvas。
- `useImmersion()` — 沉浸模式 + `prefers-reduced-motion`。驱动 `animate` 进而决定 `frameloop`。

新增 3D 行为时,优先复用这两个 hook 的输出,别各自重新检测设备/偏好。

## 声明式 vs 命令式

- **静态结构**(网格、灯光、相机)→ 声明式 JSX(`<mesh>` `<pointLight>`)。
- **逐帧/批量变换**(instancedMesh matrix、shader uniform、贴图重绘)→ 命令式,在
  `useFrame` / `useLayoutEffect` 里改 `ref.current` 并置 `needsUpdate`。
- CanvasTexture 写入(天空渐变等)用普通函数包裹,绕开 react-hooks 对组件内变异的检查。

## 常见坑

1. **忘了 clone** → 改一个 prop 全场景材质被污染。
2. **useFrame 里 setState** → 掉帧 + 竞态。只改 ref。
3. **Suspense 包太大** → 首屏白屏久。重模型各自小 Suspense,fallback={null}。
4. **照搬 r3f v8 教程** → v9 + React 19 类型/事件签名有别,以本仓为准。
5. **在 demand 模式下改了东西画面不动** → 改完调 `invalidate()` 触发单帧渲染。
