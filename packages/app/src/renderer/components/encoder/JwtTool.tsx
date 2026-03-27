import { useState, useMemo, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

type ParsedJwt = {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
};

function JsonBlock({
  label,
  data,
}: {
  label: string;
  data: Record<string, unknown>;
}) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button variant="ghost" size="icon-xs" onClick={handleCopy}>
          {copied ? <Check className="size-3 text-green-400" /> : <Copy className="size-3" />}
        </Button>
      </div>
      <pre className="bg-muted/30 rounded-lg px-3 py-2.5 text-xs font-mono whitespace-pre-wrap break-words border border-border text-foreground overflow-x-auto">
        {text}
      </pre>
    </div>
  );
}

export function JwtTool() {
  const [input, setInput] = useState('');

  const parsed = useMemo<ParsedJwt | string | null>(() => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const parts = trimmed.split('.');
    if (parts.length !== 3) return 'Invalid JWT — expected 3 dot-separated parts';
    try {
      return {
        header: JSON.parse(base64UrlDecode(parts[0])),
        payload: JSON.parse(base64UrlDecode(parts[1])),
        signature: parts[2],
      };
    } catch {
      return 'Failed to decode JWT — invalid encoding';
    }
  }, [input]);

  const jwt = typeof parsed === 'object' && parsed !== null && 'header' in parsed
    ? parsed as ParsedJwt
    : null;

  const error = typeof parsed === 'string' ? parsed : null;

  const exp = jwt?.payload.exp as number | undefined;
  const iat = jwt?.payload.iat as number | undefined;
  const nbf = jwt?.payload.nbf as number | undefined;
  const nowSec = Date.now() / 1000;
  const isExpired = exp !== undefined && nowSec > exp;
  const isNotYetValid = nbf !== undefined && nowSec < nbf;

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground font-medium">JWT</label>
        <Textarea
          className="font-mono text-xs resize-none min-h-20"
          placeholder="Paste a JWT token…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
        />
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {jwt && (
        <>
          {/* Validity strip */}
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs',
            isExpired || isNotYetValid
              ? 'border-red-500/30 bg-red-500/10 text-red-400'
              : 'border-green-500/30 bg-green-500/10 text-green-400',
          )}>
            <span className="font-medium">
              {isExpired ? 'Expired' : isNotYetValid ? 'Not yet valid' : 'Valid'}
            </span>
            {exp !== undefined && (
              <span className="text-inherit/70">
                · exp {new Date(exp * 1000).toLocaleString()}
              </span>
            )}
            {iat !== undefined && (
              <span className="text-inherit/70 ml-auto">
                iat {new Date(iat * 1000).toLocaleString()}
              </span>
            )}
          </div>

          <JsonBlock label="Header" data={jwt.header} />
          <JsonBlock label="Payload" data={jwt.payload} />

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Signature</span>
            <div className="bg-muted/30 rounded-lg px-3 py-2 font-mono text-xs break-all border border-border text-muted-foreground">
              {jwt.signature}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
