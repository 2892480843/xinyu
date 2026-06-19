# 心屿 · Blender 素材制作清单 & 提示词

> 面向「心屿 AI 情感陪伴叙事游戏」的 3D 美术素材生产手册。
> 当前项目所有 3D 物件均为**程序化几何**（three.js 原始几何拼搭），无任何 `.glb/.gltf` 文件。
> 本清单用于：把高价值物件升级为 Blender 制作的 low-poly toon 模型，导出 `.glb` 放入
> `frontend/public/models/`，再用 drei `useGLTF` 载入、套用 `MeshToonMaterial` + `Outlines`。

---

## 0. 美术风格基准（Style Bible —— 所有提示词共用）

心屿的统一视觉语言（从 `sceneMap.ts` / `Island3D.tsx` / `ExploreMode.tsx` 提取）：

- **风格**：低多边形 low-poly + 卡通平涂 cel-shaded（`MeshToonMaterial` + 3 段 `gradientMap` + drei `Outlines` 描边）。
- **气质**：治愈、柔软、温暖、轻盈、克制；「深海玻璃」海玻璃质感；Q 版可爱。
- **造型**：简洁圆润、面数低、倒角柔和、无高频细节、无写实污渍。
- **情绪驱动配色**：场景颜色随玩家情绪在 8 套调色板间 lerp，所以模型**尽量用浅色/中性底色 + 可被代码 `.color.set()` 改写的主材质**，不要烤死高饱和颜色。

### 通用正向提示词（每条 text-to-3D 末尾追加）
```
low-poly, stylized, cel-shaded toon look, flat clean color blocks, soft matte materials,
gentle pastel healing-game art style, smooth simple rounded forms, subtle soft bevels,
game-ready single asset, clean low quad topology, soft neutral lighting,
isolated on plain transparent background, centered, upright, no ground plane
```

### 通用负向提示词
```
no photoreal PBR, no realistic grime or rust, no high-frequency surface noise,
no text, no logos, no watermark, not scary, no gore, no busy clutter, no human-realistic skin
```

### 核心色板（hex，供材质参考）
| 用途 | 颜色 |
|---|---|
| 海玻璃青 sea-glass | `#6fd3c4` · `#2fa6b8` · `#bdf3f7` |
| 暖金 happy | `#f5c86b` · `#ffe9a8` · `#fff3b0` |
| 柔薰衣草 lonely | `#cdbae6` · `#b8a9d6` |
| 雾灰 anxious | `#9aa3b2` · `#cbd5e1` |
| 板岩蓝 sad | `#7c9cc4` · `#aeb9d6` |
| 深靛夜 tired/night | `#9fb4f0` · `#162046` |
| 沙滩 tan | `#e3cda0` · `#d8be8f` |
| 岛屿草绿 | `#5fae6b` · `#3f8a52` |

### 技术规范（导出 / 导入约定）
- **格式**：glTF Binary `.glb`（单文件，含网格 + 基础材质）。
- **坐标 / 上方向**：Blender 内 +Z up 建模，导出 glTF 自动转 three.js 的 +Y up。
- **原点 pivot**：落地物件原点放在**底面中心**（直接 `position.y = groundHeight`）；漂浮物件（心愿之光、漂流瓶）原点放在**几何中心**。
- **朝向**：角色 / 有正面的物件正脸朝 **+Y（Blender）→ 游戏内 +Z**，与现有 `CharacterModel`（脸朝 local +z）一致。
- **缩放**：按下表「真实比例(m)」建模，游戏内再统一缩放；岛屿 `WALK_RADIUS≈177`，丘陵 `HILLS=15`，角色身高约 2.2 游戏单位。
- **面数**：hero 物件 ≤ 6k 三角面；kit 小物件 ≤ 800 面；批量实例化物件（草/花/贝壳）≤ 200 面。
- **命名**：`xy_<category>_<name>.glb`，例如 `xy_landmark_lighthouse.glb`。

