import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * ブラウザ版(GitHub Pages)でTauri専用APIに起因する予期せぬ例外が発生した場合に、
 * 白画面のまま固まるのを防ぐための最終防御ライン。
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
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-stage-bg px-6 text-center font-mono text-sm text-stage-muted">
          <p className="text-base font-bold text-white">エラーが発生しました</p>
          <p>アプリの表示中に問題が発生しました。ページを再読み込みしてください。</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded border border-stage-border px-4 py-2 text-white hover:bg-stage-surface"
          >
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
