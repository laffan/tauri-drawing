import { useCallback, useEffect, useRef } from "react";
import { Canvas } from "./Canvas";
import { Toolbar } from "./Toolbar";
import { useDrawingState } from "./useDrawingState";
import { canvasToScreen } from "./utils";

function App() {
  const state = useDrawingState();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when editing starts
  useEffect(() => {
    if (state.editingText && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [state.editingText]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when editing text
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

  // Compute textarea screen position
  let textOverlayStyle: React.CSSProperties | null = null;
  if (state.editingText) {
    const screenPos = canvasToScreen(state.editingText.position, state.camera);
    textOverlayStyle = {
      position: "absolute",
      left: screenPos.x,
      top: screenPos.y + 48, // offset for toolbar height
      fontSize: state.editingText.fontSize * state.camera.zoom,
      lineHeight: `${state.editingText.fontSize * 1.3 * state.camera.zoom}px`,
      color: state.editingText.color,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      background: "transparent",
      border: "2px solid #228be6",
      borderRadius: 2,
      outline: "none",
      padding: "2px 4px",
      margin: 0,
      resize: "none" as const,
      overflow: "hidden",
      minWidth: 40,
      minHeight: state.editingText.fontSize * 1.3 * state.camera.zoom + 8,
      zIndex: 200,
      whiteSpace: "pre",
      boxSizing: "border-box" as const,
    };
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
      {state.editingText && textOverlayStyle && (
        <textarea
          ref={textareaRef}
          value={state.editingText.text}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          style={textOverlayStyle}
          rows={Math.max(1, state.editingText.text.split("\n").length)}
          cols={Math.max(4, Math.max(...state.editingText.text.split("\n").map((l) => l.length)) + 2)}
          placeholder="Type here..."
        />
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
