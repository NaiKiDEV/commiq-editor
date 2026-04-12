import type { StickyColor } from "../../../shared/whiteboard-types";

export const STICKY_COLORS: Record<StickyColor, string> = {
  yellow: "#fef08a",
  blue:   "#bfdbfe",
  green:  "#bbf7d0",
  pink:   "#fbcfe8",
  purple: "#ddd6fe",
  orange: "#fed7aa",
  red:    "#fecaca",
};

export const STICKY_BORDER_COLORS: Record<StickyColor, string> = {
  yellow: "#eab308",
  blue:   "#3b82f6",
  green:  "#22c55e",
  pink:   "#ec4899",
  purple: "#8b5cf6",
  orange: "#f97316",
  red:    "#ef4444",
};

export const ALL_COLORS: StickyColor[] = [
  "yellow",
  "blue",
  "green",
  "pink",
  "purple",
  "orange",
  "red",
];

export const TEXT_COLORS = [
  "#ffffff",
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#4ade80",
  "#60a5fa",
  "#c084fc",
  "#f9a8d4",
  "#94a3b8",
];

export const TEXT_FONT_SIZES = [12, 14, 16, 20, 24, 32, 48];

export const FRAME_COLORS = [
  "#e2e8f0",
  "#93c5fd",
  "#86efac",
  "#fef08a",
  "#f9a8d4",
  "#c4b5fd",
  "#fb923c",
  "#f87171",
];

export const SHORTCUT_LABELS = [
  ["Undo", "Ctrl+Z"],
  ["Redo", "Ctrl+Shift+Z"],
  ["Pan", "Two-finger scroll / Middle mouse"],
  ["Zoom", "Pinch / Ctrl+scroll"],
  ["Multi-select", "Shift+click / drag"],
  ["Select all", "Ctrl+A"],
  ["Duplicate", "Ctrl+D"],
  ["Delete", "Del key"],
  ["Resize", "Select item → drag handles"],
  ["Colors", "Right-click item"],
  ["Edit text", "Double-click sticky / text"],
  ["Rename frame", "Double-click frame"],
];

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;
export const GRID_SIZE = 40;
