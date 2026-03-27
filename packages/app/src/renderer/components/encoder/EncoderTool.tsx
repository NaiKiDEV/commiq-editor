import { useState, useCallback } from 'react';
import { Copy, Check, ArrowDownUp } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { cn } from '@/lib/utils';

type EncoderToolProps = {
  encodeFn: (input: string) => string;
  decodeFn: (input: string) => string;
  inputPlaceholder?: string;
};

export function EncoderTool({ encodeFn, decodeFn, inputPlaceholder }: EncoderToolProps) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = useCallback((fn: (s: string) => string) => {
    try {
      setOutput(fn(input));
      setError(null);
    } catch (e) {
      setOutput('');
      setError((e as Error).message);
    }
  }, [input]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  const handleSwap = useCallback(() => {
    setInput(output);
    setOutput('');
    setError(null);
  }, [output]);

  return (
    <div className="flex flex-col gap-3 p-4 h-full overflow-y-auto">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground font-medium">Input</label>
        <Textarea
          className="font-mono text-xs resize-none min-h-28"
          placeholder={inputPlaceholder ?? 'Paste text here…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button size="xs" onClick={() => run(encodeFn)} disabled={!input.trim()}>
          Encode
        </Button>
        <Button size="xs" variant="outline" onClick={() => run(decodeFn)} disabled={!input.trim()}>
          Decode
        </Button>
        {output && (
          <Button size="xs" variant="ghost" onClick={handleSwap} className="gap-1 ml-1">
            <ArrowDownUp className="size-3" /> Use as input
          </Button>
        )}
        {error && (
          <span className="text-xs text-red-400 ml-auto truncate max-w-56" title={error}>
            {error}
          </span>
        )}
      </div>

      {output && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground font-medium">Output</label>
            <Button variant="ghost" size="icon-xs" onClick={handleCopy}>
              {copied ? <Check className="size-3 text-green-400" /> : <Copy className="size-3" />}
            </Button>
          </div>
          <pre className={cn(
            'bg-muted/30 rounded-lg px-3 py-2.5 text-xs font-mono break-all whitespace-pre-wrap',
            'border border-border text-foreground',
          )}>
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
