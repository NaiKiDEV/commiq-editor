import { useState, useCallback } from "react";
import {
  Copy,
  Check,
  Plus,
  Trash2,
  GitFork,
  Puzzle,
  AlertCircle,
  ClipboardPaste,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { ShareCard } from "./ShareCard";
import {
  splitSecret,
  reconstructSecret,
  encodeShare,
  decodeShare,
} from "./shamir";
import { cn } from "@/lib/utils";

type Mode = "split" | "reconstruct";

export function ShamirTool() {
  const [mode, setMode] = useState<Mode>("split");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex gap-1 p-3 shrink-0">
        <button
          onClick={() => setMode("split")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border",
            mode === "split"
              ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          <GitFork className="size-3" />
          Split
        </button>
        <button
          onClick={() => setMode("reconstruct")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border",
            mode === "reconstruct"
              ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          <Puzzle className="size-3" />
          Reconstruct
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {mode === "split" ? <SplitView /> : <ReconstructView />}
      </div>
    </div>
  );
}

function SplitView() {
  const [secret, setSecret] = useState("");
  const [totalSharesStr, setTotalSharesStr] = useState("5");
  const [thresholdStr, setThresholdStr] = useState("3");
  const [shares, setShares] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const totalShares = Math.max(
    2,
    Math.min(255, parseInt(totalSharesStr, 10) || 2),
  );
  const threshold = Math.max(
    2,
    Math.min(totalShares, parseInt(thresholdStr, 10) || 2),
  );

  const handleSplit = useCallback(() => {
    try {
      const data = new TextEncoder().encode(secret);
      const result = splitSecret(data, totalShares, threshold);
      setShares(result.map(encodeShare));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setShares([]);
    }
  }, [secret, totalShares, threshold]);

  const handleCopyAll = useCallback(() => {
    const text = shares.join("\n");
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }, [shares]);

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          Secret
        </label>
        <Textarea
          className="font-mono text-xs resize-none min-h-20"
          placeholder="Enter the secret to split…"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          spellCheck={false}
        />
      </div>

      {/* N/K config + visual threshold indicator */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              Total Shares (N)
            </label>
            <Input
              type="text"
              inputMode="numeric"
              value={totalSharesStr}
              onChange={(e) =>
                setTotalSharesStr(e.target.value.replace(/[^0-9]/g, ""))
              }
              className="text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              Threshold (K)
            </label>
            <Input
              type="text"
              inputMode="numeric"
              value={thresholdStr}
              onChange={(e) =>
                setThresholdStr(e.target.value.replace(/[^0-9]/g, ""))
              }
              className="text-xs"
            />
          </div>
        </div>

        {/* Visual slot bar */}
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: Math.min(totalShares, 20) }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 min-w-3 rounded-full transition-colors duration-200",
                i < threshold ? "bg-violet-500/70" : "bg-muted/60",
              )}
            />
          ))}
          {totalShares > 20 && (
            <span className="text-[10px] text-muted-foreground/50 self-center ml-1">
              +{totalShares - 20}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/50 -mt-1">
          Any {threshold} of {totalShares} shares can reconstruct the secret
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSplit}
          disabled={!secret.trim()}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150",
            "bg-violet-500/20 border border-violet-500/40 text-violet-300",
            "hover:bg-violet-500/30 hover:border-violet-500/60",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          <GitFork className="size-3" />
          Split Secret
        </button>
        {error && (
          <div className="flex items-center gap-1 ml-auto">
            <AlertCircle className="size-3 text-red-400 shrink-0" />
            <span
              className="text-xs text-red-400 truncate max-w-48"
              title={error}
            >
              {error}
            </span>
          </div>
        )}
      </div>

      {shares.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              Generated Shares
            </label>
            <Button
              variant="ghost"
              size="xs"
              className="gap-1"
              onClick={handleCopyAll}
            >
              {copiedAll ? (
                <Check className="size-3 text-green-400" />
              ) : (
                <Copy className="size-3" />
              )}
              Copy All
            </Button>
          </div>
          {shares.map((share, i) => (
            <ShareCard
              key={i}
              index={i + 1}
              total={shares.length}
              value={share}
              accentClass="bg-violet-500/8 border-violet-500/20"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReconstructView() {
  const [shareInputs, setShareInputs] = useState<string[]>(["", ""]);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fresh, setFresh] = useState(false);

  const updateShare = useCallback((index: number, value: string) => {
    setShareInputs((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const addShare = useCallback(() => {
    setShareInputs((prev) => [...prev, ""]);
  }, []);

  const removeShare = useCallback((index: number) => {
    setShareInputs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const filledCount = shareInputs.filter((s) => s.trim()).length;

  const handleReconstruct = useCallback(() => {
    try {
      const shares = shareInputs
        .filter((s) => s.trim())
        .map((hex) => {
          const cleaned = hex.replace(/^share\s*\d+\s*:\s*/i, "");
          return decodeShare(cleaned);
        });
      const secret = reconstructSecret(shares);
      setResult(new TextDecoder().decode(secret));
      setError(null);
      setFresh(true);
      setTimeout(() => setFresh(false), 1200);
    } catch (e) {
      setResult(null);
      setFresh(false);
      setError((e as Error).message);
    }
  }, [shareInputs]);

  const handleCopy = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
            Paste Shares
          </label>
          <span
            className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded-md border transition-colors",
              filledCount >= 2
                ? "bg-violet-500/15 border-violet-500/30 text-violet-300"
                : "bg-muted/30 border-border text-muted-foreground",
            )}
          >
            {filledCount} filled
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="xs"
            className="gap-1"
            onClick={async () => {
              const text = await navigator.clipboard.readText();
              const parsed = text
                .split(/\r?\n/)
                .map((l) => l.replace(/^share\s*\d+\s*:\s*/i, "").trim())
                .filter(Boolean);
              if (parsed.length) setShareInputs(parsed);
            }}
          >
            <ClipboardPaste className="size-3" /> Paste All
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="gap-1"
            onClick={addShare}
          >
            <Plus className="size-3" /> Add
          </Button>
        </div>
      </div>

      {shareInputs.map((value, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span
            className={cn(
              "text-[10px] font-mono pt-2 w-5 shrink-0 text-right transition-colors",
              value.trim() ? "text-violet-400" : "text-muted-foreground/50",
            )}
          >
            {i + 1}
          </span>
          <Textarea
            className={cn(
              "font-mono text-xs resize-none min-h-10 flex-1 transition-colors",
              value.trim() && "border-violet-500/30",
            )}
            placeholder={`Share ${i + 1} hex…`}
            value={value}
            onChange={(e) => updateShare(i, e.target.value)}
            spellCheck={false}
            rows={2}
          />
          {shareInputs.length > 2 && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="mt-1.5 shrink-0"
              onClick={() => removeShare(i)}
            >
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <button
          onClick={handleReconstruct}
          disabled={filledCount < 2}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150",
            "bg-violet-500/20 border border-violet-500/40 text-violet-300",
            "hover:bg-violet-500/30 hover:border-violet-500/60",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          <Puzzle className="size-3" />
          Reconstruct
        </button>
        {error && (
          <div className="flex items-center gap-1 ml-auto">
            <AlertCircle className="size-3 text-red-400 shrink-0" />
            <span
              className="text-xs text-red-400 truncate max-w-48"
              title={error}
            >
              {error}
            </span>
          </div>
        )}
      </div>

      {result !== null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              Reconstructed Secret
            </label>
            <Button variant="ghost" size="icon-xs" onClick={handleCopy}>
              {copied ? (
                <Check className="size-3 text-green-400" />
              ) : (
                <Copy className="size-3" />
              )}
            </Button>
          </div>
          <pre
            className={cn(
              "rounded-lg px-3 py-2.5 text-xs font-mono break-all whitespace-pre-wrap",
              "border text-foreground transition-all duration-500",
              fresh
                ? "bg-violet-500/10 border-violet-500/40 shadow-sm shadow-violet-500/20"
                : "bg-muted/30 border-border",
            )}
          >
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
