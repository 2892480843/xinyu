# 原生 three.js 基础(在 r3f 里怎么落)

r3f 把 three.js 的命令式 API 映射成声明式 JSX:`new THREE.Mesh(geo, mat)` ≈ `<mesh geometry geometry material />`,
`scene.add(x)` ≈ 把组件写进 JSX 树。理解底层 three 概念才能在需要时正确地"下沉"到命令式。

## 目录
- [核心对象](#核心对象)
- [坐标系与变换](#坐标系与变换)
- [相机](#相机)
- [光照](#光照)
- [几何与材质](#几何与材质)
- [动画循环 useFrame](#动画循环-useframe)
- [颜色与 lerp](#颜色与-lerp)

## 核心对象

| three 概念 | r3f 写法 | 说明 |
|---|---|---|
| `Scene` | `<Canvas>` 内部自动建 | 根容器 |
| `WebGLRenderer` | `<Canvas gl={...}>` | 渲染器,gl 传配置 |
| `PerspectiveCamera` | `<Canvas camera={...}>` 或 `<perspectiveCamera>` | 透视相机 |
| `Mesh` | `<mesh>` | 几何 + 材质 |
| `Group` / `Object3D` | `<group>` | 变换容器 |
| `Light` | `<ambientLight>` 等 | 光源 |
| 外部模型 | `<primitive object={clonedScene} />` | 挂已构造的 Object3D |

JSX 里小写 = three 原生类(r3f 自动注册);大写 = drei/自定义 React 组件。
`<mesh-rotation-x>` 这种连字符 = 设嵌套属性(等价 `mesh.rotation.x`)。

## 坐标系与变换

three 默认 **Y 轴向上,右手系**,相机默认看向 -Z。

⚠️ **本项目地形约定**:terrain mesh 经 `rotateX(-90°)`,平面 `(px, py)` → 世界 `(px, h, -py)`。
这套映射在 `buildExploreTerrain` / 车辆 / 路面贴图三处必须保持一致(`ExploreMode.tsx` 有注释)。
做任何"平面坐标 ↔ 世界坐标"换算时按这个来,别自己另立一套。

设置变换:
```tsx
<mesh position={[x, y, z]} rotation={[rx, ry, rz]} scale={[sx, sy, sz]}>
// 命令式:
obj.position.set(x, y, z); obj.rotation.y = a; obj.scale.setScalar(s);
obj.updateMatrix(); // instancedMesh.setMatrixAt 前需要
```

## 相机

```tsx
<Canvas camera={{ position: [0, 2.1, 7], fov: 46, near: 0.1, far: 100 }} />
```
- `near/far` 别拉太大(z-fighting、精度损失)。本项目 far=100 够用。
- 第一人称/跟随相机在 `useFrame` 里 lerp `camera.position` 和 `lookAt`,别瞬移(平滑是基调)。
- 调试鸟瞰可用 `window.__XYCAM`(见用户记忆 preview-quirks)。

## 光照

本项目典型光照配置(够用且省):
- 1× `<ambientLight>` 环境补光。
- 1× `<hemisphereLight>` 天/地双色环境(卡通通透感)。
- 1× `<directionalLight>` 主光(太阳)。
- 若干 `<pointLight>` 用于岛核心、天体、篝火等局部辉光。

阴影很贵:实时阴影(`castShadow`/`receiveShadow` + shadow map)按需开,低端档可关。多动态阴影源会显著掉帧。

## 几何与材质

- 几何复用:同形状共享一个 `geometry`(useMemo 一次),别每个实例 new。
- 材质复用:同外观共享一个 material,用 Map 缓存去重(见 r3f-patterns 的材质转换)。
- 本项目卡通风主用 `MeshToonMaterial` + 共享渐变贴图(见 assets-shaders.md);自发光物体保留 `MeshStandardMaterial`。
- 几何/材质都要 dispose(见 performance.md)。

## 动画循环 useFrame

r3f 用 `useFrame` 取代手写 `requestAnimationFrame` 循环:

```tsx
useFrame((state, delta) => {
  if (!animate) return;                 // demand 模式/静海态早退
  ref.current.rotation.y += delta * 0.5; // 用 delta,帧率无关
  matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
});
```

- **用 `delta` 而非固定步长**,不同帧率表现一致。
- 缓动用帧率无关公式:`x = lerp(x, target, 1 - Math.pow(k, delta))`(k 越小收敛越快)。
- 回调里**只改 ref,不 setState**(红线)。
- demand 模式下 useFrame 只在有渲染请求时跑。

## 颜色与 lerp

心屿所有颜色过渡都是平滑 lerp,绝无硬切:

```tsx
// 沉浸态逐帧收敛(约 1.5s):
useFrame((_, delta) => { if (animate) mat.color.lerp(target, 1 - Math.pow(0.05, delta)); });

// 静海态直接吸附 + 触发单帧:
useLayoutEffect(() => { if (!animate) { mat.color.copy(target); invalidate(); } }, [target]);
```

`THREE.Color.lerp` / `Vector3.lerp` 是就地修改。情绪色板(sea/island/accent/sky*)由统一的 `apply(t)` 入口驱动,
新增受情绪影响的颜色时挂进这个入口,别散落各处。