### 生成方式选择（Blender MCP 三条管线）
| 管线 | 工具 | 适合 | 备注 |
|---|---|---|---|
| **A. 程序化脚本** | `execute_blender_code`（Python/bpy） | 规整 low-poly（灯塔/风车/鸟居/长椅/路灯/箱子/几何收集物） | 免费、确定性、最贴合现有 toon 风格，**首选** |
| **B. Hyper3D Rodin** | `generate_hyper3d_model_via_text` / `_via_images` | 有机体 / 角色 / 鲸鱼 / 复杂地标 | 需额度；产物偏精细，导入后需减面+套 toon 材质 |
| **C. 资源下载** | `download_polyhaven_asset` / `download_sketchfab_model` | HDRI 环境光、现成 CC 模型 | 仅作补充；注意版权(CC) |

> ⚠️ **不要**抓取任何商业游戏的专有素材；角色/动作如需现成资源走 VRoid / Mixamo / Quaternius（CC0）。

---

## 1. P0 · 地标 Hero Landmarks（定义海岛剪影，视觉 ROI 最高）

> 推荐管线 **A 程序化**（toon 风格最稳）。每条同时给出可用于 **B Hyper3D** 的英文 prompt。

### 1.1 心屿灯塔 Lighthouse `xy_landmark_lighthouse.glb`
- **用途**：岛屿主地标，呼应叙事中反复出现的「灯塔」意象（`FEATURE_META.lighthouse`）；夜间塔顶发光。
- **真实比例**：高 ≈ 18m，塔基直径 ≈ 4m。原点底面中心。
- **面数**：≤ 4k。
- **材质**：塔身奶白 `#f4f1ec` + 红白螺旋带或海玻璃青带；灯室金属深色；**灯光部分单独材质**（命名 `Emissive_Lamp`）便于代码加 `emissive`。
- **Prompt (EN)**：
```
A cute stylized low-poly lighthouse for a healing island game. Tapered cylindrical
white tower with two soft color bands, a small railed gallery near the top, a glass
lantern room with a warm glowing light, a rounded conical roof with a tiny finial.
Gentle, friendly proportions, slightly chunky. <通用正向提示词>
```

### 1.2 风车 Windmill `xy_landmark_windmill.glb`
- **用途**：岛屿地标（`Town` 风车），叶片缓慢旋转（旋转在代码里做，模型只需叶片为**独立子物件/命名 `Blades`**，原点在轴心）。
- **真实比例**：塔身高 ≈ 9m，叶展 ≈ 8m。
- **面数**：≤ 2.5k。
- **材质**：石砌/木色塔身 `#cdb89a`；四片帆布叶 `#f3ece0`。
- **Prompt (EN)**：
```
A stylized low-poly Dutch-style windmill, stout tapered round stone-and-wood tower
with a small door and round windows, a pointed cap, and four large simple sail blades
mounted on a front hub (blades as one separate part centered on the hub axis).
Cozy storybook feel. <通用正向提示词>
```

### 1.3 鸟居 Torii Gate `xy_landmark_torii.glb`
- **用途**：主路尽头跨在路上的入口地标（`Town` 鸟居）。
- **真实比例**：宽 ≈ 5m，高 ≈ 4.5m。原点底面中心、左右对称。
- **面数**：≤ 600。
- **材质**：朱红 `#c0473e` 或退色木 `#b56a4f`，顶梁深色。
- **Prompt (EN)**：
```
A simple low-poly Japanese torii gate, two round vertical pillars and two horizontal
top beams, vermilion-red painted wood, clean minimal silhouette, slightly weathered
soft matte finish. <通用正向提示词>
```

### 1.4 小神社 Shrine `xy_landmark_shrine.glb`
- **用途**：岛上地标小神社（`Town` 小神社）。
- **真实比例**：宽 ≈ 3m，高 ≈ 3.2m。
- **面数**：≤ 1.5k。
- **材质**：木色 `#9c6b43` + 屋顶深蓝灰 `#3a4150`。
- **Prompt (EN)**：
```
A tiny cute low-poly shinto shrine hut, raised wooden platform, a single small offering
hall with sloped curved roof, a short staircase, soft wood tones, peaceful and minimal.
<通用正向提示词>
```

