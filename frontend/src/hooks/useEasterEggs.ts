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
 *
 * @param enabled 为 false 时（如自由探索模式打开）让出全局键盘，
 *   避免与探索内的 G(种花)/S/M 等按键冲突。
 */
export function useEasterEggs(cb: EasterCallbacks, enabled = true) {
  const [konamiUnlocked, setKonamiUnlocked] = useState(false);
  const konamiBuf = useRef<string[]>([]);
  // cb/enabled 存 ref：监听器只在挂载时绑定一次，不随父组件每次 render 重新绑定（避免漏键/抖动）。
  const cbRef = useRef(cb);
  const enabledRef = useRef(enabled);
  // 在 commit 后同步最新的 cb/enabled 到 ref（不在 render 期间写 ref，遵守 react-hooks/refs）。
  useEffect(() => {
    cbRef.current = cb;
    enabledRef.current = enabled;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!enabledRef.current) return; // 探索模式等场景：交还键盘
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
      const cb = cbRef.current;
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
  }, []); // 只绑一次——cb/enabled 通过 ref 读取最新值

  return { konamiUnlocked, dismissKonami: () => setKonamiUnlocked(false) };
}
