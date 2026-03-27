import { memo, useCallback } from 'react';
import { Layer, Shape } from 'react-konva';
import { GRID_SIZE } from './constants';

interface GridLayerProps {
  /** Ref to the live stage position — allows reading current pos during imperative panning without React state updates */
  stagePosRef: React.RefObject<{ x: number; y: number }>;
  stageScale: number;
  stageSize: { width: number; height: number };
}

function GridLayerBase({ stagePosRef, stageScale, stageSize }: GridLayerProps) {
  // sceneFunc reads stagePosRef.current so it's always up to date,
  // even when the Stage was moved imperatively (no React re-render).
  // Deps only include scale/size so the function identity is stable during panning.
  const sceneFunc = useCallback(
    (context: { fillStyle: string; beginPath: () => void; arc: (x: number, y: number, r: number, start: number, end: number) => void; fill: () => void }) => {
      const pos = stagePosRef.current;
      const dotRadius = 1.5 / stageScale;
      const gs = GRID_SIZE;
      const startX = Math.floor(-pos.x / stageScale / gs) * gs - gs;
      const startY = Math.floor(-pos.y / stageScale / gs) * gs - gs;
      const endX = startX + stageSize.width / stageScale + gs * 2;
      const endY = startY + stageSize.height / stageScale + gs * 2;

      context.fillStyle = 'rgba(255,255,255,0.15)';
      for (let x = startX; x < endX; x += gs) {
        for (let y = startY; y < endY; y += gs) {
          context.beginPath();
          context.arc(x, y, dotRadius, 0, Math.PI * 2);
          context.fill();
        }
      }
    },
    // stagePosRef is stable (same ref object), so only scale/size are deps
    [stagePosRef, stageScale, stageSize.width, stageSize.height],
  );

  return (
    <Layer listening={false}>
      <Shape sceneFunc={sceneFunc as never} />
    </Layer>
  );
}

export const GridLayer = memo(GridLayerBase);
