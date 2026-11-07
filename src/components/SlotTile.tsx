import { useState } from "react";
import { Repeat, ArrowRightToLine, ArrowLeftToLine, Pause, AlertTriangle, Loader2 } from "lucide-react";
import type { SlotConfig, SlotRuntimeState } from "../types";
import type { KeyLayoutEntry } from "../utils/keys";

interface SlotTileProps {
  entry: KeyLayoutEntry;
  slot: SlotConfig;
  runtime: SlotRuntimeState;
  editMode: boolean;
  onActivate: () => void;
  onOpenEditor: () => void;
  onDropFile: (file: File) => void;
}

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".aac", ".m4a", ".ogg"];

function isAudioFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function SlotTile({ entry, slot, runtime, editMode, onActivate, onOpenEditor, onDropFile }: SlotTileProps) {
  const [dragOver, setDragOver] = useState(false);
  const { state, hasAudio, loadError, isDecoding } = runtime;
  const assigned = hasAudio || !!loadError || isDecoding;

  // 色は「再生中 = アクセント」「一時停止 = 白枠」「エラー = 赤」の3種類だけ。
  const toneClass = loadError
    ? "border-stage-danger/70 bg-stage-danger/10"
    : state === "playing"
      ? "border-stage-accent bg-stage-accent/15"
      : state === "fading-out"
        ? "border-stage-accent/60 bg-stage-accent/10 animate-pulse"
        : state === "paused"
          ? "border-stage-fg/70 bg-stage-surface"
          : dragOver
            ? "border-stage-fg border-dashed bg-stage-surface"
            : assigned
              ? "border-stage-border bg-stage-surface hover:border-stage-muted/50"
              : "border-stage-border/60 border-dashed bg-transparent";

  const keyClass = state === "playing" || state === "fading-out" ? "text-stage-accent" : "text-stage-muted";

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!editMode) return;
    const file = e.dataTransfer.files?.[0];
    if (file && isAudioFile(file)) {
      e.stopPropagation();
      onDropFile(file);
    }
  }

  function handleClick() {
    if (editMode) {
      onOpenEditor();
    } else {
      onActivate();
    }
  }

  return (
    <div
      onClick={handleClick}
      onDragOver={(e) => {
        if (!editMode) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`no-select relative flex h-28 w-28 shrink-0 cursor-pointer flex-col rounded-md border p-2.5 transition-colors ${toneClass}`}
      title={loadError ? `${loadError}: ${slot.fileName}` : (slot.fileName ?? undefined)}
    >
      <div className="flex items-center justify-between">
        <span className={`font-mono text-sm font-semibold leading-none ${keyClass}`}>{entry.display}</span>
        {state === "paused" && <Pause size={12} className="text-stage-fg" />}
        {isDecoding && <Loader2 size={12} className="animate-spin text-stage-muted" />}
        {loadError && <AlertTriangle size={12} className="text-stage-danger" />}
      </div>

      <div className="flex flex-1 items-end overflow-hidden pb-1">
        {assigned && (
          <span className={`line-clamp-3 text-[13px] font-medium leading-snug ${loadError ? "text-stage-danger" : "text-stage-fg"}`}>
            {slot.label}
          </span>
        )}
      </div>

      {(slot.loop || slot.fadeIn > 0 || slot.fadeOut > 0) && (
        <div className="flex items-center gap-1.5 text-[10px] tabular-nums text-stage-muted">
          {slot.loop && <Repeat size={10} aria-label="Loop" />}
          {slot.fadeIn > 0 && (
            <span className="flex items-center gap-0.5" title={`Fade in ${slot.fadeIn}s`}>
              <ArrowRightToLine size={10} />
              {slot.fadeIn}
            </span>
          )}
          {slot.fadeOut > 0 && (
            <span className="flex items-center gap-0.5" title={`Fade out ${slot.fadeOut}s`}>
              <ArrowLeftToLine size={10} />
              {slot.fadeOut}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
