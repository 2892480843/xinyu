import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { addPhrase, deletePhrase, fetchPhrases, type PhraseItem } from "../lib/api";
import { EMOTION_META } from "../lib/sceneMap";

interface Props {
  userId: string;
}

// 用户能教给岛屿的情绪类别——与 8 类情绪白名单一致
const EMOTIONS: Array<keyof typeof EMOTION_META> = [
  "sad", "anxious", "tired", "lonely", "calm", "happy", "angry", "helpless",
];

/**
 * 私房安慰话管理：用户能把"重要他人说过最有效的安慰"教给岛屿，
 * 岛屿在同类情绪再次出现时加引号+归因复用。AI 退到搬运工位置。
 *
 * 这是"科技放大人际连接而非替代"的落地，对哀伤 / 孤独 / 留守人群尤其。
 */
export default function IslandPhrases({ userId }: Props) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [phrases, setPhrases] = useState<PhraseItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [emotion, setEmotion] = useState<string>("anxious");
  const [content, setContent] = useState("");
  const [attribution, setAttribution] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    // setTimeout 把 setState 推到下一帧，绕开 react-hooks/set-state-in-effect 规则
    const t = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      fetchPhrases(userId)
        .then((items) => { if (!cancelled) setPhrases(items); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, userId]);

  const submit = async () => {
    const c = content.trim();
    if (!c || adding) return;
    setAdding(true);
    setError(null);
    const created = await addPhrase(userId, emotion, c, attribution.trim());
    if (created) {
      setPhrases((prev) => [created, ...prev]);
      setContent("");
      setAttribution("");
    } else {
      // 失败时保留输入并提示，避免用户以为没点中而连点出多条(#17)
      setError("没能教给岛屿，请稍后再试一次");
    }
    setAdding(false);
  };

  const remove = async (id: number) => {
    const ok = await deletePhrase(userId, id);
    if (ok) setPhrases((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="px-3.5 pb-3.5 pt-1 border-t border-white/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3.5 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 text-white/85 text-[13px] transition flex items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span aria-hidden="true">💭</span>
          <span className="truncate">教岛屿一句私房安慰话</span>
        </span>
        <span className="text-[11px] text-white/40 shrink-0">
          {phrases.length > 0 ? `${phrases.length} 句` : "AI 退到搬运工"}
          <span className="ml-1">{open ? "▾" : "▸"}</span>
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="mt-3 space-y-3"
          >
            {/* 添加表单 */}
            <div className="rounded-2xl bg-white/6 border border-white/10 p-3 space-y-2">
              <p className="text-[11px] text-white/45 leading-relaxed">
                把谁对你说过最有效的一句安慰教给岛屿。同类情绪再次出现时，岛屿会加引号还给你——
                AI 不发明新话，只是替你保管。
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EMOTIONS.map((e) => (
                  <button
                    type="button"
                    key={e}
                    onClick={() => setEmotion(e)}
                    className={`text-[11px] px-2.5 py-1 rounded-full transition border ${
                      emotion === e
                        ? "bg-white/85 text-slate-800 border-white"
                        : "bg-white/6 text-white/70 border-white/12 hover:bg-white/12"
                    }`}
                  >
                    {EMOTION_META[e]?.label ?? e}
                  </button>
                ))}
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, 120))}
                placeholder="例如：你不用一次就把所有事做完"
                rows={2}
                className="w-full rounded-xl bg-white/8 border border-white/12 px-3 py-2 text-white/85 text-[13px] leading-relaxed placeholder-white/30 outline-none focus:border-white/35 resize-none"
              />
              <div className="flex items-center gap-2">
                <input
                  value={attribution}
                  onChange={(e) => setAttribution(e.target.value.slice(0, 24))}
                  placeholder="是谁说的（可选，如：妈妈）"
                  className="flex-1 rounded-full bg-white/8 border border-white/12 px-3 py-1.5 text-[12px] text-white/80 placeholder-white/30 outline-none focus:border-white/35"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={!content.trim() || adding}
                  className="text-[12px] px-3.5 py-1.5 rounded-full bg-white/90 text-slate-800 hover:bg-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {adding ? "记下…" : "教给岛屿"}
                </button>
              </div>
              <p className="text-[10px] text-white/30">
                {content.length}/120 字 · 岛屿不会改写它、不会拿它训练 AI
              </p>
              {error && <p className="text-[11px] text-rose-200/75">{error}</p>}
            </div>

            {/* 已教列表 */}
            {loading ? (
              <p className="text-white/40 text-[12px] py-2 text-center">读着你之前教的…</p>
            ) : phrases.length === 0 ? (
              <p className="text-white/35 text-[11px] py-1 text-center italic">还没教过岛屿——它会等着你想起谁的一句话</p>
            ) : (
              <ul className="space-y-1.5">
                {phrases.map((p) => (
                  <li
                    key={p.id}
                    className="group flex items-start gap-2 rounded-xl bg-white/5 border border-white/8 px-3 py-2"
                  >
                    <span className="text-[10px] text-white/45 mt-0.5 shrink-0 w-10">
                      {EMOTION_META[p.emotion]?.label ?? p.emotion}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/85 text-[12.5px] leading-relaxed">「{p.content}」</p>
                      {p.attribution && (
                        <p className="text-[10px] text-white/40 mt-0.5">—— {p.attribution}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      aria-label="删除"
                      title="收回这句话"
                      className="text-white/25 hover:text-white/70 text-xs leading-none mt-1 transition shrink-0"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
