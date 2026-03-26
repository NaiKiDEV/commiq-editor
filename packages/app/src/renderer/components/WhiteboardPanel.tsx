import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  Stage,
  Layer,
  Rect,
  Text,
  Group,
  Arrow,
  Shape,
  Circle,
  Transformer,
} from "react-konva";
import type Konva from "konva";
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
  Keyboard,
  Palette,
  Download,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "../contexts/settings";
import type {
  Board,
  Sticky,
  Frame,
  Connection,
  StickyColor,
  BoardSummary,
} from "../../shared/whiteboard-types";

const STICKY_COLORS: Record<StickyColor, string> = {
  yellow: "#fef08a",
  blue: "#93c5fd",
  green: "#86efac",
  pink: "#f9a8d4",
  purple: "#c4b5fd",
  orange: "#fb923c",
  red: "#f87171",
};

const STICKY_BORDER_COLORS: Record<StickyColor, string> = {
  yellow: "#eab308",
  blue: "#3b82f6",
  green: "#22c55e",
  pink: "#ec4899",
  purple: "#8b5cf6",
  orange: "#ea580c",
  red: "#ef4444",
};

const ALL_COLORS: StickyColor[] = ["yellow", "blue", "green", "pink", "purple", "orange", "red"];

const FRAME_COLORS = [
  "#e2e8f0",
  "#93c5fd",
  "#86efac",
  "#fef08a",
  "#f9a8d4",
  "#c4b5fd",
  "#fb923c",
  "#f87171",
];

const SHORTCUT_LABELS = [
  ["Pan", "Middle mouse button"],
  ["Multi-select", "Shift+click / drag"],
  ["Select all", "Ctrl+A"],
  ["Delete", "Del key"],
  ["Resize", "Select item → drag handles"],
  ["Colors", "Right-click item"],
  ["Edit text", "Double-click sticky"],
  ["Rename frame", "Double-click frame"],
];

type Tool = "select" | "sticky" | "frame" | "connect" | "delete";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const GRID_SIZE = 40;

type WhiteboardPanelProps = { panelId: string };

/** Returns the point on the sticky's rectangular border along the line from its center toward (towardX, towardY). */
function getStickyEdgePoint(
  sticky: { x: number; y: number; width: number; height: number },
  towardX: number,
  towardY: number,
): { x: number; y: number } {
  const cx = sticky.x + sticky.width / 2;
  const cy = sticky.y + sticky.height / 2;
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = sticky.width / 2;
  const hh = sticky.height / 2;
  let t = Infinity;
  if (dx !== 0) t = Math.min(t, hw / Math.abs(dx));
  if (dy !== 0) t = Math.min(t, hh / Math.abs(dy));
  return { x: cx + dx * t, y: cy + dy * t };
}

