import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Separator } from "../ui/separator";
import type {
  Board,
  CardDisplayDensity,
} from "../../../shared/boards-types";
import { useBoardsContext } from "./BoardsContext";

const DENSITY_OPTIONS: { value: CardDisplayDensity; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "detailed", label: "Detailed" },
];

const ALL_FIELDS = [
  { key: "type", label: "Type icon" },
  { key: "priority", label: "Priority" },
  { key: "labels", label: "Labels" },
  { key: "storyPoints", label: "Story points" },
  { key: "assignee", label: "Assignee" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  board: Board;
};

export function BoardSettingsModal({ open, onClose, board }: Props) {
  const { dispatch } = useBoardsContext();

  const [name, setName] = useState(board.name);
  const [density, setDensity] = useState<CardDisplayDensity>(
    board.settings.cardDisplayDensity,
  );
  const [visibleFields, setVisibleFields] = useState<string[]>(
    board.settings.visibleCardFields,
  );

  useEffect(() => {
    if (!open) return;
    setName(board.name);
    setDensity(board.settings.cardDisplayDensity);
    setVisibleFields(board.settings.visibleCardFields);
  }, [open, board]);

  const toggleField = (key: string, on: boolean) => {
    setVisibleFields((prev) =>
      on ? Array.from(new Set([...prev, key])) : prev.filter((f) => f !== key),
    );
  };

  const save = async () => {
    await dispatch({
      type: "UPDATE_BOARD",
      boardId: board.id,
      patch: {
        name: name.trim() || board.name,
        settings: {
          cardDisplayDensity: density,
          visibleCardFields: visibleFields,
        },
      },
    });
    onClose();
  };

  const deleteBoard = async () => {
    await dispatch({ type: "DELETE_BOARD", boardId: board.id });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden flex flex-col gap-0">
        <DialogHeader className="px-4 pt-3 pb-2 border-b border-border">
          <DialogTitle>Board settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm px-4 py-3">
          <Section label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Section>

          <Section label="Card density">
            <div className="flex gap-1">
              {DENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDensity(opt.value)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    density === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Section>

          <Section label="Visible card fields">
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_FIELDS.map((f) => {
                const on = visibleFields.includes(f.key);
                return (
                  <label
                    key={f.key}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border/60 cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={on}
                      onCheckedChange={(next) => toggleField(f.key, next)}
                    />
                    <span className="text-xs">{f.label}</span>
                  </label>
                );
              })}
            </div>
          </Section>

          <Separator />

          <Button
            variant="ghost"
            onClick={() => void deleteBoard()}
            className="self-start text-destructive hover:text-destructive gap-1.5"
          >
            <Trash2 className="size-3.5" />
            Delete board
          </Button>
        </div>

        <DialogFooter className="m-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
