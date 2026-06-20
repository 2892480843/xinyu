import { useState } from "react";
import { motion } from "framer-motion";
import FeatureGlyph from "./IslandFeatureIcons";

interface Props {
  whisper: string;
  artifactKey?: string;
}

/**
 * 岛屿主动低语：用户刚进岛屿、还没说话时，岛屿用 hy3-preview 主动说一句 15-30 字的话。
 * 这是"AI 真实性"的直接体现——用户一刷新页面就能看到 LLM 在工作。
 * 文案在后端被 prompt 严格约束：无问号、不监视感、必带具体岛屿元素。
 */
export default function IslandWhisper({ whisper, artifactKey }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !whisper) return null;
  const glyphName = artifactKey || "tide";

  return (
    <motion.div
      className="w-full max-w-xl mx-auto mb-4 px-1"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.1, delay: 0.15 }}
    >
      <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-white/6 backdrop-blur-md border border-white/10">
        <span className="mt-0.5 shrink-0 text-white/75" aria-hidden="true">
          <FeatureGlyph name={glyphName} size={16} />
        </span>
        <p className="flex-1 min-w-0 text-white/72 text-[13px] leading-relaxed italic">
          {whisper}
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="收起岛屿低语"
          className="text-white/30 hover:text-white/80 text-xs leading-none mt-1 transition shrink-0"
        >
          ×
        </button>
      </div>
    </motion.div>
  );
}
