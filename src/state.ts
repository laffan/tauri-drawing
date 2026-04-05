import type {
  Camera, CameraBookmark, DragAreaShape, DrawShape, ImageShape,
  Point, SelectionBox, Shape, TextShape, Tool,
} from "./types";
import { COLOR_PALETTE } from "./types";
import {
  alignShapes, boundsOverlap, findDragAreaAtPoint, generateId,
  getShapeBounds, hitTestShape, pointInBounds, screenToCanvas,
} from "./utils";

export interface EditingText {
  shapeId: string | null;
  position: Point;
  text: string;
  fontSize: number;
  color: string;
}

export type ResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
const HANDLE_SIZE = 8;

type StateKey = "shapes" | "currentStroke" | "selectedIds" | "tool" | "color"
  | "strokeWidth" | "fontSize" | "camera" | "selectionBox" | "editingText"
  | "bookmarks" | "brainstormMode" | "creatingDragArea";

export class DrawingState extends EventTarget {
  shapes: Shape[] = [];
  currentStroke: Point[] | null = null;
  selectedIds: Set<string> = new Set();
  tool: Tool = "select";
  color = "#000000";
  strokeWidth = 2;
  fontSize = 18;
  camera: Camera = { x: 0, y: 0, zoom: 1 };
  selectionBox: SelectionBox | null = null;
  editingText: EditingText | null = null;
  bookmarks: CameraBookmark[] = [];
  brainstormMode = false;
  creatingDragArea: { start: Point; end: Point } | null = null;

  canvasEl: HTMLCanvasElement | null = null;

  // Private interaction state (replaces useRef)
  private _isPanning = false;
  private _panStart: Point = { x: 0, y: 0 };
  private _cameraStart: Camera = { x: 0, y: 0, zoom: 1 };
  private _isDrawing = false;
  private _selectStart: Point | null = null;
  private _isDragging = false;
  private _dragStart: Point = { x: 0, y: 0 };
  private _isResizing = false;
  private _resizeHandle: ResizeHandle | null = null;
  private _resizeStart: Point = { x: 0, y: 0 };
  private _resizeOrigShape: Shape | null = null;
  private _resizeOrigBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

  // Batched notification
  private _pendingKeys = new Set<string>();
  private _notifyScheduled = false;

  notify(key: StateKey) {
    this._pendingKeys.add(key);
    if (!this._notifyScheduled) {
      this._notifyScheduled = true;
      queueMicrotask(() => {
        this._notifyScheduled = false;
        const keys = Array.from(this._pendingKeys);
        this._pendingKeys.clear();
        this.dispatchEvent(new CustomEvent("change", { detail: { keys } }));
      });
    }
  }

  // === Text ===
  commitText(editing: EditingText) {
    const trimmed = editing.text.trim();
    if (!trimmed) return;
    if (editing.shapeId) {
      this.shapes = this.shapes.map((s) =>
        s.id === editing.shapeId && s.type === "text" ? { ...s, text: trimmed } : s
      );
    } else {
      this.shapes = [...this.shapes, {
        id: generateId(), type: "text", position: editing.position,
        text: trimmed, fontSize: editing.fontSize, color: editing.color,
      } as TextShape];
    }
    this.notify("shapes");
  }

  startEditingExistingText(shape: TextShape) {
    this.editingText = {
      shapeId: shape.id, position: shape.position,
      text: shape.text, fontSize: shape.fontSize, color: shape.color,
    };
    this.notify("editingText");
  }

