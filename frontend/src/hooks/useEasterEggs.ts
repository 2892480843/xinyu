import { useEffect, useRef, useState } from "react";

interface EasterCallbacks {
  onSilent?: () => void;
  onGlyph?: () => void;
  onToggleMindMap?: () => void;
  onShortcutsHelp?: () => void;
}

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

/**
 * 心屿快捷键 & Konami 彩蛋
 * - S → 静默坐岛
 * - G → 写一个字
 * - M → 翻开/收起心象地图
 * - ? → 显示快捷键浮层
 * - Konami code → 显示隐藏文案
 */
export function useEasterEggs(cb: EasterCallbacks) {
  const [konamiUnlocked, setKonamiUnlocked] = useState(false);
  const konamiBuf = useRef<string[]>([]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 输入框聚焦时不抢键盘
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const k = e.key;
      // Konami
      konamiBuf.current.push(k);
      if (konamiBuf.current.length > KONAMI.length) konamiBuf.current.shift();
      if (KONAMI.every((v, i) => konamiBuf.current[i] === v)) {
        setKonamiUnlocked(true);
        konamiBuf.current = [];
        return;
      }
      // 快捷键
      if (k === "?" || (e.shiftKey && k === "/")) {
        cb.onShortcutsHelp?.();
        return;
      }
      const lower = k.toLowerCase();
      if (lower === "s") { e.preventDefault(); cb.onSilent?.(); }
      else if (lower === "g") { e.preventDefault(); cb.onGlyph?.(); }
      else if (lower === "m") { e.preventDefault(); cb.onToggleMindMap?.(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cb]);

  return { konamiUnlocked, dismissKonami: () => setKonamiUnlocked(false) };
}
