import { useState, useEffect, useCallback, useRef } from 'react';
import { Copy, Check, Upload, X } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

type Algorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
const ALGORITHMS: Algorithm[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

type Mode = 'hash' | 'hmac' | 'file';

// ── MD5 implementation (Web Crypto doesn't support MD5) ─────────────────────

function md5(input: Uint8Array): string {
  // Simple MD5 — produces hex string
  const K = new Uint32Array([
    0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
    0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
    0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
    0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
    0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
    0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
    0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
    0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391,
  ]);
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
    5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
    4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
    6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];

  const msgLen = input.length;
  const bitLen = msgLen * 8;
  const padLen = ((56 - (msgLen + 1) % 64) + 64) % 64;
  const totalLen = msgLen + 1 + padLen + 8;
  const msg = new Uint8Array(totalLen);
  msg.set(input);
  msg[msgLen] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(totalLen - 8, bitLen >>> 0, true);
  view.setUint32(totalLen - 4, Math.floor(bitLen / 0x100000000) >>> 0, true);

  let a0 = 0x67452301 >>> 0, b0 = 0xefcdab89 >>> 0, c0 = 0x98badcfe >>> 0, d0 = 0x10325476 >>> 0;
  const M = new Uint32Array(16);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let j = 0; j < 16; j++) M[j] = view.getUint32(offset + j * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16)      { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D;           g = (3 * i + 5) % 16; }
      else              { F = C ^ (B | ~D);        g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }

  const hex = (n: number) => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, n, true);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  };
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

// ── Hash helpers ────────────────────────────────────────────────────────────

