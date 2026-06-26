import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { agentAsk } from "../lib/api";
import { useModalDismiss } from "../hooks/useModalDismiss";

const SUGGESTIONS = ["我最近怎么样？", "帮我回顾这周", "我焦虑的时候多吗？"];

/** P3 常驻 AI 助手：随时问「我最近怎么样」「回顾这周」，
 * 后端 agent 调记忆/统计工具，据你的真实记录回答（不编造）。 */
export default function IslandAssistant({
  userId,
  zIndexClass = "z-40",
  trigger,
}: { userId: string; zIndexClass?: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  useModalDismiss(open, () => setOpen(false));

  const ask = async (preset?: string) => {
    const text = (preset ?? question).trim();
    if (!text || loading) return;
    setQuestion(text);
    setAnswer("");
    setLoading(true);
    try {
      const res = await agentAsk(userId, text);
      setAnswer(res.answer);
    } catch {
      setAnswer("我这会儿没接上信号，但我一直在你这座岛上。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {trigger ? (
        // 移动端等场景传入自定义触发器（如卡片右侧的 › 箭头），克隆并注入打开逻辑。
        <span className="contents" onClick={() => setOpen(true)}>
          {trigger}
        </span>
      ) : (
        <button onClick={() => setOpen(true)} className="btn-link text-white/70">
          问问岛屿 ›
        </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/55 backdrop-blur-md px-4`}
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="panel-glass-3 rounded-card p-5 w-[22rem] max-w-[92vw]"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="问问岛屿"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
            >
              <p className="font-display text-[17px] tracking-wider text-white/90 text-center mb-1">问问岛屿</p>
              <p className="text-caption text-white/60 text-center mb-3">岛屿读着你留下的记录，据实回答</p>

              <div className="flex flex-wrap gap-1.5 justify-center mb-3">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="chip text-[12px]" disabled={loading}>
                    {s}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 mb-3">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) ask();
                  }}
                  placeholder="或者直接问我…"
                  className="flex-1 rounded-full px-4 py-2.5 text-[14px] bg-white/[0.08] text-white/90 placeholder-white/35 outline-none border border-white/10 focus:border-white/25"
                />
                <button
                  onClick={() => ask()}
                  disabled={loading || !question.trim()}
                  aria-label="发送问题"
                  className="panel-glass-1 rounded-full px-4 py-2.5 text-white/85 text-[14px] disabled:opacity-40 active:scale-95 transition-transform"
                >
                  问
                </button>
              </div>

              {(loading || answer) && (
                <div className="rounded-card panel-glass-1 px-4 py-3 text-[14px] leading-relaxed text-white/85 min-h-[3.2rem]">
                  {loading ? <span className="text-white/55">岛屿在翻看你的记录…</span> : answer}
                </div>
              )}

              <button onClick={() => setOpen(false)} className="btn-link w-full text-center text-white/60 text-caption mt-3">
                收起
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
