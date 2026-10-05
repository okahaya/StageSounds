import { isTauri } from "@tauri-apps/api/core";

/**
 * Service Worker(オフライン起動用キャッシュ)の登録と更新管理。
 *
 * 以前は新バージョンを検出すると自動で切り替えていたが、本番当日に main ブランチへ
 * 誤って push された壊れたビルドが、次のリロード時にそのまま適用される危険があった。
 * 現在は新バージョンがあっても「更新あり」と表示するだけで、オペレーターが明示的に
 * 適用ボタンを押すまで(またはブラウザのタブをすべて閉じるまで)現行バージョンで動き続ける。
 */

export interface PwaStatus {
  /** オフライン起動の準備ができているか(null: Service Worker 非対応・Tauri 版など)。 */
  offlineReady: boolean | null;
  /** 新しいバージョンが待機中か。 */
  updateAvailable: boolean;
}

let status: PwaStatus = { offlineReady: null, updateAvailable: false };
const listeners = new Set<(s: PwaStatus) => void>();
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

function setStatus(patch: Partial<PwaStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}

export function getPwaStatus(): PwaStatus {
  return status;
}

export function onPwaStatusChange(listener: (s: PwaStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 待機中の新バージョンを適用してページを再読み込みする。再生していない時にだけ呼ぶこと。 */
export function applyPwaUpdate(): void {
  void applyUpdate?.(true);
}

export async function registerPwa(): Promise<void> {
  if (isTauri() || !("serviceWorker" in navigator) || import.meta.env.DEV) return;
  try {
    const { registerSW } = await import("virtual:pwa-register");
    applyUpdate = registerSW({
      immediate: true,
      onNeedRefresh() {
        setStatus({ updateAvailable: true });
      },
      onOfflineReady() {
        setStatus({ offlineReady: true });
      },
      onRegisteredSW(_url, registration) {
        // すでに有効な Service Worker が制御していれば、前回までにキャッシュ済み = オフライン起動可能。
        if (registration?.active && navigator.serviceWorker.controller) setStatus({ offlineReady: true });
      },
      onRegisterError(err) {
        console.warn("Service Worker の登録に失敗", err);
        setStatus({ offlineReady: false });
      },
    });
  } catch (err) {
    console.warn("Service Worker の登録に失敗", err);
    setStatus({ offlineReady: false });
  }
}
