import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { playStreamingSpeech, synthesizeSpeech, type ReflectResponse, type IslandActResponse, type StreamingSpeechPlayback } from "../lib/api";
import { useImmersion } from "../hooks/useImmersion";
import { EMOTION_META } from "../lib/sceneMap";
import IslandStatePanel from "./IslandStatePanel";
import IslandChoiceCards from "./IslandChoiceCards";
import IslandChat from "./IslandChat";
import { SPRING_TAP } from "../lib/motion";

interface Props {
  result: ReflectResponse;
  userId: string;
  seedMood?: string; // 最初那段心情原文，作为多轮对话的种子
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

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function createTicketNo(emotionLabel: string) {
  const date = new Date();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hash = Array.from(`${emotionLabel}-${date.toDateString()}`).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return `${mm}${dd}-${String(hash % 10000).padStart(4, "0")}`;
}

function createImprintTicketBlob({ imprint, emotionLabel }: { imprint: string; emotionLabel: string }): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const scale = window.devicePixelRatio || 1;
    const width = 960;
    const height = 540;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas unavailable"));
      return;
    }

    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#0d1727");
    bg.addColorStop(0.42, "#243340");
    bg.addColorStop(0.72, "#594332");
    bg.addColorStop(1, "#9a6f3f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const halo = ctx.createRadialGradient(246, 96, 16, 246, 96, 460);
    halo.addColorStop(0, "rgba(173, 220, 218, 0.36)");
    halo.addColorStop(0.36, "rgba(173, 220, 218, 0.12)");
    halo.addColorStop(1, "rgba(173, 220, 218, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);

    const ember = ctx.createRadialGradient(802, 424, 24, 802, 424, 360);
    ember.addColorStop(0, "rgba(246, 194, 116, 0.32)");
    ember.addColorStop(0.52, "rgba(246, 194, 116, 0.10)");
    ember.addColorStop(1, "rgba(246, 194, 116, 0)");
    ctx.fillStyle = ember;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 90; i += 1) {
      const x = (i * 67 + 31) % width;
      const y = (i * 43 + 19) % height;
      const size = i % 5 === 0 ? 1.6 : 0.8;
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();

    const ticketX = 46;
    const ticketY = 48;
    const ticketW = 868;
    const ticketH = 444;
    const splitX = 704;
    const ticketNo = createTicketNo(emotionLabel);

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 24;
    roundedRectPath(ctx, ticketX, ticketY, ticketW, ticketH, 30);
    const ticketGradient = ctx.createLinearGradient(ticketX, ticketY, ticketX + ticketW, ticketY + ticketH);
    ticketGradient.addColorStop(0, "rgba(22, 34, 48, 0.95)");
    ticketGradient.addColorStop(0.58, "rgba(31, 42, 50, 0.90)");
    ticketGradient.addColorStop(1, "rgba(86, 62, 42, 0.92)");
    ctx.fillStyle = ticketGradient;
    ctx.fill();
    ctx.restore();

    roundedRectPath(ctx, ticketX + 10, ticketY + 10, ticketW - 20, ticketH - 20, 24);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    roundedRectPath(ctx, ticketX + 28, ticketY + 28, ticketW - 56, ticketH - 56, 18);
    ctx.strokeStyle = "rgba(221, 236, 227, 0.16)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.setLineDash([10, 12]);
    ctx.strokeStyle = "rgba(239, 229, 205, 0.34)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(splitX, ticketY + 46);
    ctx.lineTo(splitX, ticketY + ticketH - 46);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(8, 13, 22, 0.62)";
    [ticketY + 72, ticketY + ticketH - 72].forEach((y) => {
      ctx.beginPath();
      ctx.arc(splitX, y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    ctx.restore();

    ctx.fillStyle = "rgba(245, 242, 230, 0.60)";
    ctx.font = '17px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.letterSpacing = "4px";
    ctx.fillText("ISLAND KEEPSAKE", 92, 116);
    ctx.letterSpacing = "0px";

    ctx.fillStyle = "rgba(255, 250, 235, 0.95)";
    ctx.font = '34px "Songti SC", "Noto Serif SC", "PingFang SC", serif';
    ctx.fillText("心灵印记", 92, 168);

    ctx.strokeStyle = "rgba(240, 232, 211, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(92, 190);
    ctx.lineTo(626, 190);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(92, 214, 552, 160);
    ctx.clip();
    ctx.fillStyle = "rgba(255, 253, 244, 0.92)";
    const bodyFontSize = imprint.length > 32 ? 34 : 38;
    const bodyLineHeight = imprint.length > 32 ? 54 : 60;
    ctx.font = `${bodyFontSize}px "Songti SC", "Noto Serif SC", "PingFang SC", serif`;
    drawWrappedText(ctx, imprint, 92, 260, 540, bodyLineHeight);
    ctx.restore();

    ctx.fillStyle = "rgba(232, 223, 202, 0.74)";
    ctx.font = '20px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(`心屿 · ${emotionLabel}`, 92, 422);
    ctx.fillStyle = "rgba(232, 223, 202, 0.42)";
    ctx.font = '15px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText("把这一刻收进岛屿的口袋", 92, 452);

    ctx.save();
    ctx.translate(538, 128);
    ctx.rotate(-0.16);
    ctx.strokeStyle = "rgba(219, 232, 224, 0.24)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 58, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(219, 232, 224, 0.28)";
    ctx.font = '19px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("XINYU", 0, -6);
    ctx.font = '22px "Songti SC", "Noto Serif SC", "PingFang SC", serif';
    ctx.fillText("心屿", 0, 24);
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(244, 239, 224, 0.64)";
    ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText("ADMIT ONE MEMORY", 808, 110);
    ctx.fillStyle = "rgba(255, 253, 244, 0.94)";
    ctx.font = '22px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(`NO. ${ticketNo}`, 808, 164);
    ctx.fillStyle = "rgba(232, 223, 202, 0.54)";
    ctx.font = '15px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText("COLLECTIBLE", 808, 218);
    ctx.fillText(emotionLabel, 808, 248);
    ctx.strokeStyle = "rgba(244, 239, 224, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(750, 300);
    ctx.lineTo(866, 300);
    ctx.stroke();
    ctx.font = '16px "Songti SC", "Noto Serif SC", "PingFang SC", serif';
    ctx.fillStyle = "rgba(255, 253, 244, 0.84)";
    ctx.fillText("岛上留存", 808, 356);
    ctx.fillText("因你发光", 808, 386);
    ctx.restore();

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PNG export failed"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
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

export default function NarrativeCard({ result, userId, seedMood, onReset, onActed, onInscribed, onNarrativeDone }: Props) {
  const meta = EMOTION_META[result.emotion] ?? { label: result.emotion, palette: "" };
  const typed = useTypewriter(result.narrative);
  const done = typed.length >= result.narrative.length;
  const [chatOpen, setChatOpen] = useState(false); // 「继续聊聊」展开多轮对话

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savingPreview, setSavingPreview] = useState(false);
  const speakSeqRef = useRef(0);
  const streamRef = useRef<StreamingSpeechPlayback | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  const closeImprintPreview = useCallback(() => {
    setPreviewOpen(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (speechSupported) window.speechSynthesis.cancel();
      streamRef.current?.stop();
      streamRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [speechSupported]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeImprintPreview();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen, closeImprintPreview]);

  const stopSpeaking = () => {
    speakSeqRef.current += 1;
    if (speechSupported) window.speechSynthesis.cancel();
    streamRef.current?.stop();
    streamRef.current = null;
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
    const my = ++speakSeqRef.current;
    // 优先真流式云端 TTS；不可用时回退整段云端音频，再回退浏览器原生（情绪调音）。
    const stream = await playStreamingSpeech(result.narrative, result.emotion);
    if (my !== speakSeqRef.current) {
      stream?.stop();
      return;
    }
    if (stream) {
      streamRef.current = stream;
      audioRef.current = stream.audio;
      stream.done.finally(() => {
        if (streamRef.current === stream) {
          streamRef.current = null;
          audioRef.current = null;
          setSpeaking(false);
        }
      });
      return;
    }
    const dataUrl = await synthesizeSpeech(result.narrative, result.emotion);
    if (my !== speakSeqRef.current) return;
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

  const saveImprintAsPng = async () => {
    if (!result.imprint || savingPreview) return;
    setSavingPreview(true);
    setSaveMessage(null);

    try {
      const blob = await createImprintTicketBlob({ imprint: result.imprint, emotionLabel: meta.label });
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewBlob(blob);
      setPreviewUrl(url);
      setPreviewOpen(true);
    } catch {
      setSaveMessage("预览生成失败，请稍后再试");
    } finally {
      setSavingPreview(false);
    }
  };

  const downloadPreviewPng = () => {
    if (!previewUrl || !previewBlob) return;
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = "xinyu-imprint.png";
    link.click();
    setSaveMessage("已生成 PNG");
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
      <div ref={cardRef} className="panel-glass-2 relative overflow-hidden rounded-card-lg p-4 sm:p-6">
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
          className="panel-glass-2 group mt-4 overflow-hidden rounded-[34px] p-0"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_8%,rgba(255,255,255,0.16),transparent_27%),radial-gradient(circle_at_82%_72%,rgba(255,216,157,0.14),transparent_31%),linear-gradient(135deg,rgba(255,255,255,0.055),transparent_46%)]" />
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
          <div className="pointer-events-none absolute bottom-0 left-12 right-12 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" />

          <div className="relative grid gap-6 p-5 sm:min-h-[14.5rem] sm:grid-cols-[minmax(0,1fr)_15.25rem] sm:items-stretch sm:p-7">
            <div className="flex min-w-0 flex-col py-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-caption tracking-[0.30em] text-mist-400">心灵印记</p>
                <span className="rounded-full border border-white/16 bg-white/[0.06] px-3 py-1 text-[11px] tracking-[0.18em] text-mist-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
                  收藏票根
                </span>
              </div>
              <p className="mt-8 max-w-[10.5em] font-serif text-mist-100 text-[clamp(1.7rem,4.6vw,2.45rem)] leading-[1.34] [text-wrap:balance] sm:mt-10">
                {result.imprint}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-6 text-[11px] tracking-[0.18em] text-mist-500">
                <span className="h-px w-10 bg-white/24" />
                <span>心屿留存</span>
                {saveMessage && <span className="tracking-[0.12em] text-mist-400">{saveMessage}</span>}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[28px] border border-white/16 bg-ink-950/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.13),0_20px_48px_rgba(10,14,22,0.16)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_12%,rgba(255,255,255,0.13),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.015))]" />
              <span className="pointer-events-none absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-ink-950/62 ring-1 ring-white/18" />
              <span className="pointer-events-none absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-ink-950/62 ring-1 ring-white/18" />
              <span className="pointer-events-none absolute inset-y-5 left-6 border-l border-dashed border-white/24" />
              <div className="relative flex h-full min-h-[11.5rem] flex-col pl-7">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.20em] text-mist-400">ADMIT ONE MEMORY</p>
                  <p className="mt-1 text-[10px] tracking-[0.18em] text-mist-500">NO. XINYU-PNG</p>
                </div>
                <div className="mt-7">
                  <p className="font-serif text-[22px] leading-snug text-mist-100">把这一刻收好</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-mist-400">确认后保存 PNG</p>
                </div>
                <motion.button
                  type="button"
                  onClick={saveImprintAsPng}
                  disabled={savingPreview}
                  aria-label="生成收藏票根预览"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING_TAP}
                  className="mt-auto flex min-h-12 w-full items-center justify-between gap-3 rounded-full border border-white/18 bg-ink-950/42 px-4 text-left text-mist-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_14px_34px_rgba(0,0,0,0.18)] transition hover:border-white/30 hover:bg-ink-950/52 disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="text-[14px] font-medium tracking-[0.04em]">
                    {savingPreview ? "生成中" : "生成预览"}
                  </span>
                  <span
                    aria-hidden
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-mist-100 text-ink-900"
                  >
                    ›
                  </span>
                </motion.button>
                <div className="mt-3 flex items-center justify-between text-[10px] tracking-[0.18em] text-mist-500">
                  <span>PNG KEEPSAKE</span>
                  <span>01</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {previewOpen && previewUrl && (
          <motion.div
            className="fixed inset-0 z-[95] grid place-items-center px-4 py-6"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-slate-950/72 backdrop-blur-md"
              aria-label="关闭预览"
              onClick={closeImprintPreview}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="imprint-preview-title"
              className="panel-glass-3 relative z-10 w-full max-w-[780px] overflow-hidden rounded-[28px] p-4 sm:p-6"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="absolute inset-0 bg-[#10131f]/86" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.16),transparent_34%),radial-gradient(circle_at_78%_100%,rgba(246,194,116,0.10),transparent_32%)]" />
              <div className="relative">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-caption text-mist-400 tracking-[0.22em]">PNG PREVIEW</p>
                    <h2 id="imprint-preview-title" className="mt-2 font-serif text-2xl text-mist-100">保存前预览</h2>
                    <p className="mt-1 text-sm text-mist-300">这张岛屿票根会保存为 PNG。</p>
                  </div>
                  <button type="button" className="btn-ghost min-h-11 px-4 text-sm" onClick={closeImprintPreview}>
                    关闭
                  </button>
                </div>

                <div className="rounded-[22px] border border-white/16 bg-black/20 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_24px_70px_rgba(0,0,0,0.32)]">
                  <img src={previewUrl} alt="心灵印记 PNG 预览" className="block w-full rounded-[16px]" />
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
                  <button type="button" className="btn-ghost" onClick={closeImprintPreview}>
                    取消
                  </button>
                  <motion.button
                    type="button"
                    className="btn-primary"
                    onClick={downloadPreviewPng}
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING_TAP}
                  >
                    下载 PNG
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {done && (
        <motion.div
          className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-5"
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
            type="button"
            onClick={() => setChatOpen((v) => !v)}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_TAP}
            className="btn-ghost"
          >
            {chatOpen ? "收起对话" : "继续聊聊 ›"}
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

      {done && chatOpen && (
        <IslandChat userId={userId} seedUser={seedMood ?? ""} seedNarrative={result.narrative} />
      )}
    </motion.div>
  );
}
