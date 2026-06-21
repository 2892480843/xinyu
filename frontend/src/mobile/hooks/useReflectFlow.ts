import { useCallback, useRef, useState } from "react";
import {
  reflect,
  reflectStream,
  type ReflectResponse,
  type ReflectStreamEvent,
  type AgentTraceItem,
  type IslandState,
  type IslandActResponse,
} from "../../lib/api";
import { type BackendScene } from "../../lib/sceneMap";
import { STREAM_STAGE_TEXT, classifyError, type ErrorVoiceKind } from "../../lib/islandVoice";
import { play as playSfx } from "../../lib/sfx";
import { shouldOfferBreathing } from "../lib/mobileFlags";

export type Phase = "input" | "loading" | "breathing" | "narrative" | "safety";

// 移动端反思闭环编排。与桌面 Home.tsx 的 handleSubmit(366-412)/handleStreamEvent(347-360)/
// reset(421-428)/handleActed(266-276) 同源——只依赖干净的 lib/api，不碰任何 DOM 布局。
// 不能改 Home，故复刻一份；⚠️ Home 的反思流程改了，这里要同步。
export function useReflectFlow(userId: string | null, onReflected?: () => void) {
  const [phase, setPhase] = useState<Phase>("input");
  const [result, setResult] = useState<ReflectResponse | null>(null);
  const [loadingText, setLoadingText] = useState("岛屿在远处望见你了……");
  const [liveAgents, setLiveAgents] = useState<AgentTraceItem[]>([]);
  const [liveScene, setLiveScene] = useState<BackendScene | null>(null);
  const [liveIsland, setLiveIsland] = useState<IslandState | null>(null);
  const [island, setIsland] = useState<IslandState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorVoiceKind>("server");
  const [lastMood, setLastMood] = useState("");
  const [growthBurst, setGrowthBurst] = useState(false);

  // 跟踪当前活跃请求：用户取消 / 再次提交后，忽略旧请求的迟到结果与流事件。
  const activeReqRef = useRef<string | null>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);

  const handleStreamEvent = useCallback((event: ReflectStreamEvent) => {
    setLoadingText((prev) => STREAM_STAGE_TEXT[event.event] ?? prev);
    if (event.event === "agent") {
      setLiveAgents((prev) => {
        const next = prev.filter((a) => a.agent !== event.agent);
        next.push({ agent: event.agent, label: event.label, status: event.status, output: event.output });
        return next;
      });
    } else if (event.event === "scene") {
      setLiveScene(event.scene);
    } else if (event.event === "island_state") {
      setLiveIsland(event.island_state);
    }
  }, []);

  const submit = useCallback(
    async (text: string, ephemeral = false) => {
      if (!userId) return;
      setError(null);
      setResult(null);
      setLiveAgents([]);
      setLiveIsland(null);
      setLiveScene(null);
      setLastMood(text);
      setLoadingText("岛屿在远处望见你了……");
      setPhase("loading");
      // 同一次提交用同一个 request_id：WS 超时回退 HTTP 时后端据此去重，避免重复落库。
      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeReqRef.current = requestId;
      try {
        const res = await reflectStream(
          userId, text, handleStreamEvent, undefined, ephemeral, requestId,
          (cancel) => { cancelStreamRef.current = cancel; },
        );
        if (activeReqRef.current !== requestId) return; // 已取消/被新提交取代：忽略迟到结果
        setResult(res);
        setIsland(res.island_state);
        setPhase(res.safety.triggered ? "safety" : shouldOfferBreathing(res) ? "breathing" : "narrative");
        onReflected?.();
      } catch (e) {
        if (activeReqRef.current !== requestId) return; // 取消导致的 reject：不降级、不报错
        try {
          setLoadingText("海雾起了一会儿，岛屿换一条路过来……");
          const res = await reflect(userId, text, ephemeral, requestId);
          if (activeReqRef.current !== requestId) return;
          setResult(res);
          setIsland(res.island_state);
          setLiveAgents(res.agent_trace); // HTTP 回退时一次性展示导演台
          setPhase(res.safety.triggered ? "safety" : shouldOfferBreathing(res) ? "breathing" : "narrative");
          onReflected?.();
        } catch (fallbackError) {
          if (activeReqRef.current !== requestId) return;
          const err = fallbackError ?? e;
          setError(err instanceof Error ? err.message : "岛屿走神了一下");
          setErrorKind(classifyError(err));
          setPhase("input");
        }
      }
    },
    [userId, handleStreamEvent, onReflected],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setLiveAgents([]);
    setLiveIsland(null);
    setLiveScene(null);
    setPhase("input");
  }, []);

  // 加载途中取消：作废活跃请求（忽略迟到结果）+ 断流 + 回到输入。
  const cancel = useCallback(() => {
    activeReqRef.current = null;
    cancelStreamRef.current?.();
    setPhase("input");
  }, []);

  // 完成一次岛屿仪式：留下物件 → 更新岛屿状态。
  const handleActed = useCallback((acted: IslandActResponse) => {
    setIsland(acted.island_state);
    setResult((prev) => (prev ? { ...prev, island_state: acted.island_state } : prev));
  }, []);

  // 叙事打完最后一字：萌发音 + 岛屿光涌峰值。
  const handleNarrativeDone = useCallback(() => {
    playSfx("bloom");
    setGrowthBurst(true);
    window.setTimeout(() => setGrowthBurst(false), 1900);
  }, []);

  return {
    phase, setPhase,
    result, loadingText,
    liveAgents, liveScene, liveIsland,
    island, setIsland,
    error, errorKind, lastMood, growthBurst,
    submit, reset, cancel, handleActed, handleNarrativeDone,
  };
}
