import type { DrawingState } from "../state";
import { h, clearChildren } from "./dom-helpers";

export function createBookmarksPanel(state: DrawingState): HTMLElement {
  let isOpen = false;
  let adding = false;

  const container = h("div", { style: { position: "absolute", top: "12px", left: "12px", zIndex: "200" } });
  const toggleBtn = h("button", {
    style: { padding: "6px 10px", border: "none", borderRadius: "8px", background: "rgba(255,255,255,0.9)", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", cursor: "pointer", fontSize: "16px", display: "flex", alignItems: "center", gap: "4px", backdropFilter: "blur(8px)" },
    title: "Canvas bookmarks",
    onClick: () => { isOpen = !isOpen; rebuild(); },
  });
  container.appendChild(toggleBtn);

  const dropdown = h("div", {
    style: { marginTop: "4px", background: "#fff", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", border: "1px solid #e5e7eb", width: "220px", overflow: "hidden", display: "none" },
  });
  container.appendChild(dropdown);

  function rebuild() {
    // Toggle button
    toggleBtn.textContent = "";
    toggleBtn.appendChild(document.createTextNode("🔖 "));
    if (state.bookmarks.length > 0) {
      const badge = h("span", { text: String(state.bookmarks.length), style: { fontSize: "10px", background: "#4285f4", color: "#fff", borderRadius: "8px", padding: "1px 5px", fontWeight: "600" } });
      toggleBtn.appendChild(badge);
    }

    dropdown.style.display = isOpen ? "block" : "none";
    if (!isOpen) return;

    clearChildren(dropdown);
    dropdown.appendChild(h("div", { text: "Bookmarks", style: { padding: "8px 12px", fontWeight: "600", fontSize: "13px", borderBottom: "1px solid #f1f3f5", color: "#333" } }));

    for (const bm of state.bookmarks) {
      const row = h("div", { style: { display: "flex", alignItems: "center", padding: "6px 12px", borderBottom: "1px solid #f8f9fa", fontSize: "13px" } });
      row.appendChild(h("span", { text: bm.name, style: { flex: "1", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, onClick: () => { state.goToBookmark(bm); isOpen = false; rebuild(); } }));
      row.appendChild(h("button", { text: "×", style: { border: "none", background: "none", cursor: "pointer", color: "#999", fontSize: "16px" }, onClick: () => { state.deleteBookmark(bm.id); rebuild(); } }));
      dropdown.appendChild(row);
    }

    if (state.bookmarks.length === 0) {
      dropdown.appendChild(h("div", { text: "No bookmarks yet", style: { padding: "12px", textAlign: "center", fontSize: "12px", color: "#999" } }));
    }

    if (adding) {
      const form = h("div", { style: { display: "flex", padding: "6px", gap: "4px" } });
      const input = h("input", { style: { flex: "1", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: "4px", fontSize: "12px", outline: "none" }, attrs: { type: "text", placeholder: "Bookmark name" } });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doAdd();
        if (e.key === "Escape") { adding = false; rebuild(); }
      });
      const addBtn = h("button", { text: "✓", style: { border: "none", background: "#4285f4", color: "#fff", borderRadius: "4px", padding: "4px 8px", cursor: "pointer", fontSize: "12px" }, onClick: doAdd });
      form.appendChild(input);
      form.appendChild(addBtn);
      dropdown.appendChild(form);
      setTimeout(() => input.focus(), 10);

      function doAdd() {
        const name = input.value.trim();
        if (name) { state.addBookmark(name); adding = false; rebuild(); }
      }
    } else {
      dropdown.appendChild(h("button", { text: "+ Save current view", style: { width: "100%", padding: "8px 12px", border: "none", background: "#f8f9fa", cursor: "pointer", fontSize: "12px", color: "#4285f4", textAlign: "left" }, onClick: () => { adding = true; rebuild(); } }));
    }
  }

  state.addEventListener("change", rebuild);
  rebuild();
  return container;
}
