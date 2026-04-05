import { useState, useCallback, useRef, useMemo } from "react";
import {
  ShieldAlert,
  Globe,
  FileText,
  KeyRound,
  Link2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Plus,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type CertInfo = {
  subject: Record<string, string>;
  issuer: Record<string, string>;
  sans: string[];
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  fingerprint: string;
  signatureAlgorithm: string;
  publicKeyAlgorithm: string;
  keyBits: number;
  isCA: boolean;
  pem: string;
};

type TabId = "inspect" | "decode" | "generate" | "chain";

// ── Helpers ───────────────────────────────────────────────────────────────────

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysUntil(iso: string): number {
  return Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
}

function expiryColor(iso: string): string {
  const d = daysUntil(iso);
  if (d < 0) return "bg-red-500";
  if (d < 7) return "bg-red-500";
  if (d < 30) return "bg-orange-500";
  if (d < 90) return "bg-yellow-500";
  return "bg-emerald-500";
}

function expiryTextColor(iso: string): string {
  const d = daysUntil(iso);
  if (d < 0) return "text-red-400";
  if (d < 7) return "text-red-400";
  if (d < 30) return "text-orange-400";
  if (d < 90) return "text-yellow-400";
  return "text-emerald-400";
}

function expiryLabel(iso: string): string {
  const d = daysUntil(iso);
  if (d < 0) return `Expired ${Math.abs(d)} days ago`;
  if (d === 0) return "Expires today";
  if (d === 1) return "Expires tomorrow";
  return `${d} days remaining`;
}

function expiryPercent(notBefore: string, notAfter: string): number {
  const start = new Date(notBefore).getTime();
  const end = new Date(notAfter).getTime();
  const now = Date.now();
  if (now >= end) return 100;
  if (now <= start) return 0;
  return Math.round(((now - start) / (end - start)) * 100);
}

// ── Copy Button ───────────────────────────────────────────────────────────────

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className={cn(
        "p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors",
        className,
      )}
      onClick={() => {
        copyToClipboard(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}

// ── Cert Card ─────────────────────────────────────────────────────────────────

function CertCard({
  cert,
  index,
  defaultOpen,
}: {
  cert: CertInfo;
  index: number;
  defaultOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen ?? false);
  const cn_ = cert.subject.CN ?? Object.values(cert.subject)[0] ?? "Unknown";
  const issuerCn =
    cert.issuer.CN ?? Object.values(cert.issuer)[0] ?? "Unknown";
  const pct = expiryPercent(cert.notBefore, cert.notAfter);

  return (
    <div className="border border-border rounded-lg bg-muted/30 overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">
              [{index}]
            </span>
            <span className="text-sm font-semibold text-foreground truncate">
              {cn_}
            </span>
            {cert.isCA && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 font-medium">
                CA
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            Issued by: {issuerCn}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "text-[11px] font-medium",
              expiryTextColor(cert.notAfter),
            )}
          >
            {expiryLabel(cert.notAfter)}
          </span>
        </div>
      </button>

      {/* Expiry bar */}
      <div className="px-3 pb-1">
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", expiryColor(cert.notAfter))}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-3">
          {/* SANs */}
          {cert.sans.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Subject Alternative Names
              </div>
              <div className="flex flex-wrap gap-1">
                {cert.sans.map((san, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-1.5 py-0.5 rounded bg-muted border border-border font-mono"
                  >
                    {san}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Validity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                Not Before
              </div>
              <div className="text-xs font-mono">
                {formatDate(cert.notBefore)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                Not After
              </div>
              <div className="text-xs font-mono">
                {formatDate(cert.notAfter)}
              </div>
            </div>
          </div>

          {/* Subject / Issuer */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                Subject
              </div>
              <div className="text-xs font-mono space-y-0.5">
                {Object.entries(cert.subject).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-muted-foreground">{k}=</span>
                    {v}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                Issuer
              </div>
              <div className="text-xs font-mono space-y-0.5">
                {Object.entries(cert.issuer).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-muted-foreground">{k}=</span>
                    {v}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Technical details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                Serial Number
              </div>
              <div className="text-[11px] font-mono break-all">
                {cert.serialNumber}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                Fingerprint (SHA-256)
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-mono break-all">
                  {cert.fingerprint.slice(0, 32)}...
                </span>
                <CopyButton text={cert.fingerprint} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                Signature
              </div>
              <div className="text-xs font-mono">
                {cert.signatureAlgorithm}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                Key Algorithm
              </div>
              <div className="text-xs font-mono">
                {cert.publicKeyAlgorithm}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                Key Bits
              </div>
              <div className="text-xs font-mono">
                {cert.keyBits || "—"}
              </div>
            </div>
          </div>

          {/* PEM */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                PEM
              </div>
              <CopyButton text={cert.pem} />
            </div>
            <pre className="text-[10px] font-mono bg-background/60 border border-border rounded p-2 max-h-24 overflow-auto whitespace-pre-wrap break-all">
              {cert.pem}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab A: Host Inspector ─────────────────────────────────────────────────────

function HostInspector({
  onChain,
}: {
  onChain: (chain: CertInfo[]) => void;
}) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("443");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chain, setChain] = useState<CertInfo[] | null>(null);

  const inspect = useCallback(async () => {
    if (!host.trim()) return;
    setLoading(true);
    setError(null);
    setChain(null);
    try {
      const result = await window.electronAPI.ssl.inspect(
        host.trim(),
        parseInt(port) || 443,
      );
      if ("error" in result) {
        setError(result.error);
      } else if (result.length === 0) {
        setError('No certificates returned by host');
      } else {
        setChain(result);
        onChain(result);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [host, port, onChain]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="hostname (e.g. google.com)"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && inspect()}
          className="flex-1 min-w-0 h-8 px-2.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
        />
        <input
          type="text"
          placeholder="443"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && inspect()}
          className="w-20 h-8 px-2.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 font-mono"
        />
        <button
          className="h-8 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
          onClick={inspect}
          disabled={loading || !host.trim()}
        >
          {loading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Globe className="size-3" />
          )}
          Inspect
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs rounded-md bg-red-500/10 border border-red-500/30 text-red-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {chain && chain.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {chain.length} certificate{chain.length > 1 ? "s" : ""} in chain
          </div>
          {chain.map((cert, i) => (
            <CertCard key={i} cert={cert} index={i} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab B: PEM/DER Decoder ────────────────────────────────────────────────────

function PemDecoder() {
  const [pem, setPem] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [certs, setCerts] = useState<CertInfo[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const decode = useCallback(async (input: string) => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setCerts(null);
    try {
      const result = await window.electronAPI.ssl.decodePem(input.trim());
      if ("error" in result) {
        setError(result.error);
      } else {
        setCerts(result);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        setPem(text);
        decode(text);
      };
      reader.readAsText(file);
    },
    [decode],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <div className="space-y-3">
      <div
        className="relative"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <textarea
          placeholder="Paste PEM or base64-encoded DER certificate here, or drag & drop a file..."
          value={pem}
          onChange={(e) => setPem(e.target.value)}
          className="w-full h-36 px-3 py-2 text-xs font-mono bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 resize-none"
        />
        <input
          ref={fileRef}
          type="file"
          accept=".pem,.crt,.cer,.der"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      <div className="flex gap-2">
        <button
          className="h-8 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
          onClick={() => decode(pem)}
          disabled={loading || !pem.trim()}
        >
          {loading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <FileText className="size-3" />
          )}
          Decode
        </button>
        <button
          className="h-8 px-3 text-xs font-medium bg-muted text-foreground rounded-md hover:bg-muted/80 flex items-center gap-1.5"
          onClick={() => fileRef.current?.click()}
        >
          <FileText className="size-3" />
          Open File
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs rounded-md bg-red-500/10 border border-red-500/30 text-red-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {certs && certs.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {certs.length} certificate{certs.length > 1 ? "s" : ""} decoded
          </div>
          {certs.map((cert, i) => (
            <CertCard key={i} cert={cert} index={i} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab C: Self-Signed Generator ──────────────────────────────────────────────

function SelfSignedGenerator() {
  const [commonName, setCommonName] = useState("localhost");
  const [sanList, setSanList] = useState<string[]>(["localhost", "127.0.0.1"]);
  const [sanInput, setSanInput] = useState("");
  const [days, setDays] = useState("365");
  const [keyAlgo, setKeyAlgo] = useState<"rsa" | "ec">("rsa");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    cert: string;
    key: string;
  } | null>(null);

  const addSan = useCallback(() => {
    const v = sanInput.trim();
    if (v && !sanList.includes(v)) {
      setSanList((prev) => [...prev, v]);
      setSanInput("");
    }
  }, [sanInput, sanList]);

  const removeSan = useCallback((idx: number) => {
    setSanList((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const generate = useCallback(async () => {
    if (!commonName.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await window.electronAPI.ssl.generateSelfSigned({
        commonName: commonName.trim(),
        sans: sanList,
        days: parseInt(days) || 365,
        keyAlgorithm: keyAlgo,
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        setResult(res);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [commonName, sanList, days, keyAlgo]);

  return (
    <div className="space-y-3">
      {/* Common Name */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
          Common Name (CN)
        </label>
        <input
          type="text"
          value={commonName}
          onChange={(e) => setCommonName(e.target.value)}
          className="w-full h-8 px-2.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
        />
      </div>

      {/* SANs */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
          Subject Alternative Names
        </label>
        <div className="flex flex-wrap gap-1 mb-1.5">
          {sanList.map((san, i) => (
            <span
              key={i}
              className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-muted border border-border font-mono"
            >
              {san}
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => removeSan(i)}
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder="Add SAN..."
            value={sanInput}
            onChange={(e) => setSanInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSan()}
            className="flex-1 min-w-0 h-7 px-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 font-mono"
          />
          <button
            className="h-7 px-2 text-xs bg-muted rounded-md hover:bg-muted/80"
            onClick={addSan}
          >
            <Plus className="size-3" />
          </button>
        </div>
      </div>

      {/* Days + Key Algorithm */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
            Validity (days)
          </label>
          <input
            type="number"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            min={1}
            max={3650}
            className="w-full h-8 px-2.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
            Key Algorithm
          </label>
          <select
            value={keyAlgo}
            onChange={(e) => setKeyAlgo(e.target.value as "rsa" | "ec")}
            className="w-full h-8 px-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="rsa">RSA 2048</option>
            <option value="ec">EC P-256</option>
          </select>
        </div>
      </div>

      <button
        className="h-8 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
        onClick={generate}
        disabled={loading || !commonName.trim()}
      >
        {loading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <KeyRound className="size-3" />
        )}
        Generate
      </button>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs rounded-md bg-red-500/10 border border-red-500/30 text-red-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Certificate (PEM)
              </label>
              <CopyButton text={result.cert} />
            </div>
            <textarea
              readOnly
              value={result.cert}
              className="w-full h-28 px-3 py-2 text-[10px] font-mono bg-background/60 border border-border rounded-md resize-none"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Private Key (PEM)
              </label>
              <CopyButton text={result.key} />
            </div>
            <textarea
              readOnly
              value={result.key}
              className="w-full h-28 px-3 py-2 text-[10px] font-mono bg-background/60 border border-border rounded-md resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab D: Trust Chain Viewer ─────────────────────────────────────────────────

function TrustChainViewer({ chain }: { chain: CertInfo[] | null }) {
  const issues = useMemo(() => {
    if (!chain || chain.length === 0) return [];
    const warnings: Array<{ index: number; message: string }> = [];

    chain.forEach((cert, i) => {
      // Check expired
      if (daysUntil(cert.notAfter) < 0) {
        warnings.push({ index: i, message: "Certificate is expired" });
      } else if (daysUntil(cert.notAfter) < 7) {
        warnings.push({
          index: i,
          message: `Expires in ${daysUntil(cert.notAfter)} days`,
        });
      }

      // Check short key
      if (cert.publicKeyAlgorithm === "rsa" && cert.keyBits < 2048) {
        warnings.push({
          index: i,
          message: `Weak RSA key: ${cert.keyBits} bits`,
        });
      }

      // Self-signed leaf
      if (
        i === 0 &&
        cert.subject.CN === cert.issuer.CN &&
        chain.length === 1
      ) {
        warnings.push({ index: i, message: "Self-signed certificate (leaf)" });
      }
    });

    return warnings;
  }, [chain]);

  if (!chain || chain.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Link2 className="size-8 mb-3 opacity-40" />
        <p className="text-xs">No chain data available.</p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          Use the Host Inspector to fetch a certificate chain first.
        </p>
      </div>
    );
  }

  const chainLabels = chain.map((cert, i) => {
    if (i === 0) return "Leaf";
    if (i === chain.length - 1) return "Root";
    return "Intermediate";
  });

  return (
    <div className="space-y-3">
      {/* Issues */}
      {issues.length > 0 && (
        <div className="space-y-1">
          {issues.map((issue, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md bg-orange-500/10 border border-orange-500/30 text-orange-400"
            >
              <AlertTriangle className="size-3 shrink-0" />
              <span>
                [{issue.index}] {issue.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Vertical timeline */}
      <div className="relative pl-6">
        {chain.map((cert, i) => {
          const cn_ =
            cert.subject.CN ?? Object.values(cert.subject)[0] ?? "Unknown";
          return (
            <div key={i} className="relative pb-4 last:pb-0">
              {/* Connecting line */}
              {i < chain.length - 1 && (
                <div className="absolute -left-4 top-5 bottom-0 w-px bg-border" />
              )}
              {/* Dot */}
              <div
                className={cn(
                  "absolute -left-5 top-1.5 size-2.5 rounded-full border-2 border-background",
                  i === 0
                    ? "bg-blue-500"
                    : i === chain.length - 1
                      ? "bg-emerald-500"
                      : "bg-yellow-500",
                )}
              />

              <div className="border border-border rounded-lg bg-muted/30 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium border",
                      i === 0
                        ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                        : i === chain.length - 1
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
                    )}
                  >
                    {chainLabels[i]}
                  </span>
                  <span className="text-sm font-semibold truncate">
                    {cn_}
                  </span>
                  {cert.isCA && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 font-medium">
                      CA
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">Algo: </span>
                    <span className="font-mono">
                      {cert.publicKeyAlgorithm}
                      {cert.keyBits ? ` ${cert.keyBits}` : ""}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sig: </span>
                    <span className="font-mono">
                      {cert.signatureAlgorithm}
                    </span>
                  </div>
                  <div className={expiryTextColor(cert.notAfter)}>
                    {expiryLabel(cert.notAfter)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "inspect", label: "Host Inspector", icon: <Globe className="size-3" /> },
  {
    id: "decode",
    label: "PEM Decoder",
    icon: <FileText className="size-3" />,
  },
  {
    id: "generate",
    label: "Self-Signed",
    icon: <KeyRound className="size-3" />,
  },
  { id: "chain", label: "Trust Chain", icon: <Link2 className="size-3" /> },
];

export function SslInspectorPanel({
  panelId: _panelId,
}: {
  panelId: string;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("inspect");
  const [lastChain, setLastChain] = useState<CertInfo[] | null>(null);

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 h-10 px-3 border-b border-border shrink-0">
        <ShieldAlert className="size-4 text-muted-foreground" />
        <span className="text-xs font-semibold tracking-tight">
          SSL / Certificate Inspector
        </span>
      </div>

      {/* Tab strip */}
      <div className="flex gap-0.5 px-3 pt-2 pb-1 border-b border-border shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors",
              activeTab === tab.id
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "inspect" && (
          <HostInspector onChain={setLastChain} />
        )}
        {activeTab === "decode" && <PemDecoder />}
        {activeTab === "generate" && <SelfSignedGenerator />}
        {activeTab === "chain" && <TrustChainViewer chain={lastChain} />}
      </div>
    </div>
  );
}
