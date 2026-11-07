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

  const labelClass = "mb-1.5 block text-xs font-medium text-stage-muted";
  const inputClass =
    "w-full rounded border border-stage-border bg-stage-bg px-3 py-2 text-sm text-stage-fg outline-none placeholder:text-stage-muted/60 focus:border-stage-muted";

  return (
    <div data-modal-open className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={commitAndClose}>
      <div
        className="w-full max-w-md rounded-md border border-stage-border bg-stage-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex items-center gap-2.5 text-base font-semibold text-stage-fg">
            <kbd className="rounded-sm border border-stage-border bg-stage-bg px-2 py-0.5 font-mono text-sm">
              {keyDisplayFor(slot.key)}
            </kbd>
            Edit slot
          </h2>
          <button onClick={commitAndClose} className="rounded p-1 text-stage-muted hover:bg-stage-fg/10 hover:text-stage-fg" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className={labelClass}>Name</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} placeholder="e.g. Opening SE" />
          </div>

          <div>
            <label className={labelClass}>Audio file</label>
            <div className="flex items-center gap-2">
              <span className={`${inputClass} flex-1 truncate text-stage-muted`}>{slot.fileName ?? "None"}</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex shrink-0 items-center gap-1.5 rounded border border-stage-border px-3 py-2 text-sm text-stage-fg hover:bg-stage-fg/5"
              >
                <FolderOpen size={14} /> Browse
              </button>
              {slot.fileName && (
                <button
                  onClick={onRemoveFile}
                  className="shrink-0 rounded border border-stage-border p-2 text-stage-danger hover:bg-stage-danger/10"
                  aria-label="Remove file"
                  title="Remove file"
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`${labelClass} flex justify-between`}>
                <span>Fade in</span>
                <span className="font-mono tabular-nums text-stage-fg">{fadeIn.toFixed(1)}s</span>
              </label>
              <input
                type="range"
                min={0}
                max={5}
                step={0.1}
                value={fadeIn}
                onChange={(e) => setFadeIn(Number(e.target.value))}
                className="w-full accent-stage-fg"
              />
            </div>
            <div>
              <label className={`${labelClass} flex justify-between`}>
                <span>Fade out</span>
                <span className="font-mono tabular-nums text-stage-fg">{fadeOut.toFixed(1)}s</span>
              </label>
              <input
                type="range"
                min={0}
                max={5}
                step={0.1}
                value={fadeOut}
                onChange={(e) => setFadeOut(Number(e.target.value))}
                className="w-full accent-stage-fg"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-stage-fg">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="h-4 w-4 accent-stage-fg" />
            Loop
          </label>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={commitAndClose} className="rounded bg-stage-fg px-4 py-2 text-sm font-medium text-stage-bg hover:bg-stage-fg/90">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
