/** Returns the point on the sticky's rectangular border along the line from its center toward (towardX, towardY). */
export function getStickyEdgePoint(
  sticky: { x: number; y: number; width: number; height: number },
  towardX: number,
  towardY: number,
): { x: number; y: number } {
  const cx = sticky.x + sticky.width / 2;
  const cy = sticky.y + sticky.height / 2;
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = sticky.width / 2;
  const hh = sticky.height / 2;
  let t = Infinity;
  if (dx !== 0) t = Math.min(t, hw / Math.abs(dx));
  if (dy !== 0) t = Math.min(t, hh / Math.abs(dy));
  return { x: cx + dx * t, y: cy + dy * t };
}
