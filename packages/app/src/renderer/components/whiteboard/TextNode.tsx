import { memo, useCallback } from 'react';
import { Group, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { TextNode } from '../../../shared/whiteboard-types';

interface TextNodeProps {
  node: TextNode;
  isSelected: boolean;
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

function TextNodeBase({
  node, isSelected, isEditing, isDraggable,
  onClick, onDblClick, onDragStart, onDragMove, onDragEnd, onContextMenu, onTransformEnd,
}: TextNodeProps) {
  const handleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => onClick(node.id, e), [node.id, onClick]);
  const handleDblClick = useCallback(() => onDblClick(node.id), [node.id, onDblClick]);
  const handleDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => onDragStart(node.id, e), [node.id, onDragStart]);
  const handleDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => onDragMove(node.id, e), [node.id, onDragMove]);
  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => onDragEnd(node.id, e), [node.id, onDragEnd]);
  const handleContextMenu = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => onContextMenu(node.id, e), [node.id, onContextMenu]);

  const fontStyle = [node.italic ? 'italic' : '', node.bold ? 'bold' : ''].filter(Boolean).join(' ') || 'normal';
  // Estimate height for the hit/selection rect: at least 1.5x the font size plus padding
  const hitHeight = Math.max(node.fontSize * 1.6, 24);

  return (
    <Group
      id={node.id}
      x={node.x}
      y={node.y}
      draggable={isDraggable}
      onClick={handleClick}
      onDblClick={handleDblClick}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      onTransformEnd={onTransformEnd}
    >
      {/* Transparent hit area + selection outline */}
      <Rect
        width={node.width}
        height={hitHeight}
        fill="transparent"
        stroke={isSelected ? '#3b82f6' : 'transparent'}
        strokeWidth={isSelected ? 1.5 : 0}
        dash={[4, 2]}
        cornerRadius={2}
      />
      {!isEditing && (
        <Text
          text={node.text || '(double-click to edit)'}
          x={0}
          y={0}
          width={node.width}
          fontSize={node.fontSize}
          fontFamily="'Inter Variable', 'Inter', system-ui, sans-serif"
          fontStyle={fontStyle}
          fill={node.text ? node.color : 'rgba(255,255,255,0.25)'}
          wrap="word"
          listening={false}
        />
      )}
    </Group>
  );
}

export const TextNodeComponent = memo(TextNodeBase, (prev, next) => (
  prev.node.x === next.node.x &&
  prev.node.y === next.node.y &&
  prev.node.width === next.node.width &&
  prev.node.text === next.node.text &&
  prev.node.fontSize === next.node.fontSize &&
  prev.node.bold === next.node.bold &&
  prev.node.italic === next.node.italic &&
  prev.node.color === next.node.color &&
  prev.isSelected === next.isSelected &&
  prev.isEditing === next.isEditing &&
  prev.isDraggable === next.isDraggable
));
