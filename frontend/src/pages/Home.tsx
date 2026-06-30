import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import IslandScene from "../components/IslandScene";
import ErrorBoundary from "../components/ErrorBoundary";
// 真 3D 旗舰皮按需加载——three.js 体积大，不开 3D 的用户绝不付出这份 bundle
const Island3D = lazy(() => import("../components/Island3D"));
// 自由探索模式(可走动小人)——按需加载,和 3D 同属重型 chunk
const importExplore = () => import("../components/ExploreMode");
const ExploreMode = lazy(importExplore);
// 预取:首页空闲、或用户接近「上岛」按钮时，提前把探索 chunk + 地图模型拉进缓存。
// 点下去时远景开场能尽量直接看见完整岛貌；省流量 / 弱网仍跳过空闲预取。
let explorePrefetched = false;
function prefetchExplore() {
  if (explorePrefetched) return;
  explorePrefetched = true;
  // 导入重 chunk → 模块顶层即 preload 近百个非重模型(进岛门所需)；解析后再补缓存灯塔精灵。
  importExplore().then((m) => { try { m.prefetchExploreAssets?.(); } catch { /* ignore */ } });
}
import Particles from "../components/Particles";
import MoodInput from "../components/MoodInput";
import NarrativeCard from "../components/NarrativeCard";
import IslandAssistant from "../components/IslandAssistant";
import MindMap from "../components/MindMap";
import SafetyNotice from "../components/SafetyNotice";
import BreathingRitual from "../components/BreathingRitual";
import { NightWatchBanner, GoodnightScreen } from "../components/NightWatch";
import { useNightWatch } from "../lib/useNightWatch";
import WelcomeBackCard from "../components/WelcomeBackCard";
import IslandWhisper from "../components/IslandWhisper";
import IslandRevision from "../components/IslandRevision";
import SilentMode from "../components/SilentMode";
import GlyphCanvas from "../components/GlyphCanvas";
import LoadingOrb from "../components/LoadingOrb";
import MusicControl from "../components/MusicControl";
import IdentityGate from "../components/IdentityGate";
import UserBadge from "../components/UserBadge";
import AgentDirectorPanel from "../components/AgentDirectorPanel";
import OnboardingArrival from "../components/OnboardingArrival";
import ShortcutsHint from "../components/ShortcutsHint";
import { useEasterEggs } from "../hooks/useEasterEggs";
import { play as playSfx } from "../lib/sfx";
import {
  reflect,
  reflectStream,
  fetchMemories,
  fetchIslandState,
  fetchArtifacts,
  fetchWelcomeBack,
  fetchIslandWhisper,
  fetchIslandRevision,
  deleteIdentity,
  type ReflectResponse,
  type MemoryItem,
  type ReflectStreamEvent,
  type AgentTraceItem,
  type IslandState,
  type ArtifactItem,
  type IslandActResponse,
  type WelcomeBackResponse,
  type WhisperResponse,
  type RevisionResponse,
} from "../lib/api";
import { clearIdentity, loadIdentity, type LocalIdentity } from "../lib/localIdentity";
import { resolveScene, DEFAULT_VISUAL, EMOTION_META, type BackendScene } from "../lib/sceneMap";
import { STREAM_STAGE_TEXT, classifyError, type ErrorVoiceKind } from "../lib/islandVoice";
import IslandHushCard from "../components/IslandHushCard";
import TimeMachine from "../components/TimeMachine";
import IslandMap from "../components/IslandMap";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { useImmersion } from "../hooks/useImmersion";
import { useParallax } from "../hooks/useParallax";
import { useSkin3d } from "../hooks/useSkin3d";

type Phase = "input" | "loading" | "breathing" | "narrative" | "safety";

// 高强度负面情绪 + 未触发安全硬阻断时，先邀请用户做一次潮汐呼吸再继续叙事。
// 安全触发优先：自伤风险直接走 SafetyNotice，不被呼吸打断。
const BREATHING_EMOTIONS = new Set(["anxious", "sad", "angry", "helpless"]);
const BREATHING_INTENSITY = 0.7;

function shouldOfferBreathing(res: ReflectResponse): boolean {
  if (res.safety?.triggered) return false;
  if (!BREATHING_EMOTIONS.has(res.emotion)) return false;
  return res.intensity >= BREATHING_INTENSITY;
}

