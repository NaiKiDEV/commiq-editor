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

const LABEL_HEIGHT = 22;
const LABEL_PADDING_X = 10;

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
  // Estimate label background width from text length
  const labelBgWidth = Math.max(60, frame.label.length * 8 + LABEL_PADDING_X * 2);

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
      {/* Frame body */}
      <Rect
        width={frame.width}
        height={frame.height}
        fill={frame.color + '4d'}
        stroke={borderColor}
        strokeWidth={isSelected ? 2.5 : 1.5}
        cornerRadius={6}
        dash={[8, 5]}
      />
      {/* Label background pill */}
      <Rect
        x={6}
        y={-LABEL_HEIGHT + 2}
        width={labelBgWidth}
        height={LABEL_HEIGHT}
        fill={frame.color}
        cornerRadius={[4, 4, 0, 0]}
        listening={false}
      />
      <Text
        text={frame.label}
        x={6 + LABEL_PADDING_X}
        y={-LABEL_HEIGHT + 7}
        fontSize={12}
        fontFamily="'Inter Variable', 'Inter', system-ui, sans-serif"
        fill="#1e293b"
        fontStyle="bold"
        listening={false}
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
