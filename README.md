# 心屿 Xinyu

《心屿》是一座会回应你的「心象岛屿」——一款以情绪为核心机制的 AI 情感陪伴叙事游戏。你把当下的心情留给它（也可以只是写一个字、或什么都不说坐一会儿），系统会识别情绪、生成温柔克制的中文叙事、随情绪切换岛屿场景与背景音乐，并把这一刻沉淀成可被记得、可被回望、也可被删除的情绪记忆。每一次倾诉都会改变岛屿，岛屿会随你的记忆从 1 级慢慢长到 5 级、长出灯塔与花、留下你亲手放下的物件。

> 本项目提供情感陪伴体验，**不是心理咨询或医疗服务，不做诊断，也不承诺疗效**。检测到高风险表达时，会暂停普通叙事并引导寻求专业帮助与可信任的人。

> 一句话定位：**心屿不教你变得更好，它只是记得你来过、陪你长出形状。**

完整需求与设计见 [`心屿-需求文档.md`](心屿-需求文档.md)（v4.0，代码对齐版）；答辩话术与路演脚本见 [`心屿-路演物料.md`](心屿-路演物料.md)。

## 界面预览

<p align="center">
  <img src="docs/screenshots/05-explore-3d.png" alt="自由探索 · 真 3D 心象岛屿" width="820"><br>
  <sub><b>自由探索模式</b>：可漫游的真 3D 心象岛屿（react-three-fiber），收集心愿、拾取心灵印记、与岛上的人互赠</sub>
</p>

<p align="center">
  <img src="docs/screenshots/01-home-desktop.png" alt="桌面端首页" width="820"><br>
  <sub>桌面端首页：一座会随你心情切换场景与背景音乐的岛屿</sub>
</p>

<table>
  <tr>
    <td align="center" width="33%"><img src="docs/screenshots/02-input-mobile.png" alt="倾诉入口" width="230"></td>
    <td align="center" width="33%"><img src="docs/screenshots/03-narrative-tired.png" alt="AI 治愈叙事" width="230"></td>
    <td align="center" width="33%"><img src="docs/screenshots/04-safety-net.png" alt="安全网" width="230"></td>
  </tr>
  <tr>
    <td align="center"><sub>把心情说给岛屿 · 快捷短句与回访问候</sub></td>
    <td align="center"><sub>AI 治愈叙事 + 心灵印记（tired·夜）</sub></td>
    <td align="center"><sub>高风险暂停叙事、引导求助与热线</sub></td>
  </tr>
</table>

## 当前范围

AI 默认使用 **Mock 模式**，无需 API Key 即可完整跑通（情绪、叙事、印记、岛屿、安全均有降级兜底）。支持情绪：`sad`、`anxious`、`tired`、`lonely`、`calm`、`happy`、`angry`、`helpless`。

**核心闭环**

- 本地昵称身份（无账号/密码/JWT/OAuth），文字 / 语音 / 快捷短句输入，可选**无痕模式**（陪你但不留痕）。
- 「五感信使」可解释编排：情绪 → 安全 → 记忆 → 环境 → 叙事五张卡片逐个抵达；整条管道只有「情绪分析」「叙事表达」两步真正调用 LLM，其余皆为确定性代码。
- 可选工具型 Agent 反思管线：配置 OpenAI 兼容模型后，Agent 可自主调用「记忆检索 / 读岛屿状态」工具，再组合情绪、环境与叙事；不可用或高风险时自动回退经典管线。
- 心象岛屿生长系统（纯 Python 状态机，断网可跑）：成长等级、趋势、岛屿元素、章节导语。
- AI 治愈叙事 + 20-60 字心灵印记；情绪记忆 PostgreSQL 持久化 + pgvector 语义检索（不可用自动回退「最近记忆」）。
- 双端安全网：输入端双触发（强度阈值 `≥0.85` **或** 中英双语关键词黑名单），输出端复检防复述；触发即暂停普通叙事、引导求助（含 12356 全国心理援助热线）。

**岛屿玩法**