export function WhiteboardPanel({ panelId: _panelId }: WhiteboardPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

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

  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);

  const [tool, setTool] = useState<Tool>("select");
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectMousePos, setConnectMousePos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [frameDrawing, setFrameDrawing] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [spaceHeld, setSpaceHeld] = useState(false);

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

  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editingSticky, setEditingSticky] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editingFrame, setEditingFrame] = useState<string | null>(null);
  const [editFrameLabel, setEditFrameLabel] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    stickyId: string;
    x: number;
    y: number;
  } | null>(null);
  const [frameContextMenu, setFrameContextMenu] = useState<{
    frameId: string;
    x: number;
    y: number;
  } | null>(null);
  const [connectionContextMenu, setConnectionContextMenu] = useState<{
    connectionId: string;
    x: number;
    y: number;
    label: string;
  } | null>(null);
  const [metadataEditor, setMetadataEditor] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [preCreationStickyColor, setPreCreationStickyColor] =
    useState<StickyColor>("yellow");
  const [preCreationFrameColor, setPreCreationFrameColor] =
    useState<string>("#e2e8f0");

  const [selectionRect, setSelectionRect] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const dragStartPositions = useRef<Record<string, { x: number; y: number }>>(
    {},
  );
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const justDragSelected = useRef(false);

  const { settings } = useSettings();
  const [mcpRunning, setMcpRunning] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showColorLegend, setShowColorLegend] = useState(false);

  useEffect(() => {
    window.electronAPI.whiteboard
      .listBoards()
      .then(async (list: BoardSummary[]) => {
        if (list.length > 0) {
          setBoards(list);
          setActiveBoardId(list[0].id);
        } else {
          const b: Board = await window.electronAPI.whiteboard.createBoard(
            "Board 1",
            null,
          );
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
        }
      });
  }, []);

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

  useEffect(() => {
    window.electronAPI.whiteboard
      .getMcpStatus()
      .then((s: { running: boolean }) => {
        setMcpRunning(s.running);
      });
  }, []);

  const middleMousePanning = useRef(false);
  const middleMouseLast = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        middleMousePanning.current = true;
        middleMouseLast.current = { x: e.clientX, y: e.clientY };
        container.style.cursor = "grabbing";
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!middleMousePanning.current) return;
      const dx = e.clientX - middleMouseLast.current.x;
      const dy = e.clientY - middleMouseLast.current.y;
      middleMouseLast.current = { x: e.clientX, y: e.clientY };
      setStagePos((prev) => {
        const newPos = { x: prev.x + dx, y: prev.y + dy };
        persistViewport(-newPos.x, -newPos.y, stageScale);
        return newPos;
      });
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 1) {
        middleMousePanning.current = false;
        container.style.cursor = "";
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      // Suppress context menu from middle click on some systems
      if (e.button === 1) e.preventDefault();
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("contextmenu", onContextMenu);
    return () => {
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("contextmenu", onContextMenu);
    };
  }, [persistViewport, stageScale]);

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

  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      return {
        x: (screenX - stagePos.x) / stageScale,
        y: (screenY - stagePos.y) / stageScale,
      };
    },
    [stagePos, stageScale],
  );

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
        Math.max(
          MIN_ZOOM,
          direction > 0 ? oldScale * factor : oldScale / factor,
        ),
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

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const isStage = e.target === stageRef.current;

      setContextMenu(null);
      setFrameContextMenu(null);
      setConnectionContextMenu(null);

      if (tool === "sticky" && activeBoardId) {
        // Allow clicking on the stage OR on/inside a frame
        const clickedOnFrame = board?.frames.some(
          (f) => f.id === e.target.id() || e.target.getParent()?.id() === f.id,
        );
        if (isStage || clickedOnFrame) {
          const pos = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
          window.electronAPI.whiteboard.createSticky(activeBoardId, {
            x: pos.x,
            y: pos.y,
            color: preCreationStickyColor,
          });
          setTool("select");
        }
        return;
      }

      if (!isStage) return;

      if (tool === "connect") {
        setConnectFrom(null);
        setConnectMousePos(null);
        return;
      }

      if (tool === "select") {
        if (justDragSelected.current) {
          justDragSelected.current = false;
        } else {
          setSelectedIds(new Set());
        }
      }
    },
    [tool, activeBoardId, screenToCanvas, preCreationStickyColor, board],
  );

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button !== 0) return;

      if (tool === "frame" && e.target === stageRef.current) {
        const pos = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
        setFrameDrawing({
          startX: pos.x,
          startY: pos.y,
          currentX: pos.x,
          currentY: pos.y,
        });
        return;
      }

      if (tool === "select" && e.target === stageRef.current) {
        const pos = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
        setSelectionRect({
          startX: pos.x,
          startY: pos.y,
          currentX: pos.x,
          currentY: pos.y,
        });
      }
    },
    [tool, screenToCanvas],
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (tool === "connect" && connectFrom) {
        const pos = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
        setConnectMousePos(pos);
      }
      if (tool === "frame" && frameDrawing) {
        const pos = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
        setFrameDrawing((prev) =>
          prev ? { ...prev, currentX: pos.x, currentY: pos.y } : null,
        );
      }
      if (tool === "select" && selectionRect) {
        const pos = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
        setSelectionRect((prev) =>
          prev ? { ...prev, currentX: pos.x, currentY: pos.y } : null,
        );
      }
    },
    [tool, connectFrom, frameDrawing, selectionRect, screenToCanvas],
  );

  const handleStageMouseUp = useCallback(() => {
    if (tool === "frame" && frameDrawing && activeBoardId) {
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
          color: preCreationFrameColor,
        });
      }
      setFrameDrawing(null);
      setTool("select");
    }

    if (tool === "select" && selectionRect && board) {
      const rx = Math.min(selectionRect.startX, selectionRect.currentX);
      const ry = Math.min(selectionRect.startY, selectionRect.currentY);
      const rw = Math.abs(selectionRect.currentX - selectionRect.startX);
      const rh = Math.abs(selectionRect.currentY - selectionRect.startY);

      if (rw > 5 || rh > 5) {
        const newSelected = new Set<string>();
        for (const sticky of board.stickies) {
          if (
            sticky.x + sticky.width > rx &&
            sticky.x < rx + rw &&
            sticky.y + sticky.height > ry &&
            sticky.y < ry + rh
          ) {
            newSelected.add(sticky.id);
          }
        }
        for (const frame of board.frames) {
          if (
            frame.x + frame.width > rx &&
            frame.x < rx + rw &&
            frame.y + frame.height > ry &&
            frame.y < ry + rh
          ) {
            newSelected.add(frame.id);
          }
        }
        setSelectedIds(newSelected);
        justDragSelected.current = true;
      }
      setSelectionRect(null);
    }
  }, [
    tool,
    frameDrawing,
    selectionRect,
    activeBoardId,
    board,
    preCreationFrameColor,
  ]);

  const handleTransformEnd = useCallback(
    (e: Konva.KonvaEventObject<Event>) => {
      if (!activeBoardId || !board) return;
      const node = e.target;
      const id = node.id();
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      node.scaleX(1);
      node.scaleY(1);

      const sticky = board.stickies.find((s) => s.id === id);
      if (sticky) {
        const newWidth = Math.max(80, sticky.width * scaleX);
        const newHeight = Math.max(60, sticky.height * scaleY);
        window.electronAPI.whiteboard.updateSticky(activeBoardId, id, {
          x: node.x(),
          y: node.y(),
          width: newWidth,
          height: newHeight,
        });
        return;
      }

      const frame = board.frames.find((f) => f.id === id);
      if (frame) {
        const newWidth = Math.max(80, frame.width * scaleX);
        const newHeight = Math.max(60, frame.height * scaleY);
        window.electronAPI.whiteboard.updateFrame(activeBoardId, id, {
          x: node.x(),
          y: node.y(),
          width: newWidth,
          height: newHeight,
        });
      }
    },
    [activeBoardId, board],
  );

  const handleStickyDragStart = useCallback(
    (stickyId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      if (selectedIds.size > 1 && selectedIds.has(stickyId)) {
        const stage = stageRef.current;
        if (!stage) return;
        dragStartPositions.current = {};
        dragOrigin.current = { x: e.target.x(), y: e.target.y() };
        for (const id of selectedIds) {
          if (id === stickyId) continue;
          const node = stage.findOne(`#${id}`);
          if (node) {
            dragStartPositions.current[id] = { x: node.x(), y: node.y() };
          }
        }
      }
    },
    [selectedIds],
  );

  const handleStickyDragMove = useCallback(
    (stickyId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      if (
        selectedIds.size > 1 &&
        selectedIds.has(stickyId) &&
        dragOrigin.current
      ) {
        const stage = stageRef.current;
        if (!stage) return;
        const dx = e.target.x() - dragOrigin.current.x;
        const dy = e.target.y() - dragOrigin.current.y;
        for (const [id, startPos] of Object.entries(
          dragStartPositions.current,
        )) {
          const node = stage.findOne(`#${id}`);
          if (node) {
            node.x(startPos.x + dx);
            node.y(startPos.y + dy);
          }
        }
      }
    },
    [selectedIds],
  );

  const handleStickyDragEnd = useCallback(
    (stickyId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      if (!activeBoardId || !board) return;

      if (
        selectedIds.size > 1 &&
        selectedIds.has(stickyId) &&
        dragOrigin.current
      ) {
        const dx = e.target.x() - dragOrigin.current.x;
        const dy = e.target.y() - dragOrigin.current.y;
        for (const id of selectedIds) {
          const sticky = board.stickies.find((s) => s.id === id);
          if (sticky) {
            const newX = id === stickyId ? e.target.x() : sticky.x + dx;
            const newY = id === stickyId ? e.target.y() : sticky.y + dy;
            // Check frame containment
            const centerX = newX + sticky.width / 2;
            const centerY = newY + sticky.height / 2;
            let newFrameId: string | null = null;
            for (const frame of board.frames) {
              if (
                centerX >= frame.x &&
                centerX <= frame.x + frame.width &&
                centerY >= frame.y &&
                centerY <= frame.y + frame.height
              ) {
                newFrameId = frame.id;
                break;
              }
            }
            window.electronAPI.whiteboard.updateSticky(activeBoardId, id, {
              x: newX,
              y: newY,
              frameId: newFrameId,
            });
          }
          const frame = board.frames.find((f) => f.id === id);
          if (frame) {
            const newX = frame.x + dx;
            const newY = frame.y + dy;
            window.electronAPI.whiteboard.updateFrame(activeBoardId, id, {
              x: newX,
              y: newY,
            });
            // Move contained stickies
            for (const s of board.stickies) {
              if (s.frameId === id && !selectedIds.has(s.id)) {
                window.electronAPI.whiteboard.updateSticky(
                  activeBoardId,
                  s.id,
                  {
                    x: s.x + dx,
                    y: s.y + dy,
                  },
                );
              }
            }
          }
        }
        dragOrigin.current = null;
        dragStartPositions.current = {};
        return;
      }

      // Single sticky drag
      const newX = e.target.x();
      const newY = e.target.y();
      const stk = board.stickies.find((s) => s.id === stickyId);
      const centerX = newX + (stk?.width ?? 200) / 2;
      const centerY = newY + (stk?.height ?? 150) / 2;
      let newFrameId: string | null = null;
      for (const frame of board.frames) {
        if (
          centerX >= frame.x &&
          centerX <= frame.x + frame.width &&
          centerY >= frame.y &&
          centerY <= frame.y + frame.height
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
    [activeBoardId, board, selectedIds],
  );

  const frameDragStartPos = useRef<Record<string, { x: number; y: number }>>(
    {},
  );

  const handleFrameDragStart = useCallback(
    (frameId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      frameDragStartPos.current = {};
      frameDragStartPos.current[frameId] = { x: e.target.x(), y: e.target.y() };

      // Multi-drag setup
      if (selectedIds.size > 1 && selectedIds.has(frameId)) {
        const stage = stageRef.current;
        if (!stage) return;
        dragOrigin.current = { x: e.target.x(), y: e.target.y() };
        dragStartPositions.current = {};
        for (const id of selectedIds) {
          if (id === frameId) continue;
          const node = stage.findOne(`#${id}`);
          if (node) {
            dragStartPositions.current[id] = { x: node.x(), y: node.y() };
          }
        }
      }
    },
    [selectedIds],
  );

  const handleFrameDragMove = useCallback(
    (frameId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      if (
        selectedIds.size > 1 &&
        selectedIds.has(frameId) &&
        dragOrigin.current
      ) {
        const stage = stageRef.current;
        if (!stage) return;
        const dx = e.target.x() - dragOrigin.current.x;
        const dy = e.target.y() - dragOrigin.current.y;
        for (const [id, startPos] of Object.entries(
          dragStartPositions.current,
        )) {
          const node = stage.findOne(`#${id}`);
          if (node) {
            node.x(startPos.x + dx);
            node.y(startPos.y + dy);
          }
        }
      }
    },
    [selectedIds],
  );

  const handleFrameDragEnd = useCallback(
    (frameId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      if (!activeBoardId || !board) return;

      if (
        selectedIds.size > 1 &&
        selectedIds.has(frameId) &&
        dragOrigin.current
      ) {
        // Multi-drag handled in sticky drag end equivalent
        const dx = e.target.x() - dragOrigin.current.x;
        const dy = e.target.y() - dragOrigin.current.y;
        for (const id of selectedIds) {
          const sticky = board.stickies.find((s) => s.id === id);
          if (sticky) {
            window.electronAPI.whiteboard.updateSticky(activeBoardId, id, {
              x: sticky.x + dx,
              y: sticky.y + dy,
            });
          }
          const frame = board.frames.find((f) => f.id === id);
          if (frame) {
            const newX = id === frameId ? e.target.x() : frame.x + dx;
            const newY = id === frameId ? e.target.y() : frame.y + dy;
            window.electronAPI.whiteboard.updateFrame(activeBoardId, id, {
              x: newX,
              y: newY,
            });
            // Move contained stickies not in selection
            for (const s of board.stickies) {
              if (s.frameId === id && !selectedIds.has(s.id)) {
                window.electronAPI.whiteboard.updateSticky(
                  activeBoardId,
                  s.id,
                  {
                    x: s.x + dx,
                    y: s.y + dy,
                  },
                );
              }
            }
          }
        }
        dragOrigin.current = null;
        dragStartPositions.current = {};
        return;
      }

      // Single frame drag
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
          window.electronAPI.whiteboard.updateSticky(activeBoardId, sticky.id, {
            x: sticky.x + dx,
            y: sticky.y + dy,
          });
        }
      }
    },
    [activeBoardId, board, selectedIds],
  );

  const handleStickyClick = useCallback(
    (stickyId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
      if (tool === "connect" && activeBoardId) {
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
      } else if (tool === "delete" && activeBoardId) {
        window.electronAPI.whiteboard.deleteSticky(activeBoardId, stickyId);
      } else if (tool === "select") {
        if (e.evt.shiftKey) {
          // Shift+click: toggle in selection
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(stickyId)) next.delete(stickyId);
            else next.add(stickyId);
            return next;
          });
        } else {
          setSelectedIds(new Set([stickyId]));
        }
      }
    },
    [tool, activeBoardId, connectFrom],
  );

  const handleFrameClick = useCallback(
    (frameId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
      if (tool === "delete" && activeBoardId) {
        window.electronAPI.whiteboard.deleteFrame(activeBoardId, frameId);
      } else if (tool === "select") {
        if (e.evt.shiftKey) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(frameId)) next.delete(frameId);
            else next.add(frameId);
            return next;
          });
        } else {
          setSelectedIds(new Set([frameId]));
        }
      }
    },
    [tool, activeBoardId],
  );

  const handleConnectionClick = useCallback(
    (connectionId: string) => {
      if (tool === "delete" && activeBoardId) {
        window.electronAPI.whiteboard.disconnect(activeBoardId, connectionId);
      }
    },
    [tool, activeBoardId],
  );

  const handleStickyContextMenu = useCallback(
    (stickyId: string, e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      setFrameContextMenu(null);
      setContextMenu({
        stickyId,
        x: e.evt.clientX,
        y: e.evt.clientY,
      });
    },
    [],
  );

  const handleFrameContextMenu = useCallback(
    (frameId: string, e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      setContextMenu(null);
      setFrameContextMenu({
        frameId,
        x: e.evt.clientX,
        y: e.evt.clientY,
      });
    },
    [],
  );

  const handleConnectionContextMenu = useCallback(
    (
      connectionId: string,
      label: string | null,
      e: Konva.KonvaEventObject<PointerEvent>,
    ) => {
      e.evt.preventDefault();
      setContextMenu(null);
      setFrameContextMenu(null);
      setConnectionContextMenu({
        connectionId,
        x: e.evt.clientX,
        y: e.evt.clientY,
        label: label ?? "",
      });
    },
    [],
  );

  const startEditing = useCallback((sticky: Sticky) => {
    setEditingSticky(sticky.id);
    setEditText(sticky.text);
  }, []);

  const finishEditing = useCallback(() => {
    if (editingSticky && activeBoardId) {
      window.electronAPI.whiteboard.updateSticky(activeBoardId, editingSticky, {
        text: editText,
      });
    }
    setEditingSticky(null);
    setEditText("");
  }, [editingSticky, activeBoardId, editText]);

  const finishFrameEditing = useCallback(() => {
    if (editingFrame && activeBoardId && editFrameLabel.trim()) {
      window.electronAPI.whiteboard.updateFrame(activeBoardId, editingFrame, {
        label: editFrameLabel.trim(),
      });
    }
    setEditingFrame(null);
    setEditFrameLabel("");
  }, [editingFrame, activeBoardId, editFrameLabel]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTool("select");
        setConnectFrom(null);
        setConnectMousePos(null);
        setFrameDrawing(null);
        setSelectionRect(null);
        setContextMenu(null);
        setFrameContextMenu(null);
        setConnectionContextMenu(null);
        setMetadataEditor(null);
        setShowColorLegend(false);
        if (editingSticky) finishEditing();
        setSelectedIds(new Set());
      }
      if (
        e.key === "Delete" &&
        selectedIds.size > 0 &&
        activeBoardId &&
        !editingSticky
      ) {
        for (const id of selectedIds) {
          if (board?.stickies.some((s) => s.id === id)) {
            window.electronAPI.whiteboard.deleteSticky(activeBoardId, id);
          } else if (board?.frames.some((f) => f.id === id)) {
            window.electronAPI.whiteboard.deleteFrame(activeBoardId, id);
          } else if (board?.connections.some((c) => c.id === id)) {
            window.electronAPI.whiteboard.disconnect(activeBoardId, id);
          }
        }
        setSelectedIds(new Set());
      }
      // Ctrl+A: select all
      if (
        e.key === "a" &&
        (e.ctrlKey || e.metaKey) &&
        !editingSticky &&
        !editingFrame
      ) {
        e.preventDefault();
        if (board) {
          const all = new Set<string>();
          board.stickies.forEach((s) => all.add(s.id));
          board.frames.forEach((f) => all.add(f.id));
          setSelectedIds(all);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    selectedIds,
    activeBoardId,
    editingSticky,
    editingFrame,
    finishEditing,
    board,
  ]);

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

  const renameBoard = useCallback((boardId: string, name: string) => {
    window.electronAPI.whiteboard.updateBoard(boardId, { name });
    setBoards((prev) =>
      prev.map((b) => (b.id === boardId ? { ...b, name } : b)),
    );
    setRenamingBoardId(null);
  }, []);

  const importFileRef = useRef<HTMLInputElement>(null);

  const exportBoard = useCallback(
    async (boardId: string, boardName: string) => {
      const data = await window.electronAPI.whiteboard.getBoard(boardId);
      if (!data) return;
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${boardName.replace(/[^a-z0-9]/gi, "_")}.board.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [],
  );

  const importBoard = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const b: Board = await window.electronAPI.whiteboard.importBoard(data);
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
      } catch {
        // ignore malformed JSON
      }
    };
    reader.readAsText(file);
    // reset so the same file can be imported again
    e.target.value = "";
  }, []);

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
      x:
        (stageSize.width - contentW * newScale) / 2 -
        minX * newScale +
        50 * newScale,
      y:
        (stageSize.height - contentH * newScale) / 2 -
        minY * newScale +
        50 * newScale,
    };
    setStageScale(newScale);
    setStagePos(newPos);
    persistViewport(-newPos.x, -newPos.y, newScale);
  };

  const gridDots = useMemo(() => {
    const dots: { x: number; y: number }[] = [];
    const gridSpacing = GRID_SIZE;
    const startX =
      Math.floor(-stagePos.x / stageScale / gridSpacing) * gridSpacing -
      gridSpacing;
    const startY =
      Math.floor(-stagePos.y / stageScale / gridSpacing) * gridSpacing -
      gridSpacing;
    const endX = startX + stageSize.width / stageScale + gridSpacing * 2;
    const endY = startY + stageSize.height / stageScale + gridSpacing * 2;
    for (let x = startX; x < endX; x += gridSpacing) {
      for (let y = startY; y < endY; y += gridSpacing) {
        dots.push({ x, y });
      }
    }
    return dots;
  }, [stagePos.x, stagePos.y, stageScale, stageSize.width, stageSize.height]);

  const editingTextareaStyle = useMemo(() => {
    if (!editingSticky || !board) return null;
    const sticky = board.stickies.find((s) => s.id === editingSticky);
    if (!sticky) return null;
    return {
      position: "absolute" as const,
      left: sticky.x * stageScale + stagePos.x,
      top: sticky.y * stageScale + stagePos.y,
      width: sticky.width * stageScale,
      height: sticky.height * stageScale,
      fontSize: 14 * stageScale,
      padding: 8 * stageScale,
      border: "none",
      outline: "2px solid #3b82f6",
      background: STICKY_COLORS[sticky.color],
      resize: "none" as const,
      zIndex: 50,
      borderRadius: 8 * stageScale,
      fontFamily: "'Inter Variable', 'Inter', system-ui, sans-serif",
      fontWeight: 500,
      lineHeight: "1.4",
      color: "#1e293b",
    };
  }, [editingSticky, board, stageScale, stagePos]);

  const editingFrameLabelStyle = useMemo(() => {
    if (!editingFrame || !board) return null;
    const frame = board.frames.find((f) => f.id === editingFrame);
    if (!frame) return null;
    return {
      position: "absolute" as const,
      left: frame.x * stageScale + stagePos.x,
      top: frame.y * stageScale + stagePos.y - 28 * stageScale,
      width: Math.min(frame.width * stageScale, 300),
      height: 24 * stageScale,
      fontSize: 13 * stageScale,
      padding: `2px ${6 * stageScale}px`,
      border: "none",
      outline: `2px solid ${frame.color}`,
      background: "#1e1e2e",
      color: frame.color,
      fontWeight: "bold",
      zIndex: 50,
      borderRadius: 4,
      fontFamily: "'Inter Variable', 'Inter', system-ui, sans-serif",
    };
  }, [editingFrame, board, stageScale, stagePos]);

  const activeBoardName =
    boards.find((b) => b.id === activeBoardId)?.name ?? "No Board";

  const connectFromSticky = connectFrom
    ? board?.stickies.find((s) => s.id === connectFrom)
    : null;

  const cursorClass =
    tool === "sticky"
      ? "cursor-crosshair"
      : tool === "frame"
        ? "cursor-crosshair"
        : tool === "connect"
          ? "cursor-pointer"
          : tool === "delete"
            ? "cursor-pointer"
            : "cursor-default";

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full w-full overflow-hidden bg-[#1a1a2e] font-['Inter_Variable','Inter',system-ui,sans-serif]",
        cursorClass,
      )}
      onClick={() => {
        setContextMenu(null);
        setFrameContextMenu(null);
        setConnectionContextMenu(null);
      }}
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
        draggable={tool === "connect"}
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
              context.fillStyle = "rgba(255,255,255,0.15)";
              for (const dot of gridDots) {
                context.beginPath();
                context.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
                context.fill();
              }
            }}
          />
        </Layer>

        {/* Main content layer (frames, connections, stickies, transformer) */}
        <Layer>
          {/* Frames */}
          {board?.frames.map((frame) => (
            <Group
              key={frame.id}
              id={frame.id}
              x={frame.x}
              y={frame.y}
              draggable={tool === "select"}
              onClick={(e) => handleFrameClick(frame.id, e)}
              onDblClick={() => {
                setEditingFrame(frame.id);
                setEditFrameLabel(frame.label);
              }}
              onDragStart={(e) => handleFrameDragStart(frame.id, e)}
              onDragMove={(e) => handleFrameDragMove(frame.id, e)}
              onDragEnd={(e) => handleFrameDragEnd(frame.id, e)}
              onContextMenu={(e) => handleFrameContextMenu(frame.id, e)}
              onTransformEnd={handleTransformEnd}
            >
              <Rect
                width={frame.width}
                height={frame.height}
                fill={frame.color + "20"}
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
                fontFamily="'Inter Variable', 'Inter', system-ui, sans-serif"
                fill={frame.color}
                fontStyle="bold"
              />
            </Group>
          ))}

          {/* Frame drawing preview */}
          {frameDrawing && (
            <Rect
              x={Math.min(frameDrawing.startX, frameDrawing.currentX)}
              y={Math.min(frameDrawing.startY, frameDrawing.currentY)}
              width={Math.abs(frameDrawing.currentX - frameDrawing.startX)}
              height={Math.abs(frameDrawing.currentY - frameDrawing.startY)}
              fill={(preCreationFrameColor || "#e2e8f0") + "15"}
              stroke={preCreationFrameColor || "#e2e8f0"}
              strokeWidth={2}
              dash={[8, 4]}
              cornerRadius={8}
              listening={false}
            />
          )}

          {/* Connections */}
          {board?.connections.map((conn) => {
            const fromSticky = board.stickies.find(
              (s) => s.id === conn.fromStickyId,
            );
            const toSticky = board.stickies.find(
              (s) => s.id === conn.toStickyId,
            );
            if (!fromSticky || !toSticky) return null;
            const fromCX = fromSticky.x + fromSticky.width / 2;
            const fromCY = fromSticky.y + fromSticky.height / 2;
            const toCX = toSticky.x + toSticky.width / 2;
            const toCY = toSticky.y + toSticky.height / 2;
            const fromEdge = getStickyEdgePoint(fromSticky, toCX, toCY);
            const toEdge = getStickyEdgePoint(toSticky, fromCX, fromCY);
            return (
              <Group key={conn.id}>
                <Arrow
                  points={[fromEdge.x, fromEdge.y, toEdge.x, toEdge.y]}
                  pointerLength={10}
                  pointerWidth={8}
                  fill="#94a3b8"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  hitStrokeWidth={20}
                  onClick={() => handleConnectionClick(conn.id)}
                  onContextMenu={(e) =>
                    handleConnectionContextMenu(conn.id, conn.label, e)
                  }
                />
                {conn.label && (
                  <Text
                    text={conn.label}
                    x={(fromEdge.x + toEdge.x) / 2 - 20}
                    y={(fromEdge.y + toEdge.y) / 2 - 10}
                    fontSize={12}
                    fontFamily="'Inter Variable', 'Inter', system-ui, sans-serif"
                    fill="#cbd5e1"
                    padding={4}
                    onContextMenu={(e) =>
                      handleConnectionContextMenu(conn.id, conn.label, e)
                    }
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

          {/* Stickies */}
          {board?.stickies.map((sticky) => (
            <Group
              key={sticky.id}
              id={sticky.id}
              x={sticky.x}
              y={sticky.y}
              draggable={tool === "select"}
              onClick={(e) => handleStickyClick(sticky.id, e)}
              onDblClick={() => startEditing(sticky)}
              onDragStart={(e) => handleStickyDragStart(sticky.id, e)}
              onDragMove={(e) => handleStickyDragMove(sticky.id, e)}
              onDragEnd={(e) => handleStickyDragEnd(sticky.id, e)}
              onContextMenu={(e) => handleStickyContextMenu(sticky.id, e)}
              onTransformEnd={handleTransformEnd}
            >
              <Rect
                width={sticky.width}
                height={sticky.height}
                fill={STICKY_COLORS[sticky.color]}
                stroke={
                  selectedIds.has(sticky.id) || connectFrom === sticky.id
                    ? "#3b82f6"
                    : STICKY_BORDER_COLORS[sticky.color]
                }
                strokeWidth={
                  selectedIds.has(sticky.id) || connectFrom === sticky.id
                    ? 2.5
                    : 1
                }
                cornerRadius={8}
                shadowColor="rgba(0,0,0,0.3)"
                shadowBlur={8}
                shadowOffsetY={2}
              />
              {editingSticky !== sticky.id && (
                <Text
                  text={
                    sticky.text
                      ? sticky.text.replace(/\\n/g, "\n")
                      : "(double-click to edit)"
                  }
                  x={10}
                  y={10}
                  width={sticky.width - 20}
                  height={sticky.height - 20}
                  fontSize={14}
                  fontFamily="'Inter Variable', 'Inter', system-ui, sans-serif"
                  fontStyle="500"
                  fill={sticky.text ? "#1e293b" : "#94a3b8"}
                  wrap="word"
                  ellipsis
                  listening={false}
                />
              )}
            </Group>
          ))}

          {/* Selection rectangle */}
          {selectionRect && (
            <Rect
              x={Math.min(selectionRect.startX, selectionRect.currentX)}
              y={Math.min(selectionRect.startY, selectionRect.currentY)}
              width={Math.abs(selectionRect.currentX - selectionRect.startX)}
              height={Math.abs(selectionRect.currentY - selectionRect.startY)}
              fill="rgba(59, 130, 246, 0.08)"
              stroke="#3b82f6"
              strokeWidth={1}
              dash={[4, 4]}
              listening={false}
            />
          )}

          {/* Transformer for resize/selection */}
          <Transformer
            ref={transformerRef}
            borderStroke="#3b82f6"
            borderStrokeWidth={1.5}
            anchorSize={8}
            anchorStroke="#3b82f6"
            anchorFill="white"
            anchorCornerRadius={2}
            rotateEnabled={false}
            enabledAnchors={
              selectedIds.size === 1
                ? [
                    "top-left",
                    "top-right",
                    "bottom-left",
                    "bottom-right",
                    "middle-left",
                    "middle-right",
                    "top-center",
                    "bottom-center",
                  ]
                : []
            }
            boundBoxFunc={(_oldBox, newBox) => {
              if (newBox.width < 60 || newBox.height < 40) return _oldBox;
              return newBox;
            }}
          />
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
            if (e.key === "Escape") finishEditing();
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
            if (e.key === "Enter") finishFrameEditing();
            if (e.key === "Escape") {
              setEditingFrame(null);
              setEditFrameLabel("");
            }
            e.stopPropagation();
          }}
        />
      )}

      {/* --- Floating Toolbar (top-center) --- */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-[#1e1e2e]/90 backdrop-blur border border-white/10 rounded-lg px-2 py-1.5 shadow-xl">
        {(
          [
            ["select", MousePointer2, "Select"],
            ["sticky", StickyNote, "Sticky"],
            ["frame", Square, "Frame"],
            ["connect", ArrowRight, "Connect"],
            ["delete", Trash2, "Delete"],
          ] as [Tool, typeof MousePointer2, string][]
        ).map(([t, Icon, label]) => (
          <button
            key={t}
            onClick={() => {
              setTool(t);
              setConnectFrom(null);
              setConnectMousePos(null);
            }}
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

        {/* Pre-creation color picker for sticky tool */}
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
                onClick={() => setPreCreationStickyColor(color)}
                title={color}
              />
            ))}
          </>
        )}

        {/* Pre-creation color picker for frame tool */}
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
                onClick={() => setPreCreationFrameColor(color)}
                title={color}
              />
            ))}
          </>
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
          <div className="absolute top-full mt-1 left-0 min-w-[320px] bg-[#1e1e2e] border border-white/10 rounded-lg shadow-xl overflow-hidden">
            {boards.map((b) => (
              <div
                key={b.id}
                className={cn(
                  "flex items-center justify-between px-3 py-2 text-sm hover:bg-white/5 cursor-pointer",
                  b.id === activeBoardId
                    ? "text-blue-300 bg-blue-500/10"
                    : "text-white/70",
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
                      if (e.key === "Enter") renameBoard(b.id, renameValue);
                      if (e.key === "Escape") setRenamingBoardId(null);
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
                      exportBoard(b.id, b.name);
                    }}
                    className="p-0.5 text-white/40 hover:text-white/80"
                    title="Export board"
                  >
                    <Download size={12} />
                  </button>
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
            <div
              className="flex items-center gap-2 px-3 py-2 text-sm text-white/50 hover:text-white/80 hover:bg-white/5 cursor-pointer"
              onClick={() => importFileRef.current?.click()}
            >
              <Upload size={14} />
              Import Board
            </div>
            <input
              ref={importFileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={importBoard}
            />
          </div>
        )}
      </div>

      {/* --- MCP Toggle (top-right) --- */}
      <div className="absolute top-3 right-3 z-10">
        <button
          onClick={toggleMcp}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e2e]/90 backdrop-blur border border-white/10 rounded-lg text-sm shadow-xl transition-colors",
            mcpRunning
              ? "text-green-300 border-green-500/30"
              : "text-white/50 hover:text-white/80",
          )}
          title={mcpRunning ? "Stop MCP Server" : "Start MCP Server"}
        >
          <Radio size={14} />
          {mcpRunning ? "MCP" : "MCP Off"}
        </button>
      </div>

      {/* Color Legend Panel moved to bottom-right */}

      {/* --- Shortcuts + Legend panel (bottom-right) --- */}
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
          <div
            className="bg-[#1e1e2e]/95 backdrop-blur border border-white/10 rounded-lg shadow-xl p-3 min-w-70"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              {ALL_COLORS.map((color) => (
                <div key={color} className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded-full shrink-0 border border-white/10"
                    style={{ background: STICKY_COLORS[color] }}
                  />
                  <input
                    className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 outline-none focus:border-white/30 placeholder:text-white/25"
                    placeholder="No meaning set"
                    value={board?.colorMeanings?.[color] ?? ""}
                    onChange={(e) => {
                      if (!activeBoardId || !board) return;
                      const newMeanings = { ...(board.colorMeanings ?? {}) };
                      if (e.target.value) {
                        newMeanings[color] = e.target.value;
                      } else {
                        delete newMeanings[color];
                      }
                      window.electronAPI.whiteboard.updateBoard(activeBoardId, {
                        colorMeanings: newMeanings,
                      });
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
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e2e]/90 backdrop-blur border border-white/10 rounded-lg text-sm shadow-xl transition-colors",
              showColorLegend
                ? "text-purple-300 border-purple-500/30"
                : "text-white/50 hover:text-white/80",
            )}
            title="Color Legend"
          >
            <Palette size={14} />
            Legend
          </button>
          <button
            onClick={() => setShowShortcuts((p) => !p)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e2e]/90 backdrop-blur border border-white/10 rounded-lg text-sm shadow-xl transition-colors",
              showShortcuts
                ? "text-blue-300 border-blue-500/30"
                : "text-white/50 hover:text-white/80",
            )}
            title="Keyboard shortcuts"
          >
            <Keyboard size={14} />
            Shortcuts
          </button>
        </div>
      </div>

      {/* --- Sticky Context Menu --- */}
      {contextMenu && (
        <div
          className="absolute z-50 bg-[#1e1e2e] border border-white/10 rounded-lg shadow-xl overflow-hidden py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Color picker */}
          <div className="px-3 py-2 space-y-1">
            <div className="flex items-center gap-2">
              {ALL_COLORS.map((color) => (
                <button
                  key={color}
                  className={cn(
                    "w-5 h-5 rounded-full border-2 transition-transform hover:scale-110",
                    board?.stickies.find((s) => s.id === contextMenu.stickyId)
                      ?.color === color
                      ? "border-white scale-110"
                      : "border-transparent",
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
                  title={
                    board?.colorMeanings?.[color]
                      ? `${color}: ${board.colorMeanings[color]}`
                      : color
                  }
                />
              ))}
            </div>
            {board?.colorMeanings &&
              (() => {
                const currentColor = board.stickies.find(
                  (s) => s.id === contextMenu.stickyId,
                )?.color;
                const meaning = currentColor
                  ? board.colorMeanings[currentColor]
                  : undefined;
                return meaning ? (
                  <div className="text-[10px] text-white/40 truncate">
                    {meaning}
                  </div>
                ) : null;
              })()}
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

      {/* --- Frame Context Menu --- */}
      {frameContextMenu && (
        <div
          className="absolute z-50 bg-[#1e1e2e] border border-white/10 rounded-lg shadow-xl overflow-hidden py-1 min-w-[160px]"
          style={{ left: frameContextMenu.x, top: frameContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Frame color picker */}
          <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
            {FRAME_COLORS.map((color) => (
              <button
                key={color}
                className={cn(
                  "w-5 h-5 rounded-full border-2 transition-transform hover:scale-110",
                  board?.frames.find((f) => f.id === frameContextMenu.frameId)
                    ?.color === color
                    ? "border-white scale-110"
                    : "border-transparent",
                )}
                style={{ background: color }}
                onClick={() => {
                  if (activeBoardId) {
                    window.electronAPI.whiteboard.updateFrame(
                      activeBoardId,
                      frameContextMenu.frameId,
                      { color },
                    );
                  }
                  setFrameContextMenu(null);
                }}
              />
            ))}
          </div>
          <div className="h-px bg-white/10" />
          <button
            className="w-full px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/5 text-left"
            onClick={() => {
              if (activeBoardId) {
                setEditingFrame(frameContextMenu.frameId);
                const frame = board?.frames.find(
                  (f) => f.id === frameContextMenu.frameId,
                );
                if (frame) setEditFrameLabel(frame.label);
              }
              setFrameContextMenu(null);
            }}
          >
            Rename
          </button>
          <button
            className="w-full px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 text-left"
            onClick={() => {
              if (activeBoardId) {
                window.electronAPI.whiteboard.deleteFrame(
                  activeBoardId,
                  frameContextMenu.frameId,
                );
              }
              setFrameContextMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}

      {/* --- Connection Context Menu --- */}
      {connectionContextMenu && (
        <div
          className="absolute z-50 bg-[#1e1e2e] border border-white/10 rounded-lg shadow-xl overflow-hidden py-1 min-w-[200px]"
          style={{
            left: connectionContextMenu.x,
            top: connectionContextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2">
            <div className="text-[11px] text-white/40 mb-1">
              Connection label
            </div>
            <input
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 outline-none focus:border-white/30"
              placeholder="No label"
              value={connectionContextMenu.label}
              onChange={(e) =>
                setConnectionContextMenu((prev) =>
                  prev ? { ...prev, label: e.target.value } : null,
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (activeBoardId) {
                    window.electronAPI.whiteboard.updateConnection(
                      activeBoardId,
                      connectionContextMenu.connectionId,
                      { label: connectionContextMenu.label || null },
                    );
                  }
                  setConnectionContextMenu(null);
                }
                if (e.key === "Escape") setConnectionContextMenu(null);
                e.stopPropagation();
              }}
            />
            <button
              className="mt-1.5 w-full px-2 py-1 text-xs bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 rounded"
              onClick={() => {
                if (activeBoardId) {
                  window.electronAPI.whiteboard.updateConnection(
                    activeBoardId,
                    connectionContextMenu.connectionId,
                    { label: connectionContextMenu.label || null },
                  );
                }
                setConnectionContextMenu(null);
              }}
            >
              Save label
            </button>
          </div>
          <div className="h-px bg-white/10" />
          <button
            className="w-full px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 text-left"
            onClick={() => {
              if (activeBoardId) {
                window.electronAPI.whiteboard.disconnect(
                  activeBoardId,
                  connectionContextMenu.connectionId,
                );
              }
              setConnectionContextMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}

      {metadataEditor &&
        board &&
        (() => {
          const sticky = board.stickies.find((s) => s.id === metadataEditor);
          if (!sticky) return null;
          const entries = Object.entries(sticky.metadata);
          return (
            <div
              className="absolute z-50 bg-[#1e1e2e] border border-white/10 rounded-lg shadow-xl p-3 min-w-[280px]"
              style={{
                left:
                  sticky.x * stageScale +
                  stagePos.x +
                  sticky.width * stageScale +
                  8,
                top: sticky.y * stageScale + stagePos.y,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white/80 font-medium">
                  Metadata
                </span>
                <button
                  onClick={() => setMetadataEditor(null)}
                  className="text-white/40 hover:text-white/80"
                >
                  <X size={14} />
                </button>
              </div>
              {entries.map(([key, value], index) => (
                <div key={index} className="flex items-center gap-1.5 mb-1.5">
                  <input
                    className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 outline-none focus:border-white/30"
                    value={key}
                    placeholder="key"
                    onChange={(e) => {
                      if (activeBoardId) {
                        const newMeta = { ...sticky.metadata };
                        delete newMeta[key];
                        newMeta[e.target.value] = value;
                        window.electronAPI.whiteboard.updateSticky(
                          activeBoardId,
                          sticky.id,
                          { metadata: newMeta },
                        );
                      }
                    }}
                  />
                  <input
                    className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 outline-none focus:border-white/30"
                    value={value}
                    placeholder="value"
                    onChange={(e) => {
                      if (activeBoardId) {
                        const newMeta = {
                          ...sticky.metadata,
                          [key]: e.target.value,
                        };
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
                    const newKey = "";
                    const newMeta = { ...sticky.metadata, [newKey]: "" };
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
