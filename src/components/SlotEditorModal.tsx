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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={commitAndClose}>
      <div
        className="w-full max-w-md rounded-sm border border-stage-border bg-stage-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-stage-border pb-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-white">
            スロット編集
            <span className="rounded-sm border border-stage-border bg-stage-bg px-2 py-0.5 font-mono text-base text-white">
              {keyDisplayFor(slot.key)}
            </span>
          </h2>
          <button
            onClick={commitAndClose}
            className="rounded-sm border border-stage-border p-1 text-stage-muted hover:border-white hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-stage-muted">
              トラック名
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-sm border border-stage-border bg-stage-bg px-3 py-2 text-sm text-white outline-none focus:border-white"
              placeholder="例: オープニングSE"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-stage-muted">
              音源ファイル
            </label>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate rounded-sm border border-stage-border bg-stage-bg px-3 py-2 text-sm text-stage-muted">
                {slot.fileName ?? "未割当"}
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 rounded-sm border border-stage-border bg-stage-surface2 px-3 py-2 text-sm text-white hover:border-white"
              >
                <FolderOpen size={14} /> 選択
              </button>
              {slot.fileName && (
                <button
                  onClick={onRemoveFile}
                  className="flex items-center gap-1 rounded-sm border border-stage-danger/50 bg-stage-danger/10 px-3 py-2 text-sm text-stage-danger hover:border-stage-danger"
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
            <label className="mb-1 flex justify-between text-[11px] font-bold uppercase tracking-wide text-stage-muted">
              <span>フェードイン</span>
              <span className="font-mono text-white">{fadeIn.toFixed(1)}s</span>
            </label>
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={fadeIn}
              onChange={(e) => setFadeIn(Number(e.target.value))}
              className="w-full accent-white"
            />
          </div>

          <div>
            <label className="mb-1 flex justify-between text-[11px] font-bold uppercase tracking-wide text-stage-muted">
              <span>フェードアウト</span>
              <span className="font-mono text-white">{fadeOut.toFixed(1)}s</span>
            </label>
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={fadeOut}
              onChange={(e) => setFadeOut(Number(e.target.value))}
              className="w-full accent-white"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
              className="h-4 w-4 accent-white"
            />
            ループ再生 (Repeat)
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-stage-border pt-4">
          <button
            onClick={commitAndClose}
            className="rounded-sm bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-black hover:bg-stage-muted"
          >
            完了
          </button>
        </div>
      </div>
    </div>
  );
}
