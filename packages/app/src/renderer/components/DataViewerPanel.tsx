import { useState, useMemo, useCallback } from 'react';
import { Copy, Check, WrapText, ArrowRightLeft, Braces } from 'lucide-react';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { DataEditor } from './data-viewer/DataEditor';
import { TypeScriptPanel } from './data-viewer/TypeScriptPanel';
import { detectFormat, validateFormat, parseData, type DataFormat } from './data-viewer/detect';
import { convertData, serialize } from './data-viewer/convert';

const FORMAT_LABELS: Record<DataFormat, string> = {
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
};

const CONVERT_TARGETS: Record<DataFormat, DataFormat[]> = {
  json: ['yaml', 'toml'],
  yaml: ['json', 'toml'],
  toml: ['json', 'yaml'],
};

export function DataViewerPanel({ panelId: _panelId }: { panelId: string }) {
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<DataFormat>('json');
  const [showTs, setShowTs] = useState(false);
  const [copied, setCopied] = useState(false);

  // Validate and parse
  const error = useMemo(
    () => (content.trim() ? validateFormat(content, format) : null),
    [content, format],
  );

  const parsedData = useMemo(() => {
    if (!content.trim() || error) return null;
    try {
      return parseData(content, format);
    } catch {
      return null;
    }
  }, [content, format, error]);

  // Auto-detect on paste
  const handleChange = useCallback((value: string) => {
    setContent(value);
    if (value.trim()) {
      const detected = detectFormat(value);
      if (detected && detected !== format) setFormat(detected);
    }
  }, [format]);

  const handleFormatSelect = useCallback((fmt: DataFormat) => {
    setFormat(fmt);
    if (showTs && fmt !== 'json') setShowTs(false);
  }, [showTs]);

  const handlePrettify = useCallback(() => {
    if (!content.trim() || error) return;
    try {
      const data = parseData(content, format);
      setContent(serialize(data, format));
    } catch { /* ignore */ }
  }, [content, format, error]);

  const handleConvert = useCallback((to: DataFormat) => {
    if (!content.trim() || error) return;
    try {
      setContent(convertData(content, format, to));
      setFormat(to);
      if (showTs && to !== 'json') setShowTs(false);
    } catch { /* ignore */ }
  }, [content, format, error, showTs]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const canConvert = !error && !!content.trim();
  const canPrettify = !error && !!content.trim();
  const canTs = !error && !!parsedData && format === 'json';

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border shrink-0">
        {/* Format selector */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button
              variant="outline"
              size="xs"
              className={cn('font-mono font-semibold w-16 justify-center shrink-0', error && 'border-red-500/50 text-red-400')}
            />
          }>
            {FORMAT_LABELS[format]}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {(['json', 'yaml', 'toml'] as DataFormat[]).map((fmt) => (
              <DropdownMenuItem key={fmt} onClick={() => handleFormatSelect(fmt)} className="font-mono">
                {FORMAT_LABELS[fmt]}
                {fmt === format && <span className="ml-auto text-muted-foreground">✓</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Error */}
        {error && (
          <span className="text-xs text-red-400 font-mono truncate flex-1 min-w-0" title={error}>
            {error}
          </span>
        )}

        <div className="flex items-center gap-1 ml-auto">
          {/* Prettify */}
          <Button
            variant="ghost"
            size="xs"
            onClick={handlePrettify}
            disabled={!canPrettify}
            title="Prettify"
            className="gap-1"
          >
            <WrapText className="size-3" />
            Prettify
          </Button>

          {/* Convert */}
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button
                variant="ghost"
                size="xs"
                disabled={!canConvert}
                className="gap-1"
                title="Convert to…"
              />
            }>
              <ArrowRightLeft className="size-3" />
              Convert
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {CONVERT_TARGETS[format].map((to) => (
                <DropdownMenuItem key={to} onClick={() => handleConvert(to)} className="font-mono">
                  → {FORMAT_LABELS[to]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Copy */}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopy}
            disabled={!content.trim()}
            title="Copy content"
          >
            {copied ? <Check className="text-green-400" /> : <Copy />}
          </Button>

          {/* TS Types toggle — JSON only */}
          {format === 'json' && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowTs((v) => !v)}
              disabled={!canTs}
              title={showTs ? 'Hide TypeScript types' : 'Show TypeScript types'}
              className={showTs ? 'text-primary' : ''}
            >
              <Braces />
            </Button>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Editor */}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
          {content === '' && (
            <p className="absolute pointer-events-none px-10 py-4 text-sm text-muted-foreground/40 font-mono">
              Paste or type JSON, YAML, or TOML…
            </p>
          )}
          <DataEditor value={content} format={format} onChange={handleChange} />
        </div>

        {/* TypeScript panel */}
        {showTs && parsedData !== null && (
          <div className="w-96 shrink-0 border-l border-border">
            <TypeScriptPanel data={parsedData} />
          </div>
        )}
      </div>
    </div>
  );
}
