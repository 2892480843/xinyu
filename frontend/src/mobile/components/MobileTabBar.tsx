export type MobileTab = "island" | "memory" | "self";

interface Props {
  active: MobileTab;
  onSelect: (t: MobileTab) => void;
  onCompose: () => void;
  accent: string;
}

function TabButton({
  label, active, accent, onClick,
}: { label: string; active: boolean; accent: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // w-14=56px 宽够；min-h-[44px] 把命中区撑到 Apple HIG 标准（视觉仍是小圆点+小字）。
      className="flex w-14 min-h-[44px] flex-col items-center justify-center gap-1.5 py-1 transition active:scale-95"
      aria-pressed={active}
    >
      {/* 圆点 + active 柔光晕（halo 绝对定位，不影响行高，与倾诉 FAB / Sheet 标题点同 accent） */}
      <span className="relative flex h-2.5 w-2.5 items-center justify-center" aria-hidden>
        <span
          className="absolute h-5 w-5 rounded-full transition-opacity duration-300"
          style={{ background: `radial-gradient(circle, ${accent}55 0%, transparent 70%)`, opacity: active ? 1 : 0 }}
        />
        <span
          className="relative h-2 w-2 rounded-full transition-all duration-300"
          style={{
            background: active ? accent : "transparent",
            border: `1.5px solid ${active ? accent : "rgba(255,255,255,0.32)"}`,
            boxShadow: active ? `0 0 8px ${accent}` : "none",
            transform: active ? "scale(1.05)" : "scale(1)",
          }}
        />
      </span>
      <span
        className="text-[11px] tracking-[0.2em] transition-colors duration-300"
        style={{ color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.42)" }}
      >
        {label}
      </span>
    </button>
  );
}

// 底部导航：岛屿 / 足迹 / 中央倾诉 FAB / 我。全部落在拇指自然弧区。
// 半透明玻璃 + 细描边，不抢岛屿背景。
export default function MobileTabBar({ active, onSelect, onCompose, accent }: Props) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40" aria-label="主导航">
      <div
        className="panel-glass-2 mx-auto flex max-w-[34rem] items-center justify-around rounded-t-card-lg px-3 pt-2"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
      >
        <TabButton label="岛屿" active={active === "island"} accent={accent} onClick={() => onSelect("island")} />
        <TabButton label="足迹" active={active === "memory"} accent={accent} onClick={() => onSelect("memory")} />
        {/* 中央倾诉 FAB：凸起暖光，核心闭环入口 */}
        <button
          type="button"
          onClick={onCompose}
          aria-label="倾诉"
          className="relative -mt-7 grid h-16 w-16 shrink-0 place-items-center rounded-full font-display text-[13px] tracking-[0.2em] text-ink-950 transition active:scale-95"
          style={{
            background: `radial-gradient(circle at 50% 34%, ${accent} 0%, ${accent}d9 58%, ${accent}a6 100%)`,
            boxShadow: `0 0 0 1px rgba(255,255,255,0.14), 0 12px 32px -8px ${accent}, 0 4px 14px -4px ${accent}cc, inset 0 1px 0 rgba(255,255,255,0.7)`,
          }}
        >
          倾诉
        </button>
        <TabButton label="我" active={active === "self"} accent={accent} onClick={() => onSelect("self")} />
        {/* 右侧平衡占位，让中央 FAB 视觉居中 */}
        <span className="w-14" aria-hidden />
      </div>
    </nav>
  );
}
