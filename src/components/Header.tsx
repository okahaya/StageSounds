import { useRef } from "react";
import { Download, FolderPlus, Lock, OctagonX, Trash2, Unlock, Upload } from "lucide-react";
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
  onPanic: () => void;
}

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
  onPanic,
}: HeaderProps) {
  const importInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-stage-border bg-stage-panel px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="rounded bg-stage-accent px-2 py-1 font-mono text-sm font-black text-black">STAGE</span>
        <span className="font-mono text-sm font-bold tracking-widest text-gray-300">SOUNDS</span>
      </div>

      <div className="mx-2 h-6 w-px bg-stage-border" />

      {editMode ? (
        <input
          value={currentGroup?.groupName ?? ""}
          onChange={(e) => onRenameGroup(e.target.value)}
          placeholder="団体名"
          className="rounded-md border border-stage-border bg-stage-panel2 px-3 py-1.5 text-sm font-semibold text-white outline-none focus:border-stage-accent2"
        />
      ) : (
        <span className="px-1 text-sm font-semibold text-gray-100">{currentGroup?.groupName ?? "未読込"}</span>
      )}

      <select
        value={currentGroup?.id ?? ""}
        onChange={(e) => onSwitchGroup(e.target.value)}
        className="rounded-md border border-stage-border bg-stage-panel2 px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-stage-accent2"
      >
        {groups.length === 0 && <option value="">団体なし</option>}
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.groupName}
          </option>
        ))}
      </select>

      {editMode && (
        <>
          <button
            onClick={onCreateGroup}
            className="flex items-center gap-1 rounded-md bg-stage-panel2 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-white/10"
            title="新しい団体を作成"
          >
            <FolderPlus size={14} /> 新規団体
          </button>
          <button
            onClick={onDeleteGroup}
            disabled={!currentGroup}
            className="flex items-center gap-1 rounded-md bg-stage-danger/15 px-2.5 py-1.5 text-xs text-stage-danger hover:bg-stage-danger/25 disabled:opacity-40"
            title="この団体を削除"
          >
            <Trash2 size={14} />
          </button>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onExport}
          disabled={!currentGroup}
          className="flex items-center gap-1.5 rounded-md bg-stage-panel2 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-40"
          title="団体パッケージを書き出し (.stagepack)"
        >
          <Download size={15} /> 書き出し
        </button>
        <button
          onClick={() => importInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-md bg-stage-panel2 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/10"
          title="団体パッケージを読み込み"
        >
          <Upload size={15} /> 読み込み
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
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${
            editMode ? "bg-stage-accent2/20 text-stage-accent2" : "bg-stage-success/20 text-stage-success"
          }`}
          title="編集モード / 本番プレイモードの切り替え"
        >
          {editMode ? <Unlock size={15} /> : <Lock size={15} />}
          {editMode ? "編集モード" : "プレイモード"}
        </button>

        <button
          onClick={onPanic}
          className="flex items-center gap-1.5 rounded-md bg-stage-danger px-3 py-1.5 text-sm font-bold text-white hover:bg-stage-danger/80"
          title="緊急停止 (Space / Esc)"
        >
          <OctagonX size={16} /> PANIC STOP
        </button>
      </div>
    </header>
  );
}
