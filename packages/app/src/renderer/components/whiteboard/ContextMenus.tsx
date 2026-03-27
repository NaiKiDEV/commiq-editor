import { memo } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Board } from '../../../shared/whiteboard-types';
import { STICKY_COLORS, ALL_COLORS, FRAME_COLORS } from './constants';

interface StickyCtx { stickyId: string; x: number; y: number }
interface FrameCtx { frameId: string; x: number; y: number }
interface ConnectionCtx { connectionId: string; x: number; y: number; label: string }

interface ContextMenusProps {
  board: Board | null;
  contextMenu: StickyCtx | null;
  frameContextMenu: FrameCtx | null;
  connectionContextMenu: ConnectionCtx | null;
  metadataEditor: string | null;
  stagePos: { x: number; y: number };
  stageScale: number;
  onCloseStickyMenu: () => void;
  onCloseFrameMenu: () => void;
  onCloseConnectionMenu: () => void;
  onCloseMetadata: () => void;
  onConnectionLabelChange: (label: string) => void;
  onStickyColorChange: (stickyId: string, color: string) => void;
  onStickyDelete: (stickyId: string) => void;
  onStickyEditMetadata: (stickyId: string) => void;
  onFrameColorChange: (frameId: string, color: string) => void;
  onFrameRename: (frameId: string) => void;
  onFrameDelete: (frameId: string) => void;
  onConnectionLabelSave: (connectionId: string, label: string) => void;
  onConnectionDelete: (connectionId: string) => void;
  onMetadataKeyChange: (stickyId: string, index: number, newKey: string) => void;
  onMetadataValueChange: (stickyId: string, index: number, newValue: string) => void;
  onMetadataRemove: (stickyId: string, key: string) => void;
  onMetadataAdd: (stickyId: string) => void;
}

