import { motion } from "framer-motion";
import { ERROR_VOICE, ISLAND_HINTS, type ErrorVoiceKind } from "../lib/islandVoice";
import { EASE_OUT_EXPO } from "../lib/motion";

interface Props {
  kind: ErrorVoiceKind;
  onRetry: () => void;
  onDismiss: () => void;
}

// 错误状态——岛屿在失语，而不是 HTTP 在报错
export default function IslandHushCard({ kind, onRetry, onDismiss }: Props) {
  const voice = ERROR_VOICE[kind];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
      transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
      className="panel-glass-2 rounded-card p-stack-md mb-stack-md w-full max-w-xl mx-auto"
    >
      <div className="flex items-center gap-2 mb-2">
        <span aria-hidden className="block h-1.5 w-1.5 rounded-full bg-lighthouse animate-breathe" />
        <p className="text-caption text-mist-400">岛屿轻声</p>
      </div>
      <p className="font-serif text-mist-100 text-reading">{voice.title}。</p>
      <p className="font-serif text-mist-300 text-body mt-2">{voice.body}</p>
      <div className="mt-stack-md flex flex-wrap gap-stack-sm">
        <button className="btn-primary" onClick={onRetry}>{ISLAND_HINTS.retry}</button>
        <button className="btn-ghost" onClick={onDismiss}>{ISLAND_HINTS.dismiss}</button>
      </div>
    </motion.div>
  );
}
