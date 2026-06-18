import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface Props {
  weather?: string;
  time?: string;
  accent: string;
  // 用户专属种子（保持粒子位置稳定）
  seed?: string;
}

// 简易确定性 PRNG —— 同一个 seed 下 useMemo 锁定粒子布局
function makePrng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h = (h ^= h >>> 16) >>> 0;
    return h / 4294967295;
  };
}

interface Particle {
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
}

/**
 * 装饰粒子层——萤火 / 海面浮光 / 雾粒。根据天气与时间调密度与色调。
 * 用 useMemo + seed 锁定布局，避免每次 re-render 粒子乱跳。
 * 完全无交互，z-index 介于背景与正文之间。
 */
export default function Particles({ weather = "clear", time = "night", accent, seed = "默认" }: Props) {
  const reduced = useReducedMotion();
  const count = useMemo(() => {
    if (reduced) return 0;
    if (weather === "storm") return 0;
    if (weather === "rain" || weather === "light_rain") return 4;
    if (weather === "fog") return 6;
    if (time === "night" || time === "dusk") return 12;
    return 8;
  }, [weather, time, reduced]);

  const particles = useMemo<Particle[]>(() => {
    const rand = makePrng(seed + weather + time);
    return Array.from({ length: count }, () => ({
      x: rand() * 100,
      y: 20 + rand() * 65,
      size: 1.2 + rand() * 2.2,
      delay: rand() * 6,
      duration: 6 + rand() * 8,
      drift: -10 + rand() * 20,
    }));
  }, [count, seed, weather, time]);

  if (!count) return null;

  const tint = weather === "fog" ? "rgba(255,255,255,0.6)" : accent;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[5] overflow-hidden">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: tint,
            boxShadow: `0 0 ${p.size * 4}px ${tint}`,
          }}
          animate={{
            y: [0, -12, 0, 8, 0],
            x: [0, p.drift, 0, -p.drift, 0],
            opacity: [0, 0.85, 0.65, 0.9, 0],
            scale: [0.7, 1.1, 0.95, 1.05, 0.7],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
