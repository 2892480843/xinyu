# 性能优化(心屿实战)

3D 卡顿 99% 来自:draw call 太多、首屏一次性加载太重、内存泄漏、高分屏过采样、frameloop 空转。
按这几条逐个排查。

## 目录
- [InstancedMesh:降 draw call](#instancedmesh降-draw-call)
- [首屏加载:HEAVY_DEFER 延迟](#首屏加载heavy_defer-延迟)
- [frameloop:按需渲染](#frameloop按需渲染)
- [内存释放:dispose](#内存释放dispose)
- [性能分档:perfTier](#性能分档perftier)
- [打包:three-vendor 分块](#打包three-vendor-分块)
- [模型压缩(重要教训)](#模型压缩重要教训)
- [排查清单](#排查清单)

## InstancedMesh:降 draw call

大量同质对象(草、花、石头、树)用 `instancedMesh`,N 个实例 = 1 个 draw call。模板(参考 `Island3D.tsx` Grass):

```tsx
const meshRef = useRef<THREE.InstancedMesh>(null);
const items = useMemo(() => scatter(count), [count]);

useLayoutEffect(() => {
  const mesh = meshRef.current!;
  const dummy = new THREE.Object3D();
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.set(0, it.rot, 0);
    dummy.scale.setScalar(it.s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color);
  });
  mesh.instanceMatrix.needsUpdate = true;       // ← 必须
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; // ← 必须
}, [items]);

return <instancedMesh ref={meshRef} args={[geo, material, items.length]} frustumCulled={false} />;
```

- `frustumCulled={false}`:布点范围已知且不大时,关掉视锥裁剪省每帧 cull 开销;但大范围分布时保留剔除更划算,按场景判断。
- 散点用**确定性**算法(noise/spacer),别 `Math.random()` —— 保证每次布局一致、可复现(见空间网格去重)。

## 首屏加载:HEAVY_DEFER 延迟

上岛慢的根因是首屏一次性拉所有 glb。策略:

```tsx
// 小模型(几十 KB,近百个)首屏 preload;重模型(>1MB)不 preload
const HEAVY_DEFER = new Set([
  MODELS.bathhouse, MODELS.rhododendron, MODELS.townblock, MODELS.qiche, MODELS.skyLantern,
]);
Object.values(MODELS).forEach((u) => { if (!HEAVY_DEFER.has(u)) useGLTF.preload(u); });
```

重模型各自独立 `<Suspense fallback={null}>`,首屏先把地形+小物件渲出来(可见可走),重模型后台逐个到位。
实测首屏从 52M 量级降到 ~7M。**新增重模型时记得加进 HEAVY_DEFER。**

## frameloop:按需渲染

```tsx
<Canvas frameloop={animate ? "always" : "demand"}>
```

- `always`:每帧渲染(有连续动画:水波、天体、情绪 lerp 中)。
- `demand`:只在 `invalidate()` 被调用时渲染单帧。静海态 / `prefers-reduced-motion` 用这个,省电省发热。
- demand 下任何会改变画面的操作后都要 `invalidate()`,否则画面不更新。
- `useFrame` 的回调在 demand 模式下也只在有渲染请求时跑——别依赖它做计时器。

## 内存释放:dispose

每个手动创建的 GPU 资源(几何/材质/纹理/RenderTarget)都要在卸载时 dispose,否则 HMR/路由切换泄漏:

```tsx
const mats = useMemo(() => makeMaterials(), []);
useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

const tex = useMemo(() => createSkyGradient(), []);
useEffect(() => () => tex.dispose(), [tex]);
```

- `useGLTF` 加载的原始资源由 drei 缓存管理,**不要**手动 dispose 原件;dispose 的是你 clone/new 出来的。
- 自定义 `Effect` / ShaderMaterial 同理要清理。

## 性能分档:perfTier

`lib/perfTier.ts` 返回 `"high" | "low"`,据此调:

| 维度 | high | low |
|---|---|---|
| Bloom / GodRays 后期 | 开 | 关 |
| 反射分辨率 | 384 | 160 |
| dpr | [1, 1.75] | [1, 1] |
| antialias | 开 | 关 |

检测逻辑:软件渲染器(SwiftShader)硬降级;移动端保守降级;强 GPU 或 8+ 核 / 8GB+ 内存升级。
新增昂贵特效时挂在 `tier === "high"` 分支后面,别让低端机也跑。

## 打包:three-vendor 分块

`vite.config.ts` 把 three 全家桶单独打一个 chunk:

```ts
manualChunks(id) {
  if (id.includes("node_modules")) {
    if (id.includes("three-stdlib") || id.includes("@react-three") ||
        id.includes("postprocessing") || /[\\/]three[\\/]/.test(id)) {
      return "three-vendor";
    }
  }
}
```

收益:首页不开 3D 时压根不下载 three-vendor(~400KB);上岛和首页 3D 共享一份;业务代码迭代不让这块长缓存失效。
**别动这个分块规则**,除非你清楚在做什么。

## 模型压缩(重要教训)

⚠️ **写实大模型用 gltf-transform 压缩会毁外观**(车被压成白模),已回滚,别再压。
首屏慢用 HEAVY_DEFER + 分包解决,不靠压模型。原始模型在 git HEAD / `_model_originals/`。
卡通低模可以适度压,但写实贴图模型谨慎。

## 排查清单

场景卡时按序查:
1. draw call 数(同质对象有没有用 instancing)。
2. 首屏是不是把重模型也 preload 了(查 HEAVY_DEFER)。
3. dpr 是不是没设上限(高分屏过采样)。
4. frameloop 该 demand 的地方是不是写成 always 空转。
5. 有没有泄漏(HMR 几次后变卡 = 漏 dispose)。
6. 后期特效是不是没挂 perfTier 分支,低端机也在跑 Bloom。
7. 灯光数量(实时阴影/多 PointLight 很贵)。
