import { useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

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
 * - デスクトップ版(Tauri)では beforeunload が効かないため、ウィンドウを閉じる操作(× ボタン・Alt+F4)にも
 *   同条件で確認ダイアログを出す。
 */
export function useReloadGuard(active: boolean): void {
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    getCurrentWindow()
      .onCloseRequested((event) => {
        if (activeRef.current && !window.confirm("StageSounds を終了します。再生中の音は止まります。よろしいですか？")) {
          event.preventDefault();
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((err) => console.warn("終了確認を設定できませんでした", err));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

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
