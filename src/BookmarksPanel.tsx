import { useState } from "react";
import type { CameraBookmark } from "./types";

interface BookmarksPanelProps {
  bookmarks: CameraBookmark[];
  onAdd: (name: string) => void;
  onGo: (bookmark: CameraBookmark) => void;
  onDelete: (id: string) => void;
}

export function BookmarksPanel({
  bookmarks,
  onAdd,
  onGo,
  onDelete,
}: BookmarksPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const handleAdd = () => {
    if (name.trim()) {
      onAdd(name.trim());
      setName("");
      setAdding(false);
    }
  };

  return (
    <div style={styles.container}>
      <button
        style={styles.toggleBtn}
        onClick={() => setIsOpen(!isOpen)}
        title="Canvas bookmarks"
      >
        🔖 {bookmarks.length > 0 && <span style={styles.badge}>{bookmarks.length}</span>}
      </button>

      {isOpen && (
        <div style={styles.dropdown}>
          <div style={styles.header}>Bookmarks</div>

          {bookmarks.map((b) => (
            <div key={b.id} style={styles.item}>
              <span
                style={styles.itemName}
                onClick={() => { onGo(b); setIsOpen(false); }}
              >
                {b.name}
              </span>
              <button
                style={styles.deleteBtn}
                onClick={() => onDelete(b.id)}
              >
                ×
              </button>
            </div>
          ))}

          {bookmarks.length === 0 && (
            <div style={styles.empty}>No bookmarks yet</div>
          )}

          {adding ? (
            <div style={styles.addForm}>
              <input
                style={styles.addInput}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bookmark name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") setAdding(false);
                }}
              />
              <button style={styles.addBtn} onClick={handleAdd}>
                ✓
              </button>
            </div>
          ) : (
            <button
              style={styles.newBtn}
              onClick={() => setAdding(true)}
            >
              + Save current view
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 200,
  },
  toggleBtn: {
    padding: "6px 10px",
    border: "none",
    borderRadius: 8,
    background: "rgba(255,255,255,0.9)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
    cursor: "pointer",
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    gap: 4,
    backdropFilter: "blur(8px)",
  },
  badge: {
    fontSize: 10,
    background: "#4285f4",
    color: "#fff",
    borderRadius: 8,
    padding: "1px 5px",
    fontWeight: 600,
  },
  dropdown: {
    marginTop: 4,
    background: "#fff",
    borderRadius: 8,
    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
    border: "1px solid #e5e7eb",
    width: 220,
    overflow: "hidden",
  },
  header: {
    padding: "8px 12px",
    fontWeight: 600,
    fontSize: 13,
    borderBottom: "1px solid #f1f3f5",
    color: "#333",
  },
  item: {
    display: "flex",
    alignItems: "center",
    padding: "6px 12px",
    borderBottom: "1px solid #f8f9fa",
    fontSize: 13,
  },
  itemName: {
    flex: 1,
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  deleteBtn: {
    border: "none",
    background: "none",
    cursor: "pointer",
    color: "#999",
    fontSize: 16,
  },
  empty: {
    padding: "12px",
    textAlign: "center",
    fontSize: 12,
    color: "#999",
  },
  newBtn: {
    width: "100%",
    padding: "8px 12px",
    border: "none",
    background: "#f8f9fa",
    cursor: "pointer",
    fontSize: 12,
    color: "#4285f4",
    textAlign: "left",
  },
  addForm: {
    display: "flex",
    padding: "6px",
    gap: 4,
  },
  addInput: {
    flex: 1,
    padding: "4px 8px",
    border: "1px solid #e5e7eb",
    borderRadius: 4,
    fontSize: 12,
    outline: "none",
  },
  addBtn: {
    border: "none",
    background: "#4285f4",
    color: "#fff",
    borderRadius: 4,
    padding: "4px 8px",
    cursor: "pointer",
    fontSize: 12,
  },
};