### 1.5 木栈桥 Wooden Pier `xy_landmark_pier.glb`
- **用途**：从东岸伸进海里的木栈桥（`Town` 木栈桥），玩家可走。
- **真实比例**：长 ≈ 14m，宽 ≈ 2m，桩高 ≈ 1.5m。原点陆地端中心。
- **面数**：≤ 800。
- **材质**：暖木 `#a9794f`，木板间留缝。
- **Prompt (EN)**：
```
A straight low-poly wooden pier / boardwalk on round pilings extending over water,
weathered warm plank deck with visible board gaps, simple rope-less posts, gentle
storybook style. <通用正向提示词>
```

### 1.6 海边售货机 Vending Machine `xy_landmark_vending.glb`
- **用途**：岛上趣味地标（`Town` 售货机），夜间面板微亮。
- **真实比例**：高 ≈ 1.9m。
- **面数**：≤ 1k。
- **材质**：海玻璃青机身 `#2fa6b8` + 发光面板（命名 `Emissive_Panel`）。
- **Prompt (EN)**：
```
A cute stylized low-poly Japanese drink vending machine, rounded edges, a glowing front
panel with rows of simple bottle shapes, soft teal and cream body, friendly seaside vibe.
<通用正向提示词>
```

### 1.7 小渔船 Fishing Boat `xy_landmark_boat.glb`
- **用途**：停泊东岸的小船（`Town` 小船）。
- **真实比例**：长 ≈ 4.5m。原点船底中心（半浮于水）。
- **面数**：≤ 800。
- **材质**：木色船体 + 一抹暖金/青点缀。
- **Prompt (EN)**：
```
A small cute low-poly wooden rowboat / fishing dinghy, rounded hull, a couple of plank
seats, one short mast or a pair of oars, soft warm wood with a painted color stripe.
<通用正向提示词>
```

### 1.8 观鲸石 + 鲸鱼 Whale Rock & Whale `xy_landmark_whalerock.glb` / `xy_creature_whale.glb`
- **用途**：北岸彩蛋「鲸落之海」（`SecretWhale`）；鲸鱼远海跃出，夜间生物荧光。
- **鲸鱼推荐管线 B（有机体）**；观鲸石走 A。
- **鲸鱼真实比例**：长 ≈ 12m。原点几何中心。面数 ≤ 5k。
- **材质**：鲸身灰蓝 `#5a708a`，腹部浅；夜间加 cyan emissive 斑点（命名 `Emissive_Spots`）。
- **Whale Prompt (EN, Hyper3D)**：
```
A gentle stylized low-poly humpback whale, smooth rounded body, long pectoral fins,
a wide fluke tail, soft slate-blue back and pale belly, friendly closed-eye expression,
simple toon form, mid-arc swimming pose. <通用正向提示词>
```
- **Rock Prompt (EN)**：`A low-poly coastal boulder lookout rock, smooth weathered grey stone, flat top, simple faceted form. <通用正向提示词>`

---

## 2. P0 · 叙事仪式物件 Narrative Artifacts（情感核心，玩家收集/留下）

> 来源：`island_ritual_service.ARTIFACTS` + `FEATURE_META` + 收集玩法。这些是心屿的**灵魂道具**，
> 小而精，建议统一「微微发光 + 半透明海玻璃」基调。多为漂浮物（原点几何中心）。

