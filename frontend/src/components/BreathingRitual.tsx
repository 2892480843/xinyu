import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { EASE_IN_OUT_QUART, SPRING_TAP } from "../lib/motion";
import { play as playSfx } from "../lib/sfx";

interface Props {
  emotionLabel: string;
  onComplete: () => void;
  onSkip: () => void;
}

type Step = "invite" | "inhale" | "hold" | "exhale" | "done";

const CYCLES = 3;
const TIMINGS: Record<Exclude<Step, "invite" | "done">, number> = {
  inhale: 4000,
  hold: 7000,
  exhale: 8000,
};
const STEP_LABEL: Record<Exclude<Step, "invite" | "done">, string> = {
  inhale: "缓缓吸气",
  hold: "停一停",
  exhale: "慢慢呼出",
};
const STEP_HINT: Record<Exclude<Step, "invite" | "done">, string> = {
  inhale: "让海风轻轻进来",
  hold: "潮水稳稳地托着你",
  exhale: "把不安一同送回海里",
};

// 三层错相缩放：外光晕、conic 中圈、内核心
const STEP_SCALE: Record<Exclude<Step, "invite" | "done">, { outer: number; mid: number; inner: number }> = {
  inhale: { outer: 1.85, mid: 1.55, inner: 1.25 },
  hold: { outer: 1.85, mid: 1.55, inner: 1.25 },
  exhale: { outer: 1, mid: 1, inner: 1 },
};

// 各阶段配色（hsl rotate 6deg 内）
const STEP_COLOR: Record<Exclude<Step, "invite" | "done">, { outer: string; mid: string; inner: string }> = {
  inhale: { outer: "#7fd3dd", mid: "#aeb9d6", inner: "#ffffff" },
  hold: { outer: "#f4f1d0", mid: "#aeb9d6", inner: "#ffffff" },
  exhale: { outer: "#9fb4f0", mid: "#7fd3dd", inner: "#f4f1d0" },
};

// 8 颗公转粒子
const PARTICLES = Array.from({ length: 8 });

/**
 * 潮汐呼吸仪式：4-7-8 grounding，循证心理学落地，非医疗。
 * 三层错相缩放（外光晕 28px 模糊 + 中 conic 缓慢 rotate + 内核心）+ 8 颗公转粒子 +
 * 阶段配色微变（吸气偏青/屏息偏暖白/呼气偏极光）+ 中央文字 mode='wait' fade。
 */
