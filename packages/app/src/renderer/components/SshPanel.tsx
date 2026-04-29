import { useState, useEffect, useCallback, useMemo } from "react";
import {
  KeyRound,
  RefreshCw,
  Play,
  Square,
  Lock,
  LockOpen,
  Trash2,
  Plus,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  ChevronUp,
  ChevronDown,
  X,
  ShieldCheck,
  ShieldOff,
  CircleAlert,
  GitBranch,
  ClipboardPaste,
  Wand2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type {
  AgentStatus,
  GenerateKeyOpts,
  KeyListing,
  LoadedKey,
  SshKey,
  SshOrgRule,
} from "../../shared/ssh-types";

type GenerateForm = {
  type: "ed25519" | "rsa" | "ecdsa";
  bits: string;
  filename: string;
  comment: string;
  passphrase: string;
  passphraseConfirm: string;
};

const DEFAULT_GENERATE_FORM: GenerateForm = {
  type: "ed25519",
  bits: "4096",
  filename: "id_ed25519",
  comment: "",
  passphrase: "",
  passphraseConfirm: "",
};

function statusPill(status: AgentStatus): {
  label: string;
  classes: string;
  icon: React.ReactNode;
} {
  if (!status.toolingAvailable) {
    return {
      label: "ssh-add not found",
      classes: "bg-destructive/10 text-destructive border-destructive/30",
      icon: <CircleAlert className="size-3" />,
    };
  }
  if (status.locked) {
    return {
      label: "Locked",
      classes: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
      icon: <Lock className="size-3" />,
    };
  }
  if (status.running) {
    return {
      label: "Running",
      classes: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      icon: <ShieldCheck className="size-3" />,
    };
  }
  return {
    label: "Stopped",
    classes: "bg-muted text-muted-foreground border-border",
    icon: <ShieldOff className="size-3" />,
  };
}

function algorithmStyle(algo: string): string {
  const upper = algo.toUpperCase();
  if (upper.includes("ED25519")) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (upper.includes("RSA")) return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  if (upper.includes("ECDSA")) return "bg-purple-500/15 text-purple-400 border-purple-500/30";
  if (upper.includes("DSA")) return "bg-red-500/15 text-red-400 border-red-500/30";
  return "bg-muted text-muted-foreground border-border";
}

type GitShellKind = "bash" | "powershell" | "cmd";

/**
 * Build a prefix snippet that sets `GIT_SSH_COMMAND` to use exactly this key
 * (ignoring the agent). The user pastes this, then types/pastes their own git
 * command — `git clone <url>`, `git fetch`, etc. `IdentitiesOnly=yes` ensures
 * only the supplied key is offered to the server.
 *
 * Quoting differs per shell:
 * - bash/zsh/sh: single-quoted env value, double-quoted path inside (handles spaces)
 * - PowerShell:  $env:VAR='...' literal; double-quoted path inside
 * - cmd.exe:     set "VAR=..." with doubled `""` around path for spaces
 *
 * Trailing space / `;` / `&&` so the user's command chains correctly when
 * pasted directly after the prefix.
 */
function buildGitCommand(shell: GitShellKind, keyPath: string): string {
  switch (shell) {
    case "bash":
      return `GIT_SSH_COMMAND='ssh -i "${keyPath}" -o IdentitiesOnly=yes' `;
    case "powershell":
      return `$env:GIT_SSH_COMMAND='ssh -i "${keyPath}" -o IdentitiesOnly=yes'; `;
    case "cmd":
      return `set "GIT_SSH_COMMAND=ssh -i ""${keyPath}"" -o IdentitiesOnly=yes" && `;
  }
}

// ── Smart-paste URL parsing & rule matching ─────────────────────────────────

type ParsedGitUrl = {
  host: string;
  owner: string;
  /** "ssh" (git@host:owner/...), "ssh-proto" (ssh://...), or "https" */
  scheme: "ssh" | "ssh-proto" | "https";
};

/**
 * Find a git remote URL in the pasted text and extract host + owner. Recognises:
 *   - scp form:   git@github.com:owner/repo.git
 *   - ssh proto:  ssh://git@github.com:22/owner/repo.git
 *   - https:      https://github.com/owner/repo.git
 *
 * Returns null if no URL is found.
 */
function parseGitUrl(input: string): ParsedGitUrl | null {
  // Try ssh:// proto first (most specific)
  const sshProto =
    /ssh:\/\/(?:[^\s@]+@)?([a-zA-Z0-9.-]+)(?::\d+)?\/([a-zA-Z0-9_.~-]+)\/[^\s]+/.exec(
      input,
    );
  if (sshProto) {
    return { host: sshProto[1], owner: sshProto[2], scheme: "ssh-proto" };
  }
  // scp form: user@host:owner/repo
  const scp =
    /(?:^|[\s'"])(?:[a-zA-Z0-9._-]+@)([a-zA-Z0-9.-]+):([a-zA-Z0-9_.~-]+)\/[^\s'"]+/.exec(
      input,
    );
  if (scp) {
    return { host: scp[1], owner: scp[2], scheme: "ssh" };
  }
  // https
  const https =
    /https?:\/\/([a-zA-Z0-9.-]+)\/([a-zA-Z0-9_.~-]+)\/[^\s]+/.exec(input);
  if (https) {
    return { host: https[1], owner: https[2], scheme: "https" };
  }
  return null;
}

function patternToRegex(pattern: string): RegExp {
  // Pattern is "host" or "host:owner"; if no `:`, treat as "host:*"
  const normalized = pattern.includes(":") ? pattern : `${pattern}:*`;
  // Escape regex metacharacters except `*`, then convert `*` to `.*`
  const escaped = normalized
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function findMatchingRule(
  parsed: ParsedGitUrl,
  rules: SshOrgRule[],
): SshOrgRule | null {
  const target = `${parsed.host}:${parsed.owner}`;
  for (const rule of rules) {
    try {
      if (patternToRegex(rule.pattern).test(target)) return rule;
    } catch {
      // Skip rules with invalid pattern syntax
    }
  }
  return null;
}

function GitCommandMenu({
  keyPath,
  defaultShell,
}: {
  keyPath: string;
  defaultShell: GitShellKind;
}) {
  const [copied, setCopied] = useState(false);

  const copy = (shell: GitShellKind) => {
    navigator.clipboard
      .writeText(buildGitCommand(shell, keyPath))
      .catch(() => {
        /* ignore */
      });
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            title="Copy git command using this key"
          />
        }
      >
        {copied ? <Check /> : <GitBranch />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <div className="px-1.5 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Copy git prefix for shell
        </div>
        <DropdownMenuItem onClick={() => copy("bash")}>
          Bash / Zsh / sh
          {defaultShell === "bash" && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              default
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => copy("powershell")}>
          PowerShell
          {defaultShell === "powershell" && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              default
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => copy("cmd")}>
          cmd.exe
          {defaultShell === "cmd" && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              default
            </span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="inline-flex items-center gap-1 p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {
          /* ignore */
        });
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title={label ?? "Copy"}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}

// ── Passphrase prompt ─────────────────────────────────────────────────────────

function PassphrasePrompt({
  title,
  message,
  onSubmit,
  onCancel,
  busy,
  error,
}: {
  title: string;
  message: string;
  onSubmit: (passphrase: string) => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-[28rem] max-w-[90vw] rounded-lg border border-border bg-background shadow-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold tracking-tight">{title}</span>
        </div>
        <p className="text-xs text-muted-foreground">{message}</p>
        <Input
          autoFocus
          type="password"
          placeholder="Passphrase"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit(value);
            if (e.key === "Escape") onCancel();
          }}
          className="h-8 text-xs font-mono"
        />
        {error && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md bg-red-500/10 border border-red-500/30 text-red-400">
            <AlertTriangle className="size-3.5 shrink-0" />
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onSubmit(value)}
            disabled={busy || !value}
          >
            {busy ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                Working
              </>
            ) : (
              "Confirm"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm prompt ────────────────────────────────────────────────────────────

function ConfirmPrompt({
  title,
  message,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-[26rem] max-w-[90vw] rounded-lg border border-border bg-background shadow-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          {destructive ? (
            <AlertTriangle className="size-4 text-destructive" />
          ) : (
            <CircleAlert className="size-4 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold tracking-tight">{title}</span>
        </div>
        <p className="text-xs text-muted-foreground">{message}</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Key card ──────────────────────────────────────────────────────────────────

function KeyCard({
  k,
  loadedIndex,
  loadedTotal,
  reorderable,
  defaultShell,
  onAdd,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDelete,
  onCopyPub,
  busy,
}: {
  k: SshKey;
  /** 1-based position when loaded, or 0 when not loaded */
  loadedIndex: number;
  loadedTotal: number;
  /** Whether the agent honors reorder requests on this platform */
  reorderable: boolean;
  /** Shell to mark as "default" in the git-command menu */
  defaultShell: GitShellKind;
  onAdd: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onCopyPub: () => void;
  busy: boolean;
}) {
  const isLoaded = loadedIndex > 0;
  const algoStyle = algorithmStyle(k.algorithm);

  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden transition-colors",
        isLoaded
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-border bg-muted/30",
      )}
    >
      <div className="px-3 py-2.5 flex items-start gap-3">
        {/* Priority indicator */}
        <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
          {isLoaded ? (
            <>
              <div className="size-7 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono text-xs font-semibold">
                {loadedIndex}
              </div>
              {reorderable && (
                <div className="flex flex-col">
                  <button
                    onClick={onMoveUp}
                    disabled={busy || loadedIndex <= 1}
                    className="size-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                    title="Move up"
                  >
                    <ChevronUp className="size-3" />
                  </button>
                  <button
                    onClick={onMoveDown}
                    disabled={busy || loadedIndex >= loadedTotal}
                    className="size-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                    title="Move down"
                  >
                    <ChevronDown className="size-3" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="size-7 rounded-md border border-border bg-background flex items-center justify-center">
              <KeyRound className="size-3.5 text-muted-foreground/60" />
            </div>
          )}
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">
              {k.name}
            </span>
            {k.algorithm !== "unknown" && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium border",
                  algoStyle,
                )}
              >
                {k.algorithm}
                {k.bits > 0 ? ` ${k.bits}` : ""}
              </span>
            )}
            {k.encrypted && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium border bg-yellow-500/10 text-yellow-400 border-yellow-500/30 inline-flex items-center gap-0.5">
                <Lock className="size-2.5" />
                Encrypted
              </span>
            )}
            {!k.hasPrivate && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium border bg-muted text-muted-foreground border-border">
                public-only
              </span>
            )}
          </div>
          {k.fingerprint && (
            <div className="mt-0.5 flex items-center gap-1 min-w-0">
              <span className="text-[11px] font-mono text-muted-foreground truncate">
                {k.fingerprint}
              </span>
              <CopyButton text={k.fingerprint} label="Copy fingerprint" />
            </div>
          )}
          {k.comment && (
            <div className="text-[11px] text-muted-foreground/80 truncate">
              {k.comment}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {k.publicPath && (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onCopyPub}
              title="Copy public key"
            >
              <Copy />
            </Button>
          )}
          {k.privatePath && (
            <GitCommandMenu
              keyPath={k.privatePath}
              defaultShell={defaultShell}
            />
          )}
          {isLoaded ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={onRemove}
              disabled={busy}
              className="text-muted-foreground hover:text-foreground"
              title="Remove from agent"
            >
              <X />
              Unload
            </Button>
          ) : (
            <Button
              size="xs"
              onClick={onAdd}
              disabled={busy || !k.hasPrivate}
              title={
                k.hasPrivate
                  ? "Add to agent"
                  : "No private key file — cannot add"
              }
            >
              <Plus />
              Load
            </Button>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            className="text-muted-foreground hover:text-destructive"
            title="Delete key files"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Generate form ─────────────────────────────────────────────────────────────

function GenerateSection({
  busy,
  onSubmit,
  onClose,
  error,
}: {
  busy: boolean;
  onSubmit: (opts: GenerateKeyOpts) => void;
  onClose: () => void;
  error: string | null;
}) {
  const [form, setForm] = useState<GenerateForm>(DEFAULT_GENERATE_FORM);

  // Sync default filename when type changes
  useEffect(() => {
    setForm((prev) => {
      if (prev.filename === "" || prev.filename.startsWith("id_")) {
        return { ...prev, filename: `id_${form.type}` };
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.type]);

  const passphraseMismatch =
    form.passphrase !== form.passphraseConfirm;

  const canSubmit =
    !busy &&
    form.filename.trim() !== "" &&
    !passphraseMismatch;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const opts: GenerateKeyOpts = {
      type: form.type,
      bits:
        form.type === "ed25519" ? undefined : parseInt(form.bits, 10) || 4096,
      filename: form.filename.trim(),
      comment: form.comment,
      passphrase: form.passphrase,
    };
    onSubmit(opts);
  };

  return (
    <div className="border border-border rounded-lg bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold tracking-tight">
            Generate new key
          </span>
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onClose}
          disabled={busy}
          title="Close"
        >
          <X />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
            Type
          </label>
          <select
            value={form.type}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                type: e.target.value as GenerateForm["type"],
              }))
            }
            className="w-full h-8 px-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="ed25519">Ed25519 (recommended)</option>
            <option value="rsa">RSA</option>
            <option value="ecdsa">ECDSA</option>
          </select>
        </div>
        {form.type !== "ed25519" && (
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
              Bits
            </label>
            <select
              value={form.bits}
              onChange={(e) =>
                setForm((p) => ({ ...p, bits: e.target.value }))
              }
              className="w-full h-8 px-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            >
              {form.type === "rsa" ? (
                <>
                  <option value="2048">2048</option>
                  <option value="3072">3072</option>
                  <option value="4096">4096</option>
                </>
              ) : (
                <>
                  <option value="256">P-256</option>
                  <option value="384">P-384</option>
                  <option value="521">P-521</option>
                </>
              )}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
          Filename
        </label>
        <Input
          className="h-8 text-xs font-mono"
          value={form.filename}
          onChange={(e) =>
            setForm((p) => ({ ...p, filename: e.target.value }))
          }
          placeholder="id_ed25519"
        />
      </div>

      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
          Comment
        </label>
        <Input
          className="h-8 text-xs"
          value={form.comment}
          onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
          placeholder="user@host"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
            Passphrase
          </label>
          <Input
            type="password"
            className="h-8 text-xs font-mono"
            value={form.passphrase}
            onChange={(e) =>
              setForm((p) => ({ ...p, passphrase: e.target.value }))
            }
            placeholder="(optional)"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
            Confirm
          </label>
          <Input
            type="password"
            className={cn(
              "h-8 text-xs font-mono",
              passphraseMismatch && form.passphraseConfirm
                ? "border-destructive"
                : "",
            )}
            value={form.passphraseConfirm}
            onChange={(e) =>
              setForm((p) => ({ ...p, passphraseConfirm: e.target.value }))
            }
            placeholder="(optional)"
          />
        </div>
      </div>

      {passphraseMismatch && form.passphraseConfirm && (
        <div className="text-[11px] text-destructive">
          Passphrases do not match
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md bg-red-500/10 border border-red-500/30 text-red-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={!canSubmit} size="sm">
          {busy ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              Generating
            </>
          ) : (
            <>
              <KeyRound />
              Generate
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Smart-paste tab ───────────────────────────────────────────────────────────

function RuleRow({
  rule,
  keys,
  isFirst,
  isLast,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  rule: SshOrgRule;
  keys: SshKey[];
  isFirst: boolean;
  isLast: boolean;
  onChange: (next: SshOrgRule) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 border border-border rounded-md bg-muted/20 px-2 py-1.5">
      <div className="flex flex-col">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="size-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
          title="Move up — earlier rules match first"
        >
          <ChevronUp className="size-3" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="size-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
          title="Move down"
        >
          <ChevronDown className="size-3" />
        </button>
      </div>
      <Input
        className="h-7 text-xs font-mono flex-1 min-w-0"
        placeholder="github.com:my-org   or   *.example.com"
        value={rule.pattern}
        onChange={(e) => onChange({ ...rule, pattern: e.target.value })}
      />
      <select
        value={rule.keyName}
        onChange={(e) => onChange({ ...rule, keyName: e.target.value })}
        className="h-7 px-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring max-w-44"
      >
        <option value="">— pick a key —</option>
        {keys
          .filter((k) => k.hasPrivate)
          .map((k) => (
            <option key={k.name} value={k.name}>
              {k.name}
            </option>
          ))}
      </select>
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={onDelete}
        className="text-muted-foreground hover:text-destructive"
        title="Delete rule"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function SmartPasteTab({
  keys,
  defaultShell,
  rules,
  setRules,
}: {
  keys: SshKey[];
  defaultShell: GitShellKind;
  rules: SshOrgRule[];
  setRules: (next: SshOrgRule[]) => void;
}) {
  const [input, setInput] = useState("");
  const [shell, setShell] = useState<GitShellKind>(defaultShell);
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => parseGitUrl(input), [input]);
  const matchedRule = useMemo(
    () => (parsed ? findMatchingRule(parsed, rules) : null),
    [parsed, rules],
  );
  const matchedKey = useMemo(
    () => (matchedRule ? keys.find((k) => k.name === matchedRule.keyName) : null),
    [matchedRule, keys],
  );

  const result = useMemo(() => {
    if (!input.trim()) return "";
    if (!matchedKey?.privatePath) return "";
    if (parsed?.scheme === "https") return ""; // SSH key irrelevant to HTTPS
    return buildGitCommand(shell, matchedKey.privatePath) + input;
  }, [input, matchedKey, parsed, shell]);

  const updateRule = useCallback(
    (id: string, next: SshOrgRule) => {
      setRules(rules.map((r) => (r.id === id ? next : r)));
    },
    [rules, setRules],
  );

  const moveRule = useCallback(
    (idx: number, dir: -1 | 1) => {
      const target = idx + dir;
      if (target < 0 || target >= rules.length) return;
      const next = [...rules];
      [next[idx], next[target]] = [next[target], next[idx]];
      setRules(next);
    },
    [rules, setRules],
  );

  const deleteRule = useCallback(
    (id: string) => setRules(rules.filter((r) => r.id !== id)),
    [rules, setRules],
  );

  const addRule = useCallback(() => {
    setRules([
      ...rules,
      { id: crypto.randomUUID(), pattern: "", keyName: "" },
    ]);
  }, [rules, setRules]);

  const copyResult = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(result).catch(() => {
      /* ignore */
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [result]);

  // Auto-copy on paste when a match is found
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const text = e.clipboardData.getData("text");
      // Wait for input to update, then auto-copy
      setTimeout(() => {
        const p = parseGitUrl(text);
        if (!p) return;
        const r = findMatchingRule(p, rules);
        if (!r) return;
        const k = keys.find((kk) => kk.name === r.keyName);
        if (!k?.privatePath) return;
        if (p.scheme === "https") return;
        const out = buildGitCommand(shell, k.privatePath) + text;
        navigator.clipboard.writeText(out).catch(() => {
          /* ignore */
        });
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }, 0);
    },
    [rules, keys, shell],
  );

  return (
    <div className="p-3 space-y-4">
      {/* Rules section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Rules ({rules.length})
          </div>
          <Button size="xs" variant="outline" onClick={addRule}>
            <Plus />
            Add rule
          </Button>
        </div>
        {rules.length === 0 ? (
          <div className="border border-dashed border-border rounded-md px-3 py-4 text-center text-[11px] text-muted-foreground">
            No rules yet. Add one to map a host or org to a key.
          </div>
        ) : (
          <div className="space-y-1.5">
            {rules.map((rule, idx) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                keys={keys}
                isFirst={idx === 0}
                isLast={idx === rules.length - 1}
                onChange={(next) => updateRule(rule.id, next)}
                onMoveUp={() => moveRule(idx, -1)}
                onMoveDown={() => moveRule(idx, 1)}
                onDelete={() => deleteRule(rule.id)}
              />
            ))}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground/80 leading-relaxed">
          Pattern syntax:{" "}
          <span className="font-mono text-foreground/80">host</span> or{" "}
          <span className="font-mono text-foreground/80">host:owner</span>; use{" "}
          <span className="font-mono text-foreground/80">*</span> as a glob.
          Examples:{" "}
          <span className="font-mono">github.com:my-work</span>,{" "}
          <span className="font-mono">github.com:work-*</span>,{" "}
          <span className="font-mono">*.gitlab.example.com</span>. First match
          wins — order them by specificity.
        </div>
      </div>

      {/* Smart paste box */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Paste a git command
          </div>
          <select
            value={shell}
            onChange={(e) => setShell(e.target.value as GitShellKind)}
            className="h-6 px-1.5 text-[11px] bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="bash">Bash / Zsh</option>
            <option value="powershell">PowerShell</option>
            <option value="cmd">cmd.exe</option>
          </select>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
          placeholder="git clone git@github.com:my-org/my-repo.git"
          rows={2}
          className="w-full px-2.5 py-1.5 text-xs font-mono bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 resize-none"
        />

        {/* Match status */}
        {input.trim() && (
          <>
            {!parsed ? (
              <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-md bg-muted/40 border border-border text-muted-foreground">
                <CircleAlert className="size-3.5 shrink-0" />
                No git URL detected in the pasted text.
              </div>
            ) : parsed.scheme === "https" ? (
              <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-300">
                <CircleAlert className="size-3.5 shrink-0" />
                HTTPS URL detected ({parsed.host}/{parsed.owner}). HTTPS
                doesn't use SSH keys — switch to an SSH URL or rewrite to{" "}
                <span className="font-mono">git@{parsed.host}:{parsed.owner}/…</span>
                .
              </div>
            ) : !matchedRule ? (
              <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-md bg-muted/40 border border-border text-muted-foreground">
                <CircleAlert className="size-3.5 shrink-0" />
                Detected{" "}
                <span className="font-mono text-foreground">
                  {parsed.host}:{parsed.owner}
                </span>
                . No matching rule — add one above.
              </div>
            ) : !matchedKey?.privatePath ? (
              <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-md bg-red-500/10 border border-red-500/30 text-red-400">
                <AlertTriangle className="size-3.5 shrink-0" />
                Rule matches but the referenced key{" "}
                <span className="font-mono">{matchedRule.keyName}</span> isn't
                on disk.
              </div>
            ) : (
              <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <Check className="size-3.5 shrink-0" />
                <span className="flex-1 truncate">
                  Matched{" "}
                  <span className="font-mono text-foreground">
                    {matchedRule.pattern}
                  </span>{" "}
                  → key{" "}
                  <span className="font-mono text-foreground">
                    {matchedKey.name}
                  </span>
                </span>
                {copied && (
                  <span className="text-[10px] text-emerald-400/80">
                    copied to clipboard
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Rewritten command
              </div>
              <Button
                size="xs"
                variant={copied ? "secondary" : "default"}
                onClick={copyResult}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="px-2.5 py-1.5 text-[11px] font-mono bg-background/60 border border-border rounded-md whitespace-pre-wrap break-all">
              {result}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

type PassphrasePromptState =
  | { kind: "add"; keyPath: string; retryError: string | null }
  | { kind: "lock"; retryError: string | null }
  | { kind: "unlock"; retryError: string | null }
  | {
      kind: "reorder";
      orderedPaths: string[];
      /** Encrypted keys still needing a passphrase, in prompt order */
      remainingEncrypted: SshKey[];
      collected: Record<string, string>;
      retryError: string | null;
    }
  | null;

type ConfirmState =
  | { kind: "remove-all" }
  | { kind: "delete-key"; name: string }
  | { kind: "stop-agent" }
  | null;

type TabId = "keys" | "smart-paste";

export function SshPanel({ panelId: _panelId }: { panelId: string }) {
  const [listing, setListing] = useState<KeyListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [passphrasePrompt, setPassphrasePrompt] =
    useState<PassphrasePromptState>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [filter, setFilter] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("keys");
  const [rules, setRulesState] = useState<SshOrgRule[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.ssh.listKeys();
      setListing(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load rules once on mount
  useEffect(() => {
    window.electronAPI.ssh
      .rulesList()
      .then(setRulesState)
      .catch((e) => setError(String(e)));
  }, []);

  // Persist rule edits — debounced so we're not writing on every keystroke
  const setRules = useCallback((next: SshOrgRule[]) => {
    setRulesState(next);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      window.electronAPI.ssh.rulesSave(rules).catch(() => {
        /* ignore — best-effort save */
      });
    }, 400);
    return () => clearTimeout(t);
  }, [rules]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const status = listing?.status;
  const keys = listing?.keys ?? [];
  const loaded = listing?.loaded ?? [];
  const loadedOrder = listing?.loadedOrder ?? [];

  const fingerprintToOrder = useMemo(() => {
    const map = new Map<string, number>();
    loadedOrder.forEach((fp, i) => map.set(fp, i + 1));
    return map;
  }, [loadedOrder]);

  // Sort: loaded keys (in agent order) first, then unloaded (alpha)
  const sortedKeys = useMemo(() => {
    const lower = filter.trim().toLowerCase();
    const filtered = lower
      ? keys.filter(
          (k) =>
            k.name.toLowerCase().includes(lower) ||
            k.comment.toLowerCase().includes(lower) ||
            k.fingerprint.toLowerCase().includes(lower),
        )
      : keys;
    return [...filtered].sort((a, b) => {
      const aOrd = fingerprintToOrder.get(a.fingerprint) ?? Infinity;
      const bOrd = fingerprintToOrder.get(b.fingerprint) ?? Infinity;
      if (aOrd !== bOrd) return aOrd - bOrd;
      return a.name.localeCompare(b.name);
    });
  }, [keys, fingerprintToOrder, filter]);

  // Loaded keys that we have on disk (needed to reconstruct paths for reorder)
  const loadedDiskKeys = useMemo(() => {
    return loadedOrder
      .map((fp) => keys.find((k) => k.fingerprint === fp))
      .filter((k): k is SshKey => !!k && k.privatePath !== null);
  }, [loadedOrder, keys]);

  const handleAdd = useCallback(
    async (k: SshKey, passphrase?: string) => {
      if (!k.privatePath) return;
      // Skip the probe round-trip when we already detected encryption from the
      // key file. ssh-add on Windows can hang waiting for a console prompt
      // even with askpass forced off, so we prefer to ask up-front.
      if (k.encrypted && passphrase === undefined) {
        setPassphrasePrompt({
          kind: "add",
          keyPath: k.privatePath,
          retryError: null,
        });
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await window.electronAPI.ssh.agentAdd(
          k.privatePath,
          passphrase,
        );
        if (result.success) {
          setPassphrasePrompt(null);
          await refresh();
          return;
        }
        if ("needsPassphrase" in result && result.needsPassphrase) {
          setPassphrasePrompt({
            kind: "add",
            keyPath: k.privatePath,
            retryError: passphrase ? result.error : null,
          });
        } else {
          setError(result.error);
          setPassphrasePrompt(null);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleAddByPath = useCallback(
    async (keyPath: string, passphrase: string) => {
      const k = keys.find((x) => x.privatePath === keyPath);
      if (!k) return;
      await handleAdd(k, passphrase);
    },
    [keys, handleAdd],
  );

  const handleRemove = useCallback(
    async (k: SshKey) => {
      if (!k.privatePath) return;
      setBusy(true);
      setError(null);
      try {
        const result = await window.electronAPI.ssh.agentRemove(k.privatePath);
        if (!result.success) setError(result.error);
        await refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  /**
   * Reorder by clearing the agent and re-adding all loaded keys in the new
   * order. Encrypted keys need their passphrase to re-add, so we collect them
   * up-front via the passphrase prompt and pass them all to the IPC at once.
   */
  const runReorder = useCallback(
    async (paths: string[], passphrases: Record<string, string>) => {
      setBusy(true);
      setError(null);
      try {
        const result = await window.electronAPI.ssh.agentReorder(
          paths,
          passphrases,
        );
        if (!result.success) setError(result.error);
        await refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleMove = useCallback(
    (k: SshKey, direction: "up" | "down") => {
      const currentIdx = loadedDiskKeys.findIndex(
        (x) => x.fingerprint === k.fingerprint,
      );
      if (currentIdx === -1) return;
      const targetIdx =
        direction === "up" ? currentIdx - 1 : currentIdx + 1;
      if (targetIdx < 0 || targetIdx >= loadedDiskKeys.length) return;

      const reordered = [...loadedDiskKeys];
      [reordered[currentIdx], reordered[targetIdx]] = [
        reordered[targetIdx],
        reordered[currentIdx],
      ];

      const orderedPaths = reordered.map((x) => x.privatePath!);
      const encrypted = reordered.filter((x) => x.encrypted);

      if (encrypted.length === 0) {
        runReorder(orderedPaths, {});
        return;
      }

      setPassphrasePrompt({
        kind: "reorder",
        orderedPaths,
        remainingEncrypted: encrypted,
        collected: {},
        retryError: null,
      });
    },
    [loadedDiskKeys, runReorder],
  );

  const submitReorderPassphrase = useCallback(
    (passphrase: string) => {
      if (passphrasePrompt?.kind !== "reorder") return;
      const [current, ...rest] = passphrasePrompt.remainingEncrypted;
      if (!current?.privatePath) return;
      const collected = {
        ...passphrasePrompt.collected,
        [current.privatePath]: passphrase,
      };
      if (rest.length === 0) {
        // All collected — close the prompt before kicking off the reorder so a
        // re-render of the modal can't re-fire it (StrictMode / concurrent).
        setPassphrasePrompt(null);
        runReorder(passphrasePrompt.orderedPaths, collected);
      } else {
        setPassphrasePrompt({
          ...passphrasePrompt,
          remainingEncrypted: rest,
          collected,
          retryError: null,
        });
      }
    },
    [passphrasePrompt, runReorder],
  );

  const handleAgentStart = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.electronAPI.ssh.agentStart();
      if (!result.success) setError(result.error);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const handleAgentStop = useCallback(async () => {
    setBusy(true);
    setError(null);
    setConfirmState(null);
    try {
      const result = await window.electronAPI.ssh.agentStop();
      if (!result.success) setError(result.error);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const handleRemoveAll = useCallback(async () => {
    setBusy(true);
    setError(null);
    setConfirmState(null);
    try {
      const result = await window.electronAPI.ssh.agentRemoveAll();
      if (!result.success) setError(result.error);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const handleLock = useCallback(
    async (passphrase: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await window.electronAPI.ssh.agentLock(passphrase);
        if (!result.success) {
          setPassphrasePrompt({ kind: "lock", retryError: result.error });
          return;
        }
        setPassphrasePrompt(null);
        await refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleUnlock = useCallback(
    async (passphrase: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await window.electronAPI.ssh.agentUnlock(passphrase);
        if (!result.success) {
          setPassphrasePrompt({ kind: "unlock", retryError: result.error });
          return;
        }
        setPassphrasePrompt(null);
        await refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (name: string) => {
      setBusy(true);
      setError(null);
      setConfirmState(null);
      try {
        const result = await window.electronAPI.ssh.keysDelete(name);
        if (!result.success) setError(result.error);
        await refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleGenerate = useCallback(
    async (opts: GenerateKeyOpts) => {
      setBusy(true);
      setGenerateError(null);
      try {
        const result = await window.electronAPI.ssh.keysGenerate(opts);
        if (!result.success) {
          setGenerateError(result.error);
          return;
        }
        setGenerateOpen(false);
        await refresh();
      } catch (e) {
        setGenerateError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleCopyPub = useCallback(async (k: SshKey) => {
    if (!k.publicPath) return;
    try {
      const result = await window.electronAPI.ssh.keysReadPublic(k.publicPath);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      await navigator.clipboard.writeText(result.content);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const pill = status ? statusPill(status) : null;
  const loadedSet = useMemo(
    () => new Set(loaded.map((l) => l.fingerprint)),
    [loaded],
  );

  // Default shell suggested in the "Use for git" menu — PowerShell on Windows,
  // bash everywhere else.
  const defaultShell: GitShellKind =
    status?.platform === "win32" ? "powershell" : "bash";
  const orphanedLoaded = loaded.filter(
    (l) => !keys.some((k) => k.fingerprint === l.fingerprint),
  );

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 h-10 px-3 border-b border-border shrink-0">
        <KeyRound className="size-4 text-muted-foreground" />
        <span className="text-xs font-semibold tracking-tight">
          SSH Agent / Keys
        </span>
        {pill && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium border ml-1",
              pill.classes,
            )}
          >
            {pill.icon}
            {pill.label}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={refresh}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-0.5 px-3 pt-2 pb-1 border-b border-border shrink-0">
        <button
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors",
            activeTab === "keys"
              ? "bg-muted text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
          onClick={() => setActiveTab("keys")}
        >
          <KeyRound className="size-3" />
          Keys
        </button>
        <button
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors",
            activeTab === "smart-paste"
              ? "bg-muted text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
          onClick={() => setActiveTab("smart-paste")}
        >
          <Wand2 className="size-3" />
          Smart paste
          {rules.length > 0 && (
            <span className="text-[10px] text-muted-foreground/70">
              ({rules.length})
            </span>
          )}
        </button>
      </div>

      {activeTab === "smart-paste" ? (
        <div className="flex-1 overflow-y-auto">
          <SmartPasteTab
            keys={keys}
            defaultShell={defaultShell}
            rules={rules}
            setRules={setRules}
          />
        </div>
      ) : (
      <>
      {/* Agent control bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
        {status?.running ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setConfirmState({ kind: "stop-agent" })}
            disabled={busy || !status.toolingAvailable}
            title={
              status.platform === "win32"
                ? "Stop Windows ssh-agent service"
                : "Stop ssh-agent process"
            }
          >
            <Square />
            Stop agent
          </Button>
        ) : (
          <Button
            size="xs"
            onClick={handleAgentStart}
            disabled={busy || !status?.toolingAvailable}
            title={
              status?.platform === "win32"
                ? "Start Windows ssh-agent service (may need admin)"
                : "Start a new ssh-agent process"
            }
          >
            <Play />
            Start agent
          </Button>
        )}

        {status?.running && !status.locked && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              setPassphrasePrompt({ kind: "lock", retryError: null })
            }
            disabled={busy}
          >
            <Lock />
            Lock
          </Button>
        )}
        {status?.running && status.locked && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              setPassphrasePrompt({ kind: "unlock", retryError: null })
            }
            disabled={busy}
          >
            <LockOpen />
            Unlock
          </Button>
        )}

        {status?.running && !status.locked && loaded.length > 0 && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setConfirmState({ kind: "remove-all" })}
            disabled={busy}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
            Unload all
          </Button>
        )}

        <div className="flex-1 min-w-2" />

        <Input
          className="w-48 h-7 text-xs"
          placeholder="Filter keys..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <Button
          size="xs"
          variant={generateOpen ? "secondary" : "outline"}
          onClick={() => {
            setGenerateOpen((v) => !v);
            setGenerateError(null);
          }}
          disabled={busy}
        >
          <Plus />
          New key
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-3">
          {/* Status detail / hints */}
          {status && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              <div className="border border-border rounded-md bg-muted/20 px-2.5 py-1.5">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  ~/.ssh
                </div>
                <div className="font-mono text-foreground/90 truncate">
                  {status.sshDir}
                </div>
              </div>
              <div className="border border-border rounded-md bg-muted/20 px-2.5 py-1.5">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Socket
                </div>
                <div className="font-mono text-foreground/90 truncate">
                  {status.socket ?? "—"}
                </div>
              </div>
              <div className="border border-border rounded-md bg-muted/20 px-2.5 py-1.5">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {status.platform === "win32" ? "Service" : "PID"}
                </div>
                <div className="font-mono text-foreground/90 truncate">
                  {status.platform === "win32"
                    ? status.windowsService?.available
                      ? `${status.windowsService.status} (${status.windowsService.startType})`
                      : "Not installed"
                    : (status.pid ?? "—")}
                </div>
              </div>
            </div>
          )}

          {status?.note && (
            <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-300">
              <CircleAlert className="size-3.5 shrink-0" />
              {status.note}
            </div>
          )}

          {status &&
            !status.supportsReorder &&
            loadedDiskKeys.length > 1 && (
              <div className="flex items-start gap-2 px-3 py-1.5 text-[11px] rounded-md bg-muted/40 border border-border text-muted-foreground">
                <CircleAlert className="size-3.5 shrink-0 mt-0.5" />
                <div>
                  Windows ssh-agent persists keys to the registry and lists
                  them in a fixed order, so reordering inside the agent isn't
                  possible. For connection priority, set{" "}
                  <span className="font-mono text-foreground">
                    IdentityFile
                  </span>{" "}
                  entries in{" "}
                  <span className="font-mono text-foreground">
                    ~/.ssh/config
                  </span>
                  .
                </div>
              </div>
            )}

          {!status?.toolingAvailable && (
            <div className="flex items-start gap-2 px-3 py-2 text-xs rounded-md bg-red-500/10 border border-red-500/30 text-red-400">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-medium">
                  ssh-add / ssh-keygen not found on PATH
                </div>
                <div className="text-[11px] text-red-400/80">
                  Install OpenSSH client tools.
                  {status?.platform === "win32" &&
                    " On Windows: Settings → Apps → Optional Features → Add Feature → 'OpenSSH Client'."}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 text-xs rounded-md bg-red-500/10 border border-red-500/30 text-red-400">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button
                className="text-red-400/60 hover:text-red-400"
                onClick={() => setError(null)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {generateOpen && (
            <GenerateSection
              busy={busy}
              error={generateError}
              onSubmit={handleGenerate}
              onClose={() => {
                setGenerateOpen(false);
                setGenerateError(null);
              }}
            />
          )}

          {/* Keys list */}
          {loading && !listing ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
              <Loader2 className="size-4 animate-spin mr-2" />
              Loading keys...
            </div>
          ) : sortedKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <KeyRound className="size-8 opacity-40" />
              <p className="text-xs">
                {filter
                  ? "No keys match the filter"
                  : `No SSH keys found in ${status?.sshDir ?? "~/.ssh"}`}
              </p>
              {!filter && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setGenerateOpen(true)}
                >
                  <Plus />
                  Generate your first key
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Section header for loaded keys */}
              {loadedDiskKeys.length > 0 && (
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pt-1">
                  In agent ({loadedDiskKeys.length})
                </div>
              )}
              {sortedKeys
                .filter((k) => loadedSet.has(k.fingerprint))
                .map((k) => (
                  <KeyCard
                    key={k.name}
                    k={k}
                    loadedIndex={fingerprintToOrder.get(k.fingerprint) ?? 0}
                    loadedTotal={loadedDiskKeys.length}
                    reorderable={status?.supportsReorder ?? true}
                    defaultShell={defaultShell}
                    onAdd={() => handleAdd(k)}
                    onRemove={() => handleRemove(k)}
                    onMoveUp={() => handleMove(k, "up")}
                    onMoveDown={() => handleMove(k, "down")}
                    onDelete={() =>
                      setConfirmState({ kind: "delete-key", name: k.name })
                    }
                    onCopyPub={() => handleCopyPub(k)}
                    busy={busy}
                  />
                ))}

              {/* Available but not loaded */}
              {sortedKeys.some((k) => !loadedSet.has(k.fingerprint)) && (
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pt-2">
                  Available
                </div>
              )}
              {sortedKeys
                .filter((k) => !loadedSet.has(k.fingerprint))
                .map((k) => (
                  <KeyCard
                    key={k.name}
                    k={k}
                    loadedIndex={0}
                    loadedTotal={loadedDiskKeys.length}
                    reorderable={status?.supportsReorder ?? true}
                    defaultShell={defaultShell}
                    onAdd={() => handleAdd(k)}
                    onRemove={() => handleRemove(k)}
                    onMoveUp={() => handleMove(k, "up")}
                    onMoveDown={() => handleMove(k, "down")}
                    onDelete={() =>
                      setConfirmState({ kind: "delete-key", name: k.name })
                    }
                    onCopyPub={() => handleCopyPub(k)}
                    busy={busy}
                  />
                ))}
            </div>
          )}

          {/* Orphaned: loaded in agent but not on disk */}
          {orphanedLoaded.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                In agent only (no matching file)
              </div>
              {orphanedLoaded.map((l: LoadedKey) => (
                <div
                  key={l.fingerprint}
                  className="border border-border rounded-lg bg-muted/30 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium border",
                        algorithmStyle(l.algorithm),
                      )}
                    >
                      {l.algorithm} {l.bits}
                    </span>
                    <span className="text-xs font-semibold truncate">
                      {l.comment || "(no comment)"}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate">
                    {l.fingerprint}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {/* Modals */}
      {passphrasePrompt?.kind === "add" && (
        <PassphrasePrompt
          title="Add key to agent"
          message="This key is encrypted. Enter the passphrase to load it."
          busy={busy}
          error={passphrasePrompt.retryError}
          onCancel={() => {
            setPassphrasePrompt(null);
            setBusy(false);
          }}
          onSubmit={(pass) =>
            handleAddByPath(passphrasePrompt.keyPath, pass)
          }
        />
      )}
      {passphrasePrompt?.kind === "lock" && (
        <PassphrasePrompt
          title="Lock agent"
          message="Choose a passphrase. The agent will reject all key requests until unlocked."
          busy={busy}
          error={passphrasePrompt.retryError}
          onCancel={() => setPassphrasePrompt(null)}
          onSubmit={handleLock}
        />
      )}
      {passphrasePrompt?.kind === "unlock" && (
        <PassphrasePrompt
          title="Unlock agent"
          message="Enter the passphrase used when the agent was locked."
          busy={busy}
          error={passphrasePrompt.retryError}
          onCancel={() => setPassphrasePrompt(null)}
          onSubmit={handleUnlock}
        />
      )}
      {passphrasePrompt?.kind === "reorder" &&
        passphrasePrompt.remainingEncrypted[0] && (
          <PassphrasePrompt
            title={`Passphrase for ${passphrasePrompt.remainingEncrypted[0].name}`}
            message={
              passphrasePrompt.remainingEncrypted.length === 1
                ? "Reordering re-loads each key. Enter the passphrase for this encrypted key to continue."
                : `Reordering re-loads each key. ${passphrasePrompt.remainingEncrypted.length} encrypted keys still need passphrases.`
            }
            busy={busy}
            error={passphrasePrompt.retryError}
            onCancel={() => setPassphrasePrompt(null)}
            onSubmit={submitReorderPassphrase}
          />
        )}

      {confirmState?.kind === "remove-all" && (
        <ConfirmPrompt
          title="Unload all keys"
          message="Remove every identity from the running ssh-agent? Key files on disk are not deleted."
          confirmLabel="Unload all"
          destructive
          busy={busy}
          onCancel={() => setConfirmState(null)}
          onConfirm={handleRemoveAll}
        />
      )}
      {confirmState?.kind === "stop-agent" && (
        <ConfirmPrompt
          title="Stop ssh-agent"
          message={
            status?.platform === "win32"
              ? "Stop the Windows ssh-agent service? This may require Administrator privileges."
              : "Terminate the running ssh-agent process? Loaded keys will be cleared."
          }
          confirmLabel="Stop"
          destructive
          busy={busy}
          onCancel={() => setConfirmState(null)}
          onConfirm={handleAgentStop}
        />
      )}
      {confirmState?.kind === "delete-key" && (
        <ConfirmPrompt
          title="Delete key files"
          message={`Permanently delete the private and public key files for "${confirmState.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          destructive
          busy={busy}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => handleDelete(confirmState.name)}
        />
      )}
    </div>
  );
}
