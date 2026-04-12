import { memo, useCallback, useMemo } from 'react';
import { Group, Arrow, Text, Rect } from 'react-konva';
import type Konva from 'konva';
import type { Connection, Sticky } from '../../../shared/whiteboard-types';
import { getStickyEdgePoint } from './utils';

interface ConnectionArrowProps {
  conn: Connection;
  fromSticky: Sticky;
  toSticky: Sticky;
  curveOffset: number;
  onClick: (id: string) => void;
  onContextMenu: (id: string, label: string | null, e: Konva.KonvaEventObject<PointerEvent>) => void;
}

function ConnectionArrowBase({ conn, fromSticky, toSticky, curveOffset, onClick, onContextMenu }: ConnectionArrowProps) {
  const { fromEdge, toEdge, controlX, controlY } = useMemo(() => {
    const fromCX = fromSticky.x + fromSticky.width / 2;
    const fromCY = fromSticky.y + fromSticky.height / 2;
    const toCX = toSticky.x + toSticky.width / 2;
    const toCY = toSticky.y + toSticky.height / 2;
    const fromEdge = getStickyEdgePoint(fromSticky, toCX, toCY);
    const toEdge = getStickyEdgePoint(toSticky, fromCX, fromCY);

    // Perpendicular offset for routing parallel connections
    const dx = toEdge.x - fromEdge.x;
    const dy = toEdge.y - fromEdge.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / len;
    const perpY = dx / len;
    const midX = (fromEdge.x + toEdge.x) / 2;
    const midY = (fromEdge.y + toEdge.y) / 2;

    return {
      fromEdge,
      toEdge,
      controlX: midX + perpX * curveOffset,
      controlY: midY + perpY * curveOffset,
    };
  }, [
    fromSticky.x, fromSticky.y, fromSticky.width, fromSticky.height,
    toSticky.x, toSticky.y, toSticky.width, toSticky.height,
    curveOffset,
  ]);

  const handleClick = useCallback(() => onClick(conn.id), [conn.id, onClick]);
  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => onContextMenu(conn.id, conn.label, e),
    [conn.id, conn.label, onContextMenu],
  );

  const points = curveOffset !== 0
    ? [fromEdge.x, fromEdge.y, controlX, controlY, toEdge.x, toEdge.y]
    : [fromEdge.x, fromEdge.y, toEdge.x, toEdge.y];

  const labelBgWidth = conn.label ? Math.max(32, conn.label.length * 7 + 12) : 0;
  const labelX = controlX - labelBgWidth / 2;
  const labelY = controlY - 9;

  return (
    <Group>
      <Arrow
        points={points}
        tension={curveOffset !== 0 ? 0.35 : 0}
        pointerLength={10}
        pointerWidth={8}
        fill="#64748b"
        stroke="#64748b"
        strokeWidth={1.5}
        hitStrokeWidth={20}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      />
      {conn.label && (
        <>
          <Rect
            x={labelX - 4}
            y={labelY - 3}
            width={labelBgWidth + 8}
            height={18}
            fill="#0f172a"
            stroke="#334155"
            strokeWidth={1}
            cornerRadius={3}
            listening={false}
          />
          <Text
            text={conn.label}
            x={labelX}
            y={labelY}
            width={labelBgWidth}
            fontSize={11}
            fontFamily="'Inter Variable', 'Inter', system-ui, sans-serif"
            fill="#94a3b8"
            align="center"
            onContextMenu={handleContextMenu}
          />
        </>
      )}
    </Group>
  );
}

export const ConnectionArrow = memo(ConnectionArrowBase, (prev, next) => {
  return (
    prev.conn.id === next.conn.id &&
    prev.conn.label === next.conn.label &&
    prev.curveOffset === next.curveOffset &&
    prev.fromSticky.x === next.fromSticky.x &&
    prev.fromSticky.y === next.fromSticky.y &&
    prev.fromSticky.width === next.fromSticky.width &&
    prev.fromSticky.height === next.fromSticky.height &&
    prev.toSticky.x === next.toSticky.x &&
    prev.toSticky.y === next.toSticky.y &&
    prev.toSticky.width === next.toSticky.width &&
    prev.toSticky.height === next.toSticky.height
  );
});
