import { useEffect, useRef, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "./MarkdownContent";
import {
  MarkdownToolbar,
  transformSelection,
  type MarkdownAction,
  type Selection,
} from "../notes/MarkdownToolbar";

type Props = {
  /** Committed description from the task. */
  value: string;
  /** Persist a changed description (dispatches UPDATE_TASK upstream). */
  onCommit: (next: string) => void;
};

type Mode = "edit" | "preview";

// Ctrl/Cmd+K is reserved by the app (command palette), so only the
// non-conflicting inline-formatting shortcuts are bound here.
const SHORTCUT_KEYS: Record<string, MarkdownAction> = { b: "bold", i: "italic" };

/**
 * Markdown-aware description field for the task detail panel. Edit mode pairs
 * the shared MarkdownToolbar with an auto-growing textarea; preview mode renders
 * the same content through the Notes markdown renderer. Reuses both so the
 * boards and notes surfaces stay visually and behaviorally consistent.
 */
export function TaskDescription({ value, onCommit }: Props) {
  const [mode, setMode] = useState<Mode>(value.trim() ? "preview" : "edit");
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<Selection>({ start: 0, end: 0 });

  // Resync the draft whenever the committed value changes (task switch or an
  // edit landing back through context). While editing, `value` stays the old
  // committed text, so in-flight keystrokes are never clobbered.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Auto-resize the editor to fit its content.
  useEffect(() => {
    if (mode !== "edit") return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, mode]);

  const trackSelection = () => {
    const ta = textareaRef.current;
    if (ta) {
      selectionRef.current = { start: ta.selectionStart, end: ta.selectionEnd };
    }
  };

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  const switchTo = (next: Mode) => {
    if (next === mode) return;
    if (next === "preview") commit();
    setMode(next);
    if (next === "edit") {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const action = SHORTCUT_KEYS[e.key.toLowerCase()];
    if (!action) return;
    e.preventDefault();
    const ta = e.currentTarget;
    const result = transformSelection(
      ta.value,
      ta.selectionStart,
      ta.selectionEnd,
      action,
    );
    setDraft(result.value);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(result.selStart, result.selEnd);
      trackSelection();
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Description
        </span>
        <div className="flex rounded-md border border-border overflow-hidden">
          {(
            [
              { m: "edit" as const, icon: Pencil, title: "Edit" },
              { m: "preview" as const, icon: Eye, title: "Preview" },
            ]
          ).map(({ m, icon: Icon, title }, i) => (
            <button
              key={m}
              type="button"
              onClick={() => switchTo(m)}
              title={title}
              className={cn(
                "flex items-center px-1.5 py-0.5 text-[10px] transition-colors",
                i > 0 && "border-l border-border",
                mode === m
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3" />
            </button>
          ))}
        </div>
      </div>

      {mode === "edit" ? (
        <div className="rounded-md border border-border/60 bg-muted/40 overflow-hidden focus-within:border-border">
          <MarkdownToolbar
            textareaRef={textareaRef}
            selectionRef={selectionRef}
            value={draft}
            onChange={setDraft}
          />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              trackSelection();
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={trackSelection}
            onSelect={trackSelection}
            onClick={trackSelection}
            onBlur={commit}
            placeholder="Add a description… (Markdown supported)"
            rows={4}
            className="w-full text-xs text-foreground bg-transparent px-3 py-2 resize-none outline-none placeholder-muted-foreground leading-relaxed font-mono"
            style={{ overflow: "hidden" }}
          />
        </div>
      ) : value.trim() ? (
        <MarkdownContent
          content={value}
          onDoubleClick={() => switchTo("edit")}
          className="text-xs text-foreground/90 leading-relaxed bg-muted/40 rounded-md px-3 py-2 cursor-text"
        />
      ) : (
        <button
          type="button"
          onClick={() => switchTo("edit")}
          className="text-left text-xs text-muted-foreground italic bg-muted/40 rounded-md px-3 py-2 hover:text-foreground transition-colors"
        >
          Add a description…
        </button>
      )}
    </div>
  );
}
