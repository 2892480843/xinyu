import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { requestIslandLetter, type LetterResponse } from "../lib/api";

interface Props {
  userId: string;
  memoryCount: number;
}

/**
 * 岛屿年报：让 hy3-preview 读全部历史 + 物件，给一封 ~200 字温柔短信。
 * 答辩压轴画面——把 AI 陪伴从"单次缓解"升级为"长期见证"。
 * 包含一个"被发现的情绪规律"，让评委一眼看到 LLM 真的在分析。
 */
export default function IslandLetter({ userId, memoryCount }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LetterResponse | null>(null);
  const [shown, setShown] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = async () => {
    if (loading) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    setData(null);
    setShown("");
    try {
      const res = await requestIslandLetter(userId);
      if (!res || !res.letter) {
        setError("岛屿一时没写出来，稍后再试一次吧。");
        return;
      }
      setData(res);
    } catch {
      setError("岛屿一时没写出来，稍后再试一次吧。");
    } finally {
      setLoading(false);
    }
  };

  // 打字机逐字呈现 letter，用 setTimeout 避免后台标签 rAF 节流卡死
  useEffect(() => {
    if (!data?.letter) return;
    const text = data.letter;
    let i = 0;
    const tick = () => {
      i += 1;
      setShown(text.slice(0, i));
      if (i < text.length) {
        timer.current = setTimeout(tick, 38);
      }
    };
    timer.current = setTimeout(tick, 38);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data]);

  const close = () => {
    setOpen(false);
    if (timer.current) clearTimeout(timer.current);
  };

  const disabled = memoryCount === 0;

  return (
    <div className="px-3.5 pb-3.5 pt-1 border-t border-white/10">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        className="w-full text-left px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/16 text-white/85 text-[13px] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span aria-hidden="true">✉️</span>
          <span className="truncate">请岛屿写一封信</span>
        </span>
        <span className="text-[11px] text-white/40 shrink-0">
          {disabled ? "等你先说说话" : loading ? "岛屿正在写…" : "AI 长程回看"}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="mt-3 rounded-2xl bg-slate-950/55 backdrop-blur-md border border-white/15 p-4 relative"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.45, ease: "easeInOut" }}
          >
            <button
              type="button"
              onClick={close}
              aria-label="收起信件"
              className="absolute top-2 right-3 text-white/35 hover:text-white/80 text-sm transition"
            >
              ×
            </button>
            {loading && (
              <p className="text-white/55 text-[12px] py-3 text-center">
                岛屿正在读完你这{memoryCount}次的痕迹…
              </p>
            )}
            {error && <p className="text-rose-200/70 text-[12px] py-2 text-center">{error}</p>}
            {data && (
              <>
                <p className="text-[11px] text-white/40 tracking-[0.28em] mb-2">岛屿写给你的信</p>
                <p className="text-white/85 text-[13px] leading-relaxed whitespace-pre-line min-h-[5rem]">
                  {shown}
                  {shown.length < (data.letter?.length ?? 0) && (
                    <span className="ml-0.5 opacity-60 animate-pulse">▍</span>
                  )}
                </p>
                {data.observed_pattern && shown.length >= (data.letter?.length ?? 0) && (
                  <motion.div
                    className="mt-3 pt-3 border-t border-white/10"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                  >
                    <p className="text-[11px] text-white/40 mb-1">岛屿注意到的</p>
                    <p className="text-white/65 text-[12px] leading-relaxed italic">
                      {data.observed_pattern}
                    </p>
                  </motion.div>
                )}
                {data.mentioned_artifacts.length > 0 && shown.length >= (data.letter?.length ?? 0) && (
                  <motion.p
                    className="mt-2 text-[11px] text-white/35"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                  >
                    信里点名了：{data.mentioned_artifacts.join(" · ")}
                  </motion.p>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
