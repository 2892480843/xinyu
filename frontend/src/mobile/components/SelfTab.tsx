import { motion } from "framer-motion";
import UserBadge from "../../components/UserBadge";
import type { LocalIdentity } from "../../lib/localIdentity";

interface Props {
  identity: LocalIdentity;
  onClear: () => void;
  onDeleteData: () => void;
  extra?: React.ReactNode; // P3：3D 旗舰皮等开关挂这里
}

// 「我」Tab：本地匿名身份 + 隐私（删除全部痕迹）。移动端用 cards 变体，触摸区达标。
// 布局：标题贴顶，身份卡组在剩余空间垂直居中，危机声明锚底——避免内容堆顶、下半屏空荡。
export default function SelfTab({ identity, onClear, onDeleteData, extra }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center pt-2">
      <motion.p
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative text-center text-caption tracking-[0.2em] text-white/40"
      >
        <span aria-hidden className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto h-px w-16" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)" }} />
        <span className="relative">我</span>
      </motion.p>

      {/* 身份卡 + 开关 + 设备说明：在标题与危机声明之间垂直居中 */}
      <div className="my-auto flex w-full flex-col items-center gap-5 py-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="w-full"
        >
          <UserBadge identity={identity} onClear={onClear} onDeleteData={onDeleteData} variant="cards" />
        </motion.div>
        {extra && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[30rem]"
          >
            {extra}
          </motion.div>
        )}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="max-w-[20rem] px-6 text-center text-[12px] leading-relaxed text-white/40"
        >
          心屿不需要账号密码，昵称只存在这台设备上。
        </motion.p>
      </div>

      {/* 危机热线声明：与桌面 footer 同源，移动端落在「我」Tab 底部 */}
      <div className="w-full max-w-[30rem] px-6 pb-2 pt-4">
        <p className="text-center text-[10px] leading-relaxed tracking-wider text-white/28">
          《心屿》提供情感陪伴，并非心理咨询或医疗服务 · 如处于危机请联系专业热线
        </p>
      </div>
    </div>
  );
}
