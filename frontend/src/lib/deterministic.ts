// 确定性伪随机:供渲染阶段(useMemo/useRef 初始化)用的「稳定随机数」。
// React 规则要求渲染纯函数——直接 Math.random() 会让重复渲染(尤其 StrictMode)结果不一致,
// 被 eslint-plugin-react-hooks 的 react-hooks/purity 规则拦截。这里用 hash2 做种子,
// 同一 (seed, i) 永远产出同一序列,既满足纯函数,又保留视觉上的随机分布。
//
// 用法:const rnd = makeRng(123); rnd() // 第 1 个 [0,1);再调依次往后取(线性同余)。

/** 0..1 的确定性 hash(基于坐标,与 islandTerrain.hash2 同源)。 */
export function hash01(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 从一个种子造一个可重复调用的 [0,1) 伪随机发生器(线性同余,够散、够快)。 */
export function makeRng(seed: number): () => number {
  // 种子归一到非负整数;乘大质数避免相近种子撞序列
  let s = Math.floor(hash01(seed, 2.71828) * 0xffffff) | 0;
  if (s === 0) s = 0x1;
  return () => {
    // Numerical Recipes 的 LCG 常数
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return ((s >>> 0) % 0xffffff) / 0xffffff;
  };
}
