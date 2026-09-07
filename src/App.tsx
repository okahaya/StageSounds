import { useEffect, useRef, useState } from "react";
import { AudioManager } from "./audio/AudioManager";
import { Header } from "./components/Header";
import { SlotGrid } from "./components/SlotGrid";
import { SlotEditorModal } from "./components/SlotEditorModal";
import { useKeyboard } from "./hooks/useKeyboard";
import {
  getLastActiveGroupId,
  loadAllGroups,
  loadAudioFile,
  saveAudioFile,
  saveGroup,
  deleteGroup as deleteGroupFromDb,
  setLastActiveGroupId,
} from "./storage/db";
import { presetStorageService } from "./storage/PresetStorageService";
import { createDefaultSlots } from "./utils/keys";
import type { GroupProfile, SlotConfig, SlotRuntimeState } from "./types";

function stripExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

function createEmptyGroup(name: string): GroupProfile {
  return {
    id: crypto.randomUUID(),
    groupName: name,
    updatedAt: new Date().toISOString(),
    slots: createDefaultSlots(),
  };
}

const IMPORT_EXTENSIONS = [".zip", ".stagepack"];

export default function App() {
  const audioManagerRef = useRef<AudioManager>(new AudioManager());
  const buffersRef = useRef<Map<string, Map<string, AudioBuffer>>>(new Map());

  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupProfile[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [runtimeByKey, setRuntimeByKey] = useState<Map<string, SlotRuntimeState>>(new Map());
  const [windowDragActive, setWindowDragActive] = useState(false);

  const currentGroup = groups.find((g) => g.id === currentGroupId) ?? null;

  // 初回ロード: IndexedDB から団体一覧を復元。なければ既定の団体を1つ作成する。
  useEffect(() => {
    (async () => {
      const stored = await loadAllGroups();
      if (stored.length === 0) {
        const group = createEmptyGroup("新しい団体");
        await saveGroup(group);
        setGroups([group]);
        setCurrentGroupId(group.id);
      } else {
        setGroups(stored);
        const lastId = await getLastActiveGroupId();
        setCurrentGroupId(stored.find((g) => g.id === lastId)?.id ?? stored[0].id);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (currentGroupId) void setLastActiveGroupId(currentGroupId);
  }, [currentGroupId]);

  // 団体切り替え時: その団体の音声を IndexedDB から読み出し AudioBuffer へデコードする。
  // (依存は id のみ。同一団体内でのスロット編集ではここを再実行しない)
  useEffect(() => {
    const group = groups.find((g) => g.id === currentGroupId) ?? null;
    audioManagerRef.current.panicStop();

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

    const initialRuntime = new Map<string, SlotRuntimeState>();
    for (const slot of group.slots) {
      initialRuntime.set(slot.key, {
        state: "idle",
        hasAudio: !!slot.fileName && buffers.has(slot.fileName),
        isDecoding: !!slot.fileName && !buffers.has(slot.fileName),
      });
    }
    setRuntimeByKey(initialRuntime);

    (async () => {
      for (const slot of group.slots) {
        if (!slot.fileName || buffers.has(slot.fileName)) continue;
        const blob = await loadAudioFile(group.id, slot.fileName);
        if (!blob || cancelled) continue;
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const buffer = await audioManagerRef.current.decode(arrayBuffer);
          buffers.set(slot.fileName, buffer);
          if (cancelled) continue;
          setRuntimeByKey((prev) => {
            const next = new Map(prev);
            for (const s of group.slots) {
              if (s.fileName === slot.fileName) {
                next.set(s.key, { state: "idle", hasAudio: true, isDecoding: false });
              }
            }
            return next;
          });
        } catch (err) {
          console.error(`音声デコード失敗: ${slot.fileName}`, err);
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
        void saveGroup(updated);
        return updated;
      }),
    );
  }

  async function handleActivate(key: string) {
    if (!currentGroup) return;
    const slot = currentGroup.slots.find((s) => s.key === key);
    if (!slot || !slot.fileName) return;
    const buffer = buffersRef.current.get(currentGroup.id)?.get(slot.fileName);
    if (!buffer) return;
    await audioManagerRef.current.resume();
    audioManagerRef.current.trigger(key, buffer, { fadeIn: slot.fadeIn, fadeOut: slot.fadeOut, loop: slot.loop });
  }

  function handlePanic() {
    audioManagerRef.current.panicStop();
  }

  async function handleAssignFile(key: string, file: File) {
    if (!currentGroup) return;
    const groupId = currentGroup.id;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await audioManagerRef.current.decode(arrayBuffer);
    await saveAudioFile(groupId, file.name, file);

    let groupBuffers = buffersRef.current.get(groupId);
    if (!groupBuffers) {
      groupBuffers = new Map();
      buffersRef.current.set(groupId, groupBuffers);
    }
    groupBuffers.set(file.name, buffer);

    updateGroup(groupId, (g) => ({
      ...g,
      slots: g.slots.map((s) =>
        s.key === key
          ? { ...s, fileName: file.name, label: s.label === "未設定" ? stripExtension(file.name) : s.label }
          : s,
      ),
    }));

    setRuntimeByKey((prev) => {
      const next = new Map(prev);
      next.set(key, { state: "idle", hasAudio: true, isDecoding: false });
      return next;
    });
  }

  function handleRemoveFile(key: string) {
    if (!currentGroup) return;
    audioManagerRef.current.stopSlot(key, 0);
    updateGroup(currentGroup.id, (g) => ({
      ...g,
      slots: g.slots.map((s) => (s.key === key ? { ...s, fileName: null, label: "未設定" } : s)),
    }));
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

  async function handleCreateGroup() {
    const group = createEmptyGroup("新しい団体");
    await saveGroup(group);
    setGroups((prev) => [...prev, group]);
    setCurrentGroupId(group.id);
    setEditMode(true);
  }

  async function handleDeleteGroup() {
    if (!currentGroup) return;
    const ok = window.confirm(`団体「${currentGroup.groupName}」を削除します。この操作は取り消せません。よろしいですか？`);
    if (!ok) return;
    const deletingId = currentGroup.id;
    await deleteGroupFromDb(deletingId);
    buffersRef.current.delete(deletingId);
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
    const blob = await presetStorageService.exportGroup(currentGroup, (fileName) =>
      loadAudioFile(currentGroup.id, fileName),
    );
    presetStorageService.triggerDownload(blob, currentGroup.groupName);
  }

  async function handleImportFile(file: File) {
    try {
      const newId = crypto.randomUUID();
      const { profile, audioBlobs } = await presetStorageService.importGroup(file, newId);
      for (const [fileName, blob] of audioBlobs) {
        await saveAudioFile(newId, fileName, blob);
      }
      await saveGroup(profile);
      setGroups((prev) => [...prev, profile]);
      setCurrentGroupId(newId);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "団体パッケージの読み込みに失敗しました。");
    }
  }

  function isImportableFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return IMPORT_EXTENSIONS.some((ext) => name.endsWith(ext));
  }

  useKeyboard({
    onTrigger: (code) => void handleActivate(code),
    onPanic: handlePanic,
    suspended: editingKey !== null,
  });

  const editingSlot = currentGroup?.slots.find((s) => s.key === editingKey) ?? null;

  const slotsByKey = new Map<string, SlotConfig>();
  currentGroup?.slots.forEach((s) => slotsByKey.set(s.key, s));

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stage-bg text-gray-400">
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
        onToggleEditMode={() => setEditMode((v) => !v)}
        onExport={() => void handleExport()}
        onImportFile={(file) => void handleImportFile(file)}
        onPanic={handlePanic}
      />

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
          <div className="flex h-full items-center justify-center text-gray-500">
            団体がありません。「新規団体」から作成してください。
          </div>
        )}

        {windowDragActive && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-4 border-dashed border-stage-accent2 bg-stage-bg/80">
            <span className="text-lg font-bold text-stage-accent2">
              .stagepack / .zip をドロップして団体を読み込み
            </span>
          </div>
        )}
      </div>

      <footer className="border-t border-stage-border bg-stage-panel px-4 py-1.5 text-center text-xs text-gray-500">
        Space / Esc キーで緊急停止（PANIC STOP）　|　{editMode ? "編集モード: タイルをクリックして設定、ドラッグ&ドロップで音源割当" : "プレイモード: キー入力またはクリックで再生 / 停止"}
      </footer>

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