| 物件 | 文件名 | 真实尺寸 | 关键材质 / 备注 | 英文 Prompt 核心 |
|---|---|---|---|---|
| 心愿之光 | `xy_item_wishlight.glb` | Ø0.4m | 八面体水晶 + 强 emissive，颜色随情绪 | `a glowing faceted octahedron wish-light orb, translucent sea-glass crystal, soft inner glow` |
| 心灵印记 | `xy_item_imprint.glb` | 0.5m | 悬浮发光符文晶石（最新玩法「拾心灵印记」） | `a floating glowing memory rune crystal shard, soft pulsing light, translucent jade` |
| 漂流瓶 | `xy_item_driftbottle.glb` | 0.3m | 玻璃瓶 + 木塞 + 内卷纸条，瓶身透明 | `a small glass drift bottle with a cork and a rolled paper note inside, clear glass` |
| 河灯 / 暖灯 | `xy_item_riverlamp.glb` | 0.35m | 漂浮纸灯，内含暖光（`Emissive_Flame`） | `a floating paper river lantern with a warm candle glow inside, soft lotus base` |
| 纸船 | `xy_item_paperboat.glb` | 0.3m | 折纸小船，纸质平涂 | `a folded origami paper boat, clean creased paper, pastel color` |
| 风筝 | `xy_item_kite.glb` | 0.6m | 菱形风筝 + 长尾飘带 | `a simple diamond kite with a long ribbon tail, bright cheerful paper` |
| 石灯笼 | `xy_item_stonelantern.glb` | 1.2m | 日式石灯笼，灯室发光 | `a stylized stone garden lantern (toro), faceted grey stone, glowing light chamber` |
| 篝火 | `xy_item_bonfire.glb` | 0.8m | 柴堆 + 火焰（火焰独立 `Emissive_Fire`） | `a small low-poly campfire, stacked logs and stones with stylized flame, warm glow` |
| 心境石 / 石堆 | `xy_item_cairn.glb` | 0.6m | 叠石 cairn，刻一个柔和符号 | `a small balanced stone cairn of stacked smooth pebbles, calm zen feel` |
| 贝壳 | `xy_item_shell.glb` | 0.15m | 扇贝/海螺，珠光 | `a cute low-poly scallop seashell, soft pearly pink and cream` |
| 夜来香 | `xy_item_nightflower.glb` | 0.3m | 夜间开放发光小花 | `a small night-blooming flower with faintly glowing petals, gentle pastel` |
| 羽毛 | `xy_item_feather.glb` | 0.4m | 单根柔软羽毛 | `a single soft stylized feather, gentle curve, pale pastel` |
| 叶笺 | `xy_item_leafnote.glb` | 0.25m | 写字的叶片 | `a leaf with a tiny note, soft green, simple veins` |
| 烛火 | `xy_item_candle.glb` | 0.3m | 蜡烛 + 火苗 | `a small lit candle with a soft flame, warm glow` |

> 这一组数量多但都极简，**强烈建议用管线 A 程序化批量生成**（我写 bpy 脚本一次性产出，风格统一）。

---

## 3. P1 · 角色 Characters

### 3.1 主角 Q 版小人（捏人 base mesh）`xy_char_avatar.glb`
- **用途**：替换/升级现有程序化 `CharacterModel`（大头 chibi + 眼睛 + 腮红 + 短臂 + 腿）。
- **要求**：**T-pose**、分件命名（`Head/Body/ArmL/ArmR/LegL/LegR/Hair/Hat`）便于换装与摆动绑定；脸朝 +Y(Blender)。
- **材质分槽**：`Skin / Hair / Shirt / Pants / Hat`（对应 `Avatar` 五个可换色字段，代码 `.color.set()`）。
- **真实比例**：身高 ≈ 1.1m（chibi 2.5 头身）。原点脚底中心。
- **推荐管线**：B Hyper3D 出基模 → 减面 → 重命名分槽；或继续程序化（现有已可用）。
- **Prompt (EN)**：
```
A cute chibi character base mesh for a cozy game, 2.5 heads tall, big round head,
large simple eyes with pink cheek blush, tiny nose, short stubby arms with mitten hands,
simple legs, soft rounded body, smooth toon shading, neutral T-pose, symmetrical,
separate hair cap, flat color blocks (skin / hair / shirt / pants). <通用正向提示词>
```

