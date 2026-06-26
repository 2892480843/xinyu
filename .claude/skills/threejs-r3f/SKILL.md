---
name: threejs-r3f
description: >-
  心屿前端所有 3D 相关工作的工程手册:react-three-fiber (r3f) + three.js + drei +
  postprocessing。当任务涉及 3D 场景、Canvas、模型(glb/gltf)加载、instancedMesh/性能优化、
  着色器(shader/材质/Bloom/描边)、相机/光照、useFrame 动画、碰撞与点击交互、或要改动
  ExploreMode.tsx / Island3D.tsx / DriveScene.tsx / SkyFx.tsx 等任何渲染组件时,
  务必先用这个技能。即使用户只说"加个模型""场景卡""调一下光""做个特效"而没点名 three.js,
  只要改动会落到 frontend/src 下的 r3f/three 代码,也要用。它记录了本项目踩过的坑和必须遵守的约定,
  能避免重复犯错(材质污染、内存泄漏、首屏卡、useFrame setState 等)。
---

# 心屿 three.js / react-three-fiber 工程手册

这是**项目级**技能,沉淀了心屿前端 3D 这套栈的真实约定和踩过的坑。改任何 3D 代码前先读它,
能避免大量返工。

## 技术栈(已锁定版本)

| 库 | 版本 | 角色 |
|---|---|---|
| `three` | ^0.180.0 | Three.js 本体 |
| `@react-three/fiber` | ^9.6.1 | r3f(配 React 19) |
| `@react-three/drei` | ^10.7.7 | helper 组件(useGLTF / MeshReflectorMaterial / Outlines …) |
| `@react-three/postprocessing` | ^3.0.4 | 后期特效管理 |
| `postprocessing` | (间接) | 自定义 `Effect` 子类 |
| `vite` 8 / `react` 19 / `typescript` ~6 | | 构建与类型 |

⚠️ r3f 是 **v9**(配 React 19),不是 v8。API/类型与老教程可能不同;不确定时以本项目现有代码为准,
别照搬网上 v8 写法。

## 3D 代码地图(单一责任)

| 文件 | 职责 |
|---|---|
| `frontend/src/components/Island3D.tsx` | 首页固定视角 3D 旗舰皮(Canvas、后期、水面、植被、天体、情绪驱动) |
| `frontend/src/components/ExploreMode.tsx` | 上岛自由探索(可走动小人、汽车、碰撞、大地图、重模型管理) |
| `frontend/src/components/DriveScene.tsx` | 开车小游戏(路面物理、车辆、赛道采样) |
| `frontend/src/components/DriveWorld.tsx` | 开车地图背景(昼夜、极光、流星、鸟群) |
| `frontend/src/components/SkyFx.tsx` | 夜空氛围层(极光 GLSL、银河、流星) |
| `frontend/src/lib/perfTier.ts` | 性能分档 high/low |
| `frontend/src/lib/toonGeo.ts` | Toon 材质工具(共享渐变贴图) |
| `frontend/src/lib/islandTerrain.ts` | 确定性地形高度场 |
| `frontend/src/hooks/useSkin3d.ts` / `useImmersion.ts` | 3D 开关 / 沉浸&reduced-motion |
| `frontend/public/models/` | 所有 glb(命名 `xy_*.glb`) |

## 黄金法则(违反必出 bug)

1. **加载后的 glb 必须深 clone 再用** — `src.clone(true)`。`useGLTF` 返回的是共享缓存,
   直接改材质会污染所有引用同一模型的地方。
2. **每个 useMemo 的几何/材质/纹理都要配 dispose cleanup** —
   `useEffect(() => () => mat.dispose(), [mat])`。Canvas 卸载/HMR 不释放会泄漏 GPU 内存,越用越卡。
3. **useFrame 里只改 `ref.current`,绝不调 setState** — setState 会和 r3f 的 clock/delta 竞态、
   触发 React 重渲染掉帧。需要触发 React 更新用别的机制(事件、外部 store)。
4. **改 instanceMatrix / instanceColor / shader uniform / 贴图后,显式置 `needsUpdate = true`** —
   否则 GPU 看不到改动。
5. **颜色/时间/状态切换一律用 `lerp` 平滑过渡,不要硬切** — 这是心屿的视觉基调(治愈感),跳变很违和。
6. **静态/reduced-motion 时用 `frameloop="demand"` + `invalidate()`** — 不是一直 `always`,省电省发热。
7. **重模型(>1MB)走 HEAVY_DEFER 延迟加载** — 别在首屏 `preload`,会拖慢上岛(见 references/performance.md)。
8. **r3f/three 的 ref 变异是故意的,文件顶部已 `eslint-disable react-hooks/immutability,refs,set-state-in-effect`** —
   别去"修复"这些 disable;新建 3D 组件文件时照抄这行注释。

## 怎么用本技能

SKILL.md 是总览 + 红线。按任务类型读对应的 reference 文件(都在本目录 `references/` 下):

- **写 r3f 组件 / Canvas / 加载模型 / drei helper / hooks** → 读 [references/r3f-patterns.md](references/r3f-patterns.md)
- **场景卡 / 优化 drawcall / instancing / 内存 / 首屏 / 分包** → 读 [references/performance.md](references/performance.md)
- **原生 three.js 概念(场景/相机/光/几何/材质/动画循环)** → 读 [references/three-core.md](references/three-core.md)
- **glb 资产 / Toon 材质 / 自定义 shader / Bloom / 描边 / 后期** → 读 [references/assets-shaders.md](references/assets-shaders.md)

## 验证改动

3D 改动在浏览器里才看得出来。改完按 preview 流程验证(`preview_start` → reload → `preview_console_logs`
查 WebGL/three 报错 → `preview_screenshot` 给用户看)。
⚠️ headless preview 标签页的 `requestAnimationFrame` 可能被暂停、HMR 可能 stale、端口可能是 5174 ——
这些坑见用户记忆 `xinyu-preview-verification-quirks`。真·3D 截图需要 Playwright + SwiftShader(preview 工具无 WebGL)。
