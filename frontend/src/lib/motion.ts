import { useReducedMotion } from "framer-motion";

export const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;
export const EASE_OUT_QUINT = [0.16, 1, 0.3, 1] as const;
export const EASE_OUT_BACK = [0.34, 1.56, 0.64, 1] as const;
export const EASE_IN_OUT_QUART = [0.76, 0, 0.24, 1] as const;

export const SPRING_TAP = { type: "spring" as const, stiffness: 400, damping: 28 };
export const SPRING_FLOAT = { type: "spring" as const, stiffness: 180, damping: 22 };
export const SPRING_HEAVY = { type: "spring" as const, stiffness: 140, damping: 11, mass: 1.2 };

export function useScopedMotion() {
  const reduce = useReducedMotion();
  return {
    reduce,
    fade: reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.01 } }
      : {
          initial: { opacity: 0, y: 8, filter: "blur(6px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.55, ease: EASE_OUT_EXPO },
        },
    slide: reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, ease: EASE_OUT_EXPO },
        },
  };
}
