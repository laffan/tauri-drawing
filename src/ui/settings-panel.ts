import type { DrawingState } from "../state";
import { h, clearChildren } from "./dom-helpers";

export function createSettingsPanel(state: DrawingState): HTMLElement {
  const container = h("div", { style: { position: "absolute", top: "56px", left: "12px", zIndex: "200" } });

  let isOpen = false;

  const toggleBtn = h("button", {
    text: "\u2699",
    title: "Settings",
    style: {
      padding: "6px 10px", border: "none", borderRadius: "8px",
      background: "rgba(255,255,255,0.9)", boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
      cursor: "pointer", fontSize: "16px", backdropFilter: "blur(8px)",
    },
    onClick: () => { isOpen = !isOpen; rebuild(); },
  });
  container.appendChild(toggleBtn);

  // Modal overlay
  const overlay = h("div", {
    style: {
      display: "none", position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
      background: "rgba(0,0,0,0.3)", zIndex: "500", alignItems: "center", justifyContent: "center",
    },
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) { isOpen = false; rebuild(); }
  });
  container.appendChild(overlay);

  const modal = h("div", {
    style: {
      background: "#fff", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      width: "400px", maxHeight: "80vh", overflow: "auto", padding: "0",
    },
  });
  overlay.appendChild(modal);

  function rebuild() {
    overlay.style.display = isOpen ? "flex" : "none";
    if (!isOpen) return;

    clearChildren(modal);

    // Header
    const header = h("div", {
      style: { display: "flex", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e5e7eb" },
    });
    header.appendChild(h("span", { text: "Settings", style: { flex: "1", fontSize: "16px", fontWeight: "600", color: "#333" } }));
    header.appendChild(h("button", {
      text: "\u00d7",
      style: { border: "none", background: "none", cursor: "pointer", fontSize: "20px", color: "#999", padding: "0", lineHeight: "1" },
      onClick: () => { isOpen = false; rebuild(); },
    }));
    modal.appendChild(header);

    // Font size setting
    const fontSection = h("div", { style: { padding: "16px 20px", borderBottom: "1px solid #f1f3f5" } });
    fontSection.appendChild(h("div", { text: "Default Font Size", style: { fontSize: "13px", fontWeight: "600", color: "#555", marginBottom: "8px" } }));
    const fontRow = h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } });
    const fontInput = h("input", {
      attrs: { type: "range", min: "12", max: "36", step: "1" },
      style: { flex: "1" },
    }) as HTMLInputElement;
    fontInput.value = String(state.fontSize);
    const fontLabel = h("span", { text: `${state.fontSize}px`, style: { fontSize: "13px", color: "#666", minWidth: "40px" } });
    fontInput.addEventListener("input", () => {
      state.fontSize = parseInt(fontInput.value, 10);
      fontLabel.textContent = `${state.fontSize}px`;
      state.notify("fontSize");
    });
    fontRow.appendChild(fontInput);
    fontRow.appendChild(fontLabel);
    fontSection.appendChild(fontRow);
    modal.appendChild(fontSection);

    // Keyboard shortcuts reference
    const shortcutsSection = h("div", { style: { padding: "16px 20px" } });
    shortcutsSection.appendChild(h("div", { text: "Keyboard Shortcuts", style: { fontSize: "13px", fontWeight: "600", color: "#555", marginBottom: "8px" } }));
    const shortcuts: [string, string][] = [
      ["1", "Select tool"],
      ["T", "Text tool"],
      ["A", "Drag Area tool"],
      ["B", "Brainstorm mode"],
      ["Space (hold)", "Pan canvas"],
      ["Delete", "Delete selected"],
      ["Ctrl+Z", "Undo"],
      ["Ctrl+Shift+Z", "Redo"],
      ["Ctrl+G", "Group"],
      ["Ctrl+Shift+G", "Ungroup"],
      ["Alt+drag", "Duplicate"],
      ["Double-click", "New text"],
    ];
    for (const [key, desc] of shortcuts) {
      const row = h("div", { style: { display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px" } });
      row.appendChild(h("span", { text: key, style: { fontFamily: "monospace", background: "#f1f3f5", padding: "1px 6px", borderRadius: "3px", color: "#333" } }));
      row.appendChild(h("span", { text: desc, style: { color: "#666" } }));
      shortcutsSection.appendChild(row);
    }
    modal.appendChild(shortcutsSection);
  }

  return container;
}
