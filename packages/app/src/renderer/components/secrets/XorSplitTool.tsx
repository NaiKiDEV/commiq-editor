import { useState, useCallback } from "react";
import {
  Copy,
  Check,
  Plus,
  Trash2,
  Zap,
  Puzzle,
  AlertCircle,
  ClipboardPaste,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { ShareCard } from "./ShareCard";
import { cn } from "@/lib/utils";

type Mode = "split" | "reconstruct";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, "").toLowerCase();
  if (clean.length % 2 !== 0) throw new Error("Invalid hex length");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    if (isNaN(bytes[i])) throw new Error("Invalid hex character");
  }
  return bytes;
}

export function XorSplitTool() {
  const [mode, setMode] = useState<Mode>("split");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex gap-1 p-3 shrink-0">
        <button
          onClick={() => setMode("split")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border",
            mode === "split"
              ? "bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm shadow-amber-500/20"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          <Zap className="size-3" />
          Split
        </button>
        <button
          onClick={() => setMode("reconstruct")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border",
            mode === "reconstruct"
              ? "bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm shadow-amber-500/20"
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
  const [numSharesStr, setNumSharesStr] = useState("3");
  const [shares, setShares] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const numShares = Math.max(2, Math.min(10, parseInt(numSharesStr, 10) || 2));

  const handleSplit = useCallback(() => {
    try {
      const data = new TextEncoder().encode(secret);
      const parts: Uint8Array[] = [];

      for (let i = 0; i < numShares - 1; i++) {
        const part = new Uint8Array(data.length);
        crypto.getRandomValues(part);
        parts.push(part);
      }

      const last = new Uint8Array(data.length);
      for (let byteIdx = 0; byteIdx < data.length; byteIdx++) {
        let val = data[byteIdx];
        for (const part of parts) val ^= part[byteIdx];
        last[byteIdx] = val;
      }
      parts.push(last);

      setShares(parts.map(toHex));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setShares([]);
    }
  }, [secret, numShares]);

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

      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5 w-36">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
            Number of Shares
          </label>
          <Input
            type="text"
            inputMode="numeric"
            value={numSharesStr}
            onChange={(e) =>
              setNumSharesStr(e.target.value.replace(/[^0-9]/g, ""))
            }
            className="text-xs"
          />
        </div>
        <p className="text-[10px] text-muted-foreground/50 pb-1.5">
          All {numShares} shares required
        </p>
      </div>

      {/* Visual share slots */}
      <div className="flex gap-1">
        {Array.from({ length: Math.min(numShares, 10) }).map((_, i) => (
          <div key={i} className="h-1.5 flex-1 rounded-full bg-amber-500/50" />
        ))}
        {numShares > 10 && (
          <span className="text-[10px] text-muted-foreground/50 self-center ml-1">
            +{numShares - 10}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSplit}
          disabled={!secret.trim()}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150",
            "bg-amber-500/20 border border-amber-500/40 text-amber-300",
            "hover:bg-amber-500/30 hover:border-amber-500/60",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          <Zap className="size-3" />
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
              accentClass="bg-amber-500/8 border-amber-500/20"
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
      const parts = shareInputs
        .filter((s) => s.trim())
        .map((hex) => {
          const cleaned = hex.replace(/^share\s*\d+\s*:\s*/i, "");
          return fromHex(cleaned);
        });

      if (parts.length < 2) throw new Error("Need at least 2 shares");

      const len = parts[0].length;
      if (!parts.every((p) => p.length === len)) {
        throw new Error("All shares must be the same length");
      }

      const secret = new Uint8Array(len);
      for (let byteIdx = 0; byteIdx < len; byteIdx++) {
        let val = 0;
        for (const part of parts) val ^= part[byteIdx];
        secret[byteIdx] = val;
      }

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
            Paste All Shares
          </label>
          <span
            className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded-md border transition-colors",
              filledCount >= 2
                ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
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
          <Button variant="ghost" size="xs" className="gap-1" onClick={addShare}>
            <Plus className="size-3" /> Add
          </Button>
        </div>
      </div>

      {shareInputs.map((value, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span
            className={cn(
              "text-[10px] font-mono pt-2 w-5 shrink-0 text-right transition-colors",
              value.trim() ? "text-amber-400" : "text-muted-foreground/50",
            )}
          >
            {i + 1}
          </span>
          <Textarea
            className={cn(
              "font-mono text-xs resize-none min-h-10 flex-1 transition-colors",
              value.trim() && "border-amber-500/30",
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
            "bg-amber-500/20 border border-amber-500/40 text-amber-300",
            "hover:bg-amber-500/30 hover:border-amber-500/60",
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
                ? "bg-amber-500/10 border-amber-500/40 shadow-sm shadow-amber-500/20"
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
