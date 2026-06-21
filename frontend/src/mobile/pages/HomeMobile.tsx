import { useCallback, useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
// —— 复用桌面的黑盒组件（零改动）——
import IslandScene from "../../components/IslandScene";
import Particles from "../../components/Particles";
import IdentityGate from "../../components/IdentityGate";
import OnboardingArrival from "../../components/OnboardingArrival";
import NarrativeCard from "../../components/NarrativeCard";
import BreathingRitual from "../../components/BreathingRitual";
import SafetyNotice from "../../components/SafetyNotice";
import LoadingOrb from "../../components/LoadingOrb";
import MoodInput from "../../components/MoodInput";
import UserBadge from "../../components/UserBadge";
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
// —— 移动端专属外壳 ——
import { useReflectFlow } from "../hooks/useReflectFlow";
import MobileTabBar, { type MobileTab } from "../components/MobileTabBar";
import BottomSheet from "../components/BottomSheet";
import MobileInbox from "../components/MobileInbox";

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
  const [, setMemories] = useState<MemoryItem[]>([]); // 列表在 P2「足迹」用，此处先拉好 + 反思后刷新
  const [, setArtifacts] = useState<ArtifactItem[]>([]); // 收藏在 P2「足迹」用，此处先拉好
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

  // 场景视觉：最终结果 > 流式 scene > 默认（与桌面 Home.tsx:278-290 一致）。
  const activeScene = flow.result?.scene ?? flow.liveScene;
  const visual = activeScene ? resolveScene(activeScene.palette) : DEFAULT_VISUAL;
  const activeIsland = flow.result?.island_state ?? flow.liveIsland ?? flow.island;
  const emotionLabel = EMOTION_META[flow.result?.emotion ?? ""]?.label ?? "此刻";
  const agentsDone = flow.liveAgents.filter((a) => a.status === "done").length;

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

  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      {/* 常驻岛屿背景（2D；3D 旗舰皮在 P3）+ 装饰粒子 */}
      <div className="fixed inset-0" style={{ zIndex: 0 }} aria-hidden>
        <IslandScene visual={visual} features={activeIsland?.features ?? []} />
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
                    </div>
                  </div>
                )}

                {tab === "memory" && (
                  <div className="flex flex-1 flex-col items-center justify-center text-center px-6">
                    <p className="font-serif text-[15px] leading-relaxed text-white/65">足迹 · 心象地图与时光机</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-white/40">你留在岛上的每一刻，正在这里聚成轨迹。<br />（即将在这里展开）</p>
                  </div>
                )}

                {tab === "self" && (
                  <div className="flex flex-1 flex-col items-center gap-5 pt-6">
                    <UserBadge identity={identity} onClear={handleClearIdentity} onDeleteData={handleDeleteData} />
                    <p className="px-8 text-center text-[12px] leading-relaxed text-white/40">
                      心屿不需要账号密码，昵称只存在这台设备上。<br />随时可以删除这座岛屿的全部痕迹。
                    </p>
                  </div>
                )}
              </div>

              <MobileTabBar active={tab} onSelect={setTab} onCompose={() => setComposeOpen(true)} accent={visual.accent} />
            </>
          )}

          {/* 倾诉 Sheet：从底升起，键盘友好 */}
          <BottomSheet open={composeOpen} onClose={() => setComposeOpen(false)} label="说给岛屿">
            <MoodInput onSubmit={onSubmit} loading={false} />
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
        </>
      )}
    </div>
  );
}
