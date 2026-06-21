interface Props {
  memoryCount: number;
  onMindMap: () => void;
  onTimeMachine: () => void;
  onIslandMap: () => void;
  onPhrases: () => void;
  onLetter: () => void;
}

function Row({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="panel-glass-1 flex w-full items-center justify-between rounded-card px-4 py-3 text-left transition active:scale-[0.98]"
    >
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
export default function MemoryTab({ memoryCount, onMindMap, onTimeMachine, onIslandMap, onPhrases, onLetter }: Props) {
  return (
    <div className="flex flex-1 flex-col gap-3 pt-2">
      <p className="text-center text-caption tracking-[0.2em] text-white/40">足 迹</p>
      {memoryCount === 0 && (
        <p className="px-6 pb-1 text-center text-[13px] leading-relaxed text-white/45">
          还没有留下足迹。回到「岛屿」说一句心情，<br />这里就会长出你走过的轨迹。
        </p>
      )}
      <Row title="心象地图" desc="历史心情连成的一条轨迹" onClick={onMindMap} />
      <Row title="时光机 · 一键回望" desc="把跨天的成长压进一段回放" onClick={onTimeMachine} />
      <Row title="登高望岛" desc="俯瞰你一点点养成的这座岛" onClick={onIslandMap} />
      <Row title="私房安慰话" desc="把重要的人说过的话教给岛屿" onClick={onPhrases} />
      <Row title="岛屿年报" desc="让岛屿读完全程，写给你一封信" onClick={onLetter} />
    </div>
  );
}
