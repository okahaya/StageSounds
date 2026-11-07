import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * window.confirm の代わりに使うアプリ内の確認ダイアログ。
 * window.confirm は見た目がブラウザ標準(Tauri では「tauri.localhost の内容」)になるうえ、
 * 表示中は JS が止まり緊急停止キーまで効かなくなるため使わない。
 * 使い方: `if (await confirmDialog({ title: "…", confirmLabel: "Delete", danger: true })) { … }`
 * 表示には <ConfirmDialogHost /> がどこかにマウントされている必要がある。
 */
export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 確定ボタンを赤くする(削除など取り消せない操作) */
  danger?: boolean;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let pending: Pending | null = null;
const listeners = new Set<() => void>();

function setPending(next: Pending | null) {
  pending = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // 既に開いているものはキャンセル扱いにして置き換える。
    pending?.resolve(false);
    setPending({ ...options, resolve });
  });
}

/** 確認ダイアログが開いているか(開いている間はスロットのキー操作を止めるため)。 */
export function useConfirmOpen(): boolean {
  return useSyncExternalStore(subscribe, () => pending !== null);
}

export function ConfirmDialogHost() {
  const current = useSyncExternalStore(subscribe, () => pending);
  const cancelRef = useRef<HTMLButtonElement>(null);

  function close(ok: boolean) {
    if (!current) return;
    setPending(null);
    current.resolve(ok);
  }

  useEffect(() => {
    if (!current) return;
    // 誤って Enter で確定しないよう、初期フォーカスはキャンセル側に置く。
    cancelRef.current?.focus();
    // Esc はキャンセル(緊急停止は globalGuards 側で別途必ず実行される)。
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!current) return null;

  return (
    <div data-modal-open className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => close(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-md border border-stage-border bg-stage-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-stage-fg">{current.title}</h2>
        {current.message && <p className="mt-2 text-sm leading-relaxed text-stage-muted">{current.message}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={() => close(false)}
            className="rounded border border-stage-border px-4 py-2 text-sm text-stage-fg outline-none hover:bg-stage-fg/5 focus-visible:ring-2 focus-visible:ring-stage-muted"
          >
            {current.cancelLabel ?? "Cancel"}
          </button>
          <button
            onClick={() => close(true)}
            className={`rounded px-4 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-stage-muted ${
              current.danger ? "bg-stage-danger text-white hover:bg-stage-danger/90" : "bg-stage-fg text-stage-bg hover:bg-stage-fg/90"
            }`}
          >
            {current.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
