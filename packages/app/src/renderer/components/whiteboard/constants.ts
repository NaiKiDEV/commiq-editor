import type { StickyColor } from '../../../shared/whiteboard-types';

export const STICKY_COLORS: Record<StickyColor, string> = {
  yellow: '#fef08a',
  blue: '#93c5fd',
  green: '#86efac',
  pink: '#f9a8d4',
  purple: '#c4b5fd',
  orange: '#fb923c',
  red: '#f87171',
};

export const STICKY_BORDER_COLORS: Record<StickyColor, string> = {
  yellow: '#eab308',
  blue: '#3b82f6',
  green: '#22c55e',
  pink: '#ec4899',
  purple: '#8b5cf6',
  orange: '#ea580c',
  red: '#ef4444',
};

export const ALL_COLORS: StickyColor[] = ['yellow', 'blue', 'green', 'pink', 'purple', 'orange', 'red'];

export const FRAME_COLORS = [
  '#e2e8f0', '#93c5fd', '#86efac', '#fef08a',
  '#f9a8d4', '#c4b5fd', '#fb923c', '#f87171',
];

export const SHORTCUT_LABELS = [
  ['Undo', 'Ctrl+Z'],
  ['Redo', 'Ctrl+Shift+Z'],
  ['Pan', 'Middle mouse button'],
  ['Multi-select', 'Shift+click / drag'],
  ['Select all', 'Ctrl+A'],
  ['Delete', 'Del key'],
  ['Resize', 'Select item → drag handles'],
  ['Colors', 'Right-click item'],
  ['Edit text', 'Double-click sticky'],
  ['Rename frame', 'Double-click frame'],
];

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;
export const GRID_SIZE = 40;
