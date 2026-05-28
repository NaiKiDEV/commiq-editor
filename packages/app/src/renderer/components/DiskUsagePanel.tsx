import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  HardDrive,
  RefreshCw,
  FolderOpen,
  ChevronRight,
  X,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { Button } from "./ui/button";
import type { DiskNode } from "../../shared/disk-usage-types";

// ── Helpers ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

type Rect = { x: number; y: number; w: number; h: number };

function worstRatio(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  if (sum === 0) return Infinity;
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk). Returns one rect per
 * input value, in the same order, packed into `rect` with near-1 aspect ratios.
 */
function squarify(values: number[], rect: Rect): Rect[] {
  const result: Rect[] = new Array(values.length);
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) {
    return values.map(() => ({ x: rect.x, y: rect.y, w: 0, h: 0 }));
  }

  const scale = (rect.w * rect.h) / total;
  const areas = values.map((v) => v * scale);

  let { x, y, w, h } = rect;
  let i = 0;
  const n = areas.length;

  while (i < n) {
    const side = Math.min(w, h);
    const row: number[] = [areas[i]];
    let j = i + 1;
    while (j < n) {
      const withNext = [...row, areas[j]];
      if (worstRatio(withNext, side) <= worstRatio(row, side)) {
        row.push(areas[j]);
        j++;
      } else break;
    }

    const rowSum = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const colW = rowSum / h;
      let yy = y;
      for (let k = 0; k < row.length; k++) {
        const cellH = colW > 0 ? row[k] / colW : 0;
        result[i + k] = { x, y: yy, w: colW, h: cellH };
        yy += cellH;
      }
      x += colW;
      w -= colW;
    } else {
      const rowH = rowSum / w;
      let xx = x;
      for (let k = 0; k < row.length; k++) {
        const cellW = rowH > 0 ? row[k] / rowH : 0;
        result[i + k] = { x: xx, y, w: cellW, h: rowH };
        xx += cellW;
      }
      y += rowH;
      h -= rowH;
    }
    i += row.length;
  }
  return result;
}

/**
 * Find the chain of nodes from `from`'s first matching child down to the node
 * with `targetPath` (inclusive). Returns null if not found, [] if `from` itself
 * is the target. Used to build the full drill path when a nested tile is clicked.
 */
function descendantChain(from: DiskNode, targetPath: string): DiskNode[] | null {
  if (from.path === targetPath) return [];
  if (!from.children) return null;
  for (const child of from.children) {
    if (child.path === targetPath) return [child];
    const sub = descendantChain(child, targetPath);
    if (sub) return [child, ...sub];
  }
  return null;
}

// Categorical hues assigned to the top visible level; children inherit & lighten.
const HUES = [210, 145, 35, 280, 0, 175, 55, 320, 95, 250];
const MIN_TILE = 4; // px — smaller tiles are dropped from the layout
const MAX_VISUAL_DEPTH = 3; // nesting levels drawn before flattening
const HEADER_H = 16; // px reserved for a directory tile's label strip

function tileStyle(hue: number, depth: number, isDir: boolean): React.CSSProperties {
  const lightness = Math.min(72, 34 + depth * 9);
  const saturation = isDir ? 48 : 30;
  return {
    backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
    color: lightness > 58 ? "hsl(0 0% 12%)" : "hsl(0 0% 96%)",
  };
}

// ── Tile (recursive) ─────────────────────────────────────────────────────

type TileProps = {
  node: DiskNode;
  rect: Rect;
  hue: number;
  depth: number;
  onDrill: (node: DiskNode) => void;
  onHover: (node: DiskNode | null) => void;
  onContext: (e: React.MouseEvent, node: DiskNode) => void;
};

