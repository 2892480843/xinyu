import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { resolveScene, EMOTION_META } from "../lib/sceneMap";
import { FEATURE_META } from "../lib/islandMeta";
import FeatureGlyph from "./IslandFeatureIcons";
import { useImmersion } from "../hooks/useImmersion";
import { seedDemoTimeline, fetchTimeline, type TimelineStep } from "../lib/api";

// 模块级确定性星位，夜间步骤用；不在 render 里取随机，保证稳定
const STARS = Array.from({ length: 36 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin(1337 * (n + 1)) * 10000;
    return x - Math.floor(x);
  };
  return { left: `${r(i) * 100}%`, top: `${r(i + 50) * 52}%`, size: 1 + r(i + 99) * 1.6, delay: r(i + 7) * 4 };
});

// 模块级确定性雨丝，雨天步骤用
const RAIN = Array.from({ length: 48 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin(9001 * (n + 3)) * 10000;
    return x - Math.floor(x);
  };
  return { left: `${r(i) * 100}%`, delay: r(i + 11) * 2, duration: 0.6 + r(i + 5) * 0.5, opacity: 0.25 + r(i + 2) * 0.35 };
});

interface Props {
  // 回放哪个身份的轨迹。demo=true 时用专用演示身份，先注入一段跨天示范数据再回放。
  userId: string;
  demo: boolean;
  onClose: () => void;
}

type Phase = "loading" | "playing" | "done" | "empty";

// 整段回望时长目标（毫秒）；逐步均分，但每步不短于一个可读下限。
const TOTAL_MS = 20000;