- 岛屿回应选择卡 + 物件收藏（含趋势向好时的「破晓」限定稀缺卡），可给物件刻字、未来由岛屿还给你。
- 私房安慰话：把重要他人的安慰话教给岛屿，按情绪在叙事后被引用。
- 非语言入口：**静默坐岛**（不打字，留一枚静默贝壳）、**写一个字给岛屿**（描红心境字 + 书写动力学读心，留心境石）、**呼吸仪式**（高强度负面情绪先做 4-7-8 着陆）。
- 自由探索强化：可切换「记忆的守护者 / Pocoyo / 捏的人」三种主角；Pocoyo 已修正 FBX 轴向与缩放，避免横躺或巨型化。
- 岛上互动扩展：跳跃、招手、种花、放天灯、垂钓、风铃心曲、鲸落与漂流瓶彩蛋、车辆上岛与林间土路驾驶地图。
- **专属精灵「微光」**：会跟随玩家漂浮，支持点击/按钮唤出面板、投喂、摸摸、静坐、改名、长期亲密度、彩蛋解锁与 AI 对话；无 Key 时用本地温柔回复，配置模型后升级为专属大模型陪伴，并可用云端情感音色「开口说话」——说话时随实时音量轻轻起伏、灯塔光同步脉动。

**岛屿主动性 / 回访**

- 岛屿主动低语、离岛信件（久未回岛）、修正信（AI 自我纠偏）、岛屿年报（读全史）、时光机·一键回望、夜间守望（反沉迷主动劝睡）。

**表现层与无障碍**

- 视觉：24 张本地预设场景图（8 情绪 × 3 强度）作为 2D 底图 + CSS/SVG 沉浸式叠加与天气粒子；之上可叠加 **react-three-fiber 真 3D 岛屿皮肤与自由探索模式**，弱设备 / 无 WebGL 自动降级回 2D。
- 音频：三层声景——9 段情绪背景音乐（Kevin MacLeod，CC-BY 4.0）打底，叠加随情绪切换的**环境氛围底噪**（海浪 / 雨 / 夜虫 / 篝火 / 林风 / 溪流 / 晨鸟）与自由探索时随所在区域切换的**位置环境音**（洋 / 湾 / 溪 / 篝火 / 山 / 林 / 村）；交互音效**采样优先**（Wikimedia CC 素材），缺失或断网时回退 Web Audio 实时合成。「背景音乐」控件可一键静音覆盖全部声层。完整素材与署名见 `frontend/public/audio/CREDITS.md`。
- 朗读：云端情感语音合成 TTS（可选，支持**阿里云 CosyVoice** 与**腾讯云**双通道、可选音色），未配置或失败时降级浏览器原生 `speechSynthesis`；自由探索中的专属精灵也用同一套 TTS「发声」。
- 尊重 `prefers-reduced-motion`，提供静海模式；语音输入用浏览器 `SpeechRecognition`，不支持时降级为不可用。

**隐私与韧性**

- 应用内一键删除身份在后端的全部痕迹（记忆 / 物件 / 私房话 / 向量），另有命令行脚本做 dry-run 批量清理。
- 前端默认走 `/ws/reflect`，流式失败时回退 `POST /api/reflect`，并用 `request_id` 幂等去重，避免重复落库。
- 数据保存在 PostgreSQL（`memories` / `artifacts` / `phrases` 关系表 + pgvector 的 `memory_vectors` 语义索引）。

## 启动方式

前置：PostgreSQL（含 pgvector 扩展）。本地 Homebrew 示例——

```bash
# 安装并启动 Postgres（已装可跳过）
brew install postgresql@18 && brew services start postgresql@18
# 安装 pgvector 扩展（按本机 pg_config 编译；或 brew install pgvector）
# 见 https://github.com/pgvector/pgvector#installation
# 建库（扩展由后端启动时自动 CREATE EXTENSION）
createdb xinyu
```

> `DATABASE_URL` 默认 `postgresql://localhost:5432/xinyu`，本地 Homebrew Postgres 默认 trust 鉴权、用 OS 用户名登录，无需密码。需要账号密码时改成 `postgresql://user:pass@host:5432/xinyu`。

后端：

```bash
cd /Users/a111/chen/code/心屿/backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

> 首次启用语义检索时，fastembed 会自动下载本地 embedding 模型（约 90MB，之后缓存复用、可离线）。不需要时设 `VECTOR_ENABLED=0` 即可跳过。

也可以使用启动脚本：

```bash
cd /Users/a111/chen/code/心屿
./scripts/dev-backend.sh
```

前端：

```bash
cd /Users/a111/chen/code/心屿/frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

也可以使用启动脚本：

```bash
cd /Users/a111/chen/code/心屿
./scripts/dev-frontend.sh
```

访问地址：

- 前端：`http://127.0.0.1:5173/`
- 后端健康检查：`http://127.0.0.1:8000/api/health`

## 环境变量

后端：

```bash
cd /Users/a111/chen/code/心屿/backend
cp .env.example .env
```

