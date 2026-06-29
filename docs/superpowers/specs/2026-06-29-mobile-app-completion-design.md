# 移动端 App 化补完设计

## 背景

当前前端是 Vite + React + Tailwind CSS。桌面端入口为 `frontend/index.html` + `frontend/src/main.tsx`，移动端已存在独立入口 `frontend/mobile.html` + `frontend/src/mobile/main.tsx`，并通过 `frontend/vite.config.ts` 的多入口构建输出。

现有移动端已经复用桌面端的岛屿场景、叙事、呼吸、安全提示、心象地图、时光机、登高望岛、音乐和身份组件。此次目标不是从零重写，也不是把桌面 `Home.tsx` 改成统一响应式，而是在现有 `src/mobile` 基础上把移动端做成完整、可安装、可触摸操作的 App 化体验，并保持 Web 端一致的视觉语言。

## 目标

- 保留独立移动端入口 `frontend/mobile.html` 和 `frontend/src/mobile`。
- 移动端首屏、底部导航、倾诉入口、足迹入口和「我」入口形成完整闭环。
- 视觉风格与 Web 一致：深海背景、岛屿场景、玻璃面板、月亮品牌、情绪主题色、柔和光晕、衬线标题。
- 覆盖核心用户路径：创建身份、倾诉、加载、呼吸、安全提示、叙事、上岛探索、查看足迹、管理身份和数据。
- 通过构建和移动 viewport 手测验证，不引入桌面端回归。

## 非目标

- 不重构桌面 `frontend/src/pages/Home.tsx`。
- 不合并桌面端和移动端为同一个响应式页面。
- 不新增后端 API。
- 不新增设计系统依赖或图标库。
- 不改变已有情绪分析、记忆、叙事、TTS、音乐和 3D 探索的业务语义。

## 用户体验设计

### 信息架构

移动端采用三 Tab + 中央行动按钮：

| 区域 | 作用 |
|---|---|
| 岛屿 | 主首屏，展示品牌、岛屿状态、回访留言、错误反馈、倾诉和上岛探索入口 |
| 足迹 | 聚合历史能力：心象地图、时光机、登高望岛、私房安慰话、岛屿年报、问问岛屿 |
| 我 | 展示匿名身份、数据清除/删除、真 3D 背景开关、危机声明 |
| 中央倾诉 FAB | 全局主行动入口，打开底部 Sheet 进行输入 |

### 首屏状态

移动端首页分为空态和内容态：

- 空态：品牌和倾诉引导居中，避免中段空洞；主要动作是「说给岛屿」，次要动作是「上岛走走」。
- 内容态：顶部显示品牌、错误反馈、岛屿留言、岛屿成长摘要；主 CTA 下沉到拇指可达区域。

### 交互方式

- 倾诉输入使用底部 Sheet，保留键盘安全区适配。
- 加载、呼吸、安全提示、叙事使用全屏沉浸态。
- 足迹中的重型功能使用全屏覆盖层或底部 Sheet，避免在窄屏里嵌套过深。
- 背景音乐在移动端右上角以可收起控件展示，避开底部导航。
- 上岛探索保持懒加载和空闲预取，弱网/省流量模式下不主动预取。

## 架构设计

### 文件边界

| 文件 | 职责 |
|---|---|
| `frontend/src/mobile/pages/HomeMobile.tsx` | 移动端页面编排、Tab 状态、覆盖层状态、桌面组件复用 |
| `frontend/src/mobile/hooks/useReflectFlow.ts` | 移动端倾诉状态机：输入、加载、呼吸、叙事、安全、错误和取消 |
| `frontend/src/mobile/components/MobileTabBar.tsx` | 底部导航和中央倾诉 FAB |
| `frontend/src/mobile/components/BottomSheet.tsx` | 通用底部 Sheet、拖拽关闭、Esc 关闭、键盘避让 |
| `frontend/src/mobile/components/MobileInbox.tsx` | 回访信、低语、修正信的移动端轻卡片 |
| `frontend/src/mobile/components/MemoryTab.tsx` | 足迹入口列表 |
| `frontend/src/mobile/components/SelfTab.tsx` | 身份、隐私和声明 |
| `frontend/src/mobile/components/MobileBrand.tsx` | 与桌面同源的月亮品牌 |
| `frontend/src/index.css` | 共享视觉系统和移动端专属 CTA 样式 |
| `frontend/mobile.html` | 移动端 HTML/PWA 元信息 |
| `frontend/public/sw.js` | PWA 离线 shell 对移动入口的回退 |

