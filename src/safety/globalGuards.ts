import { audioManager } from "../audio/AudioManager";

/**
 * React の外側で常時動作する安全装置群。
 * React が例外で落ちた・モーダルが開いている・入力欄にフォーカスがある、といった
 * どんな状態でも「音を止める」手段だけは確実に生かしておくことが目的。
 * main.tsx でアプリ描画より前に一度だけ installGlobalGuards() を呼ぶ。
 */

/** 文字入力を受け付ける要素か(ここでは Space を文字として通す必要がある)。 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === "TEXTAREA") return true;
  if (target.tagName !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return ["text", "search", "email", "url", "tel", "password", "number"].includes(type);
}

/**
 * 本番中に押されるとフォーカスを奪う・画面遷移する・ダイアログが出る等、
 * キー操作が効かなくなる原因になるブラウザ標準ショートカット。
 * (Ctrl+W / Ctrl+T / Ctrl+数字 / Alt+F4 / Cmd+Q などブラウザ・OS 側が優先するものは
 *  Web ページからは防げない。離脱確認ダイアログと運用で対処する)
 */
const BLOCKED_CTRL_KEYS = new Set(["KeyD", "KeyE", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "KeyO", "KeyP", "KeyR", "KeyS", "KeyU"]);
const BLOCKED_PLAIN_KEYS = new Set(["F1", "F3", "F5", "F6", "F7", "Tab", "Enter", "NumpadEnter", "ContextMenu", "BrowserBack", "BrowserForward", "BrowserRefresh"]);

function shouldBlockBrowserShortcut(e: KeyboardEvent): boolean {
  if (e.key === "F5" || e.code === "F5") return true;
  if ((e.ctrlKey || e.metaKey) && BLOCKED_CTRL_KEYS.has(e.code)) return true;
  if (e.altKey && (e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "Home")) return true;
  if (!e.ctrlKey && !e.metaKey && !e.altKey && BLOCKED_PLAIN_KEYS.has(e.code)) {
    // モーダル内のフォーム操作(Tab での項目移動・Enter での確定)は妨げない。
    if ((e.code === "Tab" || e.code === "Enter" || e.code === "NumpadEnter") && document.querySelector("[data-modal-open]")) {
      return false;
    }
    return true;
  }
  return false;
}

function handleKeyDownCapture(e: KeyboardEvent) {
  // Esc はどんな状態でも必ず緊急停止。
  if (e.code === "Escape") {
    audioManager.panicStop();
    return;
  }
  // Space は文字入力中以外なら一時停止/再開(ボタンやチェックボックスの誤作動も同時に防ぐ)。
  if (e.code === "Space" && !isTextEntryTarget(e.target)) {
    e.preventDefault();
    if (!e.repeat) {
      void audioManager.resume();
      audioManager.togglePause();
    }
    return;
  }
  if (isTextEntryTarget(e.target)) return;
  if (shouldBlockBrowserShortcut(e)) {
    e.preventDefault();
  }
}

// ---------------------------------------------------------------------------
// 未捕捉エラーの通知
// ---------------------------------------------------------------------------

type ErrorListener = (message: string) => void;
const errorListeners = new Set<ErrorListener>();

/** 未捕捉の例外・Promise 拒否を購読する(トースト表示用)。 */
export function onUncaughtError(listener: ErrorListener): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

function reportUncaught(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error("未捕捉エラー:", reason);
  for (const l of errorListeners) l(message);
}

// ---------------------------------------------------------------------------
// スリープ防止 (Screen Wake Lock)
// ---------------------------------------------------------------------------

type WakeLockSentinelLike = { released: boolean; release(): Promise<void>; addEventListener(t: "release", l: () => void): void };
let wakeLock: WakeLockSentinelLike | null = null;
const wakeLockListeners = new Set<(active: boolean) => void>();

export function isWakeLockActive(): boolean {
  return !!wakeLock && !wakeLock.released;
}

export function onWakeLockChange(listener: (active: boolean) => void): () => void {
  wakeLockListeners.add(listener);
  return () => wakeLockListeners.delete(listener);
}

function notifyWakeLock() {
  for (const l of wakeLockListeners) l(isWakeLockActive());
}

/** 画面の自動消灯・スリープを防ぐ。タブが非表示になると自動解除されるため、表示復帰時に再取得する。 */
export async function requestWakeLock(): Promise<void> {
  const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } };
  if (!nav.wakeLock || document.visibilityState !== "visible" || isWakeLockActive()) return;
  try {
    wakeLock = await nav.wakeLock.request("screen");
    wakeLock.addEventListener("release", notifyWakeLock);
  } catch (err) {
    console.warn("スリープ防止を有効にできませんでした", err);
  }
  notifyWakeLock();
}

// ---------------------------------------------------------------------------
// 多重起動の検知 (同じブラウザで別タブ/別ウィンドウに開かれていると、両方から音が出得る)
// ---------------------------------------------------------------------------

let duplicateInstance = false;
const duplicateListeners = new Set<(dup: boolean) => void>();

export function isDuplicateInstance(): boolean {
  return duplicateInstance;
}

export function onDuplicateInstanceChange(listener: (dup: boolean) => void): () => void {
  duplicateListeners.add(listener);
  return () => duplicateListeners.delete(listener);
}

function acquireInstanceLock() {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) return;
  const tryAcquire = () =>
    locks
      .request("stagesounds-instance", { ifAvailable: true }, async (lock) => {
        const dup = lock === null;
        if (dup !== duplicateInstance) {
          duplicateInstance = dup;
          for (const l of duplicateListeners) l(dup);
        }
        if (lock) {
          // ページが生きている間はロックを保持し続ける。
          await new Promise<never>(() => {});
        }
      })
      .catch((err) => console.warn("多重起動チェックに失敗", err));
  void tryAcquire();
  // 先に開いていたタブが閉じられたら、こちらがロックを引き継ぐ(警告解除)。
  setInterval(() => {
    if (duplicateInstance) void tryAcquire();
  }, 3000);
}

// ---------------------------------------------------------------------------

let installed = false;

export function installGlobalGuards(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("keydown", handleKeyDownCapture, { capture: true });

  // 右クリックメニューは「再読み込み」「戻る」等を含み、表示中はキー入力を奪う。
  window.addEventListener("contextmenu", (e) => {
    if (!isTextEntryTarget(e.target)) e.preventDefault();
  });

  // マウスの「戻る/進む」ボタンによるページ離脱を防ぐ。
  window.addEventListener("mouseup", (e) => {
    if (e.button === 3 || e.button === 4) e.preventDefault();
  });

  window.addEventListener("error", (e) => reportUncaught(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => reportUncaught(e.reason));

  // 最初のユーザー操作でスリープ防止を取得(ユーザー操作が必要なブラウザがあるため)。
  const onFirstGesture = () => void requestWakeLock();
  window.addEventListener("pointerdown", onFirstGesture);
  window.addEventListener("keydown", onFirstGesture);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void requestWakeLock();
  });
  void requestWakeLock();

  acquireInstanceLock();

  // ブラウザにストレージの永続化を要求(容量逼迫時やSafariの7日ルールで音源が消されるのを防ぐ)。
  void navigator.storage?.persist?.().catch(() => false);
}