| 变量 | 说明 |
|---|---|
| `LLM_PROVIDER` | `mock` 或 `openai`；默认 `mock`。 |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | 仅 `LLM_PROVIDER=openai` 时使用；可指向腾讯混元（见「可选真实模型」）。 |
| `LLM_TIMEOUT` / `LLM_FAST_TIMEOUT` | 核心调用超时（默认 30s）与锦上添花调用（低语 / 读字 / 修正信，默认 8s）超时，单位秒。 |
| `AGENT_MAX_STEPS` | 工具型 Agent 单次反思的最大工具循环步数，默认 `6`，用于防止无限调用工具。 |
| `CORS_ORIGINS` | 允许访问后端的前端来源，多个用英文逗号分隔；生产环境必须配真实域名，不要使用 `*`。 |
| `DATABASE_URL` | PostgreSQL 连接串（libpq 格式）；默认 `postgresql://localhost:5432/xinyu`。 |
| `PG_POOL_MIN` / `PG_POOL_MAX` | 连接池大小（默认 1 / 10）。 |
| `VECTOR_ENABLED` | 是否启用 pgvector 语义检索（默认 `1`）；置 `0` 仅用关系表「最近记忆」。 |
| `EMBEDDING_MODEL` / `EMBEDDING_DIM` | 本地 fastembed embedding 模型与维度（默认 `BAAI/bge-small-zh-v1.5` / `512`，两者须匹配）。 |
| `VECTOR_MEMORY_RESULTS` | 叙事生成前检索的相似记忆数量。 |
| `TTS_PROVIDER` | 可选：显式指定云端 TTS 通道，`aliyun` / `tencent` / 留空；留空时自动选择已配置密钥的一方（两者都配优先 `aliyun`）。 |
| `DASHSCOPE_API_KEY` | 可选：阿里云 DashScope（CosyVoice 语音合成）API Key；与腾讯云并存，由 `TTS_PROVIDER` 决定生效通道。 |
| `TENCENT_TTS_SECRET_ID` / `TENCENT_TTS_SECRET_KEY` | 可选：腾讯云情感语音合成密钥；未配置时 `/api/tts` 返回不可用，前端自动降级浏览器朗读。 |
| `TENCENT_TTS_REGION` / `TENCENT_TTS_VOICE_TYPE` / `TENCENT_TTS_TIMEOUT` | 可选：腾讯云 TTS 区域、音色与超时（默认 `ap-guangzhou` / `101016` 温柔女声 / 8s）。 |

前端：

```bash
cd /Users/a111/chen/code/心屿/frontend
cp .env.example .env
```

| 变量 | 说明 |
|---|---|
| `VITE_API_BASE` | 后端 API 地址，默认开发值为 `http://127.0.0.1:8000`。 |

## 演示脚本

1. 打开前端首页，输入一个本地昵称进入岛屿。
2. **先演沉默**：不打任何字，点「静默坐岛」，岛屿陪坐一小段时间，留下一枚静默贝壳（承认「说不出也算说话」）。
3. 输入或语音说出：`我今天真的很累，加班到很晚，感觉什么都做不好，好疲惫`
4. 展示五感信使逐个抵达、疲惫情绪、夜晚星空场景、叙事卡片与心灵印记，以及岛屿成长状态与章节导语。
5. 在叙事后选择一张岛屿回应卡，留下一枚物件，可给它刻一句给未来自己的话。
6. 打开左下角背景音乐，确认按情绪切换曲目并可调节音量；点击「朗读叙事」确认语音可用（不支持的浏览器会降级）。
7. 点击「再说一次」，输入：`其实今天挺开心的，想回来看看岛屿记不记得我`，展示「岛屿记得你」的连续陪伴感。
8. 点击「上岛走走」，展示自由探索：切换主角、Pocoyo 正常站立、专属精灵跟随；打开「精灵」面板，投喂 / 对话 / 解锁彩蛋。
9. （可选）放天灯、种花、垂钓，或上车进入林间土路驾驶地图；再打开记忆地图 / 时光机回望，展示岛屿生长轨迹。
10. 输入高风险文本：`我真的彻底绝望崩溃了，完全撑不下去了，一点希望都没有，太无助了`，展示安全提示：暂停普通叙事，引导联系可信任的人或专业热线。
11. 展示隐私可控：在身份入口一键删除该身份的后端记忆，岛屿清空。

> 答辩用的 5 分钟逐 beat 脚本、诚实化话术与 Q&A，见 [`心屿-路演物料.md`](心屿-路演物料.md)。

