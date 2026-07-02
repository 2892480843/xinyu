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
import MindMap from "../../components/MindMap";
import MusicControl from "../../components/MusicControl";
import IslandAssistant from "../../components/IslandAssistant";
import IslandHushCard from "../../components/IslandHushCard";
import UserBadge from "../../components/UserBadge";
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
import { useNightWatch } from "../../lib/useNightWatch";
import { useImmersion } from "../../hooks/useImmersion";
import { useSkin3d } from "../../hooks/useSkin3d";
// —— 移动端专属外壳 ——
import { useReflectFlow } from "../hooks/useReflectFlow";
import MobileInbox from "../components/MobileInbox";
import MobileBrand from "../components/MobileBrand";

// 重 chunk 懒加载（与桌面 Home 同款）：首页空闲时提前预热，用户靠近入口时再兜底补触发。
const Island3D = lazy(() => import("../../components/Island3D"));
const importExplore = () => import("../../components/ExploreMode");
const ExploreMode = lazy(importExplore);
let explorePrefetched = false;
function prefetchExplore() {
  if (explorePrefetched) return;
  explorePrefetched = true;
  importExplore().then((m) => { try { m.prefetchExploreAssets?.(); } catch { /* ignore */ } });
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

async function requestExploreLandscape() {
  if (typeof document === "undefined" || typeof screen === "undefined") return;
  const doc = document as FullscreenDocument;
  const root = document.documentElement as FullscreenElement;
  try {
    if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
      if (root.requestFullscreen) await root.requestFullscreen();
      else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
    }
  } catch { /* 浏览器不支持或用户代理拒绝时，保留自然旋转兜底 */ }
  try {
    await screen.orientation?.lock?.("landscape");
  } catch { /* iOS Safari 等不支持 lock；manifest any 仍允许用户手动横屏 */ }
}

