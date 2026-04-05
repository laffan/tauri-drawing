import type { Bounds, Camera, Point, Shape } from "./types";

let nextId = 0;
export function generateId(): string {
  return `shape_${Date.now()}_${nextId++}`;
}

export function screenToCanvas(screenPoint: Point, camera: Camera): Point {
  return {
    x: (screenPoint.x - camera.x) / camera.zoom,
    y: (screenPoint.y - camera.y) / camera.zoom,
  };
}

export function canvasToScreen(canvasPoint: Point, camera: Camera): Point {
  return {
    x: canvasPoint.x * camera.zoom + camera.x,
    y: canvasPoint.y * camera.zoom + camera.y,
  };
}

export function getShapeBounds(shape: Shape): Bounds {
  if (shape.type === "draw") {
    return getPointsBounds(shape.points);
  }
  return getTextBounds(shape);
}

export function getPointsBounds(points: Point[]): Bounds {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function getTextBounds(shape: { position: Point; text: string; fontSize: number }): Bounds {
  const lines = shape.text.split("\n");
  const lineHeight = shape.fontSize * 1.3;
  const widthPerChar = shape.fontSize * 0.6;
  const maxLineWidth = Math.max(...lines.map((l) => l.length)) * widthPerChar;
  const height = lines.length * lineHeight;
  return {
    minX: shape.position.x,
    minY: shape.position.y,
    maxX: shape.position.x + Math.max(maxLineWidth, 20),
    maxY: shape.position.y + Math.max(height, lineHeight),
  };
}

export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function pointInBounds(point: Point, bounds: Bounds, padding = 8): boolean {
  return (
    point.x >= bounds.minX - padding &&
    point.x <= bounds.maxX + padding &&
    point.y >= bounds.minY - padding &&
    point.y <= bounds.maxY + padding
  );
}

export function hitTestShape(point: Point, shape: Shape): boolean {
  if (shape.type === "draw") {
    return distanceToStroke(point, shape.points) < 12;
  }
  return pointInBounds(point, getTextBounds(shape), 4);
}

export function distanceToStroke(point: Point, points: Point[]): number {
  let minDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToSegment(point, points[i], points[i + 1]);
    if (d < minDist) minDist = d;
  }
  if (points.length === 1) {
    const dx = point.x - points[0].x;
    const dy = point.y - points[0].y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  return minDist;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const ex = p.x - projX;
  const ey = p.y - projY;
  return Math.sqrt(ex * ex + ey * ey);
}
