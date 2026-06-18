import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * 渲染期异常兜底：任一子树抛错时显示温柔的失联提示，
 * 避免后端字段缺失或 canvas/SpeechSynthesis 异常导致整页白屏。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="relative min-h-screen w-full bg-slate-900 flex items-center justify-center px-6 text-white/85">
          <div className="max-w-md w-full rounded-3xl bg-white/8 backdrop-blur-md border border-white/15 p-7 text-center shadow-2xl">
            <p className="text-2xl tracking-[0.2em] mb-3">岛屿暂时失联了</p>
            <p className="text-white/55 text-sm leading-relaxed mb-5">
              海上起了雾，刷新页面可以重新连接到你的岛屿。本地的记忆不会丢失。
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-full bg-white/90 text-slate-800 text-sm font-medium hover:bg-white transition"
            >
              重新连接
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
