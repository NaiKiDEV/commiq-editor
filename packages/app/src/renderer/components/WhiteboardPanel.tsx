import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { Stage, Layer, Rect, Text, Group, Arrow, Shape, Circle } from 'react-konva';
import type Konva from 'konva';
import {
  MousePointer2,
  StickyNote,
  Square,
  ArrowRight,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize,
  ChevronDown,
  Plus,
  Pencil,
  X,
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from '../contexts/settings';
import type {
  Board,
  Sticky,
  Frame,
  Connection,
  StickyColor,
  BoardSummary,
} from '../../shared/whiteboard-types';

// --- Constants ---

const STICKY_COLORS: Record<StickyColor, string> = {
  yellow: '#fef08a',
  blue: '#93c5fd',
  green: '#86efac',
  pink: '#f9a8d4',
  purple: '#c4b5fd',
};

const STICKY_BORDER_COLORS: Record<StickyColor, string> = {
  yellow: '#eab308',
  blue: '#3b82f6',
  green: '#22c55e',
  pink: '#ec4899',
  purple: '#8b5cf6',
};

const ALL_COLORS: StickyColor[] = ['yellow', 'blue', 'green', 'pink', 'purple'];

type Tool = 'select' | 'sticky' | 'frame' | 'connect' | 'delete';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const GRID_SIZE = 40;

type WhiteboardPanelProps = { panelId: string };

export function WhiteboardPanel({ panelId: _panelId }: WhiteboardPanelProps) {
  // --- Stage size ---
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const stageRef = useRef<Konva.Stage>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setStageSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setStageSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // --- Board state ---
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);

  // --- Tool state ---
  const [tool, setTool] = useState<Tool>('select');
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectMousePos, setConnectMousePos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // --- Frame drawing state ---
  const [frameDrawing, setFrameDrawing] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // --- Pan/Zoom state ---
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);

  // --- Viewport persistence ---
  const viewportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistViewport = useCallback(
    (x: number, y: number, zoom: number) => {
      if (!activeBoardId) return;
      if (viewportTimerRef.current) clearTimeout(viewportTimerRef.current);
      viewportTimerRef.current = setTimeout(() => {
        window.electronAPI.whiteboard.updateBoard(activeBoardId, {
          viewport: { x, y, zoom },
        });
      }, 3000);
    },
    [activeBoardId],
  );

  // --- UI state ---
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingSticky, setEditingSticky] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editingFrame, setEditingFrame] = useState<string | null>(null);
  const [editFrameLabel, setEditFrameLabel] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    stickyId: string;
    x: number;
    y: number;
  } | null>(null);
  const [metadataEditor, setMetadataEditor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // --- MCP state ---
  const { settings } = useSettings();
  const [mcpRunning, setMcpRunning] = useState(false);

  // --- Load boards on mount ---
  useEffect(() => {
    window.electronAPI.whiteboard.listBoards().then((list: BoardSummary[]) => {
      setBoards(list);
      if (list.length > 0) {
        setActiveBoardId(list[0].id);
      }
    });
  }, []);

  // --- Auto-create board if none exist ---
  useEffect(() => {
    if (boards.length === 0) {
      window.electronAPI.whiteboard
        .createBoard('Board 1', null)
        .then((b: Board) => {
          setBoards([
            {
              id: b.id,
              name: b.name,
              workspaceId: b.workspaceId,
              createdAt: b.createdAt,
              updatedAt: b.updatedAt,
            },
          ]);
          setActiveBoardId(b.id);
        });
    }
  }, [boards.length]);

  // --- Load active board ---
  useEffect(() => {
    if (!activeBoardId) return;
    window.electronAPI.whiteboard
      .getBoard(activeBoardId)
      .then((b: Board | null) => {
        if (b) {
          setBoard(b);
          setStagePos({ x: -b.viewport.x, y: -b.viewport.y });
          setStageScale(b.viewport.zoom);
        }
      });
  }, [activeBoardId]);

  // --- Subscribe to live updates ---
  useEffect(() => {
    const cleanupChanged = window.electronAPI.whiteboard.onBoardChanged(
      (b: unknown) => {
        const updated = b as Board;
        if (updated.id === activeBoardId) {
          setBoard(updated);
        }
        setBoards((prev) =>
          prev.map((bs) =>
            bs.id === updated.id
              ? {
                  id: updated.id,
                  name: updated.name,
                  workspaceId: updated.workspaceId,
                  createdAt: updated.createdAt,
                  updatedAt: updated.updatedAt,
                }
              : bs,
          ),
        );
      },
    );
    const cleanupDeleted = window.electronAPI.whiteboard.onBoardDeleted(
      (deletedId: string) => {
        setBoards((prev) => prev.filter((bs) => bs.id !== deletedId));
        if (deletedId === activeBoardId) {
          setActiveBoardId(null);
          setBoard(null);
        }
      },
    );
    return () => {
      cleanupChanged();
      cleanupDeleted();
    };
  }, [activeBoardId]);

  // --- Check MCP status on mount ---
  useEffect(() => {
    window.electronAPI.whiteboard.getMcpStatus().then((s: { running: boolean }) => {
      setMcpRunning(s.running);
    });
  }, []);

  // --- Helpers ---

  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      return {
        x: (screenX - stagePos.x) / stageScale,
        y: (screenY - stagePos.y) / stageScale,
      };
    },
    [stagePos, stageScale],
  );

  // --- Zoom ---

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const oldScale = stageScale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const direction = e.evt.deltaY < 0 ? 1 : -1;
      const factor = 1.08;
      const newScale = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, direction > 0 ? oldScale * factor : oldScale / factor),
      );
      const mousePointTo = {
        x: (pointer.x - stagePos.x) / oldScale,
        y: (pointer.y - stagePos.y) / oldScale,
      };
      const newPos = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      };
      setStageScale(newScale);
      setStagePos(newPos);
      persistViewport(-newPos.x, -newPos.y, newScale);
    },
    [stageScale, stagePos, persistViewport],
  );

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      if (e.target !== stageRef.current) return;
      const newPos = { x: e.target.x(), y: e.target.y() };
      setStagePos(newPos);
      persistViewport(-newPos.x, -newPos.y, stageScale);
    },
    [stageScale, persistViewport],
  );

  // --- Stage click (create sticky, frame start, etc.) ---

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Only handle clicks on the stage itself (empty canvas)
      if (e.target !== stageRef.current) return;

      setContextMenu(null);
      setSelectedId(null);

      if (tool === 'sticky' && activeBoardId) {
        const pos = screenToCanvas(
          e.evt.offsetX,
          e.evt.offsetY,
        );
        window.electronAPI.whiteboard.createSticky(activeBoardId, {
          x: pos.x,
          y: pos.y,
        });
        setTool('select');
      }

      if (tool === 'connect') {
        setConnectFrom(null);
        setConnectMousePos(null);
      }
    },
    [tool, activeBoardId, screenToCanvas],
  );

  // --- Frame drawing ---

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (tool !== 'frame') return;
      if (e.target !== stageRef.current) return;
      const pos = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
      setFrameDrawing({
        startX: pos.x,
        startY: pos.y,
        currentX: pos.x,
        currentY: pos.y,
      });
    },
    [tool, screenToCanvas],
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (tool === 'connect' && connectFrom) {
        const pos = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
        setConnectMousePos(pos);
      }
      if (tool === 'frame' && frameDrawing) {
        const pos = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
        setFrameDrawing((prev) =>
          prev ? { ...prev, currentX: pos.x, currentY: pos.y } : null,
        );
      }
    },
    [tool, connectFrom, frameDrawing, screenToCanvas],
  );

  const handleStageMouseUp = useCallback(() => {
    if (tool === 'frame' && frameDrawing && activeBoardId) {
      const x = Math.min(frameDrawing.startX, frameDrawing.currentX);
      const y = Math.min(frameDrawing.startY, frameDrawing.currentY);
      const width = Math.abs(frameDrawing.currentX - frameDrawing.startX);
      const height = Math.abs(frameDrawing.currentY - frameDrawing.startY);
      if (width > 20 && height > 20) {
        const label = `Frame ${(board?.frames.length ?? 0) + 1}`;
        window.electronAPI.whiteboard.createFrame(activeBoardId, {
          label,
          x,
          y,
          width,
          height,
        });
      }
      setFrameDrawing(null);
      setTool('select');
    }
  }, [tool, frameDrawing, activeBoardId, board?.frames.length]);

  // --- Sticky drag ---

  const handleStickyDragEnd = useCallback(
    (stickyId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      if (!activeBoardId || !board) return;
      const newX = e.target.x();
      const newY = e.target.y();

      // Check frame containment
      const stickyCenterX = newX + (board.stickies.find((s) => s.id === stickyId)?.width ?? 200) / 2;
      const stickyCenterY = newY + (board.stickies.find((s) => s.id === stickyId)?.height ?? 150) / 2;
      let newFrameId: string | null = null;
      for (const frame of board.frames) {
        if (
          stickyCenterX >= frame.x &&
          stickyCenterX <= frame.x + frame.width &&
          stickyCenterY >= frame.y &&
          stickyCenterY <= frame.y + frame.height
        ) {
          newFrameId = frame.id;
          break;
        }
      }

      window.electronAPI.whiteboard.updateSticky(activeBoardId, stickyId, {
        x: newX,
        y: newY,
        frameId: newFrameId,
      });
    },
    [activeBoardId, board],
  );

  // --- Frame drag (move contained stickies too) ---

  const frameDragStartPos = useRef<Record<string, { x: number; y: number }>>({});

  const handleFrameDragStart = useCallback(
    (frameId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      frameDragStartPos.current = {};
      frameDragStartPos.current[frameId] = { x: e.target.x(), y: e.target.y() };
    },
    [],
  );

  const handleFrameDragEnd = useCallback(
    (frameId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      if (!activeBoardId || !board) return;
      const startPos = frameDragStartPos.current[frameId];
      if (!startPos) return;
      const dx = e.target.x() - startPos.x;
      const dy = e.target.y() - startPos.y;

      window.electronAPI.whiteboard.updateFrame(activeBoardId, frameId, {
        x: e.target.x(),
        y: e.target.y(),
      });

      // Move contained stickies
      for (const sticky of board.stickies) {
        if (sticky.frameId === frameId) {
          window.electronAPI.whiteboard.updateSticky(
            activeBoardId,
            sticky.id,
            { x: sticky.x + dx, y: sticky.y + dy },
          );
        }
      }
    },
    [activeBoardId, board],
  );

  // --- Connect tool ---

  const handleStickyClick = useCallback(
    (stickyId: string) => {
      if (tool === 'connect' && activeBoardId) {
        if (!connectFrom) {
          setConnectFrom(stickyId);
        } else if (connectFrom !== stickyId) {
          window.electronAPI.whiteboard.connect(
            activeBoardId,
            connectFrom,
            stickyId,
          );
          setConnectFrom(null);
          setConnectMousePos(null);
        }
      } else if (tool === 'delete' && activeBoardId) {
        window.electronAPI.whiteboard.deleteSticky(activeBoardId, stickyId);
      } else if (tool === 'select') {
        setSelectedId(stickyId);
      }
    },
    [tool, activeBoardId, connectFrom],
  );

  const handleFrameClick = useCallback(
    (frameId: string) => {
      if (tool === 'delete' && activeBoardId) {
        window.electronAPI.whiteboard.deleteFrame(activeBoardId, frameId);
      } else if (tool === 'select') {
        setSelectedId(frameId);
      }
    },
    [tool, activeBoardId],
  );

  const handleConnectionClick = useCallback(
    (connectionId: string) => {
      if (tool === 'delete' && activeBoardId) {
        window.electronAPI.whiteboard.disconnect(activeBoardId, connectionId);
      }
    },
    [tool, activeBoardId],
  );

  // --- Context menu ---

  const handleStickyContextMenu = useCallback(
    (stickyId: string, e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      setContextMenu({
        stickyId,
        x: e.evt.clientX,
        y: e.evt.clientY,
      });
    },
    [],
  );

  // --- Text editing ---

  const startEditing = useCallback(
    (sticky: Sticky) => {
      setEditingSticky(sticky.id);
      setEditText(sticky.text);
    },
    [],
  );

  const finishEditing = useCallback(() => {
    if (editingSticky && activeBoardId) {
      window.electronAPI.whiteboard.updateSticky(activeBoardId, editingSticky, {
        text: editText,
      });
    }
    setEditingSticky(null);
    setEditText('');
  }, [editingSticky, activeBoardId, editText]);

  const finishFrameEditing = useCallback(() => {
    if (editingFrame && activeBoardId && editFrameLabel.trim()) {
      window.electronAPI.whiteboard.updateFrame(activeBoardId, editingFrame, {
        label: editFrameLabel.trim(),
      });
    }
    setEditingFrame(null);
    setEditFrameLabel('');
  }, [editingFrame, activeBoardId, editFrameLabel]);

  // --- Keyboard ---

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTool('select');
        setConnectFrom(null);
        setConnectMousePos(null);
        setFrameDrawing(null);
        setContextMenu(null);
        setMetadataEditor(null);
        if (editingSticky) finishEditing();
      }
      if (e.key === 'Delete' && selectedId && activeBoardId && !editingSticky) {
        // Try to delete as sticky, frame, or connection
        window.electronAPI.whiteboard.deleteSticky(activeBoardId, selectedId);
        window.electronAPI.whiteboard.deleteFrame(activeBoardId, selectedId);
        window.electronAPI.whiteboard.disconnect(activeBoardId, selectedId);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, activeBoardId, editingSticky, finishEditing]);

  // --- Board management ---

  const createBoard = useCallback(() => {
    const name = `Board ${boards.length + 1}`;
    window.electronAPI.whiteboard.createBoard(name, null).then((b: Board) => {
      setBoards((prev) => [
        ...prev,
        {
          id: b.id,
          name: b.name,
          workspaceId: b.workspaceId,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
        },
      ]);
      setActiveBoardId(b.id);
      setBoardMenuOpen(false);
    });
  }, [boards.length]);

  const deleteBoard = useCallback(
    (boardId: string) => {
      window.electronAPI.whiteboard.deleteBoard(boardId);
      setBoards((prev) => prev.filter((b) => b.id !== boardId));
      if (boardId === activeBoardId) {
        const remaining = boards.filter((b) => b.id !== boardId);
        setActiveBoardId(remaining[0]?.id ?? null);
      }
      setBoardMenuOpen(false);
    },
    [activeBoardId, boards],
  );

  const renameBoard = useCallback(
    (boardId: string, name: string) => {
      window.electronAPI.whiteboard.updateBoard(boardId, { name });
      setBoards((prev) =>
        prev.map((b) => (b.id === boardId ? { ...b, name } : b)),
      );
      setRenamingBoardId(null);
    },
    [],
  );

  // --- MCP toggle ---

  const toggleMcp = useCallback(async () => {
    if (mcpRunning) {
      await window.electronAPI.whiteboard.stopMcpServer();
      setMcpRunning(false);
    } else {
      const port = settings.whiteboard?.mcpPort ?? 3100;
      const result = await window.electronAPI.whiteboard.startMcpServer(port);
      if ((result as { success: boolean }).success) {
        setMcpRunning(true);
      }
    }
  }, [mcpRunning, settings]);

  // --- Zoom controls ---

  const zoomIn = () => {
    const newScale = Math.min(MAX_ZOOM, stageScale * 1.3);
    const center = { x: stageSize.width / 2, y: stageSize.height / 2 };
    const mousePointTo = {
      x: (center.x - stagePos.x) / stageScale,
      y: (center.y - stagePos.y) / stageScale,
    };
    const newPos = {
      x: center.x - mousePointTo.x * newScale,
      y: center.y - mousePointTo.y * newScale,
    };
    setStageScale(newScale);
    setStagePos(newPos);
    persistViewport(-newPos.x, -newPos.y, newScale);
  };

  const zoomOut = () => {
    const newScale = Math.max(MIN_ZOOM, stageScale / 1.3);
    const center = { x: stageSize.width / 2, y: stageSize.height / 2 };
    const mousePointTo = {
      x: (center.x - stagePos.x) / stageScale,
      y: (center.y - stagePos.y) / stageScale,
    };
    const newPos = {
      x: center.x - mousePointTo.x * newScale,
      y: center.y - mousePointTo.y * newScale,
    };
    setStageScale(newScale);
    setStagePos(newPos);
    persistViewport(-newPos.x, -newPos.y, newScale);
  };

  const fitToScreen = () => {
    if (!board || board.stickies.length === 0) {
      setStagePos({ x: 0, y: 0 });
      setStageScale(1);
      persistViewport(0, 0, 1);
      return;
    }
    const allItems = [
      ...board.stickies.map((s) => ({
        x: s.x,
        y: s.y,
        w: s.width,
        h: s.height,
      })),
      ...board.frames.map((f) => ({
        x: f.x,
        y: f.y,
        w: f.width,
        h: f.height,
      })),
    ];
    const minX = Math.min(...allItems.map((i) => i.x));
    const minY = Math.min(...allItems.map((i) => i.y));
    const maxX = Math.max(...allItems.map((i) => i.x + i.w));
    const maxY = Math.max(...allItems.map((i) => i.y + i.h));
    const contentW = maxX - minX + 100;
    const contentH = maxY - minY + 100;
    const scaleX = stageSize.width / contentW;
    const scaleY = stageSize.height / contentH;
    const newScale = Math.min(scaleX, scaleY, 2);
    const newPos = {
      x: (stageSize.width - contentW * newScale) / 2 - minX * newScale + 50 * newScale,
      y: (stageSize.height - contentH * newScale) / 2 - minY * newScale + 50 * newScale,
    };
    setStageScale(newScale);
    setStagePos(newPos);
    persistViewport(-newPos.x, -newPos.y, newScale);
  };

  // --- Grid rendering ---

  const gridDots = useMemo(() => {
    const dots: { x: number; y: number }[] = [];
    const gridSpacing = GRID_SIZE;
    const startX =
      Math.floor(-stagePos.x / stageScale / gridSpacing) * gridSpacing - gridSpacing;
    const startY =
      Math.floor(-stagePos.y / stageScale / gridSpacing) * gridSpacing - gridSpacing;
    const endX = startX + stageSize.width / stageScale + gridSpacing * 2;
    const endY = startY + stageSize.height / stageScale + gridSpacing * 2;
    for (let x = startX; x < endX; x += gridSpacing) {
      for (let y = startY; y < endY; y += gridSpacing) {
        dots.push({ x, y });
      }
    }
    return dots;
  }, [stagePos.x, stagePos.y, stageScale, stageSize.width, stageSize.height]);

  // --- Compute editing textarea position ---

  const editingTextareaStyle = useMemo(() => {
    if (!editingSticky || !board) return null;
    const sticky = board.stickies.find((s) => s.id === editingSticky);
    if (!sticky) return null;
    return {
      position: 'absolute' as const,
      left: sticky.x * stageScale + stagePos.x,
      top: sticky.y * stageScale + stagePos.y,
      width: sticky.width * stageScale,
      height: sticky.height * stageScale,
      fontSize: 14 * stageScale,
      padding: 8 * stageScale,
      border: 'none',
      outline: '2px solid #3b82f6',
      background: STICKY_COLORS[sticky.color],
      resize: 'none' as const,
      zIndex: 50,
      borderRadius: 8 * stageScale,
      fontFamily: 'inherit',
      lineHeight: '1.4',
      color: '#1e293b',
    };
  }, [editingSticky, board, stageScale, stagePos]);

  const editingFrameLabelStyle = useMemo(() => {
    if (!editingFrame || !board) return null;
    const frame = board.frames.find((f) => f.id === editingFrame);
    if (!frame) return null;
    return {
      position: 'absolute' as const,
      left: frame.x * stageScale + stagePos.x,
      top: frame.y * stageScale + stagePos.y - 28 * stageScale,
      width: Math.min(frame.width * stageScale, 300),
      height: 24 * stageScale,
      fontSize: 13 * stageScale,
      padding: `2px ${6 * stageScale}px`,
      border: 'none',
      outline: `2px solid ${frame.color}`,
      background: '#1e1e2e',
      color: frame.color,
      fontWeight: 'bold',
      zIndex: 50,
      borderRadius: 4,
      fontFamily: 'inherit',
    };
  }, [editingFrame, board, stageScale, stagePos]);

  // --- Render ---

  const activeBoardName =
    boards.find((b) => b.id === activeBoardId)?.name ?? 'No Board';

  // Get the "from" sticky for connect tool preview line
  const connectFromSticky = connectFrom
    ? board?.stickies.find((s) => s.id === connectFrom)
    : null;

  // Cursor style based on tool
  const cursorClass =
    tool === 'sticky'
      ? 'cursor-crosshair'
      : tool === 'frame'
        ? 'cursor-crosshair'
        : tool === 'connect'
          ? 'cursor-pointer'
          : tool === 'delete'
            ? 'cursor-pointer'
            : 'cursor-default';

  return (
    <div
      ref={containerRef}
      className={cn('relative h-full w-full overflow-hidden bg-[#1a1a2e]', cursorClass)}
      onClick={() => setContextMenu(null)}
    >
      {/* --- Canvas --- */}
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        draggable={tool === 'select' || tool === 'connect'}
        onWheel={handleWheel}
        onDragEnd={handleDragEnd}
        onClick={handleStageClick}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
      >
        {/* Grid layer */}
        <Layer listening={false}>
          <Shape
            sceneFunc={(context) => {
              const dotRadius = 1.5 / stageScale;
              context.fillStyle = 'rgba(255,255,255,0.15)';
              for (const dot of gridDots) {
                context.beginPath();
                context.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
                context.fill();
              }
            }}
          />
        </Layer>

        {/* Frames layer */}
        <Layer>
          {board?.frames.map((frame) => (
            <Group
              key={frame.id}
              x={frame.x}
              y={frame.y}
              draggable={tool === 'select'}
              onClick={() => handleFrameClick(frame.id)}
              onDblClick={() => { setEditingFrame(frame.id); setEditFrameLabel(frame.label); }}
              onDragStart={(e) => handleFrameDragStart(frame.id, e)}
              onDragEnd={(e) => handleFrameDragEnd(frame.id, e)}
            >
              <Rect
                width={frame.width}
                height={frame.height}
                fill={frame.color + '20'}
                stroke={frame.color}
                strokeWidth={2}
                cornerRadius={8}
                dash={[8, 4]}
              />
              <Text
                text={frame.label}
                x={8}
                y={-22}
                fontSize={14}
                fill={frame.color}
                fontStyle="bold"
              />
              {selectedId === frame.id && (
                <Rect
                  width={frame.width}
                  height={frame.height}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  cornerRadius={8}
                  listening={false}
                />
              )}
            </Group>
          ))}

          {/* Frame drawing preview */}
          {frameDrawing && (
            <Rect
              x={Math.min(frameDrawing.startX, frameDrawing.currentX)}
              y={Math.min(frameDrawing.startY, frameDrawing.currentY)}
              width={Math.abs(frameDrawing.currentX - frameDrawing.startX)}
              height={Math.abs(frameDrawing.currentY - frameDrawing.startY)}
              fill="rgba(226, 232, 240, 0.1)"
              stroke="#e2e8f0"
              strokeWidth={2}
              dash={[8, 4]}
              cornerRadius={8}
              listening={false}
            />
          )}
        </Layer>

        {/* Connections layer */}
        <Layer>
          {board?.connections.map((conn) => {
            const fromSticky = board.stickies.find(
              (s) => s.id === conn.fromStickyId,
            );
            const toSticky = board.stickies.find(
              (s) => s.id === conn.toStickyId,
            );
            if (!fromSticky || !toSticky) return null;
            const fromX = fromSticky.x + fromSticky.width / 2;
            const fromY = fromSticky.y + fromSticky.height / 2;
            const toX = toSticky.x + toSticky.width / 2;
            const toY = toSticky.y + toSticky.height / 2;
            return (
              <Group key={conn.id}>
                <Arrow
                  points={[fromX, fromY, toX, toY]}
                  pointerLength={10}
                  pointerWidth={8}
                  fill="#94a3b8"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  hitStrokeWidth={20}
                  onClick={() => handleConnectionClick(conn.id)}
                />
                {conn.label && (
                  <Text
                    text={conn.label}
                    x={(fromX + toX) / 2 - 20}
                    y={(fromY + toY) / 2 - 10}
                    fontSize={12}
                    fill="#cbd5e1"
                    padding={4}
                  />
                )}
              </Group>
            );
          })}

          {/* Connect tool preview line */}
          {connectFromSticky && connectMousePos && (
            <Arrow
              points={[
                connectFromSticky.x + connectFromSticky.width / 2,
                connectFromSticky.y + connectFromSticky.height / 2,
                connectMousePos.x,
                connectMousePos.y,
              ]}
              pointerLength={10}
              pointerWidth={8}
              fill="#60a5fa"
              stroke="#60a5fa"
              strokeWidth={2}
              dash={[6, 3]}
              listening={false}
            />
          )}
        </Layer>

        {/* Stickies layer */}
        <Layer>
          {board?.stickies.map((sticky) => (
            <Group
              key={sticky.id}
              x={sticky.x}
              y={sticky.y}
              draggable={tool === 'select'}
              onClick={() => handleStickyClick(sticky.id)}
              onDblClick={() => startEditing(sticky)}
              onDragEnd={(e) => handleStickyDragEnd(sticky.id, e)}
              onContextMenu={(e) => handleStickyContextMenu(sticky.id, e)}
            >
              <Rect
                width={sticky.width}
                height={sticky.height}
                fill={STICKY_COLORS[sticky.color]}
                stroke={
                  selectedId === sticky.id || connectFrom === sticky.id
                    ? '#3b82f6'
                    : STICKY_BORDER_COLORS[sticky.color]
                }
                strokeWidth={selectedId === sticky.id || connectFrom === sticky.id ? 2.5 : 1}
                cornerRadius={8}
                shadowColor="rgba(0,0,0,0.3)"
                shadowBlur={8}
                shadowOffsetY={2}
              />
              {editingSticky !== sticky.id && (
                <Text
                  text={sticky.text || '(double-click to edit)'}
                  x={10}
                  y={10}
                  width={sticky.width - 20}
                  height={sticky.height - 20}
                  fontSize={14}
                  fill={sticky.text ? '#1e293b' : '#94a3b8'}
                  wrap="word"
                  ellipsis
                  listening={false}
                />
              )}
            </Group>
          ))}
        </Layer>
      </Stage>

      {/* --- Text editing overlay --- */}
      {editingSticky && editingTextareaStyle && (
        <textarea
          autoFocus
          style={editingTextareaStyle}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={finishEditing}
          onKeyDown={(e) => {
            if (e.key === 'Escape') finishEditing();
            e.stopPropagation();
          }}
        />
      )}

      {/* --- Frame label editing overlay --- */}
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

      {/* --- Floating Toolbar (top-center) --- */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-[#1e1e2e]/90 backdrop-blur border border-white/10 rounded-lg px-2 py-1.5 shadow-xl">
        {([
          ['select', MousePointer2, 'Select'],
          ['sticky', StickyNote, 'Sticky'],
          ['frame', Square, 'Frame'],
          ['connect', ArrowRight, 'Connect'],
          ['delete', Trash2, 'Delete'],
        ] as [Tool, typeof MousePointer2, string][]).map(
          ([t, Icon, label]) => (
            <button
              key={t}
              onClick={() => {
                setTool(t);
                setConnectFrom(null);
                setConnectMousePos(null);
              }}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                tool === t
                  ? 'bg-blue-500/30 text-blue-300'
                  : 'text-white/60 hover:text-white/90 hover:bg-white/10',
              )}
              title={label}
            >
              <Icon size={16} />
            </button>
          ),
        )}
        <div className="w-px h-5 bg-white/10 mx-1" />
        <button
          onClick={zoomOut}
          className="p-1.5 rounded-md text-white/60 hover:text-white/90 hover:bg-white/10"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        <span className="text-xs text-white/40 min-w-[3ch] text-center">
          {Math.round(stageScale * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="p-1.5 rounded-md text-white/60 hover:text-white/90 hover:bg-white/10"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={fitToScreen}
          className="p-1.5 rounded-md text-white/60 hover:text-white/90 hover:bg-white/10"
          title="Fit to Screen"
        >
          <Maximize size={16} />
        </button>
      </div>

      {/* --- Board Menu (top-left) --- */}
      <div className="absolute top-3 left-3 z-10">
        <button
          onClick={() => setBoardMenuOpen((p) => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e2e]/90 backdrop-blur border border-white/10 rounded-lg text-sm text-white/80 hover:text-white shadow-xl"
        >
          {activeBoardName}
          <ChevronDown size={14} />
        </button>
        {boardMenuOpen && (
          <div className="absolute top-full mt-1 left-0 min-w-[200px] bg-[#1e1e2e] border border-white/10 rounded-lg shadow-xl overflow-hidden">
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
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => renameBoard(b.id, renameValue)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renameBoard(b.id, renameValue);
                      if (e.key === 'Escape') setRenamingBoardId(null);
                    }}
                  />
                ) : (
                  <span
                    className="flex-1"
                    onClick={() => {
                      setActiveBoardId(b.id);
                      setBoardMenuOpen(false);
                    }}
                  >
                    {b.name}
                  </span>
                )}
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingBoardId(b.id);
                      setRenameValue(b.name);
                    }}
                    className="p-0.5 text-white/40 hover:text-white/80"
                  >
                    <Pencil size={12} />
                  </button>
                  {boards.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteBoard(b.id);
                      }}
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
              onClick={createBoard}
            >
              <Plus size={14} />
              New Board
            </div>
          </div>
        )}
      </div>

      {/* --- MCP Toggle (top-right) --- */}
      <div className="absolute top-3 right-3 z-10">
        <button
          onClick={toggleMcp}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e2e]/90 backdrop-blur border border-white/10 rounded-lg text-sm shadow-xl transition-colors',
            mcpRunning
              ? 'text-green-300 border-green-500/30'
              : 'text-white/50 hover:text-white/80',
          )}
          title={mcpRunning ? 'Stop MCP Server' : 'Start MCP Server'}
        >
          <Radio size={14} />
          {mcpRunning ? 'MCP' : 'MCP Off'}
        </button>
      </div>

      {/* --- Context Menu --- */}
      {contextMenu && (
        <div
          className="absolute z-50 bg-[#1e1e2e] border border-white/10 rounded-lg shadow-xl overflow-hidden py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Color picker */}
          <div className="px-3 py-2 flex items-center gap-2">
            {ALL_COLORS.map((color) => (
              <button
                key={color}
                className={cn(
                  'w-5 h-5 rounded-full border-2 transition-transform hover:scale-110',
                  board?.stickies.find((s) => s.id === contextMenu.stickyId)
                    ?.color === color
                    ? 'border-white scale-110'
                    : 'border-transparent',
                )}
                style={{ background: STICKY_COLORS[color] }}
                onClick={() => {
                  if (activeBoardId) {
                    window.electronAPI.whiteboard.updateSticky(
                      activeBoardId,
                      contextMenu.stickyId,
                      { color },
                    );
                  }
                  setContextMenu(null);
                }}
              />
            ))}
          </div>
          <div className="h-px bg-white/10" />
          <button
            className="w-full px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/5 text-left"
            onClick={() => {
              setMetadataEditor(contextMenu.stickyId);
              setContextMenu(null);
            }}
          >
            Edit Metadata
          </button>
          <button
            className="w-full px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 text-left"
            onClick={() => {
              if (activeBoardId) {
                window.electronAPI.whiteboard.deleteSticky(
                  activeBoardId,
                  contextMenu.stickyId,
                );
              }
              setContextMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}

      {/* --- Metadata Editor --- */}
      {metadataEditor && board && (() => {
        const sticky = board.stickies.find((s) => s.id === metadataEditor);
        if (!sticky) return null;
        const entries = Object.entries(sticky.metadata);
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
              <button
                onClick={() => setMetadataEditor(null)}
                className="text-white/40 hover:text-white/80"
              >
                <X size={14} />
              </button>
            </div>
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-center gap-1.5 mb-1.5">
                <input
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 outline-none"
                  value={key}
                  readOnly
                />
                <input
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 outline-none"
                  value={value}
                  onChange={(e) => {
                    if (activeBoardId) {
                      const newMeta = { ...sticky.metadata, [key]: e.target.value };
                      window.electronAPI.whiteboard.updateSticky(
                        activeBoardId,
                        sticky.id,
                        { metadata: newMeta },
                      );
                    }
                  }}
                />
                <button
                  className="text-white/30 hover:text-red-400"
                  onClick={() => {
                    if (activeBoardId) {
                      const newMeta = { ...sticky.metadata };
                      delete newMeta[key];
                      window.electronAPI.whiteboard.updateSticky(
                        activeBoardId,
                        sticky.id,
                        { metadata: newMeta },
                      );
                    }
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              className="text-xs text-blue-400 hover:text-blue-300 mt-1"
              onClick={() => {
                if (activeBoardId) {
                  const newKey = `key${entries.length + 1}`;
                  const newMeta = { ...sticky.metadata, [newKey]: '' };
                  window.electronAPI.whiteboard.updateSticky(
                    activeBoardId,
                    sticky.id,
                    { metadata: newMeta },
                  );
                }
              }}
            >
              + Add entry
            </button>
          </div>
        );
      })()}
    </div>
  );
}