### 3.2 陪伴精灵 / 小灵兽 Companion Creature `xy_char_companion.glb`
- **用途**：心屿是「情感陪伴」叙事——一个跟随玩家的治愈小精灵会极大强化主题（当前缺失，**高建议新增**）。
- **形态建议**：一团会飘浮的海玻璃光精灵 / 圆滚滚小水母 / 小狐狸，微微发光。
- **真实比例**：≈ 0.5m。原点几何中心。推荐管线 B。
- **Prompt (EN)**：
```
A small cute floating companion spirit for a healing game, a soft translucent sea-glass
wisp creature with a glowing core, big gentle eyes, tiny rounded body, a wispy tail,
calm friendly expression, pastel teal and cream, faint inner light. <通用正向提示词>
```

### 3.3 草帽 Straw Hat（配件）`xy_acc_strawhat.glb`
- 现有角色已有可选草帽；做一个精模配件。≈ 0.4m。`A cute low-poly straw sun hat, woven tan straw, soft brim. <通用正向提示词>`

---

## 4. P1 · 自然 Kit（模块化 low-poly，批量复用 / 实例化）

> 推荐管线 **A 程序化**，一套脚本批量出。每个共用 §0 风格基准 + 草绿/沙/海玻璃色板。

| 物件 | 文件名 | 真实尺寸 | Prompt 核心 |
|---|---|---|---|
| 阔叶树（双层冠） | `xy_nat_tree_broadleaf.glb` | 4m | `low-poly broadleaf tree, chunky rounded two-layer canopy in two greens, short trunk` |
| 针叶树 | `xy_nat_tree_pine.glb` | 5m | `low-poly conifer pine, stacked cone tiers, slim trunk, cool green` |
| 礁石 / 卵石 | `xy_nat_rock.glb` ×3 | 0.5–2m | `low-poly faceted boulder, smooth grey stone, a few size variants` |
| 蘑菇 | `xy_nat_mushroom.glb` | 0.3m | `cute low-poly mushroom, cream stem and red/tan domed cap with spots` |
| 灌木 | `xy_nat_bush.glb` | 0.8m | `low-poly rounded shrub bush, clustered leafy blobs, soft green` |
| 花丛（两色） | `xy_nat_flowers.glb` | 0.3m | `small low-poly flower cluster, bright pastel petals on thin stems` |
| 荷叶 + 荷花 | `xy_nat_lotus.glb` | 0.5m | `low-poly lily pad with a pink lotus bloom, calm pond plant` |
| 芦苇 | `xy_nat_reed.glb` | 1.2m | `low-poly cattail reeds, slim blades and brown tips` |
| 棕榈 / 椰树（海滩） | `xy_nat_palm.glb` | 5m | `low-poly palm tree, curved trunk, fan fronds, beach vibe` |

---

## 5. P2 · 小镇道具 Town Props（实例化点缀）

> 推荐管线 **A 程序化**。批量出，统一暖木 + 海玻璃青点缀。

| 物件 | 文件名 | 尺寸 | Prompt 核心 |
|---|---|---|---|
| 长椅 | `xy_town_bench.glb` | 1.6m | `low-poly wooden park bench, slatted seat and back` |
| 邮筒 | `xy_town_mailbox.glb` | 1.1m | `cute low-poly post mailbox, rounded top, teal/red` |
| 路牌 | `xy_town_signpost.glb` | 1.8m | `low-poly wooden directional signpost with blank arrow boards` |
| 灯柱 / 路灯 | `xy_town_lamppost.glb` | 3m | `low-poly vintage street lamp post, glowing lantern head (Emissive)` |
| 木栅栏 | `xy_town_fence.glb` | 1m/段 | `low-poly wooden picket fence segment, tileable` |
| 木箱堆 | `xy_town_crates.glb` | 1m | `stack of low-poly wooden crates, simple planks` |
| 遮阳伞 | `xy_town_parasol.glb` | 2.4m | `low-poly beach parasol umbrella, striped canopy` |
| 沙滩浴巾 | `xy_town_towel.glb` | 1.6m | `low-poly beach towel laid flat, simple stripes` |
| 干草垛 | `xy_town_haystack.glb` | 1.4m | `low-poly round hay bale, soft golden straw` |
| 浮标 | `xy_town_buoy.glb` | 0.6m | `low-poly floating sea buoy, red-white, gentle bob` |
| 邮筒/售货机... | （见 §1.6） | | |

