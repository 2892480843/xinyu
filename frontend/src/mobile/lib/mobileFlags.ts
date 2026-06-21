import type { ReflectResponse } from "../../lib/api";

// 与桌面 Home.tsx:78-85 同源。不能改 Home，故移动端复制一份——
// ⚠️ 若 Home 的呼吸触发规则变了，这里要同步。
export const BREATHING_EMOTIONS = new Set(["anxious", "sad", "angry", "helpless"]);
export const BREATHING_INTENSITY = 0.7;

// 高强度负面情绪 + 未触发安全硬阻断时，先邀请一次潮汐呼吸再继续叙事。
export function shouldOfferBreathing(res: ReflectResponse): boolean {
  if (res.safety?.triggered) return false;
  if (!BREATHING_EMOTIONS.has(res.emotion)) return false;
  return res.intensity >= BREATHING_INTENSITY;
}