function relDay(createdAt: string, now: number): string {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return "";
  const days = Math.round((now - t) / 86400000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  return `${days} 天前`;
}

function preload(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (!src) return resolve();
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

export default function TimeMachine({ userId, demo, onClose }: Props) {
  const reduce = useReducedMotion();
  const { immersive } = useImmersion(); // Z 隧道仅在沉浸态开启；静海/reduced 下退回纯淡入
  // 挂载时捕获一次参考时刻：回放期间相对日期稳定，且避免在 render 里调 Date.now()（purity）
  const [now] = useState(() => Date.now());
  const [phase, setPhase] = useState<Phase>("loading");
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [idx, setIdx] = useState(0);
  // 拉数据 + 预加载所有步骤图片，保证延时动画不闪白。用局部 cancelled 标志，StrictMode 双调用安全。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (demo) await seedDemoTimeline("demo-timeline");
      const data = await fetchTimeline(userId);
      if (cancelled) return;
      if (data.length < 3) {
        setPhase("empty");
        return;
      }
      setSteps(data);
      await Promise.all(data.map((s) => preload(resolveScene(s.scene.palette).image)));
      if (cancelled) return;
      setIdx(0);
      setPhase("playing");
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, demo]);

  // 逐帧推进：到最后一步多停一会儿再进入收束
  useEffect(() => {
    if (phase !== "playing" || steps.length === 0) return;
    const per = reduce ? 600 : Math.max(1400, Math.round(TOTAL_MS / steps.length));
    if (idx < steps.length - 1) {
      const t = window.setTimeout(() => setIdx((i) => i + 1), per);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setPhase("done"), reduce ? 900 : 2600);
    return () => window.clearTimeout(t);
  }, [phase, idx, steps.length, reduce]);

  const cur = steps[idx];
  const visual = resolveScene(cur?.scene.palette);
  const features = cur?.island_state.features ?? [];
  const growth = cur?.island_state.growth_level ?? 1;
  const spanDays = steps.length
    ? Math.max(1, Math.round((now - Date.parse(steps[0].created_at)) / 86400000))
    : 0;

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-[#070b16]">
      {/* 根层保持完全不透明（不用 framer 补间 opacity，避免高频重渲染下 rAF 节流卡住半透明）；
          入场柔和感交给下面场景渐变自己的淡入。 */}
      {/* 背景：自带的轻量场景，时序完全可控，避免复用 IslandScene 的重挂载淡入。
          天空→海面渐变按步交叉淡入（情绪/天气的颜色随时间流转），心象元素累积浮现 = 岛屿生长。 */}
      {(phase === "playing" || phase === "done") && (
        <div className="absolute inset-0">
          <AnimatePresence>
            <motion.div
              key={cur?.scene.palette ?? "idle"}
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to bottom, ${visual.skyTop} 0%, ${visual.skyMid} 44%, ${visual.seaHighlight} 64%, ${visual.sea} 100%)`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeInOut" }}
            />
          </AnimatePresence>

          {/* 星空（夜间步骤） */}
          {visual.stars && (
            <div className="absolute inset-0">
              {STARS.map((s, i) => (
                <motion.span
                  key={i}
                  className="absolute rounded-full bg-white"
                  style={{ left: s.left, top: s.top, width: s.size, height: s.size }}
                  animate={reduce ? { opacity: 0.7 } : { opacity: [0.2, 0.9, 0.2] }}
                  transition={{ duration: 4, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
                />
              ))}
            </div>
          )}

          {/* 天气：雨 / 雾，让「雨转晴」在回望里可见 */}
          {(visual.weather === "rain" || visual.weather === "light_rain" || visual.weather === "storm") && (
            <div className="pointer-events-none absolute inset-0">
              {RAIN.map((d, i) => (
                <motion.span
                  key={i}
                  className="absolute top-0"
                  style={{ left: d.left, width: 1.5, height: 16, background: "rgba(255,255,255,0.5)", opacity: d.opacity, borderRadius: 999 }}
                  animate={reduce ? { y: "50vh" } : { y: ["-10vh", "110vh"] }}
                  transition={{ duration: d.duration, delay: d.delay, repeat: Infinity, ease: "linear" }}
                />
              ))}
            </div>
          )}
          {visual.weather === "fog" && (
            <motion.div
              className="pointer-events-none absolute inset-x-0"
              style={{ top: "34%", height: "42%", background: "linear-gradient(to bottom, rgba(255,255,255,0), rgba(220,225,235,0.45), rgba(255,255,255,0))" }}
              animate={reduce ? {} : { x: ["-6%", "6%", "-6%"], opacity: [0.6, 0.9, 0.6] }}
              transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
            />
          )}

          {/* 天体柔光（日/月） */}
          <motion.div
            className="absolute rounded-full"
            style={{
              top: "16%",
              right: "18%",
              width: 116,
              height: 116,
              background: visual.celestial,
              boxShadow: `0 0 90px 30px ${visual.celestialGlow}`,
            }}
            animate={reduce ? { y: 0 } : { y: [0, -8, 0] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* 岛屿剪影 */}
          <svg
            className="absolute bottom-0 left-0 w-full"
            viewBox="0 0 1440 400"
            preserveAspectRatio="none"
            style={{ height: "46%" }}
          >
            <path
              d="M0,210 C160,150 320,180 470,160 C640,138 720,176 860,150 C1020,120 1160,168 1300,150 C1380,140 1440,150 1440,150 L1440,400 L0,400 Z"
              fill={visual.island}
              opacity="0.5"
            />
            <path
              d="M0,250 C200,205 360,235 520,212 C700,186 820,230 980,200 C1160,168 1300,222 1440,205 L1440,400 L0,400 Z"
              fill={visual.island}
              opacity="0.95"
            />
          </svg>

          {/* 心象元素：随成长累积浮现，新元素「破土」长出 = 岛屿生长可见 */}
          <div className="pointer-events-none absolute inset-0">
            {features.map((f, i) => {
              const meta = FEATURE_META[f];
              if (!meta) return null;
              return (
                <motion.span
                  key={f}
                  className="absolute select-none"
                  style={{
                    left: `${meta.left}%`,
                    bottom: `${meta.bottom}%`,
                    color: visual.accent,
                    filter: `drop-shadow(0 1px 5px rgba(0,0,0,0.55)) drop-shadow(0 0 8px ${visual.accent}66)`,
                  }}
                  initial={{ opacity: 0, y: 16, scale: 0.5 }}
                  animate={{ opacity: 0.95, y: 0, scale: 1 }}
                  transition={{ duration: 0.8, delay: i * 0.05, ease: [0.34, 1.56, 0.64, 1] }}
                  title={meta.label}
                >
                  <FeatureGlyph name={f} size={30} />
                </motion.span>
              );
            })}
          </div>
        </div>
      )}
      {/* 顶部压暗，保证前景文字可读 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/60 to-transparent" />

      {/* 进度时间轴 + 跳过 */}
      {phase === "playing" && (
        <div
          className="absolute inset-x-0 z-10 flex items-center gap-3 px-5"
          style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
        >
          <div className="flex flex-1 items-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className="h-1 flex-1 rounded-full transition-colors duration-500"
                style={{ background: i <= idx ? visual.accent : "rgba(255,255,255,0.16)" }}
              />
            ))}
          </div>
          <button onClick={() => setPhase("done")} className="btn-link shrink-0 text-white/55">
            跳过
          </button>
        </div>
      )}

      {/* 顶部信息：相对日期 · 情绪 · 岛屿等级。按 idx 重挂载淡入，不用 mode="wait"（rAF 节流下会死锁卡住） */}
      {phase === "playing" && cur && (
        <motion.div
          key={`hdr-${idx}`}
          className="absolute inset-x-0 z-10 text-center"
          style={{ top: "calc(3.5rem + env(safe-area-inset-top))" }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="font-serif text-[13px] tracking-[0.3em] text-white/70">{relDay(cur.created_at, now)}</p>
          <div className="mt-2 inline-flex items-center gap-2">
            <span className="chip" style={{ borderColor: `${visual.accent}66` }}>
              {EMOTION_META[cur.emotion]?.label ?? cur.emotion}
            </span>
            <span className="text-caption text-white/45">岛屿 第 {growth} 级</span>
          </div>
        </motion.div>
      )}

      {/* 底部：那一天你说过的话。同样按 idx 重挂载淡入，避免 mode="wait" 卡住与 header 失步 */}
      {phase === "playing" && cur && (
        <motion.div
          key={`cap-${idx}`}
          className="absolute inset-x-0 z-10 px-8 text-center"
          style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))", transformPerspective: 800 }}
          initial={immersive ? { opacity: 0, z: -180, filter: "blur(8px)" } : { opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={immersive ? { opacity: 1, z: 0, filter: "blur(0px)" } : { opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="mx-auto max-w-md font-serif text-reading leading-relaxed text-white/85">
            「{cur.text}」
          </p>
        </motion.div>
      )}

      {/* 加载 */}
      {phase === "loading" && (
        <div className="absolute inset-0 z-10 grid place-items-center px-8 text-center">
          <motion.p
            className="font-serif text-[15px] tracking-[0.2em] text-white/70"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          >
            正在把这些天，慢慢收拢起来……
          </motion.p>
        </div>
      )}

      {/* 收束：让评委安静下来的那一刻 */}
      <AnimatePresence>
        {phase === "done" && (
          <motion.div
            key="done"
            className="absolute inset-0 z-20 grid place-items-center px-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2 }}
          >
            <div className="pointer-events-none absolute inset-0 bg-black/45" />
            <motion.div
              className="panel-glass-3 relative w-full max-w-lg rounded-card-lg px-8 py-9 text-center"
              initial={{ opacity: 0, y: 16, scale: 0.97, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            >
              {demo && (
                <p className="mb-4 text-caption tracking-widest text-white/40">— 示范轨迹 —</p>
              )}
              <h2 className="font-display text-[22px] font-light leading-relaxed text-white/95">
                岛屿记得你走过的这些天
              </h2>
              {steps.length > 0 && (
                <p className="mt-5 text-reading leading-loose text-white/75">
                  这 {spanDays} 天，你来过 {steps.length} 次。
                  <br />
                  海面起过雾、下过雨，也有过晴。
                </p>
              )}
              <p className="mt-4 font-serif italic text-reading leading-loose text-mist-200">
                岛屿没有评判你走得快或慢——
                <br />
                它只是，一直记得你来过。
              </p>
              <p className="mt-6 text-caption leading-relaxed text-white/35">
                这不保证你会变好，它只记得你来过。
              </p>
              <button onClick={onClose} className="btn-ghost mt-7">
                回到此刻
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 真实用户记忆太少：温柔提示而非空动画 */}
      {phase === "empty" && (
        <div className="absolute inset-0 z-20 grid place-items-center px-8">
          <div className="panel-glass-3 w-full max-w-sm rounded-card-lg px-8 py-9 text-center">
            <h2 className="font-display text-[20px] font-light text-white/95">
              你和岛屿的故事才刚开始
            </h2>
            <p className="mt-4 text-reading leading-loose text-white/70">
              多来坐几次、说说心情，
              <br />
              就能在这里回望你走过的路了。
            </p>
            <button onClick={onClose} className="btn-ghost mt-7">
              好
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
