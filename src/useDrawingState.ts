import { useCallback, useRef, useState } from "react";
import type {
  Camera,
  CameraBookmark,
  DragAreaShape,
  DrawShape,
  ImageShape,
  Point,
  SelectionBox,
  Shape,
  TextShape,
  Tool,
} from "./types";
import { COLOR_PALETTE } from "./types";
import {
  alignShapes,
  boundsOverlap,
  findDragAreaAtPoint,
  generateId,
  getShapeBounds,
  hitTestShape,
  screenToCanvas,
} from "./utils";

export interface EditingText {
  shapeId: string | null;
  position: Point;
  text: string;
  fontSize: number;
  color: string;
}

export type ResizeHandle =
  | "nw" | "ne" | "sw" | "se"  // corners
  | "n" | "s" | "e" | "w";     // edges

const HANDLE_SIZE = 8; // px in canvas space

export function useDrawingState() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fontSize, setFontSize] = useState(18);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [editingText, setEditingText] = useState<EditingText | null>(null);
  const [bookmarks, setBookmarks] = useState<CameraBookmark[]>([]);
  const [brainstormMode, setBrainstormMode] = useState(false);
  const [creatingDragArea, setCreatingDragArea] = useState<{
    start: Point;
    end: Point;
  } | null>(null);

  const isPanning = useRef(false);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const cameraStart = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const isDrawing = useRef(false);
  const selectStart = useRef<Point | null>(null);

  // Drag state
  const isDragging = useRef(false);
  const dragStart = useRef<Point>({ x: 0, y: 0 });
  const didDuplicate = useRef(false); // true if this drag is an alt-duplicate

  // Resize state
  const isResizing = useRef(false);
  const resizeHandle = useRef<ResizeHandle | null>(null);
  const resizeStart = useRef<Point>({ x: 0, y: 0 });
  const resizeOrigShape = useRef<Shape | null>(null);
  const resizeOrigBounds = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);

  // === Text commit ===
  const commitText = useCallback((editing: EditingText) => {
    const trimmed = editing.text.trim();
    if (!trimmed) return;
    if (editing.shapeId) {
      setShapes((prev) =>
        prev.map((s) =>
          s.id === editing.shapeId && s.type === "text"
            ? { ...s, text: trimmed }
            : s
        )
      );
    } else {
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
  }, []);

  const startEditingExistingText = useCallback((shape: TextShape) => {
    setEditingText({
      shapeId: shape.id,
      position: shape.position,
      text: shape.text,
      fontSize: shape.fontSize,
      color: shape.color,
    });
  }, []);

  // === Resize handle hit test ===
  function hitTestResizeHandles(
    canvasPt: Point,
    currentShapes: Shape[],
    currentSelectedIds: Set<string>,
    zoom: number,
  ): { shapeId: string; handle: ResizeHandle } | null {
    const handleRadius = (HANDLE_SIZE / 2) / zoom + 2;
    for (const shape of currentShapes) {
      if (!currentSelectedIds.has(shape.id)) continue;
      // Only shapes that have meaningful bounds to resize
      if (shape.type === "draw") continue;

      const b = getShapeBounds(shape);
      const pad = 6;
      const x1 = b.minX - pad, y1 = b.minY - pad;
      const x2 = b.maxX + pad, y2 = b.maxY + pad;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;

      const corners: [number, number, ResizeHandle][] = [
        [x1, y1, "nw"], [x2, y1, "ne"], [x1, y2, "sw"], [x2, y2, "se"],
        [mx, y1, "n"], [mx, y2, "s"], [x1, my, "w"], [x2, my, "e"],
      ];
      for (const [hx, hy, handle] of corners) {
        const dx = canvasPt.x - hx;
        const dy = canvasPt.y - hy;
        if (Math.sqrt(dx * dx + dy * dy) < handleRadius) {
          return { shapeId: shape.id, handle };
        }
      }
    }
    return null;
  }

  // === Pointer handlers ===
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const screenPt: Point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
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

      // Don't capture pointer when we're about to create a text editor
      const willEditText = tool === "text" || brainstormMode;
      if (!willEditText) {
        canvas.setPointerCapture(e.pointerId);
      }

      // Commit any editing text first
      if (editingText) {
        commitText(editingText);
        setEditingText(null);
      }

      if (tool === "hand") {
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY };
        cameraStart.current = { ...camera };
        return;
      }

      if (tool === "draw") {
        isDrawing.current = true;
        setCurrentStroke([canvasPt]);
      } else if (tool === "text" || brainstormMode) {
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
        // Check resize handles first
        const handleHit = hitTestResizeHandles(canvasPt, shapes, selectedIds, camera.zoom);
        if (handleHit) {
          isResizing.current = true;
          resizeHandle.current = handleHit.handle;
          resizeStart.current = canvasPt;
          const shape = shapes.find((s) => s.id === handleHit.shapeId);
          if (shape) {
            resizeOrigShape.current = structuredClone(shape);
            const b = getShapeBounds(shape);
            resizeOrigBounds.current = { ...b };
          }
          return;
        }

        const hitShape = findShapeAtPoint(canvasPt, shapes);
        if (hitShape) {
          // Group-aware selection: clicking one member selects the whole group
          const groupMembers = hitShape.groupId
            ? shapes.filter((s) => s.groupId === hitShape.groupId).map((s) => s.id)
            : [hitShape.id];

          if (e.shiftKey) {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              const allSelected = groupMembers.every((id) => next.has(id));
              groupMembers.forEach((id) =>
                allSelected ? next.delete(id) : next.add(id)
              );
              return next;
            });
          } else {
            if (!selectedIds.has(hitShape.id)) {
              setSelectedIds(new Set(groupMembers));
            }
            // Start dragging
            isDragging.current = true;
            didDuplicate.current = false;
            dragStart.current = canvasPt;

            // Alt/Option+click: duplicate selected shapes before dragging
            if (e.altKey) {
              const currentSelected = selectedIds.has(hitShape.id)
                ? selectedIds
                : new Set(groupMembers);
              const idMap = new Map<string, string>();
              const clones: Shape[] = [];

              for (const s of shapes) {
                if (!currentSelected.has(s.id)) continue;
                const newId = generateId();
                idMap.set(s.id, newId);
                clones.push({ ...structuredClone(s), id: newId });
              }
              // Update groupIds in clones so they form a new group
              for (const clone of clones) {
                if (clone.groupId && idMap.has(clone.groupId)) {
                  // groupId doesn't map to a shape id, but if multiple clones
                  // share the same groupId, give them a new shared one
                }
              }
              // Remap groupIds: all clones that had the same groupId get a new shared one
              const groupIdMap = new Map<string, string>();
              for (const clone of clones) {
                if (clone.groupId) {
                  if (!groupIdMap.has(clone.groupId)) {
                    groupIdMap.set(clone.groupId, generateId());
                  }
                  clone.groupId = groupIdMap.get(clone.groupId);
                }
              }

              setShapes((prev) => [...prev, ...clones]);
              setSelectedIds(new Set(clones.map((c) => c.id)));
              didDuplicate.current = true;
            }
          }
        } else {
          if (!e.shiftKey) setSelectedIds(new Set());
          selectStart.current = canvasPt;
          setSelectionBox({ start: canvasPt, end: canvasPt });
        }
      } else if (tool === "erase") {
        isDrawing.current = true;
        eraseAtPoint(canvasPt);
      } else if (tool === "drag-area") {
        setCreatingDragArea({ start: canvasPt, end: canvasPt });
      }
    },
    [camera, tool, shapes, editingText, commitText, startEditingExistingText, fontSize, color, selectedIds, brainstormMode]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (tool !== "select") return;
      const rect = e.currentTarget.getBoundingClientRect();
      const screenPt: Point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
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
      const screenPt: Point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
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

      // Dragging selected shapes
      if (isDragging.current && tool === "select") {
        const dx = canvasPt.x - dragStart.current.x;
        const dy = canvasPt.y - dragStart.current.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          dragStart.current = canvasPt;
          setShapes((prev) =>
            prev.map((s) => {
              if (!selectedIds.has(s.id)) return s;
              return moveShape(s, dx, dy);
            })
          );
        }
        return;
      }

      // Resizing
      if (isResizing.current && resizeOrigShape.current && resizeOrigBounds.current) {
        const dx = canvasPt.x - resizeStart.current.x;
        const dy = canvasPt.y - resizeStart.current.y;
        const handle = resizeHandle.current!;
        const orig = resizeOrigBounds.current;
        const origShape = resizeOrigShape.current;

        setShapes((prev) =>
          prev.map((s) => {
            if (s.id !== origShape.id) return s;
            return applyResize(origShape, handle, orig, dx, dy);
          })
        );
        return;
      }

      if (tool === "draw" && isDrawing.current) {
        setCurrentStroke((prev) => (prev ? [...prev, canvasPt] : [canvasPt]));
      } else if (tool === "select" && selectStart.current) {
        setSelectionBox({ start: selectStart.current, end: canvasPt });
      } else if (tool === "erase" && isDrawing.current) {
        eraseAtPoint(canvasPt);
      } else if (tool === "drag-area" && creatingDragArea) {
        setCreatingDragArea({ ...creatingDragArea, end: canvasPt });
      }
    },
    [camera, tool, creatingDragArea, selectedIds]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (isPanning.current) {
        isPanning.current = false;
        return;
      }

      if (isDragging.current) {
        isDragging.current = false;
        return;
      }

      if (isResizing.current) {
        isResizing.current = false;
        resizeHandle.current = null;
        resizeOrigShape.current = null;
        resizeOrigBounds.current = null;
        return;
      }

      if (tool === "draw" && isDrawing.current && currentStroke) {
        const dragArea = findDragAreaAtPoint(currentStroke[0], shapes);
        const newShape: DrawShape = {
          id: generateId(),
          type: "draw",
          points: currentStroke,
          color: "#ffb3ba",
          width: strokeWidth,
          parentId: dragArea?.id,
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
      } else if (tool === "drag-area" && creatingDragArea) {
        const { start, end } = creatingDragArea;
        const minX = Math.min(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);

        if (w > 20 && h > 20) {
          const newArea: DragAreaShape = {
            id: generateId(),
            type: "drag-area",
            position: { x: minX, y: minY },
            width: w,
            height: h,
            color: "#6b7280",
            strokeColor: "#6b7280",
            backgroundColor: "rgba(107, 114, 128, 0.16)",
            borderRadius: 12,
          };
          const areaBounds = getShapeBounds(newArea);
          setShapes((prev) => {
            const updated = prev.map((s) => {
              if (s.type === "drag-area" || s.parentId) return s;
              const sb = getShapeBounds(s);
              if (boundsOverlap(sb, areaBounds)) {
                return { ...s, parentId: newArea.id };
              }
              return s;
            });
            return [...updated, newArea];
          });
          setTool("select");
        }
        setCreatingDragArea(null);
      }

      isDrawing.current = false;
    },
    [tool, currentStroke, strokeWidth, selectionBox, shapes, creatingDragArea]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.ctrlKey ? 0.01 : 0.001;
      const delta = -e.deltaY * zoomFactor;
      const newZoom = Math.min(2, Math.max(0.1, camera.zoom * (1 + delta)));
      const scale = newZoom / camera.zoom;

      setCamera({
        x: mouseX - scale * (mouseX - camera.x),
        y: mouseY - scale * (mouseY - camera.y),
        zoom: newZoom,
      });
    },
    [camera]
  );

  // === Shape operations ===
  const eraseAtPoint = useCallback((pt: Point) => {
    setShapes((prev) => prev.filter((s) => !hitTestShape(pt, s)));
  }, []);

  const deleteSelected = useCallback(() => {
    setShapes((prev) => {
      const deletingIds = new Set(selectedIds);
      return prev
        .filter((s) => !deletingIds.has(s.id))
        .map((s) => {
          if (s.parentId && deletingIds.has(s.parentId)) {
            return { ...s, parentId: undefined };
          }
          return s;
        });
    });
    setSelectedIds(new Set());
  }, [selectedIds]);

  const changeSelectedColor = useCallback(
    (colorName: string) => {
      const hex = COLOR_PALETTE[colorName] || colorName;
      setShapes((prev) =>
        prev.map((s) => (selectedIds.has(s.id) ? { ...s, color: hex } : s))
      );
    },
    [selectedIds]
  );

  const changeSelectedBackground = useCallback(
    (colorName: string) => {
      setShapes((prev) =>
        prev.map((s) => {
          if (!selectedIds.has(s.id)) return s;
          if (s.type === "text") {
            return { ...s, backgroundColor: colorName === "reset" ? undefined : colorName };
          }
          if (s.type === "drag-area") {
            if (colorName === "reset") {
              return { ...s, strokeColor: "#6b7280", backgroundColor: "rgba(107, 114, 128, 0.16)" };
            }
            const hex = COLOR_PALETTE[colorName] || "#6b7280";
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return { ...s, strokeColor: hex, backgroundColor: `rgba(${r}, ${g}, ${b}, 0.16)` };
          }
          return s;
        })
      );
    },
    [selectedIds]
  );

  const groupSelected = useCallback(() => {
    if (selectedIds.size < 2) return;
    const gid = generateId();
    setShapes((prev) =>
      prev.map((s) => (selectedIds.has(s.id) ? { ...s, groupId: gid } : s))
    );
  }, [selectedIds]);

  const ungroupSelected = useCallback(() => {
    setShapes((prev) =>
      prev.map((s) =>
        selectedIds.has(s.id) ? { ...s, groupId: undefined } : s
      )
    );
  }, [selectedIds]);

  const alignSelected = useCallback(
    (direction: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
      setShapes((prev) => {
        const selected = prev.filter((s) => selectedIds.has(s.id));
        if (selected.length < 2) return prev;
        const aligned = alignShapes(selected, direction);
        const alignedMap = new Map(aligned.map((s) => [s.id, s]));
        return prev.map((s) => alignedMap.get(s.id) || s);
      });
    },
    [selectedIds]
  );

  // === Bookmarks ===
  const addBookmark = useCallback(
    (name: string) => {
      setBookmarks((prev) => [...prev, { id: generateId(), name, camera: { ...camera } }]);
    },
    [camera]
  );

  const goToBookmark = useCallback((bookmark: CameraBookmark) => {
    setCamera({ ...bookmark.camera });
  }, []);

  const deleteBookmark = useCallback((id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  // === External content ===
  const addImageShape = useCallback(
    (dataUrl: string, name: string, w: number, h: number, position?: Point) => {
      const maxSize = 400;
      const aspect = w / Math.max(h, 1);
      let dw: number, dh: number;
      if (w >= h) {
        dw = Math.min(maxSize, w);
        dh = dw / aspect;
      } else {
        dh = Math.min(maxSize, h);
        dw = dh * aspect;
      }

      const pos = position || screenToCanvas({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, camera);
      const newShape: ImageShape = {
        id: generateId(),
        type: "image",
        position: { x: pos.x - dw / 2, y: pos.y - dh / 2 },
        width: dw,
        height: dh,
        dataUrl,
        name,
        color: "#000000",
      };
      setShapes((prev) => [...prev, newShape]);
    },
    [camera]
  );

  const addTextShapeAtCenter = useCallback(
    (text: string) => {
      const pos = screenToCanvas({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, camera);
      const newShape: TextShape = {
        id: generateId(),
        type: "text",
        position: pos,
        text,
        fontSize: 18,
        color: "#000000",
      };
      setShapes((prev) => [...prev, newShape]);
    },
    [camera]
  );

  const addTextShapeAtPosition = useCallback(
    (text: string, position: Point) => {
      const newShape: TextShape = {
        id: generateId(),
        type: "text",
        position,
        text,
        fontSize: 18,
        color: "#000000",
      };
      setShapes((prev) => [...prev, newShape]);
    },
    []
  );

  // === Shelf helpers ===
  const focusShape = useCallback(
    (shapeId: string) => {
      const shape = shapes.find((s) => s.id === shapeId);
      if (!shape) return;
      const bounds = getShapeBounds(shape);
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      setCamera((cam) => ({
        x: window.innerWidth / 2 - cx * cam.zoom,
        y: window.innerHeight / 2 - cy * cam.zoom,
        zoom: cam.zoom,
      }));
      setSelectedIds(new Set([shapeId]));
    },
    [shapes]
  );

  const moveSelectedToShelf = useCallback((): string[] => {
    const texts: string[] = [];
    setShapes((prev) => {
      const remaining: Shape[] = [];
      for (const s of prev) {
        if (selectedIds.has(s.id) && s.type === "text") {
          texts.push(s.text);
        } else {
          remaining.push(s);
        }
      }
      return remaining;
    });
    setSelectedIds(new Set());
    return texts;
  }, [selectedIds]);

  return {
    shapes,
    setShapes,
    currentStroke,
    selectedIds,
    setSelectedIds,
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
    creatingDragArea,
    brainstormMode,
    setBrainstormMode,
    bookmarks,
    addBookmark,
    goToBookmark,
    deleteBookmark,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
    handleWheel,
    deleteSelected,
    groupSelected,
    ungroupSelected,
    changeSelectedColor,
    changeSelectedBackground,
    alignSelected,
    addImageShape,
    addTextShapeAtCenter,
    addTextShapeAtPosition,
    focusShape,
    moveSelectedToShelf,
  };
}

// === Helpers ===

function findShapeAtPoint(pt: Point, shapes: Shape[]): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (shapes[i].type === "drag-area") continue;
    if (hitTestShape(pt, shapes[i])) return shapes[i];
  }
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (shapes[i].type === "drag-area" && hitTestShape(pt, shapes[i])) return shapes[i];
  }
  return null;
}

