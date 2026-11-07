import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { audioManager } from "../audio/AudioManager";
import { isDuplicateInstance, onDuplicateInstanceChange } from "../safety/globalGuards";
import { applyPwaUpdate, getPwaStatus, onPwaStatusChange } from "../safety/pwaUpdate";

export interface SlotHealth {
  assigned: number;
  ready: number;
  loading: number;
  failed: number;
}

interface SystemStatusBarProps {
  slotHealth: SlotHealth;
  decodedBytes: number;
  isPlaying: boolean;
  storageError: boolean;
}

/** デコード済み音声のメモリ使用量がこれを超えたら警告する(タブのクラッシュ予防)。 */
const MEMORY_WARN_BYTES = 1.5 * 1024 ** 3;

function Alert({ level, title, children, onClick }: { level: "error" | "info"; title: string; children: React.ReactNode; onClick?: () => void }) {
  const cls = `flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-0.5 ${
    level === "error" ? "bg-stage-danger/15 text-stage-danger" : "bg-stage-fg/10 text-stage-fg"
  } ${onClick ? "cursor-pointer hover:bg-stage-fg/20" : ""}`;
  return onClick ? (
    <button type="button" tabIndex={-1} onClick={onClick} className={cls} title={title}>
      {children}
    </button>
  ) : (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

/**
 * 本番中に気付かないと致命的な異常だけを表示するバー。正常時は何も描画しない。
 * (オーディオ停止・音源欠落・保存不可・多重起動・メモリ逼迫・フォーカス喪失・更新あり)
 */
export function SystemStatusBar({ slotHealth, decodedBytes, isPlaying, storageError }: SystemStatusBarProps) {
  const [audioState, setAudioState] = useState(audioManager.contextState);
  const [duplicate, setDuplicate] = useState(isDuplicateInstance());
  const [pwa, setPwa] = useState(getPwaStatus());
  const [focused, setFocused] = useState(document.hasFocus());

  useEffect(() => {
    const unsubs = [
      audioManager.onContextStateChange(setAudioState),
      onDuplicateInstanceChange(setDuplicate),
      onPwaStatusChange(setPwa),
    ];
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    // statechange イベントを出さないブラウザ・状況への保険として定期的にも確認する。
    const timer = setInterval(() => {
      setAudioState(audioManager.contextState);
      setFocused(document.hasFocus());
    }, 1000);
    return () => {
      unsubs.forEach((u) => u());
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      clearInterval(timer);
    };
  }, []);

  // 初回のキー/クリック操作前は自動再生ポリシーにより suspended なのが正常なので警告しない。
  const audioBroken = audioState !== "running" && audioState !== "suspended";
  const { failed } = slotHealth;
  const memoryHigh = decodedBytes > MEMORY_WARN_BYTES;
  const hasAlerts = duplicate || storageError || audioBroken || failed > 0 || memoryHigh || pwa.updateAvailable;

  return (
    <>
      {!focused && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center">
          <div className="mt-16 flex items-center gap-2 rounded-md border border-stage-danger/60 bg-stage-bg/95 px-4 py-2 text-sm font-medium text-stage-danger shadow-lg">
            <AlertTriangle size={16} />
            Window not focused — click anywhere to enable keys
          </div>
        </div>
      )}

      {hasAlerts && (
        <div className="flex items-center gap-2 overflow-x-auto border-t border-stage-border bg-stage-surface px-4 py-1.5 text-xs">
          {duplicate && (
            <Alert level="error" title="同じアプリが別のタブ/ウィンドウでも開かれています。両方から音が出る恐れがあるため、片方を閉じてください。">
              <AlertTriangle size={12} /> Open in another tab
            </Alert>
          )}

          {storageError && (
            <Alert level="error" title="保存領域(IndexedDB)が使えません。この状態での変更は保存されません。">
              <AlertTriangle size={12} /> Storage unavailable
            </Alert>
          )}

          {audioBroken && (
            <Alert level="error" title="オーディオ出力が停止しています。クリックで再起動します(音源の再読込は不要)。" onClick={() => void audioManager.restartContext()}>
              <AlertTriangle size={12} /> Audio stopped — click to restart
            </Alert>
          )}

          {failed > 0 && (
            <Alert level="error" title="読み込めない音源があります。赤いタイルを編集して音源を割り当て直してください。">
              <AlertTriangle size={12} /> {failed} track{failed > 1 ? "s" : ""} failed to load
            </Alert>
          )}

          {memoryHigh && (
            <Alert level="info" title="デコード済み音声のメモリ使用量が大きく、ブラウザのタブが落ちる恐れがあります。">
              High memory usage ({(decodedBytes / 1024 ** 3).toFixed(1)} GB)
            </Alert>
          )}

          {pwa.updateAvailable && (
            <Alert
              level="info"
              title={isPlaying ? "再生中は更新できません" : "新しいバージョンがあります。本番中は更新しないでください。"}
              onClick={
                isPlaying
                  ? undefined
                  : () => {
                      if (window.confirm("新しいバージョンに更新して再読み込みします。本番中は更新しないでください。続けますか？")) applyPwaUpdate();
                    }
              }
            >
              Update available
            </Alert>
          )}
        </div>
      )}
    </>
  );
}
