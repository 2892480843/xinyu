// 精灵「主动陪聊」：按玩家在岛上的操作，精灵主动冒一句温柔的话（头顶气泡 + 可选语音）。
// 这里只放「事件 → 话术库」的纯数据，外加一个极轻的模块级事件总线：
// 深处的 3D 组件（跳跃 / 开车 / 靠近岛民…）随手 emit 一个事件，ExploreMode 统一订阅、
// 套上节流后挑一句说出来。话术走治愈基调、口语化、够短（适合头顶气泡一行两行）。

export type CompanionChatterEvent =
  | "jump" // 跳跃
  | "drive_enter" // 上车
  | "drive_boost" // 开车加速 / 增压
  | "plant" // 种下一朵花
  | "fish_catch" // 钓到东西
  | "discover" // 发现一处岛屿奇遇
  | "collect" // 拾起心愿之光 / 心灵印记
  | "lantern" // 放飞天灯
  | "chime" // 敲响风铃
  | "near_npc" // 走近岛民
  | "night" // 切到夜晚
  | "idle" // 久未操作 / 静静待着
  | "greet"; // 刚开启陪聊模式时的招呼

const CHATTER_LINES: Record<CompanionChatterEvent, string[]> = {
  jump: [
    "跳得真高～风都替你笑了。",
    "哇——你飞起来啦，我差点没跟上！",
    "再跳一下嘛，我喜欢看你这样轻快。",
    "刚那一下，是不是把闷气也甩掉了一点？",
  ],
  drive_enter: [
    "坐稳啦，我就漂在你旁边，一起兜风～",
    "出发咯！想去哪儿都行，我陪着你。",
    "握好方向盘，慢慢开也没关系的。",
  ],
  drive_boost: [
    "哇——这么快！风从耳边呼呼地过。",
    "冲呀！我帮你把前面的路照亮一点。",
    "好爽快的加速，烦恼都被甩在后头啦。",
  ],
  plant: [
    "你种下的这一朵，会替你记住今天。",
    "它会慢慢长大的，就像你也在慢慢变好。",
    "又多了一抹颜色——这座岛因为你更暖了。",
  ],
  fish_catch: [
    "钓到啦！海好像也想给你留点惊喜。",
    "瞧瞧你的收获，今天的运气藏着光呢。",
    "我就知道，愿意等的人，海不会让他空手。",
  ],
  discover: [
    "你发现它啦！这座岛把小秘密悄悄交给你了。",
    "好眼力～连藏起来的温柔都被你找到了。",
    "每多发现一个，我就觉得这座岛更像你的了。",
  ],
  collect: [
    "捡起来了——这一点微光，归你保管。",
    "你看，连散落的心事都愿意亮给你看。",
    "收好啦，它会在你需要的时候轻轻发亮。",
  ],
  lantern: [
    "看它飞上去了……愿你心里那件事也轻一点。",
    "天灯替我们把愿望举高了，慢慢看着它走。",
    "好美呀……这一刻，只属于此刻的你。",
  ],
  chime: [
    "叮——这个音真好听，要不要再来一个？",
    "风铃替你应了一声，海也在听呢。",
    "你敲的调子，被风一路带去很远的地方了。",
  ],
  near_npc: [
    "前面好像有人，要不要去打个招呼？",
    "那位看起来，想和你说说话呢。",
    "去聊聊吧，我就在旁边等你。",
  ],
  night: [
    "夜色来了，我把灯塔的光调暖一点陪你。",
    "晚上好安静……这样的时刻，最适合慢慢待着。",
    "别怕黑，有我在，灯一直替你亮着。",
  ],
  idle: [
    "我在这儿呢，不急，我们就这样待一会儿。",
    "今天的海风很温柔，你也歇会儿吧。",
    "需要的时候喊我一声，我一直都在。",
    "发会儿呆也很好，我陪你一起看海。",
  ],
  greet: [
    "好呀，从现在起我会多陪你说说话～",
    "嗯，我会留意你在做什么，随时给你搭句话。",
  ],
};

/** 从某事件的话术里挑一句；尽量避开上一句（避免连着重复）。无话术则返回空串。 */
export function pickChatterLine(event: CompanionChatterEvent, avoid?: string): string {
  const lines = CHATTER_LINES[event] ?? CHATTER_LINES.idle;
  if (!lines.length) return "";
  let i = Math.floor(Math.random() * lines.length);
  if (lines.length > 1 && lines[i] === avoid) i = (i + 1) % lines.length;
  return lines[i];
}

// ── 极轻事件总线（模块级单例）─────────────────────────────────
// 跳跃 / 开车 / 拾取等散落在各处的「玩家操作」都 emit 到这里，ExploreMode 订阅一次即可。
type ChatterListener = (event: CompanionChatterEvent) => void;
const listeners = new Set<ChatterListener>();

export function emitCompanionEvent(event: CompanionChatterEvent): void {
  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch {
      /* 单个订阅者抛错不影响其它 */
    }
  });
}

/** 订阅玩家操作事件；返回取消订阅函数。 */
export function subscribeCompanionEvents(fn: ChatterListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