export default function Home() {
  useKeyboardInset();
  const [identity, setIdentity] = useState<LocalIdentity | null>(() => loadIdentity());
  const [phase, setPhase] = useState<Phase>("input");

  // 深海玻璃：场景纵深视差。阅读叙事/安全/呼吸屏停止漂移；静海/reduced-motion/?flat=1 归零。
  const { immersive } = useImmersion();
  const skin3d = useSkin3d(); // 真 3D 旗舰皮开关（默认关；需 WebGL 支持）
  const sceneTilt = useParallax(
    4,
    immersive && phase !== "narrative" && phase !== "safety" && phase !== "breathing",
  );
  const [result, setResult] = useState<ReflectResponse | null>(null);
  const [lastMood, setLastMood] = useState(""); // 最近一次提交的心情原文（作为多轮对话的种子）
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorVoiceKind>("server");
  const [lastSubmit, setLastSubmit] = useState<{ text: string; ephemeral: boolean } | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memOpen, setMemOpen] = useState(false);
  const [loadingText, setLoadingText] = useState("岛屿在远处望见你了……");

  // 守夜模式：深夜（0-4 点）或 ?nightwatch=1 时压暗场景、给出休息引导
  const nightWatch = useNightWatch();
  const [bedtime, setBedtime] = useState(false);

  // 离岛信件：用户超过 48 小时没回来或 ?missyou=1 时浮现一句温柔短信
  const [welcomeBack, setWelcomeBack] = useState<WelcomeBackResponse | null>(null);

  // 岛屿主动低语：进入岛屿但还没说话时，LLM 主动用 hy3-preview 说一句温柔的话
  const [whisper, setWhisper] = useState<WhisperResponse | null>(null);

  // 岛屿修正信：LLM 回看历史叙事主动承认"那句说得不准确"
  const [revision, setRevision] = useState<RevisionResponse | null>(null);

  // 静默坐岛：用户什么都不输入，岛屿陪坐 30 秒 → 留一枚静默贝壳
  const [silentOpen, setSilentOpen] = useState(false);

  // 写一个字：手写一个心境字 → 岛屿读心 → 留一块心境石
  const [glyphOpen, setGlyphOpen] = useState(false);

  // 时光机·一键回望：把跨天成长压进 20 秒。demo=示范数据，self=回望自己的岛
  const [replayMode, setReplayMode] = useState<null | "demo" | "self">(null);

  // 生长瞬间：叙事落定时一束暖光自岛屿涌起（H4 视听高潮）
  const [growthBurst, setGrowthBurst] = useState(false);

  // 登高望岛：俯瞰式查看自己养成的岛（元素+物件按坐标铺开）
  const [islandMapOpen, setIslandMapOpen] = useState(false);
  // 自由探索：上岛走走，控制小人收集心愿
  const [exploreOpen, setExploreOpen] = useState(false);
  // 首页就绪后空闲时预取「上岛」重 chunk + 模型，等用户点按钮时多半已在缓存里（首屏上岛提速）。
  useEffect(() => {
    // 省流量 / 弱网(2g)下不主动预缓存重资源，避免替用户花流量；改由 hover/点按时按需取。
    const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || /2g/.test(conn?.effectiveType ?? "")) return;
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) { ric(prefetchExplore, { timeout: 3000 }); return; }
    const t = window.setTimeout(prefetchExplore, 1800);
    return () => window.clearTimeout(t);
  }, []);

  // 首次登岛过场：每个 user_id 仅播一次，sessionStorage 防刷新重复
  const [arrival, setArrival] = useState<boolean>(() => {
    const id = loadIdentity()?.user_id;
    if (!id || typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem(`xinyu.arrived.${id}`) !== "1";
  });

  // 彩蛋：快捷键浮层 + 标题连点扫光
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [titleSwept, setTitleSwept] = useState(false);
  const titleTapsRef = useRef<{ count: number; resetAt: number }>({ count: 0, resetAt: 0 });
  const { konamiUnlocked, dismissKonami } = useEasterEggs({
    onSilent: () => identity && setSilentOpen(true),
    onGlyph: () => identity && setGlyphOpen(true),
    onToggleMindMap: () => setMemOpen((v) => !v),
    onShortcutsHelp: () => setShortcutsOpen(true),
  }, !exploreOpen);

  const onTitleTap = () => {
    const now = Date.now();
    if (now - titleTapsRef.current.resetAt > 1200) titleTapsRef.current.count = 0;
    titleTapsRef.current.count += 1;
    titleTapsRef.current.resetAt = now;
    if (titleTapsRef.current.count >= 5) {
      setTitleSwept(true);
      playSfx("ripple");
      window.setTimeout(() => setTitleSwept(false), 2400);
      titleTapsRef.current.count = 0;
    }
  };

  // 当前岛屿状态（回访时展示）与流式过程中的实时状态
  const [island, setIsland] = useState<IslandState | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [liveAgents, setLiveAgents] = useState<AgentTraceItem[]>([]);
  const [liveIsland, setLiveIsland] = useState<IslandState | null>(null);
  const [liveScene, setLiveScene] = useState<BackendScene | null>(null);

  const loadMemories = useCallback(async () => {
    if (!identity) return;
    try {
      setMemories(await fetchMemories(identity.user_id));
    } catch {
      /* 后端未就绪时静默 */
    }
  }, [identity]);

  useEffect(() => {
    if (!identity) {
      return;
    }
    // 运行时切换身份（非首挂载）时重新触发抵岸过场：arrival 已在 useState 初始化器里按
    // sessionStorage 设好首挂载值，这里只处理 identity 变化。同值 setState 会被 React bail-out，
    // 不构成有害的级联渲染，故就地 setState 是此场景下的合理写法。
    try {
      if (sessionStorage.getItem(`xinyu.arrived.${identity.user_id}`) !== "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 见上：身份变化时的有意重置
        setArrival(true);
      }
    } catch { /* sessionStorage 不可用 */ }
    let cancelled = false;
    fetchMemories(identity.user_id)
      .then((items) => {
        if (!cancelled) setMemories(items);
      })
      .catch(() => {
        /* 后端未就绪时静默 */
      });
    fetchIslandState(identity.user_id)
      .then((state) => {
        if (!cancelled) setIsland(state);
      })
      .catch(() => {
        /* 后端未就绪时静默 */
      });
    fetchArtifacts(identity.user_id)
      .then((items) => {
        if (!cancelled) setArtifacts(items);
      })
      .catch(() => {
        /* 后端未就绪时静默 */
      });
    // 离岛信件：拉一次，决定是否在 input 阶段顶部静静浮现一句岛屿留言
    const params = new URLSearchParams(window.location.search);
    const forceMissYou = params.get("missyou") === "1";
    fetchWelcomeBack(identity.user_id, forceMissYou).then((res) => {
      if (!cancelled && res?.show) setWelcomeBack(res);
    });
    // 岛屿主动低语：让 LLM 基于历史主动说一句话；无历史/失败时静默
    fetchIslandWhisper(identity.user_id).then((res) => {
      if (!cancelled && res?.show) setWhisper(res);
    });
    // 岛屿修正信：LLM 回看历史，自我承认"那句说得不准确"
    const forceRevision = params.get("revision") === "1";
    fetchIslandRevision(identity.user_id, forceRevision).then((res) => {
      if (!cancelled && res?.show) setRevision(res);
    });
    // 演示开关：?silent=1 / ?glyph=1 / ?replay=1 直接进入对应模式。延后到下一帧绕开 set-state-in-effect 规则
    const wantSilent = params.get("silent") === "1";
    const wantGlyph = params.get("glyph") === "1";
    const wantReplay = params.get("replay") === "1";
    const wantIsland = params.get("island") === "1";
    if (wantSilent || wantGlyph || wantReplay || wantIsland) {
      const t = window.setTimeout(() => {
        if (cancelled) return;
        if (wantGlyph) setGlyphOpen(true);
        else if (wantSilent) setSilentOpen(true);
        if (wantReplay) setReplayMode("demo");
        if (wantIsland) setIslandMapOpen(true);
      }, 0);
      return () => { cancelled = true; window.clearTimeout(t); };
    }
    return () => {
      cancelled = true;
    };
  }, [identity]);

  // 玩家完成一次岛屿仪式：留下物件 → 更新岛屿状态与收藏
  const handleActed = (acted: IslandActResponse) => {
    setIsland(acted.island_state);
    setResult((prev) => (prev ? { ...prev, island_state: acted.island_state } : prev));
    if (identity) {
      fetchArtifacts(identity.user_id)
        .then(setArtifacts)
        .catch(() => {
          /* 静默 */
        });
    }
  };

  // 场景视觉：优先用最终结果，其次流式过程中的 scene，最后默认
  const activeScene = result?.scene ?? liveScene;
  const visual = activeScene ? resolveScene(activeScene.palette) : DEFAULT_VISUAL;
  // 「上岛走走」光晕强度随情绪联动：明亮→灿烂大光晕快脉冲；低沉→微弱慢呼吸,克制而安静
  const ctaGlow = {
    bright:   { peak: 1.0,  base: 0.55, dur: 2.4, scale: 1.14, breathe: 1.05, ringOpacity: 0.6, ringScale: 1.55, ringDur: 2.2 },
    soothe:   { peak: 0.82, base: 0.42, dur: 3.6, scale: 1.08, breathe: 1.03, ringOpacity: 0.5, ringScale: 1.5,  ringDur: 2.9 },
    restless: { peak: 0.9,  base: 0.5,  dur: 1.9, scale: 1.1,  breathe: 1.04, ringOpacity: 0.55, ringScale: 1.5, ringDur: 1.8 },
    heavy:    { peak: 0.5,  base: 0.26, dur: 5.0, scale: 1.04, breathe: 1.02, ringOpacity: 0.34, ringScale: 1.4, ringDur: 4.6 },
  }[visual.motion];
  // 岛屿元素：最终结果 > 流式 island > 回访 island
  const activeIsland = result?.island_state ?? liveIsland ?? island;
  const sceneFeatures = activeIsland?.features ?? [];
  // 探索模式漂流瓶里的「过去的你」：从历史记忆里取几句,变成漂到现在的字条
  // 漂流瓶字条:含相对时间("三天前的你…")。now 在挂载时取一次(useState 初始化器,避开 render 期纯度规则)
  const [nowMs] = useState(() => Date.now());
  const bottleNotes = useMemo(() => {
    const relTime = (iso: string): string => {
      const then = new Date(iso).getTime();
      if (!Number.isFinite(then)) return "曾经";
      const days = Math.floor((nowMs - then) / 86400000);
      if (days <= 0) return "今天";
      if (days === 1) return "昨天";
      if (days < 7) return `${days} 天前`;
      if (days < 30) return `${Math.floor(days / 7)} 周前`;
      if (days < 365) return `${Math.floor(days / 30)} 个月前`;
      return "很久以前";
    };
    return memories
      .filter((m) => (m.summary || m.text || "").trim())
      .slice(0, 3)
      .map((m) => {
        const words = (m.summary || m.text || "").trim().replace(/\s+/g, " ");
        const clip = words.length > 36 ? words.slice(0, 34) + "…" : words;
        const label = EMOTION_META[m.emotion]?.label ?? "心事";
        return `${relTime(m.created_at)}的你，带着「${label}」说过——「${clip}」 嘿，现在的你，好一点了吗？`;
      });
  }, [memories, nowMs]);

  // 岛上「心灵印记」收集物:每条历史记忆 → 一枚可拾取的发光印记(颜色随情绪),拾起时说明来源。
  const imprints = useMemo(() => {
    const relTime = (iso: string): string => {
      const then = new Date(iso).getTime();
      if (!Number.isFinite(then)) return "曾经";
      const days = Math.floor((nowMs - then) / 86400000);
      if (days <= 0) return "今天";
      if (days === 1) return "昨天";
      if (days < 7) return `${days} 天前`;
      if (days < 30) return `${Math.floor(days / 7)} 周前`;
      if (days < 365) return `${Math.floor(days / 30)} 个月前`;
      return "很久以前";
    };
    return memories
      .filter((m) => (m.summary || m.text || "").trim())
      .slice(0, 8)
      .map((m) => {
        const words = (m.summary || m.text || "").trim().replace(/\s+/g, " ");
        const line = (m.imprint || m.narrative || "").trim();
        return {
          emotion: m.emotion,
          label: EMOTION_META[m.emotion]?.label ?? "心事",
          color: resolveScene(EMOTION_META[m.emotion]?.palette ?? "").accent,
          when: relTime(m.created_at),
          words: words.length > 44 ? words.slice(0, 42) + "…" : words,
          line: (line.length > 72 ? line.slice(0, 70) + "…" : line) || "岛屿替你把这一刻，轻轻收着了。",
        };
      });
  }, [memories, nowMs]);

  const handleStreamEvent = (event: ReflectStreamEvent) => {
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
  };

  // 跟踪当前活跃的 reflect 请求：用户中途取消 / 再次提交后，忽略旧请求的迟到结果与流事件。
  const activeReqRef = useRef<string | null>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);

  const handleSubmit = async (text: string, ephemeral = false) => {
    if (!identity) return;
    setError(null);
    setResult(null);
    setLiveAgents([]);
    setLiveIsland(null);
    setLiveScene(null);
    setLastSubmit({ text, ephemeral });
    setLastMood(text); // 作为多轮对话的种子
    setLoadingText("岛屿在远处望见你了……");
    setPhase("loading");
    // 同一次提交用同一个 request_id：WS 超时回退 HTTP 时后端据此去重，避免重复落库
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeReqRef.current = requestId;
    try {
      const res = await reflectStream(
        identity.user_id, text, handleStreamEvent, undefined, ephemeral, requestId,
        (cancel) => { cancelStreamRef.current = cancel; },
      );
      if (activeReqRef.current !== requestId) return; // 已取消/被新提交取代：忽略迟到结果
      setResult(res);
      setIsland(res.island_state);
      setPhase(res.safety.triggered ? "safety" : shouldOfferBreathing(res) ? "breathing" : "narrative");
      loadMemories();
    } catch (e) {
      if (activeReqRef.current !== requestId) return; // 取消导致的 reject：不降级、不报错
      try {
        setLoadingText("海雾起了一会儿，岛屿换一条路过来……");
        const res = await reflect(identity.user_id, text, ephemeral, requestId);
        if (activeReqRef.current !== requestId) return;
        setResult(res);
        setIsland(res.island_state);
        setLiveAgents(res.agent_trace); // HTTP 回退时一次性展示导演台
        setPhase(res.safety.triggered ? "safety" : shouldOfferBreathing(res) ? "breathing" : "narrative");
        loadMemories();
      } catch (fallbackError) {
        if (activeReqRef.current !== requestId) return;
        const err = fallbackError ?? e;
        setError(err instanceof Error ? err.message : "岛屿走神了一下");
        setErrorKind(classifyError(err));
        setPhase("input");
      }
    }
  };

  // 叙事打完最后一字：播「萌发音」+ 触发岛屿光涌，把「每一次倾诉都长成岛屿的一部分」做成可感峰值
  const handleNarrativeDone = useCallback(() => {
    playSfx("bloom");
    setGrowthBurst(true);
    window.setTimeout(() => setGrowthBurst(false), 1900);
  }, []);

  const reset = () => {
    setResult(null);
    setError(null);
    setLiveAgents([]);
    setLiveIsland(null);
    setLiveScene(null);
    setPhase("input");
  };

  // 隐私：彻底删除后端全部记忆/物件/私房话/向量，再清本地身份（二次确认，不可恢复）
  const handleDeleteData = async () => {
    if (!identity) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("将彻底删除这座岛屿在后端保存的全部记忆、物件与私房话，无法恢复。确定吗？")
    ) {
      return;
    }
    try {
      await deleteIdentity(identity.user_id);
    } catch {
      /* 后端删除失败也继续清本地，至少不再展示历史 */
    }
    handleClearIdentity();
  };

  const handleClearIdentity = () => {
    clearIdentity();
    setIdentity(null);
    setResult(null);
    setError(null);
    setMemories([]);
    setIsland(null);
    setArtifacts([]);
    setWelcomeBack(null);
    setWhisper(null);
    setRevision(null);
    setMemOpen(false);
    // 一并清掉所有会话级覆盖层与流式残留，避免跨身份残留(#26)
    setBedtime(false);
    setSilentOpen(false);
    setGlyphOpen(false);
    setReplayMode(null);
    setIslandMapOpen(false);
    setLiveAgents([]);
    setLiveScene(null);
    setLiveIsland(null);
    setPhase("input");
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden">
      {/* 背景场景：输入态用默认 calm，有结果后随情绪变化；岛屿元素随成长浮现。
          不用 mode="wait" 同上理由——rAF 节流时场景切换会卡，且节流时背景永远不该挡住正文。 */}
      {/* 稳定透视舞台：场景在此随指针轻微俯仰，营造「有纵深、会呼吸的深海」。
          舞台不随场景切换重挂；内层放大 1.06 防倾斜露边；reduced-motion/静海下倾角恒为 0。 */}
      {skin3d.active ? (
        // 真 3D 旗舰皮：r3f Canvas 接管背景（自带相机视差，不套 CSS 倾斜舞台）。
        // 加载 three chunk 期间回退到 CSS 场景，无黑屏闪烁；animate 仍由 immersive 门控。
        <div className="fixed inset-0" style={{ zIndex: 0 }} aria-hidden>
          {/* 3D 崩溃（WebGL 上下文丢失/着色器异常）就地降级到 CSS 场景，绝不牵连整页；
              visual 变化时复位重试（换情绪后也许不再崩）。 */}
          <ErrorBoundary
            fallback={<IslandScene visual={visual} features={sceneFeatures} />}
            resetKey={visual}
          >
            <Suspense fallback={<IslandScene visual={visual} features={sceneFeatures} />}>
              <Island3D visual={visual} features={sceneFeatures} animate={immersive} />
            </Suspense>
          </ErrorBoundary>
        </div>
      ) : (
        <div className="scene-stage fixed inset-0" style={{ zIndex: 0 }} aria-hidden>
          <motion.div
            className="absolute inset-0"
            style={{
              rotateX: sceneTilt.rotateX,
              rotateY: sceneTilt.rotateY,
              scale: 1.06,
              transformStyle: "preserve-3d",
            }}
          >
            <AnimatePresence>
              <IslandScene
                key={visual.time + visual.weather + (activeScene?.palette ?? "idle")}
                visual={visual}
                features={sceneFeatures}
              />
            </AnimatePresence>
          </motion.div>
        </div>
      )}

      {/* 装饰粒子层：萤火 / 海面浮光 / 雾粒，按天气和时间调密度 */}
      <Particles
        weather={visual.weather}
        time={visual.time}
        accent={visual.accent}
        seed={identity?.user_id ?? "anon"}
      />

      {/* 守夜模式压暗：覆盖在场景之上、正文之下，让岛屿安静下来。指针穿透，不影响交互。 */}
      {nightWatch && (
        <div className="pointer-events-none fixed inset-0 z-10 bg-slate-950/45 transition-opacity duration-1000" aria-hidden="true" />
      )}

      {/* 生长瞬间：叙事落定时，一束暖光自岛屿涌起又散去——把「每一次倾诉都长成岛屿的一部分」做成可见峰值 */}
      <AnimatePresence>
        {growthBurst && (
          <motion.div
            key="growth-burst"
            aria-hidden
            className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-[62vh]"
            style={{
              // 体积光：场景色 + 一抹暖金，从海面缓缓弥散漫开（绝不推向用户、绝不骤亮）
              background: `radial-gradient(ellipse 72% 100% at 50% 100%, ${visual.accent}4d 0%, rgba(245,210,138,0.16) 34%, transparent 72%)`,
              transformOrigin: "50% 100%",
            }}
            initial={{ opacity: 0, scaleY: immersive ? 0.7 : 1 }}
            animate={{
              opacity: immersive ? [0, 0.6, 0] : [0, 0.3, 0],
              scaleY: immersive ? [0.7, 1.08, 1.2] : [1, 1, 1],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.4, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* 顶部品牌 + 控制栏 */}
      <motion.header
        className="relative z-30 px-4 pb-2"
        style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="text-center select-none">
          <motion.div
            className="inline-flex flex-col items-center gap-2"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.svg
              viewBox="0 0 48 48"
              className="h-7 w-7"
              aria-hidden
              animate={{
                filter: [
                  "drop-shadow(0 0 0px rgba(245,210,138,0))",
                  "drop-shadow(0 0 10px rgba(245,210,138,0.55))",
                  "drop-shadow(0 0 0px rgba(245,210,138,0))",
                ],
              }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <defs>
                <radialGradient id="hdr-moon" cx="0.5" cy="0.5">
                  <stop offset="0" stopColor="#fff" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx="32" cy="14" r="5" fill="url(#hdr-moon)" opacity="0.92" />
              <path d="M0 36 Q12 30 24 32 T48 36 L48 48 L0 48 Z" fill="#9fb4f0" opacity="0.85" />
              <path d="M14 36 Q20 22 26 24 T38 36 Z" fill="#0a0e1f" />
              <path d="M0 42 Q14 40 26 41 T48 42" stroke="#fff" strokeOpacity="0.2" strokeWidth="0.5" fill="none" />
            </motion.svg>
            <div className="relative">
              <span
                aria-hidden
                className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto h-px w-24"
                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }}
              />
              <h1
                onClick={onTitleTap}
                className="relative inline-block font-display text-[24px] font-light tracking-[0.5em] pl-[0.5em] bg-gradient-to-b from-white via-white to-white/65 bg-clip-text text-transparent px-6 cursor-pointer select-none"
                title="试试连点 5 次"
              >
                心 屿
              </h1>
            </div>
            <p className="font-serif italic text-[12px] tracking-[0.22em] text-mist-400">
              — 一座会回应你的岛屿 —
            </p>
          </motion.div>
        </div>
        {identity && (
          <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-2">
            <UserBadge identity={identity} onClear={handleClearIdentity} onDeleteData={handleDeleteData} />
            <MindMap memories={memories} island={activeIsland} artifacts={artifacts} open={memOpen} onToggle={() => setMemOpen((v) => !v)} userId={identity.user_id} />
          </div>
        )}
      </motion.header>

      {/* 自由探索时固定治愈系纯音乐「澄澈空气」(calm)，退出后恢复情绪驱动曲目 */}
      {identity && (
        <MusicControl
          music={exploreOpen ? "calm" : result?.scene?.music}
          emotion={result?.emotion}
        />
      )}

      {/* 主内容区 */}
      <main
        className="relative z-20 flex flex-col items-center justify-center pb-32 sm:pb-0"
        style={{
          minHeight: "78dvh",
          paddingLeft: "calc(1rem + env(safe-area-inset-left))",
          paddingRight: "calc(1rem + env(safe-area-inset-right))",
        }}
      >
        {!identity ? (
          <IdentityGate onReady={setIdentity} />
        ) : (
          // 不用 mode="wait"：rAF 节流时上一阶段 exit 会卡住、新阶段永远不挂载（标签页隐藏/低端机会复现）。
          // 同时切换有 0.4s 视觉重叠，但保证 phase 始终向前推进，避免用户卡死无法接收 safety/narrative。
          <AnimatePresence>
          {phase === "input" && (
            <motion.div key="input" className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
              {error && lastSubmit && (
                <IslandHushCard
                  kind={errorKind}
                  onRetry={() => { setError(null); handleSubmit(lastSubmit.text, lastSubmit.ephemeral); }}
                  onDismiss={() => setError(null)}
                />
              )}
              {/* InboxQueue：按 revision > welcomeBack > whisper > nightWatch 优先级，
                  同一时刻只显示一张，避免演示路径上多条信件一起砸下来 */}
              {revision ? (
                <IslandRevision revision={revision} />
              ) : welcomeBack ? (
                <WelcomeBackCard message={welcomeBack.message} artifactKey={welcomeBack.artifact} />
              ) : whisper ? (
                <IslandWhisper whisper={whisper.whisper} artifactKey={whisper.artifact} />
              ) : nightWatch ? (
                <NightWatchBanner onBedtime={() => setBedtime(true)} />
              ) : null}
              <MoodInput onSubmit={handleSubmit} loading={false} onSilent={() => setSilentOpen(true)} onGlyph={() => setGlyphOpen(true)} />
              {memories.length > 0 && (
                <motion.p
                  className="text-center text-white/55 text-[12px] mt-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  岛屿记得你上次的 {EMOTION_META[memories[0].emotion]?.label ?? "心事"}，欢迎回来
                </motion.p>
              )}
              {/* 自由探索不依赖历史,任何时候都能上岛走走 —— 主行动召唤,明亮药丸 + 光晕脉冲 + 声纳环,光晕强度随情绪联动 */}
              <div className="text-center mt-4">
                <motion.button
                  onClick={() => setExploreOpen(true)}
                  onPointerEnter={prefetchExplore}
                  onPointerDown={prefetchExplore}
                  className="island-cta"
                  style={{
                    background: `linear-gradient(165deg, ${visual.accent} 0%, ${visual.accent}d9 52%, ${visual.accent}b3 100%)`,
                    boxShadow: `0 16px 42px -10px ${visual.accent}, 0 3px 12px -3px ${visual.accent}cc, inset 0 1px 0 rgba(255,255,255,0.75)`,
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, scale: [1, ctaGlow.breathe, 1] }}
                  transition={{
                    opacity: { delay: 0.3, duration: 0.5 },
                    y: { delay: 0.3, duration: 0.5 },
                    scale: { delay: 1, duration: ctaGlow.dur, repeat: Infinity, ease: "easeInOut" },
                  }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                >
                  <motion.span
                    className="island-cta__glow"
                    style={{ background: `radial-gradient(ellipse at center, ${visual.accent} 0%, ${visual.accent}55 45%, transparent 72%)` }}
                    animate={{ opacity: [ctaGlow.base, ctaGlow.peak, ctaGlow.base], scale: [1, ctaGlow.scale, 1] }}
                    transition={{ duration: ctaGlow.dur, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <motion.span
                    className="island-cta__ring"
                    animate={{ scale: [1, ctaGlow.ringScale], opacity: [ctaGlow.ringOpacity, 0] }}
                    transition={{ duration: ctaGlow.ringDur, repeat: Infinity, ease: "easeOut" }}
                  />
                  <span className="island-cta__shine" aria-hidden />
                  <span className="island-cta__emoji" aria-hidden>🏝</span>
                  上岛走走
                  <span className="island-cta__arrow" aria-hidden>›</span>
                </motion.button>
              </div>
              <div className="text-center mt-3 flex items-center justify-center gap-x-3 gap-y-1.5 flex-wrap">
                {memories.length > 0 && (
                  <button onClick={() => setReplayMode("self")} className="btn-link py-1 px-1">
                    回望这些天 ›
                  </button>
                )}
                {memories.length > 0 && identity && <IslandAssistant userId={identity.user_id} />}
                {(memories.length > 0 || artifacts.length > 0) && (
                  <button onClick={() => setIslandMapOpen(true)} className="btn-link py-1 px-1">
                    登高望岛 ›
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {phase === "loading" && (
            <motion.div key="loading" className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
              <LoadingOrb
                accent={visual.accent}
                message={loadingText}
                agentsDone={liveAgents.filter((a) => a.status === "done").length}
                totalAgents={5}
                onCancel={() => { cancelStreamRef.current?.(); activeReqRef.current = null; setError(null); setPhase("input"); }}
              />
              <AgentDirectorPanel agents={liveAgents} />
            </motion.div>
          )}

          {phase === "breathing" && result && (
            <motion.div key="breathing" className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
              <BreathingRitual
                emotionLabel={EMOTION_META[result.emotion]?.label ?? "情绪"}
                onComplete={() => setPhase("narrative")}
                onSkip={() => setPhase("narrative")}
              />
            </motion.div>
          )}

          {phase === "narrative" && result && identity && (
            <motion.div key="narr" className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
              <NarrativeCard
                result={result}
                userId={identity.user_id}
                seedMood={lastMood}
                onReset={reset}
                onActed={handleActed}
                onInscribed={() => fetchArtifacts(identity.user_id).then(setArtifacts).catch(() => {})}
                onNarrativeDone={handleNarrativeDone}
              />
            </motion.div>
          )}

          {phase === "safety" && result && (
            <motion.div key="safety" className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
              <SafetyNotice message={result.safety.message ?? ""} onReset={reset} />
            </motion.div>
          )}
          </AnimatePresence>
        )}
      </main>

      {/* 底部声明 */}
      <footer
        className="relative z-20 text-center px-4"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <p className="text-mist-500 text-[10px] leading-relaxed tracking-wider">
          《心屿》提供情感陪伴，并非心理咨询或医疗服务 · 如处于危机请联系专业热线
        </p>
      </footer>

      {/* 标题连点 5 次的横扫光带 */}
      <AnimatePresence>
        {titleSwept && (
          <motion.div
            key="title-sweep"
            aria-hidden
            className="pointer-events-none fixed inset-x-0 top-[7rem] z-30 h-32"
            initial={{ opacity: 0, x: "-100%" }}
            animate={{ opacity: 1, x: "100%" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${visual.accent}55 40%, ${visual.accent}aa 50%, ${visual.accent}55 60%, transparent 100%)`,
              filter: "blur(28px)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Konami code 隐藏文案 */}
      <AnimatePresence>
        {konamiUnlocked && (
          <motion.div
            key="konami"
            className="panel-glass-3 fixed left-1/2 top-1/2 z-50 rounded-card-lg px-8 py-6 max-w-sm"
            style={{ x: "-50%", y: "-50%" }}
            initial={{ opacity: 0, scale: 0.94, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.94, filter: "blur(8px)" }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            onClick={dismissKonami}
          >
            <p className="font-serif italic text-mist-100 text-reading text-center leading-loose">
              「岛屿记得每一个找到它的人。」
            </p>
            <p className="text-caption text-mist-500 text-center mt-3 tracking-widest">轻点关闭</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 快捷键浮层 */}
      <ShortcutsHint open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* 首次登岛过场：黑屏 → 月光岛屿 → typewriter → onDone */}
      <AnimatePresence>
        {arrival && identity && (
          <OnboardingArrival
            key="arrival"
            nickname={identity.nickname}
            onDone={() => {
              try { sessionStorage.setItem(`xinyu.arrived.${identity.user_id}`, "1"); } catch { /* sessionStorage 不可用 */ }
              setArrival(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* 晚安屏：z-50 全屏覆盖，5 秒内不暴露返回按钮，保护用户真的去睡觉 */}
      <AnimatePresence>
        {bedtime && <GoodnightScreen key="goodnight" onWake={() => setBedtime(false)} />}
      </AnimatePresence>

      {/* 静默坐岛：z-40 全屏覆盖，30 秒陪坐 → 留一枚静默贝壳 → 自动关闭 */}
      <AnimatePresence>
        {silentOpen && identity && (
          <SilentMode
            key="silent-mode"
            userId={identity.user_id}
            durationSeconds={30}
            onClose={(artifact) => {
              setSilentOpen(false);
              // 用回传的贝壳乐观合并，先让它立刻出现在收藏墙，再异步对账(#6/#25)
              if (artifact) setArtifacts((prev) => [artifact, ...prev]);
              fetchArtifacts(identity.user_id).then(setArtifacts).catch(() => {});
              fetchIslandState(identity.user_id).then(setIsland).catch(() => {});
            }}
          />
        )}
      </AnimatePresence>

      {/* 写一个字：z-40 全屏覆盖，描红写一个心境字 → 岛屿读心 → 留一块心境石 */}
      <AnimatePresence>
        {glyphOpen && identity && (
          <GlyphCanvas
            key="glyph-canvas"
            userId={identity.user_id}
            onClose={(glyph) => {
              setGlyphOpen(false);
              if (glyph?.artifact) setArtifacts((prev) => [glyph.artifact, ...prev]);
              fetchArtifacts(identity.user_id).then(setArtifacts).catch(() => {});
              fetchIslandState(identity.user_id).then(setIsland).catch(() => {});
            }}
          />
        )}
      </AnimatePresence>

      {/* 时光机·一键回望：z-[60] 全屏覆盖，把跨天成长压进 20 秒延时动画 */}
      {replayMode && identity && (
        <TimeMachine
          userId={replayMode === "demo" ? "demo-timeline" : identity.user_id}
          demo={replayMode === "demo"}
          onClose={() => setReplayMode(null)}
        />
      )}

      {/* 登高望岛：z-[60] 俯瞰式查看自己养成的岛 */}
      <AnimatePresence>
        {islandMapOpen && identity && (
          <IslandMap
            key="island-map"
            island={activeIsland}
            artifacts={artifacts}
            onClose={() => setIslandMapOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* 自由探索：z-[70] 控制小人在岛上走动收集心愿 */}
      {exploreOpen && (
        // 探索模式崩溃（WebGL 上下文丢失等）→ 自动退出回到岛屿主界面，而非整页失联。
        <ErrorBoundary fallback={null} onError={() => setExploreOpen(false)}>
          <Suspense fallback={null}>
            <ExploreMode key={identity?.user_id ?? "guest"} visual={visual} onExit={() => setExploreOpen(false)} emotion={result?.emotion} bottleNotes={bottleNotes} imprints={imprints} userId={identity?.user_id} />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
