import { useCallback, useRef, useState } from "react";
import type { Camera, DrawShape, Point, SelectionBox, Shape, TextShape, Tool } from "./types";
import {
  boundsOverlap,
  generateId,
  getShapeBounds,
  hitTestShape,
  screenToCanvas,
} from "./utils";

export interface EditingText {
  shapeId: string | null; // null = creating new text
  position: Point;        // canvas coordinates
  text: string;
  fontSize: number;
  color: string;
}

export function useDrawingState() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<Tool>("draw");
  const [color, setColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fontSize, setFontSize] = useState(20);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [editingText, setEditingText] = useState<EditingText | null>(null);

  const isPanning = useRef(false);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const cameraStart = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const isDrawing = useRef(false);
  const selectStart = useRef<Point | null>(null);

  const commitText = useCallback(
    (editing: EditingText) => {
      const trimmed = editing.text.trim();
      if (!trimmed) return;

      if (editing.shapeId) {
        // Update existing text shape
        setShapes((prev) =>
          prev.map((s) =>
            s.id === editing.shapeId && s.type === "text"
              ? { ...s, text: trimmed }
              : s
          )
        );
      } else {
        // Create new text shape
        const newShape: TextShape = {
          id: generateId(),
          type: "text",
          position: editing.position,
          text: trimmed,
          fontSize: editing.fontSize,
          color: editing.color,
        };
        setShapes((prev) => [...prev, newShape]);
      }
    },
    []
  );

  const startEditingExistingText = useCallback(
    (shape: TextShape) => {
      setEditingText({
        shapeId: shape.id,
        position: shape.position,
        text: shape.text,
        fontSize: shape.fontSize,
        color: shape.color,
      });
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const screenPt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const canvasPt = screenToCanvas(screenPt, camera);

      // Middle mouse => pan
      if (e.button === 1) {
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY };
        cameraStart.current = { ...camera };
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);

      // If currently editing text and clicking elsewhere, commit it
      if (editingText) {
        commitText(editingText);
        setEditingText(null);
      }

      if (tool === "draw") {
        isDrawing.current = true;
        setCurrentStroke([canvasPt]);
      } else if (tool === "text") {
        // Check if clicking on an existing text shape to edit it
        const hitShape = findShapeAtPoint(canvasPt, shapes);
        if (hitShape && hitShape.type === "text") {
          startEditingExistingText(hitShape);
        } else {
          setEditingText({
            shapeId: null,
            position: canvasPt,
            text: "",
            fontSize,
            color,
          });
        }
      } else if (tool === "select") {
        const hitShape = findShapeAtPoint(canvasPt, shapes);
        if (hitShape) {
          // Double-click to edit text shapes
          if (e.shiftKey) {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              const ids = getGroupIds(hitShape, shapes);
              const allSelected = ids.every((id) => next.has(id));
              ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
              return next;
            });
          } else {
            const ids = getGroupIds(hitShape, shapes);
            setSelectedIds(new Set(ids));
          }
        } else {
          if (!e.shiftKey) setSelectedIds(new Set());
          selectStart.current = canvasPt;
          setSelectionBox({ start: canvasPt, end: canvasPt });
        }
      } else if (tool === "erase") {
        isDrawing.current = true;
        eraseAtPoint(canvasPt);
      }
    },
    [camera, tool, shapes, editingText, commitText, startEditingExistingText, fontSize, color]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (tool !== "select") return;
      const rect = e.currentTarget.getBoundingClientRect();
      const screenPt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const canvasPt = screenToCanvas(screenPt, camera);
      const hitShape = findShapeAtPoint(canvasPt, shapes);
      if (hitShape && hitShape.type === "text") {
        startEditingExistingText(hitShape);
      }
    },
    [tool, camera, shapes, startEditingExistingText]
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
        const newShape: DrawShape = {
          id: generateId(),
          type: "draw",
          points: currentStroke,
          color,
          width: strokeWidth,
        };
        setShapes((prev) => [...prev, newShape]);
        setCurrentStroke(null);
      } else if (tool === "select" && selectionBox) {
        const box = normalizeBox(selectionBox);
        const hits = shapes.filter((s) => {
          const bounds = getShapeBounds(s);
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
    [tool, currentStroke, color, strokeWidth, selectionBox, shapes]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

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

  const eraseAtPoint = useCallback((pt: Point) => {
    setShapes((prev) => prev.filter((s) => !hitTestShape(pt, s)));
  }, []);

  const deleteSelected = useCallback(() => {
    setShapes((prev) => prev.filter((s) => !selectedIds.has(s.id)));
    setSelectedIds(new Set());
  }, [selectedIds]);

  const groupSelected = useCallback(() => {
    if (selectedIds.size < 2) return;
    const groupId = generateId();
    setShapes((prev) =>
      prev.map((s) => (selectedIds.has(s.id) ? { ...s, groupId } : s))
    );
  }, [selectedIds]);

  const ungroupSelected = useCallback(() => {
    setShapes((prev) =>
      prev.map((s) =>
        selectedIds.has(s.id) ? { ...s, groupId: undefined } : s
      )
    );
  }, [selectedIds]);

  const changeSelectedColor = useCallback(
    (newColor: string) => {
      setShapes((prev) =>
        prev.map((s) => (selectedIds.has(s.id) ? { ...s, color: newColor } : s))
      );
    },
    [selectedIds]
  );

  return {
    shapes,
    currentStroke,
    selectedIds,
    tool,
    setTool,
    color,
    setColor,
    strokeWidth,
    setStrokeWidth,
    fontSize,
    setFontSize,
    camera,
    setCamera,
    selectionBox,
    editingText,
    setEditingText,
    commitText,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
    handleWheel,
    deleteSelected,
    groupSelected,
    ungroupSelected,
    changeSelectedColor,
  };
}

function findShapeAtPoint(pt: Point, shapes: Shape[]): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitTestShape(pt, shapes[i])) {
      return shapes[i];
    }
  }
  return null;
}

function getGroupIds(shape: Shape, shapes: Shape[]): string[] {
  if (!shape.groupId) return [shape.id];
  return shapes.filter((s) => s.groupId === shape.groupId).map((s) => s.id);
}

function normalizeBox(box: SelectionBox) {
  return {
    minX: Math.min(box.start.x, box.end.x),
    minY: Math.min(box.start.y, box.end.y),
    maxX: Math.max(box.start.x, box.end.x),
    maxY: Math.max(box.start.y, box.end.y),
  };
}
