import { KEY_ROWS } from "../utils/keys";
import type { SlotConfig, SlotRuntimeState } from "../types";
import { SlotTile } from "./SlotTile";

interface SlotGridProps {
  slotsByKey: Map<string, SlotConfig>;
  runtimeByKey: Map<string, SlotRuntimeState>;
  editMode: boolean;
  onActivate: (key: string) => void;
  onOpenEditor: (key: string) => void;
  onDropFile: (key: string, file: File) => void;
}

const emptyRuntime: SlotRuntimeState = { state: "idle", hasAudio: false, isDecoding: false };

export function SlotGrid({ slotsByKey, runtimeByKey, editMode, onActivate, onOpenEditor, onDropFile }: SlotGridProps) {
  return (
    <div className="flex flex-col gap-2 p-4">
      {KEY_ROWS.map((row, i) => (
        <div key={i} className="flex gap-2" style={{ paddingLeft: `${i * 1.5}rem` }}>
          {row.map((entry) => {
            const slot = slotsByKey.get(entry.code);
            if (!slot) return null;
            const runtime = runtimeByKey.get(entry.code) ?? emptyRuntime;
            return (
              <SlotTile
                key={entry.code}
                entry={entry}
                slot={slot}
                runtime={runtime}
                editMode={editMode}
                onActivate={() => onActivate(entry.code)}
                onOpenEditor={() => onOpenEditor(entry.code)}
                onDropFile={(file) => onDropFile(entry.code, file)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
