import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CartoonMoon } from "./CartoonMoon";

const DISMISS_KEY = "xinyu.nightwatch.dismissed";
const GOODNIGHT_HOLD_MS = 5000; // 晚安屏前 5 秒不暴露"回到岛屿"链接，避免误触

interface BannerProps {
  onBedtime: () => void;
}

/**
 * 守夜邀请卡：在 input 阶段顶部出现，给用户两个温柔的下一步——
 * 现在就休息（→ 晚安屏）或留下来说说话（→ dismiss banner，正常使用）。
 */
export function NightWatchBanner({ onBedtime }: BannerProps) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* sessionStorage 不可用时本次会话仍可继续 */
    }
    setDismissed(true);
  };

  const handleBedtime = () => {
    dismiss();
    onBedtime();
  };

  return (
    <motion.div
      className="w-full max-w-xl mx-auto mb-4 rounded-2xl bg-slate-950/45 backdrop-blur-md border border-white/12 p-4"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7 }}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5" aria-hidden="true">
          🌙
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-white/85 text-[13px] leading-relaxed">夜深了，岛屿在替你看着。</p>
          <p className="text-white/50 text-[11px] leading-relaxed mt-1.5">
            如果只是想找个地方安静一会儿，那就来吧——这里不催你说话。<br />
            如果太累了，让岛屿先替你把今天合上。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleBedtime}
              className="text-[12px] px-3.5 py-1.5 rounded-full bg-white/90 text-slate-800 hover:bg-white transition"
            >
              今天先到这里
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="text-[12px] px-3.5 py-1.5 rounded-full bg-white/8 text-white/70 hover:bg-white/14 transition"
            >
              和岛屿说一会儿话
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface GoodnightProps {
  onWake: () => void;
}

/**
 * 晚安屏：全屏铺开，第一眼只有月亮 + 一句话。
 * 5 秒后才显示"回到岛屿"链接——避免误触把用户又拉回屏幕，符合"反沉迷"叙事。
 */
export function GoodnightScreen({ onWake }: GoodnightProps) {
  const [canReturn, setCanReturn] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setCanReturn(true), GOODNIGHT_HOLD_MS);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      role="dialog"
      aria-label="晚安"
    >
      <motion.div
        className="mb-8"
        initial={{ scale: 0.85, opacity: 0, y: 6 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        aria-hidden="true"
      >
        {/* 温柔睡脸弯月 + 缓慢上下浮动(睡眠呼吸感) */}
        <motion.div
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <CartoonMoon size={172} />
        </motion.div>
      </motion.div>
      <p className="text-white/90 text-2xl tracking-[0.4em] mb-3">晚 安</p>
      <p className="text-white/55 text-sm leading-relaxed max-w-sm">
        岛屿替你把今天合上了。<br />
        明天它还会在原地，等你来。
      </p>
      <p className="mt-10 text-white/30 text-[11px] leading-relaxed max-w-sm">
        如果此刻你正经历危机，请记得拨打 12356 全国心理援助热线，<br />
        或拨打 120。你不是一个人。
      </p>
      {canReturn ? (
        <motion.button
          type="button"
          onClick={onWake}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="mt-10 text-white/45 text-[12px] hover:text-white/80 transition"
        >
          回到岛屿
        </motion.button>
      ) : (
        <span className="mt-10 text-white/15 text-[12px] select-none" aria-hidden="true">
          先安静片刻…
        </span>
      )}
    </motion.div>
  );
}
