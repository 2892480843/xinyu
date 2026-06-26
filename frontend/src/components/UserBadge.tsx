import type { LocalIdentity } from "../lib/localIdentity";

interface Props {
  identity: LocalIdentity;
  onClear: () => void;
  onDeleteData: () => void;
  /** compact=桌面紧凑徽章(默认)；cards=移动端卡片式按钮，触摸区达标。 */
  variant?: "compact" | "cards";
}

export default function UserBadge({ identity, onClear, onDeleteData, variant = "compact" }: Props) {
  if (variant === "cards") {
    // 移动端「我」Tab：称呼卡（月亮图标 + 渐变质感）+ 图标化操作按钮，触摸区达标、与岛屿宇宙融合。
    return (
      <div className="flex w-full max-w-[30rem] flex-col gap-3">
        {/* 称呼卡：月亮图标 + 居中昵称，呼应品牌区的视觉语言 */}
        <div className="relative overflow-hidden rounded-card px-5 py-5 text-center border border-white/15"
          style={{ background: "linear-gradient(180deg, rgba(159,180,240,0.14) 0%, rgba(12,16,34,0.42) 100%)" }}>
          <svg viewBox="0 0 48 48" className="mx-auto h-8 w-8 opacity-90" aria-hidden>
            <defs>
              <radialGradient id="ub-moon" cx="0.5" cy="0.5">
                <stop offset="0" stopColor="#fff" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="32" cy="14" r="5" fill="url(#ub-moon)" opacity="0.92" />
            <path d="M0 36 Q12 30 24 32 T48 36 L48 48 L0 48 Z" fill="#9fb4f0" opacity="0.75" />
            <path d="M14 36 Q20 22 26 24 T38 36 Z" fill="#0a0e1f" />
          </svg>
          <p className="mt-2 text-caption tracking-[0.24em] text-white/40">登 岛 者</p>
          <p className="mt-1.5 font-serif text-[20px] font-light text-white/92">{identity.nickname}</p>
        </div>
        {/* 切换称呼：人物图标 */}
        <button
          type="button"
          onClick={onClear}
          className="panel-glass-1 flex min-h-[52px] w-full items-center gap-3 rounded-card px-4 py-3 text-left transition active:scale-[0.98]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-[17px]" aria-hidden>👤</span>
          <span className="flex-1">
            <span className="block text-[14px] text-white/85">切换称呼</span>
            <span className="block text-[11px] text-white/40">换一个昵称，或清除本地身份</span>
          </span>
          <span className="text-white/30" aria-hidden>›</span>
        </button>
        {/* 删除痕迹：警示色调 + 回收图标 */}
        <button
          type="button"
          onClick={onDeleteData}
          className="flex min-h-[52px] w-full items-center gap-3 rounded-card px-4 py-3 text-left transition active:scale-[0.98]"
          style={{ background: "rgba(244,160,138,0.08)", border: "1px solid rgba(244,160,138,0.22)" }}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[17px]" style={{ background: "rgba(244,160,138,0.14)" }} aria-hidden>🗑</span>
          <span className="flex-1">
            <span className="block text-[14px] text-coral/90">删除这座岛屿的全部痕迹</span>
            <span className="block text-[11px] text-white/38">记忆、物件与私房话，不可恢复</span>
          </span>
          <span className="text-white/30" aria-hidden>›</span>
        </button>
      </div>
    );
  }
  return (
    <div className="max-w-[min(46vw,16rem)] rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 px-3 py-2 text-white/75 shadow-xl">
      <p className="truncate text-xs">你好，{identity.nickname}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-white/40 hover:text-white/75 transition"
        >
          切换用户 / 清除本地身份
        </button>
        <span aria-hidden className="text-[11px] text-white/20">·</span>
        <button
          type="button"
          onClick={onDeleteData}
          className="text-[11px] text-white/40 hover:text-rose-200/80 transition"
        >
          删除全部记忆
        </button>
      </div>
    </div>
  );
}
