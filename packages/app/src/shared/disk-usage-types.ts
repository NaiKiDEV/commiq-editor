/** A node in the disk usage tree returned by the scan IPC. */
export type DiskNode = {
  name: string;
  /** Absolute path to this file or directory. */
  path: string;
  /** Total size in bytes (recursive for directories). */
  size: number;
  isDir: boolean;
  /** Number of direct children (directories only). */
  entries?: number;
  /**
   * Direct children, sorted by size descending. Only present down to the
   * scan's max depth — deeper levels still contribute to `size` but their
   * nodes are omitted to keep the payload bounded.
   */
  children?: DiskNode[];
  /** True if some entries could not be read (e.g. permission denied). */
  partial?: boolean;
};

export type ScanResult = { tree: DiskNode } | { error: string };
export type PickResult = { path: string } | { canceled: true };
export type TrashResult = { success: boolean; error?: string };
export type ScanProgress = { files: number; done?: boolean };
