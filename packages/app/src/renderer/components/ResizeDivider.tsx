import { useCallback, useRef } from 'react';
import { useWorkspaceActions } from '../hooks/use-workspace';

type ResizeDividerProps = {
  splitId: string;
  direction: 'horizontal' | 'vertical';
  containerRef: React.RefObject<HTMLDivElement | null>;
};

export function ResizeDivider({ splitId, direction, containerRef }: ResizeDividerProps) {
  const { resizeSplit } = useWorkspaceActions();
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let ratio: number;
      if (direction === 'horizontal') {
        ratio = (e.clientX - rect.left) / rect.width;
      } else {
        ratio = (e.clientY - rect.top) / rect.height;
      }
      resizeSplit(splitId, ratio);
    },
    [splitId, direction, containerRef, resizeSplit],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      className={`shrink-0 bg-border hover:bg-primary/50 transition-colors ${
        isHorizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}
