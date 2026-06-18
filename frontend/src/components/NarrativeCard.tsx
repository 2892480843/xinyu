import { useEffect, useRef, useState } from "react";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { synthesizeSpeech, type ReflectResponse, type IslandActResponse } from "../lib/api";
import { useImmersion } from "../hooks/useImmersion";
import { EMOTION_META } from "../lib/sceneMap";
import IslandStatePanel from "./IslandStatePanel";
import IslandChoiceCards from "./IslandChoiceCards";
import { SPRING_TAP } from "../lib/motion";

interface Props {
  result: ReflectResponse;
  userId: string;
  onReset: () => void;
  onActed: (result: IslandActResponse) => void;
  onInscribed?: () => void;
  onNarrativeDone?: () => void; // 叙事打字完成时触发一次：用于「生长瞬间」视听高潮
}

// 打字机逐字呈现叙事。用 setTimeout 而非 requestAnimationFrame：
// rAF 在后台标签页/不可见时会被严重节流甚至暂停，会让叙事卡在半截，
// 导致后续的岛屿状态、选择卡、「再说一次」都迟迟不出现。
function useTypewriter(text: string, speed = 55) {
  const [typed, setTyped] = useState({ source: "", shown: "" });

  useEffect(() => {
    if (!text) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      i += 1;
      setTyped({ source: text, shown: text.slice(0, i) });
      if (i < text.length) timer = setTimeout(tick, speed);
    };
    timer = setTimeout(tick, speed);
    return () => clearTimeout(timer);
  }, [text, speed]);

  // 文本切换时，旧的 typed.source 与新 text 不符，返回空串，避免闪现上一段叙事
  return typed.source === text ? typed.shown : "";
}

function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const chars = Array.from(text);
  let line = "";
  let currentY = y;

  chars.forEach((char) => {
    const testLine = line + char;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = char;
      currentY += lineHeight;
      return;
    }
    line = testLine;
  });

  if (line) {
    ctx.fillText(line, x, currentY);
  }
}

// 情绪 → 浏览器原生合成的语速/音高微调，让降级朗读也带情绪温度（疲惫更慢更轻、愉悦更明快）
const VOICE_TUNING: Record<string, { rate: number; pitch: number }> = {
  tired: { rate: 0.82, pitch: 0.92 },
  sad: { rate: 0.84, pitch: 0.94 },
  lonely: { rate: 0.86, pitch: 0.96 },
  helpless: { rate: 0.82, pitch: 0.9 },
  anxious: { rate: 0.9, pitch: 1.0 },
  calm: { rate: 0.9, pitch: 1.0 },
  happy: { rate: 1.0, pitch: 1.06 },
  angry: { rate: 0.92, pitch: 0.98 },
};

