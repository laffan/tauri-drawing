import { useCallback, useEffect, useRef } from "react";
import { Canvas } from "./Canvas";
import { Toolbar } from "./Toolbar";
import { FONT_FAMILY, LINE_HEIGHT_RATIO } from "./types";
import { useDrawingState } from "./useDrawingState";
import { canvasToScreen } from "./utils";

function App() {
  const state = useDrawingState();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  // Focus textarea when editing starts, place cursor at end
  useEffect(() => {
    if (state.editingText && textareaRef.current) {
      const ta = textareaRef.current;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, [state.editingText !== null]);

  // Auto-resize textarea to match content using the hidden measure div
  useEffect(() => {
    if (!state.editingText || !textareaRef.current || !measureRef.current) return;
    const measure = measureRef.current;
    // Use content + a trailing character so empty lines still have height
    measure.textContent = state.editingText.text || "\u00A0";
    // Sync trailing newline: add a zero-width space so the div expands
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
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key.toLowerCase()) {
        case "d":
          state.setTool("draw");
          break;
        case "t":
          state.setTool("text");
          break;
        case "s":
          state.setTool("select");
          break;
        case "e":
          state.setTool("erase");
          break;
        case "delete":
        case "backspace":
          state.deleteSelected();
          break;
        case "g":
          if (e.ctrlKey || e.metaKey) {
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

  const cursorMap: Record<string, string> = {
    draw: "crosshair",
    text: "text",
    select: "default",
    erase: "pointer",
  };

  // Shared font styles that match canvas drawText exactly
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
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative" }}>
      <Toolbar
        tool={state.tool}
        setTool={state.setTool}
        color={state.color}
        setColor={state.setColor}
        strokeWidth={state.strokeWidth}
        setStrokeWidth={state.setStrokeWidth}
        fontSize={state.fontSize}
        setFontSize={state.setFontSize}
        hasSelection={state.selectedIds.size > 0}
        onDelete={state.deleteSelected}
        onGroup={state.groupSelected}
        onUngroup={state.ungroupSelected}
        onChangeColor={state.changeSelectedColor}
        onResetView={() => state.setCamera({ x: 0, y: 0, zoom: 1 })}
      />
      <Canvas
        shapes={state.shapes}
        currentStroke={state.currentStroke}
        selectedIds={state.selectedIds}
        camera={state.camera}
        selectionBox={state.selectionBox}
        color={state.color}
        strokeWidth={state.strokeWidth}
        editingShapeId={state.editingText?.shapeId ?? null}
        onPointerDown={state.handlePointerDown}
        onPointerMove={state.handlePointerMove}
        onPointerUp={state.handlePointerUp}
        onDoubleClick={state.handleDoubleClick}
        onWheel={state.handleWheel}
        toolCursor={cursorMap[state.tool]}
      />
      {state.editingText && (
        <>
          {/* Hidden div that mirrors textarea content for measuring true size */}
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
          {/* Invisible textarea that sits exactly where canvas text renders */}
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
              top: screenPos.y + 48,
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
      <div style={styles.statusBar}>
        <span>Zoom: {Math.round(state.camera.zoom * 100)}%</span>
        <span>Shapes: {state.shapes.length}</span>
        {state.selectedIds.size > 0 && <span>Selected: {state.selectedIds.size}</span>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  statusBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 28,
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    gap: 16,
    background: "#f8f9fa",
    borderTop: "1px solid #dee2e6",
    fontSize: 11,
    color: "#868e96",
    zIndex: 100,
  },
};

export default App;
