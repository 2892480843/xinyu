# 心屿 · Blender 素材设计稿 — Batch 5/6/7（村落 · 地形 · 海滩 · 海水 · 岛上设施）

> ✅ **已全部交付并接线**（2026-06，分支 `feat/audio-music-and-assets`）：42 个新 glb 已生产入
> `frontend/public/models/`，并接进 [`ExploreMode.tsx`](frontend/src/components/ExploreMode.tsx)。
> 制作脚本：[`blender/xy_houses.py`](blender/xy_houses.py)（§A 8 栋·三风格混搭）、
> [`blender/xy_coast.py`](blender/xy_coast.py)（§B+C+D 地形/海滩/海水 23 件）、
> [`blender/xy_island_life.py`](blender/xy_island_life.py)（§E 设施 11 件），均 headless 跑通 + 自带验收渲染。
> 接线：`MODELS` 表登记 42 项 + 新增 `Village`（房子绕广场成街·脸朝广场 + 设施散布）/`Coastline`
> （近海地形 + 海湾沙滩物 + 发光海水染情绪 accent + 随浪浮动）两组件。`tsc -b && vite build` 通过、
> 控制台零报错/零警告、42 glb 全 200、游戏内俯瞰确认村落与海岸件就位。
> ⚠️ 地面级近景质感需真机走过去看（ExploreMode 跟随相机无法 headless 稳定取景,既有限制）。
>
> 下文保留原始设计提示词（proposal），供二次调整/重制时参考。

> 本文是**设计提示词**，承接 [`心屿-Blender素材清单.md`](心屿-Blender素材清单.md) 已交付的 Batch 1–4（47 个 glb）。
> 主题：把「**会回应你的岛屿**」从一座风景岛，升级成一座**有人居住、有生活气息、海岸丰富**的治愈海岛。
> 一切沿用主清单 §0 的 **Style Bible**（low-poly + cel-shaded、深海玻璃、情绪驱动配色、`MeshToonMaterial`+`Outlines`），此处只列**新增/扩展**部分。

---

## 0. 关键设计决定 · 建筑风格走向（需先拍板，再开建）

现有素材是**东西混搭的童话海岛**（和风鸟居/神社/日式售货机/石灯笼 + 荷兰风车 + 通用治愈系），统一被「深海玻璃青」串起来。新房子要选一个主基调，三个候选：

| 方案 | 气质 | 关键造型 / 配色 | 与现有素材的关系 |
|---|---|---|---|
| **① 温暖治愈·海港 storybook（推荐）** | 柔软、暖、普世童话 | 奶油灰泥墙 + 暖木 + 陶土红/海玻璃青坡顶 + 大暖窗 + 窗台花箱 | 调和东西元素，不锁死某一真实文化，最贴「治愈虚构岛」 |
| **② 和风渔村** | 安静、侘寂 | 木造町屋 + 灰瓦悬山顶 + 障子窗 + 暖帘/纸灯 | 强化现有鸟居/神社/石灯笼，统一成日式 |
| **③ 地中海 / 西式海街** | 明亮、度假 | 白墙 + 蓝穹顶/拱门 + 石阶巷 + 三角梅 | 若「西街」指西式街景，走希腊海岛/地中海 |

> 下方所有 EN 提示词以**方案 ①** 为默认底色写；选 ② / ③ 时把「墙=奶油灰泥、顶=陶土红/青」替换为对应材质即可，结构件通用。

### 新增配色（扩展主清单 §0 色板）
| 用途 | 颜色 |
|---|---|
| 灰泥奶油墙 plaster | `#f0e6d2` · `#e8dcc0` |
| 陶土红屋顶 terracotta | `#c8744f` · `#b3623f` |
| 海玻璃青屋顶 teal-roof | `#4fa6a0` · `#3f8f8a` |
| 板岩灰顶 slate | `#5a6470` · `#48515c` |
| 暖木 warm-wood | `#9c6b43` · `#7a5a3e` |
| 暖窗光 window-glow（`Emissive`） | `#ffd9a0` · `#ffe9c4` |
| 礁岩深 rock-dark | `#7d8694` · `#646d7a` |
| 湿沙 wet-sand | `#cdb48a` |
| 浪沫白 foam | `#ffffff` · `#eaf7f7` |
| 浅滩水 shallow（可情绪 tint） | `#7fd9d2` · `#9fe6df` |

