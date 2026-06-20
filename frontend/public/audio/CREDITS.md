# 心屿背景音乐 · 版权与署名

本目录所有背景音乐均来自 **Kevin MacLeod（incompetech.com）**，
统一授权协议：**Creative Commons Attribution 4.0（CC-BY 4.0）**
<https://creativecommons.org/licenses/by/4.0/>

> CC-BY 4.0 允许商用与改编，唯一义务是「在可被合理发现处署名」。
> 心屿已在 App 内「背景音乐」控件中常驻展示当前曲目署名（见 `MusicControl`），本文件为完整存档。

## 改编说明

原始文件为 MP3（256–320 kbps）。为优化移动端加载，已用 macOS `afconvert`
统一转码为 **AAC 128 kbps（.m4a）**，未做剪辑、混音或其它内容改动。

## 曲目对照（情绪 → 文件 → 原曲）

| 情绪场景 | 文件 | 原曲名 | 速度/乐器特征 |
|---------|------|--------|--------------|
| 难过 sad | `sad.m4a` | *Bittersweet* | bpm73 · 钢琴/大提琴/人声，温柔忧伤 |
| 焦虑 anxious | `anxious.m4a` | *Long Note Three* | 无小节 · 持续弦乐/合成器，不安铺底 |
| 疲惫 tired | `tired.m4a` | *Ether Vox* | bpm60 · 电钢/吉他/合成器，梦境安眠 |
| 孤独 lonely | `lonely.m4a` | *Shores of Avalon* | 无小节 · 钢琴/合成器/独唱，海屿疏离 |
| 平静 calm | `calm.m4a` | *Clear Air* | bpm68 · 吉他/钢琴，澄澈 |
| 愉悦 happy | `happy.m4a` | *Carefree* | bpm96 · 尤克里里/马林巴，明亮无忧 |
| 愤怒 angry | `angry.m4a` | *Gloom Horizon* | bpm100 · 低音弦乐/打击，暗涌张力 |
| 无助 helpless | `helpless.m4a` | *Sad Trio* | 无小节 · 钢琴/大提琴/英国管，深沉 |
| 默认 default | `default.m4a` | *Ripples* | bpm57 · 古筝水波，中性氛围 |

## 标准署名文本（逐曲）

```
"Bittersweet" by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/
"Long Note Three" by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/
"Ether Vox" by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/
"Shores of Avalon" by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/
"Clear Air" by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/
"Carefree" by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/
"Gloom Horizon" by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/
"Sad Trio" by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/
"Ripples" by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/
```

来源站点：<https://incompetech.com/music/royalty-free/music.html>

---

## 环境氛围底噪 / 场景环境音 / 采样音效（2026-06 新增）

> 以下素材来自 **Wikimedia Commons**，按情绪场景（氛围底噪）、3D 探索 / 驾驶场景（环境音）、
> 关键交互节点（采样音效，可选替代 `sfx.ts` 的 Web Audio 合成版）分类。
> 原始文件存于 `raw/<分类>/`（.ogg/.wav/.flac/.mp3），运行时统一转码为 **AAC 128 kbps（.m4a）**
> 存于 `<分类>/`。完整逐条元数据（含来源页、原始描述）见同目录 `meta.json`。
> 抓取脚本见 `fetch_assets.py`（可复用，支持续传与限流间隔）。

### 分类说明

| 分类目录 | 运行时路径前缀 | 用途 |
|---|---|---|
| `ambience/` | `/audio/ambience/*.m4a` | 环境氛围底噪（循环），按情绪场景叠加在 BGM 之下 |
| `env/` | `/audio/env/*.m4a` | 3D 探索 / 驾驶场景的环境音（可做 PositionalAudio） |
| `sfx/` | `/audio/sfx/*.m4a` | 关键交互音效采样，可替代 `sfx.ts` 的合成版（保留合成作降级） |

### A. 环境氛围底噪（`ambience/`）

