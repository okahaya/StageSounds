import { useCallback, useEffect, useRef, useState } from "react";
import { OctagonX } from "lucide-react";
import { audioManager } from "./audio/AudioManager";
import { Header } from "./components/Header";
import { SlotGrid } from "./components/SlotGrid";
import { SlotEditorModal } from "./components/SlotEditorModal";
import { SystemStatusBar, type SlotHealth } from "./components/SystemStatusBar";
import { Toast, type ToastState } from "./components/Toast";
import { WaveformDisplay } from "./components/WaveformDisplay";
import { useKeyboard } from "./hooks/useKeyboard";
import { useReloadGuard } from "./hooks/useReloadGuard";
import { computePeaksAsync } from "./audio/waveformPeaks";
import { onUncaughtError } from "./safety/globalGuards";
import { registerPwa } from "./safety/pwaUpdate";
import {
  deleteAudioFile,
  getLastActiveGroupId,
  loadAllGroups,
  loadAudioFile,
  loadWaveformPeaks,
  saveAudioFile,
  saveGroup,
  saveWaveformPeaks,
  deleteGroup as deleteGroupFromDb,
  setLastActiveGroupId,
} from "./storage/db";
import { presetStorageService } from "./storage/PresetStorageService";
import { createDefaultSlots, keyDisplayFor } from "./utils/keys";
import type { GroupProfile, SlotConfig, SlotRuntimeState } from "./types";

function stripExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

/** crypto.randomUUID は安全なコンテキスト(https / localhost)でしか使えないため、念のためのフォールバック付き。 */
function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 同じ団体の別スロットが同名ファイルを使っている場合に、保存名を "曲 (2).mp3" のように一意化する。
 * 音源はファイル名をキーに保存しているため、別フォルダの同名ファイルを割り当てると
 * 先に割り当てたスロットまで後のファイルの音に置き換わってしまう事故を防ぐ。
 */
function uniqueFileName(group: GroupProfile, slotKey: string, fileName: string): string {
  const used = new Set(group.slots.filter((s) => s.key !== slotKey && s.fileName).map((s) => s.fileName!));
  if (!used.has(fileName)) return fileName;
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!used.has(candidate)) return candidate;
  }
}

function bufferBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

/** 1曲あたりこれ以上長い音源は、メモリ不足でタブが落ちる原因になり得るため警告する。 */
const LONG_AUDIO_WARN_SECONDS = 20 * 60;

/**
 * デコード済み音声・波形のキャッシュ。React の再マウント(エラー画面からの復旧など)でも
 * 再デコードせずに済むよう、コンポーネントの外に置く。
 */
const bufferCache = new Map<string, Map<string, AudioBuffer>>();
const peaksCache = new Map<string, Map<string, Float32Array>>();

function createEmptyGroup(name: string): GroupProfile {
  return {
    id: newId(),
    groupName: name,
    updatedAt: new Date().toISOString(),
    slots: createDefaultSlots(),
  };
}

const IMPORT_EXTENSIONS = [".zip", ".stagepack"];

