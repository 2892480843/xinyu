import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// 复用桌面的全部设计系统（玻璃面板 / 按钮 / 安全区变量 / 字体 / 深海背景）。
import "../index.css";
import App from "./App";
import { registerServiceWorker } from "../lib/registerSW";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 注册同一个 /sw.js（scope "/"，幂等）；离线 shell 的移动端回退在 P4 的 sw.js 里补。
registerServiceWorker();
