import type { ReflectStreamEvent } from "./api";

export const STREAM_STAGE_TEXT: Record<ReflectStreamEvent["event"], string> = {
  started: "岛屿在远处望见你了……",
  agent: "海上来了几位信使……",
  emotion: "潮水在试着读懂你的心情……",
  scene: "岛屿正在换一片天气……",
  island_state: "岛屿在为这一刻整理它的样子……",
  narrative: "岛屿在挑选要给你的句子……",
  memory: "岛屿把今天收进口袋了……",
  done: "岛屿要带你抵岸了……",
  error: "海雾起了一会儿，岛屿换一条路过来……",
};

export type ErrorVoiceKind = "timeout" | "network" | "server";

export const ERROR_VOICE: Record<ErrorVoiceKind, { title: string; body: string }> = {
  timeout: {
    title: "岛屿这次没接住你的话",
    body: "海风把信号吹散了一阵——要不要再说一次？",
  },
  network: {
    title: "岛屿听不见你了",
    body: "这边的海面断了线——回到岸上看看？",
  },
  server: {
    title: "岛屿走神了一下",
    body: "它好像在和另一个潮汐说话，等一等再来？",
  },
};

export function classifyError(err: unknown): ErrorVoiceKind {
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (m.includes("timeout") || m.includes("abort")) return "timeout";
    if (m.includes("fetch") || m.includes("network") || m.includes("failed")) return "network";
  }
  return "server";
}

export const ISLAND_HINTS = {
  hotkey: "按住 ⌘ 或 Ctrl 回车，把这段话寄到岛上",
  silent: "什么都不说，坐一会儿",
  glyph: "用手写一个字给岛屿",
  voice: "对着海说",
  submit: "说给岛屿",
  reset: "回到岛上",
  retry: "再说一次给岛屿",
  dismiss: "先记在心里",
};
