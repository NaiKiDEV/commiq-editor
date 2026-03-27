import { memo, useCallback } from 'react';
import { Group, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { Sticky } from '../../../shared/whiteboard-types';
import { STICKY_COLORS, STICKY_BORDER_COLORS } from './constants';

interface StickyNodeProps {
  sticky: Sticky;
  isSelected: boolean;
  isConnectFrom: boolean;
  isEditing: boolean;
  isDraggable: boolean;
  onClick: (id: string, e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDblClick: (id: string) => void;
  onDragStart: (id: string, e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove: (id: string, e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (id: string, e: Konva.KonvaEventObject<DragEvent>) => void;
  onContextMenu: (id: string, e: Konva.KonvaEventObject<PointerEvent>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
}

function StickyNodeBase({
  sticky, isSelected, isConnectFrom, isEditing, isDraggable,
  onClick, onDblClick, onDragStart, onDragMove, onDragEnd, onContextMenu, onTransformEnd,
}: StickyNodeProps) {
  const handleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => onClick(sticky.id, e), [sticky.id, onClick]);
  const handleDblClick = useCallback(() => onDblClick(sticky.id), [sticky.id, onDblClick]);
  const handleDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => onDragStart(sticky.id, e), [sticky.id, onDragStart]);
  const handleDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => onDragMove(sticky.id, e), [sticky.id, onDragMove]);
  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => onDragEnd(sticky.id, e), [sticky.id, onDragEnd]);
  const handleContextMenu = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => onContextMenu(sticky.id, e), [sticky.id, onContextMenu]);

  const highlighted = isSelected || isConnectFrom;

  return (
    <Group
      id={sticky.id}
      x={sticky.x}
      y={sticky.y}
      draggable={isDraggable}
      onClick={handleClick}
      onDblClick={handleDblClick}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      onTransformEnd={onTransformEnd}
    >
      <Rect
        width={sticky.width}
        height={sticky.height}
        fill={STICKY_COLORS[sticky.color]}
        stroke={highlighted ? '#3b82f6' : STICKY_BORDER_COLORS[sticky.color]}
        strokeWidth={highlighted ? 2.5 : 1}
        cornerRadius={8}
        shadowColor="rgba(0,0,0,0.3)"
        shadowBlur={8}
        shadowOffsetY={2}
      />
      {!isEditing && (
        <Text
          text={sticky.text ? sticky.text.replace(/\\n/g, '\n') : '(double-click to edit)'}
          x={10}
          y={10}
          width={sticky.width - 20}
          height={sticky.height - 20}
          fontSize={14}
          fontFamily="'Inter Variable', 'Inter', system-ui, sans-serif"
          fontStyle="500"
          fill={sticky.text ? '#1e293b' : '#94a3b8'}
          wrap="word"
          ellipsis
          listening={false}
        />
      )}
    </Group>
  );
}

export const StickyNode = memo(StickyNodeBase, (prev, next) => {
  return (
    prev.sticky.x === next.sticky.x &&
    prev.sticky.y === next.sticky.y &&
    prev.sticky.width === next.sticky.width &&
    prev.sticky.height === next.sticky.height &&
    prev.sticky.text === next.sticky.text &&
    prev.sticky.color === next.sticky.color &&
    prev.isSelected === next.isSelected &&
    prev.isConnectFrom === next.isConnectFrom &&
    prev.isEditing === next.isEditing &&
    prev.isDraggable === next.isDraggable
  );
});
