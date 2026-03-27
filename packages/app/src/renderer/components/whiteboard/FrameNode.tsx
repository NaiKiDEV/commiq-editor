import { memo, useCallback } from 'react';
import { Group, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { Frame } from '../../../shared/whiteboard-types';

interface FrameNodeProps {
  frame: Frame;
  isSelected: boolean;
  isDraggable: boolean;
  onClick: (id: string, e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDblClick: (id: string) => void;
  onDragStart: (id: string, e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove: (id: string, e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (id: string, e: Konva.KonvaEventObject<DragEvent>) => void;
  onContextMenu: (id: string, e: Konva.KonvaEventObject<PointerEvent>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
}

function FrameNodeBase({
  frame, isSelected, isDraggable,
  onClick, onDblClick, onDragStart, onDragMove, onDragEnd, onContextMenu, onTransformEnd,
}: FrameNodeProps) {
  const handleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => onClick(frame.id, e), [frame.id, onClick]);
  const handleDblClick = useCallback(() => onDblClick(frame.id), [frame.id, onDblClick]);
  const handleDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => onDragStart(frame.id, e), [frame.id, onDragStart]);
  const handleDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => onDragMove(frame.id, e), [frame.id, onDragMove]);
  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => onDragEnd(frame.id, e), [frame.id, onDragEnd]);
  const handleContextMenu = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => onContextMenu(frame.id, e), [frame.id, onContextMenu]);

  const borderColor = isSelected ? '#3b82f6' : frame.color;

  return (
    <Group
      id={frame.id}
      x={frame.x}
      y={frame.y}
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
        width={frame.width}
        height={frame.height}
        fill={frame.color + '20'}
        stroke={borderColor}
        strokeWidth={isSelected ? 2.5 : 2}
        cornerRadius={8}
        dash={[8, 4]}
      />
      <Text
        text={frame.label}
        x={8}
        y={-22}
        fontSize={14}
        fontFamily="'Inter Variable', 'Inter', system-ui, sans-serif"
        fill={frame.color}
        fontStyle="bold"
      />
    </Group>
  );
}

export const FrameNode = memo(FrameNodeBase, (prev, next) => {
  return (
    prev.frame.x === next.frame.x &&
    prev.frame.y === next.frame.y &&
    prev.frame.width === next.frame.width &&
    prev.frame.height === next.frame.height &&
    prev.frame.label === next.frame.label &&
    prev.frame.color === next.frame.color &&
    prev.isSelected === next.isSelected &&
    prev.isDraggable === next.isDraggable
  );
});
