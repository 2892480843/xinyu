import type { LocalIdentity } from "../lib/localIdentity";

interface Props {
  identity: LocalIdentity;
  onClear: () => void;
  onDeleteData: () => void;
}

export default function UserBadge({ identity, onClear, onDeleteData }: Props) {
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
