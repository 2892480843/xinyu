import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // three 全家桶(three + three-stdlib + @react-three/* + postprocessing)是 bundle 里
    // 体积最大的一块。拆成独立 chunk 的收益:
    //  1. 首页默认不开 3D 皮(CSS 场景)时根本不下载这份重 chunk;
    //  2. 上岛探索(ExploreMode)与首页 3D 皮(Island3D)共享同一份,避免各自重复打包;
    //  3. 业务代码迭代不会让这份长期缓存失效,回访零成本复用。
    rollupOptions: {
      // 多入口:桌面 index.html + 独立移动端 mobile.html。两者共享同一份 three-vendor 分包与
      // node_modules,移动端复用桌面的 3D/lib/设计系统,桌面产物(main entry)不受影响。
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        mobile: fileURLToPath(new URL('./mobile.html', import.meta.url)),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // react 全家先于 three 规则分出 → 否则 @react-three/fiber 的 react-reconciler 会把
            // react-dom/scheduler 连带卷进 three-vendor，迫使首页主入口 import 整份 1.2M three-vendor
            // 来拿 createRoot，彻底抵消「不开 3D 不下载 three」的设计。分出后首页只载这一小份 react-vendor，
            // three-vendor 回归纯懒加载(仅上岛/3D 皮时下载)。react-reconciler 不在此列 → 仍归 three-vendor(只 3D 用)。
            if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
              return 'react-vendor'
            }
            if (
              id.includes('three-stdlib') ||
              id.includes('@react-three') ||
              id.includes('postprocessing') ||
              /[\\/]three[\\/]/.test(id)
            ) {
              return 'three-vendor'
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 1600,
  },
})
