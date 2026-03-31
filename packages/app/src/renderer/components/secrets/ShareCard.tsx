import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type ShareCardProps = {
  index: number;
  total: number;
  value: string;
  accentClass?: string;
};

export function ShareCard({
  index,
  total,
  value,
  accentClass = "bg-muted/40 border-border",
}: ShareCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <div className="flex gap-2 items-start group">
      {/* Index badge */}
      <div className="shrink-0 w-5 h-5 mt-0.5 rounded-md bg-muted/60 flex items-center justify-center">
        <span className="text-[9px] font-bold text-muted-foreground font-mono">
          {index}
        </span>
      </div>

      {/* Value + copy */}
      <div
        className={cn(
          "flex-1 rounded-lg px-2.5 py-1.5 font-mono text-xs break-all",
          "border text-foreground max-h-16 overflow-y-auto",
          accentClass,
        )}
      >
        {value}
      </div>

      <button
        onClick={handleCopy}
        className="shrink-0 mt-0.5 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted/60"
        title={`Copy share ${index} of ${total}`}
      >
        {copied ? (
          <Check className="size-3 text-green-400" />
        ) : (
          <Copy className="size-3 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}
