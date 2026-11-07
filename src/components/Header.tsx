import { useEffect, useRef, useState } from "react";
import { Check, Download, FolderPlus, MoreHorizontal, Pencil, RotateCcw, Trash2, Upload } from "lucide-react";
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
  onRestartAudio: () => void;
  /** 再生中は団体の切替・作成・削除を禁止する(誤操作で本番中の音が止まるのを防ぐ)。 */
  groupSwitchLocked: boolean;
}

const btn =
  "flex h-8 items-center gap-1.5 rounded border border-stage-border bg-stage-surface px-3 text-sm text-stage-fg hover:bg-stage-fg/5 disabled:pointer-events-none disabled:opacity-40";

/** クリック後にフォーカスが残ると、以後のキー入力(Space 等)がボタンに吸われるため外す。 */
function blurActive() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

function MenuItem({ icon, label, onClick, disabled, danger }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-stage-fg/10 disabled:pointer-events-none disabled:opacity-40 ${
        danger ? "text-stage-danger" : "text-stage-fg"
      }`}
    >
      {icon}
      {label}
    </button>
  );
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
  onRestartAudio,
  groupSwitchLocked,
}: HeaderProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const closeOnKey = () => setMenuOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeOnKey);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", closeOnKey);
    };
  }, [menuOpen]);

  function runMenu(action: () => void) {
    setMenuOpen(false);
    blurActive();
    action();
  }

  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-stage-border px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-stage-muted">音響くん</span>
        <select
          value={currentGroup?.id ?? ""}
          onChange={(e) => {
            onSwitchGroup(e.target.value);
            // フォーカスが残ると、以後のキー入力でセレクトの選択が変わってしまうため外す。
            e.target.blur();
          }}
          disabled={groupSwitchLocked}
          title={groupSwitchLocked ? "Stop playback to switch groups" : "Switch group"}
          className="h-8 max-w-[12rem] rounded border border-stage-border bg-stage-surface px-2 text-sm text-stage-fg outline-none focus:border-stage-muted disabled:opacity-40"
        >
          {groups.length === 0 && <option value="">No groups</option>}
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.groupName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-[16rem] justify-center">
        {editMode ? (
          <input
            value={currentGroup?.groupName ?? ""}
            onChange={(e) => onRenameGroup(e.target.value)}
            placeholder="Group name"
            className="w-full rounded border border-stage-border bg-stage-surface px-3 py-1 text-center text-lg font-semibold text-stage-fg outline-none placeholder:text-stage-muted focus:border-stage-muted"
          />
        ) : (
          <span className="truncate text-lg font-semibold text-stage-fg">{currentGroup?.groupName ?? ""}</span>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => {
            blurActive();
            onToggleEditMode();
          }}
          className={
            editMode
              ? "flex h-8 items-center gap-1.5 rounded bg-stage-fg px-3 text-sm font-medium text-stage-bg hover:bg-stage-fg/90"
              : btn
          }
        >
          {editMode ? <Check size={14} /> : <Pencil size={14} />}
          {editMode ? "Done" : "Edit"}
        </button>

        <div ref={menuRef} className="relative">
          <button
            onClick={() => {
              blurActive();
              setMenuOpen((v) => !v);
            }}
            className={`${btn} px-2`}
            aria-label="More"
            title="More"
          >
            <MoreHorizontal size={16} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-md border border-stage-border bg-stage-surface p-1 shadow-xl">
              <MenuItem icon={<Upload size={14} />} label="Import…" onClick={() => runMenu(() => importInputRef.current?.click())} />
              <MenuItem icon={<Download size={14} />} label="Export" disabled={!currentGroup} onClick={() => runMenu(onExport)} />
              <div className="my-1 h-px bg-stage-border" />
              <MenuItem icon={<FolderPlus size={14} />} label="New group" disabled={groupSwitchLocked} onClick={() => runMenu(onCreateGroup)} />
              <MenuItem
                icon={<Trash2 size={14} />}
                label="Delete group"
                danger
                disabled={!currentGroup || groupSwitchLocked}
                onClick={() => runMenu(onDeleteGroup)}
              />
              <div className="my-1 h-px bg-stage-border" />
              {/* 出力機器の抜き差し後は "running" のまま無音になることがあるため、手動で再起動できるようにする。 */}
              <MenuItem icon={<RotateCcw size={14} />} label="Restart audio" disabled={groupSwitchLocked} onClick={() => runMenu(onRestartAudio)} />
            </div>
          )}
        </div>

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
      </div>
    </header>
  );
}
