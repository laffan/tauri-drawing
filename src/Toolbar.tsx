import type { Tool } from "./types";

const COLORS = ["#000000", "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#9c36b5", "#ffffff"];

interface ToolbarProps {
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (w: number) => void;
  fontSize: number;
  setFontSize: (s: number) => void;
  hasSelection: boolean;
  onDelete: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onChangeColor: (c: string) => void;
  onResetView: () => void;
}

export function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
  fontSize,
  setFontSize,
  hasSelection,
  onDelete,
  onGroup,
  onUngroup,
  onChangeColor,
  onResetView,
}: ToolbarProps) {
  return (
    <div style={styles.container}>
      <div style={styles.section}>
        <ToolButton label="Draw" active={tool === "draw"} onClick={() => setTool("draw")} shortcut="D" />
        <ToolButton label="Text" active={tool === "text"} onClick={() => setTool("text")} shortcut="T" />
        <ToolButton label="Select" active={tool === "select"} onClick={() => setTool("select")} shortcut="S" />
        <ToolButton label="Erase" active={tool === "erase"} onClick={() => setTool("erase")} shortcut="E" />
      </div>

      <div style={styles.divider} />

      <div style={styles.section}>
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setColor(c);
              if (hasSelection) onChangeColor(c);
            }}
            style={{
              ...styles.colorBtn,
              backgroundColor: c,
              border: c === color ? "3px solid #228be6" : "2px solid #ccc",
              outline: c === "#ffffff" ? "1px solid #ddd" : "none",
            }}
          />
        ))}
      </div>

      <div style={styles.divider} />

      {(tool === "draw" || tool === "erase") && (
        <div style={styles.section}>
          <label style={styles.label}>Size</label>
          <input
            type="range"
            min={1}
            max={20}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <span style={styles.label}>{strokeWidth}px</span>
        </div>
      )}

      {tool === "text" && (
        <div style={styles.section}>
          <label style={styles.label}>Font</label>
          <input
            type="range"
            min={10}
            max={72}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <span style={styles.label}>{fontSize}px</span>
        </div>
      )}

      <div style={styles.divider} />

      <div style={styles.section}>
        <button style={styles.btn} disabled={!hasSelection} onClick={onGroup}>
          Group
        </button>
        <button style={styles.btn} disabled={!hasSelection} onClick={onUngroup}>
          Ungroup
        </button>
        <button style={{ ...styles.btn, color: "#e03131" }} disabled={!hasSelection} onClick={onDelete}>
          Delete
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <button style={styles.btn} onClick={onResetView}>
        Reset View
      </button>
    </div>
  );
}

function ToolButton({
  label,
  active,
  onClick,
  shortcut,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  shortcut: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.btn,
        backgroundColor: active ? "#228be6" : "#f8f9fa",
        color: active ? "#fff" : "#333",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label} <span style={{ fontSize: 10, opacity: 0.6 }}>({shortcut})</span>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    gap: 6,
    background: "#fff",
    borderBottom: "1px solid #dee2e6",
    zIndex: 100,
    userSelect: "none",
  },
  section: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  divider: {
    width: 1,
    height: 28,
    background: "#dee2e6",
    margin: "0 4px",
  },
  btn: {
    padding: "6px 12px",
    border: "1px solid #dee2e6",
    borderRadius: 6,
    background: "#f8f9fa",
    cursor: "pointer",
    fontSize: 13,
  },
  colorBtn: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    cursor: "pointer",
    padding: 0,
  },
  label: {
    fontSize: 12,
    color: "#666",
  },
};
