import { motion } from "framer-motion";
import type { IslandState } from "../lib/api";
import { FEATURE_META, TREND_META } from "../lib/islandMeta";
import FeatureGlyph from "./IslandFeatureIcons";

interface Props {
  island: IslandState;
}

/**
 * 心象岛屿状态卡：把用户情绪历史聚合出的岛屿成长等级、趋势与元素可视化，
 * 让用户感到「我的心情真的改变了这座岛」。
 */
export default function IslandStatePanel({ island }: Props) {
  const trend = TREND_META[island.trend] ?? { label: island.trend, tone: "text-white/70" };

  return (
    <motion.div
      className="mt-4 rounded-3xl bg-white/9 backdrop-blur-md border border-white/15 p-5 shadow-2xl"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7 }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[12px] text-white/45 tracking-[0.28em]">心象岛屿</p>
        <div className="flex items-center gap-2">
          <span className={`text-[12px] ${trend.tone}`}>{trend.label}</span>
          <GrowthDots level={island.growth_level} />
        </div>
      </div>

      <p className="text-white/82 text-[14px] leading-relaxed">{island.summary}</p>

      {island.chapter && (
        <p className="mt-2 font-serif italic text-[13px] leading-relaxed text-white/55">
          {island.chapter}
        </p>
      )}

      {island.features.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {island.features.map((f) => {
            const meta = FEATURE_META[f] ?? { label: f };
            return (
              <span
                key={f}
                className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full bg-white/10 text-white/75 border border-white/12"
              >
                <FeatureGlyph name={f} size={13} className="opacity-80" />
                {meta.label}
              </span>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function GrowthDots({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-1" title={`岛屿成长等级 ${level}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < level ? "bg-white/85" : "bg-white/22"}`}
        />
      ))}
    </span>
  );
}
