/*
 * 注册 Service Worker，提供 PWA 离线能力。
 * - 仅在生产构建中注册（dev 下注册会干扰 Vite HMR）。
 * - 新版本就绪后自动接管并刷新一次（SW 内已 skipWaiting + clients.claim）。
 * - 附带一个极简离线提示条，断网时告知用户正在使用缓存内容。
 */

function mountOfflineBanner() {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.id = "xy-offline-banner";
  el.textContent = "离线模式 · 正在使用已缓存的岛屿";
  el.setAttribute("role", "status");
  el.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:calc(16px + env(safe-area-inset-bottom))",
    "transform:translateX(-50%) translateY(140%)",
    "z-index:2147483647",
    "max-width:90vw",
    "padding:9px 18px",
    "border-radius:999px",
    "font:13px/1.4 'Noto Serif SC',serif",
    "color:#e9ecf7",
    "background:rgba(20,29,64,.92)",
    "border:1px solid rgba(255,255,255,.16)",
    "box-shadow:0 8px 28px rgba(0,0,0,.45)",
    "backdrop-filter:blur(8px)",
    "pointer-events:none",
    "transition:transform .35s cubic-bezier(.22,1,.36,1),opacity .35s",
    "opacity:0",
  ].join(";");
  document.body.appendChild(el);

  const show = () => {
    el.style.transform = "translateX(-50%) translateY(0)";
    el.style.opacity = "1";
  };
  const hide = () => {
    el.style.transform = "translateX(-50%) translateY(140%)";
    el.style.opacity = "0";
  };

  window.addEventListener("offline", show);
  window.addEventListener("online", hide);
  if (!navigator.onLine) show();
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  mountOfflineBanner();

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.warn("[心屿] Service Worker 注册失败：", err);
    });

    // 新版本激活后自动刷新一次，避免新旧资源混用
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}
