import { motion } from "framer-motion";

interface Props {
  memoryCount: number;
  accent: string;
  onMindMap: () => void;
  onTimeMachine: () => void;
  onIslandMap: () => void;
  onPhrases: () => void;
  onLetter: () => void;
  /** 「问问岛屿」AI 助手触发节点：由父级渲染（内含按钮 + 弹窗），memoryCount>0 时显示。 */
  assistant?: React.ReactNode;
}

function Row({ title, desc, accent, onClick }: { title: string; desc: string; accent: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="panel-glass-1 flex min-h-[60px] w-full items-center justify-between gap-3 rounded-card px-4 py-3 text-left transition active:scale-[0.98]"
    >
      <span
        className="h-8 w-px shrink-0 rounded-full"
        style={{ background: `linear-gradient(180deg, transparent, ${accent}99, transparent)` }}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block text-[14px] text-white/85">{title}</span>
        <span className="mt-0.5 block text-caption text-white/45">{desc}</span>
      </span>
      <span className="shrink-0 text-white/35" aria-hidden>›</span>
    </button>
  );
}

// 「足迹」Tab：把回访 / 记忆 / 时光机 / 私房话 / 年报 收成拇指可达的入口列表，
// 每个入口打开各自的全屏覆盖层或底部 Sheet（覆盖层在 HomeMobile 渲染、复用桌面组件）。
// 「问问岛屿」AI 助手以行内入口呈现（assistant 由父级渲染）。
// 布局：标题贴顶，入口列表在剩余空间垂直居中——避免列表堆顶、下半屏空荡。
export default function MemoryTab({ memoryCount, accent, onMindMap, onTimeMachine, onIslandMap, onPhrases, onLetter, assistant }: Props) {
  return (
    <div className="flex flex-1 flex-col pt-2">
      {/* 顶部：标题 + 空态提示 */}
      <div className="flex flex-col gap-3">
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative text-center text-caption tracking-[0.2em] text-white/40"
        >
          <span aria-hidden className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto h-px w-16" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)" }} />
          <span className="relative">足 迹</span>
        </motion.p>
        {memoryCount === 0 && (
          <p className="px-6 text-center text-[13px] leading-relaxed text-white/45">
            还没有留下足迹。回到「岛屿」说一句心情，<br />这里就会长出你走过的轨迹。
          </p>
        )}
      </div>

      {/* 入口列表：在剩余空间垂直居中 */}
      <div className="my-auto flex flex-col gap-3 py-4">
        <Row title="心象地图" desc="历史心情连成的一条轨迹" accent={accent} onClick={onMindMap} />
        <Row title="时光机 · 一键回望" desc="把跨天的成长压进一段回放" accent={accent} onClick={onTimeMachine} />
        <Row title="登高望岛" desc="俯瞰你一点点养成的这座岛" accent={accent} onClick={onIslandMap} />
        <Row title="私房安慰话" desc="把重要的人说过的话教给岛屿" accent={accent} onClick={onPhrases} />
        <Row title="岛屿年报" desc="让岛屿读完全程，写给你一封信" accent={accent} onClick={onLetter} />
        {memoryCount > 0 && assistant && (
          <div className="panel-glass-1 flex min-h-[60px] w-full items-center justify-between gap-3 rounded-card px-4 py-3">
            <span
              className="h-8 w-px shrink-0 rounded-full"
              style={{ background: `linear-gradient(180deg, transparent, ${accent}99, transparent)` }}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-[14px] text-white/85">问问岛屿</span>
              <span className="mt-0.5 block text-caption text-white/45">读着你的记录，据实回答</span>
            </span>
            {assistant}
          </div>
        )}
      </div>
    </div>
  );
}
