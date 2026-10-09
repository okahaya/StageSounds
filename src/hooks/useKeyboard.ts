import { useEffect } from "react";
import { isTextEntryTarget } from "../safety/globalGuards";
import { ALL_KEYS } from "../utils/keys";

interface UseKeyboardOptions {
  onTrigger: (code: string) => void;
  /** 編集モーダル表示中などキー入力を無視したい場合に true */
  suspended: boolean;
}

const SLOT_CODES = new Set(ALL_KEYS.map((k) => k.code));

/**
 * グローバルキーボード入力を監視し、パッドのトリガーを配線するフック。
 * 一時停止(Space)・緊急停止(Esc)は safety/globalGuards.ts が React の外で常時処理する。
 */
export function useKeyboard({ onTrigger, suspended }: UseKeyboardOptions): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!SLOT_CODES.has(e.code)) return;
      if (isTextEntryTarget(e.target)) return;
      // セレクトボックスやボタンにフォーカスが残っていても、キーで団体が切り替わったり
      // ボタンが押されたりしないよう、スロットキーの既定動作は常に打ち消す。
      e.preventDefault();
      if (suspended || e.repeat) return;
      // Ctrl+1 (タブ切替) などブラウザ操作との同時発火を避ける。
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      onTrigger(e.code);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onTrigger, suspended]);
}
