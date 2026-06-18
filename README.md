# 心屿 Demo

《心屿》是一个 AI 情感陪伴叙事游戏 Demo。用户输入当下心情后，系统会识别情绪、生成温柔克制的中文叙事、切换岛屿场景与背景音乐，并把本次情绪保存为记忆。再次进入时，岛屿会基于最近记忆给出回访感。

> 本项目提供情感陪伴体验，不是心理咨询或医疗服务，不做诊断，也不承诺治疗效果。

## 当前范围

- P0 已完成：本地昵称身份、文字/语音情绪输入、情绪分析、WebSocket 流式响应、叙事生成、岛屿场景反馈、背景音乐、情绪记忆、高风险提示。
- AI 默认使用 Mock 模式，无需 API Key 即可跑通。
- 支持情绪：`sad`、`anxious`、`tired`、`lonely`、`calm`、`happy`、`angry`、`helpless`。
- 数据保存在 `backend/app/data/memories.db`，并镜像到 `backend/app/data/memories.json`。
- 前端默认优先使用 `/ws/reflect`，流式失败时回退到 `POST /api/reflect`。
- 语音输入使用浏览器 `SpeechRecognition` / `webkitSpeechRecognition`，语音朗读使用浏览器 `speechSynthesis`；不支持时前端会降级为不可用状态。
- 当前视觉场景使用 24 张本地预设图片资源，不调用在线图像生成服务。
- 当前多用户是本地昵称系统，不包含账号、密码、JWT、OAuth 或云端用户表。

## 启动方式

后端：

