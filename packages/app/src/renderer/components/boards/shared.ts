import {
  BookOpen,
  Bug,
  CheckSquare,
  GitBranch,
  HelpCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  Task,
  TaskPriority,
  TaskType,
  TaskTypeConfig,
} from "../../../shared/boards-types";

// ─── Icon registry (resolved by string name from TaskTypeConfig) ─────────────

const ICON_REGISTRY: Record<string, LucideIcon> = {
  BookOpen,
  CheckSquare,
  Zap,
  Bug,
  GitBranch,
};

export function resolveIcon(name: string): LucideIcon {
  return ICON_REGISTRY[name] ?? HelpCircle;
}

// ─── Priority styling ────────────────────────────────────────────────────────

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const PRIORITY_BADGE_CLASS: Record<TaskPriority, string> = {
  critical: "bg-red-500/20 text-red-400 border border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
  medium: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  low: "bg-slate-500/20 text-slate-400 border border-slate-500/30",
};

// ─── Fractional indexing ─────────────────────────────────────────────────────

/**
 * Returns an `order` value that places a task between `prev` and `next`.
 * Pass `null` to either side to mean "at the start" or "at the end".
 */
export function fractionalOrder(
  prev: number | null,
  next: number | null,
): number {
  if (prev === null && next === null) return 1;
  if (prev === null) return (next as number) - 1;
  if (next === null) return prev + 1;
  return (prev + next) / 2;
}

// ─── Sorting helpers ─────────────────────────────────────────────────────────

export function sortByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}

export function tasksInColumn(tasks: Task[], columnId: string): Task[] {
  return sortByOrder(tasks.filter((t) => t.columnId === columnId));
}

// ─── Task type lookup ────────────────────────────────────────────────────────

export function findTypeConfig(
  registry: TaskTypeConfig[],
  type: TaskType,
): TaskTypeConfig | undefined {
  return registry.find((t) => t.key === type);
}
