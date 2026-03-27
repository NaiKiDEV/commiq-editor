import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Base64Tool } from './encoder/Base64Tool';
import { UrlTool } from './encoder/UrlTool';
import { HashTool } from './encoder/HashTool';
import { JwtTool } from './encoder/JwtTool';

const TABS = ['Base64', 'URL', 'Hash', 'JWT'] as const;
type Tab = typeof TABS[number];

export function EncoderPanel({ panelId: _panelId }: { panelId: string }) {
  const [tab, setTab] = useState<Tab>('Base64');

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm">
      {/* Tab bar */}
      <div className="flex border-b border-border px-3 gap-1 shrink-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-3 py-2 text-xs border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tool content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'Base64' && <Base64Tool />}
        {tab === 'URL' && <UrlTool />}
        {tab === 'Hash' && <HashTool />}
        {tab === 'JWT' && <JwtTool />}
      </div>
    </div>
  );
}