### 数据与状态流

1. `HomeMobile` 从 `loadIdentity()` 读取本地匿名身份。
2. 身份就绪后拉取 `fetchMemories`、`fetchIslandState`、`fetchArtifacts`、`fetchWelcomeBack`、`fetchIslandWhisper`、`fetchIslandRevision`。
3. 倾诉提交进入 `useReflectFlow.submit()`。
4. 优先走 `reflectStream()`，失败回退到 `reflect()`。
5. 流式事件更新 `liveAgents`、`liveScene`、`liveIsland` 和加载文案。
6. 最终结果按安全和情绪强度进入 `safety`、`breathing` 或 `narrative`。
7. 叙事或非语言仪式完成后刷新记忆、物件和岛屿状态。

### 风格一致性规则

- 继续使用已有 `panel-glass-*`、`island-cta`、`mobile-cta-ghost`、`font-display`、`font-serif`。
- 移动端按钮触摸目标不小于 44px。
- 所有底部固定元素必须考虑 `env(safe-area-inset-bottom)`。
- 可滚动全屏态使用 `100dvh`，避免移动浏览器地址栏导致布局跳动。
- 文案密度低于桌面端，长功能说明收敛为一行标题 + 一行短描述。
- 不使用占位图、外链图片或新视觉资产。

## 验收标准

| 验收项 | 标准 |
|---|---|
| 构建 | 在 `frontend` 下执行 `npm run build` 通过 |
| 移动入口 | `mobile.html` 可独立打开，加载 `src/mobile/main.tsx` |
| 首屏 | 空态和内容态不出现明显垂直真空、文本重叠或底部导航遮挡 |
| 倾诉 | 中央 FAB 和首屏 CTA 都能打开输入 Sheet；键盘弹起时输入区不被遮挡 |
| 状态流 | 加载可取消；安全提示、呼吸和叙事都能回到输入态 |
| 足迹 | 心象地图、时光机、登高望岛、私房话、年报入口在移动端可触发 |
| 我 | 身份展示、清本地身份、删除后端数据和 3D 开关可用 |
| PWA | `manifest.mobile.webmanifest` 指向 `/mobile.html`，Service Worker 离线导航优先回退移动 shell |
| 回归 | 桌面入口 `index.html` 不因移动端补完发生功能性改变 |

## 风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| 移动端与桌面端反思流程复制 | 桌面流程未来变化时可能不同步 | 本次不重构；在计划中检查差异，必要时抽出共享 hook 但不扩大范围 |
| 复用桌面组件在窄屏溢出 | Sheet 或全屏覆盖层可能横向撑开 | 用移动 viewport 手测并补局部容器约束 |
| 3D 探索移动端性能压力 | 弱设备可能掉帧 | 保持懒加载、省流量不预取、已有性能分档 |
| PWA 离线缓存旧资源 | 移动端 shell 可能拿到旧缓存 | 不改资源版本策略；只验证当前 `sw.js` 已包含移动入口回退 |

## 术语说明

| 术语 | 说明 |
|---|---|
| App 化 | 让网页在移动端像 App 一样使用，包括底部导航、拇指可达操作、全屏沉浸态和 PWA 安装体验 |
| PWA | Progressive Web App，渐进式 Web 应用；网页可安装到手机桌面，并具备一定离线能力 |
| FAB | Floating Action Button，悬浮行动按钮；这里指底部中央的「倾诉」主按钮 |
| Sheet | 从屏幕底部弹出的面板，常用于移动端输入或设置 |
| Safe Area | 手机刘海屏、底部手势条等不可遮挡区域；通过 CSS 的 `env(safe-area-inset-*)` 适配 |