function Tile({ node, rect, hue, depth, onDrill, onHover, onContext }: TileProps) {
  if (rect.w < MIN_TILE || rect.h < MIN_TILE) return null;

  const showLabel = rect.w > 46 && rect.h > 14;
  const canNest =
    node.isDir &&
    depth < MAX_VISUAL_DEPTH &&
    !!node.children?.length &&
    rect.w > 60 &&
    rect.h > 60;

  let childRects: { kids: DiskNode[]; rects: Rect[] } | null = null;
  if (canNest) {
    const kids = node.children!.filter((c) => c.size > 0);
    const inner: Rect = {
      x: 0,
      y: HEADER_H,
      w: rect.w - 2,
      h: rect.h - HEADER_H - 1,
    };
    childRects = { kids, rects: squarify(kids.map((c) => c.size), inner) };
  }

  return (
    <div
      className="absolute overflow-hidden border border-black/25 rounded-[2px] cursor-pointer transition-[filter] hover:brightness-110 hover:z-10"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        ...tileStyle(hue, depth, node.isDir),
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (node.isDir) onDrill(node);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContext(e, node);
      }}
      onMouseEnter={() => onHover(node)}
      title={`${node.path}\n${formatBytes(node.size)}`}
    >
      {showLabel && (
        <div className="px-1 pt-0.5 text-[10px] leading-tight font-medium truncate pointer-events-none">
          {node.name}
          {rect.h > 28 && rect.w > 70 && (
            <span className="opacity-70"> · {formatBytes(node.size)}</span>
          )}
        </div>
      )}
      {childRects &&
        childRects.kids.map((child, idx) => (
          <Tile
            key={child.path}
            node={child}
            rect={childRects.rects[idx]}
            hue={hue}
            depth={depth + 1}
            onDrill={onDrill}
            onHover={onHover}
            onContext={onContext}
          />
        ))}
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────

type ContextState = { node: DiskNode; x: number; y: number };

