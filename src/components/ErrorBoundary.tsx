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
        <div className="flex h-screen flex-col bg-stage-bg font-mono text-sm text-stage-muted">
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-base font-bold text-white">エラーが発生しました</p>
            <p>音を止めるには下の赤いボタン、または Esc を押してください。</p>
            <p className="max-w-xl break-all text-xs text-stage-muted/70">{this.state.error.message}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => this.setState({ error: null })}
                className="rounded border border-white bg-white px-4 py-2 font-bold text-black hover:bg-stage-muted"
              >
                その場で復旧（音は止めない）
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded border border-stage-border px-4 py-2 text-white hover:bg-stage-surface"
              >
                再読み込み
              </button>
            </div>
          </div>
          <button
            onClick={() => audioManager.panicStop()}
            className="flex h-14 w-full shrink-0 items-center justify-center gap-3 bg-stage-danger text-white hover:bg-red-500"
          >
            <OctagonX size={22} strokeWidth={2.5} />
            <span className="text-base font-black uppercase tracking-[0.3em]">Esc — All Stop</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
