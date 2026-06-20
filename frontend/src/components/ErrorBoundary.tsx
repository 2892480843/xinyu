import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** 自定义降级 UI：传入节点或 (reset)=>节点。省略时显示默认整页「失联」提示。 */
  fallback?: ReactNode | ((reset: () => void) => ReactNode);
  /** 捕获到错误时回调（如关闭探索模式、上报日志）。在 fallback 渲染前触发。 */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** 该值变化时自动复位错误态——用于「情绪/场景切换后重试 3D」。 */
  resetKey?: unknown;
}

interface State {
  hasError: boolean;
}

/**
 * 渲染期异常兜底：任一子树抛错时显示降级 UI，
 * 避免后端字段缺失或 canvas/WebGL/SpeechSynthesis 异常导致整页白屏。
 * 顶层用默认全屏提示；3D 等局部子树可传 fallback 做「就地降级」，不牵连整页。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidUpdate(prev: Props): void {
    // 外部 resetKey 变化（如切换情绪/场景）→ 给崩溃的子树一次重新挂载的机会。
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info);
    this.props.onError?.(error, info);
  }

  private reset = (): void => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      if (fallback !== undefined) {
        return typeof fallback === "function" ? fallback(this.reset) : fallback;
      }
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