export function DiskUsagePanel({ panelId }: { panelId: string }) {
  const [root, setRoot] = useState<DiskNode | null>(null);
  // Drill path as node paths (not references), so it survives a rescan that
  // produces a brand-new tree. Resolved against the live tree on each render.
  const [stack, setStack] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<DiskNode | null>(null);
  const [context, setContext] = useState<ContextState | null>(null);

  const areaRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Walk the live tree following the stored paths. Stops early if a path no
  // longer exists (e.g. after a folder was deleted), keeping us on solid ground.
  const resolvedStack = useMemo(() => {
    if (!root) return [];
    const nodes: DiskNode[] = [];
    let cursor: DiskNode = root;
    for (const targetPath of stack) {
      const next = cursor.children?.find((c) => c.path === targetPath);
      if (!next) break;
      nodes.push(next);
      cursor = next;
    }
    return nodes;
  }, [root, stack]);

  const current = resolvedStack.length > 0 ? resolvedStack[resolvedStack.length - 1] : root;

  const measure = useCallback(() => {
    if (!areaRef.current) return;
    const r = areaRef.current.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
  }, []);

  useLayoutEffect(() => {
    measure();
    if (!areaRef.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(areaRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const runScan = useCallback(
    async (targetPath: string, resetStack: boolean) => {
      setScanning(true);
      setError(null);
      setProgress(0);
      const scanId = `${panelId}:${Date.now()}`;
      const off = window.electronAPI.diskUsage.onProgress(scanId, (p) => {
        setProgress(p.files);
      });
      try {
        const res = await window.electronAPI.diskUsage.scan(targetPath, scanId);
        if ("error" in res) {
          setError(res.error);
        } else {
          setRoot(res.tree);
          if (resetStack) setStack([]);
        }
      } catch (e: unknown) {
        setError((e as Error).message ?? "Scan failed");
      } finally {
        off();
        setScanning(false);
      }
    },
    [panelId],
  );

  const pickAndScan = useCallback(async () => {
    const res = await window.electronAPI.diskUsage.pick();
    if ("canceled" in res) return;
    runScan(res.path, true);
  }, [runScan]);

  const handleDrill = useCallback(
    (node: DiskNode) => {
      if (!node.isDir || !root) return;
      // Build the absolute chain root → … → node so nested tiles resolve too.
      const chain = descendantChain(root, node.path);
      if (!chain || chain.length === 0) return;
      const target = chain[chain.length - 1];
      if (target.children?.length) {
        setStack(chain.map((n) => n.path));
      } else if ((target.entries ?? 0) > 0) {
        // Past the scanned depth — rescan rooted here for a fresh view.
        runScan(target.path, true);
      }
    },
    [root, runScan],
  );

  const navigateTo = useCallback((index: number) => {
    // index -1 = scanned root, otherwise position within the stack
    setStack((s) => (index < 0 ? [] : s.slice(0, index + 1)));
  }, []);

  const closeContext = useCallback(() => setContext(null), []);
  useEffect(() => {
    if (!context) return;
    const onClick = () => closeContext();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeContext();
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [context, closeContext]);

  const layout = useMemo(() => {
    if (!current?.children?.length || size.w < 2 || size.h < 2) return null;
    const kids = current.children.filter((c) => c.size > 0);
    if (kids.length === 0) return null;
    const rects = squarify(
      kids.map((c) => c.size),
      { x: 0, y: 0, w: size.w, h: size.h },
    );
    return { kids, rects };
  }, [current, size.w, size.h]);

  const breadcrumb = root ? [root, ...resolvedStack] : [];
  const info = hovered ?? current;

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0 flex items-center gap-1.5">
          <HardDrive className="size-3.5" /> Disk Usage
        </span>
        <Button size="sm" variant="outline" onClick={pickAndScan} disabled={scanning} className="gap-1.5">
          <FolderOpen className="size-3.5" /> Choose Folder
        </Button>
        {root && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => runScan(root.path, false)}
            disabled={scanning}
            title="Rescan"
          >
            <RefreshCw className={scanning ? "animate-spin" : ""} />
          </Button>
        )}
        {scanning && (
          <span className="text-xs text-muted-foreground font-mono ml-auto">
            scanning… {progress.toLocaleString()} files
          </span>
        )}
      </div>

      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border text-xs overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {breadcrumb.map((node, i) => (
            <span key={node.path} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && <ChevronRight className="size-3 text-muted-foreground/50" />}
              <button
                className={
                  i === breadcrumb.length - 1
                    ? "text-foreground font-medium px-1 py-0.5"
                    : "text-muted-foreground hover:text-foreground px-1 py-0.5 rounded hover:bg-muted/50"
                }
                onClick={() => navigateTo(i - 1)}
                title={node.path}
              >
                {i === 0 ? node.path : node.name}
              </button>
            </span>
          ))}
          {current && (
            <span className="ml-auto shrink-0 pl-3 font-mono text-muted-foreground">
              {formatBytes(current.size)}
              {current.partial && (
                <span className="text-amber-500" title="Some entries could not be read">
                  {" "}⚠
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="px-4 py-2 text-xs text-destructive bg-destructive/10 border-b border-destructive/20 flex items-center justify-between gap-2">
          <span>{error}</span>
          <Button variant="ghost" size="icon-xs" onClick={() => setError(null)}>
            <X />
          </Button>
        </div>
      )}

      {/* Treemap area */}
      <div ref={areaRef} className="flex-1 relative overflow-hidden bg-muted/20">
        {!root && !scanning && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-2 text-muted-foreground">
              <HardDrive className="size-8 mx-auto opacity-40" />
              <p className="text-sm">Choose a folder to visualize what's using space.</p>
              <Button size="sm" variant="outline" onClick={pickAndScan} className="gap-1.5">
                <FolderOpen className="size-3.5" /> Choose Folder
              </Button>
            </div>
          </div>
        )}

        {scanning && !root && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <RefreshCw className="size-4 animate-spin mr-2" />
            <span className="text-sm">Scanning {progress.toLocaleString()} files…</span>
          </div>
        )}

        {root && !layout && !scanning && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            This folder is empty.
          </div>
        )}

        {layout &&
          layout.kids.map((child, idx) => (
            <Tile
              key={child.path}
              node={child}
              rect={layout.rects[idx]}
              hue={HUES[idx % HUES.length]}
              depth={0}
              onDrill={handleDrill}
              onHover={setHovered}
              onContext={(e, node) =>
                setContext({ node, x: e.clientX, y: e.clientY })
              }
            />
          ))}
      </div>

      {/* Hover info bar */}
      {info && (
        <div
          className="flex items-center gap-2 px-3 py-1 border-t border-border text-xs text-muted-foreground"
          onMouseLeave={() => setHovered(null)}
        >
          <span className="truncate flex-1 font-mono" title={info.path}>
            {info.path}
          </span>
          <span className="shrink-0 font-mono text-foreground">
            {formatBytes(info.size)}
          </span>
          {info.isDir && info.entries != null && (
            <span className="shrink-0">
              {info.entries} item{info.entries === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}

      {/* Context menu */}
      {context && (
        <div
          className="fixed z-50 min-w-44 bg-popover border border-border rounded-md shadow-lg py-1 text-xs"
          style={{ top: context.y, left: context.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            onClick={() => {
              window.electronAPI.diskUsage.reveal(context.node.path);
              closeContext();
            }}
          >
            <ExternalLink className="size-3" /> Reveal in file manager
          </button>
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-destructive/10 hover:text-destructive flex items-center gap-2"
            onClick={async () => {
              const target = context.node;
              closeContext();
              const res = await window.electronAPI.diskUsage.trash(target.path);
              if (!res.success) {
                setError(res.error ?? "Failed to move to trash");
                return;
              }
              // Rescan from the scanned root so freed space is reflected
              // while keeping the current drill position.
              if (root) runScan(root.path, false);
            }}
          >
            <Trash2 className="size-3" /> Move to trash
          </button>
        </div>
      )}
    </div>
  );
}
