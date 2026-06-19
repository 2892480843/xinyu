import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { actOnIsland, inscribeArtifact, type IslandChoice, type IslandActResponse } from "../lib/api";
import FeatureGlyph from "./IslandFeatureIcons";
import { SPRING_TAP } from "../lib/motion";
import { play as playSfx } from "../lib/sfx";

interface Props {
  userId: string;
  choices: IslandChoice[];
  onActed: (result: IslandActResponse) => void;
  onInscribed?: () => void;
}

/**
 * 岛屿回应选择卡：每次倾诉后，玩家主动选择如何面对这份情绪，
 * 并在岛上完成一个仪式、留下一个永久物件。这是《心屿》的玩家能动性入口——
 * 一次选择同时承载「情绪回应分支」与「岛屿仪式收集」。
 */
export default function IslandChoiceCards({ userId, choices, onActed, onInscribed }: Props) {
  const [acted, setActed] = useState<IslandActResponse | null>(null);
  const [actedChoiceId, setActedChoiceId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 时光回信：留下物件后可选刻一句给未来的自己
  const [inscribeOpen, setInscribeOpen] = useState(false);
  const [inscribeText, setInscribeText] = useState("");
  const [inscribed, setInscribed] = useState("");
  const [inscribeBusy, setInscribeBusy] = useState(false);

  const submitInscription = async () => {
    if (!acted || !inscribeText.trim() || inscribeBusy) return;
    setInscribeBusy(true);
    const updated = await inscribeArtifact(userId, acted.artifact.id, inscribeText.trim());
    if (updated) {
      setInscribed(updated.inscription);
      playSfx("inscribe"); // 墨字刻入物件
      setInscribeOpen(false);
      onInscribed?.(); // 通知父级刷新收藏墙，让 ✒️ 标记立即同步(#5)
    }
    setInscribeBusy(false);
  };

  const choose = async (choice: IslandChoice) => {
    if (busy || acted) return;
    setBusy(choice.id);
    setError(null);
    playSfx("shell");
    try {
      const result = await actOnIsland(userId, choice.id);
      setActedChoiceId(choice.id);
      setActed(result);
      onActed(result);
      playSfx("settle"); // 物件温柔落在岛上

    } catch {
      setError("岛屿仪式没能完成，稍后再试一次");
    } finally {
      setBusy(null);
    }
  };

  if (choices.length === 0) return null;

  return (
    <motion.div
      className="mt-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.2 }}
    >
      <p className="text-caption text-mist-400 tracking-[0.28em] mb-3 px-1">在岛上，你想——</p>

      <AnimatePresence mode="wait">
        {!acted ? (
          <motion.div
            key="cards"
            className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0 }}
            variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
          >
            {choices.map((c, idx) => {
              const tint = ["#7fd3dd", "#f4f1d0", "#9fb4f0", "#f5d28a", "#aeb9d6"][idx % 5];
              const isBusy = busy === c.id;
              const isOtherBusy = busy && busy !== c.id;
              return (
                <motion.button
                  key={c.id}
                  type="button"
                  layoutId={`choice-${c.id}`}
                  disabled={Boolean(busy)}
                  onClick={() => choose(c)}
                  variants={{
                    hidden: { opacity: 0, y: 16, filter: "blur(6px)" },
                    visible: {
                      opacity: 1,
                      y: 0,
                      filter: "blur(0px)",
                      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
                    },
                  }}
                  animate={isOtherBusy ? { opacity: 0.3, scale: 0.96, filter: "blur(2px)" } : undefined}
                  whileHover={!busy ? { y: -4, scale: 1.02 } : undefined}
                  whileTap={!busy ? { scale: 0.97 } : undefined}
                  transition={SPRING_TAP}
                  className="panel-glass-1 group relative flex flex-col items-center text-center rounded-card-lg px-3 py-4 min-h-[140px] hover:border-mist-500 disabled:cursor-not-allowed transition-colors overflow-hidden"
                >
                  {/* 卡片背景径向光晕 — 按 idx 给不同 tint */}
                  <span
                    aria-hidden
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{
                      background: `radial-gradient(circle at 50% 0%, ${tint}22, transparent 60%)`,
                    }}
                  />
                  {c.rare && (
                    <span
                      className="absolute top-2 right-2 text-[9px] tracking-wider px-1.5 py-0.5 rounded-full leading-none"
                      style={{ color: tint, background: `${tint}1f`, border: `1px solid ${tint}55` }}
                    >
                      此刻限定
                    </span>
                  )}
                  <motion.span
                    className="relative leading-none mb-2"
                    style={{ color: tint, filter: `drop-shadow(0 0 9px ${tint}66)` }}
                    animate={isBusy ? { scale: [1, 1.15, 1], rotate: [0, 6, -6, 0] } : {}}
                    transition={isBusy ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : {}}
                  >
                    <FeatureGlyph name={c.artifact} size={34} />
                  </motion.span>
                  <span className="relative font-serif text-mist-100 text-[14px] leading-snug">{c.stance}</span>
                  <span className="relative text-mist-400 text-caption mt-1.5 leading-relaxed">{c.ritual}</span>
                  <motion.span
                    className="relative mt-2 text-mist-500 group-hover:text-mist-200 text-caption transition-colors"
                    animate={isBusy ? { opacity: [0.3, 1, 0.3] } : {}}
                    transition={isBusy ? { duration: 1.2, repeat: Infinity } : {}}
                  >
                    {isBusy ? "正在落下……" : "选这一个 ▸"}
                  </motion.span>
                </motion.button>
              );
            })}
            {error && <p className="text-coral text-meta px-1 col-span-full">{error}</p>}
          </motion.div>
        ) : (
          <motion.div
            key="result"
            layoutId={`choice-${actedChoiceId ?? "acted"}`}
            className="panel-glass-2 rounded-card-lg p-4 space-y-3"
            initial={{ opacity: 0.95 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-3">
              <motion.span
                className="leading-none shrink-0"
                style={{ color: "#f5d28a", filter: "drop-shadow(0 0 9px rgba(245,210,138,0.45))" }}
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 14, delay: 0.2 }}
              >
                <FeatureGlyph name={acted.artifact.artifact} size={30} />
              </motion.span>
              <span className="flex-1">
                <span className="block font-serif text-mist-100 text-[14px] leading-relaxed">{acted.reply}</span>
                <span className="block text-mist-400 text-meta mt-1">
                  岛上留下了一枚「{acted.artifact.label}」
                </span>
              </span>
            </div>

            {/* 时光回信：在物件上刻一句给未来的自己 */}
            {inscribed ? (
              <motion.div
                className="panel-glass-1 rounded-tile px-3 py-2.5"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <p className="text-caption text-mist-400 mb-1 tracking-widest">你在这枚{acted.artifact.label}上刻下</p>
                <p className="font-serif italic text-mist-100 text-[13px] leading-relaxed">「{inscribed}」</p>
                <p className="text-caption text-mist-400 mt-2">岛屿会替你保管，未来某天还给你。</p>
              </motion.div>
            ) : inscribeOpen ? (
              <motion.div
                className="panel-glass-1 rounded-tile p-3 space-y-2 overflow-hidden"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
              >
                <p className="text-caption text-mist-400">在这枚{acted.artifact.label}上刻一句给未来自己的话（30 字内最佳）</p>
                <textarea
                  value={inscribeText}
                  onChange={(e) => setInscribeText(e.target.value.slice(0, 80))}
                  placeholder="例如：今天我撑住了，谢谢未来的自己继续撑下去"
                  rows={2}
                  className="w-full rounded-sm bg-ink-900/35 border border-mist-600 px-3 py-2 text-mist-100 font-serif text-base leading-relaxed placeholder:text-mist-500 outline-none focus:border-mist-400 resize-none transition-colors"
                />
                <div className="flex items-center justify-between">
                  <span className="text-caption text-mist-500 tnum">{inscribeText.length}/80 字</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setInscribeOpen(false); setInscribeText(""); }}
                      className="btn-link px-3 py-1.5"
                    >
                      下次再说
                    </button>
                    <motion.button
                      type="button"
                      disabled={!inscribeText.trim() || inscribeBusy}
                      onClick={submitInscription}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.96 }}
                      transition={SPRING_TAP}
                      className="btn-primary text-[12px] px-3.5 py-1.5"
                    >
                      {inscribeBusy ? "刻字中…" : "刻下"}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <button
                type="button"
                onClick={() => setInscribeOpen(true)}
                className="w-full text-left text-meta text-mist-400 hover:text-mist-100 px-2 py-1.5 transition-colors"
              >
                在这枚{acted.artifact.label}上刻一句给未来的自己 ▸
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
