import { useState, useMemo, useCallback, useRef } from 'react';
import { optimize } from 'svgo/browser';
import { Copy, Check, Download, Eye, EyeOff, Settings, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface PluginDef {
  id: string;
  label: string;
  description: string;
  group: 'safe' | 'moderate' | 'aggressive';
  /** If true, this plugin is in preset-default and the override disables it. */
  inPreset: boolean;
  /** If false, plugin is off by default (either not in preset, or disabled). */
  defaultOn: boolean;
}

const PLUGINS: PluginDef[] = [
  { id: 'removeDoctype',              label: 'Remove DOCTYPE',          description: 'Remove the XML DOCTYPE declaration.',                                         group: 'safe',       inPreset: true,  defaultOn: true  },
  { id: 'removeXMLProcInst',          label: 'Remove XML declaration',  description: 'Remove the <?xml version="1.0"?> processing instruction.',                  group: 'safe',       inPreset: true,  defaultOn: true  },
  { id: 'removeComments',             label: 'Remove comments',         description: 'Remove all XML comments.',                                                   group: 'safe',       inPreset: true,  defaultOn: true  },
  { id: 'removeDeprecatedAttrs',      label: 'Remove deprecated attrs', description: 'Remove deprecated SVG attributes.',                                          group: 'safe',       inPreset: true,  defaultOn: true  },
  { id: 'removeMetadata',             label: 'Remove metadata',         description: 'Remove <metadata> elements (Dublin Core, RDF, etc.).',                       group: 'safe',       inPreset: true,  defaultOn: true  },
  { id: 'removeEditorsNSData',        label: 'Remove editor data',      description: 'Strip Inkscape, Illustrator, Sketch, and Figma namespaces and attributes.',  group: 'safe',       inPreset: true,  defaultOn: true  },
  { id: 'cleanupAttrs',               label: 'Clean up attributes',     description: 'Normalize whitespace in attribute values.',                                   group: 'safe',       inPreset: true,  defaultOn: true  },
  { id: 'removeUselessDefs',          label: 'Remove unused defs',      description: 'Remove unused <defs> elements.',                                             group: 'safe',       inPreset: true,  defaultOn: true  },
  { id: 'cleanupNumericValues',       label: 'Round numbers',           description: 'Round numeric values to reduce precision.',                                   group: 'safe',       inPreset: true,  defaultOn: true  },
  { id: 'removeEmptyAttrs',           label: 'Remove empty attributes', description: 'Remove attributes with empty string values.',                                 group: 'safe',       inPreset: true,  defaultOn: true  },
  { id: 'removeEmptyContainers',      label: 'Remove empty containers', description: 'Remove empty container elements like <g>, <defs>, <symbol>.',                group: 'safe',       inPreset: true,  defaultOn: true  },
  { id: 'removeUnusedNS',             label: 'Remove unused namespaces',description: 'Remove unused XML namespace declarations.',                                   group: 'safe',       inPreset: true,  defaultOn: true  },
  { id: 'sortAttrs',                  label: 'Sort attributes',         description: 'Sort element attributes for better gzip compression.',                        group: 'safe',       inPreset: true,  defaultOn: true  },
  { id: 'sortDefsChildren',           label: 'Sort defs children',      description: 'Sort children of <defs> for better gzip compression.',                       group: 'safe',       inPreset: true,  defaultOn: true  },
  { id: 'convertColors',              label: 'Convert colors',          description: 'Convert color values to the shortest equivalent (e.g. rgb(255,0,0) → red).',  group: 'moderate',   inPreset: true,  defaultOn: true  },
  { id: 'collapseGroups',             label: 'Collapse groups',         description: 'Collapse/merge unnecessary <g> group elements.',                              group: 'moderate',   inPreset: true,  defaultOn: true  },
  { id: 'convertPathData',            label: 'Optimize path data',      description: 'Round and simplify path coordinates.',                                        group: 'moderate',   inPreset: true,  defaultOn: true  },
  { id: 'convertTransform',           label: 'Simplify transforms',     description: 'Merge and simplify transform attributes.',                                    group: 'moderate',   inPreset: true,  defaultOn: true  },
  { id: 'removeUselessStrokeAndFill', label: 'Remove useless paint',   description: 'Remove stroke/fill properties that have no visible effect.',                  group: 'moderate',   inPreset: true,  defaultOn: true  },
  { id: 'removeHiddenElems',          label: 'Remove hidden elements',  description: 'Remove elements with display:none, visibility:hidden, or zero opacity.',    group: 'moderate',   inPreset: true,  defaultOn: true  },
  { id: 'mergeStyles',                label: 'Merge styles',            description: 'Merge multiple <style> elements into one.',                                   group: 'moderate',   inPreset: true,  defaultOn: true  },
  { id: 'minifyStyles',               label: 'Minify styles',           description: 'Minify CSS inside <style> elements.',                                         group: 'moderate',   inPreset: true,  defaultOn: true  },
  { id: 'convertEllipseToCircle',     label: 'Ellipse → circle',        description: 'Convert <ellipse rx="r" ry="r"> to the shorter <circle>.',                   group: 'moderate',   inPreset: true,  defaultOn: true  },
  { id: 'removeEmptyText',            label: 'Remove empty text',       description: 'Remove empty <text> and <tspan> elements.',                                   group: 'moderate',   inPreset: true,  defaultOn: true  },
  { id: 'cleanupIds',                 label: 'Shorten IDs',             description: '⚠ Renames/removes IDs. Breaks SVGs referenced by external CSS or JS.',       group: 'aggressive', inPreset: true,  defaultOn: false },
  { id: 'inlineStyles',               label: 'Inline styles',           description: '⚠ Moves CSS class styles to inline attributes. Can increase size.',          group: 'aggressive', inPreset: true,  defaultOn: false },
  { id: 'convertShapeToPath',         label: 'Shapes → paths',          description: '⚠ Converts rect, circle, polygon etc. to <path>. Breaks shape-targeted CSS/JS.', group: 'aggressive', inPreset: true, defaultOn: false },
  { id: 'mergePaths',                 label: 'Merge paths',             description: '⚠ Combines adjacent paths. Can break hover/click interactivity per path.',    group: 'aggressive', inPreset: true,  defaultOn: false },
  { id: 'removeDesc',                 label: 'Remove descriptions',     description: '⚠ Removes <desc> elements. Minor accessibility impact.',                     group: 'aggressive', inPreset: true,  defaultOn: false },
  { id: 'removeTitle',                label: 'Remove titles',           description: '⚠ Removes <title> elements. Breaks tooltip and accessibility labels.',        group: 'aggressive', inPreset: false, defaultOn: false },
  { id: 'removeViewBox',              label: 'Remove viewBox',          description: '⚠ Removes the viewBox attribute. Breaks responsive/scalable SVGs.',           group: 'aggressive', inPreset: false, defaultOn: false },
];

const DEFAULT_STATE = Object.fromEntries(PLUGINS.map((p) => [p.id, p.defaultOn]));

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function runOptimize(svg: string, enabled: Record<string, boolean>): { data: string } | { error: string } {
  try {
    // Build overrides for plugins that are in preset-default
    const overrides: Record<string, false | object> = {};
    for (const p of PLUGINS) {
      if (p.inPreset) {
        overrides[p.id] = enabled[p.id] ? {} : false;
      }
    }

    // Extra plugins not in preset-default that user enabled
    const extraPlugins: string[] = PLUGINS
      .filter((p) => !p.inPreset && enabled[p.id])
      .map((p) => p.id);

    const result = optimize(svg, {
      plugins: [
        { name: 'preset-default', params: { overrides } },
        ...extraPlugins,
      ],
    });
    return { data: result.data };
  } catch (e) {
    return { error: String(e) };
  }
}

function downloadSvg(content: string, filename = 'optimized.svg') {
  const blob = new Blob([content], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── component ──────────────────────────────────────────────────────────────────

const GROUP_LABELS: Record<string, string> = {
  safe: 'Safe',
  moderate: 'Moderate',
  aggressive: 'Aggressive — may break appearance or interactivity',
};

export function SvgOptimizerPanel({ panelId: _panelId }: { panelId: string }) {
  const [input, setInput] = useState('');
  const [pluginState, setPluginState] = useState<Record<string, boolean>>(DEFAULT_STATE);
  const [showPreview, setShowPreview] = useState(true);
  const [showPlugins, setShowPlugins] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [previewSide, setPreviewSide] = useState<'original' | 'optimized'>('optimized');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const result = useMemo(() => {
    if (!input.trim()) return null;
    return runOptimize(input, pluginState);
  }, [input, pluginState]);

  const output = result && 'data' in result ? result.data : null;
  const error = result && 'error' in result ? result.error : null;

  const origBytes = byteLength(input);
  const optBytes = output ? byteLength(output) : 0;
  const savings = origBytes > 0 && output ? ((1 - optBytes / origBytes) * 100) : 0;

  const handleCopy = useCallback(() => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopiedOutput(true);
    setTimeout(() => setCopiedOutput(false), 2000);
  }, [output]);

  const handleDownload = useCallback(() => {
    if (!output) return;
    downloadSvg(output);
  }, [output]);

  const togglePlugin = useCallback((id: string) => {
    setPluginState((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const previewSvg = previewSide === 'optimized' ? output : (input || null);

  const groups = ['safe', 'moderate', 'aggressive'] as const;

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm">
      {/* Input / Output row */}
      <div className="grid grid-cols-2 gap-0 border-b border-border flex-1 min-h-0" style={{ maxHeight: '40%', minHeight: 120 }}>
        {/* Input */}
        <div className="flex flex-col border-r border-border min-h-0">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">SVG Input</span>
            <Button variant="ghost" size="icon-xs" onClick={() => { setInput(''); }} title="Clear" className={cn(!input && 'invisible')}>
              <Trash2 />
            </Button>
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste SVG markup here…"
            spellCheck={false}
            className="flex-1 resize-none bg-transparent font-mono text-xs p-3 outline-none text-foreground placeholder:text-muted-foreground/40"
          />
        </div>

        {/* Output */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Optimized Output</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-xs" onClick={handleCopy} title="Copy output" className={cn(!output && 'invisible')}>
                {copiedOutput ? <Check className="text-green-400" /> : <Copy />}
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={handleDownload} title="Download .svg" className={cn(!output && 'invisible')}>
                <Download />
              </Button>
            </div>
          </div>
          {error ? (
            <div className="flex-1 p-3 font-mono text-xs text-red-400 overflow-auto">{error}</div>
          ) : (
            <textarea
              readOnly
              value={output ?? ''}
              spellCheck={false}
              placeholder="Optimized SVG will appear here…"
              className="flex-1 resize-none bg-transparent font-mono text-xs p-3 outline-none text-foreground placeholder:text-muted-foreground/40"
            />
          )}
        </div>
      </div>

      {/* Stats + controls bar */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-border shrink-0">
        {output ? (
          <>
            <span className="text-xs font-mono text-muted-foreground">{formatBytes(origBytes)}</span>
            <span className="text-muted-foreground/40">→</span>
            <span className="text-xs font-mono text-foreground">{formatBytes(optBytes)}</span>
            <span className={cn(
              'text-xs font-mono font-medium px-1.5 py-0.5 rounded',
              savings > 0 ? 'text-green-400 bg-green-500/10' : savings < 0 ? 'text-red-400 bg-red-500/10' : 'text-muted-foreground',
            )}>
              {savings > 0 ? '-' : savings < 0 ? '+' : ''}{Math.abs(savings).toFixed(1)}%
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground/40">Paste an SVG to begin</span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {output && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => { setShowPreview((v) => !v); setShowPlugins(false); }}
            >
              {showPreview ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              {showPreview ? 'Hide Preview' : 'Preview'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => { setShowPlugins((v) => !v); setShowPreview(false); }}
          >
            <Settings className="size-3" />
            Plugins
            {showPlugins ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </Button>
        </div>
      </div>

      {/* Preview */}
      {showPreview && output && (
        <div className="flex flex-col flex-1 min-h-0 border-b border-border">
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border shrink-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-2">Preview</span>
            <button
              onClick={() => setPreviewSide('optimized')}
              className={cn(
                'px-2 py-0.5 rounded text-xs border transition-colors',
                previewSide === 'optimized'
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              Optimized
            </button>
            <button
              onClick={() => setPreviewSide('original')}
              className={cn(
                'px-2 py-0.5 rounded text-xs border transition-colors',
                previewSide === 'original'
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              Original
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-4 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%3E%3Crect%20width%3D%228%22%20height%3D%228%22%20fill%3D%22%23333%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%228%22%20width%3D%228%22%20height%3D%228%22%20fill%3D%22%23333%22%2F%3E%3C%2Fsvg%3E')]">
            {previewSvg ? (
              <img
                className="max-w-full max-h-full"
                src={`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(previewSvg)))}`}
                alt="SVG preview"
                style={{ lineHeight: 0 }}
              />
            ) : (
              <span className="text-muted-foreground/40 text-xs">No valid SVG</span>
            )}
          </div>
        </div>
      )}

      {/* Plugin settings */}
      {showPlugins && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border sticky top-0 bg-background z-10">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Plugin Settings</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="xs" onClick={() => setPluginState(DEFAULT_STATE)}>
                Reset defaults
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setPluginState(Object.fromEntries(PLUGINS.map((p) => [p.id, true])))}>
                Enable all
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setPluginState(Object.fromEntries(PLUGINS.map((p) => [p.id, false])))}>
                Disable all
              </Button>
            </div>
          </div>
          {groups.map((group) => {
            const groupPlugins = PLUGINS.filter((p) => p.group === group);
            return (
              <div key={group} className="border-b border-border last:border-0">
                <div className="px-4 py-2 bg-muted/10">
                  <span className={cn(
                    'text-[10px] font-medium uppercase tracking-wider',
                    group === 'aggressive' ? 'text-orange-400' : group === 'moderate' ? 'text-blue-400' : 'text-green-400',
                  )}>
                    {GROUP_LABELS[group]}
                  </span>
                </div>
                <div className="divide-y divide-border/50">
                  {groupPlugins.map((plugin) => (
                    <label
                      key={plugin.id}
                      className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={pluginState[plugin.id] ?? plugin.defaultOn}
                        onChange={() => togglePlugin(plugin.id)}
                        className="mt-0.5 shrink-0 accent-primary"
                      />
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-medium text-foreground">{plugin.label}</span>
                        <span className={cn(
                          'text-[10px]',
                          group === 'aggressive' ? 'text-orange-400/70' : 'text-muted-foreground/60',
                        )}>
                          {plugin.description}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state (no preview, no plugins) */}
      {!showPreview && !showPlugins && !output && (
        <div className="flex items-center justify-center flex-1 text-muted-foreground/40">
          <p className="text-xs">Paste SVG markup in the top-left pane</p>
        </div>
      )}
    </div>
  );
}
