import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { silentCompanion, type ArtifactItem } from "../lib/api";

interface Props {
  userId: string;
  durationSeconds?: number;
  onClose: (artifact: ArtifactItem | null) => void;
}

/**
 * 静默坐岛：用户进入岛屿但什么都说不出——这一条第一次承认"说不出"是合法情绪状态本身。
 * 公益赛道里最锋利的差异化叙事——精准对接重度抑郁/PTSD/严重社恐人群（恰恰是被"请输入心情"劝退的高需求群体）。
 *
 * 设计：进入后中央一颗呼吸光晕，环形倒计时静默推进；倒计时结束自动落下一枚「静默贝壳」并温柔关闭。
 * 不收集行为信号、不打开摄像头——任何"读懂沉默"的努力都是侵入。沉默就是沉默。
 */
export default function SilentMode({ userId, durationSeconds = 30, onClose }: Props) {
  // 上下限与后端一致（后端钳到 [0,600]），避免倒计时时长与刻在贝壳上的时长矛盾(#21)
  const total = Math.min(600, Math.max(8, durationSeconds));
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<"sitting" | "closing">("sitting");
  const reducedMotion = useReducedMotion();
  const saved = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phase !== "sitting") return;
    const t = window.setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= total) {
          window.clearInterval(t);
          return total;
        }
        return e + 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase, total]);

  // 倒计时到 → 留下静默贝壳 → 1.5s 关闭。定时器存 ref 并在卸载时清理(#20)
  useEffect(() => {
    if (elapsed < total || saved.current) return;
    saved.current = true;
    setPhase("closing");
    (async () => {
      const artifact = await silentCompanion(userId, total);
      closeTimer.current = setTimeout(() => onClose(artifact), 1800);
    })();
  }, [elapsed, total, userId, onClose]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const progress = elapsed / total; // 0..1
  const circumference = 2 * Math.PI * 56;

  const leaveEarly = async () => {
    if (saved.current) return;
    saved.current = true;
    const artifact = await silentCompanion(userId, Math.max(0, elapsed));
    onClose(artifact);
  };

  return (
    <motion.div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/65 backdrop-blur-md px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9, ease: "easeInOut" }}
      role="dialog"
      aria-label="静默坐岛"
    >
      {/* 中心呼吸圈 + 环形倒计时 */}
      <div className="relative h-44 w-44 mb-8 flex items-center justify-center">
        {/* 外圈环形倒计时 */}
        <svg className="absolute inset-0" viewBox="0 0 128 128" aria-hidden="true">
          <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
          <motion.circle
            cx="64"
            cy="64"
            r="56"
            fill="none"
            stroke="rgba(248,231,180,0.45)"
            strokeWidth="1.5"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            transform="rotate(-90 64 64)"
            strokeLinecap="round"
            transition={{ duration: 1, ease: "linear" }}
          />
        </svg>
        {/* 内层呼吸月晕 */}
        <motion.div
          className="h-24 w-24 rounded-full bg-gradient-to-br from-amber-100/70 to-amber-300/55"
          style={{ filter: "blur(1px)", boxShadow: "0 0 64px rgba(252,211,77,0.25)" }}
          animate={reducedMotion ? { scale: 1 } : { scale: [1, 1.08, 1] }}
          transition={reducedMotion ? undefined : { duration: 6, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden="true"
        />
        {/* 中央倒计时数字 - 极淡 */}
        <span className="absolute text-white/40 text-[12px] tracking-widest tabular-nums">
          {phase === "closing" ? "🌑" : `${total - elapsed}`}
        </span>
      </div>

      {phase === "sitting" ? (
        <>
          <p className="text-white/85 text-lg tracking-wider mb-2">先在岛上坐一会儿</p>
          <p className="text-white/45 text-sm leading-relaxed max-w-sm text-center">
            什么都不用说，也不必把现在的感受拼成一个名字。<br />
            岛屿就在这儿——海浪替你数着秒数。
          </p>
          <button
            type="button"
            onClick={leaveEarly}
            className="mt-12 text-white/35 text-[12px] hover:text-white/75 transition"
          >
            想离开了，岛屿不催你
          </button>
        </>
      ) : (
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <p className="text-white/90 text-lg">没关系，你来了就好</p>
          <p className="text-white/45 text-[12px] mt-2">
            岛上多了一枚静默贝壳，岛屿替你收着这一刻。
          </p>
        </motion.div>
      )}

      <p className="absolute bottom-6 text-white/25 text-[10px] leading-relaxed text-center max-w-sm">
        岛屿不读你的鼠标、不开摄像头、不写记忆——沉默就是沉默。
      </p>
    </motion.div>
  );
}
