import { ipcMain, dialog, shell } from "electron";
import { promises as fsp } from "node:fs";
import path from "node:path";
import type {
  DiskNode,
  PickResult,
  ScanResult,
  TrashResult,
} from "../../shared/disk-usage-types";

// How many files between progress emits — keeps IPC chatter bounded on big trees.
const PROGRESS_THROTTLE = 500;
// Default depth of nodes returned. Deeper entries still count toward sizes but
// are omitted from the tree; the renderer rescans on demand when drilling past it.
const DEFAULT_MAX_DEPTH = 12;

type ScanCtx = {
  files: number;
  lastEmit: number;
  emit: () => void;
};

async function scanDir(
  dirPath: string,
  name: string,
  depth: number,
  maxDepth: number,
  ctx: ScanCtx,
): Promise<DiskNode> {
  let dirents;
  try {
    dirents = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch {
    // Permission denied / vanished mid-scan — report as an empty, partial dir.
    return { name, path: dirPath, size: 0, isDir: true, entries: 0, partial: true };
  }

  let size = 0;
  let partial = false;
  const children: DiskNode[] = [];

  await Promise.all(
    dirents.map(async (ent) => {
      // Skip symlinks so we never follow cycles or double-count targets.
      if (ent.isSymbolicLink()) return;
      const childPath = path.join(dirPath, ent.name);

      if (ent.isDirectory()) {
        const node = await scanDir(childPath, ent.name, depth + 1, maxDepth, ctx);
        size += node.size;
        if (node.partial) partial = true;
        children.push(node);
      } else if (ent.isFile()) {
        try {
          const st = await fsp.lstat(childPath);
          size += st.size;
          children.push({ name: ent.name, path: childPath, size: st.size, isDir: false });
          ctx.files++;
          ctx.emit();
        } catch {
          partial = true;
        }
      }
    }),
  );

  children.sort((a, b) => b.size - a.size);

  const node: DiskNode = {
    name,
    path: dirPath,
    size,
    isDir: true,
    entries: children.length,
    partial,
  };
  if (depth < maxDepth) node.children = children;
  return node;
}

export function registerDiskUsageIpc(): void {
  ipcMain.handle("disk-usage:pick", async (): Promise<PickResult> => {
    const result = await dialog.showOpenDialog({
      title: "Choose a folder to analyze",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { path: result.filePaths[0] };
  });

  ipcMain.handle(
    "disk-usage:scan",
    async (
      event,
      rootPath: string,
      scanId: string,
      maxDepth: number = DEFAULT_MAX_DEPTH,
    ): Promise<ScanResult> => {
      try {
        const stat = await fsp.lstat(rootPath);
        if (!stat.isDirectory()) return { error: "Not a directory" };

        const channel = `disk-usage:progress:${scanId}`;
        const ctx: ScanCtx = {
          files: 0,
          lastEmit: 0,
          emit() {
            if (this.files - this.lastEmit >= PROGRESS_THROTTLE) {
              this.lastEmit = this.files;
              event.sender.send(channel, { files: this.files });
            }
          },
        };

        const rootName = path.basename(rootPath) || rootPath;
        const tree = await scanDir(rootPath, rootName, 0, maxDepth, ctx);
        event.sender.send(channel, { files: ctx.files, done: true });
        return { tree };
      } catch (e: unknown) {
        return { error: (e as Error).message };
      }
    },
  );

  ipcMain.handle("disk-usage:reveal", async (_e, targetPath: string) => {
    shell.showItemInFolder(targetPath);
  });

  ipcMain.handle(
    "disk-usage:trash",
    async (_e, targetPath: string): Promise<TrashResult> => {
      try {
        await shell.trashItem(targetPath);
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    },
  );
}
