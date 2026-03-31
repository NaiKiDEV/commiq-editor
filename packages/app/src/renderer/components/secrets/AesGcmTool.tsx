import { useState, useCallback } from "react";
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { cn } from "@/lib/utils";

type Mode = "encrypt" | "decrypt";

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(
    new Uint8Array(16),
  ) as Uint8Array<ArrayBuffer>;
  const iv = crypto.getRandomValues(
    new Uint8Array(12),
  ) as Uint8Array<ArrayBuffer>;
  const key = await deriveKey(password, salt);
  const data = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );

  const combined = new Uint8Array(
    salt.length + iv.length + ciphertext.byteLength,
  );
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encoded: string, password: string): Promise<string> {
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  if (combined.length < 29) throw new Error("Invalid ciphertext: too short");

  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ciphertext = combined.slice(28);

  const key = await deriveKey(password, salt);
  let plainBuffer: ArrayBuffer;
  try {
    plainBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
  } catch {
    throw new Error("Incorrect password or corrupted data");
  }
  return new TextDecoder().decode(plainBuffer);
}

export function AesGcmTool() {
  const [mode, setMode] = useState<Mode>("encrypt");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Mode toggle */}
      <div className="flex gap-1 p-3 shrink-0">
        <button
          onClick={() => setMode("encrypt")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border",
            mode === "encrypt"
              ? "bg-blue-500/15 border-blue-500/40 text-blue-300 shadow-sm shadow-blue-500/20"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          <Lock className="size-3" />
          Encrypt
        </button>
        <button
          onClick={() => setMode("decrypt")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border",
            mode === "decrypt"
              ? "bg-blue-500/15 border-blue-500/40 text-blue-300 shadow-sm shadow-blue-500/20"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          <LockOpen className="size-3" />
          Decrypt
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {mode === "encrypt" ? <EncryptView /> : <DecryptView />}
      </div>
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex items-center">
      <Input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs pr-8 font-mono"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="size-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

function EncryptView() {
  const [plaintext, setPlaintext] = useState("");
  const [password, setPassword] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fresh, setFresh] = useState(false);

  const handleEncrypt = useCallback(async () => {
    setProcessing(true);
    setFresh(false);
    try {
      const result = await encrypt(plaintext, password);
      setOutput(result);
      setError(null);
      setFresh(true);
      setTimeout(() => setFresh(false), 1200);
    } catch (e) {
      setOutput("");
      setError((e as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [plaintext, password]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  const canEncrypt = Boolean(plaintext.trim() && password && !processing);

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          Plaintext
        </label>
        <Textarea
          className="font-mono text-xs resize-none min-h-20"
          placeholder="Enter text to encrypt…"
          value={plaintext}
          onChange={(e) => setPlaintext(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          Password
        </label>
        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder="Encryption password…"
        />
        <p className="text-[10px] text-muted-foreground/50 pl-0.5">
          PBKDF2-SHA256 · 600k iterations · 256-bit key
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleEncrypt}
          disabled={!canEncrypt}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150",
            "bg-blue-500/20 border border-blue-500/40 text-blue-300",
            "hover:bg-blue-500/30 hover:border-blue-500/60",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          {processing ? <Spinner /> : <Lock className="size-3" />}
          {processing ? "Encrypting…" : "Encrypt"}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 rounded-lg px-3 py-2 bg-red-500/10 border border-red-500/25">
          <ShieldAlert className="size-3 text-red-400 shrink-0 mt-0.5" />
          <span className="text-xs text-red-400 wrap-break-word">{error}</span>
        </div>
      )}

      {output && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="size-3 text-blue-400" />
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                Encrypted (Base64)
              </label>
            </div>
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
                ? "bg-blue-500/10 border-blue-500/40 shadow-sm shadow-blue-500/20"
                : "bg-muted/30 border-border",
            )}
          >
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}

function DecryptView() {
  const [ciphertext, setCiphertext] = useState("");
  const [password, setPassword] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fresh, setFresh] = useState(false);

  const handleDecrypt = useCallback(async () => {
    setProcessing(true);
    setFresh(false);
    try {
      const result = await decrypt(ciphertext.trim(), password);
      setOutput(result);
      setError(null);
      setFresh(true);
      setTimeout(() => setFresh(false), 1200);
    } catch (e) {
      setOutput("");
      setError((e as Error).message);
    } finally {
      setProcessing(false);
    }
  }, [ciphertext, password]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  const canDecrypt = Boolean(ciphertext.trim() && password && !processing);

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          Ciphertext (Base64)
        </label>
        <Textarea
          className="font-mono text-xs resize-none min-h-20"
          placeholder="Paste encrypted text…"
          value={ciphertext}
          onChange={(e) => setCiphertext(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          Password
        </label>
        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder="Decryption password…"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleDecrypt}
          disabled={!canDecrypt}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150",
            "bg-blue-500/20 border border-blue-500/40 text-blue-300",
            "hover:bg-blue-500/30 hover:border-blue-500/60",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          {processing ? <Spinner /> : <LockOpen className="size-3" />}
          {processing ? "Decrypting…" : "Decrypt"}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 rounded-lg px-3 py-2 bg-red-500/10 border border-red-500/25">
          <ShieldAlert className="size-3 text-red-400 shrink-0 mt-0.5" />
          <span className="text-xs text-red-400 wrap-break-word">{error}</span>
        </div>
      )}

      {output && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="size-3 text-blue-400" />
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                Decrypted Plaintext
              </label>
            </div>
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
                ? "bg-blue-500/10 border-blue-500/40 shadow-sm shadow-blue-500/20"
                : "bg-muted/30 border-border",
            )}
          >
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
