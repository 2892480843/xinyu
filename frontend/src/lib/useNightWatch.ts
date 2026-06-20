import { useEffect, useState } from "react";

/**
 * 守夜模式：本地时间 0:00-4:00 之间或 URL ?nightwatch=1（手动触发开关，调试 / 预览用）时为真。
 * "反沉迷 / 知止"的伦理表态——岛屿主动提醒该休息了，而非用 streak/红点把人留下来。
 */
export function useNightWatch(): boolean {
  const [active, setActive] = useState<boolean>(() => isNightTime());
  useEffect(() => {
    const tick = () => setActive(isNightTime());
    tick();
    const iv = window.setInterval(tick, 60_000);
    return () => window.clearInterval(iv);
  }, []);
  return active;
}

function isNightTime(): boolean {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("nightwatch");
    if (flag === "1") return true;
    if (flag === "0") return false;
  }
  const h = new Date().getHours();
  return h >= 0 && h < 4;
}
