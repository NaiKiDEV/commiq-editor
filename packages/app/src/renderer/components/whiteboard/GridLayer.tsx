import { memo, useCallback } from "react";
import { Layer, Shape } from "react-konva";
import { GRID_SIZE } from "./constants";

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
    (context: {
      fillStyle: string;
      beginPath: () => void;
      moveTo: (x: number, y: number) => void;
      arc: (
        x: number,
        y: number,
        r: number,
        start: number,
        end: number,
      ) => void;
      fill: () => void;
    }) => {
      // Skip grid at very low zoom levels — dots would be sub-pixel
      if (stageScale < 0.15) return;

      const pos = stagePosRef.current;
      const dotRadius = Math.max(0.8, 1.5 / stageScale);
      // Use a coarser grid when zoomed out to reduce dot count
      const effectiveGridSize = stageScale < 0.4 ? GRID_SIZE * 2 : GRID_SIZE;
      const gs = effectiveGridSize;
      const startX = Math.floor(-pos.x / stageScale / gs) * gs - gs;
      const startY = Math.floor(-pos.y / stageScale / gs) * gs - gs;
      const endX = startX + stageSize.width / stageScale + gs * 2;
      const endY = startY + stageSize.height / stageScale + gs * 2;

      // Batch all dots into a single path — one fill() call instead of N
      context.fillStyle = "rgba(255,255,255,0.15)";
      context.beginPath();
      for (let x = startX; x < endX; x += gs) {
        for (let y = startY; y < endY; y += gs) {
          context.moveTo(x + dotRadius, y);
          context.arc(x, y, dotRadius, 0, Math.PI * 2);
        }
      }
      context.fill();
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
