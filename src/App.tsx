import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "./Canvas";
import { Toolbar } from "./Toolbar";
import { SelectionToolbar } from "./SelectionToolbar";
import { ShelfPanel } from "./ShelfPanel";
import { BookmarksPanel } from "./BookmarksPanel";
import { FONT_FAMILY, LINE_HEIGHT_RATIO } from "./types";
import { useDrawingState } from "./useDrawingState";
import { canvasToScreen, screenToCanvas } from "./utils";

function App() {
  const state = useDrawingState();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [shelfItems, setShelfItems] = useState<string[]>([]);
  const editingTextRef = useRef(state.editingText);
  editingTextRef.current = state.editingText;

  // Image cache for rendering - persists across renders via ref
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const imageCache = useMemo(() => {
    const cache = imageCacheRef.current;
    // Add any new image shapes
    for (const shape of state.shapes) {
      if (shape.type === "image" && !cache.has(shape.id)) {
        const img = new Image();
        img.src = shape.dataUrl;
        cache.set(shape.id, img);
      }
    }
    // Remove deleted shapes from cache
    const shapeIds = new Set(state.shapes.filter(s => s.type === "image").map(s => s.id));
    for (const id of cache.keys()) {
      if (!shapeIds.has(id)) cache.delete(id);
    }
    return cache;
  }, [state.shapes]);

  // Focus textarea when editing starts — delay to let React render it first
  useEffect(() => {
    if (state.editingText) {
      const timer = setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(
            textareaRef.current.value.length,
            textareaRef.current.value.length
          );
        }
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [state.editingText !== null]);

  // Auto-resize textarea
  useEffect(() => {
    if (!state.editingText || !textareaRef.current || !measureRef.current)
      return;
    const measure = measureRef.current;
    measure.textContent = state.editingText.text || "\u00A0";
    if (state.editingText.text.endsWith("\n")) {
      measure.textContent += "\u00A0";
    }
    textareaRef.current.style.width = measure.scrollWidth + 2 + "px";
    textareaRef.current.style.height = measure.scrollHeight + "px";
  }, [state.editingText?.text, state.editingText?.fontSize, state.camera.zoom]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (state.editingText) {
        if (e.key === "Escape") {
          state.commitText(state.editingText);
          state.setEditingText(null);
        }
        return;
      }
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e.key) {
        case "1":
          state.setTool("select");
          state.setBrainstormMode(false);
          break;
        case "2":
          state.setTool("hand");
          state.setBrainstormMode(false);
          break;
        case "3":
          state.setTool("draw");
          state.setBrainstormMode(false);
          break;
        case "t":
        case "T":
          state.setTool("text");
          state.setBrainstormMode(false);
          break;
        case "e":
        case "E":
          state.setTool("erase");
          state.setBrainstormMode(false);
          break;
        case "a":
        case "A":
          if (!e.ctrlKey && !e.metaKey) {
            state.setTool("drag-area");
            state.setBrainstormMode(false);
          }
          break;
        case "b":
        case "B":
          if (!e.ctrlKey && !e.metaKey) {
            state.setBrainstormMode(!state.brainstormMode);
            if (!state.brainstormMode) state.setTool("text");
          }
          break;
        case "Delete":
        case "Backspace":
          state.deleteSelected();
          break;
        case "g":
        case "G":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            if (e.shiftKey) {
              state.ungroupSelected();
            } else {
              state.groupSelected();
            }
          }
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state]);

  // Paste handler — supports iOS, macOS, and standard clipboard APIs
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      )
        return;
      if (state.editingText) return;

      e.preventDefault();
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      // Handle images first (check items for binary image data)
      const items = Array.from(clipboardData.items);
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            const dataUrl = await fileToDataUrl(file);
            const dims = await getImageDimensions(dataUrl);
            state.addImageShape(dataUrl, file.name, dims.width, dims.height);
            return;
          }
        }
      }

      // Handle text — try multiple clipboard type strings for cross-platform
      const text = extractTextFromDataTransfer(clipboardData);
      if (text && text.trim()) {
        state.addTextShapeAtCenter(text);
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [state]);

  // Drop handler — supports iOS, macOS text drag, file drops, and browser drags
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      // Signal to the browser that we accept drops
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      if (!e.dataTransfer) return;

      // Calculate canvas-space position from drop coordinates
      const canvasEl = document.querySelector("canvas");
      const rect = canvasEl?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const dropScreenPt = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      const dropPos = screenToCanvas(dropScreenPt, state.camera);

      // Handle file drops (images, text files)
      const files = Array.from(e.dataTransfer.files);
      let handledFile = false;
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          const dataUrl = await fileToDataUrl(file);
          const dims = await getImageDimensions(dataUrl);
          state.addImageShape(
            dataUrl,
            file.name,
            dims.width,
            dims.height,
            dropPos
          );
          handledFile = true;
        } else if (isTextFile(file)) {
          const text = await file.text();
          if (text.trim()) state.addTextShapeAtPosition(text, dropPos);
          handledFile = true;
        }
      }
      if (handledFile) return;

      // Handle dragged text content (no files) — cross-platform extraction
      const text = await extractDroppedText(e.dataTransfer);
      if (text && text.trim()) {
        state.addTextShapeAtPosition(text, dropPos);
      }
    };

    document.addEventListener("dragover", handleDragOver, true);
    document.addEventListener("drop", handleDrop, true);
    return () => {
      document.removeEventListener("dragover", handleDragOver, true);
      document.removeEventListener("drop", handleDrop, true);
    };
  }, [state]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!state.editingText) return;
      state.setEditingText({ ...state.editingText, text: e.target.value });
    },
    [state]
  );

  const handleTextBlur = useCallback(() => {
    // Small delay to avoid race with the pointerDown that creates the editing state.
    // Without this, the textarea can blur immediately on creation.
    // Read from ref to get the latest value inside the timeout.
    setTimeout(() => {
      const current = editingTextRef.current;
      if (!current) return;
      state.commitText(current);
      state.setEditingText(null);
    }, 150);
  }, [state.commitText, state.setEditingText]);

  const handleMoveToShelf = useCallback(() => {
    const texts = state.moveSelectedToShelf();
    if (texts.length > 0) {
      setShelfItems((prev) => [...texts, ...prev]);
      setShelfOpen(true);
    }
  }, [state]);

  const cursorMap: Record<string, string> = {
    select: "default",
    hand: "grab",
    draw: "crosshair",
    text: "text",
    erase: "pointer",
    "drag-area": "crosshair",
    brainstorm: "text",
  };

  const scaledFontSize = state.editingText
    ? state.editingText.fontSize * state.camera.zoom
    : 0;
  const scaledLineHeight = scaledFontSize * LINE_HEIGHT_RATIO;

  const fontStyles: React.CSSProperties = {
    fontFamily: FONT_FAMILY,
    fontSize: scaledFontSize,
    lineHeight: `${scaledLineHeight}px`,
    whiteSpace: "pre",
    wordBreak: "keep-all",
  };

  let screenPos = { x: 0, y: 0 };
  if (state.editingText) {
    screenPos = canvasToScreen(state.editingText.position, state.camera);
  }

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        background: "#f4f5f7",
      }}
    >
      <Canvas
        shapes={state.shapes}
        currentStroke={state.currentStroke}
        selectedIds={state.selectedIds}
        camera={state.camera}
        selectionBox={state.selectionBox}
        creatingDragArea={state.creatingDragArea}
        color={state.color}
        strokeWidth={state.strokeWidth}
        editingShapeId={state.editingText?.shapeId ?? null}
        imageCache={imageCache}
        onPointerDown={state.handlePointerDown}
        onPointerMove={state.handlePointerMove}
        onPointerUp={state.handlePointerUp}
        onDoubleClick={state.handleDoubleClick}
        onWheel={state.handleWheel}
        toolCursor={
          state.brainstormMode ? "text" : cursorMap[state.tool]
        }
      />

      {/* Selection context toolbar */}
      <SelectionToolbar
        shapes={state.shapes}
        selectedIds={state.selectedIds}
        camera={state.camera}
        onChangeColor={state.changeSelectedColor}
        onChangeBackground={state.changeSelectedBackground}
        onDelete={state.deleteSelected}
        onAlign={state.alignSelected}
        onMoveToShelf={handleMoveToShelf}
      />

      {/* Inline text editor */}
      {state.editingText && (
        <>
          <div
            ref={measureRef}
            aria-hidden
            style={{
              ...fontStyles,
              position: "absolute",
              visibility: "hidden",
              height: "auto",
              width: "auto",
              padding: 0,
              border: "none",
              pointerEvents: "none",
            }}
          />
          <textarea
            ref={textareaRef}
            className="inline-text-editor"
            value={state.editingText.text}
            onChange={handleTextChange}
            onBlur={handleTextBlur}
            style={{
              ...fontStyles,
              position: "absolute",
              left: screenPos.x,
              top: screenPos.y,
              color: state.editingText.color,
              caretColor: state.editingText.color,
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
              margin: 0,
              resize: "none",
              overflow: "hidden",
              minWidth: 20,
              minHeight: scaledLineHeight + 4,
              zIndex: 200,
              boxSizing: "content-box",
            }}
          />
        </>
      )}

      {/* Bottom toolbar */}
      <Toolbar
        tool={state.tool}
        setTool={state.setTool}
        brainstormMode={state.brainstormMode}
        setBrainstormMode={state.setBrainstormMode}
        onResetView={() => state.setCamera({ x: 0, y: 0, zoom: 1 })}
      />

      {/* Bookmarks */}
      <BookmarksPanel
        bookmarks={state.bookmarks}
        onAdd={state.addBookmark}
        onGo={state.goToBookmark}
        onDelete={state.deleteBookmark}
      />

      {/* Shelf */}
      <ShelfPanel
        shapes={state.shapes}
        isOpen={shelfOpen}
        onToggle={() => setShelfOpen(!shelfOpen)}
        onFocusShape={state.focusShape}
        shelfItems={shelfItems}
        onRemoveShelfItem={(i) =>
          setShelfItems((prev) => prev.filter((_, idx) => idx !== i))
        }
      />

      {/* Status bar */}
      <div style={styles.statusBar}>
        <span>{Math.round(state.camera.zoom * 100)}%</span>
        <span>
          {state.shapes.length} shape{state.shapes.length !== 1 ? "s" : ""}
        </span>
        {state.selectedIds.size > 0 && (
          <span>{state.selectedIds.size} selected</span>
        )}
        {state.brainstormMode && (
          <span style={{ color: "#4285f4", fontWeight: 600 }}>
            💡 Brainstorm
          </span>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  statusBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    gap: 16,
    height: 24,
    fontSize: 11,
    color: "#868e96",
    zIndex: 50,
    background: "rgba(255,255,255,0.7)",
    borderRadius: "0 8px 0 0",
  },
};