| 文件 | 原曲/素材名 | 作者 | 授权 | 情绪场景对应 |
|---|---|---|---|---|
| `ocean_waves.m4a` | *Oceanwavescrushing* | Luftrum | CC-BY 3.0 | calm / lonely / default 海岛底噪 |
| `rain.m4a` | *Rain against the window* | cori | Public Domain | sad（rain 元素） |
| `crickets.m4a` | *Field cricket (Gryllus pennsylvanicus)* | Thatcher | CC-BY-SA 3.0 | tired / night 星空夜虫 |
| `campfire.m4a` | *Campfire sound ambience* | Glaneur de sons | CC-BY 3.0 | fireflies / hammock 暖光 |
| `wind_forest.m4a` | *Wind in forest* | Gravity Sound | CC-BY 4.0 | anxious（fog / wind 元素） |
| `brook.m4a` | *Brook sound* | TwoWings | CC-BY 3.0 | river_lamp 溪流 |
| `dawn_birds.m4a` | *Early morning Birdsong (Leersum)* | Tammo Heikens | CC-BY-SA 3.0 NL | happy / sunrise 明亮 |

### B. 探索 / 驾驶场景环境音（`env/`）

| 文件 | 原素材名 | 作者 | 授权 | 用途 |
|---|---|---|---|---|
| `footstep.m4a` | *Footstep on Gravel* | Gravity Sound | CC-BY 4.0 | 角色行走脚步 |
| `water_splash.m4a` | *Bathtub water splashes* | gradha | Public Domain | 近水 / 涉水水花 |
| `jump.m4a` | *Boing raw* | cfork | CC-BY 4.0 | 主角起跳（轻上扬） |
| `land.m4a` | *Dull thud*（与 `sfx/settle` 同源） | gregoryweir | Public Domain | 主角落地（闷响；复用 settle 源转码，独立命名便于后续替换） |
| `boat_engine.m4a` | *WWS Seffle boat engine* | Work With Sounds / Torsten Nilsson | CC-BY 4.0 | 船只引擎环境 |
| `foghorn.m4a` | *WWS Foghorn* | Work With Sounds / Torsten Nilsson | CC-BY 4.0 | 雾笛 / 灯塔（distant_boat / 码头地标） |
| `conch.m4a` | *Conch shell* | David Bolton | CC-BY 2.5 | 海螺号角（可作船笛替代） |
| `wind_chime.m4a` | *Windglockenspiel (Koshi)* | Membeth | CC0 | 风铃环境点缀 |

### C. 采样音效（`sfx/`）—— 可替代 `sfx.ts` 合成版

| 文件 | 原素材名 | 作者 | 授权 | 对应 sfx.ts 音效 |
|---|---|---|---|---|
| `chime.m4a` | *Bell-ring* | qubodup | CC0 | `chime` 铃音 |
| `ripple.m4a` | *Water sound 02* | Anasskoko | CC-BY-SA 4.0 | `ripple` 涟漪 |
| `collect.m4a` | *Easy sparkle* | Gravity Sound | CC-BY 4.0 | `collect` 拾取 |
| `bloom.m4a` | *Drop of Water In the Ocean* | Broke For Free | CC-BY 3.0 | `bloom` 萌发 / 生长 |
| `page.m4a` | *Turning a page* | planish | Public Domain | `page` 翻页 |
| `inscribe.m4a` | *Writing with inkpen* | stephan | Public Domain | `inscribe` 刻字 |
| `settle.m4a` | *Dull thud* | gregoryweir | Public Domain | `settle` 物件落定 |
| `whoosh.m4a` | *Lead - swish rave* | Gravity Sound | CC-BY 4.0 | `whoosh` 转场 / 运镜 |

> 注：`sfx.ts` 中的 `shell`（贝壳）、`wave`（海浪）、`breath_in/out`（呼吸）、`tap`、`reveal`
> 暂保留 Web Audio 合成版未替换（合成版质量良好且零资产），可按需后续补充采样。

### 授权说明

- **CC0 / Public Domain**：可自由使用，无需署名。
- **CC-BY 2.5 / 3.0 / 4.0**：允许商用与改编，需在「可被合理发现处」署名作者。
- **CC-BY-SA 3.0 / 4.0**：同 CC-BY，但衍生作品须以相同协议发布。
  > ⚠️ `crickets`、`dawn_birds`、`ripple` 三项为 CC-BY-SA。若心屿未来以闭源 / 专有协议分发，
  > 需替换这三项为 CC0 / CC-BY 素材，或确认 SA 条款兼容性。
  > 路演 / 黑客松阶段（公开演示）使用无碍。
- 所有作者与来源页见 `meta.json` 与各素材的 Wikimedia 描述页（`desc_url` 字段）。
