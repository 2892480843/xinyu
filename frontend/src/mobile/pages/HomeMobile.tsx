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
import MobileTabBar, { type MobileTab } from "../components/MobileTabBar";
import BottomSheet from "../components/BottomSheet";
import MobileInbox from "../components/MobileInbox";
import MemoryTab from "../components/MemoryTab";
import SelfTab from "../components/SelfTab";

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

  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
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
                className="relative z-20 mx-auto flex min-h-[100dvh] w-full max-w-[34rem] flex-col px-4"
                style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))", paddingBottom: "7.5rem" }}
              >
                {tab === "island" && (
                  <div className="flex flex-1 flex-col">
                    {/* 缩小品牌 */}
                    <div className="mt-1 text-center select-none">
                      <h1 className="font-display text-[22px] font-light tracking-[0.5em] pl-[0.5em] text-white/90">心 屿</h1>
                      <p className="mt-1 font-serif italic text-[12px] tracking-[0.22em] text-mist-400">— 一座会回应你的岛屿 —</p>
                    </div>

                    {/* 岛屿留言 */}
                    <div className="mt-4">
                      <MobileInbox revision={revision} welcomeBack={welcomeBack} whisper={whisper} />
                    </div>

                    {/* 岛屿成长摘要 */}
                    {activeIsland && (
                      <div className="panel-glass-1 mx-auto mt-4 w-full max-w-[30rem] rounded-card px-4 py-3">
                        <div className="flex items-center gap-2">
                          {[1, 2, 3, 4, 5].map((lv) => (
                            <span
                              key={lv}
                              className="h-1.5 flex-1 rounded-full"
                              style={{ background: lv <= activeIsland.growth_level ? visual.accent : "rgba(255,255,255,0.12)" }}
                            />
                          ))}
                        </div>
                        <p className="mt-2 text-[13px] leading-relaxed text-white/78">{activeIsland.summary}</p>
                        {activeIsland.chapter && (
                          <p className="mt-1 font-serif italic text-[12px] leading-relaxed text-white/50">{activeIsland.chapter}</p>
                        )}
                      </div>
                    )}

                    {/* 倾诉引导 */}
                    <div className="mt-auto flex flex-col items-center gap-3 pt-8 pb-2 text-center">
                      <p className="font-serif text-[14px] leading-relaxed text-white/70">把今天的心情，说给岛屿听。<br />说一个字、或什么都不说坐一会儿，也可以。</p>
                      <button
                        type="button"
                        onClick={() => setComposeOpen(true)}
                        className="island-cta"
                        style={{ background: `linear-gradient(165deg, ${visual.accent} 0%, ${visual.accent}d9 52%, ${visual.accent}b3 100%)` }}
                      >
                        <span className="island-cta__emoji" aria-hidden>🌊</span>
                        说给岛屿
                      </button>
                      <button
                        type="button"
                        onClick={() => setExploreOpen(true)}
                        onPointerEnter={prefetchExplore}
                        onPointerDown={prefetchExplore}
                        className="btn-ghost px-5 py-2 text-[13px]"
                      >
                        🏝 上岛走走
                      </button>
                    </div>
                  </div>
                )}

                {tab === "memory" && (
                  <MemoryTab
                    memoryCount={memories.length}
                    onMindMap={() => setMindOpen(true)}
                    onTimeMachine={() => setTmOpen(true)}
                    onIslandMap={() => setMapOpen(true)}
                    onPhrases={() => setPhrasesOpen(true)}
                    onLetter={() => setLetterOpen(true)}
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
                        className="panel-glass-1 flex items-center gap-3 rounded-card px-4 py-2.5"
                      >
                        <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${skin3d.wanted ? "bg-white/55" : "bg-white/15"}`}>
                          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-[#0a0e1f] transition-all ${skin3d.wanted ? "left-3.5" : "left-0.5"}`} />
                        </span>
                        <span className="text-[13px] text-white/80">真 3D 岛屿背景{skin3d.wanted ? "（已开）" : "（实验·更耗电）"}</span>
                      </button>
                    ) : undefined}
                  />
                )}
              </div>

              <MobileTabBar active={tab} onSelect={setTab} onCompose={() => setComposeOpen(true)} accent={visual.accent} />
            </>
          )}

          {/* 倾诉 Sheet：从底升起，键盘友好 */}
          <BottomSheet open={composeOpen} onClose={() => setComposeOpen(false)} label="说给岛屿">
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
                <button type="button" onClick={() => setMindOpen(false)} className="btn-ghost mb-3 px-3 py-1.5 text-[13px]">‹ 返回</button>
                <MindMap memories={memories} island={activeIsland} artifacts={artifacts} open onToggle={() => setMindOpen(false)} userId={identity.user_id} />
              </div>
            </div>
          )}
          {tmOpen && <TimeMachine userId={identity.user_id} demo={memories.length === 0} onClose={() => setTmOpen(false)} />}
          {mapOpen && <IslandMap island={activeIsland} artifacts={artifacts} onClose={() => setMapOpen(false)} />}
          <BottomSheet open={phrasesOpen} onClose={() => setPhrasesOpen(false)} label="私房安慰话">
            <IslandPhrases userId={identity.user_id} />
          </BottomSheet>
          <BottomSheet open={letterOpen} onClose={() => setLetterOpen(false)} label="岛屿年报">
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
