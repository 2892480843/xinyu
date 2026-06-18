import { motion } from "framer-motion";
import { IconLighthouse } from "./IslandIcons";
import { SPRING_TAP } from "../lib/motion";

interface Props {
  message: string;
  onReset: () => void;
}

// 分人群、标注可拨通的官方资源。号码均为公开热线；现场演示前请再次核对可拨通性。
const HOTLINES = [
  { tel: "12356", label: "全国统一心理援助热线（24 小时）", number: "12356", icon: "lighthouse" as const },
  { tel: "12355", label: "全国青少年心理服务台", number: "12355", icon: "lighthouse" as const },
  { tel: "01082951332", label: "北京心理危机研究与干预中心", number: "010-82951332", icon: "lighthouse" as const },
  { tel: "120", label: "急救电话", number: "120", icon: "lighthouse" as const },
];

/**
 * 灯塔屏——触发高自伤风险时的安全边界。
 * 留在岛屿宇宙里（不破气质）但用极慎重的暖光语言告诉用户："岛屿替你点了灯"。
 * 灯塔 SVG + 一次「点亮」动效 + 三条热线包成 lighthouse 卡片。
 */
export default function SafetyNotice({ message, onReset }: Props) {
  return (
    <motion.div
      className="panel-glass-2 w-full max-w-xl mx-auto rounded-card-lg p-6"
      style={{ borderColor: "rgba(245,210,138,0.35)" }}
      initial={{ opacity: 0, y: 18, scale: 0.98, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* 灯塔点亮：drop-shadow 闪一下 + 持续柔光 */}
      <div className="flex items-center gap-3 mb-4">
        <motion.div
          className="relative grid place-items-center h-10 w-10 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(245,210,138,0.25) 0%, transparent 70%)",
            color: "#f5d28a",
          }}
          initial={{ filter: "drop-shadow(0 0 0 rgba(245,210,138,0))" }}
          animate={{
            filter: [
              "drop-shadow(0 0 0 rgba(245,210,138,0))",
              "drop-shadow(0 0 18px rgba(245,210,138,0.95))",
              "drop-shadow(0 0 8px rgba(245,210,138,0.55))",
            ],
          }}
          transition={{ duration: 1.6, ease: "easeOut", delay: 0.25 }}
        >
          <IconLighthouse size={22} />
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ boxShadow: "0 0 24px rgba(245,210,138,0.4)" }}
            animate={{ opacity: [0.35, 0.85, 0.35] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
        <h2 className="font-serif text-mist-100 text-title-sm">岛屿替你点了灯</h2>
      </div>

      <p className="font-serif text-mist-100 text-reading">{message}</p>
      <p className="font-serif italic text-mist-300 text-body mt-3">
        这片海不催你前进——先抓住灯塔的光，找一个真正能听到你的声音的人。
      </p>

      <div className="panel-glass-1 mt-5 rounded-card p-4" style={{ borderColor: "rgba(245,210,138,0.25)" }}>
        <p className="text-mist-200 text-body leading-relaxed">
          如果你正经历立即危险，请先拨打当地紧急电话；也请尽快联系身边可信任的人，或拨打心理援助热线。
        </p>
        <div className="mt-3 grid gap-2">
          {HOTLINES.map((h) => (
            <motion.a
              key={h.tel}
              href={`tel:${h.tel}`}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              transition={SPRING_TAP}
              className="flex items-center gap-3 rounded-tile px-2.5 py-2 text-mist-100 hover:bg-white/8 transition-colors group"
            >
              <span
                className="grid place-items-center h-7 w-7 rounded-full shrink-0"
                style={{
                  background: "rgba(245,210,138,0.12)",
                  border: "1px solid rgba(245,210,138,0.35)",
                  color: "#f5d28a",
                }}
              >
                <IconLighthouse size={14} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-body">{h.label}</span>
                <span className="block text-caption text-mist-400 tracking-wider tnum">{h.number}</span>
              </span>
              <span className="text-mist-500 group-hover:text-mist-200 text-meta transition-colors">拨打 ▸</span>
            </motion.a>
          ))}
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <motion.button
          onClick={onReset}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={SPRING_TAP}
          className="btn-ghost"
        >
          跟着灯塔回岸
        </motion.button>
      </div>
    </motion.div>
  );
}