### 新增命名约定（接现有规范）
- 文件名：`xy_<category>_<name>.glb`，新增类目 **`house` / `terrain` / `beach` / `water` / `isle`**。
- 落地物（房子/地形/家具）原点 = **底面中心**；漂浮/水面物（浪花/水面块/吊床）原点 = **几何中心**。
- 有正面的物件（房子门面、招牌）正脸朝 **+Y(Blender)** → 游戏内 **+Z**。⚠️ 复用 Batch 3 教训：Blender +Y → glTF **−Z**，接线时该转 180°（`rotation=[0,π,0]`）就转，别让门面背对镜头。
- 发光件材质/节点名含 `Emissive_*`：本批新增 `Emissive_Window`（暖窗）/ `Emissive_Sign`（招牌）/ `Emissive_Lantern`（挂灯）/ `Emissive_Water` / `Emissive_Foam`（水可被 `EmotionTint` 按情绪改色）。
- 房子主材质分槽 **`Wall / Roof / Wood / Door / Trim`**，便于代码 `.color.set()` **给同一栋房换色拼出整条街**（一个模型→多种外观）。

---

## §A · 房子 House & Village Kit 〔P0 · 本批头牌〕

> 目标：村落（`ExploreMode` 的 `Town`）现在是程序化方盒建筑；用 6 个**精致 glb 房型** + 材质换色，拼出一条有层次、有生活感的海港小街。推荐管线 **A 程序化**（toon 最稳）。
> 注重细节：每栋都带**门廊/窗台花箱/小烟囱/屋檐挂灯/百叶窗**等小料，近看不空。

### A.1 渔夫小屋 Fisher's Cottage · `xy_house_cottage.glb`
- **用途**：村落主力单层民居，复用 + 换 `Roof`/`Door` 色形成街区。
- **真实比例**：占地 ≈ 5×6m，檐高 ≈ 3m，脊高 ≈ 4.5m。原点底面中心，门面朝 +Y。
- **面数**：≤ 1.2k。
- **材质**：`Wall` 奶油灰泥 `#f0e6d2` / `Roof` 陶土红 `#c8744f` / `Wood` 暖木 `#9c6b43` / `Emissive_Window` 暖窗 `#ffd9a0`。
- **细节**：双坡顶 + 小石烟囱 + 一扇大暖光窗 + 木门 + 窗台花箱 + 屋檐下挂一盏小灯（`Emissive_Lantern`）。
- **Prompt (EN)**：
```
A cozy stylized low-poly fisherman's cottage for a healing island village. Single story
with a steep gabled roof, cream plaster walls, warm wood door and window frames, one big
glowing window, a small stone chimney, a little window flower box, and a tiny hanging
lantern under the eaves. Chunky storybook proportions, warm and lived-in. <通用正向提示词>
```

### A.2 两层海景小楼 Two-Story Loft · `xy_house_loft.glb`
- **用途**：拉高村落天际线，做街角/高地房，丰富剪影。
- **真实比例**：占地 ≈ 5×5m，脊高 ≈ 7m。原点底面中心。
- **面数**：≤ 1.6k。
- **细节**：二层带**小阳台/晾台**（节点 `Balcony`）+ 一面坡向海、半腰墙换木板拼色 + 屋顶老虎窗 + 两扇暖窗。
- **Prompt (EN)**：
```
A charming two-story low-poly seaside house, narrow footprint, a small wooden balcony on
the upper floor facing the sea, mixed plaster-and-plank walls, a sloped roof with a tiny
dormer window, two glowing windows, soft warm storybook style. <通用正向提示词>
```