  // === Resize handle hit test ===
  hitTestResizeHandles(canvasPt: Point): { shapeId: string; handle: ResizeHandle } | null {
    const handleRadius = (HANDLE_SIZE / 2) / this.camera.zoom + 2;
    for (const shape of this.shapes) {
      if (!this.selectedIds.has(shape.id)) continue;
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
        const dx = canvasPt.x - hx, dy = canvasPt.y - hy;
        if (Math.sqrt(dx * dx + dy * dy) < handleRadius) return { shapeId: shape.id, handle };
      }
    }
    return null;
  }

  // === Pointer handlers ===
  handlePointerDown(e: PointerEvent) {
    const canvas = this.canvasEl;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenPt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const canvasPt = screenToCanvas(screenPt, this.camera);

    if (e.button === 1) {
      this._isPanning = true;
      this._panStart = { x: e.clientX, y: e.clientY };
      this._cameraStart = { ...this.camera };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    const willEditText = this.tool === "text" || this.brainstormMode;
    if (!willEditText) canvas.setPointerCapture(e.pointerId);

    if (this.editingText) {
      this.commitText(this.editingText);
      this.editingText = null;
      this.notify("editingText");
    }

    if (this.tool === "hand") {
      this._isPanning = true;
      this._panStart = { x: e.clientX, y: e.clientY };
      this._cameraStart = { ...this.camera };
      return;
    }

    if (this.tool === "draw") {
      this._isDrawing = true;
      this.currentStroke = [canvasPt];
      this.notify("currentStroke");
    } else if (this.tool === "text" || this.brainstormMode) {
      const hit = findShapeAtPoint(canvasPt, this.shapes);
      if (hit && hit.type === "text") {
        this.startEditingExistingText(hit);
      } else {
        this.editingText = { shapeId: null, position: canvasPt, text: "", fontSize: this.fontSize, color: this.color };
        this.notify("editingText");
      }
    } else if (this.tool === "select") {
      const handleHit = this.hitTestResizeHandles(canvasPt);
      if (handleHit) {
        this._isResizing = true;
        this._resizeHandle = handleHit.handle;
        this._resizeStart = canvasPt;
        const shape = this.shapes.find((s) => s.id === handleHit.shapeId);
        if (shape) {
          this._resizeOrigShape = structuredClone(shape);
          this._resizeOrigBounds = { ...getShapeBounds(shape) };
        }
        return;
      }

      const hitShape = findShapeAtPoint(canvasPt, this.shapes);
      if (hitShape) {
        const groupMembers = hitShape.groupId
          ? this.shapes.filter((s) => s.groupId === hitShape.groupId).map((s) => s.id)
          : [hitShape.id];

        if (e.shiftKey) {
          const next = new Set(this.selectedIds);
          const allSelected = groupMembers.every((id) => next.has(id));
          groupMembers.forEach((id) => allSelected ? next.delete(id) : next.add(id));
          this.selectedIds = next;
          this.notify("selectedIds");
        } else {
          if (!this.selectedIds.has(hitShape.id)) {
            this.selectedIds = new Set(groupMembers);
            this.notify("selectedIds");
          }
          this._isDragging = true;
          this._dragStart = canvasPt;

          if (e.altKey) {
            const currentSelected = this.selectedIds.has(hitShape.id) ? this.selectedIds : new Set(groupMembers);
            const clones: Shape[] = [];
            const groupIdMap = new Map<string, string>();
            for (const s of this.shapes) {
              if (!currentSelected.has(s.id)) continue;
              const clone = { ...structuredClone(s), id: generateId() };
              if (clone.groupId) {
                if (!groupIdMap.has(clone.groupId)) groupIdMap.set(clone.groupId, generateId());
                clone.groupId = groupIdMap.get(clone.groupId);
              }
              clones.push(clone);
            }
            this.shapes = [...this.shapes, ...clones];
            this.selectedIds = new Set(clones.map((c) => c.id));
            this.notify("shapes");
            this.notify("selectedIds");
          }
        }
      } else {
        if (!e.shiftKey) { this.selectedIds = new Set(); this.notify("selectedIds"); }
        this._selectStart = canvasPt;
        this.selectionBox = { start: canvasPt, end: canvasPt };
        this.notify("selectionBox");
      }
    } else if (this.tool === "erase") {
      this._isDrawing = true;
      this._eraseAtPoint(canvasPt);
    } else if (this.tool === "drag-area") {
      this.creatingDragArea = { start: canvasPt, end: canvasPt };
      this.notify("creatingDragArea");
    }
  }

  handleDoubleClick(e: MouseEvent) {
    if (this.tool !== "select" || !this.canvasEl) return;
    const rect = this.canvasEl.getBoundingClientRect();
    const screenPt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const canvasPt = screenToCanvas(screenPt, this.camera);
    const hit = findShapeAtPoint(canvasPt, this.shapes);
    if (hit && hit.type === "text") this.startEditingExistingText(hit);
  }

  handlePointerMove(e: PointerEvent) {
    if (!this.canvasEl) return;
    const rect = this.canvasEl.getBoundingClientRect();
    const screenPt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const canvasPt = screenToCanvas(screenPt, this.camera);

    if (this._isPanning) {
      const dx = e.clientX - this._panStart.x;
      const dy = e.clientY - this._panStart.y;
      this.camera = { x: this._cameraStart.x + dx, y: this._cameraStart.y + dy, zoom: this._cameraStart.zoom };
      this.notify("camera");
      return;
    }

    if (this._isDragging && this.tool === "select") {
      const dx = canvasPt.x - this._dragStart.x;
      const dy = canvasPt.y - this._dragStart.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        this._dragStart = canvasPt;
        const selectedDragAreaIds = new Set<string>();
        for (const s of this.shapes) {
          if (this.selectedIds.has(s.id) && s.type === "drag-area") selectedDragAreaIds.add(s.id);
        }
        this.shapes = this.shapes.map((s) => {
          if (this.selectedIds.has(s.id)) return moveShape(s, dx, dy);
          if (s.parentId && selectedDragAreaIds.has(s.parentId)) return moveShape(s, dx, dy);
          return s;
        });
        this.notify("shapes");
      }
      return;
    }

    if (this._isResizing && this._resizeOrigShape && this._resizeOrigBounds) {
      const dx = canvasPt.x - this._resizeStart.x;
      const dy = canvasPt.y - this._resizeStart.y;
      const handle = this._resizeHandle!;
      const origShape = this._resizeOrigShape;
      const orig = this._resizeOrigBounds;
      this.shapes = this.shapes.map((s) => s.id !== origShape.id ? s : applyResize(origShape, handle, orig, dx, dy));
      this.notify("shapes");
      return;
    }

    if (this.tool === "draw" && this._isDrawing) {
      this.currentStroke = this.currentStroke ? [...this.currentStroke, canvasPt] : [canvasPt];
      this.notify("currentStroke");
    } else if (this.tool === "select" && this._selectStart) {
      this.selectionBox = { start: this._selectStart, end: canvasPt };
      this.notify("selectionBox");
    } else if (this.tool === "erase" && this._isDrawing) {
      this._eraseAtPoint(canvasPt);
    } else if (this.tool === "drag-area" && this.creatingDragArea) {
      this.creatingDragArea = { ...this.creatingDragArea, end: canvasPt };
      this.notify("creatingDragArea");
    }
  }

  handlePointerUp(e: PointerEvent) {
    if (this._isPanning) { this._isPanning = false; return; }

    if (this._isDragging) {
      this._isDragging = false;
      const dragAreas = this.shapes.filter((s) => s.type === "drag-area");
      this.shapes = this.shapes.map((s) => {
        if (!this.selectedIds.has(s.id)) return s;
        if (s.type === "drag-area") return s;
        const bounds = getShapeBounds(s);
        const center: Point = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
        let newParent: string | undefined;
        for (const da of dragAreas) {
          if (this.selectedIds.has(da.id)) continue;
          if (pointInBounds(center, getShapeBounds(da), 0)) { newParent = da.id; break; }
        }
        if (newParent !== s.parentId) return { ...s, parentId: newParent };
        return s;
      });
      this.notify("shapes");
      return;
    }

    if (this._isResizing) {
      this._isResizing = false;
      this._resizeHandle = null;
      this._resizeOrigShape = null;
      this._resizeOrigBounds = null;
      return;
    }

    if (this.tool === "draw" && this._isDrawing && this.currentStroke) {
      const dragArea = findDragAreaAtPoint(this.currentStroke[0], this.shapes);
      const newShape: DrawShape = {
        id: generateId(), type: "draw", points: this.currentStroke,
        color: "#ffb3ba", width: this.strokeWidth, parentId: dragArea?.id,
      };
      this.shapes = [...this.shapes, newShape];
      this.currentStroke = null;
      this.notify("shapes");
      this.notify("currentStroke");
    } else if (this.tool === "select" && this.selectionBox) {
      const box = normalizeBox(this.selectionBox);
      const hits = this.shapes.filter((s) => boundsOverlap(getShapeBounds(s), box));
      if (e.shiftKey) {
        const next = new Set(this.selectedIds);
        hits.forEach((s) => next.add(s.id));
        this.selectedIds = next;
      } else if (hits.length > 0) {
        this.selectedIds = new Set(hits.map((s) => s.id));
      }
      this.selectionBox = null;
      this._selectStart = null;
      this.notify("selectedIds");
      this.notify("selectionBox");
    } else if (this.tool === "drag-area" && this.creatingDragArea) {
      const { start, end } = this.creatingDragArea;
      const minX = Math.min(start.x, end.x), minY = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
      if (w > 20 && h > 20) {
        const newArea: DragAreaShape = {
          id: generateId(), type: "drag-area", position: { x: minX, y: minY },
          width: w, height: h, color: "#6b7280", strokeColor: "#6b7280",
          backgroundColor: "rgba(107, 114, 128, 0.16)", borderRadius: 12,
        };
        const areaBounds = getShapeBounds(newArea);
        this.shapes = [...this.shapes.map((s) => {
          if (s.type === "drag-area" || s.parentId) return s;
          if (boundsOverlap(getShapeBounds(s), areaBounds)) return { ...s, parentId: newArea.id };
          return s;
        }), newArea];
        this.tool = "select";
        this.notify("tool");
      }
      this.creatingDragArea = null;
      this.notify("shapes");
      this.notify("creatingDragArea");
    }
    this._isDrawing = false;
  }

  handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (!this.canvasEl) return;
    const rect = this.canvasEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
    const zoomFactor = e.ctrlKey ? 0.01 : 0.001;
    const delta = -e.deltaY * zoomFactor;
    const newZoom = Math.min(2, Math.max(0.1, this.camera.zoom * (1 + delta)));
    const scale = newZoom / this.camera.zoom;
    this.camera = {
      x: mouseX - scale * (mouseX - this.camera.x),
      y: mouseY - scale * (mouseY - this.camera.y),
      zoom: newZoom,
    };
    this.notify("camera");
  }

  // === Shape operations ===
  private _eraseAtPoint(pt: Point) {
    this.shapes = this.shapes.filter((s) => !hitTestShape(pt, s));
    this.notify("shapes");
  }

  deleteSelected() {
    const deletingIds = new Set(this.selectedIds);
    this.shapes = this.shapes
      .filter((s) => !deletingIds.has(s.id))
      .map((s) => s.parentId && deletingIds.has(s.parentId) ? { ...s, parentId: undefined } : s);
    this.selectedIds = new Set();
    this.notify("shapes");
    this.notify("selectedIds");
  }

  groupSelected() {
    if (this.selectedIds.size < 2) return;
    const gid = generateId();
    this.shapes = this.shapes.map((s) => this.selectedIds.has(s.id) ? { ...s, groupId: gid } : s);
    this.notify("shapes");
  }

  ungroupSelected() {
    this.shapes = this.shapes.map((s) => this.selectedIds.has(s.id) ? { ...s, groupId: undefined } : s);
    this.notify("shapes");
  }

  changeSelectedColor(colorName: string) {
    const hex = COLOR_PALETTE[colorName] || colorName;
    this.shapes = this.shapes.map((s) => this.selectedIds.has(s.id) ? { ...s, color: hex } : s);
    this.notify("shapes");
  }

  changeSelectedBackground(colorName: string) {
    this.shapes = this.shapes.map((s) => {
      if (!this.selectedIds.has(s.id)) return s;
      if (s.type === "text") return { ...s, backgroundColor: colorName === "reset" ? undefined : colorName };
      if (s.type === "drag-area") {
        if (colorName === "reset") return { ...s, strokeColor: "#6b7280", backgroundColor: "rgba(107, 114, 128, 0.16)" };
        const hex = COLOR_PALETTE[colorName] || "#6b7280";
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return { ...s, strokeColor: hex, backgroundColor: `rgba(${r}, ${g}, ${b}, 0.16)` };
      }
      return s;
    });
    this.notify("shapes");
  }

  alignSelected(direction: "left" | "center" | "right" | "top" | "middle" | "bottom") {
    const selected = this.shapes.filter((s) => this.selectedIds.has(s.id));
    if (selected.length < 2) return;
    const aligned = alignShapes(selected, direction);
    const map = new Map(aligned.map((s) => [s.id, s]));
    this.shapes = this.shapes.map((s) => map.get(s.id) || s);
    this.notify("shapes");
  }

  // === Bookmarks ===
  addBookmark(name: string) {
    this.bookmarks = [...this.bookmarks, { id: generateId(), name, camera: { ...this.camera } }];
    this.notify("bookmarks");
  }
  goToBookmark(bm: CameraBookmark) { this.camera = { ...bm.camera }; this.notify("camera"); }
  deleteBookmark(id: string) { this.bookmarks = this.bookmarks.filter((b) => b.id !== id); this.notify("bookmarks"); }

  // === External content ===
  addImageShape(dataUrl: string, name: string, w: number, h: number, position?: Point) {
    const maxSize = 400;
    const aspect = w / Math.max(h, 1);
    let dw: number, dh: number;
    if (w >= h) { dw = Math.min(maxSize, w); dh = dw / aspect; }
    else { dh = Math.min(maxSize, h); dw = dh * aspect; }
    const pos = position || screenToCanvas({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, this.camera);
    this.shapes = [...this.shapes, {
      id: generateId(), type: "image", position: { x: pos.x - dw / 2, y: pos.y - dh / 2 },
      width: dw, height: dh, dataUrl, name, color: "#000000",
    } as ImageShape];
    this.notify("shapes");
  }

  addTextShapeAtCenter(text: string) {
    const pos = screenToCanvas({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, this.camera);
    this.shapes = [...this.shapes, { id: generateId(), type: "text", position: pos, text, fontSize: 18, color: "#000000" } as TextShape];
    this.notify("shapes");
  }

  addTextShapeAtPosition(text: string, position: Point) {
    this.shapes = [...this.shapes, { id: generateId(), type: "text", position, text, fontSize: 18, color: "#000000" } as TextShape];
    this.notify("shapes");
  }

  focusShape(shapeId: string) {
    const shape = this.shapes.find((s) => s.id === shapeId);
    if (!shape) return;
    const bounds = getShapeBounds(shape);
    const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
    this.camera = { x: window.innerWidth / 2 - cx * this.camera.zoom, y: window.innerHeight / 2 - cy * this.camera.zoom, zoom: this.camera.zoom };
    this.selectedIds = new Set([shapeId]);
    this.notify("camera");
    this.notify("selectedIds");
  }

  moveSelectedToShelf(): string[] {
    const texts: string[] = [];
    const remaining: Shape[] = [];
    for (const s of this.shapes) {
      if (this.selectedIds.has(s.id) && s.type === "text") texts.push(s.text);
      else remaining.push(s);
    }
    this.shapes = remaining;
    this.selectedIds = new Set();
    this.notify("shapes");
    this.notify("selectedIds");
    return texts;
  }
}

// === Pure helpers ===

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
  return { minX: Math.min(box.start.x, box.end.x), minY: Math.min(box.start.y, box.end.y), maxX: Math.max(box.start.x, box.end.x), maxY: Math.max(box.start.y, box.end.y) };
}