---

## 6. P2 · 环境光照 HDRI（PolyHaven，可选）

游戏天空是情绪驱动的自定义渐变，HDRI **不做主天空**，仅用于 PBR 反射/补光（若后续给海玻璃材质上反射）。
- 推荐下载（`download_polyhaven_asset`，type=`hdris`，1k/2k）：
  - 晨 dawn：`kloppenheim_06` / `spaichingen_hill`
  - 日 day：`kloofendal_48d_partly_cloudy`
  - 黄昏 dusk：`venice_sunset`
  - 夜 night：`moonless_golf` / `dikhololo_night`

---

## 7. 生产优先级与批次建议

| 批次 | 内容 | 管线 | 价值 |
|---|---|---|---|
| **Batch 1 ✅已完成** | §1 八个地标 + 鲸鱼 + §2 心愿之光/心灵印记/漂流瓶/河灯（13 个 glb） | A 程序化 | 已交付，见文末清单 |
| **Batch 2 ✅已完成** | §2 其余仪式物件(10) + §4 自然 Kit(11) | A 程序化 | 已交付，见下表 |
| **Batch 3 ✅已完成** | §3 主角 base mesh + 陪伴精灵 + 草帽 | A 程序化（Hyper3D 免费额度已用尽） | 强化「陪伴」主题 |
| **Batch 4 ✅已完成** | §5 小镇道具(10) ·（HDRI 暂略，见说明） | A 程序化 | 细节打磨 |

---

## 8. 落地接线（Blender → 游戏）

1. Blender 内按 §0 规范建模/生成 → `File > Export > glTF 2.0 (.glb)`（或 MCP 脚本内 `bpy.ops.export_scene.gltf`）。
2. 导出至 `frontend/public/models/xy_*.glb`。
3. 前端载入（drei）：
   ```tsx
   import { useGLTF } from "@react-three/drei";
   const { scene } = useGLTF("/models/xy_landmark_lighthouse.glb");
   // 套 toon：遍历 scene，把 mesh.material 换成共享 MeshToonMaterial(gradientMap)
   // 发光件：名字含 Emissive_* 的 mesh 设 emissive + emissiveIntensity
   ```
4. 用 `<Outlines>`（drei）或后期描边维持 cel-shaded 一致性。
5. 替换对应程序化组件（`Town` 内地标）/ 新增收集物 prefab，保留情绪驱动 `.color.set()` 接线。

---

**已定方案**：混合管线（规整 low-poly→程序化 bpy 脚本；角色/鲸鱼等有机体→Hyper3D），首批 Batch 1。

---

## ✅ Batch 1 已交付（13 个 glb，共 320KB，位于 `frontend/public/models/`）

全部用程序化 bpy 脚本生成（鲸鱼也用了程序化 low-poly，比 AI 写实体更贴合 toon 风格）。每个原点/朝向按 §0 规范，发光件材质名含 `Emissive_*`，已验证可被 glTF importer 正常加载。

