import { useState } from "react";
import { Repeat, Settings, ArrowRightToLine, ArrowLeftToLine } from "lucide-react";
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

const RAISED_BEVEL = "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-2px_0_rgba(0,0,0,0.5)]";
const PRESSED_BEVEL = "shadow-[inset_0_2px_5px_rgba(0,0,0,0.65),inset_0_-1px_0_rgba(255,255,255,0.03)]";

function isAudioFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function SlotTile({ entry, slot, runtime, editMode, onActivate, onOpenEditor, onDropFile }: SlotTileProps) {
  const [dragOver, setDragOver] = useState(false);
  const hasAudio = runtime.hasAudio;
  const { state } = runtime;

  const ledClass =
    state === "playing" ? "bg-stage-playing" : state === "fading-out" ? "bg-stage-fading animate-pulse" : "bg-transparent";

  const borderClass =
    state === "playing"
      ? "border-stage-playing"
      : state === "fading-out"
        ? "border-stage-fading"
        : dragOver
          ? "border-white border-dashed"
          : hasAudio
            ? "border-stage-border"
            : "border-stage-border/60 border-dashed";

  const bgClass = state === "playing" || state === "fading-out" ? "bg-stage-surface" : hasAudio ? "bg-stage-surface2" : "bg-stage-bg";
  const bevelClass = state === "playing" ? PRESSED_BEVEL : RAISED_BEVEL;

  const keyTextClass =
    state === "playing" ? "text-stage-playing" : state === "fading-out" ? "text-stage-fading" : "text-white";

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
      className={`no-select relative flex h-28 w-28 shrink-0 cursor-pointer flex-col justify-between rounded-sm border ${borderClass} ${bgClass} ${bevelClass} p-2`}
      title={slot.fileName ?? undefined}
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] rounded-t-sm ${ledClass}`} />

      <div className="flex items-start justify-between pt-0.5">
        <span className={`font-mono text-xl font-bold leading-none ${keyTextClass}`}>{entry.display}</span>
        {editMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenEditor();
            }}
            className="rounded-sm border border-stage-border bg-stage-bg p-1 text-stage-muted hover:border-white hover:text-white"
            aria-label="スロット編集"
          >
            <Settings size={12} />
          </button>
        )}
      </div>

      <div className="flex flex-1 items-center overflow-hidden py-1">
        {hasAudio && <span className="line-clamp-2 text-xs font-medium leading-tight text-white">{slot.label}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-1 font-mono text-[9px] uppercase tracking-wide text-stage-muted">
        {slot.loop && (
          <span className="flex items-center gap-0.5 rounded-sm border border-stage-border bg-stage-bg/60 px-1 py-0.5" title="ループ再生">
            <Repeat size={9} />
          </span>
        )}
        {slot.fadeIn > 0 && (
          <span
            className="flex items-center gap-0.5 rounded-sm border border-stage-border bg-stage-bg/60 px-1 py-0.5"
            title={`フェードイン ${slot.fadeIn}s`}
          >
            <ArrowRightToLine size={9} />
            {slot.fadeIn}s
          </span>
        )}
        {slot.fadeOut > 0 && (
          <span
            className="flex items-center gap-0.5 rounded-sm border border-stage-border bg-stage-bg/60 px-1 py-0.5"
            title={`フェードアウト ${slot.fadeOut}s`}
          >
            <ArrowLeftToLine size={9} />
            {slot.fadeOut}s
          </span>
        )}
        {runtime.isDecoding && <span className="text-stage-fading">読込中</span>}
      </div>
    </div>
  );
}
