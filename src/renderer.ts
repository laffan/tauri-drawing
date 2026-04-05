import { FONT_FAMILY, LINE_HEIGHT_RATIO, COLOR_PALETTE } from "./types";
import type { Camera, DragAreaShape, ImageShape, Point, SelectionBox, Shape, TextShape } from "./types";
import { getShapeBounds, wrapText } from "./utils";

export interface RenderState {
  shapes: Shape[];
  currentStroke: Point[] | null;
  selectedIds: Set<string>;
  camera: Camera;
  selectionBox: SelectionBox | null;
  creatingDragArea: { start: Point; end: Point } | null;
  color: string;
  strokeWidth: number;
  editingShapeId: string | null;
  imageCache: Map<string, HTMLImageElement>;
}

export function render(canvas: HTMLCanvasElement, state: RenderState): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }

  const { camera, shapes, currentStroke, selectedIds, selectionBox, creatingDragArea, color, strokeWidth, editingShapeId, imageCache } = state;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#f4f5f7";
  ctx.fillRect(0, 0, w, h);

  drawGrid(ctx, camera, w, h);

  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.zoom, camera.zoom);

  for (const shape of shapes) {
    if (shape.type === "drag-area") drawDragArea(ctx, shape);
  }

  for (const shape of shapes) {
    if (shape.type === "drag-area") continue;
    if (shape.id === editingShapeId) continue;
    if (shape.type === "draw") drawStroke(ctx, shape.points, shape.color, shape.width);
    else if (shape.type === "text") drawTextShape(ctx, shape);
    else if (shape.type === "image") drawImageShape(ctx, shape, imageCache);
  }

  if (currentStroke && currentStroke.length > 0) {
    drawStroke(ctx, currentStroke, color, strokeWidth);
  }

  if (creatingDragArea) {
    const { start, end } = creatingDragArea;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const rw = Math.abs(end.x - start.x);
    const rh = Math.abs(end.y - start.y);
    ctx.save();
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.fillStyle = "rgba(107, 114, 128, 0.08)";
    ctx.beginPath();
    roundRect(ctx, x, y, rw, rh, 12);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (selectedIds.size > 0) {
    for (const shape of shapes) {
      if (selectedIds.has(shape.id)) drawSelectionHighlight(ctx, shape, camera.zoom);
    }
  }

  ctx.restore();

  if (selectionBox) drawSelectionBox(ctx, selectionBox, camera);
}

// === Draw helpers (pure Canvas 2D — no framework dependencies) ===

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawDragArea(ctx: CanvasRenderingContext2D, shape: DragAreaShape) {
  const { position, width, height, strokeColor, backgroundColor, borderRadius } = shape;
  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.fillStyle = backgroundColor;
  ctx.beginPath();
  roundRect(ctx, position.x, position.y, width, height, borderRadius);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawStroke(ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number) {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (points.length === 1) {
    ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    return;
  }
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

function drawTextShape(ctx: CanvasRenderingContext2D, shape: TextShape) {
  const lineHeight = shape.fontSize * LINE_HEIGHT_RATIO;
  const charWidth = shape.fontSize * 0.6;
  const lines = shape.width && shape.width > 0
    ? wrapText(shape.text, shape.width, charWidth)
    : shape.text.split("\n");

  if (shape.backgroundColor) {
    const hex = COLOR_PALETTE[shape.backgroundColor] || shape.backgroundColor;
    const bounds = getShapeBounds(shape);
    const pad = 4;
    ctx.save();
    ctx.fillStyle = hex;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(bounds.minX - pad, bounds.minY - pad, bounds.maxX - bounds.minX + pad * 2, bounds.maxY - bounds.minY + pad * 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ctx.save();
  ctx.font = `${shape.fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = shape.color;
  ctx.textBaseline = "top";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], shape.position.x, shape.position.y + i * lineHeight);
  }
  ctx.restore();
}

function drawImageShape(ctx: CanvasRenderingContext2D, shape: ImageShape, imageCache: Map<string, HTMLImageElement>) {
  const img = imageCache.get(shape.id);
  if (img && img.complete) {
    ctx.drawImage(img, shape.position.x, shape.position.y, shape.width, shape.height);
  } else {
    ctx.save();
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(shape.position.x, shape.position.y, shape.width, shape.height);
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1;
    ctx.strokeRect(shape.position.x, shape.position.y, shape.width, shape.height);
    ctx.fillStyle = "#9ca3af";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(shape.name || "Image", shape.position.x + shape.width / 2, shape.position.y + shape.height / 2);
    ctx.restore();
  }
}

function drawSelectionHighlight(ctx: CanvasRenderingContext2D, shape: Shape, zoom: number) {
  const bounds = getShapeBounds(shape);
  const pad = 6;
  const x1 = bounds.minX - pad, y1 = bounds.minY - pad;
  const w = bounds.maxX - bounds.minX + pad * 2;
  const h = bounds.maxY - bounds.minY + pad * 2;

  ctx.save();
  ctx.strokeStyle = "#4285f4";
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([4 / zoom, 4 / zoom]);
  ctx.strokeRect(x1, y1, w, h);
  ctx.setLineDash([]);

  const handleSize = 7 / zoom;
  const half = handleSize / 2;
  const mx = x1 + w / 2, my = y1 + h / 2;
  const handles: [number, number][] = [
    [x1, y1], [x1 + w, y1], [x1, y1 + h], [x1 + w, y1 + h],
    [mx, y1], [mx, y1 + h], [x1, my], [x1 + w, my],
  ];
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#4285f4";
  ctx.lineWidth = 1.5 / zoom;
  for (const [hx, hy] of handles) {
    ctx.fillRect(hx - half, hy - half, handleSize, handleSize);
    ctx.strokeRect(hx - half, hy - half, handleSize, handleSize);
  }
  ctx.restore();
}

function drawSelectionBox(ctx: CanvasRenderingContext2D, box: SelectionBox, camera: Camera) {
  const x1 = box.start.x * camera.zoom + camera.x;
  const y1 = box.start.y * camera.zoom + camera.y;
  const x2 = box.end.x * camera.zoom + camera.x;
  const y2 = box.end.y * camera.zoom + camera.y;
  ctx.save();
  ctx.fillStyle = "rgba(66, 133, 244, 0.08)";
  ctx.strokeStyle = "#4285f4";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  ctx.setLineDash([]);
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, camera: Camera, w: number, h: number) {
  const gridSize = 25;
  const scaledSize = gridSize * camera.zoom;
  if (scaledSize < 8) return;
  ctx.save();
  ctx.strokeStyle = "#e2e5e9";
  ctx.lineWidth = 0.5;
  const offsetX = camera.x % scaledSize;
  const offsetY = camera.y % scaledSize;
  for (let x = offsetX; x < w; x += scaledSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = offsetY; y < h; y += scaledSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.restore();
}
