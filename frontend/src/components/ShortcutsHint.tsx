import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { useIsTouch } from "../lib/device";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { key: string; desc: string }[] = [
  { key: "S", desc: "现在什么都说不出 · 坐一会儿" },
  { key: "G", desc: "用手写一个字给岛屿" },
  { key: "M", desc: "翻开心象地图" },
  { key: "?", desc: "再看一次这张提示" },
  { key: "⌘ Enter", desc: "把话寄到岛上" },
];

// 触屏手势版：移动端无键盘，把可做的轻操作列出来
const GESTURES: { key: string; desc: string }[] = [
  { key: "✍", desc: "写一个字给岛屿" },
  { key: "🤍", desc: "什么都说不出 · 坐一会儿" },
  { key: "🗺", desc: "翻开心象地图" },
  { key: "🏝", desc: "上岛走走 · 收集心愿" },
  { key: "🎤", desc: "对着海说出心情" },
];

export default function ShortcutsHint({ open, onClose }: Props) {
  const isTouch = useIsTouch();
  const items = isTouch ? GESTURES : SHORTCUTS;
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(t);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="panel-glass-3 fixed left-1/2 z-40 rounded-card-lg px-5 py-4 min-w-[260px] max-w-[min(22rem,calc(100vw-2rem))]"
          style={{ bottom: "calc(7rem + env(safe-area-inset-bottom))", x: "-50%" }}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          onClick={onClose}
        >
          <p className="font-serif text-mist-100 text-title-sm mb-3 text-center">
            {isTouch ? "岛屿的小手势" : "岛屿的小快捷键"}
          </p>
          <div className="space-y-2">
            {items.map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                <span
                  className="grid place-items-center min-w-[44px] h-7 px-2 rounded-md text-caption font-medium tnum"
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.22)",
                    color: "rgba(255,255,255,0.92)",
                    fontFamily: isTouch ? "system-ui" : "system-ui, monospace",
                  }}
                >
                  {s.key}
                </span>
                <span className="font-serif text-mist-300 text-meta">{s.desc}</span>
              </div>
            ))}
          </div>
          <p className="font-serif italic text-mist-500 text-caption mt-3 text-center">轻点这张卡 · 让它沉回海里</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
