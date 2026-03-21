export type LeafNode = {
  type: 'leaf';
  panelId: string;
};

export type SplitNode = {
  type: 'split';
  id: string;
  direction: 'horizontal' | 'vertical';
  children: [LayoutNode, LayoutNode];
  ratio: number;
};

export type LayoutNode = LeafNode | SplitNode;

/** Collect all panelIds visible in the layout tree */
export function getVisiblePanelIds(node: LayoutNode | null): Set<string> {
  const ids = new Set<string>();
  if (!node) return ids;
  if (node.type === 'leaf') {
    ids.add(node.panelId);
  } else {
    for (const child of node.children) {
      for (const id of getVisiblePanelIds(child)) {
        ids.add(id);
      }
    }
  }
  return ids;
}

/** Check if a panelId exists anywhere in the tree */
export function containsPanel(node: LayoutNode | null, panelId: string): boolean {
  if (!node) return false;
  if (node.type === 'leaf') return node.panelId === panelId;
  return node.children.some((c) => containsPanel(c, panelId));
}

/** Replace a leaf's panelId with a new one */
export function replaceLeafPanel(
  node: LayoutNode,
  oldPanelId: string,
  newPanelId: string,
): LayoutNode {
  if (node.type === 'leaf') {
    return node.panelId === oldPanelId ? { ...node, panelId: newPanelId } : node;
  }
  return {
    ...node,
    children: node.children.map((c) => replaceLeafPanel(c, oldPanelId, newPanelId)) as [
      LayoutNode,
      LayoutNode,
    ],
  };
}

/** Remove a panel from the tree, collapsing empty splits */
export function removePanel(node: LayoutNode, panelId: string): LayoutNode | null {
  if (node.type === 'leaf') {
    return node.panelId === panelId ? null : node;
  }
  const [left, right] = node.children;
  const newLeft = removePanel(left, panelId);
  const newRight = removePanel(right, panelId);
  if (!newLeft && !newRight) return null;
  if (!newLeft) return newRight;
  if (!newRight) return newLeft;
  return { ...node, children: [newLeft, newRight] };
}

/** Split the leaf containing panelId, placing newPanelId in the new half */
export function splitLeaf(
  node: LayoutNode,
  panelId: string,
  direction: 'horizontal' | 'vertical',
  newPanelId: string,
  splitId: string,
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.panelId === panelId) {
      return {
        type: 'split',
        id: splitId,
        direction,
        children: [
          { type: 'leaf', panelId },
          { type: 'leaf', panelId: newPanelId },
        ],
        ratio: 0.5,
      };
    }
    return node;
  }
  return {
    ...node,
    children: node.children.map((c) =>
      splitLeaf(c, panelId, direction, newPanelId, splitId),
    ) as [LayoutNode, LayoutNode],
  };
}

/** Update the ratio of a split node by id */
export function updateSplitRatio(
  node: LayoutNode,
  splitId: string,
  ratio: number,
): LayoutNode {
  if (node.type === 'leaf') return node;
  if (node.id === splitId) {
    return { ...node, ratio: Math.max(0.1, Math.min(0.9, ratio)) };
  }
  return {
    ...node,
    children: node.children.map((c) => updateSplitRatio(c, splitId, ratio)) as [
      LayoutNode,
      LayoutNode,
    ],
  };
}

/** Get the first leaf's panelId (for fallback focus) */
export function getFirstLeafPanelId(node: LayoutNode): string {
  if (node.type === 'leaf') return node.panelId;
  return getFirstLeafPanelId(node.children[0]);
}