function normalizeBox(box: SelectionBox) {
  return {
    minX: Math.min(box.start.x, box.end.x),
    minY: Math.min(box.start.y, box.end.y),
    maxX: Math.max(box.start.x, box.end.x),
    maxY: Math.max(box.start.y, box.end.y),
  };
}

/** Move a shape by dx, dy */
function moveShape(shape: Shape, dx: number, dy: number): Shape {
  switch (shape.type) {
    case "draw":
      return { ...shape, points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case "text":
    case "image":
    case "drag-area":
      return { ...shape, position: { x: shape.position.x + dx, y: shape.position.y + dy } };
  }
}

/**
 * Apply a resize delta from a handle drag.
 * `origShape` is the shape as it was at the start of the drag (pristine).
 * `orig` is the bounds of origShape.
 * dx/dy are the total delta from the resize start point.
 */
function applyResize(
  origShape: Shape,
  handle: ResizeHandle,
  orig: { minX: number; minY: number; maxX: number; maxY: number },
  dx: number,
  dy: number,
): Shape {
  // Compute new bounds based on which handle is being dragged
  let minX = orig.minX, minY = orig.minY, maxX = orig.maxX, maxY = orig.maxY;
  if (handle.includes("w")) minX += dx;
  if (handle.includes("e")) maxX += dx;
  if (handle.includes("n")) minY += dy;
  if (handle.includes("s")) maxY += dy;

  // Enforce minimum size
  const MIN = 30;
  if (maxX - minX < MIN) { if (handle.includes("w")) minX = maxX - MIN; else maxX = minX + MIN; }
  if (maxY - minY < MIN) { if (handle.includes("n")) minY = maxY - MIN; else maxY = minY + MIN; }

  const newW = maxX - minX;
  const newH = maxY - minY;

  switch (origShape.type) {
    case "text": {
      // Text resize changes the width constraint (for wrapping).
      // Font size stays the same — the text reflows to the new width.
      return { ...origShape, position: { x: minX, y: minY }, width: Math.max(MIN, newW) };
    }
    case "image":
      return { ...origShape, position: { x: minX, y: minY }, width: newW, height: newH };
    case "drag-area":
      return { ...origShape, position: { x: minX, y: minY }, width: newW, height: newH };
    case "draw":
      return scaleDrawShape(origShape, orig, { minX, minY, maxX, maxY });
  }
}

function scaleDrawShape(
  shape: DrawShape,
  orig: { minX: number; minY: number; maxX: number; maxY: number },
  target: { minX: number; minY: number; maxX: number; maxY: number },
): DrawShape {
  const ow = orig.maxX - orig.minX || 1;
  const oh = orig.maxY - orig.minY || 1;
  const tw = target.maxX - target.minX;
  const th = target.maxY - target.minY;

  return {
    ...shape,
    points: shape.points.map((p) => ({
      x: target.minX + ((p.x - orig.minX) / ow) * tw,
      y: target.minY + ((p.y - orig.minY) / oh) * th,
    })),
  };
}