### A.3 圆角小屋 Round Cottage · `xy_house_round.glb`
- **用途**：可爱变体，呼应灯塔的圆塔语言；做村口或独栋。
- **真实比例**：Ø ≈ 4.5m，脊高 ≈ 5m。
- **面数**：≤ 1.4k。
- **细节**：圆/八角塔身 + 圆锥/伞形顶 + 环绕小窗 + 半截石基。
- **Prompt (EN)**：
```
A cute round low-poly cottage with a circular plaster tower body, a conical shingled roof
with a small finial, a few round windows with warm glow, a low stone base, a small arched
wooden door. Whimsical fairytale feel. <通用正向提示词>
```

### A.4 海货铺 / 杂货店 Seaside Shop · `xy_house_shop.glb`
- **用途**：给村落「功能感」——一间小店。带**条纹遮阳棚 + 发光招牌**。
- **真实比例**：占地 ≈ 6×5m，檐高 ≈ 3.2m。
- **面数**：≤ 1.8k。
- **材质**：增加 `Awning`（条纹布棚）+ `Emissive_Sign`（招牌，可单独发光/夜亮）。
- **细节**：开放式店面 + 柜台 + 门口货箱/木桶/挂网 + 门帘。
- **Prompt (EN)**：
```
A cozy low-poly seaside general store, open shopfront with a wooden counter, a striped
fabric awning over the front, a small glowing hanging signboard, crates and barrels by the
door, a fishing net on the wall, cream walls and teal trim. Friendly harbor-town vibe.
<通用正向提示词>
```

### A.5 海角咖啡馆 / 茶屋 Cliff Café · `xy_house_cafe.glb`
- **用途**：治愈主题落点——一个可以坐下喘口气的地方（呼应「岛是来疗愈的」）。
- **真实比例**：占地 ≈ 6×6m，檐高 ≈ 3m。
- **面数**：≤ 2k。
- **细节**：临海**露台**（节点 `Terrace`）+ 2~3 套小圆桌椅 + 遮阳伞（可复用 `xy_town_parasol`）+ 串灯（`Emissive_Lantern` 一串）+ 暖光落地窗。
- **Prompt (EN)**：
```
A warm low-poly seaside café / tea house with a small wooden deck terrace facing the
water, a couple of round tables and chairs, a string of warm fairy lights along the eaves,
large glowing windows, a sloped roof, cream-and-wood walls. Calm, inviting, healing mood.
<通用正向提示词>
```

### A.6 灯塔看守小屋 Lightkeeper's Hut · `xy_house_lightkeeper.glb` 〔可选〕
- **用途**：紧贴现有 `xy_landmark_lighthouse` 摆放，让灯塔不再孤零零。
- **真实比例**：占地 ≈ 4×4m，脊高 ≈ 4m。
- **细节**：与灯塔同色系（白墙红带）+ 一段连灯塔的矮石墙/小院。
- **Prompt (EN)**：
```
A small low-poly lightkeeper's hut to sit beside a lighthouse, white plaster walls with a
single red band to match, a low stone garden wall, one warm window, a sloped roof. Cozy and
weathered. <通用正向提示词>
```

> **接线提示**：房子数量少（一条街十几栋），**逐个 `GltfProp` 放置**即可，不必实例化；靠 `Wall/Roof/Door` 换色 + 旋转/缩放做出变化。若以后要密集街区，再把重复房型喂 `InstancedMesh`。
> **进阶选项**：也可像 `xy_scene_island.glb` 那样，把一整条**预摆好的小街**导成单个 `xy_scene_village.glb`（一次加载、构图可控），二选一可与你确认。

---

## §B · 地形 Terrain / Coast Kit 〔P1〕

> 基础地形是程序化高度场，这里做**可摆放的地貌件**当 set-dressing，丰富海岸线剪影。推荐管线 A。礁岩用 `ball()` 加噪声抖动（复用 `xy_island_home.py` 里 boulder 的写法）。

