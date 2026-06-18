import { useEffect } from "react";
import { useSpring, type MotionValue } from "framer-motion";

// 指针/重力 → 高阻尼弹簧倾角（视差呼吸）。倾角有硬上限、跟随有余韵不灵敏，防眩晕。
// enabled=false（reduced-motion / 静海 / flat / 阅读叙事中）时平滑归零。

export interface Parallax {
  rotateX: MotionValue<number>;
  rotateY: MotionValue<number>;
}

const SPRING = { stiffness: 38, damping: 18, mass: 0.9 };

export function useParallax(maxTilt = 4, enabled = true): Parallax {
  const rotateX = useSpring(0, SPRING);
  const rotateY = useSpring(0, SPRING);

  useEffect(() => {
    if (!enabled) {
      // 静海/reduced-motion/阅读屏：瞬间归零（jump 不经弹簧，确保无障碍红线确实落地）
      rotateX.jump(0);
      rotateY.jump(0);
      return;
    }
    if (typeof window === "undefined") return;
    const onMove = (e: PointerEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const nx = (e.clientX / w) * 2 - 1; // -1..1
      const ny = (e.clientY / h) * 2 - 1; // -1..1
      rotateY.set(nx * maxTilt); // 指针水平 → 绕 Y 轴
      rotateX.set(-ny * maxTilt); // 指针垂直 → 绕 X 轴（反向，符合俯仰直觉）
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [enabled, maxTilt, rotateX, rotateY]);

  return { rotateX, rotateY };
}