// === Helpers ===

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(
  dataUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

// === Cross-platform text extraction ===
// iOS and macOS use different clipboard/drag type strings than standard browsers.
// This mirrors the approach from ratchet-canvas's external-content.js.

/** Known text MIME / pasteboard types across platforms */
const TEXT_DATA_TYPES = [
  "text/plain",
  "text",
  "Text",
  "text/plain;charset=utf-8",
  "text/plain;charset=utf8",
  // Apple / iOS pasteboard types
  "public.utf8-plain-text",
  "public.utf16-plain-text",
  "public.text",
  "com.apple.traditional-mac-plain-text",
  "NSStringPboardType",
  // Mozilla
  "text/x-moz-text-internal",
  // Rich content we'll convert to plain text
  "text/html",
  "public.html",
  // URL lists (macOS Safari drags)
  "text/uri-list",
];

/**
 * Synchronous text extraction from a DataTransfer (works for paste events
 * where getData is available synchronously).
 */
function extractTextFromDataTransfer(dt: DataTransfer): string {
  for (const type of TEXT_DATA_TYPES) {
    try {
      const value = dt.getData(type);
      if (value && value.trim()) {
        return normalizeTextContent(value, type);
      }
    } catch {
      // Some types throw on access in certain browsers — skip
    }
  }
  return "";
}

/**
 * Async text extraction from a DataTransfer (for drop events where we may
 * need to use DataTransferItem.getAsString).
 */
async function extractDroppedText(dt: DataTransfer): Promise<string> {
  // First try synchronous getData across all known types
  const sync = extractTextFromDataTransfer(dt);
  if (sync) return sync;

  // Fallback: iterate DataTransferItems (iOS sometimes only exposes these)
  if (dt.items && dt.items.length > 0) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === "string") {
        const value = await new Promise<string>((resolve) => {
          try {
            item.getAsString((text) => resolve(text || ""));
          } catch {
            resolve("");
          }
        });
        if (value && value.trim()) {
          return normalizeTextContent(value, item.type);
        }
      }
    }
  }

  // Last resort: try all types present on the DataTransfer
  const allTypes = dt.types ? Array.from(dt.types) : [];
  for (const type of allTypes) {
    try {
      const value = dt.getData(type);
      if (value && value.trim()) {
        return normalizeTextContent(value, type);
      }
    } catch {
      // skip
    }
  }

  return "";
}

/** Convert HTML content to plain text, pass through everything else */
function normalizeTextContent(value: string, type: string): string {
  const lower = (type || "").toLowerCase();
  if (lower.includes("html")) {
    try {
      const div = document.createElement("div");
      div.innerHTML = value;
      return div.textContent || div.innerText || "";
    } catch {
      return value;
    }
  }
  return value;
}

/** Check if a file is a text file we should read as text */
function isTextFile(file: File): boolean {
  if (file.type === "text/plain") return true;
  const name = (file.name || "").toLowerCase();
  return (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    name.endsWith(".text")
  );
}

export default App;
