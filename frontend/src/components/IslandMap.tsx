import { useMemo, useState } from "react";
import { motion, AnimatePresence, useTransform } from "framer-motion";
import type { IslandState, ArtifactItem } from "../lib/api";
import { FEATURE_META, EMOTION_COLOR } from "../lib/islandMeta";
import FeatureGlyph from "./IslandFeatureIcons";
import { useImmersion } from "../hooks/useImmersion";
import { useParallax } from "../hooks/useParallax";
import { useModalDismiss } from "../hooks/useModalDismiss";

interface Props {
  island: IslandState | null;
  artifacts: ArtifactItem[];
  onClose: () => void;
}

interface MapNode {
  uid: string;
  key: string;
  label: string;
  emotion: string;
  inscription: string;
  left: number;
  bottom: number;
}

// 「登高望岛」——把岛屿元素与玩家留下的物件，按各自坐标摆在一张俯瞰图上，
// 让人一眼看到「这是我养成的、独一无二的岛」。点击节点浮出它的来历/刻字。
export default function IslandMap({ island, artifacts, onClose }: Props) {
  const [selected, setSelected] = useState<MapNode | null>(null);
  useModalDismiss(true, onClose);

  // 俯身沙盘：整图后仰成倾斜台面 + 指针环视。静海/reduced-motion 退回平面俯视（rotateX 归 0）。
  const { immersive } = useImmersion();
  const orbit = useParallax(8, immersive);
  const boardRotateX = useTransform(orbit.rotateX, (v) => (immersive ? 10 : 0) + v);

  const nodes = useMemo<MapNode[]>(() => {
    const out: MapNode[] = [];
    // 玩家留下的物件（持久、可能带刻字）优先
    artifacts.forEach((a, i) => {
      const meta = FEATURE_META[a.artifact];
      if (!meta) return;
      // 同 key 多枚时按序微偏移，避免完全重叠
      const dup = artifacts.slice(0, i).filter((x) => x.artifact === a.artifact).length;
      out.push({
        uid: `art-${a.id}`,
        key: a.artifact,
        label: a.label || meta.label,
        emotion: a.emotion || island?.dominant_emotion || "calm",
        inscription: a.inscription || "",
        left: clamp(meta.left + dup * 5 - 2),
        bottom: clamp(meta.bottom + dup * 3),
      });
    });
    // 当前情绪生长出的岛屿元素（去掉已作为物件出现的 key）
    (island?.features ?? []).forEach((f) => {
      const meta = FEATURE_META[f];
      if (!meta || artifacts.some((a) => a.artifact === f)) return;
      out.push({
        uid: `feat-${f}`,
        key: f,
        label: meta.label,
        emotion: island?.dominant_emotion || "calm",
        inscription: "",
        left: clamp(meta.left),
        bottom: clamp(meta.bottom),
      });
    });
    return out;
  }, [island, artifacts]);

  const count = nodes.length;

  return (
    <motion.div
      className="fixed inset-0 z-[60] overflow-hidden bg-[#070b16]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* 夜空底 + 顶光 */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 80% at 50% 0%, rgba(120,140,200,0.18), transparent 55%), linear-gradient(180deg,#0a0f20,#070b16)" }}
      />

      {/* 顶部标题 */}
      <div className="absolute inset-x-0 z-10 text-center" style={{ top: "calc(1.6rem + env(safe-area-inset-top))" }}>
        <p className="font-display text-[20px] font-light tracking-[0.3em] text-white/90">登 高 望 岛</p>
        <p className="mt-1 text-caption text-white/45">
          {count > 0 ? `你养成的这座岛 · 第 ${island?.growth_level ?? 1} 级 · ${count} 处痕迹` : "你养成的这座岛"}
        </p>
      </div>

      {/* 关闭 */}
      <button
        onClick={onClose}
        className="btn-link absolute z-20 text-white/55 py-2 px-2"
        style={{ top: "calc(1.2rem + env(safe-area-inset-top))", right: "calc(1rem + env(safe-area-inset-right))" }}
      >
        回到岸上
      </button>

      {/* 俯瞰岛屿 */}
      <div className="absolute inset-0 grid place-items-center px-6" style={{ perspective: "1000px" }}>
        <motion.div
          className="relative w-[min(88vw,640px)] aspect-square"
          style={{ rotateX: boardRotateX, rotateY: orbit.rotateY, transformStyle: "preserve-3d" }}
        >
          {/* 海面光环 */}
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: "radial-gradient(circle at 50% 55%, rgba(90,150,170,0.16), transparent 62%)" }}
          />
          {/* 岛屿主体（俯瞰不规则形） */}
          <svg viewBox="0 0 100 100" className="absolute inset-[8%]" aria-hidden>
            <defs>
              <radialGradient id="map-island" cx="0.5" cy="0.5">
                <stop offset="0" stopColor="#2c3a52" />
                <stop offset="1" stopColor="#19233a" />
              </radialGradient>
            </defs>
            <path
              d="M50 6 C70 8 82 16 88 34 C94 52 86 72 70 84 C54 96 34 94 20 82 C6 70 4 48 12 30 C20 14 32 6 50 6 Z"
              fill="url(#map-island)"
              stroke="rgba(159,180,240,0.28)"
              strokeWidth="0.6"
            />
            <path
              d="M50 12 C66 14 76 22 80 36 C85 52 78 68 64 78 C50 88 34 86 24 76 C12 64 12 46 18 32 C25 18 36 12 50 12 Z"
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="0.5"
            />
          </svg>

          {/* 节点 */}
          {nodes.map((n, i) => {
            const color = EMOTION_COLOR[n.emotion] ?? "#9fb4f0";
            const active = selected?.uid === n.uid;
            return (
              <div
                key={n.uid}
                className="absolute"
                style={{
                  left: `${n.left}%`,
                  bottom: `${n.bottom}%`,
                  transform: "translate(-50%, 50%)",
                  transformStyle: "preserve-3d",
                }}
              >
                {/* 落影：贴在沙盘面上，衬出立牌的「站立」感 */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-8 rounded-[50%]"
                  style={{ background: "rgba(0,0,0,0.45)", filter: "blur(5px)", transform: "translate(-50%, 5px)" }}
                />
                {/* 立牌：沿 Z 抬离沙盘 + 以底边为轴缓缓浮现（无过冲弹跳、无奖励音） */}
                <motion.button
                  className="relative grid place-items-center"
                  style={{ color, transformStyle: "preserve-3d" }}
                  initial={{ opacity: 0, y: 14, z: 24 }}
                  animate={{ opacity: 1, y: active ? -2 : 0, z: active ? 34 : 24, scale: active ? 1.2 : 1 }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 }}
                  onClick={() => setSelected(active ? null : n)}
                  title={n.label}
                >
                  <span
                    className="grid place-items-center h-9 w-9 rounded-full"
                    style={{
                      background: active ? `${color}26` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? color : `${color}66`}`,
                      filter: `drop-shadow(0 0 8px ${color}${active ? "99" : "44"})`,
                    }}
                  >
                    <FeatureGlyph name={n.key} size={20} />
                  </span>
                </motion.button>
              </div>
            );
          })}

          {count === 0 && (
            <div className="absolute inset-0 grid place-items-center px-8 text-center">
              <p className="text-reading leading-loose text-white/65">
                岛上还很空旷。
                <br />
                多来说说心情、留下一两枚物件，这里就会长出只属于你的形状。
              </p>
            </div>
          )}
        </motion.div>
      </div>

      {/* 选中节点详情 */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.uid}
            className="absolute inset-x-0 z-20 flex justify-center px-6"
            style={{ bottom: "calc(2.2rem + env(safe-area-inset-bottom))" }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="panel-glass-3 rounded-card-lg px-5 py-4 max-w-sm w-full text-center">
              <div className="flex items-center justify-center gap-2">
                <span style={{ color: EMOTION_COLOR[selected.emotion] ?? "#9fb4f0" }}>
                  <FeatureGlyph name={selected.key} size={18} />
                </span>
                <span className="font-serif text-mist-100 text-[15px]">{selected.label}</span>
              </div>
              {selected.inscription ? (
                <p className="mt-3 font-serif italic text-reading leading-loose text-mist-200">
                  「{selected.inscription}」
                </p>
              ) : (
                <p className="mt-2 text-caption text-white/45">岛屿替你把它留在了这里。</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function clamp(v: number): number {
  return Math.max(8, Math.min(86, v));
}
