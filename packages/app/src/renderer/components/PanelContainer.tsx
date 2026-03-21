import { useLayoutEffect, useRef, useState, useCallback } from 'react';
import { usePanels, useActivePanelId, useLayout } from '../hooks/use-workspace';
import { LayoutRenderer } from './LayoutRenderer';
import { TerminalPanel } from './TerminalPanel';
import { BrowserPanel } from './BrowserPanel';
import { NotesPanel } from './NotesPanel';
import type { Panel } from '../stores/workspace';

type Bounds = { top: number; left: number; width: number; height: number };

function PanelContent({ panel, bounds }: { panel: Panel; bounds: Bounds | null }) {
  if (!bounds) return null;

  return (
    <div
      className="absolute"
      style={{
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      }}
    >
      {panel.type === 'terminal' && (
        <TerminalPanel sessionId={panel.id} panelId={panel.id} />
      )}
      {panel.type === 'browser' && (
        <BrowserPanel sessionId={panel.id} panelId={panel.id} isActive={true} />
      )}
      {panel.type === 'notes' && (
        <NotesPanel panelId={panel.id} />
      )}
    </div>
  );
}

export function PanelContainer() {
  const panels = usePanels();
  const layout = useLayout();
  const activePanelId = useActivePanelId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [boundsMap, setBoundsMap] = useState<Map<string, Bounds>>(new Map());

  const measureSlots = useCallback(() => {
    if (!containerRef.current) {
      setBoundsMap(new Map());
      return;
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    const next = new Map<string, Bounds>();
    containerRef.current
      .querySelectorAll<HTMLDivElement>('[data-slot-panel]')
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        next.set(el.dataset.slotPanel!, {
          top: r.top - containerRect.top,
          left: r.left - containerRect.left,
          width: r.width,
          height: r.height,
        });
      });
    setBoundsMap(next);
  }, []);

  // Measure slots after layout renders
  useLayoutEffect(() => {
    measureSlots();
  }, [layout, measureSlots]);

  // Re-measure when container resizes (window resize, divider drag)
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(measureSlots);
    // Observe the container and all slot elements
    ro.observe(containerRef.current);
    containerRef.current
      .querySelectorAll<HTMLDivElement>('[data-slot-panel]')
      .forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [layout, measureSlots]);

  if (!layout || panels.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-3">
          <p className="text-2xl font-semibold tracking-tight text-foreground/80">Commiq Editor</p>
          <div className="space-y-1 text-sm">
            <p>
              <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded border border-border">Ctrl+K</kbd>
              {' '}to open command palette
            </p>
            <p className="text-muted-foreground/60">or click + to open a new tab</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden relative">
      {/* Layout structure — invisible slots for positioning */}
      <LayoutRenderer node={layout} />

      {/* Panel content — stable instances, absolutely positioned over slots */}
      {panels.map((panel) => (
        <PanelContent
          key={panel.id}
          panel={panel}
          bounds={boundsMap.get(panel.id) ?? null}
        />
      ))}
    </div>
  );
}
