import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Arrow, Transformer } from 'react-konva';
import type Konva from 'konva';
import { Radio, Keyboard, Palette, Undo2, Redo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from '../contexts/settings';
import type { Board, StickyColor, BoardSummary } from '../../shared/whiteboard-types';

import { StickyNode } from './whiteboard/StickyNode';
import { FrameNode } from './whiteboard/FrameNode';
import { ConnectionArrow } from './whiteboard/ConnectionArrow';
import { GridLayer } from './whiteboard/GridLayer';
import { Toolbar } from './whiteboard/Toolbar';
import { BoardMenu } from './whiteboard/BoardMenu';
import { ContextMenus } from './whiteboard/ContextMenus';
import { ALL_COLORS, STICKY_COLORS, MIN_ZOOM, MAX_ZOOM, SHORTCUT_LABELS } from './whiteboard/constants';

type Tool = 'select' | 'sticky' | 'frame' | 'connect' | 'delete';
type WhiteboardPanelProps = { panelId: string };

export function WhiteboardPanel({ panelId: _panelId }: WhiteboardPanelProps) {
  // === REFS ===
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const middleMousePanning = useRef(false);
  const middleMouseLast = useRef({ x: 0, y: 0 });
  const stagePanRef = useRef({ x: 0, y: 0 });
  const viewportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartPositions = useRef<Record<string, { x: number; y: number }>>({});
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const justDragSelected = useRef(false);
  const frameDragStartPos = useRef<Record<string, { x: number; y: number }>>({});

  // === STATE ===
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectMousePos, setConnectMousePos] = useState<{ x: number; y: number } | null>(null);
  const [frameDrawing, setFrameDrawing] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingSticky, setEditingSticky] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editingFrame, setEditingFrame] = useState<string | null>(null);
  const [editFrameLabel, setEditFrameLabel] = useState('');
  const [contextMenu, setContextMenu] = useState<{ stickyId: string; x: number; y: number } | null>(null);
  const [frameContextMenu, setFrameContextMenu] = useState<{ frameId: string; x: number; y: number } | null>(null);
  const [connectionContextMenu, setConnectionContextMenu] = useState<{ connectionId: string; x: number; y: number; label: string } | null>(null);
  const [metadataEditor, setMetadataEditor] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [preCreationStickyColor, setPreCreationStickyColor] = useState<StickyColor>('yellow');
  const [preCreationFrameColor, setPreCreationFrameColor] = useState<string>('#e2e8f0');
  const [selectionRect, setSelectionRect] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [mcpRunning, setMcpRunning] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showColorLegend, setShowColorLegend] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const { settings } = useSettings();

  // === STATE REF — always current, lets stable callbacks read latest values ===
  const stateRef = useRef({
    tool, activeBoardId, board, selectedIds, stageScale, stageSize,
    connectFrom, preCreationStickyColor, preCreationFrameColor,
    editingSticky, editText, editingFrame, editFrameLabel, boards,
    frameDrawing, selectionRect,
  });
  stateRef.current = {
    tool, activeBoardId, board, selectedIds, stageScale, stageSize,
    connectFrom, preCreationStickyColor, preCreationFrameColor,
    editingSticky, editText, editingFrame, editFrameLabel, boards,
    frameDrawing, selectionRect,
  };

  // === EFFECTS ===

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setStageSize({ width: w, height: h });
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    window.electronAPI.whiteboard.listBoards().then(async (list: BoardSummary[]) => {
      if (list.length > 0) {
        setBoards(list);
        setActiveBoardId(list[0].id);
      } else {
        const b: Board = await window.electronAPI.whiteboard.createBoard('Board 1', null);
        setBoards([{ id: b.id, name: b.name, workspaceId: b.workspaceId, createdAt: b.createdAt, updatedAt: b.updatedAt }]);
        setActiveBoardId(b.id);
      }
    });
  }, []);

  useEffect(() => {
    if (!activeBoardId) return;
    window.electronAPI.whiteboard.getBoard(activeBoardId).then((b: Board | null) => {
      if (b) {
        setBoard(b);
        const newPos = { x: -b.viewport.x, y: -b.viewport.y };
        stagePanRef.current = newPos;
        setStagePos(newPos);
        setStageScale(b.viewport.zoom);
      }
    });
  }, [activeBoardId]);

  // Board IPC events — stable via stateRef
  useEffect(() => {
    const cleanupChanged = window.electronAPI.whiteboard.onBoardChanged((b: unknown) => {
      const updated = b as Board;
      if (updated.id === stateRef.current.activeBoardId) { setBoard(updated); refreshUndoRedo(); }
      setBoards((prev) =>
        prev.map((bs) =>
          bs.id === updated.id
            ? { id: updated.id, name: updated.name, workspaceId: updated.workspaceId, createdAt: updated.createdAt, updatedAt: updated.updatedAt }
            : bs,
        ),
      );
    });
    const cleanupDeleted = window.electronAPI.whiteboard.onBoardDeleted((deletedId: string) => {
      setBoards((prev) => prev.filter((bs) => bs.id !== deletedId));
      if (deletedId === stateRef.current.activeBoardId) {
        setActiveBoardId(null);
        setBoard(null);
      }
    });
    return () => { cleanupChanged(); cleanupDeleted(); };
  }, []);

  useEffect(() => {
    window.electronAPI.whiteboard.getMcpStatus().then((s: { running: boolean }) => {
      setMcpRunning(s.running);
    });
  }, []);

  // Middle mouse pan — imperative Konva update, no React re-render during drag
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        middleMousePanning.current = true;
        middleMouseLast.current = { x: e.clientX, y: e.clientY };
        container.style.cursor = 'grabbing';
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!middleMousePanning.current) return;
      const dx = e.clientX - middleMouseLast.current.x;
      const dy = e.clientY - middleMouseLast.current.y;
      middleMouseLast.current = { x: e.clientX, y: e.clientY };
      const newPos = { x: stagePanRef.current.x + dx, y: stagePanRef.current.y + dy };
      stagePanRef.current = newPos;
      const stage = stageRef.current;
      if (stage) { stage.position(newPos); stage.batchDraw(); }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 1) {
        middleMousePanning.current = false;
        container.style.cursor = '';
        const pos = stagePanRef.current;
        setStagePos({ ...pos });
        if (viewportTimerRef.current) clearTimeout(viewportTimerRef.current);
        viewportTimerRef.current = setTimeout(() => {
          const { activeBoardId, stageScale } = stateRef.current;
          if (activeBoardId) window.electronAPI.whiteboard.updateBoard(activeBoardId, { viewport: { x: -pos.x, y: -pos.y, zoom: stageScale } });
        }, 3000);
      }
    };
    const onContextMenu = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('contextmenu', onContextMenu);
    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  // Transformer: attach to selected nodes
  useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes: Konva.Node[] = [];
    for (const id of selectedIds) {
      const node = stage.findOne(`#${id}`);
      if (node) nodes.push(node);
    }
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, board]);

  // Keyboard shortcuts — stable via stateRef
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const { editingSticky, editingFrame, selectedIds, activeBoardId, board } = stateRef.current;

      // Undo: Ctrl+Z
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !editingSticky && !editingFrame) {
        e.preventDefault();
        if (activeBoardId) window.electronAPI.whiteboard.undo(activeBoardId);
        return;
      }
      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if (((e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) || (e.key === 'y' && (e.ctrlKey || e.metaKey))) && !editingSticky && !editingFrame) {
        e.preventDefault();
        if (activeBoardId) window.electronAPI.whiteboard.redo(activeBoardId);
        return;
      }

      if (e.key === 'Escape') {
        setTool('select');
        setConnectFrom(null);
        setConnectMousePos(null);
        setFrameDrawing(null);
        setSelectionRect(null);
        setContextMenu(null);
        setFrameContextMenu(null);
        setConnectionContextMenu(null);
        setMetadataEditor(null);
        setShowColorLegend(false);
        if (editingSticky && activeBoardId) {
          window.electronAPI.whiteboard.updateSticky(activeBoardId, editingSticky, { text: stateRef.current.editText });
          setEditingSticky(null);
          setEditText('');
        }
        setSelectedIds(new Set());
        return;
      }
      if (e.key === 'Delete' && selectedIds.size > 0 && activeBoardId && !editingSticky) {
        for (const id of selectedIds) {
          if (board?.stickies.some((s) => s.id === id)) window.electronAPI.whiteboard.deleteSticky(activeBoardId, id);
          else if (board?.frames.some((f) => f.id === id)) window.electronAPI.whiteboard.deleteFrame(activeBoardId, id);
          else if (board?.connections.some((c) => c.id === id)) window.electronAPI.whiteboard.disconnect(activeBoardId, id);
        }
        setSelectedIds(new Set());
        return;
      }
      if (e.key === 'a' && (e.ctrlKey || e.metaKey) && !editingSticky && !editingFrame) {
        e.preventDefault();
        if (board) {
          const all = new Set<string>();
          board.stickies.forEach((s) => all.add(s.id));
          board.frames.forEach((f) => all.add(f.id));
          setSelectedIds(all);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // === STABLE CALLBACKS (read from stateRef / stagePanRef) ===

  const persistViewport = useCallback((x: number, y: number, zoom: number) => {
    const { activeBoardId } = stateRef.current;
    if (!activeBoardId) return;
    if (viewportTimerRef.current) clearTimeout(viewportTimerRef.current);
    viewportTimerRef.current = setTimeout(() => {
      window.electronAPI.whiteboard.updateBoard(activeBoardId, { viewport: { x, y, zoom } });
    }, 3000);
  }, []);

  const screenToCanvas = useCallback((screenX: number, screenY: number) => ({
    x: (screenX - stagePanRef.current.x) / stateRef.current.stageScale,
    y: (screenY - stagePanRef.current.y) / stateRef.current.stageScale,
  }), []);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stateRef.current.stageScale;
    const pos = stagePanRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const dir = e.evt.deltaY < 0 ? 1 : -1;
    const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, dir > 0 ? oldScale * 1.08 : oldScale / 1.08));
    const mpt = { x: (pointer.x - pos.x) / oldScale, y: (pointer.y - pos.y) / oldScale };
    const newPos = { x: pointer.x - mpt.x * newScale, y: pointer.y - mpt.y * newScale };
    stagePanRef.current = newPos;
    setStageScale(newScale);
    setStagePos(newPos);
    persistViewport(-newPos.x, -newPos.y, newScale);
  }, [persistViewport]);

  const handleStageDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== stageRef.current) return;
    const newPos = { x: e.target.x(), y: e.target.y() };
    stagePanRef.current = newPos;
    setStagePos(newPos);
    persistViewport(-newPos.x, -newPos.y, stateRef.current.stageScale);
  }, [persistViewport]);

  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const isStage = e.target === stageRef.current;
    const { tool, activeBoardId, board, preCreationStickyColor } = stateRef.current;
    setContextMenu(null); setFrameContextMenu(null); setConnectionContextMenu(null);
    if (tool === 'sticky' && activeBoardId) {
      const clickedOnFrame = board?.frames.some((f) => f.id === e.target.id() || e.target.getParent()?.id() === f.id);
      if (isStage || clickedOnFrame) {
        const pos = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
        window.electronAPI.whiteboard.createSticky(activeBoardId, { x: pos.x, y: pos.y, color: preCreationStickyColor });
        setTool('select');
      }
      return;
    }
    if (!isStage) return;
    if (tool === 'connect') { setConnectFrom(null); setConnectMousePos(null); return; }
    if (tool === 'select') {
      if (justDragSelected.current) { justDragSelected.current = false; }
      else setSelectedIds(new Set());
    }
  }, [screenToCanvas]);

  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return;
    const { tool } = stateRef.current;
    if (tool === 'frame' && e.target === stageRef.current) {
      const pos = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
      setFrameDrawing({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y });
      return;
    }
    if (tool === 'select' && e.target === stageRef.current) {
      const pos = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
      setSelectionRect({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y });
    }
  }, [screenToCanvas]);

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const { tool, connectFrom, frameDrawing, selectionRect } = stateRef.current;
    if (tool === 'connect' && connectFrom) {
      setConnectMousePos(screenToCanvas(e.evt.offsetX, e.evt.offsetY));
    }
    if (tool === 'frame' && frameDrawing) {
      const pos = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
      setFrameDrawing((prev) => prev ? { ...prev, currentX: pos.x, currentY: pos.y } : null);
    }
    if (tool === 'select' && selectionRect) {
      const pos = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
      setSelectionRect((prev) => prev ? { ...prev, currentX: pos.x, currentY: pos.y } : null);
    }
  }, [screenToCanvas]);

  const handleStageMouseUp = useCallback(() => {
    const { tool, frameDrawing, selectionRect, activeBoardId, board, preCreationFrameColor } = stateRef.current;
    if (tool === 'frame' && frameDrawing && activeBoardId) {
      const x = Math.min(frameDrawing.startX, frameDrawing.currentX);
      const y = Math.min(frameDrawing.startY, frameDrawing.currentY);
      const width = Math.abs(frameDrawing.currentX - frameDrawing.startX);
      const height = Math.abs(frameDrawing.currentY - frameDrawing.startY);
      if (width > 20 && height > 20) {
        window.electronAPI.whiteboard.createFrame(activeBoardId, {
          label: `Frame ${(board?.frames.length ?? 0) + 1}`, x, y, width, height, color: preCreationFrameColor,
        });
      }
      setFrameDrawing(null);
      setTool('select');
    }
    if (tool === 'select' && selectionRect && board) {
      const rx = Math.min(selectionRect.startX, selectionRect.currentX);
      const ry = Math.min(selectionRect.startY, selectionRect.currentY);
      const rw = Math.abs(selectionRect.currentX - selectionRect.startX);
      const rh = Math.abs(selectionRect.currentY - selectionRect.startY);
      if (rw > 5 || rh > 5) {
        const newSelected = new Set<string>();
        for (const s of board.stickies) {
          if (s.x + s.width > rx && s.x < rx + rw && s.y + s.height > ry && s.y < ry + rh) newSelected.add(s.id);
        }
        for (const f of board.frames) {
          if (f.x + f.width > rx && f.x < rx + rw && f.y + f.height > ry && f.y < ry + rh) newSelected.add(f.id);
        }
        setSelectedIds(newSelected);
        justDragSelected.current = true;
      }
      setSelectionRect(null);
    }
  }, []);

  const handleTransformEnd = useCallback((e: Konva.KonvaEventObject<Event>) => {
    const { activeBoardId, board } = stateRef.current;
    if (!activeBoardId || !board) return;
    const node = e.target;
    const id = node.id();
    const scaleX = node.scaleX(); const scaleY = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    const sticky = board.stickies.find((s) => s.id === id);
    if (sticky) {
      window.electronAPI.whiteboard.updateSticky(activeBoardId, id, { x: node.x(), y: node.y(), width: Math.max(80, sticky.width * scaleX), height: Math.max(60, sticky.height * scaleY) });
      return;
    }
    const frame = board.frames.find((f) => f.id === id);
    if (frame) {
      window.electronAPI.whiteboard.updateFrame(activeBoardId, id, { x: node.x(), y: node.y(), width: Math.max(80, frame.width * scaleX), height: Math.max(60, frame.height * scaleY) });
    }
  }, []);

  const handleStickyDragStart = useCallback((stickyId: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const { selectedIds } = stateRef.current;
    if (selectedIds.size > 1 && selectedIds.has(stickyId)) {
      const stage = stageRef.current;
      if (!stage) return;
      dragStartPositions.current = {};
      dragOrigin.current = { x: e.target.x(), y: e.target.y() };
      for (const id of selectedIds) {
        if (id === stickyId) continue;
        const node = stage.findOne(`#${id}`);
        if (node) dragStartPositions.current[id] = { x: node.x(), y: node.y() };
      }
    }
  }, []);

  const handleStickyDragMove = useCallback((stickyId: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const { selectedIds } = stateRef.current;
    if (selectedIds.size > 1 && selectedIds.has(stickyId) && dragOrigin.current) {
      const stage = stageRef.current;
      if (!stage) return;
      const dx = e.target.x() - dragOrigin.current.x;
      const dy = e.target.y() - dragOrigin.current.y;
      for (const [id, startPos] of Object.entries(dragStartPositions.current)) {
        const node = stage.findOne(`#${id}`);
        if (node) { node.x(startPos.x + dx); node.y(startPos.y + dy); }
      }
    }
  }, []);

  const handleStickyDragEnd = useCallback((stickyId: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const { activeBoardId, board, selectedIds } = stateRef.current;
    if (!activeBoardId || !board) return;
    if (selectedIds.size > 1 && selectedIds.has(stickyId) && dragOrigin.current) {
      const dx = e.target.x() - dragOrigin.current.x;
      const dy = e.target.y() - dragOrigin.current.y;
      for (const id of selectedIds) {
        const sticky = board.stickies.find((s) => s.id === id);
        if (sticky) {
          const newX = id === stickyId ? e.target.x() : sticky.x + dx;
          const newY = id === stickyId ? e.target.y() : sticky.y + dy;
          const cx = newX + sticky.width / 2; const cy = newY + sticky.height / 2;
          let newFrameId: string | null = null;
          for (const frame of board.frames) {
            if (cx >= frame.x && cx <= frame.x + frame.width && cy >= frame.y && cy <= frame.y + frame.height) { newFrameId = frame.id; break; }
          }
          window.electronAPI.whiteboard.updateSticky(activeBoardId, id, { x: newX, y: newY, frameId: newFrameId });
        }
        const frame = board.frames.find((f) => f.id === id);
        if (frame) {
          window.electronAPI.whiteboard.updateFrame(activeBoardId, id, { x: frame.x + dx, y: frame.y + dy });
          for (const s of board.stickies) {
            if (s.frameId === id && !selectedIds.has(s.id)) window.electronAPI.whiteboard.updateSticky(activeBoardId, s.id, { x: s.x + dx, y: s.y + dy });
          }
        }
      }
      dragOrigin.current = null; dragStartPositions.current = {};
      return;
    }
    const newX = e.target.x(); const newY = e.target.y();
    const stk = board.stickies.find((s) => s.id === stickyId);
    const cx = newX + (stk?.width ?? 200) / 2; const cy = newY + (stk?.height ?? 150) / 2;
    let newFrameId: string | null = null;
    for (const frame of board.frames) {
      if (cx >= frame.x && cx <= frame.x + frame.width && cy >= frame.y && cy <= frame.y + frame.height) { newFrameId = frame.id; break; }
    }
    window.electronAPI.whiteboard.updateSticky(activeBoardId, stickyId, { x: newX, y: newY, frameId: newFrameId });
  }, []);

  const handleFrameDragStart = useCallback((frameId: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const { selectedIds } = stateRef.current;
    frameDragStartPos.current = { [frameId]: { x: e.target.x(), y: e.target.y() } };
    if (selectedIds.size > 1 && selectedIds.has(frameId)) {
      const stage = stageRef.current;
      if (!stage) return;
      dragOrigin.current = { x: e.target.x(), y: e.target.y() };
      dragStartPositions.current = {};
      for (const id of selectedIds) {
        if (id === frameId) continue;
        const node = stage.findOne(`#${id}`);
        if (node) dragStartPositions.current[id] = { x: node.x(), y: node.y() };
      }
    }
  }, []);

  const handleFrameDragMove = useCallback((frameId: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const { selectedIds } = stateRef.current;
    if (selectedIds.size > 1 && selectedIds.has(frameId) && dragOrigin.current) {
      const stage = stageRef.current;
      if (!stage) return;
      const dx = e.target.x() - dragOrigin.current.x;
      const dy = e.target.y() - dragOrigin.current.y;
      for (const [id, startPos] of Object.entries(dragStartPositions.current)) {
        const node = stage.findOne(`#${id}`);
        if (node) { node.x(startPos.x + dx); node.y(startPos.y + dy); }
      }
    }
  }, []);

  const handleFrameDragEnd = useCallback((frameId: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const { activeBoardId, board, selectedIds } = stateRef.current;
    if (!activeBoardId || !board) return;
    if (selectedIds.size > 1 && selectedIds.has(frameId) && dragOrigin.current) {
      const dx = e.target.x() - dragOrigin.current.x;
      const dy = e.target.y() - dragOrigin.current.y;
      for (const id of selectedIds) {
        const sticky = board.stickies.find((s) => s.id === id);
        if (sticky) window.electronAPI.whiteboard.updateSticky(activeBoardId, id, { x: sticky.x + dx, y: sticky.y + dy });
        const frame = board.frames.find((f) => f.id === id);
        if (frame) {
          const newX = id === frameId ? e.target.x() : frame.x + dx;
          const newY = id === frameId ? e.target.y() : frame.y + dy;
          window.electronAPI.whiteboard.updateFrame(activeBoardId, id, { x: newX, y: newY });
          for (const s of board.stickies) {
            if (s.frameId === id && !selectedIds.has(s.id)) window.electronAPI.whiteboard.updateSticky(activeBoardId, s.id, { x: s.x + dx, y: s.y + dy });
          }
        }
      }
      dragOrigin.current = null; dragStartPositions.current = {};
      return;
    }
    const startPos = frameDragStartPos.current[frameId];
    if (!startPos) return;
    const dx = e.target.x() - startPos.x; const dy = e.target.y() - startPos.y;
    window.electronAPI.whiteboard.updateFrame(activeBoardId, frameId, { x: e.target.x(), y: e.target.y() });
    for (const sticky of board.stickies) {
      if (sticky.frameId === frameId) window.electronAPI.whiteboard.updateSticky(activeBoardId, sticky.id, { x: sticky.x + dx, y: sticky.y + dy });
    }
  }, []);

  const handleStickyClick = useCallback((stickyId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    const { tool, activeBoardId, connectFrom } = stateRef.current;
    if (tool === 'connect' && activeBoardId) {
      if (!connectFrom) { setConnectFrom(stickyId); }
      else if (connectFrom !== stickyId) {
        window.electronAPI.whiteboard.connect(activeBoardId, connectFrom, stickyId);
        setConnectFrom(null); setConnectMousePos(null);
      }
    } else if (tool === 'delete' && activeBoardId) {
      window.electronAPI.whiteboard.deleteSticky(activeBoardId, stickyId);
    } else if (tool === 'select') {
      if (e.evt.shiftKey) {
        setSelectedIds((prev) => { const next = new Set(prev); if (next.has(stickyId)) next.delete(stickyId); else next.add(stickyId); return next; });
      } else {
        setSelectedIds(new Set([stickyId]));
      }
    }
  }, []);

  const handleStickyDblClick = useCallback((stickyId: string) => {
    const sticky = stateRef.current.board?.stickies.find((s) => s.id === stickyId);
    if (sticky) { setEditingSticky(sticky.id); setEditText(sticky.text); }
  }, []);

  const handleStickyContextMenu = useCallback((stickyId: string, e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    setFrameContextMenu(null);
    setContextMenu({ stickyId, x: e.evt.clientX, y: e.evt.clientY });
  }, []);

  const handleFrameClick = useCallback((frameId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    const { tool, activeBoardId } = stateRef.current;
    if (tool === 'delete' && activeBoardId) { window.electronAPI.whiteboard.deleteFrame(activeBoardId, frameId); }
    else if (tool === 'select') {
      if (e.evt.shiftKey) {
        setSelectedIds((prev) => { const next = new Set(prev); if (next.has(frameId)) next.delete(frameId); else next.add(frameId); return next; });
      } else {
        setSelectedIds(new Set([frameId]));
      }
    }
  }, []);

  const handleFrameDblClick = useCallback((frameId: string) => {
    const frame = stateRef.current.board?.frames.find((f) => f.id === frameId);
    if (frame) { setEditingFrame(frameId); setEditFrameLabel(frame.label); }
  }, []);

  const handleFrameContextMenu = useCallback((frameId: string, e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    setContextMenu(null);
    setFrameContextMenu({ frameId, x: e.evt.clientX, y: e.evt.clientY });
  }, []);

  const handleConnectionClick = useCallback((connectionId: string) => {
    const { tool, activeBoardId } = stateRef.current;
    if (tool === 'delete' && activeBoardId) window.electronAPI.whiteboard.disconnect(activeBoardId, connectionId);
  }, []);

  const handleConnectionContextMenu = useCallback((connectionId: string, label: string | null, e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    setContextMenu(null); setFrameContextMenu(null);
    setConnectionContextMenu({ connectionId, x: e.evt.clientX, y: e.evt.clientY, label: label ?? '' });
  }, []);

  const finishEditing = useCallback(() => {
    const { editingSticky, activeBoardId, editText } = stateRef.current;
    if (editingSticky && activeBoardId) window.electronAPI.whiteboard.updateSticky(activeBoardId, editingSticky, { text: editText });
    setEditingSticky(null); setEditText('');
  }, []);

  const finishFrameEditing = useCallback(() => {
    const { editingFrame, activeBoardId, editFrameLabel } = stateRef.current;
    if (editingFrame && activeBoardId && editFrameLabel.trim()) window.electronAPI.whiteboard.updateFrame(activeBoardId, editingFrame, { label: editFrameLabel.trim() });
    setEditingFrame(null); setEditFrameLabel('');
  }, []);

  const handleCreateBoard = useCallback(() => {
    const { boards } = stateRef.current;
    window.electronAPI.whiteboard.createBoard(`Board ${boards.length + 1}`, null).then((b: Board) => {
      setBoards((prev) => [...prev, { id: b.id, name: b.name, workspaceId: b.workspaceId, createdAt: b.createdAt, updatedAt: b.updatedAt }]);
      setActiveBoardId(b.id);
      setBoardMenuOpen(false);
    });
  }, []);

  const handleDeleteBoard = useCallback((boardId: string) => {
    const { activeBoardId, boards } = stateRef.current;
    window.electronAPI.whiteboard.deleteBoard(boardId);
    setBoards((prev) => prev.filter((b) => b.id !== boardId));
    if (boardId === activeBoardId) {
      const remaining = boards.filter((b) => b.id !== boardId);
      setActiveBoardId(remaining[0]?.id ?? null);
    }
    setBoardMenuOpen(false);
  }, []);

  const handleRenameBoard = useCallback((boardId: string, name: string) => {
    window.electronAPI.whiteboard.updateBoard(boardId, { name });
    setBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, name } : b)));
    setRenamingBoardId(null);
  }, []);

  const handleExportBoard = useCallback(async (boardId: string, boardName: string) => {
    const data = await window.electronAPI.whiteboard.getBoard(boardId);
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${boardName.replace(/[^a-z0-9]/gi, '_')}.board.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportBoard = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const b: Board = await window.electronAPI.whiteboard.importBoard(data);
        setBoards((prev) => [...prev, { id: b.id, name: b.name, workspaceId: b.workspaceId, createdAt: b.createdAt, updatedAt: b.updatedAt }]);
        setActiveBoardId(b.id);
        setBoardMenuOpen(false);
      } catch { /* ignore malformed */ }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleToggleMcp = useCallback(async () => {
    if (mcpRunning) {
      await window.electronAPI.whiteboard.stopMcpServer();
      setMcpRunning(false);
    } else {
      const port = settings.whiteboard?.mcpPort ?? 3100;
      const result = await window.electronAPI.whiteboard.startMcpServer(port);
      if ((result as { success: boolean }).success) setMcpRunning(true);
    }
  }, [mcpRunning, settings]);

  const handleToolChange = useCallback((newTool: Tool) => {
    setTool(newTool); setConnectFrom(null); setConnectMousePos(null);
  }, []);

  const zoomIn = useCallback(() => {
    const { stageScale, stageSize } = stateRef.current;
    const newScale = Math.min(MAX_ZOOM, stageScale * 1.3);
    const center = { x: stageSize.width / 2, y: stageSize.height / 2 };
    const mpt = { x: (center.x - stagePanRef.current.x) / stageScale, y: (center.y - stagePanRef.current.y) / stageScale };
    const newPos = { x: center.x - mpt.x * newScale, y: center.y - mpt.y * newScale };
    stagePanRef.current = newPos; setStageScale(newScale); setStagePos(newPos);
    persistViewport(-newPos.x, -newPos.y, newScale);
  }, [persistViewport]);

  const zoomOut = useCallback(() => {
    const { stageScale, stageSize } = stateRef.current;
    const newScale = Math.max(MIN_ZOOM, stageScale / 1.3);
    const center = { x: stageSize.width / 2, y: stageSize.height / 2 };
    const mpt = { x: (center.x - stagePanRef.current.x) / stageScale, y: (center.y - stagePanRef.current.y) / stageScale };
    const newPos = { x: center.x - mpt.x * newScale, y: center.y - mpt.y * newScale };
    stagePanRef.current = newPos; setStageScale(newScale); setStagePos(newPos);
    persistViewport(-newPos.x, -newPos.y, newScale);
  }, [persistViewport]);

  const fitToScreen = useCallback(() => {
    const { board, stageSize } = stateRef.current;
    if (!board || board.stickies.length === 0) {
      stagePanRef.current = { x: 0, y: 0 }; setStagePos({ x: 0, y: 0 }); setStageScale(1); persistViewport(0, 0, 1); return;
    }
    const items = [...board.stickies.map((s) => ({ x: s.x, y: s.y, w: s.width, h: s.height })), ...board.frames.map((f) => ({ x: f.x, y: f.y, w: f.width, h: f.height }))];
    const minX = Math.min(...items.map((i) => i.x)); const minY = Math.min(...items.map((i) => i.y));
    const maxX = Math.max(...items.map((i) => i.x + i.w)); const maxY = Math.max(...items.map((i) => i.y + i.h));
    const cW = maxX - minX + 100; const cH = maxY - minY + 100;
    const newScale = Math.min(stageSize.width / cW, stageSize.height / cH, 2);
    const newPos = { x: (stageSize.width - cW * newScale) / 2 - minX * newScale + 50 * newScale, y: (stageSize.height - cH * newScale) / 2 - minY * newScale + 50 * newScale };
    stagePanRef.current = newPos; setStageScale(newScale); setStagePos(newPos);
    persistViewport(-newPos.x, -newPos.y, newScale);
  }, [persistViewport]);

  // Undo/redo helpers
  const refreshUndoRedo = useCallback(async () => {
    const { activeBoardId } = stateRef.current;
    if (!activeBoardId) { setCanUndo(false); setCanRedo(false); return; }
    const [u, r] = await Promise.all([
      window.electronAPI.whiteboard.canUndo(activeBoardId),
      window.electronAPI.whiteboard.canRedo(activeBoardId),
    ]);
    setCanUndo(u); setCanRedo(r);
  }, []);

  const handleUndo = useCallback(async () => {
    const { activeBoardId } = stateRef.current;
    if (!activeBoardId) return;
    await window.electronAPI.whiteboard.undo(activeBoardId);
    refreshUndoRedo();
  }, [refreshUndoRedo]);

  const handleRedo = useCallback(async () => {
    const { activeBoardId } = stateRef.current;
    if (!activeBoardId) return;
    await window.electronAPI.whiteboard.redo(activeBoardId);
    refreshUndoRedo();
  }, [refreshUndoRedo]);

  // Context menu action handlers (stable)
  const handleStickyColorChange = useCallback((stickyId: string, color: string) => {
    const { activeBoardId } = stateRef.current;
    if (activeBoardId) window.electronAPI.whiteboard.updateSticky(activeBoardId, stickyId, { color: color as StickyColor });
    setContextMenu(null);
  }, []);
  const handleStickyDelete = useCallback((stickyId: string) => {
    const { activeBoardId } = stateRef.current;
    if (activeBoardId) window.electronAPI.whiteboard.deleteSticky(activeBoardId, stickyId);
    setContextMenu(null);
  }, []);
  const handleStickyEditMetadata = useCallback((stickyId: string) => { setMetadataEditor(stickyId); setContextMenu(null); }, []);
  const handleFrameColorChange = useCallback((frameId: string, color: string) => {
    const { activeBoardId } = stateRef.current;
    if (activeBoardId) window.electronAPI.whiteboard.updateFrame(activeBoardId, frameId, { color });
    setFrameContextMenu(null);
  }, []);
  const handleFrameRename = useCallback((frameId: string) => {
    const frame = stateRef.current.board?.frames.find((f) => f.id === frameId);
    if (frame) { setEditingFrame(frameId); setEditFrameLabel(frame.label); }
    setFrameContextMenu(null);
  }, []);
  const handleFrameDelete = useCallback((frameId: string) => {
    const { activeBoardId } = stateRef.current;
    if (activeBoardId) window.electronAPI.whiteboard.deleteFrame(activeBoardId, frameId);
    setFrameContextMenu(null);
  }, []);
  const handleConnectionLabelChange = useCallback((label: string) => {
    setConnectionContextMenu((prev) => prev ? { ...prev, label } : null);
  }, []);
  const handleConnectionLabelSave = useCallback((connectionId: string, label: string) => {
    const { activeBoardId } = stateRef.current;
    if (activeBoardId) window.electronAPI.whiteboard.updateConnection(activeBoardId, connectionId, { label: label || null });
    setConnectionContextMenu(null);
  }, []);
  const handleConnectionDelete = useCallback((connectionId: string) => {
    const { activeBoardId } = stateRef.current;
    if (activeBoardId) window.electronAPI.whiteboard.disconnect(activeBoardId, connectionId);
    setConnectionContextMenu(null);
  }, []);
  const handleMetadataKeyChange = useCallback((stickyId: string, index: number, newKey: string) => {
    const { activeBoardId, board } = stateRef.current;
    if (!activeBoardId || !board) return;
    const sticky = board.stickies.find((s) => s.id === stickyId);
    if (!sticky) return;
    const entries = Object.entries(sticky.metadata ?? {});
    const [oldKey, value] = entries[index] ?? [null, ''];
    if (oldKey === null) return;
    const newMeta = { ...sticky.metadata }; delete newMeta[oldKey]; newMeta[newKey] = value as string;
    window.electronAPI.whiteboard.updateSticky(activeBoardId, stickyId, { metadata: newMeta });
  }, []);
  const handleMetadataValueChange = useCallback((stickyId: string, index: number, newValue: string) => {
    const { activeBoardId, board } = stateRef.current;
    if (!activeBoardId || !board) return;
    const sticky = board.stickies.find((s) => s.id === stickyId);
    if (!sticky) return;
    const [key] = Object.entries(sticky.metadata ?? {})[index] ?? [null];
    if (key === null) return;
    window.electronAPI.whiteboard.updateSticky(activeBoardId, stickyId, { metadata: { ...(sticky.metadata ?? {}), [key]: newValue } });
  }, []);
  const handleMetadataRemove = useCallback((stickyId: string, key: string) => {
    const { activeBoardId, board } = stateRef.current;
    if (!activeBoardId || !board) return;
    const sticky = board.stickies.find((s) => s.id === stickyId);
    if (!sticky) return;
    const newMeta = { ...(sticky.metadata ?? {}) }; delete newMeta[key];
    window.electronAPI.whiteboard.updateSticky(activeBoardId, stickyId, { metadata: newMeta });
  }, []);
  const handleMetadataAdd = useCallback((stickyId: string) => {
    const { activeBoardId, board } = stateRef.current;
    if (!activeBoardId || !board) return;
    const sticky = board.stickies.find((s) => s.id === stickyId);
    if (!sticky) return;
    window.electronAPI.whiteboard.updateSticky(activeBoardId, stickyId, { metadata: { ...(sticky.metadata ?? {}), '': '' } });
  }, []);

  // === COMPUTED ===
  const stickyMap = useMemo(() => new Map(board?.stickies.map((s) => [s.id, s]) ?? []), [board]);
  const isDraggable = tool === 'select';
  const connectFromSticky = connectFrom ? board?.stickies.find((s) => s.id === connectFrom) : null;

  const editingTextareaStyle = useMemo(() => {
    if (!editingSticky || !board) return null;
    const sticky = board.stickies.find((s) => s.id === editingSticky);
    if (!sticky) return null;
    return {
      position: 'absolute' as const, left: sticky.x * stageScale + stagePos.x, top: sticky.y * stageScale + stagePos.y,
      width: sticky.width * stageScale, height: sticky.height * stageScale, fontSize: 14 * stageScale,
      padding: 8 * stageScale, border: 'none', outline: '2px solid #3b82f6',
      background: STICKY_COLORS[sticky.color], resize: 'none' as const, zIndex: 50,
      borderRadius: 8 * stageScale, fontFamily: "'Inter Variable', 'Inter', system-ui, sans-serif",
      fontWeight: 500, lineHeight: '1.4', color: '#1e293b',
    };
  }, [editingSticky, board, stageScale, stagePos]);

  const editingFrameLabelStyle = useMemo(() => {
    if (!editingFrame || !board) return null;
    const frame = board.frames.find((f) => f.id === editingFrame);
    if (!frame) return null;
    return {
      position: 'absolute' as const, left: frame.x * stageScale + stagePos.x,
      top: frame.y * stageScale + stagePos.y - 28 * stageScale, width: Math.min(frame.width * stageScale, 300),
      height: 24 * stageScale, fontSize: 13 * stageScale, padding: `2px ${6 * stageScale}px`,
      border: 'none', outline: `2px solid ${frame.color}`, background: '#1e1e2e', color: frame.color,
      fontWeight: 'bold', zIndex: 50, borderRadius: 4, fontFamily: "'Inter Variable', 'Inter', system-ui, sans-serif",
    };
  }, [editingFrame, board, stageScale, stagePos]);

  const cursorClass = tool === 'sticky' || tool === 'frame' ? 'cursor-crosshair' : tool === 'connect' || tool === 'delete' ? 'cursor-pointer' : 'cursor-default';

  // === RENDER ===
  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full overflow-hidden bg-[#1a1a2e] font-['Inter_Variable','Inter',system-ui,sans-serif]", cursorClass)}
      onClick={() => { setContextMenu(null); setFrameContextMenu(null); setConnectionContextMenu(null); }}
    >
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        draggable={tool === 'connect'}
        onWheel={handleWheel}
        onDragEnd={handleStageDragEnd}
        onClick={handleStageClick}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
      >
        <GridLayer stagePosRef={stagePanRef} stageScale={stageScale} stageSize={stageSize} />
        <Layer>
          {board?.frames.map((frame) => (
            <FrameNode
              key={frame.id}
              frame={frame}
              isSelected={selectedIds.has(frame.id)}
              isDraggable={isDraggable}
              onClick={handleFrameClick}
              onDblClick={handleFrameDblClick}
              onDragStart={handleFrameDragStart}
              onDragMove={handleFrameDragMove}
              onDragEnd={handleFrameDragEnd}
              onContextMenu={handleFrameContextMenu}
              onTransformEnd={handleTransformEnd}
            />
          ))}

          {frameDrawing && (
            <Rect
              x={Math.min(frameDrawing.startX, frameDrawing.currentX)}
              y={Math.min(frameDrawing.startY, frameDrawing.currentY)}
              width={Math.abs(frameDrawing.currentX - frameDrawing.startX)}
              height={Math.abs(frameDrawing.currentY - frameDrawing.startY)}
              fill={(preCreationFrameColor || '#e2e8f0') + '15'}
              stroke={preCreationFrameColor || '#e2e8f0'}
              strokeWidth={2} dash={[8, 4]} cornerRadius={8} listening={false}
            />
          )}

          {board?.connections.map((conn) => {
            const from = stickyMap.get(conn.fromStickyId);
            const to = stickyMap.get(conn.toStickyId);
            if (!from || !to) return null;
            return (
              <ConnectionArrow
                key={conn.id}
                conn={conn}
                fromSticky={from}
                toSticky={to}
                onClick={handleConnectionClick}
                onContextMenu={handleConnectionContextMenu}
              />
            );
          })}

          {connectFromSticky && connectMousePos && (
            <Arrow
              points={[connectFromSticky.x + connectFromSticky.width / 2, connectFromSticky.y + connectFromSticky.height / 2, connectMousePos.x, connectMousePos.y]}
              pointerLength={10} pointerWidth={8} fill="#60a5fa" stroke="#60a5fa" strokeWidth={2} dash={[6, 3]} listening={false}
            />
          )}

          {board?.stickies.map((sticky) => (
            <StickyNode
              key={sticky.id}
              sticky={sticky}
              isSelected={selectedIds.has(sticky.id)}
              isConnectFrom={connectFrom === sticky.id}
              isEditing={editingSticky === sticky.id}
              isDraggable={isDraggable}
              onClick={handleStickyClick}
              onDblClick={handleStickyDblClick}
              onDragStart={handleStickyDragStart}
              onDragMove={handleStickyDragMove}
              onDragEnd={handleStickyDragEnd}
              onContextMenu={handleStickyContextMenu}
              onTransformEnd={handleTransformEnd}
            />
          ))}

          {selectionRect && (
            <Rect
              x={Math.min(selectionRect.startX, selectionRect.currentX)}
              y={Math.min(selectionRect.startY, selectionRect.currentY)}
              width={Math.abs(selectionRect.currentX - selectionRect.startX)}
              height={Math.abs(selectionRect.currentY - selectionRect.startY)}
              fill="rgba(59, 130, 246, 0.08)" stroke="#3b82f6" strokeWidth={1} dash={[4, 4]} listening={false}
            />
          )}

          <Transformer
            ref={transformerRef}
            borderStroke="#3b82f6" borderStrokeWidth={1.5}
            anchorSize={8} anchorStroke="#3b82f6" anchorFill="white" anchorCornerRadius={2}
            rotateEnabled={false}
            enabledAnchors={selectedIds.size === 1 ? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center'] : []}
            boundBoxFunc={(_oldBox, newBox) => (newBox.width < 60 || newBox.height < 40 ? _oldBox : newBox)}
          />
        </Layer>
      </Stage>

      {editingSticky && editingTextareaStyle && (
        <textarea
          autoFocus
          style={editingTextareaStyle}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={finishEditing}
          onKeyDown={(e) => { if (e.key === 'Escape') finishEditing(); e.stopPropagation(); }}
        />
      )}

      {editingFrame && editingFrameLabelStyle && (
        <input
          autoFocus
          style={editingFrameLabelStyle}
          value={editFrameLabel}
          onChange={(e) => setEditFrameLabel(e.target.value)}
          onBlur={finishFrameEditing}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finishFrameEditing();
            if (e.key === 'Escape') { setEditingFrame(null); setEditFrameLabel(''); }
            e.stopPropagation();
          }}
        />
      )}

      <Toolbar
        tool={tool}
        stageScale={stageScale}
        preCreationStickyColor={preCreationStickyColor}
        preCreationFrameColor={preCreationFrameColor}
        canUndo={canUndo}
        canRedo={canRedo}
        onToolChange={handleToolChange}
        onStickyColorChange={setPreCreationStickyColor}
        onFrameColorChange={setPreCreationFrameColor}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitToScreen={fitToScreen}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      <BoardMenu
        boards={boards}
        activeBoardId={activeBoardId}
        boardMenuOpen={boardMenuOpen}
        renamingBoardId={renamingBoardId}
        renameValue={renameValue}
        importFileRef={importFileRef}
        onToggleMenu={() => setBoardMenuOpen((p) => !p)}
        onSelectBoard={(id) => { setActiveBoardId(id); setBoardMenuOpen(false); }}
        onStartRename={(id, name) => { setRenamingBoardId(id); setRenameValue(name); }}
        onRenameChange={setRenameValue}
        onRenameCommit={handleRenameBoard}
        onRenameCancel={() => setRenamingBoardId(null)}
        onDeleteBoard={handleDeleteBoard}
        onExportBoard={handleExportBoard}
        onCreateBoard={handleCreateBoard}
        onImportClick={() => importFileRef.current?.click()}
        onImportFile={handleImportBoard}
      />

      <div className="absolute top-3 right-3 z-10">
        <button
          onClick={handleToggleMcp}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e2e]/90 backdrop-blur border border-white/10 rounded-lg text-sm shadow-xl transition-colors',
            mcpRunning ? 'text-green-300 border-green-500/30' : 'text-white/50 hover:text-white/80',
          )}
          title={mcpRunning ? 'Stop MCP Server' : 'Start MCP Server'}
        >
          <Radio size={14} />
          {mcpRunning ? 'MCP' : 'MCP Off'}
        </button>
      </div>

      <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-1">
        {showShortcuts && (
          <div className="bg-[#1e1e2e]/90 backdrop-blur border border-white/10 rounded-lg px-3 py-2.5 shadow-xl">
            <div className="text-[11px] text-white/50 space-y-1">
              {SHORTCUT_LABELS.map(([label, shortcut]) => (
                <div key={label} className="flex gap-3">
                  <span className="text-white/30 w-24 shrink-0">{label}</span>
                  <span>{shortcut}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {showColorLegend && (
          <div className="bg-[#1e1e2e]/95 backdrop-blur border border-white/10 rounded-lg shadow-xl p-3 min-w-70" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-1.5">
              {ALL_COLORS.map((color) => (
                <div key={color} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full shrink-0 border border-white/10" style={{ background: STICKY_COLORS[color] }} />
                  <input
                    className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 outline-none focus:border-white/30 placeholder:text-white/25"
                    placeholder="No meaning set"
                    value={board?.colorMeanings?.[color] ?? ''}
                    onChange={(e) => {
                      if (!activeBoardId || !board) return;
                      const newMeanings = { ...(board.colorMeanings ?? {}) };
                      if (e.target.value) { newMeanings[color] = e.target.value; } else { delete newMeanings[color]; }
                      window.electronAPI.whiteboard.updateBoard(activeBoardId, { colorMeanings: newMeanings });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowColorLegend((p) => !p)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e2e]/90 backdrop-blur border border-white/10 rounded-lg text-sm shadow-xl transition-colors', showColorLegend ? 'text-purple-300 border-purple-500/30' : 'text-white/50 hover:text-white/80')}
            title="Color Legend"
          >
            <Palette size={14} />
            Legend
          </button>
          <button
            onClick={() => setShowShortcuts((p) => !p)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e2e]/90 backdrop-blur border border-white/10 rounded-lg text-sm shadow-xl transition-colors', showShortcuts ? 'text-blue-300 border-blue-500/30' : 'text-white/50 hover:text-white/80')}
            title="Keyboard shortcuts"
          >
            <Keyboard size={14} />
            Shortcuts
          </button>
        </div>
      </div>

      <ContextMenus
        board={board}
        contextMenu={contextMenu}
        frameContextMenu={frameContextMenu}
        connectionContextMenu={connectionContextMenu}
        metadataEditor={metadataEditor}
        stagePos={stagePos}
        stageScale={stageScale}
        onCloseStickyMenu={() => setContextMenu(null)}
        onCloseFrameMenu={() => setFrameContextMenu(null)}
        onCloseConnectionMenu={() => setConnectionContextMenu(null)}
        onCloseMetadata={() => setMetadataEditor(null)}
        onConnectionLabelChange={handleConnectionLabelChange}
        onStickyColorChange={handleStickyColorChange}
        onStickyDelete={handleStickyDelete}
        onStickyEditMetadata={handleStickyEditMetadata}
        onFrameColorChange={handleFrameColorChange}
        onFrameRename={handleFrameRename}
        onFrameDelete={handleFrameDelete}
        onConnectionLabelSave={handleConnectionLabelSave}
        onConnectionDelete={handleConnectionDelete}
        onMetadataKeyChange={handleMetadataKeyChange}
        onMetadataValueChange={handleMetadataValueChange}
        onMetadataRemove={handleMetadataRemove}
        onMetadataAdd={handleMetadataAdd}
      />
    </div>
  );
}
