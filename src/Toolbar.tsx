import type { Tool } from "./types";

interface ToolbarProps {
  tool: Tool;
  setTool: (t: Tool) => void;
  brainstormMode: boolean;
  setBrainstormMode: (b: boolean) => void;
  onResetView: () => void;
}

export function Toolbar({
  tool,
  setTool,
  brainstormMode,
  setBrainstormMode,
  onResetView,
}: ToolbarProps) {
  return (
    <div style={styles.container}>
      <ToolBtn icon="👆" label="Select" active={tool === "select" && !brainstormMode} onClick={() => { setTool("select"); setBrainstormMode(false); }} shortcut="1" />
      <ToolBtn icon="✋" label="Hand" active={tool === "hand"} onClick={() => { setTool("hand"); setBrainstormMode(false); }} shortcut="2" />
      <ToolBtn icon="✏️" label="Draw" active={tool === "draw"} onClick={() => { setTool("draw"); setBrainstormMode(false); }} shortcut="3" />
      <ToolBtn icon="T" label="Text" active={tool === "text"} onClick={() => { setTool("text"); setBrainstormMode(false); }} shortcut="T" />
      <ToolBtn icon="🗑" label="Erase" active={tool === "erase"} onClick={() => { setTool("erase"); setBrainstormMode(false); }} shortcut="E" />

      <div style={styles.divider} />

      <ToolBtn icon="⬜" label="Drag Area" active={tool === "drag-area"} onClick={() => { setTool("drag-area"); setBrainstormMode(false); }} shortcut="A" />
      <ToolBtn
        icon="💡"
        label="Brainstorm"
        active={brainstormMode}
        onClick={() => {
          setBrainstormMode(!brainstormMode);
          if (!brainstormMode) setTool("text");
        }}
        shortcut="B"
      />

      <div style={{ flex: 1 }} />

      <button style={styles.btn} onClick={onResetView} title="Reset view">
        ⌂
      </button>
    </div>
  );
}

function ToolBtn({
  icon,
  label,
  active,
  onClick,
  shortcut,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
  shortcut: string;
}) {
  return (
    <button
      onClick={onClick}
      title={`${label} (${shortcut})`}
      style={{
        ...styles.btn,
        backgroundColor: active ? "#4285f4" : "rgba(255,255,255,0.9)",
        color: active ? "#fff" : "#333",
        fontWeight: active ? 600 : 400,
        boxShadow: active ? "0 2px 8px rgba(66,133,244,0.3)" : "0 1px 3px rgba(0,0,0,0.1)",
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "absolute",
    bottom: 16,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 8px",
    background: "rgba(255,255,255,0.95)",
    borderRadius: 12,
    boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
    zIndex: 100,
    userSelect: "none",
    backdropFilter: "blur(8px)",
  },
  divider: {
    width: 1,
    height: 28,
    background: "#dee2e6",
    margin: "0 2px",
  },
  btn: {
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    transition: "all 0.15s",
  },
};