export default function NarrativeCard({ result, userId, onReset, onActed, onInscribed, onNarrativeDone }: Props) {
  const meta = EMOTION_META[result.emotion] ?? { label: result.emotion, palette: "" };
  const typed = useTypewriter(result.narrative);
  const done = typed.length >= result.narrative.length;

  // 叙事打完最后一字 → 触发一次「生长瞬间」（Home 据此播萌发音 + 岛屿光涌）。
  // 按 narrative 文本去重，避免同一段叙事重复触发（narrative 阶段不重挂载）。
  const burstFiredRef = useRef<string>("");
  useEffect(() => {
    if (done && result.narrative.trim() && burstFiredRef.current !== result.narrative) {
      burstFiredRef.current = result.narrative;
      onNarrativeDone?.();
    }
  }, [done, result.narrative, onNarrativeDone]);
  const intensityPct = Math.round(result.intensity * 100);

  const { immersive } = useImmersion();
  // 手抚玻璃：指针在叙事卡上游走时柔光高光跟随。用原生 ref 监听（稳、可验证），
  // 纯 overlay 不在毛玻璃上加 3D 变换（规避 Safari preserve-3d×backdrop-filter bug）。
  const cardRef = useRef<HTMLDivElement>(null);
  const glowX = useMotionValue(50);
  const glowY = useMotionValue(24);
  const glow = useMotionTemplate`radial-gradient(260px circle at ${glowX}% ${glowY}%, rgba(255,255,255,0.10), transparent 60%)`;
  useEffect(() => {
    const el = cardRef.current;
    if (!el || !immersive) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      glowX.set(((e.clientX - r.left) / r.width) * 100);
      glowY.set(((e.clientY - r.top) / r.height) * 100);
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    return () => el.removeEventListener("pointermove", onMove);
  }, [immersive, glowX, glowY]);
  const [speaking, setSpeaking] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  useEffect(() => {
    return () => {
      if (speechSupported) window.speechSynthesis.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [speechSupported]);

  const stopSpeaking = () => {
    if (speechSupported) window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeaking(false);
  };

  // 浏览器原生降级：按情绪微调语速/音高，让嗓音也「与情绪匹配」
  const browserSpeak = () => {
    if (!speechSupported) {
      setSpeaking(false);
      return;
    }
    // 防 Chrome 上 cancel + 立刻 speak 静默 bug：cancel → rAF → speak
    window.speechSynthesis.cancel();
    requestAnimationFrame(() => {
      const tune = VOICE_TUNING[result.emotion] ?? { rate: 0.9, pitch: 1.0 };
      const utterance = new SpeechSynthesisUtterance(result.narrative);
      utterance.lang = "zh-CN";
      utterance.rate = tune.rate;
      utterance.pitch = tune.pitch;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    });
  };

  const toggleReadAloud = async () => {
    if (!result.narrative.trim()) return;
    if (speaking) {
      stopSpeaking();
      return;
    }
    setSpeaking(true);
    // 优先腾讯云情感 TTS；未配置/失败则无缝降级浏览器原生（情绪调音）
    const dataUrl = await synthesizeSpeech(result.narrative, result.emotion);
    if (dataUrl) {
      const audio = new Audio(dataUrl);
      audioRef.current = audio;
      audio.onended = () => {
        audioRef.current = null;
        setSpeaking(false);
      };
      audio.onerror = () => {
        audioRef.current = null;
        browserSpeak();
      };
      try {
        await audio.play();
        return;
      } catch {
        audioRef.current = null;
      }
    }
    browserSpeak();
  };

  const saveImprintAsPng = () => {
    if (!result.imprint) return;

    try {
      const scale = window.devicePixelRatio || 1;
      const width = 960;
      const height = 540;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas unavailable");
      }

      ctx.scale(scale, scale);

      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#f7fbff");
      gradient.addColorStop(0.48, "#eef6f1");
      gradient.addColorStop(1, "#f9f2e8");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(53, 70, 87, 0.16)";
      ctx.lineWidth = 2;
      ctx.strokeRect(36, 36, width - 72, height - 72);

      ctx.fillStyle = "rgba(38, 48, 61, 0.52)";
      ctx.font = '26px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText("心灵印记", 96, 128);

      ctx.fillStyle = "#26303d";
      ctx.font = '42px "PingFang SC", "Microsoft YaHei", sans-serif';
      drawWrappedText(ctx, result.imprint, 96, 238, width - 192, 66);

      ctx.fillStyle = "rgba(38, 48, 61, 0.44)";
      ctx.font = '22px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(`心屿 · ${meta.label}`, 96, 446);

      canvas.toBlob((blob) => {
        if (!blob) {
          setSaveMessage("保存失败，请稍后再试");
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "xinyu-imprint.png";
        link.click();
        URL.revokeObjectURL(url);
        setSaveMessage("已生成 PNG");
      }, "image/png");
    } catch {
      setSaveMessage("保存失败，请稍后再试");
    }
  };

  return (
    <motion.div
      className="w-full max-w-xl mx-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
    >
      {/* 情绪标签条 */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="chip">{meta.label}</span>
        <div className="flex-1 h-1.5 rounded-pill bg-mist-700 overflow-hidden">
          <motion.div
            className="h-full rounded-pill"
            style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.85), rgba(159,180,240,0.85))" }}
            initial={{ width: 0 }}
            animate={{ width: `${intensityPct}%` }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <span className="text-caption text-mist-400 tnum">{intensityPct}</span>
        {result.ephemeral && (
          <motion.span
            className="chip"
            title="本次为无痕陪伴：岛屿不会记得这次，不写记忆、不更新岛屿状态、不留物件"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            无痕
          </motion.span>
        )}
      </div>

      {/* 叙事文本 */}
      <div ref={cardRef} className="panel-glass-2 relative overflow-hidden rounded-card-lg p-6">
        {/* 手抚高光：柔光跟随指针，mix-blend screen 只在玻璃上泛光、不压暗正文 */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: glow, mixBlendMode: "screen" }}
        />
        <div className="relative">
          <p className="font-serif text-mist-100 text-reading min-h-[6.5rem]">
            {immersive && typed.length > 0 ? (
              <>
                {typed.slice(0, -1)}
                {/* 压印显影：最新一字柔和浮现（逐字 key 重挂载重放）；reduced-motion/静海下退回纯文本 */}
                <motion.span
                  key={typed.length}
                  initial={{ opacity: 0.25 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                >
                  {typed.slice(-1)}
                </motion.span>
              </>
            ) : (
              typed
            )}
            {!done && <span className="inline-block w-[2px] h-4 bg-mist-200 ml-0.5 animate-pulse align-middle" />}
          </p>

        {/* 记忆提示 */}
        {result.memory_hint && done && (
          <motion.div
            className="mt-5 pt-4 border-t border-white/12"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <p className="text-[12px] text-white/40 mb-1">岛屿记得你</p>
            <p className="text-white/70 text-sm leading-relaxed italic">{result.memory_hint}</p>
          </motion.div>
        )}

        {/* 私房安慰话回响：岛屿引用用户教过的话——AI 退到搬运工位置 */}
        {result.echo_phrase && done && (
          <motion.div
            className="mt-5 pt-4 border-t border-white/12"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.4 }}
          >
            <p className="text-[12px] text-white/40 mb-1.5">岛屿想起你说过</p>
            <p className="text-white/85 text-[15px] leading-relaxed">
              <span className="text-white/55">「</span>
              {result.echo_phrase.content}
              <span className="text-white/55">」</span>
            </p>
            {result.echo_phrase.attribution && (
              <p className="mt-1.5 text-[12px] text-white/45">
                —— 你说{result.echo_phrase.attribution}曾这样告诉你
              </p>
            )}
          </motion.div>
        )}
        </div>
      </div>

      {/* 心象岛屿状态：让用户看到这次倾诉如何改变了岛屿 */}
      {result.island_state && done && <IslandStatePanel island={result.island_state} />}

      {/* 岛屿回应选择卡：玩家主动选择如何面对情绪并在岛上留下物件 */}
      {done && result.choices && result.choices.length > 0 && (
        <IslandChoiceCards userId={userId} choices={result.choices} onActed={onActed} onInscribed={onInscribed} />
      )}

      {result.imprint && done && (
        <motion.div
          className="panel-glass-2 mt-4 rounded-card-lg p-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-caption text-mist-400 tracking-[0.28em]">心灵印记</p>
            <motion.button
              type="button"
              onClick={saveImprintAsPng}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              transition={SPRING_TAP}
              className="btn-ghost text-[12px] px-3.5 py-1.5"
            >
              保存为 PNG
            </motion.button>
          </div>
          <p className="font-serif text-mist-200 text-reading">{result.imprint}</p>
          {saveMessage && <p className="mt-3 text-caption text-mist-400">{saveMessage}</p>}
        </motion.div>
      )}

      {done && (
        <motion.div
          className="flex flex-wrap justify-center gap-3 mt-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <motion.button
            type="button"
            onClick={toggleReadAloud}
            disabled={!speechSupported}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_TAP}
            title={speechSupported ? (speaking ? "停止朗读" : "朗读叙事") : "当前浏览器不支持朗读"}
            className="btn-ghost disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {speechSupported ? (speaking ? "停止朗读" : "朗读叙事") : "朗读不可用"}
          </motion.button>
          <motion.button
            onClick={onReset}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_TAP}
            className="btn-ghost"
          >
            再说一次
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );
}
