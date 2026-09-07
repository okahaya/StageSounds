import { useEffect, useRef, useState } from "react";
import { X, FolderOpen, Trash2 } from "lucide-react";
import type { SlotConfig } from "../types";
import { keyDisplayFor } from "../utils/keys";

interface SlotEditorModalProps {
  slot: SlotConfig;
  onClose: () => void;
  onSave: (patch: Partial<SlotConfig>) => void;
  onAssignFile: (file: File) => void;
  onRemoveFile: () => void;
}

const AUDIO_ACCEPT = ".mp3,.wav,.aac,.m4a,.ogg,audio/*";

export function SlotEditorModal({ slot, onClose, onSave, onAssignFile, onRemoveFile }: SlotEditorModalProps) {
  const [label, setLabel] = useState(slot.label);
  const [fadeIn, setFadeIn] = useState(slot.fadeIn);
  const [fadeOut, setFadeOut] = useState(slot.fadeOut);
  const [loop, setLoop] = useState(slot.loop);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabel(slot.label);
    setFadeIn(slot.fadeIn);
    setFadeOut(slot.fadeOut);
    setLoop(slot.loop);
  }, [slot]);

  function commitAndClose() {
    onSave({ label: label.trim() || "未設定", fadeIn, fadeOut, loop });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={commitAndClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-stage-border bg-stage-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-lg font-bold text-white">
            スロット編集 <span className="text-stage-accent">[ {keyDisplayFor(slot.key)} ]</span>
          </h2>
          <button onClick={commitAndClose} className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">トラック名</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-md border border-stage-border bg-stage-panel2 px-3 py-2 text-sm text-white outline-none focus:border-stage-accent2"
              placeholder="例: オープニングSE"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">音源ファイル</label>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate rounded-md border border-stage-border bg-stage-panel2 px-3 py-2 text-sm text-gray-300">
                {slot.fileName ?? "未割当"}
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 rounded-md bg-stage-accent2/20 px-3 py-2 text-sm text-stage-accent2 hover:bg-stage-accent2/30"
              >
                <FolderOpen size={14} /> 選択
              </button>
              {slot.fileName && (
                <button
                  onClick={onRemoveFile}
                  className="flex items-center gap-1 rounded-md bg-stage-danger/20 px-3 py-2 text-sm text-stage-danger hover:bg-stage-danger/30"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={AUDIO_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onAssignFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <div>
            <label className="mb-1 flex justify-between text-xs font-medium text-gray-400">
              <span>フェードイン</span>
              <span className="font-mono text-stage-accent2">{fadeIn.toFixed(1)}s</span>
            </label>
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={fadeIn}
              onChange={(e) => setFadeIn(Number(e.target.value))}
              className="w-full accent-stage-accent2"
            />
          </div>

          <div>
            <label className="mb-1 flex justify-between text-xs font-medium text-gray-400">
              <span>フェードアウト</span>
              <span className="font-mono text-stage-accent2">{fadeOut.toFixed(1)}s</span>
            </label>
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={fadeOut}
              onChange={(e) => setFadeOut(Number(e.target.value))}
              className="w-full accent-stage-accent2"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
              className="h-4 w-4 accent-stage-accent"
            />
            ループ再生 (Repeat)
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={commitAndClose}
            className="rounded-md bg-stage-accent px-4 py-2 text-sm font-semibold text-black hover:bg-stage-accent/80"
          >
            完了
          </button>
        </div>
      </div>
    </div>
  );
}
