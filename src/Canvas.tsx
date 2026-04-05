import { useCallback, useEffect, useRef } from "react";
import type { Camera, Point, SelectionBox, Stroke } from "./types";
import { getStrokeBounds } from "./utils";

interface CanvasProps {
  strokes: Stroke[];
  currentStroke: Point[] | null;
  selectedIds: Set<string>;
  camera: Camera;
  selectionBox: SelectionBox | null;
  color: string;
  strokeWidth: number;
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  toolCursor: string;
}

export function Canvas({
  strokes,
  currentStroke,
  selectedIds,
  camera,
  selectionBox,
  color,
  strokeWidth,
  onPointerDown,
  onPointerMove,
  onPointerUp,
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

    // Handle DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Draw grid
    drawGrid(ctx, camera, w, h);

    // Apply camera transform
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // Draw strokes
    for (const stroke of strokes) {
      drawStroke(ctx, stroke.points, stroke.color, stroke.width);
    }

    // Draw current stroke being drawn
    if (currentStroke && currentStroke.length > 0) {
      drawStroke(ctx, currentStroke, color, strokeWidth);
    }

    // Draw selection highlights
    if (selectedIds.size > 0) {
      for (const stroke of strokes) {
        if (selectedIds.has(stroke.id)) {
          drawSelectionBounds(ctx, stroke);
        }
      }
    }

    ctx.restore();

    // Draw selection box in screen space
    if (selectionBox) {
      drawSelectionBox(ctx, selectionBox, camera);
    }
  }, [strokes, currentStroke, selectedIds, camera, selectionBox, color, strokeWidth]);

  useEffect(() => {
    const render = () => {
      draw();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // Handle resize
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
    // Draw a dot
    ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    return;
  }

  ctx.moveTo(points[0].x, points[0].y);

  // Use quadratic curves for smooth strokes (like tldraw)
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }

  // Last point
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

function drawSelectionBounds(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const bounds = getStrokeBounds(stroke.points);
  const pad = 6;
  ctx.save();
  ctx.strokeStyle = "#228be6";
  ctx.lineWidth = 1.5 / 1; // Will be affected by zoom, that's ok
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

  if (scaledSize < 8) return; // Don't draw grid when too zoomed out

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
