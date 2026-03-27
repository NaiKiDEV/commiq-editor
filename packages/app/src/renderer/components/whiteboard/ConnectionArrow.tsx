import { memo, useCallback, useMemo } from 'react';
import { Group, Arrow, Text } from 'react-konva';
import type Konva from 'konva';
import type { Connection, Sticky } from '../../../shared/whiteboard-types';
import { getStickyEdgePoint } from './utils';

interface ConnectionArrowProps {
  conn: Connection;
  fromSticky: Sticky;
  toSticky: Sticky;
  onClick: (id: string) => void;
  onContextMenu: (id: string, label: string | null, e: Konva.KonvaEventObject<PointerEvent>) => void;
}

function ConnectionArrowBase({ conn, fromSticky, toSticky, onClick, onContextMenu }: ConnectionArrowProps) {
  const { fromEdge, toEdge } = useMemo(() => {
    const fromCX = fromSticky.x + fromSticky.width / 2;
    const fromCY = fromSticky.y + fromSticky.height / 2;
    const toCX = toSticky.x + toSticky.width / 2;
    const toCY = toSticky.y + toSticky.height / 2;
    return {
      fromEdge: getStickyEdgePoint(fromSticky, toCX, toCY),
      toEdge: getStickyEdgePoint(toSticky, fromCX, fromCY),
    };
  }, [
    fromSticky.x, fromSticky.y, fromSticky.width, fromSticky.height,
    toSticky.x, toSticky.y, toSticky.width, toSticky.height,
  ]);

  const handleClick = useCallback(() => onClick(conn.id), [conn.id, onClick]);
  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => onContextMenu(conn.id, conn.label, e),
    [conn.id, conn.label, onContextMenu],
  );
  const handleLabelContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => onContextMenu(conn.id, conn.label, e),
    [conn.id, conn.label, onContextMenu],
  );

  const midX = (fromEdge.x + toEdge.x) / 2 - 20;
  const midY = (fromEdge.y + toEdge.y) / 2 - 10;

  return (
    <Group>
      <Arrow
        points={[fromEdge.x, fromEdge.y, toEdge.x, toEdge.y]}
        pointerLength={10}
        pointerWidth={8}
        fill="#94a3b8"
        stroke="#94a3b8"
        strokeWidth={2}
        hitStrokeWidth={20}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      />
      {conn.label && (
        <Text
          text={conn.label}
          x={midX}
          y={midY}
          fontSize={12}
          fontFamily="'Inter Variable', 'Inter', system-ui, sans-serif"
          fill="#cbd5e1"
          padding={4}
          onContextMenu={handleLabelContextMenu}
        />
      )}
    </Group>
  );
}

export const ConnectionArrow = memo(ConnectionArrowBase, (prev, next) => {
  return (
    prev.conn.id === next.conn.id &&
    prev.conn.label === next.conn.label &&
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
