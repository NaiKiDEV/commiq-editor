import { useState, useEffect, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';

type Algorithm = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
const ALGORITHMS: Algorithm[] = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

async function computeHash(algorithm: Algorithm, text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest(algorithm, data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function HashTool() {
  const [input, setInput] = useState('');
  const [hashes, setHashes] = useState<Partial<Record<Algorithm, string>>>({});
  const [copied, setCopied] = useState<Algorithm | null>(null);

  useEffect(() => {
    if (!input.trim()) {
      setHashes({});
      return;
    }
    let cancelled = false;
    Promise.all(ALGORITHMS.map(async (alg) => [alg, await computeHash(alg, input)] as const))
      .then((results) => {
        if (!cancelled) setHashes(Object.fromEntries(results));
      });
    return () => { cancelled = true; };
  }, [input]);

  const handleCopy = useCallback((alg: Algorithm) => {
    const hash = hashes[alg];
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopied(alg);
    setTimeout(() => setCopied(null), 2000);
  }, [hashes]);

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground font-medium">Input</label>
        <Textarea
          className="font-mono text-xs resize-none min-h-28"
          placeholder="Enter text to hash…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
        />
      </div>

      {Object.keys(hashes).length > 0 && (
        <div className="flex flex-col gap-2">
          {ALGORITHMS.map((alg) => (
            <div key={alg} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-medium text-muted-foreground">{alg}</span>
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
