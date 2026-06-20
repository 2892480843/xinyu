import { useEffect, useRef } from "react";

/**
 * 模态/全屏覆盖层的通用无障碍：
 * - Escape 关闭（键盘用户也能退出）
 * - 锁住背景滚动（移动端不再透出底层、橡皮筋）
 * - 关闭后把焦点还给触发它的元素
 *
 * active 为 true 时生效；onClose 经 ref 读取最新值，所以即便调用方传内联函数，
 * 也不会每次 render 反复重绑监听。
 */
export function useModalDismiss(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!active) return;
    const restoreFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey);

    const scrollY = window.scrollY;
    const original = document.body.style.cssText;
    document.body.style.cssText = `position:fixed;top:-${scrollY}px;left:0;right:0;overflow:hidden;width:100%;`;

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.cssText = original;
      window.scrollTo(0, scrollY);
      restoreFocus?.focus?.();
    };
  }, [active]);
}
