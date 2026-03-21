import { useRef } from 'react';
import type { LayoutNode } from '../lib/layout';
import { ResizeDivider } from './ResizeDivider';
import { useActivePanelId, useWorkspaceActions } from '../hooks/use-workspace';
import { cn } from '@/lib/utils';

type LayoutRendererProps = {
  node: LayoutNode;
};

function LeafSlot({ panelId }: { panelId: string }) {
  const activePanelId = useActivePanelId();
  const { activatePanel } = useWorkspaceActions();
  const isFocused = panelId === activePanelId;

  return (
    <div
      data-slot-panel={panelId}
      className={cn(
        'h-full w-full',
        !isFocused && 'ring-inset ring-1 ring-border/50',
      )}
      onPointerDown={() => {
        if (!isFocused) activatePanel(panelId);
      }}
    />
  );
}

function SplitRenderer({
  node,
}: {
  node: Extract<LayoutNode, { type: 'split' }>;
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
        <LayoutRenderer node={first} />
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
        <LayoutRenderer node={second} />
      </div>
    </div>
  );
}

export function LayoutRenderer({ node }: LayoutRendererProps) {
  if (node.type === 'leaf') {
    return <LeafSlot panelId={node.panelId} />;
  }
  return <SplitRenderer node={node} />;
}