## API

### 接口一览

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/reflect` | 核心反思接口，返回情绪 / 场景 / 岛屿状态 / 叙事 / 印记 / 选择卡 / 安全 |
| `WS` | `/ws/reflect` | 流式逐阶段推送（见下） |
| `GET` | `/api/health` | 服务状态、Provider、模型名、支持情绪列表 |
| `GET` | `/api/memories?user_id=&limit=` | 最近记忆列表 |
| `GET` | `/api/island-state?user_id=` | 首次进入即可看到的岛屿状态 |
| `GET` | `/api/island/timeline?user_id=` | 时光机逐步快照 |
| `GET` | `/api/artifacts?user_id=` | 物件收藏列表 |
| `POST` | `/api/island/act` | 选择回应卡，留下物件 |
| `POST` | `/api/artifacts/{id}/inscribe` | 给物件刻字（≤80 字） |
| `POST` | `/api/silent/companion` | 静默坐岛，留静默贝壳 |
| `POST` | `/api/glyph` | 手写一字读心，留心境石 |
| `POST` | `/api/companion/chat` | 专属精灵 AI 对话，返回入戏回复、情绪、安全状态与建议动画 |
| `POST` | `/api/chat` | 主页多轮对话伙伴，基于历史消息与记忆工具回应 |
| `POST` | `/api/agent/ask` | 常驻 AI 助手，按用户问题调用记忆/统计工具后据实回答 |
| `GET` | `/api/island/whisper?user_id=` | 岛屿主动低语 |
| `GET` | `/api/island/welcome-back?user_id=&force=` | 离岛信件 |
| `GET` | `/api/island/revision?user_id=&force=` | 岛屿修正信 |
| `POST` | `/api/island/letter` | 岛屿年报 |
| `GET` `POST` | `/api/phrases` · `DELETE /api/phrases/{id}` | 私房安慰话增删查 |
| `POST` | `/api/tts` | 情感语音合成（阿里云 / 腾讯云，失败降级浏览器） |
| `GET` | `/api/tts/voices` | 当前 TTS 通道、是否已配置与可选音色清单 |
| `POST` | `/api/identity/seed` | 为新身份注入种子记忆（幂等） |
| `POST` | `/api/demo/timeline-seed` | 注入路演演示轨迹（`demo-timeline`，不影响真实用户） |
| `DELETE` | `/api/identity/{user_id}` | 删除身份全部后端痕迹 |

### HTTP 反思接口

```http
POST /api/reflect
Content-Type: application/json
```

请求（`ephemeral` 与 `request_id` 可选）：

```json
{
  "user_id": "demo-user",
  "text": "我今天很累，感觉什么都做不好",
  "ephemeral": false,
  "request_id": "client-uuid"
}
```

响应包含：`emotion`、`intensity`、`summary`、`scene`、`island_state`（含 `chapter`）、`agent_trace`、`choices`、`narrative`（高风险时为空）、`imprint`（高风险时为 `null`）、`memory_hint`、`safety`、`ephemeral`、`echo_phrase`。完整字段定义见 [`心屿-需求文档.md`](心屿-需求文档.md) §8。

响应示例（节选）：

```json
{
  "emotion": "tired",
  "intensity": 0.7,
  "summary": "用户感到明显的疲惫",
  "scene": { "time": "night", "weather": "clear", "palette": "tired_mid", "music": "tired", "imagery": ["stars", "hammock", "fireflies"] },
  "island_state": {
    "dominant_emotion": "tired", "trend": "recovering", "growth_level": 3,
    "features": ["stars", "hammock", "lighthouse"], "weather_memory": "clearing_sky",
    "summary": "你的心象岛屿成长到第 3 级，最近以疲惫为主。……",
    "chapter": "岛屿正从雾季里慢慢走出来——它不催你，只陪你一程一程地走。"
  },
  "narrative": "夜深了，岛上的风很轻……",
  "imprint": "今晚先把自己交给星光，明天的海会替你重新托起帆。",
  "memory_hint": "岛屿记得你上次也带着疲惫来过，但你依然走到了今天。",
  "safety": { "triggered": false, "message": null }
}
```

### WebSocket 流式接口

```http
WS /ws/reflect
```

连接建立后发送与 `POST /api/reflect` 相同的请求体。服务端事件：

| 事件 | 主要字段 | 说明 |
|---|---|---|
| `started` | `message` | 开始处理 |
| `agent` | `agent`、`label`、`status`、`output` | 单个「信使」处理进度（多次推送） |
| `emotion` | `emotion`、`intensity`、`summary`、`safety` | 情绪分析与安全检测结果 |
| `scene` | `scene` | 岛屿场景配置 |
| `island_state` | `island_state` | 心象岛屿状态 |
| `narrative` | `narrative`、`imprint`、`memory_hint` | 叙事文本、心灵印记与记忆提示；高风险时叙事为空、印记为 `null` |
| `memory` | `memory` | 本次保存的 PostgreSQL 记忆（无痕模式不推送） |
| `done` | `result` | 与 `POST /api/reflect` 兼容的最终响应 |
| `error` | `message` | 请求格式、超时或服务异常提示 |

### 健康检查

```http
GET /api/health
```

返回服务状态、当前 Provider、模型名与支持的情绪列表。

## 本地身份与隐私边界

- 首次进入时前端要求输入昵称，昵称和生成的 `user_id` 只保存在当前浏览器 `localStorage`。
- 后端接口只接收 `user_id` 和情绪文本，用 `user_id` 隔离 PostgreSQL 记忆。
- 项目不需要密码；请不要填写手机号、邮箱、学号等真实身份信息。
- 当前 Demo 没有登录态、权限系统、用户表、JWT、OAuth 或云端同步。
- **隐私可删除**：应用内提供「删除全部记忆」入口，一键清空该身份在后端的记忆 / 物件 / 私房话 / 向量（`DELETE /api/identity/{user_id}`）。pgvector 向量行经 `ON DELETE CASCADE` 随记忆一并清除，删除关系记忆永不被阻断。

另保留命令行脚本做批量清理。先 dry-run 查看影响范围：

```bash
cd /Users/a111/chen/code/心屿/backend
. .venv/bin/activate
python scripts/delete_memories_by_user.py --user-id local-xxxx
```

确认后再删除：

```bash
python scripts/delete_memories_by_user.py --user-id local-xxxx --confirm
```

## 前端资源

**场景图**位于 `frontend/public/scenes/`，由后端 `scene.palette` 映射到前端 `src/lib/sceneMap.ts`。当前为 24 张完整本地预设图（8 种情绪 × 3 个强度档）作为 2D 沉浸式底图，叠加 CSS/SVG 天空、海面、岛屿与天气粒子；后端按强度返回 `low` / `mid` / `high` 三档 palette，旧 palette 键保留兼容别名。这些图由 `frontend/scripts/generate_scene_assets.py` 用 Pillow 离线生成，属可复现的插画式本地资源，不依赖运行时在线图像生成。

在 2D 之上，可叠加 **react-three-fiber 真 3D 岛屿皮肤**（`src/components/Island3D.tsx`，现以整景 GLB `xy_scene_island.glb` 经实时 cel-shading 渲染，并漂浮云朵 / 飞鸟 / 海龟 / 暖阳等背景生灵与天体；`?island=proc` 可切回程序化地形兜底）与可漫游的**自由探索模式**（`src/components/ExploreMode.tsx`）。两者共用 `frontend/public/models/` 下的 100+ 个 GLB 模型，由 Blender 离线生成或接入精修资产（构建脚本见 `blender/`，素材清单见 [`心屿-Blender素材清单.md`](心屿-Blender素材清单.md)）。3D 按设备性能与 WebGL 支持自动分级，弱设备或不支持时回退 2D。

> 大型模型说明：`frontend/public/models/free_dirt_road_through_forest.glb` 约 117MB，用于林间土路驾驶地图，已通过 Git LFS 跟踪。首次克隆后请确保本机安装 Git LFS，并执行 `git lfs pull` 拉取完整模型。

**背景音乐**位于 `frontend/public/audio/`，由后端 `scene.music`（现直接返回情绪键）映射到前端 `src/lib/musicMap.ts`。所有曲目来自 Kevin MacLeod（incompetech.com），CC-BY 4.0，完整署名见 `frontend/public/audio/CREDITS.md`，App 内「背景音乐」控件常驻展示当前曲目署名。

| music（情绪键） | 文件 | 原曲 |
|---|---|---|
| `sad` | `/audio/sad.m4a` | *Bittersweet* |
| `anxious` | `/audio/anxious.m4a` | *Long Note Three* |
| `tired` | `/audio/tired.m4a` | *Ether Vox* |
| `lonely` | `/audio/lonely.m4a` | *Shores of Avalon* |
| `calm` | `/audio/calm.m4a` | *Clear Air* |
| `happy` | `/audio/happy.m4a` | *Carefree* |
| `angry` | `/audio/angry.m4a` | *Gloom Horizon* |
| `helpless` | `/audio/helpless.m4a` | *Sad Trio* |
| `default` | `/audio/default.m4a` | *Ripples* |

**环境音景**在 BGM 之上分两层叠加：情绪氛围底噪（`src/lib/ambience.ts`，随情绪切换海浪 / 雨 / 夜虫 / 篝火 / 林风 / 溪流 / 晨鸟）与自由探索时的位置环境音（`src/lib/locationAmbience.ts`，随玩家所在区域在洋 / 湾 / 溪 / 篝火 / 山 / 林 / 村间交叉淡入）；两层均循环播放、随「背景音乐」控件一键静音，缺素材或断网时静默降级。

**交互音效**由 `src/lib/sfx.ts` 调度，采取**采样优先**策略：命中 `src/lib/samples.ts` 预载的真实采样（铃 / 涟漪 / 拾取 / 萌发 / 翻页 / 刻字 / 落定 / 转场等）即播采样，未命中或断网则回退 Web Audio API 实时合成，保证完全离线可用。新增的环境与采样素材取自 Wikimedia Commons（CC0 / Public Domain / CC-BY / CC-BY-SA），逐条来源、作者与授权见 `frontend/public/audio/CREDITS.md` 与同目录 `meta.json`。

## 可选真实模型（含腾讯混元）

复制并编辑后端环境变量：

```bash
cd /Users/a111/chen/code/心屿/backend
cp .env.example .env
```

接入 OpenAI 兼容接口（以**腾讯混元**为例，答辩演示推荐）：

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=你的混元 API Key
OPENAI_BASE_URL=https://api.hunyuan.cloud.tencent.com/v1
OPENAI_MODEL=hunyuan-turbos-latest
```

