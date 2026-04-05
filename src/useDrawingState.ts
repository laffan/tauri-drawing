import { useCallback, useRef, useState } from "react";
import type { Camera, Point, SelectionBox, Stroke, Tool } from "./types";
import {
  boundsOverlap,
  distanceToStroke,
  generateId,
  getStrokeBounds,
  screenToCanvas,
} from "./utils";

export function useDrawingState() {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<Tool>("draw");
  const [color, setColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  const isPanning = useRef(false);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const cameraStart = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const isDrawing = useRef(false);
  const selectStart = useRef<Point | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const screenPt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const canvasPt = screenToCanvas(screenPt, camera);

      // Middle mouse or space+click => pan
      if (e.button === 1) {
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY };
        cameraStart.current = { ...camera };
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);

      if (tool === "draw") {
        isDrawing.current = true;
        setCurrentStroke([canvasPt]);
      } else if (tool === "select") {
        // Check if clicking on an existing stroke
        const hitStroke = findStrokeAtPoint(canvasPt, strokes);
        if (hitStroke) {
          if (e.shiftKey) {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              // If stroke is in a group, toggle whole group
              const ids = getGroupIds(hitStroke, strokes);
              const allSelected = ids.every((id) => next.has(id));
              ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
              return next;
            });
          } else {
            const ids = getGroupIds(hitStroke, strokes);
            setSelectedIds(new Set(ids));
          }
        } else {
          // Start selection rectangle
          if (!e.shiftKey) setSelectedIds(new Set());
          selectStart.current = canvasPt;
          setSelectionBox({ start: canvasPt, end: canvasPt });
        }
      } else if (tool === "erase") {
        isDrawing.current = true;
        eraseAtPoint(canvasPt);
      }
    },
    [camera, tool, strokes]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const screenPt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const canvasPt = screenToCanvas(screenPt, camera);

      if (isPanning.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        setCamera({
          x: cameraStart.current.x + dx,
          y: cameraStart.current.y + dy,
          zoom: cameraStart.current.zoom,
        });
        return;
      }

      if (tool === "draw" && isDrawing.current) {
        setCurrentStroke((prev) => (prev ? [...prev, canvasPt] : [canvasPt]));
      } else if (tool === "select" && selectStart.current) {
        setSelectionBox({ start: selectStart.current, end: canvasPt });
      } else if (tool === "erase" && isDrawing.current) {
        eraseAtPoint(canvasPt);
      }
    },
    [camera, tool]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (isPanning.current) {
        isPanning.current = false;
        return;
      }

      if (tool === "draw" && isDrawing.current && currentStroke) {
        const newStroke: Stroke = {
          id: generateId(),
          points: currentStroke,
          color,
          width: strokeWidth,
        };
        setStrokes((prev) => [...prev, newStroke]);
        setCurrentStroke(null);
      } else if (tool === "select" && selectionBox) {
        // Select strokes within the box
        const box = normalizeBox(selectionBox);
        const hits = strokes.filter((s) => {
          const bounds = getStrokeBounds(s.points);
          return boundsOverlap(bounds, box);
        });
        if (e.shiftKey) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            hits.forEach((s) => next.add(s.id));
            return next;
          });
        } else if (hits.length > 0) {
          setSelectedIds(new Set(hits.map((s) => s.id)));
        }
        setSelectionBox(null);
        selectStart.current = null;
      }

      isDrawing.current = false;
    },
    [tool, currentStroke, color, strokeWidth, selectionBox, strokes]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Pinch zoom or ctrl+scroll
      const zoomFactor = e.ctrlKey ? 0.01 : 0.001;
      const delta = -e.deltaY * zoomFactor;
      const newZoom = Math.min(5, Math.max(0.1, camera.zoom * (1 + delta)));
      const scale = newZoom / camera.zoom;

      setCamera({
        x: mouseX - scale * (mouseX - camera.x),
        y: mouseY - scale * (mouseY - camera.y),
        zoom: newZoom,
      });
    },
    [camera]
  );

  const eraseAtPoint = useCallback(
    (pt: Point) => {
      setStrokes((prev) => prev.filter((s) => distanceToStroke(pt, s.points) > 12));
    },
    []
  );

  const deleteSelected = useCallback(() => {
    setStrokes((prev) => prev.filter((s) => !selectedIds.has(s.id)));
    setSelectedIds(new Set());
  }, [selectedIds]);

  const groupSelected = useCallback(() => {
    if (selectedIds.size < 2) return;
    const groupId = generateId();
    setStrokes((prev) =>
      prev.map((s) => (selectedIds.has(s.id) ? { ...s, groupId } : s))
    );
  }, [selectedIds]);

  const ungroupSelected = useCallback(() => {
    setStrokes((prev) =>
      prev.map((s) =>
        selectedIds.has(s.id) ? { ...s, groupId: undefined } : s
      )
    );
  }, [selectedIds]);

  const changeSelectedColor = useCallback(
    (newColor: string) => {
      setStrokes((prev) =>
        prev.map((s) => (selectedIds.has(s.id) ? { ...s, color: newColor } : s))
      );
    },
    [selectedIds]
  );

  return {
    strokes,
    currentStroke,
    selectedIds,
    tool,
    setTool,
    color,
    setColor,
    strokeWidth,
    setStrokeWidth,
    camera,
    setCamera,
    selectionBox,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    deleteSelected,
    groupSelected,
    ungroupSelected,
    changeSelectedColor,
  };
}

function findStrokeAtPoint(pt: Point, strokes: Stroke[]): Stroke | null {
  // Search in reverse so topmost strokes are found first
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (distanceToStroke(pt, strokes[i].points) < 12) {
      return strokes[i];
    }
  }
  return null;
}

function getGroupIds(stroke: Stroke, strokes: Stroke[]): string[] {
  if (!stroke.groupId) return [stroke.id];
  return strokes.filter((s) => s.groupId === stroke.groupId).map((s) => s.id);
}

function normalizeBox(box: SelectionBox) {
  return {
    minX: Math.min(box.start.x, box.end.x),
    minY: Math.min(box.start.y, box.end.y),
    maxX: Math.max(box.start.x, box.end.x),
    maxY: Math.max(box.start.y, box.end.y),
  };
}
