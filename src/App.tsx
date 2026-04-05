import { useEffect } from "react";
import { Canvas } from "./Canvas";
import { Toolbar } from "./Toolbar";
import { useDrawingState } from "./useDrawingState";

function App() {
  const state = useDrawingState();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key.toLowerCase()) {
        case "d":
          state.setTool("draw");
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

  const cursorMap = {
    draw: "crosshair",
    select: "default",
    erase: "pointer",
  };

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative" }}>
      <Toolbar
        tool={state.tool}
        setTool={state.setTool}
        color={state.color}
        setColor={state.setColor}
        strokeWidth={state.strokeWidth}
        setStrokeWidth={state.setStrokeWidth}
        hasSelection={state.selectedIds.size > 0}
        onDelete={state.deleteSelected}
        onGroup={state.groupSelected}
        onUngroup={state.ungroupSelected}
        onChangeColor={state.changeSelectedColor}
        onResetView={() => state.setCamera({ x: 0, y: 0, zoom: 1 })}
      />
      <Canvas
        strokes={state.strokes}
        currentStroke={state.currentStroke}
        selectedIds={state.selectedIds}
        camera={state.camera}
        selectionBox={state.selectionBox}
        color={state.color}
        strokeWidth={state.strokeWidth}
        onPointerDown={state.handlePointerDown}
        onPointerMove={state.handlePointerMove}
        onPointerUp={state.handlePointerUp}
        onWheel={state.handleWheel}
        toolCursor={cursorMap[state.tool]}
      />
      <div style={styles.statusBar}>
        <span>Zoom: {Math.round(state.camera.zoom * 100)}%</span>
        <span>Strokes: {state.strokes.length}</span>
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
