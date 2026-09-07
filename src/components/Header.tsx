import { useRef } from "react";
import { Check, Download, FolderPlus, Pencil, Trash2, Upload } from "lucide-react";
import type { GroupProfile } from "../types";

interface HeaderProps {
  groups: GroupProfile[];
  currentGroup: GroupProfile | null;
  editMode: boolean;
  onSwitchGroup: (id: string) => void;
  onCreateGroup: () => void;
  onDeleteGroup: () => void;
  onRenameGroup: (name: string) => void;
  onToggleEditMode: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
}

const btn =
  "flex items-center gap-1.5 rounded-sm border border-stage-border bg-stage-surface2 px-2.5 py-1.5 text-xs font-medium text-white hover:border-white disabled:opacity-30 disabled:hover:border-stage-border";

export function Header({
  groups,
  currentGroup,
  editMode,
  onSwitchGroup,
  onCreateGroup,
  onDeleteGroup,
  onRenameGroup,
  onToggleEditMode,
  onExport,
  onImportFile,
}: HeaderProps) {
  const importInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-stage-border bg-stage-surface px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="rounded-sm border border-stage-border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.2em] text-stage-muted">
          STAGE SOUNDS
        </span>
        {editMode && (
          <>
            <div className="mx-1 h-6 w-px bg-stage-border" />
            <button onClick={onCreateGroup} className={btn} title="新しい団体を作成">
              <FolderPlus size={13} /> 新規団体
            </button>
            <button
              onClick={onDeleteGroup}
              disabled={!currentGroup}
              className="flex items-center gap-1 rounded-sm border border-stage-danger/50 bg-stage-danger/10 px-2.5 py-1.5 text-xs font-medium text-stage-danger hover:border-stage-danger disabled:opacity-30"
              title="この団体を削除"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>

      <div className="flex min-w-[16rem] items-center justify-center rounded-sm border border-stage-border bg-stage-bg px-6 py-1.5">
        {editMode ? (
          <input
            value={currentGroup?.groupName ?? ""}
            onChange={(e) => onRenameGroup(e.target.value)}
            placeholder="団体名"
            className="w-full bg-transparent text-center text-lg font-bold tracking-wide text-white outline-none placeholder:text-stage-muted"
          />
        ) : (
          <span className="text-lg font-bold tracking-wide text-white">{currentGroup?.groupName ?? "団体未読込"}</span>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <select
          value={currentGroup?.id ?? ""}
          onChange={(e) => onSwitchGroup(e.target.value)}
          className="rounded-sm border border-stage-border bg-stage-surface2 px-2 py-1.5 text-xs text-white outline-none focus:border-white"
        >
          {groups.length === 0 && <option value="">団体なし</option>}
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.groupName}
            </option>
          ))}
        </select>

        <button onClick={onExport} disabled={!currentGroup} className={btn} title="団体パッケージを書き出し (.stagepack)">
          <Download size={13} /> 書き出し
        </button>
        <button onClick={() => importInputRef.current?.click()} className={btn} title="団体パッケージを読み込み">
          <Upload size={13} /> 読み込み
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".stagepack,.zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportFile(file);
            e.target.value = "";
          }}
        />

        <button
          onClick={onToggleEditMode}
          className={`flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
            editMode ? "border-white bg-white text-black" : "border-stage-border bg-stage-surface2 text-white hover:border-white"
          }`}
          title="編集 / 編集完了の切り替え"
        >
          {editMode ? <Check size={14} /> : <Pencil size={14} />}
          {editMode ? "編集完了" : "編集"}
        </button>
      </div>
    </header>
  );
}
