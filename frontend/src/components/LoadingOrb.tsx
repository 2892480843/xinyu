import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EASE_OUT_EXPO } from "../lib/motion";

interface Props {
  accent: string;
  message?: string;
  agentsDone?: number;
  totalAgents?: number;
  onCancel?: () => void;
}

// 海面涟漪 + 中心岛屿剪影 + 文案 fade + 5 信使进度点
export default function LoadingOrb({
  accent,
  message = "岛屿在听你说……",
  agentsDone = 0,
  totalAgents = 5,
  onCancel,
}: Props) {
  return (
    <div className="flex flex-col items-center gap-stack-sm py-stack-sm">
      <div className="relative h-24 w-24 grid place-items-center">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute rounded-full border"
            style={{ borderColor: `${accent}66`, width: 56, height: 56 }}
            animate={{ scale: [1, 2.6], opacity: [0.55, 0] }}
            transition={{ duration: 2.8, delay: i * 0.7, repeat: Infinity, ease: "easeOut" }}
          />
        ))}
        <motion.div
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: 88,
            height: 88,
            background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)`,
            filter: "blur(8px)",
          }}
          animate={{ scale: [0.92, 1.08, 0.92], opacity: [0.6, 0.95, 0.6] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="relative h-14 w-14 grid place-items-center"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          style={{ filter: `drop-shadow(0 0 18px ${accent}88)` }}
        >
          <svg viewBox="0 0 48 48" className="h-14 w-14">
            <defs>
              <radialGradient id="orb-moon" cx="0.5" cy="0.5">
                <stop offset="0" stopColor="#fff" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="32" cy="14" r="5" fill="url(#orb-moon)" opacity="0.95" />
            <path d="M0 36 Q12 30 24 32 T48 36 L48 48 L0 48 Z" fill={accent} opacity="0.85" />
            <path d="M14 36 Q20 22 26 24 T38 36 Z" fill="#0a0e1f" />
            <path d="M0 42 Q14 40 26 41 T48 42" stroke="#fff" strokeOpacity="0.18" strokeWidth="0.5" fill="none" />
          </svg>
        </motion.div>
      </div>

      <div className="h-6 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={message}
            className="font-serif text-mist-300 text-[14px] tracking-[0.15em] text-center"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
          >
            {message}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-2" aria-label={`已抵达 ${agentsDone}/${totalAgents} 位信使`}>
        {Array.from({ length: totalAgents }).map((_, i) => {
          const done = i < agentsDone;
          const active = i === agentsDone;
          return (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: done ? accent : "rgba(255,255,255,0.18)" }}
              animate={active ? { scale: [1, 1.6, 1], opacity: [0.6, 1, 0.6] } : { scale: 1 }}
              transition={{ duration: 1.4, repeat: active ? Infinity : 0, ease: "easeInOut" }}
            />
          );
        })}
      </div>

      <LateCancel onCancel={onCancel} />
    </div>
  );
}

function LateCancel({ onCancel }: { onCancel?: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  if (!show || !onCancel) return null;
  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      onClick={onCancel}
      className="btn-link mt-1"
    >
      岛屿在路上 · 要不要先回去？
    </motion.button>
  );
}
