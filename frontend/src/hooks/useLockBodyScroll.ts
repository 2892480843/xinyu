import { useEffect } from "react";

export function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const scrollY = window.scrollY;
    const original = document.body.style.cssText;
    document.body.style.cssText = `position:fixed;top:-${scrollY}px;left:0;right:0;overflow:hidden;width:100%;`;
    return () => {
      document.body.style.cssText = original;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