```bash
cd /Users/a111/chen/code/心屿/backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

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

关键配置：

| 变量 | 说明 |
|---|---|
| `LLM_PROVIDER` | `mock` 或 `openai`；默认 `mock`。 |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | 仅 `LLM_PROVIDER=openai` 时使用。 |
| `LLM_TIMEOUT` | 调用真实模型的超时时间，单位秒。 |
| `CORS_ORIGINS` | 允许访问后端的前端来源，多个来源用英文逗号分隔；生产环境必须配置为真实域名，不要使用 `*`。 |
| `MEMORY_DB` / `MEMORY_JSON` | SQLite 记忆库与 JSON 镜像路径。 |
| `CHROMA_ENABLED` / `CHROMA_DB_DIR` / `CHROMA_COLLECTION` | ChromaDB 向量记忆配置；不可用时自动回退 SQLite。 |
| `VECTOR_MEMORY_RESULTS` | 叙事生成前检索的相似记忆数量。 |

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
2. 输入或语音说出：`我今天真的很累，加班到很晚，感觉什么都做不好，好疲惫`
3. 展示流式加载状态、疲惫情绪、夜晚星空场景、叙事卡片、记忆提示。
4. 打开左下角背景音乐，确认按情绪切换曲目并可调节音量。
5. 点击“朗读叙事”，确认浏览器语音朗读可用；不支持的浏览器会显示不可用。
6. 点击“再说一次”，输入：`其实今天挺开心的，想回来看看岛屿记不记得我`
7. 展示“岛屿记得你”的连续陪伴感。
8. 输入高风险文本：`我真的彻底绝望崩溃了，完全撑不下去了，一点希望都没有，太无助了`
9. 展示安全提示：不输出普通故事，引导联系可信任的人或专业热线。

## API

### HTTP 反思接口

```http
POST /api/reflect
Content-Type: application/json
```

请求：

```json
{
  "user_id": "demo-user",
  "text": "我今天很累，感觉什么都做不好"
}
```

响应包含：

- `emotion`：情绪标签
- `intensity`：强度，范围 0 到 1
- `summary`：中文情绪摘要
- `scene`：岛屿场景配置，包含 `time`、`weather`、`palette`、`music`、`imagery`
- `narrative`：叙事文本，高风险时为空
- `imprint`：一句 20-60 字中文心灵印记；高风险时为 `null`
- `memory_hint`：基于最近记忆的回访提示
- `safety`：风险提示结果，包含 `triggered` 与 `message`

响应示例：

```json
{
  "emotion": "tired",
  "intensity": 0.7,
  "summary": "用户感到明显的疲惫",
  "scene": {
    "time": "night",
    "weather": "clear",
    "palette": "tired_mid",
    "music": "soft_piano",
    "imagery": ["stars", "hammock", "fireflies"]
  },
  "narrative": "夜深了，岛上的风很轻……",
  "imprint": "今晚先把自己交给星光，明天的海会替你重新托起帆。",
  "memory_hint": "岛屿记得你上次也带着疲惫来过，但你依然走到了今天。",
  "safety": {
    "triggered": false,
    "message": null
  }
}
```

### WebSocket 流式接口

```http
WS /ws/reflect
```

连接建立后发送：

```json
{
  "user_id": "demo-user",
  "text": "我今天很累，感觉什么都做不好"
}
```

服务端事件：

| 事件 | 主要字段 | 说明 |
|---|---|---|
| `started` | `message` | 开始处理 |
| `emotion` | `emotion`、`intensity`、`summary`、`safety` | 情绪分析与安全检测结果 |
| `scene` | `scene` | 岛屿场景配置 |
| `narrative` | `narrative`、`imprint`、`memory_hint` | 叙事文本、心灵印记与记忆提示；高风险时叙事为空且心灵印记为 `null` |
| `memory` | `memory` | 本次保存的 SQLite 记忆 |
| `done` | `result` | 与 `POST /api/reflect` 兼容的最终响应 |
| `error` | `message` | 请求格式、超时或服务异常提示 |

### 记忆接口

```http
GET /api/memories?user_id=demo-user&limit=20
```

返回当前 `user_id` 下的记忆列表，用于前端记忆面板。

### 健康检查

```http
GET /api/health
```

返回服务状态、当前 Provider、模型名与支持的情绪列表。

## 本地身份与隐私边界

- 首次进入时前端要求输入昵称，昵称和生成的 `user_id` 只保存在当前浏览器 `localStorage`。
- 后端接口只接收 `user_id` 和情绪文本，用 `user_id` 隔离 SQLite 记忆。
- 项目不需要密码；请不要填写手机号、邮箱、学号等真实身份信息。
- 清除本地身份只会删除浏览器里的昵称与 `user_id`，不会自动删除后端 SQLite 中已保存的历史记忆。
- 当前 Demo 没有登录态、权限系统、用户表、JWT、OAuth 或云端同步。

如需删除某个本地 `user_id` 的后端记忆，先 dry-run 查看影响范围：

```bash
cd /Users/a111/chen/code/心屿/backend
. .venv/bin/activate
python scripts/delete_memories_by_user.py --user-id local-xxxx
```

确认后再删除：

```bash
python scripts/delete_memories_by_user.py --user-id local-xxxx --confirm
```

该脚本以 SQLite 为准，删除后会刷新 `memories.json`；ChromaDB 向量记录会尽力清理，失败不会阻断 SQLite 删除。

## 前端资源

场景图片位于 `frontend/public/scenes/`，由后端 `scene.palette` 映射到前端 `src/lib/sceneMap.ts`。

当前采用 24 张完整本地预设图：8 种情绪 x 3 个强度档。后端根据情绪强度返回 `low`、`mid`、`high` 三档 palette；旧 palette 键仍在前端保留兼容别名。

| 情绪 | 低强度 palette | 中强度 palette | 高强度 palette |
|---|---|---|---|
| `sad` | `sad_low` | `sad_mid` | `sad_high` |
| `anxious` | `anxious_low` | `anxious_mid` | `anxious_high` |
| `tired` | `tired_low` | `tired_mid` | `tired_high` |
| `lonely` | `lonely_low` | `lonely_mid` | `lonely_high` |
| `calm` | `calm_low` | `calm_mid` | `calm_high` |
| `happy` | `happy_low` | `happy_mid` | `happy_high` |
| `angry` | `angry_low` | `angry_mid` | `angry_high` |
| `helpless` | `helpless_low` | `helpless_mid` | `helpless_high` |

这些图片由 `frontend/scripts/generate_scene_assets.py` 使用 Pillow 离线生成，属于可复现的插画式本地资源，不是真实照片，也不依赖运行时在线图像生成。

背景音乐位于 `frontend/public/audio/`，由后端 `scene.music` 映射到前端 `src/lib/musicMap.ts`：

| music | 文件 |
|---|---|
| `soft_piano` | `/audio/soft_piano.mp3` |
| `ambient_drone` | `/audio/ambient_drone.mp3` |
| `lofi` | `/audio/lofi.mp3` |
| `bright_acoustic` | `/audio/bright_acoustic.mp3` |
| `low_strings` | `/audio/low_strings.mp3` |
| `default` | `/audio/default.mp3` |

## 可选真实模型

复制并编辑后端环境变量：

```bash
cd /Users/a111/chen/code/心屿/backend
cp .env.example .env
```

配置：

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=你的 Key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

如果没有配置 Key，系统自动使用 Mock 模式。

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
- 将 `MEMORY_DB`、`MEMORY_JSON`、`CHROMA_DB_DIR` 挂载到持久化目录。
- 保持当前匿名本地身份模式，不启用账号、JWT、OAuth 或密码系统；如需多端同步，再单独设计账号体系。

## 验证命令

```bash
cd /Users/a111/chen/code/心屿/backend
. .venv/bin/activate
python -m compileall app
python -m unittest discover -s tests -v
python scripts/verify_imprint.py
python scripts/verify_vector_memory_fallback.py
curl -s http://127.0.0.1:8000/api/health
```

```bash
cd /Users/a111/chen/code/心屿/frontend
npm run lint
npm run build
```

## 未完成项

- 更高艺术质量的人工绘制场景资源替换。
- 更完整的生产观测能力，例如结构化访问日志、错误监控、备份与恢复演练。
- 生产级账号系统、权限控制、多端同步可作为未来选项单独评审；当前版本不引入 JWT、OAuth 或密码系统。
