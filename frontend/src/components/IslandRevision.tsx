import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { RevisionResponse } from "../lib/api";

interface Props {
  revision: RevisionResponse;
}

const KIND_LABEL: Record<string, string> = {
  too_heavy: "上次说重了",
  too_light: "上次说浅了",
  off_topic: "上次没说到点上",
};

function fmtDate(iso: string): string {
  // new Date(非法串) 返回 Invalid Date 而不抛异常，try/catch 拦不住——必须显式判 NaN(#11)
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return "前几天";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 岛屿修正信：LLM 第一次回头看自己说过的话，主动承认"那时我说得不太对"。
 * 元 AI 破圈点——上一轮所有 LLM 输出都是单向前进，这一条让 AI 第一次回头审视自己。
 * 不修改原叙事（时间真实性），只追加今日修正信。
 */
export default function IslandRevision({ revision }: Props) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const dateLabel = fmtDate(revision.target_created_at);
  const kindLabel = KIND_LABEL[revision.kind] ?? "想重新说一遍";

  return (
    <motion.div
      className="w-full max-w-xl mx-auto mb-4 rounded-2xl bg-amber-50/8 backdrop-blur-md border border-amber-200/20 overflow-hidden"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.4 }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-3 hover:bg-white/4 transition flex items-start gap-3"
      >
        <span className="text-xl leading-none mt-0.5" aria-hidden="true">📩</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-white/45 tracking-[0.28em] mb-1">岛屿的修正信</p>
          <p className="text-white/85 text-[13px] leading-relaxed">
            岛屿想重新说一句话——{dateLabel}那次{kindLabel}{open ? "" : "…"}
          </p>
        </div>
        <span className="text-white/35 text-xs leading-none mt-1 shrink-0">{open ? "▾" : "▸"}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="px-4 pb-4"
          >
            {/* 原话 */}
            {revision.target_narrative && (
              <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 mt-1">
                <p className="text-[10px] text-white/35 tracking-widest mb-1">{dateLabel}那时我说</p>
                <p className="text-white/55 text-[12px] leading-relaxed italic">
                  {revision.target_narrative}
                </p>
              </div>
            )}
            {/* 修正 */}
            <div className="mt-3">
              <p className="text-[10px] text-amber-100/65 tracking-widest mb-1.5">今天的我想重说</p>
              <p className="text-amber-50/90 text-[13.5px] leading-relaxed">{revision.revision}</p>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-white/40 hover:text-white/80 text-[11px] transition"
              >
                收起，谢谢你
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
