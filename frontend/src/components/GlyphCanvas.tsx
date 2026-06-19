import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { readGlyph, type GlyphResponse } from "../lib/api";
import { EMOTION_META } from "../lib/sceneMap";
import { play as playSfx } from "../lib/sfx";

interface Props {
  userId: string;
  onClose: (result: GlyphResponse | null) => void;
}

// 可书写的心境字——与后端 GLYPH_CHARS 一致
const CHARS = ["累", "沉", "空", "撑", "涌", "稳", "静", "暖"];
const SIZE = 280;

interface Pt {
  x: number;
  y: number;
  t: number;
}

/**
 * 写一个字给岛屿：用户从 8 个心境字里选一个描红写下。
 * 字是确定的（无需 OCR、不依赖多模态），前端只捕捉书写动力学（笔速/停顿/抖动），
 * hy3-preview 结合字义 + 动力学读出此刻心情，刻成一块心境石。多块积累成石林。
 *
 * 文化破圈点：汉字"一个字承载一种心境"（累/静/撑）是华语独有的低门槛表达，
 * 对儿童/老人/不擅言辞者尤其可达。
 */
export default function GlyphCanvas({ userId, onClose }: Props) {
  const [char, setChar] = useState<string | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GlyphResponse | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const drawing = useRef(false);
  const strokes = useRef<Pt[][]>([]);
  const current = useRef<Pt[]>([]);

  // 重绘描红引导字
  const drawGuide = (c: string | null) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    // 高分屏 DPR 缩放：把 backing store 放大到物理像素再缩回 CSS 像素，避免描红/笔迹发糊(#7)
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== SIZE * dpr) {
      cv.width = SIZE * dpr;
      cv.height = SIZE * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (c) {
      ctx.save();
      ctx.font = `200px "Noto Serif SC", "Songti SC", serif`;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c, SIZE / 2, SIZE / 2 + 8);
      ctx.restore();
    }
  };

  // 仅同步 canvas（外部系统），不在此调 setState——重置 hasInk 放在选字 handler 里
  useEffect(() => {
    drawGuide(char);
    strokes.current = [];
    current.current = [];
  }, [char]);

  const pickChar = (c: string) => {
    playSfx("tap");
    setChar(c);
    setHasInk(false);
  };

  const pos = (e: React.PointerEvent): Pt => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SIZE,
      y: ((e.clientY - rect.top) / rect.height) * SIZE,
      t: e.timeStamp,
    };
  };

  const down = (e: React.PointerEvent) => {
    if (!char || result) return;
    if (!hasInk && strokes.current.length === 0) playSfx("inscribe"); // 首笔落墨
    drawing.current = true;
    current.current = [pos(e)];
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !char) return;
    const p = pos(e);
    const ctx = canvasRef.current!.getContext("2d");
    const prev = current.current[current.current.length - 1];
    if (ctx && prev) {
      // 速度感笔锋：慢起笔粗、快滑笔细
      const dt = Math.max(1, p.t - prev.t);
      const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
      const speed = dist / dt; // px/ms
      const lineWidth = Math.max(2.4, Math.min(8.5, 9 - speed * 5.5));
      ctx.strokeStyle = "rgba(255,255,255,0.94)";
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // 墨光晕
      ctx.shadowColor = "rgba(255,255,255,0.45)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    current.current.push(p);
    setHasInk(true);
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (current.current.length > 1) strokes.current.push(current.current);
    current.current = [];
  };

  const clear = () => {
    playSfx("page"); // 擦去重写
    drawGuide(char);
    strokes.current = [];
    current.current = [];
    setHasInk(false);
  };

  // 从笔迹算书写动力学
  const computeDynamics = () => {
    const all = strokes.current;
    const flat: Pt[] = all.flat();
    if (flat.length < 2) {
      return { avg_speed: 0, duration_ms: 0, stroke_count: all.length, pause_count: 0, jitter: 0 };
    }
    const duration = flat[flat.length - 1].t - flat[0].t;
    // 各 move 段的瞬时速度
    const speeds: number[] = [];
    let pathLen = 0;
    for (const st of all) {
      for (let i = 1; i < st.length; i++) {
        const dx = st[i].x - st[i - 1].x;
        const dy = st[i].y - st[i - 1].y;
        const dist = Math.hypot(dx, dy);
        const dt = Math.max(1, st[i].t - st[i - 1].t);
        pathLen += dist;
        speeds.push((dist / dt) * 1000); // px/s
      }
    }
    const activeMs = all.reduce((s, st) => s + (st[st.length - 1].t - st[0].t), 0);
    const avgSpeed = activeMs > 0 ? (pathLen / activeMs) * 1000 : 0;
    // 抖动：速度标准差 / 均值，归一到 0-1
    const mean = speeds.reduce((a, b) => a + b, 0) / (speeds.length || 1);
    const variance = speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / (speeds.length || 1);
    const std = Math.sqrt(variance);
    const jitter = Math.max(0, Math.min(1, std / (mean + 60)));
    // 停顿：相邻笔画之间间隔 > 400ms 记一次
    let pauses = 0;
    for (let i = 1; i < all.length; i++) {
      const gap = all[i][0].t - all[i - 1][all[i - 1].length - 1].t;
      if (gap > 400) pauses++;
    }
    return {
      avg_speed: Math.round(avgSpeed),
      duration_ms: Math.round(duration),
      stroke_count: all.length,
      pause_count: pauses,
      jitter: Math.round(jitter * 100) / 100,
    };
  };

  const submit = async () => {
    if (!char || !hasInk || busy) return;
    setBusy(true);
    setError(null);
    playSfx("shell"); // 交给岛屿读心
    const res = await readGlyph(userId, char, computeDynamics());
    if (res) {
      setResult(res);
      playSfx("bloom"); // 心境石成形
    } else setError("岛屿这次没读到，再写一次试试");
    setBusy(false);
  };

  return (
    <motion.div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/68 backdrop-blur-md px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      role="dialog"
      aria-label="写一个字给岛屿"
    >
      {/* 不用 mode="wait"：rAF 节流时 exit 会卡住、result 屏永不挂载（同 Home/NarrativeCard 的修复） */}
      <AnimatePresence>
        {!result ? (
          <motion.div key="write" className="flex flex-col items-center" exit={{ opacity: 0 }}>
            <p className="text-white/85 text-lg mb-1">写一个字给岛屿</p>
            <p className="text-white/45 text-[12px] mb-5">选一个最贴近此刻的字，照着描下来——不用说话，岛屿读得懂。</p>

            {/* 选字 */}
            <div className="flex flex-wrap gap-2 justify-center mb-4 max-w-sm">
              {CHARS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickChar(c)}
                  className={`h-11 w-11 rounded-xl text-xl transition border ${
                    char === c
                      ? "bg-white/90 text-slate-800 border-white"
                      : "bg-white/8 text-white/75 border-white/15 hover:bg-white/16"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* 画布 */}
            <div className="rounded-2xl border border-white/15 bg-slate-900/40 overflow-hidden touch-none">
              <canvas
                ref={canvasRef}
                width={SIZE}
                height={SIZE}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerLeave={up}
                className="block touch-none cursor-crosshair"
                style={{ width: "min(72vw, 280px)", height: "min(72vw, 280px)" }}
              />
            </div>

            {error && <p className="mt-3 text-rose-200/75 text-[12px]">{error}</p>}

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => onClose(null)}
                className="text-white/40 text-[12px] hover:text-white/80 transition"
              >
                先不写了
              </button>
              {hasInk && (
                <button
                  type="button"
                  onClick={clear}
                  className="text-white/45 text-[12px] hover:text-white/85 transition"
                >
                  重写
                </button>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={!char || !hasInk || busy}
                className="px-5 py-2 rounded-full bg-white/90 text-slate-800 text-sm font-medium hover:bg-white transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? "岛屿在读…" : "写好了"}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="result"
            className="flex flex-col items-center text-center max-w-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* 心境石 */}
            <motion.div
              className="relative h-28 w-28 rounded-[42%] bg-gradient-to-br from-slate-400/30 to-slate-700/40 border border-white/15 flex items-center justify-center mb-5 shadow-2xl"
              initial={{ scale: 0.5, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 14 }}
            >
              <span className="text-5xl text-white/85" style={{ fontFamily: '"Songti SC", serif' }}>
                {result.char}
              </span>
            </motion.div>
            <span
              className="text-xs px-2.5 py-1 rounded-full bg-white/12 text-white/80 mb-3"
            >
              {EMOTION_META[result.emotion]?.label ?? result.emotion} · {Math.round(result.intensity * 100)}
            </span>
            <p className="text-white/85 text-[15px] leading-relaxed mb-1">{result.reading}</p>
            <p className="text-white/40 text-[12px] mt-2">岛上多了一块刻着「{result.char}」的心境石</p>
            <button
              type="button"
              onClick={() => onClose(result)}
              className="mt-8 px-5 py-2 rounded-full bg-white/12 text-white/80 text-sm hover:bg-white/20 transition"
            >
              回到岛屿
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
