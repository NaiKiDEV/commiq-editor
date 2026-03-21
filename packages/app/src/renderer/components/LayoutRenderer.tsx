import { useRef } from 'react';
import type { LayoutNode } from '../lib/layout';
import type { Panel } from '../stores/workspace';
import { TerminalPanel } from './TerminalPanel';
import { BrowserPanel } from './BrowserPanel';
import { NotesPanel } from './NotesPanel';
import { ResizeDivider } from './ResizeDivider';
import { useActivePanelId, useWorkspaceActions } from '../hooks/use-workspace';
import { cn } from '@/lib/utils';

type LayoutRendererProps = {
  node: LayoutNode;
  panels: Panel[];
};

function LeafRenderer({ panelId, panels }: { panelId: string; panels: Panel[] }) {
  const activePanelId = useActivePanelId();
  const { activatePanel } = useWorkspaceActions();
  const panel = panels.find((p) => p.id === panelId);
  if (!panel) return null;

  const isFocused = panelId === activePanelId;

  return (
    <div
      className={cn(
        'h-full w-full relative',
        !isFocused && 'ring-inset ring-1 ring-border/50',
      )}
      onPointerDown={() => {
        if (!isFocused) activatePanel(panelId);
      }}
    >
      {panel.type === 'terminal' && (
        <TerminalPanel sessionId={panel.id} panelId={panel.id} />
      )}
      {panel.type === 'browser' && (
        <BrowserPanel sessionId={panel.id} panelId={panel.id} isActive={true} />
      )}
      {panel.type === 'notes' && (
        <NotesPanel />
      )}
    </div>
  );
}

function SplitRenderer({
  node,
  panels,
}: {
  node: Extract<LayoutNode, { type: 'split' }>;
  panels: Panel[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isHorizontal = node.direction === 'horizontal';
  const [first, second] = node.children;

  return (
    <div
      ref={containerRef}
      className={cn('h-full w-full flex', isHorizontal ? 'flex-row' : 'flex-col')}
    >
      <div
        className="overflow-hidden"
        style={{ flex: node.ratio, minWidth: 0, minHeight: 0 }}
      >
        <LayoutRenderer node={first} panels={panels} />
      </div>
      <ResizeDivider
        splitId={node.id}
        direction={node.direction}
        containerRef={containerRef}
      />
      <div
        className="overflow-hidden"
        style={{ flex: 1 - node.ratio, minWidth: 0, minHeight: 0 }}
      >
        <LayoutRenderer node={second} panels={panels} />
      </div>
    </div>
  );
}

export function LayoutRenderer({ node, panels }: LayoutRendererProps) {
  if (node.type === 'leaf') {
    return <LeafRenderer panelId={node.panelId} panels={panels} />;
  }
  return <SplitRenderer node={node} panels={panels} />;
}