| 物件 | 文件名 | 真实尺寸 | 关键点 / 命名 | Prompt 核心 (EN) |
|---|---|---|---|---|
| 海蚀拱门 | `xy_terrain_archrock.glb` | 8×6m | 跨海岩拱，标志性地标 | `a low-poly coastal sea arch rock, a natural stone archway over water, smooth faceted weathered rock` |
| 海蚀柱 ×2 | `xy_terrain_seastack.glb` | 高 4–7m | 立在浅海的礁柱，几个变体 | `low-poly sea stacks, tall standing coastal rock pillars rising from the water, layered faceted stone` |
| 悬崖块 | `xy_terrain_cliff.glb` | 6×4×5m | 模块化崖面，可拼海岸 | `a modular low-poly cliff face chunk, stratified rock layers, a grassy flat top, tileable side` |
| 岩穴洞口 | `xy_terrain_cave.glb` | 5×4m | 探索点/彩蛋入口 | `a low-poly sea cave entrance in a rock face, a dark rounded opening, smooth boulders around` |
| 草阶梯田 | `xy_terrain_terrace.glb` | 8×8m | 缓坡台地，放房子/田 | `low-poly grassy terraced hillside steps, soft rounded ledges, gentle slope, retaining stones` |
| 石阶 | `xy_terrain_stairs.glb` | 1 段/段 | 可平铺的上坡石阶 | `a low-poly tileable stone stair segment going up a slope, worn steps, mossy edges` |
| 浮空小岛 | `xy_terrain_isle.glb` | Ø 6m | 背景远景小浮岛（迷你版主岛） | `a tiny floating low-poly islet, grassy top with one tree, a rocky bottom tapering to a point` |

---

## §C · 海滩 Beach Kit 〔P1〕

> 现有海湾 cove 已有遮阳伞/浴巾/贝壳；这里补**潮间带生活感**。小件多 → **走 `InstancedMesh`**（≤ 200 面），躺椅/凉棚少量 → `GltfProp`。

| 物件 | 文件名 | 真实尺寸 | 关键点 | Prompt 核心 (EN) |
|---|---|---|---|---|
| 潮池 | `xy_beach_tidepool.glb` | 1.5m | 礁石坑 + 一汪发光浅水(`Emissive_Water`) + 小海星 | `a low-poly rocky tide pool, a small pool of glowing clear water in faceted rocks, a tiny starfish` |
| 海星 | `xy_beach_starfish.glb` | 0.25m | 实例化点缀，珊瑚橙/粉 | `a cute low-poly starfish, five soft rounded arms, coral-orange, gentle bumps` |
| 浮木 | `xy_beach_driftwood.glb` | 2m | 漂白枯木，半埋沙 | `a low-poly piece of bleached driftwood, a smooth weathered branch half-buried in sand` |
| 沙堡 | `xy_beach_sandcastle.glb` | 0.6m | 童趣小沙堡 + 小旗 | `a cute little low-poly sandcastle with towers and a tiny flag, smooth molded sand` |
| 珊瑚 | `xy_beach_coral.glb` | 0.5m | 鹿角/脑珊瑚，柔粉青 | `a low-poly decorative coral cluster, soft pastel pink and teal branches, rounded forms` |
| 沙滩躺椅 | `xy_beach_deckchair.glb` | 1.6m | 木框条纹布躺椅 | `a low-poly wooden beach deck chair with striped fabric, relaxed reclined angle` |
| 冲浪板 | `xy_beach_surfboard.glb` | 1.8m | 插沙/斜靠，亮色条纹 | `a low-poly surfboard standing in the sand, bright pastel stripe, a single fin` |
| 茅草凉棚 | `xy_beach_tikihut.glb` | 3m | 棕榈茅草遮阳棚（4 柱 + 草顶） | `a low-poly thatched beach shade hut, four wooden posts and a palm-thatch roof, open sides` |
| 沙丘草 | `xy_beach_dunegrass.glb` | 0.6m | 实例化海滨草丛 | `a low-poly clump of beach dune grass, slim pale-green blades` |
| 沙滩球 | `xy_beach_ball.glb` | 0.4m | 彩色充气球，趣味点缀 | `a low-poly colorful beach ball, simple bright color panels` |

