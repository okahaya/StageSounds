import { useEffect } from "react";

/** F5 / Ctrl(Cmd)+R / Ctrl(Cmd)+Shift+R によるリロードキー操作か判定する。 */
function isReloadShortcut(e: KeyboardEvent): boolean {
  if (e.key === "F5") return true;
  const isRKey = e.key === "r" || e.key === "R";
  return (e.ctrlKey || e.metaKey) && isRKey;
}

/**
 * 本番中の誤操作事故を防ぐガード。
 * - F5 / Ctrl(Cmd)+R / Ctrl(Cmd)+Shift+R によるリロードを常時無効化する。
 * - `active` が true の間（音声が登録されている、または再生中）は、タブを閉じる・
 *   更新するなどの離脱操作時にブラウザ標準の離脱確認ダイアログを表示する。
 */
export function useReloadGuard(active: boolean): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isReloadShortcut(e)) {
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!active) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [active]);
}
