import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MemoryItem, IslandState, ArtifactItem } from "../lib/api";
import { EMOTION_META } from "../lib/sceneMap";
import { EMOTION_COLOR } from "../lib/islandMeta";
import FeatureGlyph from "./IslandFeatureIcons";
import IslandLetter from "./IslandLetter";
import IslandPhrases from "./IslandPhrases";
import { play as playSfx } from "../lib/sfx";

interface Props {
  memories: MemoryItem[];
  island: IslandState | null;
  artifacts: ArtifactItem[];
  open: boolean;
  onToggle: () => void;
  userId?: string;
  /**
   * embedded（默认，桌面）：侧栏 widget——带触发条按钮、右锚定展开面板、内嵌 phrases/letter。
   * fullscreen（移动端）：纯轨迹图查看器——无触发条、全宽面板、轨迹图更高、不内嵌 phrases/letter
   *   （移动端 phrases/letter 走独立的 BottomSheet 入口，避免双入口重复）。
   */
  variant?: "embedded" | "fullscreen";
}

function fmt(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

/**
 * 心象地图：把历史情绪从普通列表升级为岛上的轨迹节点。
 * 每条记忆是一个光点——颜色表示情绪、大小表示强度，点击可查看当时的心情。
 */
export default function MindMap({ memories, island, artifacts, open, onToggle, userId, variant = "embedded" }: Props) {
  const [selected, setSelected] = useState<MemoryItem | null>(null);
  const isFullscreen = variant === "fullscreen";

  // 心境石单独成「石林」，其余物件走普通收藏
  const glyphStones = artifacts.filter((a) => a.artifact === "glyph_stone");
  const otherArtifacts = artifacts.filter((a) => a.artifact !== "glyph_stone");

  // 取最近 12 条，反转成「旧→新」从左到右的时间轨迹
  const nodes = memories.slice(0, 12).slice().reverse();

  const points = nodes.map((m, i) => {
    const x = nodes.length === 1 ? 50 : 8 + (i / (nodes.length - 1)) * 84;
    // 沿正弦波分布，形成一条蜿蜒的心理轨迹
    const y = 50 + Math.sin(i * 0.9) * 26;
    const size = 9 + Math.min(Math.max(m.intensity, 0), 1) * 15;
    return { m, x, y, size };
  });

  // 焦虑节奏快、平静节奏慢——节点呼吸时长按情绪微调
  const breatheDuration = (emo: string) =>
    emo === "anxious" || emo === "angry" ? 2.4 : emo === "calm" || emo === "happy" ? 5.8 : 3.6;
  const overflowed = memories.length > 12;

  // 贝塞尔曲线轨迹：把 points 串成 smooth path
  const pathD = points.length > 1
    ? points.reduce((d, p, i) => {
        if (i === 0) return `M ${p.x} ${p.y}`;
        const prev = points[i - 1];
        const cx1 = prev.x + (p.x - prev.x) * 0.5;
        const cx2 = prev.x + (p.x - prev.x) * 0.5;
        return `${d} C ${cx1} ${prev.y}, ${cx2} ${p.y}, ${p.x} ${p.y}`;
      }, "")
    : "";

  return (
    <div className={isFullscreen ? "relative z-0 w-full" : "relative z-30 max-w-[min(50vw,21rem)]"}>
      {/* embedded（桌面）才渲染 widget 触发条；fullscreen 由外部容器提供入口 */}
      {!isFullscreen && (
        <button
          onClick={() => { playSfx(open ? "page" : "reveal"); onToggle(); }}
          className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-card bg-white/10 backdrop-blur-md border border-white/18 text-mist-200 hover:text-white text-sm hover:bg-white/15 transition"
          aria-expanded={open}
        >
          <span className="shrink-0 font-serif">心象地图</span>
          <span className="text-mist-400 text-caption truncate tnum">
            {island ? `第${island.growth_level}级 · ` : ""}
            {memories.length} 片心情 · {open ? "收起" : "翻开"}
          </span>
        </button>
      )}

      <AnimatePresence>
        {(isFullscreen || open) && (
          <motion.div
            className={`panel-glass-3 rounded-card-lg overflow-hidden ${
              isFullscreen ? "relative w-full" : "absolute right-0 top-full mt-2 w-[min(86vw,21rem)]"
            }`}
            style={{ maxHeight: isFullscreen ? "none" : "calc(100dvh - 180px)" }}
            initial={isFullscreen ? false : { opacity: 0, height: 0, y: -8 }}
            animate={isFullscreen ? undefined : { opacity: 1, height: "auto", y: 0 }}
            exit={isFullscreen ? undefined : { opacity: 0, height: 0, y: -8 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: isFullscreen ? "none" : "calc(100dvh - 180px)" }}>
            {nodes.length === 0 ? (
              <div className="py-7 px-6 text-center">
                {/* 空态：60×80 静态岛屿剪影 */}
                <svg viewBox="0 0 60 80" className="mx-auto mb-3 h-16 w-12 opacity-70" aria-hidden>
                  <defs>
                    <radialGradient id="mm-empty-moon" cx="0.5" cy="0.5">
                      <stop offset="0" stopColor="#fff" />
                      <stop offset="1" stopColor="#fff" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  <circle cx="42" cy="18" r="6" fill="url(#mm-empty-moon)" opacity="0.85" />
                  <path d="M0 56 Q15 50 30 52 T60 56 L60 76 L0 76 Z" fill="#9fb4f0" opacity="0.65" />
                  <path d="M16 56 Q24 38 30 40 T46 56 Z" fill="#0a0e1f" />
                  <path d="M0 64 Q18 62 30 63 T60 64" stroke="#fff" strokeOpacity="0.25" strokeWidth="0.5" fill="none" />
                </svg>
                <p className="font-serif italic text-mist-300 text-body leading-relaxed">
                  还是一片刚刚浮出海面的岛屿——<br />
                  说说今天的心情，岛屿就开始长了。
                </p>
              </div>
            ) : (
              <>
                {/* 轨迹地图 */}
                <div className="relative w-full" style={{ height: isFullscreen ? 240 : 160 }}>
                  <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    {/* 贝塞尔曲线轨迹 */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="rgba(255,255,255,0.22)"
                      strokeWidth="0.6"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>

                  {/* 「更早」渐隐：超过 12 条时左侧显示一个虚化 ⋯ */}
                  {overflowed && (
                    <div
                      className="absolute left-1 top-1/2 -translate-y-1/2 flex flex-col items-center text-mist-500"
                      style={{ filter: "blur(0.5px)" }}
                      aria-label={`还有 ${memories.length - 12} 条更早的心情`}
                    >
                      <span className="text-caption opacity-60">更早</span>
                      <span className="text-meta">⋯</span>
                    </div>
                  )}

                  {points.map((p, i) => {
                    const color = EMOTION_COLOR[p.m.emotion] ?? "#9fb2c6";
                    const active = selected?.id === p.m.id;
                    const dur = breatheDuration(p.m.emotion);
                    return (
                      <motion.button
                        key={p.m.id}
                        type="button"
                        onClick={() => { playSfx("tap"); setSelected(active ? null : p.m); }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center rounded-full"
                        style={{
                          left: `${p.x}%`,
                          top: `${p.y}%`,
                          // 44×44 触控区，内部 span 视觉小一点
                          width: 44,
                          height: 44,
                        }}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05, duration: 0.4 }}
                        title={`${EMOTION_META[p.m.emotion]?.label ?? p.m.emotion} · ${fmt(p.m.created_at)}`}
                      >
                        <motion.span
                          aria-hidden
                          className="block rounded-full"
                          style={{
                            width: p.size,
                            height: p.size,
                            background: color,
                            boxShadow: active ? `0 0 0 3px rgba(255,255,255,0.65), 0 0 14px ${color}` : `0 0 8px ${color}`,
                          }}
                          animate={{ scale: active ? 1.1 : [1, 1.08, 1] }}
                          transition={{ duration: dur, repeat: active ? 0 : Infinity, ease: "easeInOut" }}
                        />
                      </motion.button>
                    );
                  })}
                </div>

                {/* 选中节点详情 */}
                <AnimatePresence>
                  {selected && (
                    <motion.div
                      key={selected.id}
                      className="px-3.5 pb-3.5 pt-1"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.25 }}
                    >
                      <div className="rounded-xl bg-white/8 p-3 border border-white/10">
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className="text-[11px] px-2 py-0.5 rounded-full text-white/90"
                            style={{ background: `${EMOTION_COLOR[selected.emotion] ?? "#9fb2c6"}55` }}
                          >
                            {EMOTION_META[selected.emotion]?.label ?? selected.emotion}
                          </span>
                          <span className="text-[10px] text-white/40">{fmt(selected.created_at)}</span>
                        </div>
                        <p className="text-white/65 text-[13px] leading-snug">{selected.text}</p>
                        {selected.imprint && (
                          <p className="text-white/45 text-[12px] leading-relaxed italic mt-2 pt-2 border-t border-white/10">
                            {selected.imprint}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 图例 */}
                <div className="flex flex-wrap gap-2 px-3.5 pb-3.5 pt-1">
                  {Array.from(new Set(nodes.map((m) => m.emotion))).map((emo) => (
                    <span key={emo} className="flex items-center gap-1.5 text-[10px] text-white/50">
                      <span className="h-2 w-2 rounded-full" style={{ background: EMOTION_COLOR[emo] ?? "#9fb2c6" }} />
                      {EMOTION_META[emo]?.label ?? emo}
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* 心境石林：手写的心境字逐块累积——从 1 块长到一座石林 */}
            {glyphStones.length > 0 && (
              <div className="px-3.5 pb-3.5 pt-1 border-t border-white/10">
                <p className="text-[11px] text-white/40 mb-2 mt-2">心境石林 · {glyphStones.length} 块</p>
                <div className="flex flex-wrap gap-2">
                  {glyphStones.map((a) => (
                    <span
                      key={a.id}
                      className="relative h-10 w-10 rounded-[42%] bg-gradient-to-br from-slate-400/25 to-slate-700/35 border border-white/12 flex items-center justify-center"
                      title={a.inscription ? `「${a.inscription}」` : a.label}
                    >
                      <span className="text-[17px] text-white/85" style={{ fontFamily: '"Songti SC", serif' }}>
                        {a.label}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 岛屿收藏：玩家通过仪式留下的物件（不含心境石，石林单独成林） */}
            {otherArtifacts.length > 0 && (
              <div className="px-3.5 pb-3.5 pt-1 border-t border-white/10">
                <p className="text-[11px] text-white/40 mb-2 mt-2">岛屿收藏 · {otherArtifacts.length} 件</p>
                <div className="flex flex-wrap gap-1.5">
                  {otherArtifacts.map((a) => (
                    <span
                      key={a.id}
                      className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${
                        a.inscription
                          ? "bg-amber-100/8 text-amber-50/85 border-amber-200/25"
                          : "bg-white/8 text-white/70 border-white/10"
                      }`}
                      title={a.inscription ? `「${a.inscription}」 —— 你刻在这枚${a.label}上的话` : a.label}
                    >
                      <FeatureGlyph name={a.artifact} size={12} className="opacity-80" />
                      {a.label}
                      {a.inscription && <span aria-hidden="true" className="text-amber-100/55">✒️</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 私房安慰话：用户教岛屿一句重要他人的安慰话，岛屿同类情绪复用。
                fullscreen（移动端）不内嵌——走独立 BottomSheet 入口，避免双入口重复。 */}
            {!isFullscreen && userId && <IslandPhrases userId={userId} />}

            {/* 岛屿年报：让 hy3-preview 读完整历史写一封温柔短信。同上，移动端独立入口。 */}
            {!isFullscreen && userId && <IslandLetter userId={userId} memoryCount={memories.length} />}

            </div>
            {/* 底部 mask 渐隐——暗示还可滚动 */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-6"
              style={{ background: "linear-gradient(180deg, transparent, rgba(10,14,31,0.6))" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
