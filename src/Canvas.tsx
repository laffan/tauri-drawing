import { useCallback, useEffect, useRef } from "react";
import { FONT_FAMILY, LINE_HEIGHT_RATIO } from "./types";
import type { Camera, Point, SelectionBox, Shape, TextShape } from "./types";
import { getShapeBounds } from "./utils";

interface CanvasProps {
  shapes: Shape[];
  currentStroke: Point[] | null;
  selectedIds: Set<string>;
  camera: Camera;
  selectionBox: SelectionBox | null;
  color: string;
  strokeWidth: number;
  editingShapeId: string | null;
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  toolCursor: string;
}

export function Canvas({
  shapes,
  currentStroke,
  selectedIds,
  camera,
  selectionBox,
  color,
  strokeWidth,
  editingShapeId,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  onWheel,
  toolCursor,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawGrid(ctx, camera, w, h);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // Draw all shapes
    for (const shape of shapes) {
      // Skip text being edited (the overlay handles it)
      if (shape.id === editingShapeId) continue;

      if (shape.type === "draw") {
        drawStroke(ctx, shape.points, shape.color, shape.width);
      } else if (shape.type === "text") {
        drawText(ctx, shape);
      }
    }

    // Draw current stroke being drawn
    if (currentStroke && currentStroke.length > 0) {
      drawStroke(ctx, currentStroke, color, strokeWidth);
    }

    // Draw selection highlights
    if (selectedIds.size > 0) {
      for (const shape of shapes) {
        if (selectedIds.has(shape.id)) {
          drawSelectionHighlight(ctx, shape);
        }
      }
    }

    ctx.restore();

    if (selectionBox) {
      drawSelectionBox(ctx, selectionBox, camera);
    }
  }, [shapes, currentStroke, selectedIds, camera, selectionBox, color, strokeWidth, editingShapeId]);

  useEffect(() => {
    const render = () => {
      draw();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 48,
        left: 0,
        width: "100%",
        height: "calc(100% - 48px)",
        cursor: toolCursor,
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
    />
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number) {
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

function drawText(ctx: CanvasRenderingContext2D, shape: TextShape) {
  const lines = shape.text.split("\n");
  const lineHeight = shape.fontSize * LINE_HEIGHT_RATIO;

  ctx.save();
  ctx.font = `${shape.fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = shape.color;
  ctx.textBaseline = "top";

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], shape.position.x, shape.position.y + i * lineHeight);
  }
  ctx.restore();
}

function drawSelectionHighlight(ctx: CanvasRenderingContext2D, shape: Shape) {
  const bounds = getShapeBounds(shape);
  const pad = 6;
  ctx.save();
  ctx.strokeStyle = "#228be6";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(
    bounds.minX - pad,
    bounds.minY - pad,
    bounds.maxX - bounds.minX + pad * 2,
    bounds.maxY - bounds.minY + pad * 2
  );
  ctx.setLineDash([]);
  ctx.restore();
}

function drawSelectionBox(ctx: CanvasRenderingContext2D, box: SelectionBox, camera: Camera) {
  const x1 = box.start.x * camera.zoom + camera.x;
  const y1 = box.start.y * camera.zoom + camera.y;
  const x2 = box.end.x * camera.zoom + camera.x;
  const y2 = box.end.y * camera.zoom + camera.y;

  ctx.save();
  ctx.fillStyle = "rgba(34, 139, 230, 0.08)";
  ctx.strokeStyle = "#228be6";
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
  ctx.strokeStyle = "#e9ecef";
  ctx.lineWidth = 0.5;

  const offsetX = camera.x % scaledSize;
  const offsetY = camera.y % scaledSize;

  for (let x = offsetX; x < w; x += scaledSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  for (let y = offsetY; y < h; y += scaledSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.restore();
}