function releaseExploreLandscape() {
  if (typeof document === "undefined" || typeof screen === "undefined") return;
  const doc = document as FullscreenDocument;
  try { screen.orientation?.unlock?.(); } catch { /* ignore */ }
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) void doc.webkitExitFullscreen();
  } catch { /* ignore */ }
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
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  // 非语言入口 + 足迹覆盖层 + 夜间守望
  const [silentOpen, setSilentOpen] = useState(false);
  const [glyphOpen, setGlyphOpen] = useState(false);
  const [mindOpen, setMindOpen] = useState(false);
  const [tmOpen, setTmOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
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
    setMemories([]);
    setArtifacts([]);
    setWelcomeBack(null);
    setWhisper(null);
    setRevision(null);
    setFlowIsland(null);
    resetFlow();
    setSilentOpen(false);
    setGlyphOpen(false);
    setMindOpen(false);
    setTmOpen(false);
    setMapOpen(false);
  };

  const handleDeleteData = async () => {
    if (!identity) return;
    if (typeof window !== "undefined" &&
      !window.confirm("将彻底删除这座岛屿在后端保存的全部记忆、物件与私房话，无法恢复。确定吗？")) return;
    try { await deleteIdentity(identity.user_id); } catch { /* 删除失败也清本地 */ }
    handleClearIdentity();
  };

  const onSubmit = (text: string, ephemeral: boolean) => {
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
  const openSilent = () => setSilentOpen(true);
  const openGlyph = () => setGlyphOpen(true);
  const openExploreMode = useCallback(() => {
    prefetchExplore();
    setExploreOpen(true);
    void requestExploreLandscape();
  }, []);
  const closeExploreMode = useCallback(() => {
    setExploreOpen(false);
    releaseExploreLandscape();
  }, []);
  // 首页就绪后空闲时预取「上岛」重 chunk + 模型，降低首次进入全岛地图时的等待。
  useEffect(() => {
    const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || /2g/.test(conn?.effectiveType ?? "")) return;
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) { ric(prefetchExplore, { timeout: 3000 }); return; }
    const t = window.setTimeout(prefetchExplore, 1800);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden overflow-y-auto overscroll-contain">
      {/* 常驻岛屿背景：移动端与 Web 同款，WebGL 支持时默认用真 3D；不再受手动 3D 开关限制，崩溃回退 2D。 */}
      <div className="fixed inset-0" style={{ zIndex: 0 }} aria-hidden>
        {skin3d.supported ? (
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
            <div className="mobile-web-shell relative z-20 mx-auto flex w-full max-w-[42rem] flex-col overflow-y-auto">
              <header className="mobile-web-header">
                <div className="mobile-web-brand">
                  <MobileBrand subtitle />
                </div>

                <div className="mobile-web-top-actions" aria-label="身份与心象入口">
                  <UserBadge
                    identity={identity}
                    onClear={handleClearIdentity}
                    onDeleteData={handleDeleteData}
                  />
                  <button
                    type="button"
                    onClick={() => setMindOpen(true)}
                    className="mobile-web-map-button"
                  >
                    心象地图
                  </button>
                </div>
              </header>

              <main className="mobile-web-main">
                <div className="mobile-web-stage">
                  {flow.error && (
                    <IslandHushCard
                      kind={flow.errorKind}
                      onRetry={flow.retry}
                      onDismiss={flow.dismissError}
                    />
                  )}

                  <MobileInbox revision={revision} welcomeBack={welcomeBack} whisper={whisper} />

                  {nightWatch && !bedtime && (
                    <div className="mobile-web-nightwatch">
                      <NightWatchBanner onBedtime={() => setBedtime(true)} />
                    </div>
                  )}

                  <section className="mobile-web-input" aria-label="说给岛屿">
                    <MoodInput onSubmit={onSubmit} onSilent={openSilent} onGlyph={openGlyph} loading={false} variant="mobile-web" />
                    {memories.length > 0 && (
                      <motion.p
                        className="mobile-web-memory-line"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.35 }}
                      >
                        岛屿记得你上次的 {EMOTION_META[memories[0].emotion]?.label ?? "心事"}，欢迎回来
                      </motion.p>
                    )}
                  </section>

                  <section className="mobile-web-primary-action" aria-label="上岛探索">
                    <motion.button
                      type="button"
                      onClick={() => { void openExploreMode(); }}
                      onPointerEnter={prefetchExplore}
                      onPointerDown={prefetchExplore}
                      onFocus={prefetchExplore}
                      className="island-cta"
                      style={{
                        background: `linear-gradient(165deg, ${visual.accent} 0%, ${visual.accent}d9 52%, ${visual.accent}b3 100%)`,
                        boxShadow: `0 16px 42px -10px ${visual.accent}, 0 3px 12px -3px ${visual.accent}cc, inset 0 1px 0 rgba(255,255,255,0.75)`,
                      }}
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
                      <motion.span
                        className="island-cta__ring"
                        animate={{ scale: [1, ctaGlow.ringScale], opacity: [ctaGlow.ringOpacity, 0] }}
                        transition={{ duration: ctaGlow.ringDur, repeat: Infinity, ease: "easeOut" }}
                      />
                      <span className="island-cta__shine" aria-hidden />
                      上岛走走
                      <span className="island-cta__arrow" aria-hidden>›</span>
                    </motion.button>
                  </section>

                  <section className="mobile-web-secondary-actions" aria-label="更多入口">
                    {memories.length > 0 && (
                      <button type="button" onClick={() => setTmOpen(true)} className="btn-link">
                        回望这些天 ›
                      </button>
                    )}
                    {memories.length > 0 && (
                      <IslandAssistant userId={identity.user_id} zIndexClass="z-[85]" />
                    )}
                    {(memories.length > 0 || artifacts.length > 0) && (
                      <button type="button" onClick={() => setMapOpen(true)} className="btn-link">
                        登高望岛 ›
                      </button>
                    )}
                  </section>
                </div>
              </main>

              <footer className="mobile-web-footer">
                <p>《心屿》提供情感陪伴，并非心理咨询或医疗服务 · 如处于危机请联系专业热线</p>
              </footer>
            </div>
          )}

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
          {bedtime && <GoodnightScreen onWake={() => setBedtime(false)} />}

          {/* —— 上岛自由探索（全屏 3D，复用 ExploreMode）—— */}
          {exploreOpen && (
            <Suspense fallback={<div className="fixed inset-0 z-[70] grid place-items-center bg-ink-950 text-white/60">正在登岛……</div>}>
              <ExploreMode
                visual={visual}
                onExit={closeExploreMode}
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
