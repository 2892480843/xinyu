import { useState } from "react";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import VoiceInputButton from "./VoiceInputButton";
import { ISLAND_HINTS } from "../lib/islandVoice";
import { EASE_IN_OUT_QUART, SPRING_TAP } from "../lib/motion";
import { play as playSfx } from "../lib/sfx";
import { useIsTouch } from "../lib/device";

interface Props {
  onSubmit: (text: string, ephemeral: boolean) => void;
  onSilent?: () => void;
  onGlyph?: () => void;
  loading: boolean;
}

const QUICK = ["今天有点焦虑", "一个人有点孤独", "累到不想动", "其实今天挺开心的"];

// 路演模式脚本：按情绪弧线依次演示
const DEMO_SCRIPT = [
  "我明天答辩，有点焦虑，怕自己讲不好。",
  "昨晚加班到很晚，今天真的很累。",
  "但今天也收到一个好消息，感觉有一点开心。",
  "我真的彻底撑不下去了，感觉没有希望。",
];

export default function MoodInput({ onSubmit, onSilent, onGlyph, loading }: Props) {
  const [text, setText] = useState("");
  const [demoIndex, setDemoIndex] = useState(0);
  const [ephemeral, setEphemeral] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const textControls = useAnimationControls();
  const isDev = import.meta.env.DEV;
  const isTouch = useIsTouch();

  const submit = async () => {
    const t = text.trim();
    if (!t || loading || submitting) return;
    setSubmitting(true);
    playSfx("chime");
    // 文字"漂入海"——上飘 + 淡出 + 模糊
    await textControls.start({
      y: -42,
      opacity: 0,
      filter: "blur(6px)",
      transition: { duration: 0.65, ease: EASE_IN_OUT_QUART },
    });
    onSubmit(t, ephemeral);
    // 提交后稍延迟才允许重置（防 phase 切换抖动）
    setTimeout(() => {
      setText("");
      textControls.set({ y: 0, opacity: 1, filter: "blur(0px)" });
      setSubmitting(false);
    }, 600);
  };

  const fillDemo = () => {
    setText(DEMO_SCRIPT[demoIndex % DEMO_SCRIPT.length]);
    setDemoIndex((i) => (i + 1) % DEMO_SCRIPT.length);
  };

  return (
    <motion.div
      className="w-full max-w-xl mx-auto"
      initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className={`relative overflow-hidden rounded-card-lg backdrop-blur-glass border p-4 transition-colors duration-500 ${
          ephemeral
            ? "bg-ink-900/35 border-mist-600 border-dashed shadow-glass-1"
            : "bg-ink-900/25 border-mist-500 shadow-glass-2"
        }`}
        style={{
          backgroundImage: ephemeral
            ? undefined
            : "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 38%, rgba(255,255,255,0) 100%)",
        }}
      >
        {/* 顶部 1px sheen */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)" }}
        />

        <div className="flex justify-between items-center mb-1 gap-2">
          <label
            className="flex items-center gap-2 text-caption text-mist-400 hover:text-mist-200 cursor-pointer select-none transition"
            title="勾选后岛屿走完整流程陪你说话，但不写记忆、不更新岛屿状态、不留物件。情绪陪伴 100% 给你，数据 0% 给产品。"
          >
            <input
              type="checkbox"
              checked={ephemeral}
              onChange={(e) => setEphemeral(e.target.checked)}
              disabled={loading || submitting}
              className="accent-white/70 h-3 w-3"
            />
            <span>{ephemeral ? "这次别记得我（无痕）" : "这次别记得我"}</span>
          </label>
          {isDev && (
            <button
              type="button"
              disabled={loading || submitting}
              onClick={fillDemo}
              title="试一句：依次填入焦虑 / 疲惫 / 开心 / 高风险示例"
              className="chip disabled:opacity-40"
            >
              试一句 <span className="tnum">{demoIndex + 1}/{DEMO_SCRIPT.length}</span> ▸
            </button>
          )}
        </div>

        <motion.div animate={textControls}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder="岛屿正在聆听……把此刻的心情说给它听"
            disabled={loading || submitting}
            className="w-full h-20 sm:h-24 bg-transparent text-mist-100 placeholder:text-mist-400 font-serif text-base leading-relaxed outline-none px-2 pt-1 disabled:opacity-60"
          />
        </motion.div>

        <div className="flex flex-wrap items-center justify-between gap-2 mt-1 px-1">
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                disabled={loading || submitting}
                onClick={() => setText(q)}
                className="chip disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
          <motion.button
            type="button"
            onClick={submit}
            disabled={loading || submitting || !text.trim()}
            whileHover={{ y: -1, scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_TAP}
            className="btn-primary shrink-0 w-full sm:w-auto mt-1 sm:mt-0"
          >
            {loading || submitting ? "岛屿回应中……" : ISLAND_HINTS.submit}
          </motion.button>
        </div>

        <div className="mt-3 px-1">
          <VoiceInputButton disabled={loading || submitting} onTranscript={setText} />
        </div>

        {/* 提交瞬间的涟漪 signature moment */}
        <AnimatePresence>
          {submitting && (
            <>
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  className="absolute left-1/2 top-1/2 rounded-full border border-white/45 pointer-events-none"
                  style={{ width: 8, height: 8, x: "-50%", y: "-50%" }}
                  initial={{ scale: 0, opacity: 0.85 }}
                  animate={{ scale: 36, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.4, delay: i * 0.25, ease: "easeOut" }}
                />
              ))}
            </>
          )}
        </AnimatePresence>
      </div>

      {!loading && !submitting && (
        <motion.div
          className="mt-3 flex items-center justify-center gap-3 flex-wrap"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {/* 快捷键提示仅桌面端显示——触屏有显式的「说给岛屿」按钮 */}
          {!isTouch && <p className="text-caption text-mist-400">{ISLAND_HINTS.hotkey}</p>}
          {onGlyph && (
            <>
              {!isTouch && <span className="text-mist-600 text-[10px]">·</span>}
              <button
                type="button"
                onClick={onGlyph}
                className="btn-link"
                title="不想打字，就写一个字——从 8 个心境字里选一个描红，岛屿读得懂"
              >
                {ISLAND_HINTS.glyph}
              </button>
            </>
          )}
          {onSilent && (
            <>
              <span className="text-mist-600 text-[10px]">·</span>
              <button
                type="button"
                onClick={onSilent}
                className="btn-link"
                title="什么都说不出，先在岛上坐一会儿——岛屿陪你 30 秒，不写记忆"
              >
                {ISLAND_HINTS.silent}
              </button>
            </>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
