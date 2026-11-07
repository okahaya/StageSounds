import { Component, type ErrorInfo, type ReactNode } from "react";
import { OctagonX } from "lucide-react";
import { audioManager } from "../audio/AudioManager";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 予期せぬ例外で白画面のまま固まるのを防ぐための最終防御ライン。
 * 音声エンジンは React の外にあるため、この画面でも Esc とボタンで確実に停止できる。
 * 「その場で復旧」はページ再読み込みをせずに画面だけを作り直す(再生中の音は止めない)。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("アプリケーションエラー:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen flex-col bg-stage-bg text-sm text-stage-muted">
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-base font-semibold text-stage-fg">Something went wrong</p>
            <p>Press Esc or the red button below to stop all audio.</p>
            <p className="max-w-xl break-all text-xs text-stage-muted/70">{this.state.error.message}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => this.setState({ error: null })}
                className="rounded bg-stage-fg px-4 py-2 font-medium text-stage-bg hover:bg-stage-fg/90"
              >
                Recover (keep audio)
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded border border-stage-border px-4 py-2 text-stage-fg hover:bg-stage-surface"
              >
                Reload
              </button>
            </div>
          </div>
          <button
            onClick={() => audioManager.panicStop()}
            className="flex h-12 w-full shrink-0 items-center justify-center gap-2.5 bg-stage-danger text-white hover:bg-stage-danger/90"
          >
            <OctagonX size={20} strokeWidth={2.25} />
            <span className="text-base font-semibold">Stop All</span>
            <kbd className="rounded-sm bg-black/20 px-1.5 py-0.5 font-mono text-xs">Esc</kbd>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