| # | 文件 | 三角面/大小 | 关键点 |
|---|---|---|---|
| 1 | `xy_landmark_lighthouse.glb` | 583 tri / 54KB | 暖光灯室 `Emissive_Lamp`，红白塔身，原点底面中心 |
| 2 | `xy_landmark_windmill.glb` | 28KB | 叶片为独立 `Blades` 节点（游戏内可旋转） |
| 3 | `xy_landmark_torii.glb` | 168v / 18KB | 朱红鸟居，上翘笠木 |
| 4 | `xy_landmark_shrine.glb` | 196v / 24KB | 歇山顶 + 千木/坚鱼木 |
| 5 | `xy_landmark_pier.glb` | 408v / 39KB | 交错木板 + 桩 + 系船柱，原点陆端 |
| 6 | `xy_landmark_vending.glb` | 272v / 30KB | 发光面板 `Emissive_Panel` + 彩色饮料 |
| 7 | `xy_landmark_boat.glb` | 83v / 13KB | bmesh V 形船体 + 桅杆三角帆 |
| 8 | `xy_landmark_whalerock.glb` | 50v / 11KB | 平顶观鲸石 + 苔藓 |
| 9 | `xy_creature_whale.glb` | 534v / 39KB | 双色鲸身 + 喷水 + 夜间 `Emissive_Spots` |
| 10 | `xy_item_wishlight.glb` | 14KB | 海玻璃宝石 `Emissive_Wish` + 内核 |
| 11 | `xy_item_imprint.glb` | 7KB | 玉色记忆晶簇 `Emissive_Imprint` |
| 12 | `xy_item_driftbottle.glb` | 11KB | 玻璃瓶 + 木塞 + 内卷纸条 |
| 13 | `xy_item_riverlamp.glb` | 13KB | 莲花座 + 暖光纸灯 `Emissive_Lamp` |

**接线进度**（[ExploreMode.tsx](frontend/src/components/ExploreMode.tsx)，已验证：glb 全 200、无报错、`tsc -b && vite build` 通过、游戏内截图确认）：
- ✅ 通用加载器 `GltfProp` + `toonifyScene`（克隆 glb → 网格换共享 `MeshToonMaterial`；材质名含 `Emissive` → 发光 StandardMaterial，可 `tint` 成情绪色）+ `MODELS` 表 + `useGLTF.preload`。
- ✅ **全部 13 个 glb 已入场**（验证：均 200、控制台零报错、`tsc -b && vite build` 通过）：
  - `Town` 地标：**灯塔 / 风车 / 鸟居 / 神社 / 售货机 / 小船 / 木栈桥**（木栈桥绕 Y 转 +90° 使 +Z→+X 朝海）
  - `SecretWhale` 彩蛋：**观鲸石 + 鲸鱼**（鲸鱼放进原 `<group ref={whale}>` 保留跃出动画；自带喷水 + 夜间 `Emissive_Spots`）
  - `DriftBottles`：**漂流瓶** ×3
  - `Town` 池塘新增：**河灯** ×3（漂在水面，呼应「放河灯」）
  - `Wishes` 收集物：**心愿之光**（按情绪 `tint`）
- 💡 **心灵印记 `MemoryImprints` 故意保留程序化**——它按情绪取不同形状(星/贝/花/火花/雨滴)，单一晶体会抹掉这个设计。
- ✅ **风车叶片自转**：`GltfProp` 加了 `spin={{ node, speed }}` 可选属性，在 `useFrame` 里对命名子节点 `rotateZ`（绕局部 Z=叶轴）；风车传 `{ node: "Blades", speed: 0.7 }`，已确认节点找到（rAF 驱动，headless 截图看不到转，真机会转）。
- 注：中央 6 地标+心愿已游戏内截图确认；外围/隐藏件(栈桥/鲸鱼/瓶/河灯)受 headless 相机限制未逐一在位取景，比例为最佳估计，进真机若偏差告知即调 `scale`/`position`。

---

## ✅ Batch 2 已交付（21 个 glb，全程序化；总计 34 个、560KB）

**仪式物 §2（10）**：`xy_item_{stonelantern,bonfire,cairn,candle,nightflower,paperboat,kite,feather,leafnote,shell}.glb`
——石灯笼/篝火/心境石/烛火 + 夜来香都自带 `Emissive_*`；纸船/风筝/羽毛/叶笺/贝壳用 bmesh 薄片造型。

**自然 Kit §4（11）**：`xy_nat_{tree_broadleaf,tree_pine,rock_a,rock_b,rock_c,mushroom,bush,flowers,lotus,reed,palm}.glb`
——树/礁石/灌木风格对齐岛上现有程序化植被。

