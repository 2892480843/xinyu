import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
// —— 复用桌面的黑盒组件（零改动）——
import IslandScene from "../../components/IslandScene";
import ErrorBoundary from "../../components/ErrorBoundary";
import Particles from "../../components/Particles";
import IdentityGate from "../../components/IdentityGate";
import OnboardingArrival from "../../components/OnboardingArrival";
import NarrativeCard from "../../components/NarrativeCard";
import BreathingRitual from "../../components/BreathingRitual";
import SafetyNotice from "../../components/SafetyNotice";
import LoadingOrb from "../../components/LoadingOrb";
import MoodInput from "../../components/MoodInput";
import SilentMode from "../../components/SilentMode";
import GlyphCanvas from "../../components/GlyphCanvas";
import TimeMachine from "../../components/TimeMachine";
import IslandMap from "../../components/IslandMap";
import IslandPhrases from "../../components/IslandPhrases";
import IslandLetter from "../../components/IslandLetter";
import MindMap from "../../components/MindMap";
import MusicControl from "../../components/MusicControl";
import IslandAssistant from "../../components/IslandAssistant";
import IslandHushCard from "../../components/IslandHushCard";
import { NightWatchBanner, GoodnightScreen } from "../../components/NightWatch";
// —— 复用桌面 lib / hooks ——
import { useKeyboardInset } from "../../hooks/useKeyboardInset";
import {
  fetchMemories, fetchIslandState, fetchArtifacts,
  fetchWelcomeBack, fetchIslandWhisper, fetchIslandRevision, deleteIdentity,
  type MemoryItem, type ArtifactItem,
  type WelcomeBackResponse, type WhisperResponse, type RevisionResponse,
} from "../../lib/api";
import { clearIdentity, loadIdentity, type LocalIdentity } from "../../lib/localIdentity";
import { resolveScene, DEFAULT_VISUAL, EMOTION_META } from "../../lib/sceneMap";
import { TREND_META } from "../../lib/islandMeta";
import { useNightWatch } from "../../lib/useNightWatch";
import { useImmersion } from "../../hooks/useImmersion";
import { useSkin3d } from "../../hooks/useSkin3d";
// —— 移动端专属外壳 ——
import { useReflectFlow } from "../hooks/useReflectFlow";
import MobileTabBar, { type MobileTab } from "../components/MobileTabBar";
import BottomSheet from "../components/BottomSheet";
import MobileInbox from "../components/MobileInbox";
import MemoryTab from "../components/MemoryTab";
import SelfTab from "../components/SelfTab";
import MobileBrand from "../components/MobileBrand";

// 重 chunk 懒加载（与桌面 Home 同款，避免移动端首屏拉近百 glTF；prefetch 在空闲/按下时预热）。
const Island3D = lazy(() => import("../../components/Island3D"));
const importExplore = () => import("../../components/ExploreMode");
const ExploreMode = lazy(importExplore);
let explorePrefetched = false;
function prefetchExplore() {
  if (explorePrefetched) return;
  explorePrefetched = true;
  importExplore().then((m) => { try { m.prefetchExploreAssets?.(); } catch { /* ignore */ } });
}

// 全屏态：居中（loading / breathing）。
function FullScreenCenter({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative z-30 flex min-h-[100dvh] items-center justify-center px-5"
      style={{
        paddingTop: "calc(1rem + env(safe-area-inset-top))",
        paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
      }}
    >
      {children}
    </div>
  );
}

// 全屏态：可滚动（narrative / safety）。
function FullScreenScroll({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative z-30 mx-auto min-h-[100dvh] w-full max-w-[34rem] px-4"
      style={{
        paddingTop: "calc(1.25rem + env(safe-area-inset-top))",
        paddingBottom: "calc(2rem + env(safe-area-inset-bottom))",
      }}
    >
      {children}
    </div>
  );
}

