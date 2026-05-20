import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import { Separator } from "../ui/separator";
import type {
  BoardColumn,
  Project,
  ProjectSettings,
  TaskPriority,
  TaskType,
  TaskTypeConfig,
} from "../../../shared/boards-types";
import { useBoardsContext } from "./BoardsContext";

const COLOR_SWATCHES = [
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f97316",
  "#ef4444",
  "#facc15",
  "#06b6d4",
  "#ec4899",
];

const PRIORITY_OPTIONS: TaskPriority[] = ["critical", "high", "medium", "low"];

type Props = {
  open: boolean;
  onClose: () => void;
  project: Project;
};

type DraftColumn = Omit<BoardColumn, "id"> & { id?: string };

export function ProjectSettingsModal({ open, onClose, project }: Props) {
  const { dispatch, taskTypeRegistry } = useBoardsContext();

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [color, setColor] = useState(project.color);
  const [defaultPriority, setDefaultPriority] = useState<TaskPriority>(
    project.settings.defaultPriority,
  );
  const [enabledTaskTypes, setEnabledTaskTypes] = useState<TaskType[]>(
    project.settings.enabledTaskTypes,
  );
  const [columnTemplate, setColumnTemplate] = useState<DraftColumn[]>(
    project.settings.defaultColumnTemplate,
  );

  // Reset form when reopened against a fresh project.
  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setDescription(project.description);
    setColor(project.color);
    setDefaultPriority(project.settings.defaultPriority);
    setEnabledTaskTypes(project.settings.enabledTaskTypes);
    setColumnTemplate(project.settings.defaultColumnTemplate);
  }, [open, project]);

  const toggleTaskType = (key: TaskType, on: boolean) => {
    setEnabledTaskTypes((prev) =>
      on ? Array.from(new Set([...prev, key])) : prev.filter((t) => t !== key),
    );
  };

  const moveColumn = (index: number, direction: -1 | 1) => {
    setColumnTemplate((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((c, i) => ({ ...c, order: i }));
    });
  };

  const addColumn = () => {
    setColumnTemplate((prev) => [
      ...prev,
      { name: "New column", color: "#64748b", order: prev.length },
    ]);
  };

  const removeColumn = (index: number) => {
    setColumnTemplate((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((c, i) => ({ ...c, order: i })),
    );
  };

  const updateColumn = (index: number, patch: Partial<DraftColumn>) => {
    setColumnTemplate((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  };

  const handleSave = async () => {
    const settings: ProjectSettings = {
      defaultPriority,
      enabledTaskTypes:
        enabledTaskTypes.length === 0
          ? taskTypeRegistry.map((t) => t.key)
          : enabledTaskTypes,
      defaultColumnTemplate: columnTemplate.map((c, i) => ({
        id: c.id ?? crypto.randomUUID(),
        name: c.name,
        color: c.color,
        order: i,
        wipLimit: c.wipLimit,
      })),
    };
    await dispatch({
      type: "UPDATE_PROJECT",
      projectId: project.id,
      patch: {
        name: name.trim() || project.name,
        description,
        color,
        settings,
      },
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden flex flex-col max-h-[80vh] gap-0">
        <DialogHeader className="px-4 pt-3 pb-2 border-b border-border">
          <DialogTitle>Project settings</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          <Section label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Section>

          <Section label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What's this project about?"
            />
          </Section>

          <Section label="Color">
            <ColorPicker value={color} onChange={setColor} />
          </Section>

          <Separator />

          <Section label="Default priority for new tasks">
            <PrioritySelect
              value={defaultPriority}
              onChange={setDefaultPriority}
            />
          </Section>

          <Section label="Enabled task types">
            <TaskTypeChecklist
              registry={taskTypeRegistry}
              enabled={enabledTaskTypes}
              onToggle={toggleTaskType}
            />
          </Section>

          <Separator />

          <Section label="Default column template (applied to new boards)">
            <div className="flex flex-col gap-1.5">
              {columnTemplate.map((col, i) => (
                <ColumnRow
                  key={i}
                  column={col}
                  canMoveUp={i > 0}
                  canMoveDown={i < columnTemplate.length - 1}
                  onChange={(patch) => updateColumn(i, patch)}
                  onMoveUp={() => moveColumn(i, -1)}
                  onMoveDown={() => moveColumn(i, 1)}
                  onRemove={() => removeColumn(i)}
                />
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={addColumn}
                className="self-start gap-1.5"
              >
                <Plus className="size-3.5" />
                Add column
              </Button>
            </div>
          </Section>
        </div>

        <DialogFooter className="m-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-pieces ──────────────────────────────────────────────────────────────

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`size-6 rounded-md border ${
            value === c
              ? "border-foreground ring-2 ring-ring/40"
              : "border-border/60"
          }`}
          style={{ backgroundColor: c }}
          aria-label={`Color ${c}`}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-6 rounded-md border border-border/60 cursor-pointer bg-transparent"
      />
    </div>
  );
}

function PrioritySelect({
  value,
  onChange,
}: {
  value: TaskPriority;
  onChange: (v: TaskPriority) => void;
}) {
  return (
    <div className="flex gap-1">
      {PRIORITY_OPTIONS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`px-2.5 py-1 text-xs rounded-md border transition-colors capitalize ${
            value === p
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function TaskTypeChecklist({
  registry,
  enabled,
  onToggle,
}: {
  registry: TaskTypeConfig[];
  enabled: TaskType[];
  onToggle: (key: TaskType, on: boolean) => void;
}) {
  const enabledSet = useMemo(() => new Set(enabled), [enabled]);
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {registry.map((t) => {
        const on = enabledSet.has(t.key);
        return (
          <label
            key={t.key}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border/60 cursor-pointer hover:bg-muted/40"
          >
            <Checkbox
              checked={on}
              onCheckedChange={(next) => onToggle(t.key, next)}
            />
            <span
              className="inline-block size-2 rounded-sm"
              style={{ backgroundColor: t.color }}
            />
            <span className="text-xs">{t.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function ColumnRow({
  column,
  canMoveUp,
  canMoveDown,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  column: DraftColumn;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<DraftColumn>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 border border-border/60 rounded-md p-1.5">
      <div className="flex flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          title="Move up"
        >
          <GripVertical className="size-3.5 rotate-90 -mb-0.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          title="Move down"
        >
          <GripVertical className="size-3.5 -rotate-90 -mt-0.5" />
        </button>
      </div>
      <input
        type="color"
        value={column.color}
        onChange={(e) => onChange({ color: e.target.value })}
        className="size-6 rounded-md border border-border/60 cursor-pointer bg-transparent shrink-0"
      />
      <Input
        value={column.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="h-7 text-xs flex-1"
      />
      <Input
        type="number"
        min={0}
        placeholder="WIP"
        value={column.wipLimit ?? ""}
        onChange={(e) =>
          onChange({
            wipLimit: e.target.value ? Number(e.target.value) : undefined,
          })
        }
        className="h-7 w-16 text-xs"
      />
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        title="Remove column"
      >
        <Trash2 className="size-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}
