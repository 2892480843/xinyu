import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FEATURE_META } from "../lib/islandMeta";
import { play as playSfx } from "../lib/sfx";

interface Props {
  message: string;
  artifactKey?: string;
}

/**
 * 离岛信件：用户超过 48 小时没回来时，在输入态顶部静静浮现一封短信。
 * "反 push 红点"的差异化设计——岛屿用上次留下的物件主动留话，
 * 不发推送、不打卡焦虑、关掉就走。
 */
export default function WelcomeBackCard({ message, artifactKey }: Props) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { if (message) playSfx("reveal"); }, [message]); // 离岛信浮现
  if (dismissed || !message) return null;
  const icon = artifactKey ? (FEATURE_META[artifactKey]?.icon ?? "💌") : "💌";

  return (
    <motion.div
      className="w-full max-w-xl mx-auto mb-4 rounded-2xl bg-white/9 backdrop-blur-md border border-white/15 p-4"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.3 }}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5" aria-hidden="true">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-white/45 tracking-[0.28em] mb-1">岛屿在想你</p>
          <p className="text-white/80 text-[13px] leading-relaxed">{message}</p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="收起这封离岛信"
          className="text-white/35 hover:text-white/80 text-xs leading-none mt-1 transition"
        >
          ×
        </button>
      </div>
    </motion.div>
  );
}
