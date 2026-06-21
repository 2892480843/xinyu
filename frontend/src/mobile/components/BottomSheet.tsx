import { useEffect, type ReactNode } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label?: string;
}

// 通用底部 Sheet：贴底升起、玻璃面板、抓手 + 背景点击/下拉/Esc 关闭。
// 键盘弹起时整体上移到 var(--kb-inset)（useKeyboardInset 已在桌面 hook 里维护该变量），
// 安全区底部留白，发送/操作区永远在键盘上沿之上。
export default function BottomSheet({ open, onClose, children, label }: Props) {
  // 打开时锁背景滚动
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          {/* 背景：点击关闭 */}
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="absolute inset-0 bg-ink-950/55 backdrop-blur-[2px]"
          />
          {/* sheet 面板：贴底，键盘弹起时上移 */}
          <motion.div
            className="panel-glass-2 relative w-full max-w-[34rem] rounded-t-card-lg px-4 pt-2"
            style={{
              paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
              marginBottom: "var(--kb-inset, 0px)",
              maxHeight: "min(86dvh, calc(100dvh - 3rem))",
              overflowY: "auto",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 360 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
          >
            <div className="mx-auto mb-2 mt-0.5 h-1 w-10 rounded-full bg-white/25" aria-hidden />
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
