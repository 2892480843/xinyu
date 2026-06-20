# 心屿音频素材 · 集成清单

> 本文件面向「后续把素材接进代码」的开发。素材已全部下载转码完毕，
> 运行时位于 `frontend/public/audio/`，署名见同目录 `CREDITS.md`，逐条元数据见 `meta.json`。
>
> **现状**：项目原本是「9 首已齐 BGM + 全部 Web Audio 合成音效」的零素材架构，
> 支撑断网 / 弱网 / PWA 离线演示。本次新增 21 个真实录音采样，**未改动任何运行时代码**，
> 集成时建议遵循「采样优先 + 合成降级」原则，保留离线韧性。

---

## 1. 目录结构（运行时）

```
frontend/public/audio/
├── *.m4a                  # 9 首情绪 BGM（Kevin MacLeod，已有，不变）
├── CREDITS.md             # 完整署名（BGM + 新增素材）
├── meta.json              # 新增素材的逐条元数据（作者/授权/来源页/直链）
├── fetch_assets.py        # 抓取+转码脚本（可复用、可续传）
├── ASSETS-INTEGRATION.md  # ← 本文件
├── ambience/              # A. 环境氛围底噪（循环）
│   ├── ocean_waves.m4a  rain.m4a  crickets.m4a  campfire.m4a
│   ├── wind_forest.m4a  brook.m4a  dawn_birds.m4a
├── env/                   # B. 探索/驾驶场景环境音
│   ├── footstep.m4a  water_splash.m4a  boat_engine.m4a  foghorn.m4a
│   └── conch.m4a  wind_chime.m4a
├── sfx/                   # C. 采样音效（可替代 sfx.ts 合成版）
│   ├── chime.m4a  ripple.m4a  collect.m4a  bloom.m4a
│   └── page.m4a  inscribe.m4a  settle.m4a  whoosh.m4a
└── raw/                   # 原始文件存档（.ogg/.wav/.flac/.mp3，不入运行时）
    ├── ambience/  env/  sfx/
```

运行时 URL 形如 `/audio/ambience/ocean_waves.m4a`、`/audio/sfx/chime.m4a`。

---

## 2. 集成方案建议

### 2.1 环境氛围底噪（A 组）—— 叠加在 BGM 之下

**目标**：根据当前情绪场景，在背景音乐之下循环播放一层环境底噪，提升沉浸感。

**建议落点**：`MusicControl.tsx`（已管理 BGM 的 `<audio>` 与静音联动）。

- 新增一个并行的 ambience `<audio loop>` 节点，音量约为 BGM 的 30–45%，跟随同一个静音开关。
- 情绪 → ambience 映射建议（与 `musicMap.ts` / `island_state.features` 对齐）：

| 情绪 / 场景 | ambience | 说明 |
|---|---|---|
| calm / lonely / default | `ocean_waves` | 海岛默认底噪 |
| sad（含 rain 元素） | `rain` | 雨声 |
| tired / 夜间 | `crickets` | 夜虫 |
| anxious（fog/wind 元素） | `wind_forest` | 林间风 |
| happy / sunrise | `dawn_birds` | 晨鸟 |
| fireflies / hammock / bonfire 物件 | `campfire` | 篝火（可按 features 触发） |
| river_lamp 元素 | `brook` | 溪流（可按 features 触发） |

**降级**：`preload="none"` + `onError` 静默回退（无底噪不影响主流程），与现有 BGM 失败处理一致。

### 2.2 探索 / 驾驶场景环境音（B 组）—— PositionalAudio

**目标**：在 3D 探索（`ExploreMode.tsx`）与驾驶（`DriveScene.tsx`）中加入空间化环境音。

**建议落点**：
- `footstep` / `water_splash`：角色移动时触发（`ExploreMode.tsx` 角色位移逻辑附近）。
- `boat_engine`：`DriveScene.tsx` 已有合成的 `startEngine/setEngineSpeed`，可作为真实层叠加或替代。
- `foghorn` / `conch`：挂在 GLB 地标（灯塔 / 码头 / 船）上，用 `@react-three/drei` 的 `PositionalAudio` 做空间衰减。
- `wind_chime`：挂在愿望灯 / 风铃互动点。

**降级**：WebGL 不可用时 ExploreMode 本就不渲染，env 音自然不触发；DriveScene 引擎可保留合成兜底。

### 2.3 采样音效替代合成版（C 组）—— sfx.ts

**目标**：用真实采样替代 `sfx.ts` 里的部分合成音效，保留合成作降级。

**建议落点**：`sfx.ts` 的 `play(name)` 函数。

- 在 `play()` 开头加一层「尝试播放采样，失败则回退合成」的分支。
- 采样用单个 `AudioBuffer` 缓存池（首次 `fetch` + `decodeAudioData`，命中后复用），避免每次 new Audio。
- 对应关系（见下表），未列出的 `shell/wave/breath/tap/reveal` 暂保留合成。

| sfx 名 | 采样文件 | 当前调用点（示例） |
|---|---|---|
| `chime` | `sfx/chime.m4a` | 风铃心曲逐音 |
| `ripple` | `sfx/ripple.m4a` | 涟漪交互 |
| `collect` | `sfx/collect.m4a` | 拾心灵印记 |
| `bloom` | `sfx/bloom.m4a` | 生长瞬间 |
| `page` | `sfx/page.m4a` | 翻页 / 切换 |
| `inscribe` | `sfx/inscribe.m4a` | 刻字 |
| `settle` | `sfx/settle.m4a` | 物件落定 |
| `whoosh` | `sfx/whoosh.m4a` | 转场 / 运镜 |

**降级要点**：采样未加载 / 解码失败 / 断网时，必须 fall through 到现有合成逻辑，保证断网演示不白屏。

---

## 3. 授权注意事项（务必读）

- 公开演示 / 开源发布：所有素材（含 CC-BY-SA）可直接使用，仅需署名（CREDITS.md 已满足）。
- **若心屿未来以闭源 / 专有协议分发**：需处理 3 个 **CC-BY-SA** 素材——
  - `ambience/crickets`（CC-BY-SA 3.0）
  - `ambience/dawn_birds`（CC-BY-SA 3.0 NL）
  - `sfx/ripple`（CC-BY-SA 4.0）
  
  SA 要求衍生作品以相同协议开源。闭源分发前请：替换为 CC0/CC-BY 素材，或取得原作者另行授权。
- 其余素材为 CC0 / Public Domain / CC-BY，闭源分发只需保留署名即可。

---

## 4. 复用抓取脚本

`fetch_assets.py` 可重复运行，已下载的会跳过（依赖 meta.json 去重逻辑可按需补充）。

```bash
cd frontend/public/audio
# 条目格式: "Wikimedia文件名|本地命名(可含分类前缀)"
python3 fetch_assets.py "Some File.ogg|ambience/some_name"
```

- 自动查真实直链 + 授权元数据 → 下载原始到 `raw/<分类>/` → afconvert 转码 m4a → 写 meta.json。
- 含 1s API 间隔防 Wikimedia 429 限流；超时失败可重跑同一命令续传。
