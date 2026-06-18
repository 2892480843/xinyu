# 心屿 Frontend

《心屿》前端使用 React、TypeScript、Vite、Tailwind CSS 和 Framer Motion，实现移动端优先的沉浸式岛屿体验。

## 运行

```bash
cd /Users/a111/chen/code/心屿/frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

默认请求后端：

```bash
http://127.0.0.1:8000
```

如需切换 API 地址：

```bash
cp .env.example .env
VITE_API_BASE=http://127.0.0.1:8000 npm run dev
```

生产环境将 `VITE_API_BASE` 设置为后端公网地址，并确保后端 `CORS_ORIGINS` 包含当前前端域名。

## 验证

```bash
npm run lint
npm run build
```

## 主要文件

- `src/pages/Home.tsx`：主体验页面。
- `src/components/MoodInput.tsx`：心情输入。
- `src/components/IslandScene.tsx`：岛屿背景与天气动画。
- `src/components/NarrativeCard.tsx`：叙事结果卡。
- `src/components/MemoryPanel.tsx`：记忆面板。
- `src/components/SafetyNotice.tsx`：高风险提示。
- `src/lib/api.ts`：后端 API 客户端。
- `src/lib/sceneMap.ts`：情绪场景视觉映射。

## 体验边界

前端所有文案都保持情感陪伴边界，不表达诊断、治疗或保证效果。
本地昵称和 `user_id` 只保存在浏览器 `localStorage`；清除本地身份不会自动删除后端 SQLite 记忆，如需删除请使用后端清理脚本。
