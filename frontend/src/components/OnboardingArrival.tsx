import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EASE_OUT_EXPO } from "../lib/motion";
import { play as playSfx } from "../lib/sfx";

interface Props {
  nickname: string;
  onDone: () => void;
}

/**
 * 首次登岛过场：黑屏 fade → 月光岛屿剪影从 8% 缩到 100% → 打字机欢迎语 → 浮出 onDone。
 * sessionStorage 防重复，只在 IdentityGate 之后第一次进入岛屿时播。
 */
export default function OnboardingArrival({ nickname, onDone }: Props) {
  const [phase, setPhase] = useState<"fade" | "island" | "type" | "wave">("fade");
  const [typed, setTyped] = useState("");

  const line1 = "你来了。";
  const line2 = `这是「${nickname}」的心屿。`;
  const full = `${line1}\n${line2}`;

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("island"), 700);
    const t2 = setTimeout(() => {
      setPhase("type");
      playSfx("chime");
    }, 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    if (phase !== "type") return;
    let i = 0;
    const tick = () => {
      i += 1;
      setTyped(full.slice(0, i));
      if (i < full.length) timer = window.setTimeout(tick, 75);
      else timer = window.setTimeout(() => setPhase("wave"), 900);
    };
    let timer = window.setTimeout(tick, 200);
    return () => window.clearTimeout(timer);
  }, [phase, full]);

  useEffect(() => {
    if (phase !== "wave") return;
    const t = window.setTimeout(onDone, 1100);
    return () => window.clearTimeout(t);
  }, [phase, onDone]);

  return (
    <AnimatePresence>
      <motion.div
        key="arrival"
        className="fixed inset-0 z-50 grid place-items-center"
        style={{ background: "#080b16" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "wave" ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: phase === "wave" ? 1.1 : 0.5, ease: "easeInOut" }}
      >
        <div className="text-center px-6">
          <motion.svg
            viewBox="0 0 48 48"
            className="mx-auto mb-8"
            aria-hidden
            initial={{ scale: 0.08, opacity: 0 }}
            animate={{
              scale: phase === "fade" ? 0.08 : 1,
              opacity: phase === "fade" ? 0 : 1,
            }}
            transition={{ duration: 1.4, ease: EASE_OUT_EXPO }}
            style={{ width: 72, height: 72, filter: "drop-shadow(0 0 28px rgba(245,210,138,0.55))" }}
          >
            <defs>
              <radialGradient id="arr-moon" cx="0.5" cy="0.5">
                <stop offset="0" stopColor="#fff" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="32" cy="14" r="5" fill="url(#arr-moon)" opacity="0.95" />
            <path d="M0 36 Q12 30 24 32 T48 36 L48 48 L0 48 Z" fill="#9fb4f0" opacity="0.85" />
            <path d="M14 36 Q20 22 26 24 T38 36 Z" fill="#0a0e1f" />
            <path d="M0 42 Q14 40 26 41 T48 42" stroke="#fff" strokeOpacity="0.22" strokeWidth="0.5" fill="none" />
          </motion.svg>

          {phase === "type" || phase === "wave" ? (
            <motion.p
              className="font-serif text-mist-100 text-reading whitespace-pre-line"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              {typed}
              {phase === "type" && typed.length < full.length && (
                <span className="inline-block w-[2px] h-4 bg-mist-200 ml-0.5 align-middle animate-pulse" />
              )}
            </motion.p>
          ) : null}
        </div>

        {/* 一圈涟漪从月亮处扩散到边缘——配合 onDone 完成 */}
        {phase === "wave" && (
          <motion.span
            aria-hidden
            className="absolute left-1/2 top-1/2 rounded-full pointer-events-none border"
            style={{
              width: 80,
              height: 80,
              x: "-50%",
              y: "-50%",
              borderColor: "rgba(159,180,240,0.5)",
            }}
            initial={{ scale: 0, opacity: 0.8 }}
            animate={{ scale: 30, opacity: 0 }}
            transition={{ duration: 1.4, ease: "easeOut" }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
