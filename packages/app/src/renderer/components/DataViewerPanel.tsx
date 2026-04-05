import { useState, useMemo, useCallback } from 'react';
import { Copy, Check, WrapText, ArrowRightLeft, Braces, Table2, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { DataEditor } from './data-viewer/DataEditor';
import { TypeScriptPanel } from './data-viewer/TypeScriptPanel';
import { CsvTable } from './data-viewer/CsvTable';
import { detectFormat, validateFormat, parseData, type DataFormat } from './data-viewer/detect';
import { convertData, serialize } from './data-viewer/convert';
import { parseCsv, objectsToCsv, type CsvData } from './data-viewer/csv';

const FORMAT_LABELS: Record<DataFormat, string> = {
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
  csv: 'CSV',
  tsv: 'TSV',
};

const CONVERT_TARGETS: Record<DataFormat, DataFormat[]> = {
  json: ['yaml', 'toml', 'csv', 'tsv'],
  yaml: ['json', 'toml', 'csv', 'tsv'],
  toml: ['json', 'yaml', 'csv', 'tsv'],
  csv: ['json', 'yaml', 'tsv'],
  tsv: ['json', 'yaml', 'csv'],
};

export function DataViewerPanel({ panelId: _panelId }: { panelId: string }) {
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<DataFormat>('json');
  const [showTs, setShowTs] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [copied, setCopied] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  const isCsvFormat = format === 'csv' || format === 'tsv';

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

  // Parse CSV data for table view
  const csvData: CsvData | null = useMemo(() => {
    if (!content.trim() || error) return null;
    try {
      if (isCsvFormat) {
        return parseCsv(content.trim(), format as 'csv' | 'tsv');
      }
      // For JSON/YAML/TOML, try to present as table if it's an array of objects
      if (parsedData && Array.isArray(parsedData) && parsedData.length > 0) {
        return objectsToCsv(parsedData, 'csv');
      }
      return null;
    } catch {
      return null;
    }
  }, [content, format, error, isCsvFormat, parsedData]);

  // Auto-detect on paste
  const handleChange = useCallback((value: string) => {
    setContent(value);
    if (value.trim()) {
      const detected = detectFormat(value);
      if (detected && detected !== format) {
        setFormat(detected);
        // Auto-switch to table view for CSV/TSV
        if (detected === 'csv' || detected === 'tsv') setShowTable(true);
      }
    }
  }, [format]);

  const handleFormatSelect = useCallback((fmt: DataFormat) => {
    setFormat(fmt);
    if (showTs && fmt !== 'json') setShowTs(false);
    // Auto-toggle table view for CSV/TSV
    if (fmt === 'csv' || fmt === 'tsv') setShowTable(true);
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
      const result = convertData(content, format, to);
      if (!result.trim()) {
        setConvertError(`Cannot convert to ${FORMAT_LABELS[to]}: produced empty output`);
        setTimeout(() => setConvertError(null), 4000);
        return;
      }
      setConvertError(null);
      setContent(result);
      setFormat(to);
      if (showTs && to !== 'json') setShowTs(false);
      if (to === 'csv' || to === 'tsv') setShowTable(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : `Conversion to ${FORMAT_LABELS[to]} failed`;
      setConvertError(msg);
      setTimeout(() => setConvertError(null), 4000);
    }
  }, [content, format, error, showTs]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const canConvert = !error && !!content.trim();
  const canPrettify = !error && !!content.trim() && !isCsvFormat;
  const canTs = !error && !!parsedData && format === 'json';
  const canTable = !error && csvData !== null;

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
              className={cn('font-mono font-semibold w-16 justify-center shrink-0', error && 'border-destructive/50 text-destructive')}
            />
          }>
            {FORMAT_LABELS[format]}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {(['json', 'yaml', 'toml', 'csv', 'tsv'] as DataFormat[]).map((fmt) => (
              <DropdownMenuItem key={fmt} onClick={() => handleFormatSelect(fmt)} className="font-mono">
                {FORMAT_LABELS[fmt]}
                {fmt === format && <span className="ml-auto text-muted-foreground">✓</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Error */}
        {(error || convertError) && (
          <span className="text-xs text-destructive font-mono truncate flex-1 min-w-0" title={error ?? convertError ?? ''}>
            {error ?? convertError}
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

          {/* Table view toggle */}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setShowTable((v) => !v)}
            disabled={!canTable}
            title={showTable ? 'Show raw text' : 'Show table view'}
            className={showTable ? 'text-primary' : ''}
          >
            {showTable ? <FileText /> : <Table2 />}
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Table view */}
        {showTable && csvData ? (
          <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
            <CsvTable data={csvData} />
          </div>
        ) : (
          /* Editor */
          <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
            {content === '' && (
              <p className="absolute pointer-events-none px-10 py-4 text-sm text-muted-foreground/40 font-mono">
                Paste or type JSON, YAML, TOML, CSV, or TSV…
              </p>
            )}
            <DataEditor value={content} format={format} onChange={handleChange} />
          </div>
        )}

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
