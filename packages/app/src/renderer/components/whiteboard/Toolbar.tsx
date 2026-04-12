import { memo } from "react";
import {
  MousePointer2,
  StickyNote,
  Square,
  ArrowRight,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Undo2,
  Redo2,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StickyColor } from "../../../shared/whiteboard-types";
import {
  STICKY_COLORS,
  ALL_COLORS,
  FRAME_COLORS,
  TEXT_COLORS,
  TEXT_FONT_SIZES,
} from "./constants";

type Tool = "select" | "sticky" | "frame" | "connect" | "delete" | "text";

interface ToolbarProps {
  tool: Tool;
  stageScale: number;
  preCreationStickyColor: StickyColor;
  preCreationFrameColor: string;
  preCreationTextColor: string;
  preCreationTextSize: number;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: Tool) => void;
  onStickyColorChange: (color: StickyColor) => void;
  onFrameColorChange: (color: string) => void;
  onTextColorChange: (color: string) => void;
  onTextSizeChange: (size: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const TOOLS: [Tool, typeof MousePointer2, string][] = [
  ["select", MousePointer2, "Select"],
  ["sticky", StickyNote, "Sticky"],
  ["text", Type, "Text"],
  ["frame", Square, "Frame"],
  ["connect", ArrowRight, "Connect"],
  ["delete", Trash2, "Delete"],
];

export const Toolbar = memo(function Toolbar({
  tool,
  stageScale,
  preCreationStickyColor,
  preCreationFrameColor,
  preCreationTextColor,
  preCreationTextSize,
  canUndo,
  canRedo,
  onToolChange,
  onStickyColorChange,
  onFrameColorChange,
  onTextColorChange,
  onTextSizeChange,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onUndo,
  onRedo,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 bg-[#1e1e2e]/90 backdrop-blur border border-white/10 rounded-lg px-2 py-1.5 shadow-xl">
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className={cn(
          "p-1.5 rounded-md transition-colors",
          canUndo
            ? "text-white/60 hover:text-white/90 hover:bg-white/10"
            : "text-white/20 cursor-not-allowed",
        )}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={16} />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        className={cn(
          "p-1.5 rounded-md transition-colors",
          canRedo
            ? "text-white/60 hover:text-white/90 hover:bg-white/10"
            : "text-white/20 cursor-not-allowed",
        )}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 size={16} />
      </button>
      <div className="w-px h-5 bg-white/10 mx-1" />
      {TOOLS.map(([t, Icon, label]) => (
        <button
          key={t}
          onClick={() => onToolChange(t)}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            tool === t
              ? "bg-blue-500/30 text-blue-300"
              : "text-white/60 hover:text-white/90 hover:bg-white/10",
          )}
          title={label}
        >
          <Icon size={16} />
        </button>
      ))}

      {tool === "sticky" && (
        <>
          <div className="w-px h-5 bg-white/10 mx-1" />
          {ALL_COLORS.map((color) => (
            <button
              key={color}
              className={cn(
                "w-5 h-5 rounded-full border-2 transition-transform hover:scale-110",
                preCreationStickyColor === color
                  ? "border-white scale-110"
                  : "border-transparent",
              )}
              style={{ background: STICKY_COLORS[color] }}
              onClick={() => onStickyColorChange(color)}
              title={color}
            />
          ))}
        </>
      )}

      {tool === "frame" && (
        <>
          <div className="w-px h-5 bg-white/10 mx-1" />
          {FRAME_COLORS.map((color) => (
            <button
              key={color}
              className={cn(
                "w-5 h-5 rounded-full border-2 transition-transform hover:scale-110",
                preCreationFrameColor === color
                  ? "border-white scale-110"
                  : "border-transparent",
              )}
              style={{ background: color }}
              onClick={() => onFrameColorChange(color)}
              title={color}
            />
          ))}
        </>
      )}

      {tool === "text" && (
        <>
          <div className="w-px h-5 bg-white/10 mx-1" />
          {TEXT_FONT_SIZES.map((size) => (
            <button
              key={size}
              className={cn(
                "px-1.5 rounded text-xs font-mono transition-colors",
                preCreationTextSize === size
                  ? "bg-blue-500/30 text-blue-300"
                  : "text-white/50 hover:text-white/80 hover:bg-white/10",
              )}
              style={{ fontSize: Math.max(9, Math.min(size * 0.7, 13)) }}
              onClick={() => onTextSizeChange(size)}
              title={`${size}px`}
            >
              {size}
            </button>
          ))}
          <div className="w-px h-5 bg-white/10 mx-1" />
          {TEXT_COLORS.map((color) => (
            <button
              key={color}
              className={cn(
                "w-4 h-4 rounded-full border-2 transition-transform hover:scale-110",
                preCreationTextColor === color
                  ? "border-white scale-110"
                  : "border-transparent",
              )}
              style={{ background: color }}
              onClick={() => onTextColorChange(color)}
              title={color}
            />
          ))}
        </>
      )}

      <div className="w-px h-5 bg-white/10 mx-1" />
      <button
        onClick={onZoomOut}
        className="p-1.5 rounded-md text-white/60 hover:text-white/90 hover:bg-white/10"
        title="Zoom Out"
      >
        <ZoomOut size={16} />
      </button>
      <span className="text-xs text-white/40 min-w-[3ch] text-center">
        {Math.round(stageScale * 100)}%
      </span>
      <button
        onClick={onZoomIn}
        className="p-1.5 rounded-md text-white/60 hover:text-white/90 hover:bg-white/10"
        title="Zoom In"
      >
        <ZoomIn size={16} />
      </button>
      <button
        onClick={onFitToScreen}
        className="p-1.5 rounded-md text-white/60 hover:text-white/90 hover:bg-white/10"
        title="Fit to Screen"
      >
        <Maximize size={16} />
      </button>
    </div>
  );
});
