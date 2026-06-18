# 心屿预设场景图片集

本目录使用本地静态 PNG 作为多模态视觉场景，不依赖外部在线图片链接，也不在运行时调用在线图像生成服务。

当前资源策略：

- 24 张完整预设图：8 种情绪 x 3 个强度档（`low`、`mid`、`high`）。
- 图片由 `frontend/scripts/generate_scene_assets.py` 使用 Pillow 确定性生成，是离线插画式本地资源，不是真实照片，也不是运行时在线生成图片。
- 每张图片尺寸为 `1600 x 1000`，用于 `IslandScene` 的全屏背景。
- 若图片缺失或加载失败，`IslandScene` 会自动回退到原有渐变/SVG 场景。

## palette 与文件

| palette | 文件 |
|---|---|
| `sad_low` | `sad-low-blue-hour.png` |
| `sad_mid` | `sad-mid-slate-blue.png` |
| `sad_high` | `sad-high-midnight-rain.png` |
| `anxious_low` | `anxious-low-morning-haze.png` |
| `anxious_mid` | `anxious-mid-mist-gray.png` |
| `anxious_high` | `anxious-high-pressure-fog.png` |
| `tired_low` | `tired-low-evening-indigo.png` |
| `tired_mid` | `tired-mid-deep-indigo.png` |
| `tired_high` | `tired-high-starry-hush.png` |
| `lonely_low` | `lonely-low-lavender-dawn.png` |
| `lonely_mid` | `lonely-mid-pale-lavender.png` |
| `lonely_high` | `lonely-high-moonlit-shore.png` |
| `calm_low` | `calm-low-soft-aqua-dawn.png` |
| `calm_mid` | `calm-mid-soft-aqua.png` |
| `calm_high` | `calm-high-glass-tide.png` |
| `happy_low` | `happy-low-warm-morning.png` |
| `happy_mid` | `happy-mid-warm-gold.png` |
| `happy_high` | `happy-high-sunburst-gold.png` |
| `angry_low` | `angry-low-crimson-wind.png` |
| `angry_mid` | `angry-mid-deep-crimson.png` |
| `angry_high` | `angry-high-black-storm.png` |
| `helpless_low` | `helpless-low-dim-rain.png` |
| `helpless_mid` | `helpless-mid-dark-slate.png` |
| `helpless_high` | `helpless-high-faint-light.png` |

前端通过 `frontend/src/lib/sceneMap.ts` 的 `image` 字段引用这些文件。

兼容说明：旧 palette 键（如 `slate_blue`、`mist_gray`、`deep_indigo`）仍在前端映射为对应的 `mid` 场景，避免旧接口响应或缓存状态失效。

## 后续 TODO

- 若需要更精细的艺术质量，可用人工绘制或离线批量设计工具替换这些确定性生成插画，但仍保持文件名和 palette 键稳定。
- 若未来决定接入在线图像生成服务，应先明确成本、隐私、缓存和失败回退策略，再修改运行时链路。
