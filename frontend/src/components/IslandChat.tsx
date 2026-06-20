import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { chatWithIsland, type ChatTurn } from "../lib/api";

/** P2 多轮对话伙伴：在岛屿的叙事之后，可以继续来回跟岛屿聊。
 * 把「最初那段心情 + 岛屿的叙事」作为对话种子，连同后续每一轮一起发给 /api/chat，
 * 岛屿据上下文 + 你的历史（agent 自行查记忆/读岛屿）多轮回应。 */
export default function IslandChat({
  userId,
  seedUser,
  seedNarrative,
}: {
  userId: string;
  seedUser: string;
  seedNarrative: string;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollBoxRef = useRef<HTMLDivElement>(null);

  // 只滚动对话容器自身——scrollIntoView 会牵动整页（iOS Safari 跳视口）；turns 为空不滚。
  useEffect(() => {
    if (!turns.length) return;
    const el = scrollBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const next: ChatTurn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setLoading(true);
    try {
      const messages: ChatTurn[] = [
        { role: "user", content: seedUser || "（一段心情）" },
        { role: "assistant", content: seedNarrative },
        ...next,
      ];
      const res = await chatWithIsland(userId, messages);
      setTurns((t) => [...t, { role: "assistant", content: res.reply }]);
    } catch {
      setTurns((t) => [...t, { role: "assistant", content: "（信号断了一下，我还在这儿。）" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 w-full"
    >
      <p className="text-caption text-white/65 text-on-scene mb-2 tracking-wider">继续跟岛屿说说</p>
      {turns.length > 0 && (
        <div ref={scrollBoxRef} className="space-y-1.5 mb-2.5 max-h-[56vh] overflow-y-auto pr-1">
          {turns.map((t, i) => (
            <div key={i} className={t.role === "user" ? "text-right" : "text-left"}>
              <span
                className={`inline-block rounded-2xl px-3 py-1.5 text-[14px] leading-relaxed max-w-[86%] text-on-scene backdrop-blur-md border ${
                  t.role === "user"
                    ? "bg-white/15 border-white/25 text-white"
                    : "bg-white/10 border-white/15 text-white/90"
                }`}
              >
                {t.content}
              </span>
            </div>
          ))}
          {loading && (
            <div className="text-left">
              <span className="inline-block rounded-2xl px-3 py-1.5 text-[13px] text-white/70 text-on-scene bg-white/10 backdrop-blur-md border border-white/15">
                岛屿在想…
              </span>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
          }}
          placeholder="继续跟岛屿说…"
          autoFocus
          className="flex-1 rounded-full px-4 py-2.5 text-[14px] bg-white/[0.08] text-white/90 placeholder-white/35 outline-none border border-white/10 focus:border-white/25 transition-colors"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="rounded-full px-4 py-2.5 bg-white/15 backdrop-blur-md border border-white/25 text-white text-[14px] tracking-wider active:scale-95 transition-transform disabled:opacity-40"
        >
          说
        </button>
      </div>
    </motion.div>
  );
}