如果没有配置 Key，系统自动使用 Mock 模式；真实模型调用失败时每个方法都会自动降级到 Mock，保证演示不中断。

可选开启云端情感语音合成（让「朗读叙事」与精灵发声升级为云端情感音色），支持**阿里云 CosyVoice** 与**腾讯云**双通道，配好任一即可，未配置时自动降级浏览器朗读：

```bash
# 阿里云 CosyVoice（DashScope）
DASHSCOPE_API_KEY=你的 DashScope API Key
# 或腾讯云情感语音合成
TENCENT_TTS_SECRET_ID=你的 SecretId
TENCENT_TTS_SECRET_KEY=你的 SecretKey
# 两者都配时可显式指定通道（留空自动选，默认优先 aliyun）
TTS_PROVIDER=aliyun
```

## 部署说明

后端可使用 Dockerfile 构建：

```bash
cd /Users/a111/chen/code/心屿/backend
docker build -t xinyu-backend .
docker run --rm -p 8000:8000 --env-file .env xinyu-backend
```

前端构建为静态资源：

```bash
cd /Users/a111/chen/code/心屿/frontend
npm run build
```

生产部署时建议：

- 将前端 `VITE_API_BASE` 指向后端公网地址。
- 将后端 `CORS_ORIGINS` 设置为前端真实域名。
- 用托管 PostgreSQL（启用 pgvector 扩展）并配置 `DATABASE_URL`；定期备份。
- 保持当前匿名本地身份模式，不启用账号、JWT、OAuth 或密码系统；如需多端同步，再单独设计账号体系。

## 验证命令

后端（测试 / 校验脚本使用独立的 `xinyu_test` 库，不触碰开发数据，先建一次）：

```bash
cd /Users/a111/chen/code/心屿/backend
. .venv/bin/activate
createdb xinyu_test   # 仅首次；测试以 VECTOR_ENABLED=0 运行，无需 pgvector
python -m compileall app
python -m unittest discover -s tests -v
python scripts/verify_imprint.py
python scripts/verify_vector_memory_fallback.py
curl -s http://127.0.0.1:8000/api/health
```

前端：

```bash
cd /Users/a111/chen/code/心屿/frontend
npm run lint
npm test
npm run build
```

## 未完成项

- PWA 离线能力（加载后离线查看基础场景与历史）。
- 更高艺术质量的人工绘制 / 3D 美术资源替换。
- 更完整的生产观测能力：结构化访问日志、错误监控、备份与恢复演练。
- 生产级账号系统、权限控制、多端同步可作为未来选项单独评审；当前版本不引入 JWT、OAuth 或密码系统。
