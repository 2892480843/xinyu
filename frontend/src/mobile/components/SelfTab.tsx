import UserBadge from "../../components/UserBadge";
import type { LocalIdentity } from "../../lib/localIdentity";

interface Props {
  identity: LocalIdentity;
  onClear: () => void;
  onDeleteData: () => void;
  extra?: React.ReactNode; // P3：3D 旗舰皮等开关挂这里
}

// 「我」Tab：本地匿名身份 + 隐私（删除全部痕迹）。复用桌面 UserBadge。
export default function SelfTab({ identity, onClear, onDeleteData, extra }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center gap-5 pt-4">
      <p className="text-center text-caption tracking-[0.2em] text-white/40">我</p>
      <UserBadge identity={identity} onClear={onClear} onDeleteData={onDeleteData} />
      {extra}
      <p className="px-8 text-center text-[12px] leading-relaxed text-white/45">
        心屿不需要账号密码，昵称只存在这台设备上。<br />随时可以删除这座岛屿在后端的全部痕迹。
      </p>
    </div>
  );
}
