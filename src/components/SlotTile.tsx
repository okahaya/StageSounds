import { useState } from "react";
import { Repeat, Settings, Music2, TrendingUp, TrendingDown } from "lucide-react";
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
  const hasAudio = runtime.hasAudio;
  const { state } = runtime;

  const stateClasses =
    state === "playing"
      ? "border-stage-accent shadow-[0_0_18px_rgba(249,115,22,0.55)] bg-stage-accent/10"
      : state === "fading-out"
        ? "border-stage-accent2 shadow-[0_0_14px_rgba(34,211,238,0.4)] bg-stage-accent2/10"
        : hasAudio
          ? "border-stage-border bg-stage-panel2 hover:border-stage-accent2/60"
          : "border-stage-border/50 border-dashed bg-stage-panel/60";

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
      className={`no-select relative flex h-28 w-28 shrink-0 cursor-pointer flex-col justify-between rounded-lg border-2 p-2 transition-all duration-100 ${stateClasses} ${
        dragOver ? "border-stage-accent2 bg-stage-accent2/20" : ""
      }`}
      title={slot.fileName ?? "未設定"}
    >
      <div className="flex items-center justify-between">
        <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs font-bold text-gray-200">
          [ {entry.display} ]
        </span>
        {editMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenEditor();
            }}
            className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white"
            aria-label="スロット編集"
          >
            <Settings size={14} />
          </button>
        )}
        {!editMode && state === "playing" && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-stage-accent" />
        )}
        {!editMode && state === "fading-out" && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-stage-accent2" />
        )}
      </div>

      <div className="flex flex-1 items-center overflow-hidden px-0.5">
        {hasAudio ? (
          <span className="line-clamp-2 text-xs font-medium leading-tight text-gray-100">{slot.label}</span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Music2 size={12} />
            {editMode ? "ドラッグ&ドロップで割当" : "未設定"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
        {slot.loop && (
          <span className="flex items-center gap-0.5 rounded bg-black/30 px-1" title="ループ再生">
            <Repeat size={10} />
          </span>
        )}
        {slot.fadeIn > 0 && (
          <span className="flex items-center gap-0.5 rounded bg-black/30 px-1" title={`フェードイン ${slot.fadeIn}s`}>
            <TrendingUp size={10} />
            {slot.fadeIn}s
          </span>
        )}
        {slot.fadeOut > 0 && (
          <span className="flex items-center gap-0.5 rounded bg-black/30 px-1" title={`フェードアウト ${slot.fadeOut}s`}>
            <TrendingDown size={10} />
            {slot.fadeOut}s
          </span>
        )}
        {runtime.isDecoding && <span className="text-stage-accent2">読込中…</span>}
      </div>
    </div>
  );
}