**接线说明**：
- 仪式物 → 同 Batch 1，用 `GltfProp` 接入岛屿仪式系统（`island_ritual_service.ARTIFACTS` 对应 `FEATURE_META`）或作场景点缀。
- ⚠️ **自然 Kit 不要用 GltfProp 逐棵渲染**——探索岛有几百棵树/礁石，是 `InstancedField`(InstancedMesh) 批量绘制。要替换得把 glb 的 geometry 取出来喂给 InstancedMesh（一次 draw call），否则上百个 clone 会拖垮帧率。当前岛上植被程序化版已够用，glb 版属可选升级。

---

## ✅ Batch 3 已交付（3 个 glb；总计 37 个、676KB）

`xy_char_companion.glb`（陪伴精灵：半透海玻璃身 + 发光核 `Emissive_Core` + 大眼/腮红 + 飘尾，脸朝 +Y）、
`xy_char_avatar.glb`（Q版主角 base mesh：大头身、材质槽 `Skin/Hair/Shirt/Pants` 可代码改色，脸朝 +Y）、
`xy_acc_strawhat.glb`（草帽配件）。

> ⚠️ **Hyper3D 免费额度已用尽**（`API_INSUFFICIENT_FUNDS`）——本批改用程序化生成（反而更贴 toon 风）。后续若要用 AI 生成有机体，需在 BlenderMCP 面板填**自己的 Hyper3D key**。

**接线说明**：
- **陪伴精灵**最值得接——做成跟随玩家的小跟班（`useFrame` 里 lerp 到玩家身后 + 上下浮动 + 发光），直接强化「情感陪伴」主题。
- **草帽**可替换现有 `CharacterModel` 的程序化草帽（小升级）。
- ⚠️ **主角 base mesh 不是动画角色的直接替换**：游戏里的玩家是程序化 `CharacterModel`（可换装 + 走路摆腿，腿是独立 ref）。这个 glb 是**静态 base mesh**（各部件已 join 成一体，材质槽可改色但不能摆腿）。要真正换成 glb 角色得做骨骼绑定 + 动画（VRoid/Mixamo 路线），属更大工程。

---

## ✅ Batch 4 已交付（10 个 glb；总计 47 个、808KB）

`xy_town_{bench,mailbox,signpost,lamppost,fence,crate,parasol,towel,haystack,buoy}.glb`
——路灯 `Emissive_Lamp`、浮标 `Emissive_BuoyLight` 自带发光；栅栏为 1m 可平铺段。

> **HDRI 暂略**：心屿的天空是**情绪驱动的自定义渐变**（`skyTex` CanvasTexture），探索场景用 ambient+hemisphere+directional 打光，没有环境贴图。HDRI 只会影响反射/环境光，且可能打乱已调好的光照。若以后要给海玻璃材质上 PBR 反射再加（`download_polyhaven_asset` type=hdris）。

> ⚠️ 小镇道具同自然 Kit：长椅/邮筒/栅栏等岛上**已有程序化版**（部分实例化）。glb 版是可选升级，要换得注意实例化件走 InstancedMesh。

---

## 🔌 接线总览（截至当前）

**已接入游戏（`ExploreMode.tsx`，均验证 200/无报错/构建通过）**：
- Batch 1：7 地标(灯塔/风车/鸟居/神社/售货机/小船/木栈桥) + 鲸鱼彩蛋(观鲸石+鲸鱼) + 心愿之光 + 风车叶片自转。
- Batch 2 仪式物：石灯笼(替换程序化) + 篝火 + 心境石×3 + 贝壳×2 + 夜来香×2 + 风筝(随风摆 `FloatSway`)。
- Batch 3：**陪伴精灵**跟随玩家(`Companion` 组件，`useFrame` lerp 到玩家身边 + 浮动 + 发光 + 保留半透材质)。

**未接（素材已就绪，可按需推进）**：Batch 2 其余仪式物(纸船/羽毛/叶笺/烛火)、Batch 2 自然 Kit、Batch 3 主角 base mesh/草帽、Batch 4 小镇道具。

_本清单基于 `feat/island-imprint-gameplay` 分支扫描生成。Batch 1（13）+ 2（21）+ 3（3）+ 4（10）已完成，共 47 个 glb 于 `frontend/public/models/`。_
