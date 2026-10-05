import { useEffect, useState } from "react";
import { audioManager } from "../audio/AudioManager";
import {
  isDuplicateInstance,
  isWakeLockActive,
  onDuplicateInstanceChange,
  onWakeLockChange,
  requestWakeLock,
} from "../safety/globalGuards";
import { applyPwaUpdate, getPwaStatus, onPwaStatusChange } from "../safety/pwaUpdate";
import { getStorageStatus } from "../storage/db";

export interface SlotHealth {
  assigned: number;
  ready: number;
  loading: number;
  failed: number;
}

interface SystemStatusBarProps {
  editMode: boolean;
  slotHealth: SlotHealth;
  decodedBytes: number;
  isPlaying: boolean;
  storageError: boolean;
}

type Level = "ok" | "warn" | "error" | "info";

const LEVEL_CLASS: Record<Level, string> = {
  ok: "border-stage-playing/40 text-stage-playing",
  warn: "border-stage-fading/60 text-stage-fading",
  error: "border-stage-danger bg-stage-danger/20 text-stage-danger",
  info: "border-stage-border text-stage-muted",
};

/** デコード済み音声のメモリ使用量がこれを超えたら警告する(タブのクラッシュ予防)。 */
const MEMORY_WARN_BYTES = 1.5 * 1024 ** 3;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
  return `${Math.round(bytes / 1024 ** 2)}MB`;
}

function Chip({ level, title, children, onClick }: { level: Level; title: string; children: React.ReactNode; onClick?: () => void }) {
  const cls = `shrink-0 rounded-sm border px-1.5 py-0.5 ${LEVEL_CLASS[level]} ${onClick ? "cursor-pointer hover:border-white" : ""}`;
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
 * 本番中に起こり得る異常(オーディオ停止・音源欠落・保存不可・スリープ・多重起動・フォーカス喪失など)を
 * 常時表示するステータスバー。正常時は緑、要注意は橙、異常は赤で示し、可能なものはクリックで復旧できる。
 */
export function SystemStatusBar({ editMode, slotHealth, decodedBytes, isPlaying, storageError }: SystemStatusBarProps) {
  const [audioState, setAudioState] = useState(audioManager.contextState);
  const [wakeLock, setWakeLock] = useState(isWakeLockActive());
  const [duplicate, setDuplicate] = useState(isDuplicateInstance());
  const [pwa, setPwa] = useState(getPwaStatus());
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [focused, setFocused] = useState(document.hasFocus());

  useEffect(() => {
    const unsubs = [
      audioManager.onContextStateChange(setAudioState),
      onWakeLockChange(setWakeLock),
      onDuplicateInstanceChange(setDuplicate),
      onPwaStatusChange(setPwa),
    ];
    const onOnline = () => setOnline(navigator.onLine);
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    // statechange イベントを出さないブラウザ・状況への保険として定期的にも確認する。
    const timer = setInterval(() => {
      setAudioState(audioManager.contextState);
      setFocused(document.hasFocus());
    }, 1000);
    void getStorageStatus().then((s) => setPersisted(s.persisted));
    return () => {
      unsubs.forEach((u) => u());
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      clearInterval(timer);
    };
  }, []);

  // 初回のキー/クリック操作前は自動再生ポリシーにより suspended なのが正常。
  const audioLevel: Level = audioState === "running" ? "ok" : audioState === "suspended" ? "warn" : "error";
  const audioLabel = audioState === "running" ? "AUDIO OK" : audioState === "suspended" ? "AUDIO 待機" : `AUDIO ${audioState}`;

  const { assigned, ready, loading, failed } = slotHealth;
  const slotLevel: Level = failed > 0 ? "error" : loading > 0 ? "warn" : "ok";

  return (
    <>
      {!focused && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center">
          <div className="mt-14 rounded-sm border-2 border-stage-danger bg-stage-bg/95 px-4 py-2 font-mono text-sm font-bold text-stage-danger shadow-lg">
            ⚠ このウィンドウが選択されていません — キー操作が効きません。画面をクリックしてください
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto border-t border-stage-border bg-stage-surface px-4 py-1 font-mono text-[11px] uppercase tracking-wide text-stage-muted">
        <span className="mr-auto shrink-0 truncate normal-case">
          {editMode ? "編集中：タイルをクリックして設定、ドラッグ&ドロップで音源割当" : "プレイ中：キー入力またはクリックで再生 / 停止"}
        </span>

        {duplicate && (
          <Chip level="error" title="同じアプリが別のタブ/ウィンドウでも開かれています。両方から音が出る恐れがあるため、片方を閉じてください。">
            ⚠ 多重起動
          </Chip>
        )}

        {storageError && (
          <Chip level="error" title="保存領域(IndexedDB)が使えません。シークレットモードや設定を確認してください。この状態での変更は保存されません。">
            保存不可
          </Chip>
        )}

        <Chip
          level={audioLevel}
          title="オーディオ出力の状態。赤/橙のままの場合はクリックでオーディオを再起動します(音源の再読込は不要)。"
          onClick={audioState === "running" ? undefined : () => void audioManager.restartContext()}
        >
          {audioLabel}
        </Chip>

        {assigned > 0 && (
          <Chip
            level={slotLevel}
            title={failed > 0 ? "読み込めない音源があります。赤く表示されたタイルを編集して音源を割り当て直してください。" : "割当済み音源の準備状況"}
          >
            音源 {ready}/{assigned}
            {loading > 0 && ` 読込中${loading}`}
            {failed > 0 && ` 失敗${failed}`}
          </Chip>
        )}

        <Chip
          level={decodedBytes > MEMORY_WARN_BYTES ? "warn" : "info"}
          title="デコード済み音声のメモリ使用量。大きすぎるとブラウザのタブが落ちることがあります。"
        >
          MEM {formatBytes(decodedBytes)}
        </Chip>

        <Chip
          level={wakeLock ? "ok" : "warn"}
          title={wakeLock ? "画面の自動消灯・スリープを防止中" : "スリープ防止が無効です。クリックで再試行。OSの電源設定でもスリープを切ってください。"}
          onClick={wakeLock ? undefined : () => void requestWakeLock()}
        >
          {wakeLock ? "スリープ防止" : "スリープ注意"}
        </Chip>

        {persisted === false && (
          <Chip level="warn" title="ブラウザがストレージを永続化していません。容量逼迫時に音源が消える可能性があるため、本番前に書き出し(.stagepack)でバックアップしてください。">
            保存:一時
          </Chip>
        )}

        {pwa.offlineReady !== null && (
          <Chip
            level={pwa.offlineReady ? "ok" : "warn"}
            title={pwa.offlineReady ? "ネットに繋がらなくても再読み込み・起動できます" : "オフライン起動の準備ができていません。ネット接続下で一度開き直してください。"}
          >
            {pwa.offlineReady ? "オフライン可" : "オフライン不可"}
          </Chip>
        )}

        {!online && <Chip level="info" title="ネット未接続(本アプリの動作には影響しません)">OFFLINE</Chip>}

        {pwa.updateAvailable && (
          <Chip
            level="info"
            title={isPlaying ? "再生中は更新できません" : "新しいバージョンがあります。本番中は更新しないでください。クリックで適用(再読み込み)します。"}
            onClick={isPlaying ? undefined : () => {
              if (window.confirm("新しいバージョンに更新して再読み込みします。本番中は更新しないでください。続けますか？")) applyPwaUpdate();
            }}
          >
            更新あり
          </Chip>
        )}
      </div>
    </>
  );
}
