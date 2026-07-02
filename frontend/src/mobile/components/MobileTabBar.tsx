import type { CSSProperties } from "react";

export type MobileTab = "island" | "memory" | "self";

interface Props {
  active: MobileTab;
  onSelect: (t: MobileTab) => void;
  accent: string;
}

function TabButton({
  label, active, accent, onClick, className = "",
}: { label: string; active: boolean; accent: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // 固定点位 + 52px 命中区，避免底栏文字因占位列/字距看起来漂移。
      className={`mx-auto flex min-h-[3.5rem] w-full max-w-[4rem] flex-col items-center justify-center gap-1.5 py-1 transition active:scale-95 ${className}`}
      aria-pressed={active}
    >
      {/* 圆点 + active 柔光晕，与倾诉 FAB / Sheet 标题点同 accent。 */}
      <span
        className="mobile-tab-mark"
        data-active={active ? "true" : "false"}
        style={{ "--tab-accent": accent } as CSSProperties}
        aria-hidden
      >
        <span />
      </span>
      <span
        className="whitespace-nowrap text-[11px] leading-none tracking-[0.18em] transition-colors duration-300"
        style={{ color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.42)" }}
      >
        {label}
      </span>
    </button>
  );
}

// 底部导航只负责页面切换；核心行动留给页面里的「说给岛屿」主按钮。
// 这样底部不会和 CTA 抢视觉重心。
export default function MobileTabBar({ active, onSelect, accent }: Props) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 px-6"
      style={{ paddingBottom: "calc(0.65rem + env(safe-area-inset-bottom))" }}
      aria-label="主导航"
    >
      <div
        className="mobile-tabbar-shell mx-auto grid grid-cols-3 items-center"
      >
        <TabButton className="col-start-1" label="岛屿" active={active === "island"} accent={accent} onClick={() => onSelect("island")} />
        <TabButton className="col-start-2" label="足迹" active={active === "memory"} accent={accent} onClick={() => onSelect("memory")} />
        <TabButton className="col-start-3" label="我" active={active === "self"} accent={accent} onClick={() => onSelect("self")} />
      </div>
    </nav>
  );
}
