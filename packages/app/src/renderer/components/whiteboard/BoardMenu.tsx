import { memo } from 'react';
import { ChevronDown, Plus, Pencil, X, Download, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BoardSummary, Board } from '../../../shared/whiteboard-types';

interface BoardMenuProps {
  boards: BoardSummary[];
  activeBoardId: string | null;
  boardMenuOpen: boolean;
  renamingBoardId: string | null;
  renameValue: string;
  importFileRef: React.RefObject<HTMLInputElement | null>;
  onToggleMenu: () => void;
  onSelectBoard: (id: string) => void;
  onStartRename: (id: string, name: string) => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: (id: string, name: string) => void;
  onRenameCancel: () => void;
  onDeleteBoard: (id: string) => void;
  onExportBoard: (id: string, name: string) => void;
  onCreateBoard: () => void;
  onImportClick: () => void;
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const BoardMenu = memo(function BoardMenu({
  boards, activeBoardId, boardMenuOpen, renamingBoardId, renameValue, importFileRef,
  onToggleMenu, onSelectBoard, onStartRename, onRenameChange, onRenameCommit,
  onRenameCancel, onDeleteBoard, onExportBoard, onCreateBoard, onImportClick, onImportFile,
}: BoardMenuProps) {
  const activeBoardName = boards.find((b) => b.id === activeBoardId)?.name ?? 'No Board';

  return (
    <div className="absolute top-3 left-3 z-10">
      <button
        onClick={onToggleMenu}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e2e]/90 backdrop-blur border border-white/10 rounded-lg text-sm text-white/80 hover:text-white shadow-xl"
      >
        {activeBoardName}
        <ChevronDown size={14} />
      </button>
      {boardMenuOpen && (
        <div className="absolute top-full mt-1 left-0 min-w-[320px] bg-[#1e1e2e] border border-white/10 rounded-lg shadow-xl overflow-hidden">
          {boards.map((b) => (
            <div
              key={b.id}
              className={cn(
                'flex items-center justify-between px-3 py-2 text-sm hover:bg-white/5 cursor-pointer',
                b.id === activeBoardId ? 'text-blue-300 bg-blue-500/10' : 'text-white/70',
              )}
            >
              {renamingBoardId === b.id ? (
                <input
                  autoFocus
                  className="bg-transparent border-b border-white/30 text-white text-sm outline-none flex-1 mr-2"
                  value={renameValue}
                  onChange={(e) => onRenameChange(e.target.value)}
                  onBlur={() => onRenameCommit(b.id, renameValue)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onRenameCommit(b.id, renameValue);
                    if (e.key === 'Escape') onRenameCancel();
                  }}
                />
              ) : (
                <span className="flex-1" onClick={() => onSelectBoard(b.id)}>
                  {b.name}
                </span>
              )}
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onExportBoard(b.id, b.name); }}
                  className="p-0.5 text-white/40 hover:text-white/80"
                  title="Export board"
                >
                  <Download size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onStartRename(b.id, b.name); }}
                  className="p-0.5 text-white/40 hover:text-white/80"
                >
                  <Pencil size={12} />
                </button>
                {boards.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteBoard(b.id); }}
                    className="p-0.5 text-white/40 hover:text-red-400"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <div
            className="flex items-center gap-2 px-3 py-2 text-sm text-white/50 hover:text-white/80 hover:bg-white/5 cursor-pointer border-t border-white/10"
            onClick={onCreateBoard}
          >
            <Plus size={14} />
            New Board
          </div>
          <div
            className="flex items-center gap-2 px-3 py-2 text-sm text-white/50 hover:text-white/80 hover:bg-white/5 cursor-pointer"
            onClick={onImportClick}
          >
            <Upload size={14} />
            Import Board
          </div>
          <input
            ref={importFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={onImportFile}
          />
        </div>
      )}
    </div>
  );
});