export default function BreathingRitual({ emotionLabel, onComplete, onSkip }: Props) {
  const [step, setStep] = useState<Step>("invite");
  const [cycle, setCycle] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (step === "invite" || step === "done") return;
    // 每个阶段进入时给一个 sfx 锚点（不会越来越叠加，且 muted 跟随 MusicControl）
    if (step === "inhale") playSfx("breath_in");
    else if (step === "exhale") playSfx("breath_out");
    const t = window.setTimeout(() => {
      if (step === "inhale") setStep("hold");
      else if (step === "hold") setStep("exhale");
      else if (step === "exhale") {
        const next = cycle + 1;
        if (next >= CYCLES) {
          setStep("done");
        } else {
          setCycle(next);
          setStep("inhale");
        }
      }
    }, TIMINGS[step]);
    return () => window.clearTimeout(t);
  }, [step, cycle]);

  useEffect(() => {
    if (step !== "done") return;
    const t = window.setTimeout(onComplete, 1600);
    return () => window.clearTimeout(t);
  }, [step, onComplete]);

  const activeKey = step === "invite" || step === "done" ? "inhale" : step;
  const scale = reducedMotion ? { outer: 1, mid: 1, inner: 1 } : STEP_SCALE[activeKey];
  const color = STEP_COLOR[activeKey];
  const scaleDuration =
    step === "inhale" ? TIMINGS.inhale / 1000 : step === "exhale" ? TIMINGS.exhale / 1000 : 0;

  return (
    <motion.div
      className="panel-glass-2 w-full max-w-xl mx-auto rounded-card-lg p-8"
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <AnimatePresence>
        {step === "invite" && (
          <motion.div
            key="invite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center"
          >
            <p className="text-caption text-mist-400 tracking-[0.28em] mb-2">岛屿想先陪你做件事</p>
            <h2 className="font-serif text-mist-100 text-title-sm leading-relaxed">
              你的{emotionLabel}听起来有点急
            </h2>
            <p className="font-serif text-mist-300 text-body mt-2 leading-relaxed">
              要不要先跟岛屿一起呼吸一会儿？<br />
              海浪会帮你把节奏放慢下来。
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-2.5 justify-center">
              <motion.button
                type="button"
                onClick={() => setStep("inhale")}
                whileHover={{ y: -1, scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_TAP}
                className="btn-primary"
              >
                好，一起呼吸
              </motion.button>
              <motion.button
                type="button"
                onClick={onSkip}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_TAP}
                className="btn-ghost"
              >
                先继续聊
              </motion.button>
            </div>
            <p className="mt-5 text-caption text-mist-500 leading-relaxed">
              这是一段循证心理学的「4-7-8」呼吸，约 1 分钟，可随时停止。<br />
              《心屿》提供陪伴，并不替代医疗诊断或治疗。
            </p>
          </motion.div>
        )}

        {step !== "invite" && step !== "done" && (
          <motion.div
            key="breathing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center"
          >
            <div className="relative h-64 flex items-center justify-center">
              {/* 8 颗公转粒子 */}
              {!reducedMotion && PARTICLES.map((_, i) => {
                const baseAngle = (i / PARTICLES.length) * 360;
                const radius = step === "inhale" ? 90 : step === "hold" ? 95 : 60;
                return (
                  <motion.span
                    key={i}
                    aria-hidden
                    className="absolute h-1 w-1 rounded-full"
                    style={{
                      background: color.outer,
                      boxShadow: `0 0 8px ${color.outer}`,
                    }}
                    animate={{
                      rotate: [baseAngle, baseAngle + 360],
                      scale: step === "exhale" ? [1, 0.4, 0] : [0.4, 1, 0.4],
                    }}
                    transition={{
                      rotate: { duration: 24, repeat: Infinity, ease: "linear" },
                      scale: { duration: scaleDuration || 3, ease: "easeInOut" },
                    }}
                    initial={{ x: 0, y: 0 }}
                  >
                    <span
                      className="absolute block h-1 w-1 rounded-full"
                      style={{
                        transform: `translate(${Math.cos(baseAngle * Math.PI / 180) * radius}px, ${Math.sin(baseAngle * Math.PI / 180) * radius}px)`,
                        background: color.outer,
                      }}
                    />
                  </motion.span>
                );
              })}

              {/* 外层模糊光晕 */}
              <motion.div
                aria-hidden
                className="absolute rounded-full"
                style={{
                  height: 168,
                  width: 168,
                  background: `radial-gradient(circle, ${color.outer}66 0%, ${color.outer}11 50%, transparent 75%)`,
                  filter: "blur(20px)",
                }}
                animate={{ scale: scale.outer }}
                transition={{ duration: scaleDuration, ease: EASE_IN_OUT_QUART }}
              />

              {/* 中圈 conic 缓慢 rotate */}
              <motion.div
                aria-hidden
                className="absolute rounded-full"
                style={{
                  height: 124,
                  width: 124,
                  background: `conic-gradient(from 0deg, ${color.mid}aa, ${color.outer}55, ${color.mid}aa)`,
                  maskImage: "radial-gradient(circle, black 50%, transparent 70%)",
                  WebkitMaskImage: "radial-gradient(circle, black 50%, transparent 70%)",
                }}
                animate={{ scale: scale.mid, rotate: reducedMotion ? 0 : 360 }}
                transition={{
                  scale: { duration: scaleDuration, ease: EASE_IN_OUT_QUART },
                  rotate: { duration: 28, repeat: Infinity, ease: "linear" },
                }}
              />

              {/* 内核心 */}
              <motion.div
                aria-hidden
                className="absolute rounded-full"
                style={{
                  height: 76,
                  width: 76,
                  background: `radial-gradient(circle, ${color.inner} 0%, ${color.inner}cc 60%, ${color.inner}55 100%)`,
                  boxShadow: `0 0 30px ${color.outer}66`,
                }}
                animate={{ scale: scale.inner }}
                transition={{ duration: scaleDuration, ease: EASE_IN_OUT_QUART }}
              />

              {/* 中央文字（mode='wait' fade） */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  className="relative z-10 font-serif text-ink-900 text-[15px] font-medium"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.4 }}
                >
                  {STEP_LABEL[step]}
                </motion.div>
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait">
              <motion.p
                key={step + "-hint"}
                className="mt-5 font-serif italic text-mist-300 text-body"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.4 }}
              >
                {STEP_HINT[step]}
              </motion.p>
            </AnimatePresence>

            <p className="mt-1 text-caption text-mist-500 tracking-widest tnum">
              第 {cycle + 1} / {CYCLES} 次
            </p>

            <button
              type="button"
              onClick={onSkip}
              className="btn-link mt-6"
            >
              我先休息一下
            </button>
          </motion.div>
        )}

        {step === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center py-8"
          >
            <motion.div
              aria-hidden
              className="mx-auto h-14 w-14 rounded-full"
              style={{
                background: "radial-gradient(circle, #f4f1d0 0%, #f5d28a 60%, transparent 90%)",
                boxShadow: "0 0 32px #f5d28a55",
              }}
              animate={{ scale: [0.9, 1.1, 1], opacity: [0, 1, 0.85] }}
              transition={{ duration: 1.4, ease: "easeOut" }}
            />
            <p className="font-serif text-mist-100 text-title-sm mt-4">慢慢继续吧</p>
            <p className="font-serif italic text-mist-400 text-caption mt-2">岛屿这就接住你</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