async function computeHash(algorithm: Algorithm, data: Uint8Array): Promise<string> {
  if (algorithm === 'MD5') return md5(data);
  const buffer = await crypto.subtle.digest(algorithm, data);
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function computeHmac(algorithm: Algorithm, data: Uint8Array, secret: Uint8Array): Promise<string> {
  if (algorithm === 'MD5') {
    // HMAC-MD5 manual implementation
    const blockSize = 64;
    let key = secret;
    if (key.length > blockSize) {
      const h = md5(key);
      key = new Uint8Array(h.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    }
    const paddedKey = new Uint8Array(blockSize);
    paddedKey.set(key);
    const oKeyPad = new Uint8Array(blockSize);
    const iKeyPad = new Uint8Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
      oKeyPad[i] = paddedKey[i] ^ 0x5c;
      iKeyPad[i] = paddedKey[i] ^ 0x36;
    }
    const inner = new Uint8Array(blockSize + data.length);
    inner.set(iKeyPad);
    inner.set(data, blockSize);
    const innerHash = md5(inner);
    const innerBytes = new Uint8Array(innerHash.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const outer = new Uint8Array(blockSize + innerBytes.length);
    outer.set(oKeyPad);
    outer.set(innerBytes, blockSize);
    return md5(outer);
  }
  const subtleAlg = { name: 'HMAC', hash: algorithm };
  const key = await crypto.subtle.importKey('raw', secret, subtleAlg, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Component ───────────────────────────────────────────────────────────────

export function HashTool() {
  const [mode, setMode] = useState<Mode>('hash');
  const [input, setInput] = useState('');
  const [hmacSecret, setHmacSecret] = useState('');
  const [hashes, setHashes] = useState<Partial<Record<Algorithm, string>>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const fileDataRef = useRef<Uint8Array | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute hashes for text input
  useEffect(() => {
    if (mode === 'file') return;
    const text = input.trim();
    if (!text) { setHashes({}); return; }
    let cancelled = false;
    const data = new TextEncoder().encode(text);

    if (mode === 'hmac') {
      const secret = new TextEncoder().encode(hmacSecret);
      Promise.all(ALGORITHMS.map(async (alg) => [alg, await computeHmac(alg, data, secret)] as const))
        .then((results) => { if (!cancelled) setHashes(Object.fromEntries(results)); });
    } else {
      Promise.all(ALGORITHMS.map(async (alg) => [alg, await computeHash(alg, data)] as const))
        .then((results) => { if (!cancelled) setHashes(Object.fromEntries(results)); });
    }
    return () => { cancelled = true; };
  }, [input, mode, hmacSecret]);

  // Compute hashes for file
  const hashFile = useCallback(async (data: Uint8Array) => {
    const results = await Promise.all(ALGORITHMS.map(async (alg) => [alg, await computeHash(alg, data)] as const));
    setHashes(Object.fromEntries(results));
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const data = new Uint8Array(buf);
    fileDataRef.current = data;
    setFileName(file.name);
    setFileSize(file.size);
    hashFile(data);
    e.target.value = '';
  }, [hashFile]);

  const clearFile = useCallback(() => {
    fileDataRef.current = null;
    setFileName(null);
    setFileSize(0);
    setHashes({});
  }, []);

  const handleCopy = useCallback((key: string) => {
    const hash = hashes[key as Algorithm];
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, [hashes]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Mode selector */}
      <div className="flex rounded-md border border-border overflow-hidden text-xs w-fit">
        {(['hash', 'hmac', 'file'] as const).map((m, i) => (
          <button
            key={m}
            className={cn('px-3 py-1.5 capitalize transition-colors',
              i > 0 && 'border-l border-border',
              mode === m ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
            onClick={() => { setMode(m); setHashes({}); }}
          >
            {m === 'hmac' ? 'HMAC' : m === 'file' ? 'File' : 'Hash'}
          </button>
        ))}
      </div>

      {/* Input area */}
      {mode !== 'file' && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground font-medium">Input</label>
          <Textarea
            className="font-mono text-xs resize-none min-h-28"
            placeholder={mode === 'hmac' ? 'Enter message to authenticate…' : 'Enter text to hash…'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      {/* HMAC secret */}
      {mode === 'hmac' && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground font-medium">Secret Key</label>
          <Input
            className="font-mono text-xs"
            placeholder="Enter HMAC secret…"
            value={hmacSecret}
            onChange={(e) => setHmacSecret(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      {/* File input */}
      {mode === 'file' && (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-muted-foreground font-medium">File</label>
          {fileName ? (
            <div className="flex items-center gap-2 p-3 bg-muted/20 rounded-lg border border-border/50">
              <Upload className="size-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{fileName}</p>
                <p className="text-[10px] text-muted-foreground">{formatSize(fileSize)}</p>
              </div>
              <Button variant="ghost" size="icon-xs" onClick={clearFile}>
                <X className="size-3" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-border/50 rounded-lg hover:border-foreground/20 hover:bg-muted/20 transition-colors cursor-pointer"
            >
              <Upload className="size-5 text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground">Click to select a file</span>
            </button>
          )}
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
        </div>
      )}

      {/* MD5 warning */}
      {Object.keys(hashes).length > 0 && (
        <div className="text-[10px] text-yellow-500/70 flex items-center gap-1">
          ⚠ MD5 and SHA-1 are cryptographically broken — use SHA-256+ for security
        </div>
      )}

      {/* Hash results */}
      {Object.keys(hashes).length > 0 && (
        <div className="flex flex-col gap-2">
          {ALGORITHMS.map((alg) => (
            <div key={alg} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className={cn(
                  'text-xs font-mono font-medium text-muted-foreground',
                  (alg === 'MD5' || alg === 'SHA-1') && 'line-through decoration-muted-foreground/30',
                )}>
                  {mode === 'hmac' ? `HMAC-${alg}` : alg}
                </span>
                <Button variant="ghost" size="icon-xs" onClick={() => handleCopy(alg)}>
                  {copied === alg
                    ? <Check className="size-3 text-green-400" />
                    : <Copy className="size-3" />}
                </Button>
              </div>
              <div className="bg-muted/30 rounded-lg px-3 py-2 font-mono text-xs break-all border border-border text-foreground">
                {hashes[alg]}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
