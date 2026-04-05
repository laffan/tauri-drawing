import { useMemo, useState } from "react";
import type { Shape } from "./types";
import { getShapeBounds } from "./utils";

interface ShelfPanelProps {
  shapes: Shape[];
  isOpen: boolean;
  onToggle: () => void;
  onFocusShape: (id: string) => void;
  shelfItems: string[];
  onRemoveShelfItem: (index: number) => void;
}

interface ShelfNode {
  id: string;
  type: string;
  label: string;
  excerpt: string;
  color: string | null;
  shapeId: string;
  parentId: string | undefined;
  depth: number;
}

export function ShelfPanel({
  shapes,
  isOpen,
  onToggle,
  onFocusShape,
  shelfItems,
  onRemoveShelfItem,
}: ShelfPanelProps) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Build shelf nodes from shapes
  const nodes = useMemo(() => {
    const result: ShelfNode[] = [];

    // Drag areas first
    const dragAreas = shapes.filter((s) => s.type === "drag-area");
    const others = shapes.filter(
      (s) => s.type === "text" || s.type === "image"
    );

    for (const da of dragAreas) {
      const children = shapes.filter((s) => s.parentId === da.id);
      // Find upper-leftmost text child for name
      const textChildren = children.filter((s) => s.type === "text");
      let name = `🧺 (${children.length} items)`;
      if (textChildren.length > 0) {
        const sorted = [...textChildren].sort((a, b) => {
          const ab = getShapeBounds(a);
          const bb = getShapeBounds(b);
          return ab.minY - bb.minY || ab.minX - bb.minX;
        });
        if (sorted[0].type === "text") {
          const t = sorted[0].text.substring(0, 40);
          name = `🧺 ${t}${sorted[0].text.length > 40 ? "..." : ""}`;
        }
      }

      result.push({
        id: da.id,
        type: "drag-area",
        label: name,
        excerpt: "",
        color: da.type === "drag-area" ? da.strokeColor : null,
        shapeId: da.id,
        parentId: undefined,
        depth: 0,
      });

      if (!collapsed.has(da.id)) {
        // Sort children by Y then X
        const sortedChildren = [...children].sort((a, b) => {
          const ab = getShapeBounds(a);
          const bb = getShapeBounds(b);
          return ab.minY - bb.minY || ab.minX - bb.minX;
        });

        for (const child of sortedChildren) {
          if (child.type === "text") {
            result.push({
              id: child.id,
              type: "text",
              label:
                child.text.substring(0, 50) +
                (child.text.length > 50 ? "..." : ""),
              excerpt: child.text,
              color: child.backgroundColor || null,
              shapeId: child.id,
              parentId: da.id,
              depth: 1,
            });
          } else if (child.type === "image") {
            result.push({
              id: child.id,
              type: "image",
              label: child.name || "Image",
              excerpt: "",
              color: null,
              shapeId: child.id,
              parentId: da.id,
              depth: 1,
            });
          }
        }
      }
    }

    // Root-level shapes (no parent)
    const rootOthers = others
      .filter((s) => !s.parentId)
      .sort((a, b) => {
        const ab = getShapeBounds(a);
        const bb = getShapeBounds(b);
        return ab.minY - bb.minY || ab.minX - bb.minX;
      });

    for (const s of rootOthers) {
      if (s.type === "text") {
        if (!s.text.trim()) continue;
        result.push({
          id: s.id,
          type: "text",
          label:
            s.text.substring(0, 50) + (s.text.length > 50 ? "..." : ""),
          excerpt: s.text,
          color: s.backgroundColor || null,
          shapeId: s.id,
          parentId: undefined,
          depth: 0,
        });
      } else if (s.type === "image") {
        result.push({
          id: s.id,
          type: "image",
          label: s.name || "Image",
          excerpt: "",
          color: null,
          shapeId: s.id,
          parentId: undefined,
          depth: 0,
        });
      }
    }

    return result;
  }, [shapes, collapsed]);

  // Extract tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    const tagRegex = /#([\w-]+)/g;
    for (const n of nodes) {
      let match;
      while ((match = tagRegex.exec(n.excerpt)) !== null) {
        tags.add(match[1]);
      }
    }
    return Array.from(tags).sort();
  }, [nodes]);

  // Filter
  const filtered = useMemo(() => {
    let items = nodes;
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          n.excerpt.toLowerCase().includes(q)
      );
    }
    if (activeTag) {
      items = items.filter((n) => n.excerpt.includes(`#${activeTag}`));
    }
    return items;
  }, [nodes, search, activeTag]);

  const pinnedItems = filtered.filter((n) => pinned.has(n.id));
  const unpinnedItems = filtered.filter((n) => !pinned.has(n.id));

  return (
    <div
      style={{
        ...styles.panel,
        width: isOpen ? 280 : 24,
        minWidth: isOpen ? 280 : 24,
      }}
    >
      <button
        style={styles.grip}
        onClick={onToggle}
        title="Toggle shelf"
        aria-expanded={isOpen}
      >
        {isOpen ? "›" : "‹"}
      </button>

      {isOpen && (
        <div style={styles.content}>
          {/* Search */}
          <div style={styles.searchContainer}>
            <input
              style={styles.searchInput}
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                style={styles.clearBtn}
                onClick={() => setSearch("")}
              >
                ×
              </button>
            )}
          </div>

          {/* Tag filters */}
          {allTags.length > 0 && (
            <div style={styles.tagBar}>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() =>
                    setActiveTag(activeTag === tag ? null : tag)
                  }
                  style={{
                    ...styles.tagBtn,
                    background:
                      activeTag === tag ? "#4285f4" : "#f1f3f5",
                    color: activeTag === tag ? "#fff" : "#555",
                  }}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {/* Shelf items from canvas moves */}
          {shelfItems.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>Shelf Items</div>
              {shelfItems.map((text, i) => (
                <div key={i} style={styles.shelfItem}>
                  <span style={styles.shelfItemText}>{text}</span>
                  <button
                    style={styles.pinBtn}
                    onClick={() => onRemoveShelfItem(i)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Pinned */}
          {pinnedItems.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>📌 Pinned</div>
              {pinnedItems.map((node) => (
                <NodeRow
                  key={node.id}
                  node={node}
                  isPinned
                  onFocus={() => onFocusShape(node.shapeId)}
                  onTogglePin={() =>
                    setPinned((prev) => {
                      const next = new Set(prev);
                      next.delete(node.id);
                      return next;
                    })
                  }
                  onToggleCollapse={
                    node.type === "drag-area"
                      ? () =>
                          setCollapsed((prev) => {
                            const next = new Set(prev);
                            if (next.has(node.id)) next.delete(node.id);
                            else next.add(node.id);
                            return next;
                          })
                      : undefined
                  }
                  isCollapsed={collapsed.has(node.id)}
                />
              ))}
            </div>
          )}

          {/* All items */}
          <div style={styles.scrollArea}>
            {unpinnedItems.length === 0 && shelfItems.length === 0 && (
              <div style={styles.empty}>
                No items. Add shapes to the canvas.
              </div>
            )}
            {unpinnedItems.map((node) => (
              <NodeRow
                key={node.id}
                node={node}
                isPinned={false}
                onFocus={() => onFocusShape(node.shapeId)}
                onTogglePin={() =>
                  setPinned((prev) => {
                    const next = new Set(prev);
                    next.add(node.id);
                    return next;
                  })
                }
                onToggleCollapse={
                  node.type === "drag-area"
                    ? () =>
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          if (next.has(node.id)) next.delete(node.id);
                          else next.add(node.id);
                          return next;
                        })
                    : undefined
                }
                isCollapsed={collapsed.has(node.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NodeRow({
  node,
  isPinned,
  onFocus,
  onTogglePin,
  onToggleCollapse,
  isCollapsed,
}: {
  node: ShelfNode;
  isPinned: boolean;
  onFocus: () => void;
  onTogglePin: () => void;
  onToggleCollapse?: () => void;
  isCollapsed: boolean;
}) {
  return (
    <div
      style={{
        ...styles.nodeRow,
        paddingLeft: 8 + node.depth * 16,
        borderLeft: node.color
          ? `3px solid ${node.color}`
          : "3px solid transparent",
      }}
    >
      {onToggleCollapse && (
        <button
          style={styles.collapseBtn}
          onClick={onToggleCollapse}
        >
          {isCollapsed ? "▸" : "▾"}
        </button>
      )}
      <span style={styles.nodeLabel} onClick={onFocus}>
        {node.type === "image" ? "🖼 " : ""}
        {node.label}
      </span>
      <button
        style={styles.pinBtn}
        onClick={onTogglePin}
        title={isPinned ? "Unpin" : "Pin"}
      >
        {isPinned ? "📌" : "📍"}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "absolute",
    top: 0,
    right: 0,
    height: "100%",
    background: "#fff",
    borderLeft: "1px solid #e5e7eb",
    zIndex: 150,
    display: "flex",
    flexDirection: "column",
    transition: "width 0.2s",
    overflow: "hidden",
  },
  grip: {
    width: 24,
    height: 60,
    position: "absolute",
    left: 0,
    top: "50%",
    transform: "translateY(-50%)",
    background: "#f8f9fa",
    border: "1px solid #e5e7eb",
    borderRight: "none",
    borderRadius: "4px 0 0 4px",
    cursor: "pointer",
    fontSize: 14,
    color: "#666",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  content: {
    marginLeft: 24,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  searchContainer: {
    padding: "8px",
    position: "relative",
  },
  searchInput: {
    width: "100%",
    padding: "6px 28px 6px 8px",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  },
  clearBtn: {
    position: "absolute",
    right: 14,
    top: "50%",
    transform: "translateY(-50%)",
    border: "none",
    background: "none",
    cursor: "pointer",
    fontSize: 16,
    color: "#999",
  },
  tagBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    padding: "0 8px 8px",
  },
  tagBtn: {
    padding: "2px 8px",
    border: "none",
    borderRadius: 10,
    fontSize: 11,
    cursor: "pointer",
  },
  section: {
    padding: "4px 8px",
    borderBottom: "1px solid #f1f3f5",
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: 600,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    padding: "4px 0",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    padding: "4px 0",
  },
  nodeRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    cursor: "pointer",
    fontSize: 13,
    borderBottom: "1px solid #f8f9fa",
  },
  nodeLabel: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  collapseBtn: {
    border: "none",
    background: "none",
    cursor: "pointer",
    fontSize: 10,
    color: "#999",
    padding: 0,
    width: 16,
  },
  pinBtn: {
    border: "none",
    background: "none",
    cursor: "pointer",
    fontSize: 10,
    padding: 0,
    opacity: 0.5,
  },
  shelfItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 0",
    fontSize: 13,
    borderBottom: "1px solid #f8f9fa",
  },
  shelfItemText: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  empty: {
    padding: 16,
    textAlign: "center",
    fontSize: 12,
    color: "#999",
  },
};
