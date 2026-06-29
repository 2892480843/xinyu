import { motion } from "framer-motion";

// 移动端品牌区：与桌面 Home.tsx:559-606 的月亮 SVG + 渐变标题 + 横扫光带同源，
// 仅尺寸略缩（h-6/h-5 替代 h-7，间距收紧），保证移动端紧凑的同时视觉语言一致。
export default function MobileBrand({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <motion.div
      className="mt-1 inline-flex flex-col items-center gap-1.5 select-none"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* 发光月亮岛屿图标：与桌面同款 SVG，缓慢呼吸光晕 */}
      <motion.svg
        viewBox="0 0 48 48"
        className="h-6 w-6"
        aria-hidden
        animate={{
          filter: [
            "drop-shadow(0 0 0px rgba(245,210,138,0))",
            "drop-shadow(0 0 10px rgba(245,210,138,0.55))",
            "drop-shadow(0 0 0px rgba(245,210,138,0))",
          ],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <radialGradient id="mbrand-moon" cx="0.5" cy="0.5">
            <stop offset="0" stopColor="#fff" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="14" r="5" fill="url(#mbrand-moon)" opacity="0.92" />
        <path d="M0 36 Q12 30 24 32 T48 36 L48 48 L0 48 Z" fill="#9fb4f0" opacity="0.85" />
        <path d="M14 36 Q20 22 26 24 T38 36 Z" fill="#0a0e1f" />
        <path d="M0 42 Q14 40 26 41 T48 42" stroke="#fff" strokeOpacity="0.2" strokeWidth="0.5" fill="none" />
      </motion.svg>

      <div className="relative">
        {/* 横扫光带：标题中段的细线高光 */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto h-px w-20"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }}
        />
        <h1 className="relative inline-block bg-gradient-to-b from-white via-white to-white/65 bg-clip-text px-4 pl-[0.42em] font-display text-[clamp(19px,5.8vw,22px)] font-light tracking-[0.42em] text-transparent">
          心 屿
        </h1>
      </div>

      {subtitle && (
        <p className="font-serif italic text-[12px] tracking-[0.22em] text-mist-400">
          — 一座会回应你的岛屿 —
        </p>
      )}
    </motion.div>
  );
}