export default function HomeMobile() {
  useKeyboardInset();
  const [identity, setIdentity] = useState<LocalIdentity | null>(() => loadIdentity());
  const [tab, setTab] = useState<MobileTab>("island");
  const [composeOpen, setComposeOpen] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  // 非语言入口 + 足迹覆盖层 + 夜间守望
  const [silentOpen, setSilentOpen] = useState(false);
  const [glyphOpen, setGlyphOpen] = useState(false);
  const [mindOpen, setMindOpen] = useState(false);
  const [tmOpen, setTmOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);
  const nightWatch = useNightWatch();
  const [bedtime, setBedtime] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const { immersive } = useImmersion();
  const skin3d = useSkin3d();
  const [welcomeBack, setWelcomeBack] = useState<WelcomeBackResponse | null>(null);
  const [whisper, setWhisper] = useState<WhisperResponse | null>(null);
  const [revision, setRevision] = useState<RevisionResponse | null>(null);

  // 首次登岛过场：每个 user_id 仅播一次（sessionStorage 防刷新）。
  const [arrival, setArrival] = useState<boolean>(() => {
    const id = loadIdentity()?.user_id;
    if (!id || typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem(`xinyu.arrived.${id}`) !== "1";
  });

  const loadMemories = useCallback(async () => {
    if (!identity) return;
    try { setMemories(await fetchMemories(identity.user_id)); } catch { /* 后端未就绪静默 */ }
  }, [identity]);

  const flow = useReflectFlow(identity?.user_id ?? null, loadMemories);
  const { setIsland: setFlowIsland, reset: resetFlow } = flow;

  // 身份就绪后拉一次：记忆 / 岛屿状态 / 收藏 / 回访三件套。
  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    const uid = identity.user_id;
    fetchMemories(uid).then((m) => { if (!cancelled) setMemories(m); }).catch(() => {});
    fetchIslandState(uid).then((s) => { if (!cancelled) setFlowIsland(s); }).catch(() => {});
    fetchArtifacts(uid).then((a) => { if (!cancelled) setArtifacts(a); }).catch(() => {});
    fetchWelcomeBack(uid, false).then((r) => { if (!cancelled && r?.show) setWelcomeBack(r); }).catch(() => {});
    fetchIslandWhisper(uid).then((r) => { if (!cancelled && r?.show) setWhisper(r); }).catch(() => {});
    fetchIslandRevision(uid, false).then((r) => { if (!cancelled && r?.show) setRevision(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [identity, setFlowIsland]);

  // 新建/切换身份时重新触发登岛过场（与桌面 Home.tsx:202-207 同源；挂载时无身份故初值为 false）。
  useEffect(() => {
    if (!identity) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 身份变化时有意重置抵岸过场（与桌面 Home.tsx:204 同源）
      if (sessionStorage.getItem(`xinyu.arrived.${identity.user_id}`) !== "1") setArrival(true);
    } catch { /* sessionStorage 不可用 */ }
  }, [identity]);

  // 首页空闲时预取「上岛」重 chunk + 模型（与桌面 Home 同款；省流量/弱网跳过）。
  useEffect(() => {
    const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || /2g/.test(conn?.effectiveType ?? "")) return;
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) { ric(prefetchExplore, { timeout: 3000 }); return; }
    const t = window.setTimeout(prefetchExplore, 1800);
    return () => window.clearTimeout(t);
  }, []);

  // 场景视觉：最终结果 > 流式 scene > 默认（与桌面 Home.tsx:278-290 一致）。
  const activeScene = flow.result?.scene ?? flow.liveScene;
  const visual = activeScene ? resolveScene(activeScene.palette) : DEFAULT_VISUAL;
  const activeIsland = flow.result?.island_state ?? flow.liveIsland ?? flow.island;
  const emotionLabel = EMOTION_META[flow.result?.emotion ?? ""]?.label ?? "此刻";
  const agentsDone = flow.liveAgents.filter((a) => a.status === "done").length;
  // 「上岛走走」光晕强度随情绪联动（与桌面 Home.tsx:282-287 同源）。
  const ctaGlow = {
    bright:   { peak: 1.0,  base: 0.55, dur: 2.4, scale: 1.14, breathe: 1.05, ringOpacity: 0.6, ringScale: 1.55, ringDur: 2.2 },
    soothe:   { peak: 0.82, base: 0.42, dur: 3.6, scale: 1.08, breathe: 1.03, ringOpacity: 0.5, ringScale: 1.5,  ringDur: 2.9 },
    restless: { peak: 0.9,  base: 0.5,  dur: 1.9, scale: 1.1,  breathe: 1.04, ringOpacity: 0.55, ringScale: 1.5, ringDur: 1.8 },
    heavy:    { peak: 0.5,  base: 0.26, dur: 5.0, scale: 1.04, breathe: 1.02, ringOpacity: 0.34, ringScale: 1.4, ringDur: 4.6 },
  }[visual.motion];

  // 主页顶部是否已有内容（岛屿留言 / 成长态 / 错误）——决定布局走向：
  // 有 → 顶部堆内容、CTA 锚到下三分之一（拇指区）；无 → 品牌+引导作为一个居中英雄整体，消除中段真空。
  const hasInbox = !!(revision?.show || welcomeBack?.show || whisper?.show);
  const islandHasTop = hasInbox || !!activeIsland || !!flow.error;

  // 上岛探索的素材：历史记忆 → 漂流瓶字条 + 心灵印记（与桌面 Home.tsx:294-345 同源）。
  const [nowMs] = useState(() => Date.now());
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
  const bottleNotes = useMemo(
    () => memories.filter((m) => (m.summary || m.text || "").trim()).slice(0, 3).map((m) => {
      const words = (m.summary || m.text || "").trim().replace(/\s+/g, " ");
      const clip = words.length > 36 ? words.slice(0, 34) + "…" : words;
      const label = EMOTION_META[m.emotion]?.label ?? "心事";
      return `${relTime(m.created_at)}的你，带着「${label}」说过——「${clip}」 嘿，现在的你，好一点了吗？`;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memories, nowMs],
  );
  const imprints = useMemo(
    () => memories.filter((m) => (m.summary || m.text || "").trim()).slice(0, 8).map((m) => {
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
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memories, nowMs],
  );

  const handleClearIdentity = () => {
    clearIdentity();
    setIdentity(null);
    setMemories([]); setArtifacts([]);
    setWelcomeBack(null); setWhisper(null); setRevision(null);
    setFlowIsland(null);
    resetFlow();
    setTab("island"); setComposeOpen(false);
  };

  const handleDeleteData = async () => {
    if (!identity) return;
    if (typeof window !== "undefined" &&
      !window.confirm("将彻底删除这座岛屿在后端保存的全部记忆、物件与私房话，无法恢复。确定吗？")) return;
    try { await deleteIdentity(identity.user_id); } catch { /* 删除失败也清本地 */ }
    handleClearIdentity();
  };

  const onSubmit = (text: string, ephemeral: boolean) => {
    setComposeOpen(false);
    void flow.submit(text, ephemeral);
  };

  // 非语言入口完成后（静默贝壳 / 心境石）刷新岛屿数据。
  const refreshIsland = useCallback(() => {
    if (!identity) return;
    const uid = identity.user_id;
    fetchMemories(uid).then(setMemories).catch(() => {});
    fetchArtifacts(uid).then(setArtifacts).catch(() => {});
    fetchIslandState(uid).then(setFlowIsland).catch(() => {});
  }, [identity, setFlowIsland]);
  const openSilent = () => { setComposeOpen(false); setSilentOpen(true); };
  const openGlyph = () => { setComposeOpen(false); setGlyphOpen(true); };

  // 品牌区：空态保留副标题（更有仪式感），有内容时收起副标题让顶部紧凑。
  const islandBrand = (
    <div className="text-center">
      <MobileBrand subtitle={!islandHasTop} />
    </div>
  );
  // 倾诉引导 + 主次 CTA：两种布局分支共用，集中维护避免重复。
  const islandHeroCta = (
    <div className="flex flex-col items-center gap-3.5 text-center">
      <p className="font-serif text-[14px] leading-relaxed text-white/70">把今天的心情，说给岛屿听。<br />说一个字、或什么都不说坐一会儿，也可以。</p>
      {/* 主 CTA：说给岛屿 —— 唯一的高亮渐变药丸，视觉重心明确 */}
      <motion.button
        type="button"
        onClick={() => setComposeOpen(true)}
        className="island-cta"
        style={{ background: `linear-gradient(165deg, ${visual.accent} 0%, ${visual.accent}d9 52%, ${visual.accent}b3 100%)` }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, scale: [1, ctaGlow.breathe, 1] }}
        transition={{
          opacity: { delay: 0.2, duration: 0.5 },
          y: { delay: 0.2, duration: 0.5 },
          scale: { delay: 0.8, duration: ctaGlow.dur, repeat: Infinity, ease: "easeInOut" },
        }}
        whileTap={{ scale: 0.96 }}
      >
        <motion.span
          className="island-cta__glow"
          style={{ background: `radial-gradient(ellipse at center, ${visual.accent} 0%, ${visual.accent}55 45%, transparent 72%)` }}
          animate={{ opacity: [ctaGlow.base, ctaGlow.peak, ctaGlow.base], scale: [1, ctaGlow.scale, 1] }}
          transition={{ duration: ctaGlow.dur, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="island-cta__shine" aria-hidden />
        说给岛屿
      </motion.button>
      {/* 次 CTA：上岛走走 —— 玻璃描边幽灵按钮，与主 CTA 拉开主次，不抢视觉重心 */}
      <motion.button
        type="button"
        onClick={() => setExploreOpen(true)}
        onPointerEnter={prefetchExplore}
        onPointerDown={prefetchExplore}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
        whileTap={{ scale: 0.96 }}
        className="mobile-cta-ghost"
      >
        上岛走走
        <span className="mobile-cta-ghost__arrow" aria-hidden>›</span>
      </motion.button>
    </div>
  );

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden overflow-y-hidden">
      {/* 常驻岛屿背景：默认 2D；「我」Tab 开启真 3D 旗舰皮且支持 WebGL + 沉浸态时接管，崩溃回退 2D */}
      <div className="fixed inset-0" style={{ zIndex: 0 }} aria-hidden>
        {skin3d.active && immersive ? (
          <ErrorBoundary fallback={<IslandScene visual={visual} features={activeIsland?.features ?? []} />} resetKey={visual}>
            <Suspense fallback={<IslandScene visual={visual} features={activeIsland?.features ?? []} />}>
              <Island3D visual={visual} features={activeIsland?.features ?? []} animate={immersive} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <IslandScene visual={visual} features={activeIsland?.features ?? []} />
        )}
      </div>
      <Particles weather={visual.weather} time={visual.time} accent={visual.accent} seed={identity?.user_id ?? "anon"} />

      {/* 生长瞬间：叙事落定时一束暖光自海面涌起 */}
      <AnimatePresence>
        {flow.growthBurst && (
          <motion.div
            key="growth-burst"
            aria-hidden
            className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-[62vh]"
            style={{ background: `radial-gradient(ellipse 72% 100% at 50% 100%, ${visual.accent}4d 0%, rgba(245,210,138,0.16) 34%, transparent 72%)` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.4, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* 背景音乐：右上角可收起小控件（避开底部 TabBar；复用桌面 MusicControl 的移动变体） */}
      {identity && (
        <MusicControl
          music={exploreOpen ? "calm" : flow.result?.scene?.music}
          emotion={flow.result?.emotion}
          variant="mobile-top"
        />
      )}

      {!identity ? (
        <FullScreenCenter>
          <IdentityGate onReady={setIdentity} />
        </FullScreenCenter>
      ) : (
        <>
          {flow.phase === "loading" && (
            <FullScreenCenter>
              <LoadingOrb accent={visual.accent} message={flow.loadingText} agentsDone={agentsDone} totalAgents={5} onCancel={flow.cancel} />
            </FullScreenCenter>
          )}

          {flow.phase === "breathing" && (
            <FullScreenCenter>
              <BreathingRitual
                emotionLabel={emotionLabel}
                onComplete={() => flow.setPhase("narrative")}
                onSkip={() => flow.setPhase("narrative")}
              />
            </FullScreenCenter>
          )}

          {flow.phase === "safety" && flow.result && (
            <FullScreenScroll>
              <SafetyNotice message={flow.result.safety.message ?? ""} onReset={flow.reset} />
            </FullScreenScroll>
          )}

          {flow.phase === "narrative" && flow.result && (
            <FullScreenScroll>
              <NarrativeCard
                result={flow.result}
                userId={identity.user_id}
                seedMood={flow.lastMood}
                onReset={flow.reset}
                onActed={flow.handleActed}
                onNarrativeDone={flow.handleNarrativeDone}
              />
            </FullScreenScroll>
          )}

          {flow.phase === "input" && (
            <>
              <div
                className="mobile-app-shell mobile-bottom-buffer relative z-20 mx-auto flex w-full max-w-[34rem] flex-col"
                style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
              >
                {tab === "island" && (
                  islandHasTop ? (
                    // 有内容态：品牌+留言+成长态顶部堆叠，CTA 锚到下三分之一（拇指区）。
                    <div className="flex flex-1 flex-col">
                      <div className="flex flex-col gap-4 pt-1">
                        {islandBrand}

                        {/* 错误反馈：提交失败时岛屿轻声告知（与桌面 Home.tsx:641 同源） */}
                        {flow.error && (
                          <IslandHushCard
                            kind={flow.errorKind}
                            onRetry={flow.retry}
                            onDismiss={flow.dismissError}
                          />
                        )}

                        {/* 岛屿留言 */}
                        <MobileInbox revision={revision} welcomeBack={welcomeBack} whisper={whisper} />

                        {/* 岛屿成长摘要：材质与桌面 IslandStatePanel 同源（rounded-3xl + shadow-2xl + 成长圆点 + 趋势） */}
                        {activeIsland && (
                          <div className="mx-auto w-full max-w-[30rem] rounded-3xl border border-white/15 bg-white/9 p-4 shadow-2xl backdrop-blur-md">
                            <div className="mb-2.5 flex items-center justify-between gap-2">
                              <p className="text-[11px] tracking-[0.28em] text-white/45">心象岛屿</p>
                              <div className="flex items-center gap-2">
                                {activeIsland.trend && (
                                  <span className="text-[11px] text-white/55">{(TREND_META[activeIsland.trend] ?? { label: activeIsland.trend }).label}</span>
                                )}
                                {/* 成长圆点：与桌面 GrowthDots 一致 */}
                                <span className="flex items-center gap-1" title={`岛屿成长等级 ${activeIsland.growth_level}/5`}>
                                  {[0, 1, 2, 3, 4].map((i) => (
                                    <span
                                      key={i}
                                      className="h-1.5 w-1.5 rounded-full"
                                      style={{ background: i < activeIsland.growth_level ? visual.accent : "rgba(255,255,255,0.18)" }}
                                    />
                                  ))}
                                </span>
                              </div>
                            </div>
                            <p className="text-[13px] leading-relaxed text-white/82">{activeIsland.summary}</p>
                            {activeIsland.chapter && (
                              <p className="mt-1.5 font-serif italic text-[12px] leading-relaxed text-white/50">{activeIsland.chapter}</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 弹性留白：上 2 : 下 1，让 CTA 沉到视觉下三分之一而非夹在正中 */}
                      <div className="flex-1" />
                      {islandHeroCta}
                      <div className="flex-[0.5]" />
                    </div>
                  ) : (
                    // 空态/新用户：品牌 + 引导作为一个居中英雄整体，消除中段真空。
                    <div className="flex flex-1 flex-col items-center justify-center gap-8">
                      {islandBrand}
                      {islandHeroCta}
                    </div>
                  )
                )}

                {tab === "memory" && (
                  <MemoryTab
                    memoryCount={memories.length}
                    accent={visual.accent}
                    onMindMap={() => setMindOpen(true)}
                    onTimeMachine={() => setTmOpen(true)}
                    onIslandMap={() => setMapOpen(true)}
                    onPhrases={() => setPhrasesOpen(true)}
                    onLetter={() => setLetterOpen(true)}
                    assistant={
                      <IslandAssistant
                        userId={identity.user_id}
                        zIndexClass="z-[85]"
                        trigger={
                          <span className="shrink-0 text-white/55 text-[18px] leading-none touch-target" aria-hidden>›</span>
                        }
                      />
                    }
                  />
                )}

                {tab === "self" && (
                  <SelfTab
                    identity={identity}
                    onClear={handleClearIdentity}
                    onDeleteData={handleDeleteData}
                    extra={skin3d.supported ? (
                      <button
                        type="button"
                        onClick={() => skin3d.setSkin3d(!skin3d.wanted)}
                        aria-pressed={skin3d.wanted}
                        className="panel-glass-1 flex min-h-[52px] w-full items-center gap-3 rounded-card px-4 py-3 text-left transition active:scale-[0.98]"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-[16px]" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] text-white/85">真 3D 岛屿背景</span>
                          <span className="block text-[11px] text-white/40">{skin3d.wanted ? "已开启 · 更耗电" : "实验功能 · 更耗电"}</span>
                        </span>
                        <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${skin3d.wanted ? "bg-white/55" : "bg-white/15"}`}>
                          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-[#0a0e1f] transition-all ${skin3d.wanted ? "left-3.5" : "left-0.5"}`} />
                        </span>
                      </button>
                    ) : undefined}
                  />
                )}
              </div>

              <MobileTabBar active={tab} onSelect={setTab} onCompose={() => setComposeOpen(true)} accent={visual.accent} />
            </>
          )}

          {/* 倾诉 Sheet：从底升起，键盘友好 */}
          <BottomSheet open={composeOpen} onClose={() => setComposeOpen(false)} label="说给岛屿" accent={visual.accent}>
            <MoodInput onSubmit={onSubmit} onSilent={openSilent} onGlyph={openGlyph} loading={false} />
          </BottomSheet>

          {/* 首次登岛过场 */}
          {arrival && (
            <OnboardingArrival
              nickname={identity.nickname}
              onDone={() => {
                setArrival(false);
                try { sessionStorage.setItem(`xinyu.arrived.${identity.user_id}`, "1"); } catch { /* ignore */ }
              }}
            />
          )}

          {/* —— 足迹覆盖层（复用桌面组件）—— */}
          {mindOpen && (
            <div
              className="fixed inset-0 z-[75] overflow-auto bg-ink-950/85 px-4 backdrop-blur-sm"
              style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))", paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
            >
              <div className="mx-auto w-full max-w-[34rem]">
                <button type="button" onClick={() => setMindOpen(false)} className="btn-ghost mb-3 px-4 py-2.5 text-[13px]">‹ 返回</button>
                {/* fullscreen 变体：纯轨迹图查看器，全宽 + 更高的轨迹图，不内嵌 phrases/letter（走独立 BottomSheet） */}
                <MindMap
                  memories={memories}
                  island={activeIsland}
                  artifacts={artifacts}
                  open
                  onToggle={() => setMindOpen(false)}
                  userId={identity.user_id}
                  variant="fullscreen"
                />
              </div>
            </div>
          )}
          {tmOpen && <TimeMachine userId={identity.user_id} demo={memories.length === 0} onClose={() => setTmOpen(false)} />}
          {mapOpen && <IslandMap island={activeIsland} artifacts={artifacts} onClose={() => setMapOpen(false)} />}
          <BottomSheet open={phrasesOpen} onClose={() => setPhrasesOpen(false)} label="私房安慰话" accent={visual.accent}>
            <IslandPhrases userId={identity.user_id} />
          </BottomSheet>
          <BottomSheet open={letterOpen} onClose={() => setLetterOpen(false)} label="岛屿年报" accent={visual.accent}>
            <IslandLetter userId={identity.user_id} memoryCount={memories.length} />
          </BottomSheet>

          {/* —— 非语言入口（全屏）—— */}
          {silentOpen && (
            <SilentMode userId={identity.user_id} onClose={(art) => { setSilentOpen(false); if (art) refreshIsland(); }} />
          )}
          {glyphOpen && (
            <GlyphCanvas userId={identity.user_id} onClose={(res) => { setGlyphOpen(false); if (res) refreshIsland(); }} />
          )}

          {/* —— 夜间守望 —— */}
          {nightWatch && !bedtime && (
            <div className="pointer-events-none fixed inset-0 z-10 bg-slate-950/45" aria-hidden />
          )}
          {nightWatch && !bedtime && flow.phase === "input" && (
            <div className="fixed inset-x-0 z-40 px-4" style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}>
              <div className="mx-auto max-w-[30rem]">
                <NightWatchBanner onBedtime={() => setBedtime(true)} />
              </div>
            </div>
          )}
          {bedtime && <GoodnightScreen onWake={() => setBedtime(false)} />}

          {/* —— 上岛自由探索（全屏 3D，复用 ExploreMode）—— */}
          {exploreOpen && (
            <Suspense fallback={<div className="fixed inset-0 z-[70] grid place-items-center bg-ink-950 text-white/60">正在登岛……</div>}>
              <ExploreMode
                visual={visual}
                onExit={() => setExploreOpen(false)}
                emotion={flow.result?.emotion}
                bottleNotes={bottleNotes}
                imprints={imprints}
                userId={identity.user_id}
              />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