function moveShape(shape: Shape, dx: number, dy: number): Shape {
  switch (shape.type) {
    case "draw": return { ...shape, points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case "text": case "image": case "drag-area":
      return { ...shape, position: { x: shape.position.x + dx, y: shape.position.y + dy } };
  }
}

function applyResize(origShape: Shape, handle: ResizeHandle, orig: { minX: number; minY: number; maxX: number; maxY: number }, dx: number, dy: number): Shape {
  let minX = orig.minX, minY = orig.minY, maxX = orig.maxX, maxY = orig.maxY;
  if (handle.includes("w")) minX += dx;
  if (handle.includes("e")) maxX += dx;
  if (handle.includes("n")) minY += dy;
  if (handle.includes("s")) maxY += dy;
  const MIN = 30;
  if (maxX - minX < MIN) { if (handle.includes("w")) minX = maxX - MIN; else maxX = minX + MIN; }
  if (maxY - minY < MIN) { if (handle.includes("n")) minY = maxY - MIN; else maxY = minY + MIN; }
  const newW = maxX - minX, newH = maxY - minY;
  switch (origShape.type) {
    case "text": return { ...origShape, position: { x: minX, y: minY }, width: Math.max(MIN, newW) };
    case "image": return { ...origShape, position: { x: minX, y: minY }, width: newW, height: newH };
    case "drag-area": return { ...origShape, position: { x: minX, y: minY }, width: newW, height: newH };
    case "draw": {
      const ow = orig.maxX - orig.minX || 1, oh = orig.maxY - orig.minY || 1;
      return { ...origShape, points: origShape.points.map((p) => ({ x: minX + ((p.x - orig.minX) / ow) * newW, y: minY + ((p.y - orig.minY) / oh) * newH })) };
    }
  }
}
