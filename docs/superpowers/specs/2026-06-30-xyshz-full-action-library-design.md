# XYSHZ Full Action Library Design

## Brief

用户确认选择 C 方向：为新主角 `xyshz` 做完整自然动作库。目标是让主角的每个常用动作都由 GLB 骨骼动画 clip 承担，前端只负责动作选择、淡入淡出和道具/音效同步，避免继续用程序硬摆骨骼导致僵硬、侧歪或动作不连贯。

## Current Read

- `xyshz_rigged.glb` 当前已有 `Idle`、`WalkLoop`、`RunLoop`，移动方向和长按跑步已可用。
- `GltfHero` 当前只播放 `Idle`、`WalkLoop`、`RunLoop`，其他状态仍落回 `Idle` 或外层 `Player` 的整体反馈。
- `Jump`、`Wave`、`Flute`、`Sit`、拾取欢呼等动作没有专属 `xyshz` GLB clip，因此容易出现硬切、手臂不自然、身体像整体被推拉的问题。
- 之前用户明确要求“写动作时要查看建模，不要乱写”，因此本轮继续以 `xyshz.glb` 的模型比例、朝向和骨架为依据，不使用脱离模型结构的夸张姿势。

## Terms

| Term | Meaning |
|---|---|
| GLB clip | GLB 文件里的命名骨骼动画片段，例如 `WalkLoop`。游戏播放 clip，比运行时临时改骨骼更稳定。 |
| NLA track | Blender 里用于导出多个独立动作片段的动画轨道。每个轨道对应一个 GLB clip。 |
| Fade | 动作切换时的淡入淡出混合，避免从站立瞬间跳到举手或坐下。 |
| Loop | 循环播放动作，适合待机、走路、跑步、坐姿呼吸等持续状态。 |

## Goals

- 为 `xyshz_rigged.glb` 增加完整主角动作库：`Idle`、`WalkLoop`、`RunLoop`、`Jump`、`Wave`、`Flute`、`Sit`、`Cheer`。
- 所有动作都保持人物朝向、腿脚方向和身体重心自然，不再侧着走、不外八乱摆、不像木偶直棍。
- 前端 `GltfHero` 统一播放这些 GLB clip，并按动作类型设置循环、淡入淡出和播放速度。
- 外层 `Player` 对 `xyshz` 不再对腿、脚、手臂做程序化骨骼硬摆，只保留位置、朝向、碰撞、道具、音效和必要的整体反馈。
- 测试覆盖每个 clip 的存在、关键骨骼运动、动作轴向、动作切换路由和构建稳定性。

## Non-Goals

- 不重新建模，不更换 `xyshz.glb` 的角色外观。
- 不引入 Mixamo 或在线动画依赖；本轮继续用本地 Blender 脚本生成并导出。
- 不重写整套玩家移动、碰撞、相机或地图系统。
- 不把旧守护者、Pocoyo、Avatar 的动作系统一并重构。

## Action Library

| Clip | Playback | Naturalness Target |
|---|---|---|
| `Idle` | Loop | 呼吸、轻微重心移动、头肩和披风小幅呼应，避免完全静止。 |
| `WalkLoop` | Loop | 步幅适中，对侧摆臂，脚沿模型前后方向运动，侧向摆动保持窄。 |
| `RunLoop` | Loop | 长按后进入跑步，周期更短、步幅更大、手臂更积极，但不夸张外甩。 |
| `Jump` | Once | 起跳预备、腾空收腿、落地缓冲，前后衔接回 `Idle` 或移动动作。 |
| `Wave` | Once | 举手有缓入，主要由小臂/手腕挥动，另一只手自然平衡，结束回站姿。 |
| `Flute` | Once or short loop | 双手持笛到嘴前，身体随呼吸轻摆，手指有细微颤动，道具与动作同步显示。 |
| `Sit` | Loop | 久站后坐下并保持坐姿呼吸，腿和手臂落位不对称但稳定，起身能回 `Idle`。 |
| `Cheer` | Once | 拾取心愿时短促欢呼，双手上举、身体轻跳，持续时间短，不打断移动太久。 |

## Frontend Behavior

- `selectCharacterAction` 增加或保留所有 clip 名称，并按优先级选择动作：空中 `Jump` 优先，其次 `Cheer`、`Flute`、`Wave`、`Sit`、`RunLoop`、`WalkLoop`、`Idle`。
- `GltfHero` 从白名单播放扩展为完整动作表；未知动作回退 `Idle`。
- `WalkLoop`、`RunLoop`、`Idle`、`Sit` 使用循环；`Jump`、`Wave`、`Flute`、`Cheer` 使用单次播放或短循环后回到当前基础状态。
- 动作切换使用 per-action fade：移动动作略长，手势和跳跃略短，避免硬切。
- `xyshz` 使用 GLB 动作时，外层程序化四肢动画不再作用到它，避免两个系统同时控制同一骨骼。

## Blender Export Behavior

- 扩展 `blender/xyshz_rigged_walk.py`，在同一骨架上导出所有 NLA tracks。
- 继续使用模型实际包围盒和骨骼位置，不改源模型朝向假设。
- `WalkLoop` 和 `RunLoop` 保持 BVH retargeting 作为基础。
- `Jump`、`Wave`、`Flute`、`Sit`、`Cheer` 使用手工关键帧，但每个动作至少包含缓入、峰值、缓出三个阶段。
- 所有动作结束帧应接近可自然混合的站姿或循环首帧，降低前端切换压力。

## Testing

- GLB 结构测试：必须导出 `Idle`、`WalkLoop`、`RunLoop`、`Jump`、`Wave`、`Flute`、`Sit`、`Cheer`。
- 运动范围测试：每个动作关键骨骼有可见运动，但不超过保守阈值，避免披风、腿、手严重穿插。
- 轴向测试：走路和跑步脚、手仍以前后方向为主，侧向摆动保持窄。
- 路由测试：前端能把跳跃、招手、吹笛、坐下、欢呼、走路、跑步分别路由到对应 GLB clip。
- 集成测试：`xyshz` 的 GLB 动作启用时，外层程序化四肢动画不会再叠加到它。
- 回归验证：`npm test`、`npm run build`、浏览器预览检查关键动作。

## Risks

- 手工关键帧可能自然度不如专业动作捕捉，需通过浏览器预览迭代。
- `Flute` 涉及道具位置，动作和笛子显示需要同步，否则会出现手在吹、笛子没对上的问题。
- `Sit` 和移动状态切换容易产生脚底滑动，需要用 fade 和状态优先级限制。
- 当前工作区存在大量其它未提交改动，实现和提交时必须只暂存本轮相关文件。

## Acceptance

- 浏览器预览中，主角每个常用动作都能看出缓入缓出，不再像硬切或僵硬摆骨。
- 游戏内短按移动是走路，长按移动是跑步，跳跃、招手、吹笛、久站坐下、拾取欢呼都有对应主角动画。
- `xyshz_rigged.glb` 内完整动作库可由测试读取并验证。
- `npm test` 和 `npm run build` 通过。
