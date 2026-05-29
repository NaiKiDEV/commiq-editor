import { cn } from "@/lib/utils";
import { renderMarkdown } from "../notes/markdown";

type Props = {
  content: string;
  className?: string;
  onDoubleClick?: () => void;
};

// Open links from rendered markdown externally instead of navigating the
// renderer; mirrors the Notes preview behavior.
function handleClick(e: React.MouseEvent) {
  const anchor = (e.target as HTMLElement).closest("a");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  e.preventDefault();
  if (href && /^(https?:|mailto:)/i.test(href)) {
    window.electronAPI.openExternal(href);
  }
}

/**
 * Read-only rendered markdown, shared by the task description preview and
 * comment bodies. Output comes from the Notes markdown renderer (HTML-escaped,
 * safe-URL-only links). The first/last child margins are collapsed so the block
 * sits flush inside compact containers.
 */
export function MarkdownContent({ content, className, onDoubleClick }: Props) {
  return (
    <div
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}
