# 资产、材质与着色器

## 目录
- [glb/gltf 资产管线](#glbgltf-资产管线)
- [Toon 材质与共享渐变贴图](#toon-材质与共享渐变贴图)
- [CanvasTexture / DataTexture(CPU 生成贴图)](#canvastexture--datatextureCPU-生成贴图)
- [onBeforeCompile:微改内置 shader](#onbeforecompile微改内置-shader)
- [自定义 ShaderMaterial](#自定义-shadermaterial)
- [后期处理 EffectComposer](#后期处理-effectcomposer)
- [自定义 Effect 子类](#自定义-effect-子类)

## glb/gltf 资产管线

- 所有模型在 `frontend/public/models/`,命名 `xy_*.glb`,在 `MODELS` 对象集中登记。
- Blender 出模流程见用户记忆 `xinyu-blender-asset-pipeline`(脚本在 `blender/`)。
- 写实外部模型(车/植物等)用 `GltfProp` 的 `raw` 模式(不做 toon 转换);地面偏移/树清空/footprint 碰撞体配方见
  用户记忆 `xinyu-realistic-imports`。
- 加载用 `useGLTF`,**用前深 clone**(见 r3f-patterns.md)。
- ⚠️ 写实贴图模型别用 gltf-transform 压缩(会变白模),见 performance.md。

## Toon 材质与共享渐变贴图

卡通风的核心是 `MeshToonMaterial` + 一张极小的渐变贴图(全场景共用,常驻不 dispose):

```ts
// lib/toonGeo.ts
export function makeToonGrad(): THREE.DataTexture {
  const d = new Uint8Array([96,96,96,255, 178,178,178,255, 255,255,255,255]); // 3 级灰阶
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;  // 硬边界 = 卡通分层
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
```

用法:`new THREE.MeshToonMaterial({ color, gradientMap: grad })`。`NearestFilter` 是关键,
线性过滤会糊掉色阶分层。

## CanvasTexture / DataTexture(CPU 生成贴图)

本项目大量贴图在 CPU 端用 Canvas2D 画(天空渐变、涟漪、光环),避免额外贴图下载带宽:

```ts
const sky = useMemo(() => {
  const cv = document.createElement("canvas"); cv.width = 16; cv.height = 256;
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}, []);
useEffect(() => () => sky.dispose(), [sky]); // 记得释放

// 重绘后必须:
function draw(top, mid, bottom) {
  const ctx = sky.image.getContext("2d")!;
  /* fillRect 渐变 … */
  sky.needsUpdate = true; // ← 否则 GPU 看不到
}
```

CanvasTexture 写入用普通函数包裹,绕开 react-hooks 对组件内变异的规则检查。

## onBeforeCompile:微改内置 shader

想给内置材质加一点效果(菲涅尔边缘高光等)而不重写整个 shader,用 `onBeforeCompile` 做字符串注入:

```ts
const island = new THREE.MeshStandardMaterial({ /* … */ });
island.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <emissivemap_fragment>",
    `#include <emissivemap_fragment>
     float fresEdge = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6);
     totalEmissiveRadiance *= (0.06 + 0.92 * fresEdge);`
  );
};
```

注意:
- 替换的锚点字符串(如 `#include <emissivemap_fragment>`)依赖 three 版本的 shader chunk 名,
  升级 three 时要复核。
- 要逐帧传值就在 shader 里加 uniform,并在 `useFrame` 更新 + 自己持有引用。

## 自定义 ShaderMaterial

完全自绘(极光、银河等)用 `ShaderMaterial`:

```ts
const AURORA_VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const AURORA_FRAG = `precision mediump float; uniform float uTime; varying vec2 vUv; void main(){ /* … */ }`;

const mat = useMemo(() => new THREE.ShaderMaterial({
  vertexShader: AURORA_VERT, fragmentShader: AURORA_FRAG,
  uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false,
}), []);
useEffect(() => () => mat.dispose(), [mat]);
useFrame((s) => { if (animate) mat.uniforms.uTime.value = s.clock.elapsedTime; });
```

- 移动端用 `precision mediump float` 更稳。
- 透明氛围层常配 `transparent: true` + `depthWrite: false`,避免遮挡排序问题。

## 后期处理 EffectComposer

用 `@react-three/postprocessing`,只在高性能档开(perfTier),顺序很重要:

```tsx
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
```

- 顺序:GodRays → Bloom → 描边 → Vignette。
- `Bloom` 用 `mipmapBlur` + 较高 `luminanceThreshold`,只让真正亮的部分发光(天体、辉光),别整屏泛白。
- 条件项用 `.filter(Boolean)`,EffectComposer 的 children 不能有 `null` 直接混入(类型上要断言)。

## 自定义 Effect 子类

需要全屏后期但 postprocessing 没现成的(卡通深度描边),继承 `Effect`:

```tsx
import { Effect, EffectAttribute } from "postprocessing";

class ToonOutlineEffect extends Effect {
  constructor() {
    super("ToonOutlineEffect", OUTLINE_FRAG, {
      attributes: EffectAttribute.DEPTH, // 声明要读深度缓冲
      uniforms: new Map([
        ["uColor", new THREE.Uniform(new THREE.Color("#1c333c"))],
        ["uThickness", new THREE.Uniform(2.0)],
        ["uThreshold", new THREE.Uniform(0.32)],
      ]),
    });
  }
}

const ToonOutline = forwardRef<ToonOutlineEffect>((_p, ref) => {
  const effect = useMemo(() => new ToonOutlineEffect(), []);
  return <primitive ref={ref} object={effect} dispose={null} />;
});
```

从深度缓冲检物体边界画描边,不受单一大网格限制(整场景统一描边)。
fragment shader 签名要符合 postprocessing 的约定(`mainImage` / `mainUv`),参考库文档与本仓现有 `OUTLINE_FRAG`。