export default function App() {
  // useRef(new AudioManager()) は描画のたびに AudioContext を生成してリークするため、共有インスタンスを使う。
  const audioManagerRef = useRef(audioManager);
  const buffersRef = useRef(bufferCache);
  const peaksRef = useRef(peaksCache);
  const peaksInFlightRef = useRef<Map<string, Promise<Float32Array>>>(new Map());

  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupProfile[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [runtimeByKey, setRuntimeByKey] = useState<Map<string, SlotRuntimeState>>(new Map());
  const [windowDragActive, setWindowDragActive] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [decodedBytes, setDecodedBytes] = useState(0);
  const prevGroupIdRef = useRef<string | null>(null);
  const [waveformSlot, setWaveformSlot] = useState<{
    key: string;
    peaks: Float32Array | null;
    duration: number;
    label: string;
  } | null>(null);

  /**
   * ファイル名に対応するピーク配列を取得する。メモリ→IndexedDBの順に探し、無ければ新規計算して両方に保存する。
   * 同一ファイルに対する同時呼び出しは1回の計算にまとめる(重複した重い走査を避けるため)。
   */
  async function getOrComputePeaks(groupId: string, fileName: string, buffer: AudioBuffer): Promise<Float32Array> {
    let groupPeaks = peaksRef.current.get(groupId);
    if (!groupPeaks) {
      groupPeaks = new Map();
      peaksRef.current.set(groupId, groupPeaks);
    }
    const cached = groupPeaks.get(fileName);
    if (cached) return cached;

    const inFlightKey = `${groupId}/${fileName}`;
    const inFlight = peaksInFlightRef.current.get(inFlightKey);
    if (inFlight) return inFlight;

    const promise = (async () => {
      const stored = await loadWaveformPeaks(groupId, fileName);
      if (stored) {
        groupPeaks.set(fileName, stored);
        return stored;
      }
      const computed = await computePeaksAsync(buffer);
      groupPeaks.set(fileName, computed);
      void saveWaveformPeaks(groupId, fileName, computed);
      return computed;
    })();

    peaksInFlightRef.current.set(inFlightKey, promise);
    try {
      return await promise;
    } finally {
      peaksInFlightRef.current.delete(inFlightKey);
    }
  }

  const currentGroup = groups.find((g) => g.id === currentGroupId) ?? null;

  const showError = useCallback((message: string) => setToast({ type: "error", message }), []);

  // 初回ロード: IndexedDB から団体一覧を復元。なければ既定の団体を1つ作成する。
  // IndexedDB が使えない環境(シークレットモード・ストレージ無効化など)でも「読み込み中…」で
  // 固まらないよう、失敗時はメモリ上の空団体で起動し、保存不可であることを表示する。
  useEffect(() => {
    void registerPwa();
    (async () => {
      try {
        const stored = await loadAllGroups();
        if (stored.length === 0) {
          const group = createEmptyGroup("新しい団体");
          await saveGroup(group);
          setGroups([group]);
          setCurrentGroupId(group.id);
        } else {
          setGroups(stored);
          const lastId = await getLastActiveGroupId().catch(() => undefined);
          setCurrentGroupId(stored.find((g) => g.id === lastId)?.id ?? stored[0].id);
        }
      } catch (err) {
        console.error("保存データの読み込みに失敗しました", err);
        setStorageError(true);
        const group = createEmptyGroup("新しい団体");
        setGroups([group]);
        setCurrentGroupId(group.id);
        showError("保存データを読み込めませんでした。.stagepack を読み込み直してください。");
      } finally {
        setLoading(false);
      }
    })();
  }, [showError]);

  useEffect(() => {
    if (currentGroupId) setLastActiveGroupId(currentGroupId).catch(() => {});
  }, [currentGroupId]);

  // 未捕捉の例外を握りつぶさず画面に出す(ただしアプリは止めない)。
  useEffect(() => onUncaughtError((message) => showError(`エラー: ${message}`)), [showError]);

  // オーディオ出力デバイスの抜き差し(HDMI・USBオーディオ・イヤホン等)を検知して注意喚起する。
  useEffect(() => {
    const devices = navigator.mediaDevices;
    if (!devices?.addEventListener) return;
    const onChange = () => {
      setToast({ type: "error", message: "音声出力デバイスが変化しました。テスト再生で出力先を確認してください" });
      void audioManagerRef.current.resume();
    };
    devices.addEventListener("devicechange", onChange);
    return () => devices.removeEventListener("devicechange", onChange);
  }, []);

  function recomputeDecodedBytes() {
    let total = 0;
    for (const group of buffersRef.current.values()) {
      for (const buffer of group.values()) total += bufferBytes(buffer);
    }
    setDecodedBytes(total);
  }

  // 団体切り替え時: その団体の音声を IndexedDB から読み出し AudioBuffer へデコードする。
  // (依存は id のみ。同一団体内でのスロット編集ではここを再実行しない)
  useEffect(() => {
    const group = groups.find((g) => g.id === currentGroupId) ?? null;
    // 団体を切り替えた時だけ停止する。初回表示やエラー画面からの復旧(再マウント)では、
    // 再生中の音を止めない。
    const switched = prevGroupIdRef.current !== null && prevGroupIdRef.current !== currentGroupId;
    prevGroupIdRef.current = currentGroupId;
    if (switched) {
      audioManagerRef.current.panicStop();
      setWaveformSlot(null);
    }

    // メモリ節約: 表示中以外の団体のデコード済み音声を解放する(長尺音源×多団体でタブが落ちるのを防ぐ)。
    for (const id of Array.from(buffersRef.current.keys())) {
      if (id !== currentGroupId) buffersRef.current.delete(id);
    }
    recomputeDecodedBytes();

    if (!group) {
      setRuntimeByKey(new Map());
      return;
    }

    let cancelled = false;
    let groupBuffers = buffersRef.current.get(group.id);
    if (!groupBuffers) {
      groupBuffers = new Map();
      buffersRef.current.set(group.id, groupBuffers);
    }
    const buffers = groupBuffers;

    // エラー画面からの復旧(再マウント)時も、一時停止中・フェードアウト中を含む実際の再生状態を表示に反映する。
    const initialRuntime = new Map<string, SlotRuntimeState>();
    for (const slot of group.slots) {
      initialRuntime.set(slot.key, {
        state: audioManagerRef.current.getSlotState(slot.key),
        hasAudio: !!slot.fileName && buffers.has(slot.fileName),
        isDecoding: !!slot.fileName && !buffers.has(slot.fileName),
      });
    }
    setRuntimeByKey(initialRuntime);

    function markFile(fileName: string, patch: Omit<SlotRuntimeState, "state">) {
      setRuntimeByKey((prev) => {
        const next = new Map(prev);
        for (const s of group!.slots) {
          if (s.fileName === fileName) {
            next.set(s.key, { state: prev.get(s.key)?.state ?? "idle", ...patch });
          }
        }
        return next;
      });
    }

    (async () => {
      const done = new Set<string>();
      for (const slot of group.slots) {
        if (cancelled) return;
        if (!slot.fileName || buffers.has(slot.fileName) || done.has(slot.fileName)) continue;
        const fileName = slot.fileName;
        done.add(fileName);
        // 1曲の失敗(保存データ消失・未対応形式など)で残りの曲の読み込みが止まらないよう、曲ごとに独立して処理する。
        try {
          const blob = await loadAudioFile(group.id, fileName);
          if (cancelled) return;
          if (!blob) {
            markFile(fileName, { hasAudio: false, isDecoding: false, loadError: "音源データが見つかりません" });
            continue;
          }
          const arrayBuffer = await blob.arrayBuffer();
          const buffer = await audioManagerRef.current.decode(arrayBuffer);
          if (cancelled) return;
          buffers.set(fileName, buffer);
          recomputeDecodedBytes();
          void getOrComputePeaks(group.id, fileName, buffer).catch(() => {});
          markFile(fileName, { hasAudio: true, isDecoding: false });
        } catch (err) {
          console.error(`音声の読み込み失敗: ${fileName}`, err);
          if (!cancelled) markFile(fileName, { hasAudio: false, isDecoding: false, loadError: "音源を読み込めません" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGroupId]);

  // AudioManager の再生状態変化を UI に反映
  useEffect(() => {
    return audioManagerRef.current.onStateChange(({ slotKey, state }) => {
      if (!slotKey) return;
      setRuntimeByKey((prev) => {
        const existing = prev.get(slotKey);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(slotKey, { ...existing, state });
        return next;
      });
    });
  }, []);

  function updateGroup(id: string, updater: (g: GroupProfile) => GroupProfile) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== id) return g;
        const updated = { ...updater(g), updatedAt: new Date().toISOString() };
        saveGroup(updated).catch((err) => {
          console.error("団体設定の保存に失敗しました", err);
          showError("設定を保存できませんでした（再読み込みすると元に戻ります）");
        });
        return updated;
      }),
    );
  }

  async function handleActivate(key: string) {
    if (!currentGroup) return;
    const slot = currentGroup.slots.find((s) => s.key === key);
    if (!slot || !slot.fileName) return;
    const buffer = buffersRef.current.get(currentGroup.id)?.get(slot.fileName);
    if (!buffer) {
      // 鳴らない理由をオペレーターに即座に伝える(無反応だと原因が分からず焦るため)。
      const runtime = runtimeByKey.get(key);
      showError(`[${keyDisplayFor(key)}] ${runtime?.loadError ?? (runtime?.isDecoding ? "読み込み中です" : "音源が準備できていません")}`);
      return;
    }

    // 波形取得はトリガーのレイテンシに影響させない: キャッシュ済みなら即反映、無ければバックグラウンドで計算して後から反映する。
    const groupId = currentGroup.id;
    const fileName = slot.fileName;
    const cachedPeaks = peaksRef.current.get(groupId)?.get(fileName) ?? null;
    setWaveformSlot({ key, peaks: cachedPeaks, duration: buffer.duration, label: slot.label });
    if (!cachedPeaks) {
      void getOrComputePeaks(groupId, fileName, buffer)
        .then((peaks) => {
          setWaveformSlot((prev) => (prev && prev.key === key ? { ...prev, peaks } : prev));
        })
        .catch(() => {});
    }

    // 通常はそのまま即時再生。出力が止まっている場合のみ復帰を試みる(応答が無くても一定時間で先へ進む)。
    if (audioManagerRef.current.contextState !== "running") {
      await audioManagerRef.current.resume();
    }
    try {
      audioManagerRef.current.trigger(key, buffer, { fadeIn: slot.fadeIn, fadeOut: slot.fadeOut, loop: slot.loop });
    } catch (err) {
      console.error("再生に失敗しました", err);
      showError(`[${keyDisplayFor(key)}] 再生に失敗しました。ステータスバーの AUDIO を確認してください`);
    }
  }

  function handlePanic() {
    audioManagerRef.current.panicStop();
  }

  /** どのスロットからも参照されなくなった音源の実体を削除する(ストレージ容量の圧迫防止)。 */
  function cleanupOrphanAudio(groupId: string, fileName: string, remainingSlots: SlotConfig[]) {
    if (remainingSlots.some((s) => s.fileName === fileName)) return;
    buffersRef.current.get(groupId)?.delete(fileName);
    peaksRef.current.get(groupId)?.delete(fileName);
    recomputeDecodedBytes();
    deleteAudioFile(groupId, fileName).catch((err) => console.warn("未使用音源の削除に失敗", err));
  }

  async function handleAssignFile(key: string, file: File) {
    if (!currentGroup) return;
    const group = currentGroup;
    const groupId = group.id;
    const fileName = uniqueFileName(group, key, file.name);
    const previousFileName = group.slots.find((s) => s.key === key)?.fileName ?? null;

    let buffer: AudioBuffer;
    try {
      const arrayBuffer = await file.arrayBuffer();
      buffer = await audioManagerRef.current.decode(arrayBuffer);
    } catch (err) {
      console.error("音源のデコードに失敗しました", err);
      showError(`「${file.name}」を読み込めません。対応形式(mp3 / wav / m4a)か確認してください`);
      return;
    }
    try {
      await saveAudioFile(groupId, fileName, file);
    } catch (err) {
      console.error("音源の保存に失敗しました", err);
      showError(`「${file.name}」を保存できません（容量不足の可能性）。不要な団体を削除してください`);
      return;
    }

    let groupBuffers = buffersRef.current.get(groupId);
    if (!groupBuffers) {
      groupBuffers = new Map();
      buffersRef.current.set(groupId, groupBuffers);
    }
    groupBuffers.set(fileName, buffer);
    // 同名で差し替えた場合に古い波形が表示されないよう、既存の波形キャッシュは破棄して再計算する。
    peaksRef.current.get(groupId)?.delete(fileName);
    recomputeDecodedBytes();
    void getOrComputePeaks(groupId, fileName, buffer).catch(() => {});

    const nextSlots = group.slots.map((s) =>
      s.key === key ? { ...s, fileName, label: s.label === "未設定" ? stripExtension(file.name) : s.label } : s,
    );
    updateGroup(groupId, (g) => ({
      ...g,
      slots: g.slots.map((s) =>
        s.key === key ? { ...s, fileName, label: s.label === "未設定" ? stripExtension(file.name) : s.label } : s,
      ),
    }));
    if (previousFileName && previousFileName !== fileName) cleanupOrphanAudio(groupId, previousFileName, nextSlots);

    setRuntimeByKey((prev) => {
      const next = new Map(prev);
      next.set(key, { state: prev.get(key)?.state ?? "idle", hasAudio: true, isDecoding: false });
      return next;
    });

    if (buffer.duration > LONG_AUDIO_WARN_SECONDS) {
      setToast({ type: "error", message: `「${file.name}」は${Math.round(buffer.duration / 60)}分あり、メモリを多く使います。必要な部分だけに編集することを推奨します` });
    }
  }

  function handleRemoveFile(key: string) {
    if (!currentGroup) return;
    const groupId = currentGroup.id;
    const previousFileName = currentGroup.slots.find((s) => s.key === key)?.fileName ?? null;
    audioManagerRef.current.stopSlot(key, 0);
    const nextSlots = currentGroup.slots.map((s) => (s.key === key ? { ...s, fileName: null, label: "未設定" } : s));
    updateGroup(groupId, (g) => ({
      ...g,
      slots: g.slots.map((s) => (s.key === key ? { ...s, fileName: null, label: "未設定" } : s)),
    }));
    if (previousFileName) cleanupOrphanAudio(groupId, previousFileName, nextSlots);
    setRuntimeByKey((prev) => {
      const next = new Map(prev);
      next.set(key, { state: "idle", hasAudio: false, isDecoding: false });
      return next;
    });
  }

  function handleSaveSlot(key: string, patch: Partial<SlotConfig>) {
    if (!currentGroup) return;
    updateGroup(currentGroup.id, (g) => ({
      ...g,
      slots: g.slots.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    }));
  }

  /** 団体が切り替わると音が止まるため、再生中・フェードアウト中・一時停止中は団体の作成・削除を受け付けない。 */
  function rejectIfBusy(): boolean {
    if (!audioManagerRef.current.isBusy) return false;
    showError("再生中・一時停止中は団体の作成・削除はできません（Esc で停止してから操作してください）");
    return true;
  }

  async function handleCreateGroup() {
    if (rejectIfBusy()) return;
    const group = createEmptyGroup("新しい団体");
    try {
      await saveGroup(group);
    } catch (err) {
      console.error("団体の作成に失敗しました", err);
      showError("団体を保存できませんでした");
    }
    setGroups((prev) => [...prev, group]);
    setCurrentGroupId(group.id);
    setEditMode(true);
  }

  async function handleDeleteGroup() {
    if (!currentGroup) return;
    if (rejectIfBusy()) return;
    const ok = window.confirm(`団体「${currentGroup.groupName}」を削除します。この操作は取り消せません。よろしいですか？`);
    if (!ok) return;
    const deletingId = currentGroup.id;
    try {
      await deleteGroupFromDb(deletingId);
    } catch (err) {
      console.error("団体の削除に失敗しました", err);
      showError("団体の削除に失敗しました");
      return;
    }
    buffersRef.current.delete(deletingId);
    peaksRef.current.delete(deletingId);
    const remaining = groups.filter((g) => g.id !== deletingId);
    setGroups(remaining);
    setCurrentGroupId(remaining[0]?.id ?? null);
  }

  function handleRenameGroup(name: string) {
    if (!currentGroup) return;
    updateGroup(currentGroup.id, (g) => ({ ...g, groupName: name }));
  }

  async function handleExport() {
    if (!currentGroup) return;
    try {
      const blob = await presetStorageService.exportGroup(
        currentGroup,
        (fileName) => loadAudioFile(currentGroup.id, fileName),
        (fileName) => {
          const cached = peaksRef.current.get(currentGroup.id)?.get(fileName);
          return cached ? Promise.resolve(cached) : loadWaveformPeaks(currentGroup.id, fileName);
        },
      );
      presetStorageService.triggerDownload(blob, currentGroup.groupName);
      setToast({ type: "success", message: `「${currentGroup.groupName}」を書き出しました` });
    } catch (err) {
      console.error("団体パッケージの書き出しに失敗しました", err);
      setToast({ type: "error", message: "書き出しに失敗しました" });
    }
  }

  async function handleImportFile(file: File) {
    // window.alert はダイアログを閉じるまで緊急停止キーを含む全操作を止めてしまうため使わない。
    const importId = newId();
    try {
      const { profile, audioBlobs, waveforms, missingFiles } = await presetStorageService.importGroup(file, importId);
      for (const [fileName, blob] of audioBlobs) {
        await saveAudioFile(importId, fileName, blob);
      }
      if (waveforms.size > 0) {
        const groupPeaks = new Map<string, Float32Array>();
        peaksRef.current.set(importId, groupPeaks);
        for (const [fileName, peaks] of waveforms) {
          groupPeaks.set(fileName, peaks);
          await saveWaveformPeaks(importId, fileName, peaks).catch(() => {});
        }
      }
      await saveGroup(profile);
      setGroups((prev) => [...prev, profile]);
      // 再生中(フェードアウト中・一時停止中を含む)に読み込んだ場合は、団体を切り替えて音を止めてしまわないよう、追加のみ行う。
      const playing = audioManagerRef.current.isBusy;
      if (!playing) setCurrentGroupId(importId);
      if (missingFiles.length > 0) {
        showError(`「${profile.groupName}」に含まれていない音源が${missingFiles.length}件あります: ${missingFiles.slice(0, 3).join(", ")}`);
      } else {
        setToast({
          type: "success",
          message: playing ? `「${profile.groupName}」を追加しました（再生中のため切替は行っていません）` : `「${profile.groupName}」を読み込みました`,
        });
      }
    } catch (err) {
      console.error("団体パッケージの読み込みに失敗しました", err);
      deleteGroupFromDb(importId).catch(() => {});
      peaksRef.current.delete(importId);
      showError(err instanceof Error ? `読み込み失敗: ${err.message}` : "団体パッケージの読み込みに失敗しました");
    }
  }

  function isImportableFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return IMPORT_EXTENSIONS.some((ext) => name.endsWith(ext));
  }

  useKeyboard({
    onTrigger: (code) => void handleActivate(code),
    suspended: editingKey !== null,
  });

  // 音声が登録されている、または再生中のときは誤リロード・誤離脱を防止する。
  const hasRegisteredAudio = currentGroup?.slots.some((s) => !!s.fileName) ?? false;
  const isPlaying = Array.from(runtimeByKey.values()).some((r) => r.state !== "idle");
  useReloadGuard(hasRegisteredAudio || isPlaying);

  const slotHealth: SlotHealth = { assigned: 0, ready: 0, loading: 0, failed: 0 };
  for (const slot of currentGroup?.slots ?? []) {
    if (!slot.fileName) continue;
    slotHealth.assigned++;
    const r = runtimeByKey.get(slot.key);
    if (r?.loadError) slotHealth.failed++;
    else if (r?.hasAudio) slotHealth.ready++;
    else slotHealth.loading++;
  }

  function toggleEditMode() {
    // 編集完了時、団体名の入力欄などにフォーカスが残っているとキー入力が文字入力に化けるため外す。
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setEditMode((v) => !v);
  }

  const editingSlot = currentGroup?.slots.find((s) => s.key === editingKey) ?? null;

  const slotsByKey = new Map<string, SlotConfig>();
  currentGroup?.slots.forEach((s) => slotsByKey.set(s.key, s));

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stage-bg font-mono text-sm text-stage-muted">
        読み込み中…
      </div>
    );
  }

  return (
    <div
      className="flex h-screen flex-col bg-stage-bg"
      onDragOver={(e) => {
        e.preventDefault();
        setWindowDragActive(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setWindowDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setWindowDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file && isImportableFile(file)) {
          void handleImportFile(file);
        }
      }}
    >
      <Header
        groups={groups}
        currentGroup={currentGroup}
        editMode={editMode}
        onSwitchGroup={setCurrentGroupId}
        onCreateGroup={() => void handleCreateGroup()}
        onDeleteGroup={() => void handleDeleteGroup()}
        onRenameGroup={handleRenameGroup}
        onToggleEditMode={toggleEditMode}
        groupSwitchLocked={isPlaying}
        onExport={() => void handleExport()}
        onImportFile={(file) => void handleImportFile(file)}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div className="relative flex-1 overflow-auto">
        {currentGroup ? (
          <SlotGrid
            slotsByKey={slotsByKey}
            runtimeByKey={runtimeByKey}
            editMode={editMode}
            onActivate={(key) => void handleActivate(key)}
            onOpenEditor={(key) => setEditingKey(key)}
            onDropFile={(key, file) => void handleAssignFile(key, file)}
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-sm text-stage-muted">
            団体がありません。「新規団体」から作成してください。
          </div>
        )}

        {windowDragActive && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-white bg-stage-bg/90">
            <span className="font-mono text-lg font-bold uppercase tracking-wide text-white">
              .stagepack / .zip をドロップして団体を読み込み
            </span>
          </div>
        )}
      </div>

      <WaveformDisplay
        audioManager={audioManagerRef.current}
        slotKey={waveformSlot?.key ?? null}
        peaks={waveformSlot?.peaks ?? null}
        duration={waveformSlot?.duration ?? 0}
        label={waveformSlot?.label ?? ""}
        playbackState={(waveformSlot && runtimeByKey.get(waveformSlot.key)?.state) || "idle"}
      />

      <SystemStatusBar
        editMode={editMode}
        slotHealth={slotHealth}
        decodedBytes={decodedBytes}
        isPlaying={isPlaying}
        storageError={storageError}
      />

      <button
        tabIndex={-1}
        onClick={handlePanic}
        className="flex h-14 w-full shrink-0 items-center justify-center gap-3 border-t-2 border-red-900 bg-stage-danger text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.15),inset_0_-3px_0_rgba(0,0,0,0.35)] transition-colors hover:bg-red-500 active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.5)]"
        title="緊急停止 (Esc)"
      >
        <OctagonX size={22} strokeWidth={2.5} />
        <span className="font-mono text-base font-black uppercase tracking-[0.3em]">Esc — All Stop</span>
      </button>

      {editingSlot && (
        <SlotEditorModal
          slot={editingSlot}
          onClose={() => setEditingKey(null)}
          onSave={(patch) => handleSaveSlot(editingSlot.key, patch)}
          onAssignFile={(file) => void handleAssignFile(editingSlot.key, file)}
          onRemoveFile={() => handleRemoveFile(editingSlot.key)}
        />
      )}
    </div>
  );
}
