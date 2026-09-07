import { useEffect } from "react";

interface UseKeyboardOptions {
  onTrigger: (code: string) => void;
  onPanic: () => void;
  /** 編集モーダル表示中などキー入力を無視したい場合に true */
  suspended: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** グローバルキーボード入力を監視し、パッドのトリガーと緊急停止を配線するフック。 */
export function useKeyboard({ onTrigger, onPanic, suspended }: UseKeyboardOptions): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (suspended) return;
      if (isTypingTarget(e.target)) return;
      if (e.repeat) return;

      if (e.code === "Space" || e.code === "Escape") {
        e.preventDefault();
        onPanic();
        return;
      }

      onTrigger(e.code);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onTrigger, onPanic, suspended]);
}