export const ContextMenus = memo(function ContextMenus({
  board,
  contextMenu, frameContextMenu, connectionContextMenu, metadataEditor,
  stagePos, stageScale,
  onCloseStickyMenu, onCloseFrameMenu, onCloseConnectionMenu, onCloseMetadata,
  onConnectionLabelChange,
  onStickyColorChange, onStickyDelete, onStickyEditMetadata,
  onFrameColorChange, onFrameRename, onFrameDelete,
  onConnectionLabelSave, onConnectionDelete,
  onMetadataKeyChange, onMetadataValueChange, onMetadataRemove, onMetadataAdd,
}: ContextMenusProps) {
  return (
    <>
      {/* Sticky context menu */}
      {contextMenu && (
        <div
          className="absolute z-50 bg-[#1e1e2e] border border-white/10 rounded-lg shadow-xl overflow-hidden py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 space-y-1">
            <div className="flex items-center gap-2">
              {ALL_COLORS.map((color) => {
                const currentColor = board?.stickies.find((s) => s.id === contextMenu.stickyId)?.color;
                return (
                  <button
                    key={color}
                    className={cn(
                      'w-5 h-5 rounded-full border-2 transition-transform hover:scale-110',
                      currentColor === color ? 'border-white scale-110' : 'border-transparent',
                    )}
                    style={{ background: STICKY_COLORS[color] }}
                    onClick={() => onStickyColorChange(contextMenu.stickyId, color)}
                    title={board?.colorMeanings?.[color] ? `${color}: ${board.colorMeanings[color]}` : color}
                  />
                );
              })}
            </div>
            {board?.colorMeanings && (() => {
              const currentColor = board.stickies.find((s) => s.id === contextMenu.stickyId)?.color;
              const meaning = currentColor ? board.colorMeanings[currentColor] : undefined;
              return meaning ? <div className="text-[10px] text-white/40 truncate">{meaning}</div> : null;
            })()}
          </div>
          <div className="h-px bg-white/10" />
          <button
            className="w-full px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/5 text-left"
            onClick={() => onStickyEditMetadata(contextMenu.stickyId)}
          >
            Edit Metadata
          </button>
          <button
            className="w-full px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 text-left"
            onClick={() => onStickyDelete(contextMenu.stickyId)}
          >
            Delete
          </button>
        </div>
      )}

      {/* Frame context menu */}
      {frameContextMenu && (
        <div
          className="absolute z-50 bg-[#1e1e2e] border border-white/10 rounded-lg shadow-xl overflow-hidden py-1 min-w-[160px]"
          style={{ left: frameContextMenu.x, top: frameContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
            {FRAME_COLORS.map((color) => {
              const currentColor = board?.frames.find((f) => f.id === frameContextMenu.frameId)?.color;
              return (
                <button
                  key={color}
                  className={cn(
                    'w-5 h-5 rounded-full border-2 transition-transform hover:scale-110',
                    currentColor === color ? 'border-white scale-110' : 'border-transparent',
                  )}
                  style={{ background: color }}
                  onClick={() => onFrameColorChange(frameContextMenu.frameId, color)}
                />
              );
            })}
          </div>
          <div className="h-px bg-white/10" />
          <button
            className="w-full px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/5 text-left"
            onClick={() => onFrameRename(frameContextMenu.frameId)}
          >
            Rename
          </button>
          <button
            className="w-full px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 text-left"
            onClick={() => onFrameDelete(frameContextMenu.frameId)}
          >
            Delete
          </button>
        </div>
      )}

      {/* Connection context menu */}
      {connectionContextMenu && (
        <div
          className="absolute z-50 bg-[#1e1e2e] border border-white/10 rounded-lg shadow-xl overflow-hidden py-1 min-w-[200px]"
          style={{ left: connectionContextMenu.x, top: connectionContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2">
            <div className="text-[11px] text-white/40 mb-1">Connection label</div>
            <input
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 outline-none focus:border-white/30"
              placeholder="No label"
              value={connectionContextMenu.label}
              onChange={(e) => onConnectionLabelChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConnectionLabelSave(connectionContextMenu.connectionId, connectionContextMenu.label);
                if (e.key === 'Escape') onCloseConnectionMenu();
                e.stopPropagation();
              }}
            />
            <button
              className="mt-1.5 w-full px-2 py-1 text-xs bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 rounded"
              onClick={() => onConnectionLabelSave(connectionContextMenu.connectionId, connectionContextMenu.label)}
            >
              Save label
            </button>
          </div>
          <div className="h-px bg-white/10" />
          <button
            className="w-full px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 text-left"
            onClick={() => onConnectionDelete(connectionContextMenu.connectionId)}
          >
            Delete
          </button>
        </div>
      )}

      {/* Metadata editor */}
      {metadataEditor && board && (() => {
        const sticky = board.stickies.find((s) => s.id === metadataEditor);
        if (!sticky) return null;
        const entries = Object.entries(sticky.metadata ?? {});
        return (
          <div
            className="absolute z-50 bg-[#1e1e2e] border border-white/10 rounded-lg shadow-xl p-3 min-w-[280px]"
            style={{
              left: sticky.x * stageScale + stagePos.x + sticky.width * stageScale + 8,
              top: sticky.y * stageScale + stagePos.y,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white/80 font-medium">Metadata</span>
              <button onClick={onCloseMetadata} className="text-white/40 hover:text-white/80">
                <X size={14} />
              </button>
            </div>
            {entries.map(([key, value], index) => (
              <div key={index} className="flex items-center gap-1.5 mb-1.5">
                <input
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 outline-none focus:border-white/30"
                  placeholder="key"
                  value={key}
                  onChange={(e) => onMetadataKeyChange(metadataEditor, index, e.target.value)}
                />
                <input
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 outline-none focus:border-white/30"
                  placeholder="value"
                  value={value as string}
                  onChange={(e) => onMetadataValueChange(metadataEditor, index, e.target.value)}
                />
                <button
                  className="text-white/40 hover:text-red-400"
                  onClick={() => onMetadataRemove(metadataEditor, key)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              className="mt-1 w-full px-2 py-1 text-xs bg-white/5 text-white/50 hover:text-white/80 rounded"
              onClick={() => onMetadataAdd(metadataEditor)}
            >
              + Add field
            </button>
          </div>
        );
      })()}
    </>
  );
});