---

## §D · 海水 Sea Water Kit 〔P1〕

> 海面本体是 shader（`RippleWater`），不做整片海。这里做**风格化的水「件」**：浪、沫、浅滩面，叠在 shader 海面上增加体积感与卡通味。
> 技术要点：toon 水 = **半透明低面片 + 独立泡沫几何**；材质走 `Emissive_Water/Emissive_Foam` 以便 `EmotionTint` 按情绪改色（现有项目就是按情绪 tint 水色的）。多数件**实例化**沿岸摆。

| 物件 | 文件名 | 真实尺寸 | 关键点 | Prompt 核心 (EN) |
|---|---|---|---|---|
| 浪头 / 浪花 | `xy_water_wave.glb` | 2–3m | 卷曲浪 + 顶沿白沫，沿岸实例化 | `a stylized low-poly curling ocean wave with a white foam crest, smooth translucent teal water` |
| 泡沫带 | `xy_water_foam.glb` | 1.5m | 海岸线碎沫片，可平铺 | `a low-poly sea foam patch, soft irregular white bubbly edge, flat and tileable` |
| 水花 | `xy_water_splash.glb` | 1m | 定格水花（拍岩/跃出用） | `a stylized frozen low-poly water splash, a few rounded droplets and a foamy burst` |
| 浅滩水面块 | `xy_water_surface.glb` | 4×4m | 半透发光浅水面，可情绪 tint | `a low-poly translucent shallow-water surface tile with faint glow, soft faceted ripples` |
| 瀑布带 | `xy_water_fall.glb` | 高 3m | 模块化瀑布（配 §B 崖/拱） | `a stylized low-poly waterfall ribbon, vertical streaks of translucent water with foam at base` |
| 涟漪环 | `xy_water_ring.glb` | 1m | 圆涟漪片（脚步/落物用） | `a low-poly water ripple ring, a flat thin expanding circle of foam` |

---

## §E · 岛上设施 Island Life Kit 〔P2〕

> 让岛「有人住、有故事」的结构件。多与玩法/治愈主题挂钩（凉亭歇脚、风铃许愿、吊床放松）。推荐管线 A。

| 物件 | 文件名 | 真实尺寸 | 关键点 / 命名 | Prompt 核心 (EN) |
|---|---|---|---|---|
| 水井 | `xy_isle_well.glb` | 1.5m | 石井圈 + 木架 + 吊桶 | `a cute low-poly stone village well, round stone rim, a wooden roof frame and a hanging bucket` |
| 木拱桥 | `xy_isle_bridge.glb` | 长 6m | 拱形步桥（比主岛平板桥更精） | `a low-poly arched wooden footbridge with railings, gentle curve, warm planks` |
| 八角凉亭 | `xy_isle_gazebo.glb` | Ø 4m | 歇脚亭，可坐 | `a low-poly octagonal garden gazebo / pavilion, open wooden posts, a pointed shingled roof, a bench inside` |
| 秋千 | `xy_isle_swing.glb` | 2.5m | 木架吊椅秋千 | `a low-poly wooden swing on an A-frame, a plank seat on two ropes` |
| 吊床 | `xy_isle_hammock.glb` | 3m | 两柱/两树间吊床（原点几何中心） | `a low-poly hammock slung between two posts, gentle fabric sag, relaxing` |
| 花架拱门 | `xy_isle_pergola.glb` | 2.5m | 藤蔓花拱（庭院/路口入口） | `a low-poly garden flower arch / pergola, a curved trellis covered in climbing pastel blossoms` |
| 风铃架 | `xy_isle_windchime.glb` | 2m | 木架挂风铃/许愿牌（接「心愿」玩法） | `a low-poly wooden wind-chime stand hung with small chimes and wish tags, gentle and airy` |
| 帐篷 | `xy_isle_tent.glb` | 2.5m | 露营小帐 + 篝火位（配现有 bonfire） | `a low-poly camping tent, simple A-frame canvas, a small mat in front, cozy outdoor vibe` |
| 市集棚 | `xy_isle_stall.glb` | 2.5m | 集市摊（布顶 + 货架），节日感 | `a low-poly market stall with a striped canopy roof, a wooden display counter with goods` |
| 汀步石 | `xy_isle_steppingstones.glb` | 1 段 | 过水踏石，可平铺 | `low-poly flat stepping stones across shallow water, smooth rounded slabs` |
| 瞭望木塔 | `xy_isle_lookout.glb` | 高 6m | 木瞭望台（探索高点/取景） | `a low-poly wooden lookout tower, a ladder and a small railed platform on stilts` |

