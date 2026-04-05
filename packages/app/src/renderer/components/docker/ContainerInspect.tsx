import { useEffect, useState } from 'react';
import { Loader2, Copy, Check } from 'lucide-react';
import { Button } from '../ui/button';
import type { DockerContainer } from './types';

type Props = { container: DockerContainer };

export function ContainerInspect({ container }: Props) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    window.electronAPI.docker
      .inspectContainer(container.ID)
      .then((result) => {
        if (result && typeof result === 'object' && 'error' in result) {
          setError((result as { error: string }).error);
        } else {
          setData(result);
        }
      })
      .finally(() => setLoading(false));
  }, [container.ID]);

  const handleCopy = () => {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Loading inspect data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-destructive px-4 text-center">
        {error}
      </div>
    );
  }

  const formatted = JSON.stringify(data, null, 2);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end gap-1 px-4 py-1.5 border-b border-border shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={handleCopy} title="Copy JSON">
          {copied ? <Check className="size-3 text-green-400" /> : <Copy className="size-3" />}
        </Button>
      </div>
      <pre className="flex-1 overflow-auto px-4 py-3 text-[11px] font-mono leading-5 bg-background whitespace-pre text-foreground/85">
        {colorizeJson(formatted)}
      </pre>
    </div>
  );
}

function colorizeJson(json: string): React.ReactNode {
  // Simple regex-based JSON syntax highlighting
  const tokens = json.split(
    /("(?:[^"\\]|\\.)*"(?:\s*:)?|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
  );
  return (
    <>
      {tokens.map((token, i) => {
        if (i % 2 === 0) return <span key={i}>{token}</span>;
        if (token.endsWith(':')) {
          return (
            <span key={i} className="text-blue-400">
              {token}
            </span>
          );
        }
        if (token.startsWith('"')) {
          return (
            <span key={i} className="text-green-400">
              {token}
            </span>
          );
        }
        if (token === 'true' || token === 'false') {
          return (
            <span key={i} className="text-yellow-400">
              {token}
            </span>
          );
        }
        if (token === 'null') {
          return (
            <span key={i} className="text-muted-foreground">
              {token}
            </span>
          );
        }
        return (
          <span key={i} className="text-orange-400">
            {token}
          </span>
        );
      })}
    </>
  );
}
