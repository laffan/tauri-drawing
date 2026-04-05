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

  // Focus textarea when editing starts
  useEffect(() => {
    if (state.editingText && textareaRef.current) {
      const ta = textareaRef.current;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
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
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state]);

  // Paste handler
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

      // Handle images
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

      // Handle text
      if (clipboardData.types.includes("text/plain")) {
        const text = clipboardData.getData("text/plain");
        if (text.trim()) {
          state.addTextShapeAtCenter(text);
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [state]);

  // Drop handler
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      if (!e.dataTransfer) return;

      // Calculate canvas-space position from drop coordinates
      const canvasEl = document.querySelector("canvas");
      const rect = canvasEl?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const dropScreenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const dropPos = screenToCanvas(dropScreenPt, state.camera);

      // Handle files
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          const dataUrl = await fileToDataUrl(file);
          const dims = await getImageDimensions(dataUrl);
          state.addImageShape(dataUrl, file.name, dims.width, dims.height, dropPos);
        } else if (
          file.type === "text/plain" ||
          file.name.endsWith(".txt") ||
          file.name.endsWith(".md")
        ) {
          const text = await file.text();
          if (text.trim()) state.addTextShapeAtPosition(text, dropPos);
        }
      }

      // Handle dragged text
      if (files.length === 0) {
        const text = e.dataTransfer.getData("text/plain");
        if (text && text.trim()) {
          state.addTextShapeAtPosition(text, dropPos);
        }
      }
    };

    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);
    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
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
    if (!state.editingText) return;
    state.commitText(state.editingText);
    state.setEditingText(null);
  }, [state]);

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
              minWidth: 1,
              minHeight: scaledLineHeight,
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

export default App;