---

## §F · 下一步：如何去 Blender 制作（落地流程）

### F.0 连接（已就绪）
- Blender MCP **已在线**（端口 9876 监听中），可直接用 `mcp__blender__execute_blender_code` / `get_viewport_screenshot` 开建。
- 若以后端口没起：按 [[xinyu-blender-asset-pipeline]] 的 hands-free 流程——写 `/tmp/xy_start_mcp.py`(enable addon + 定时器内 `start_server`) → `open -na /Applications/Blender.app --args --python /tmp/xy_start_mcp.py` → 轮询 `lsof -nP -iTCP:9876 -sTCP:LISTEN`。

### F.1 脚本骨架（复用现有工艺）
- 新建 3 个确定性 bpy 脚本：`blender/xy_houses.py` · `blender/xy_coast.py`（含地形/海滩/海水）· `blender/xy_island_life.py`。
- **直接复制** [`xy_island_home.py`](blender/xy_island_home.py) / [`xy_background.py`](blender/xy_background.py) 里的 helper：`s2l/hexc/mat/newobj/ball/cyl/cone/dome/gem/octa/addg/place/add_ball/add_prism`；房子主体用 **box/cyl + 坡顶** 拼，曲面 `smooth=True`，平面 `flat`（toon）。
- 每个资产一个 `build_xxx()` → 末尾 `export("xy_house_cottage.glb", "<根节点名>")`；固定 `random.seed`；`export_yup=True`、`export_apply=True`。

### F.2 规范自检（每个导出前）
- 原点：落地件底面中心、漂浮/水件几何中心；门面/正脸朝 +Y。
- 发光件材质名含 `Emissive_*`；房子分槽 `Wall/Roof/Wood/Door/Trim`；底色用浅/中性（留给情绪改色）。
- 面数：hero 房 ≤ 2k、kit 件 ≤ 800、实例化件（海星/沙丘草/泡沫）≤ 200。
- `get_viewport_screenshot` 逐个肉眼验收造型 + 朝向。

### F.3 接入游戏（前端）
1. glb 落 `frontend/public/models/`。
2. [`ExploreMode.tsx`](frontend/src/components/ExploreMode.tsx)：加进 `MODELS` 表 + `useGLTF.preload`，用现成 `GltfProp` + `toonifyScene` 渲染（`Emissive_*` 自动发光、可 `tint` 情绪色）。
3. 房子在 `Town` 沿街摆位（注意 +Y→−Z，门面对路则转 180°）；海滩/海水件在 cove 与海岸线摆（小件改 `InstancedMesh`）；地形件做远景剪影。
4. 验证：`tsc -b && vite build` 通过 + preview 截图确认（rAF 动画类 headless 看不到，需真机）。

### F.4 建议批次顺序
1. **Batch 5 房子**（§A）— ROI 最高，立刻让岛「有人住」。
2. **Batch 6 海岸**（§B+§C+§D）— 海蚀拱门/浪花/潮池最出片。
3. **Batch 7 岛上设施**（§E）— 凉亭/风铃/吊床绑治愈玩法。

---

_本设计稿基于 `feat/audio-music-and-assets` 分支扫描生成，承接主清单 Batch 1–4。风格/命名/接线全部对齐现有 47 个 glb 工艺。_
