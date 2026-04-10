import type { DrawingState } from "../state";
import { saveNoteFile, openNoteFile } from "../file-io";
import { supportsMultiWindow, openNewWindow } from "../window-manager";
import { h } from "./dom-helpers";

export function createFilePanel(state: DrawingState): HTMLElement {
  const container = h("div", {
    style: { position: "absolute", top: "100px", left: "12px", zIndex: "200", display: "flex", flexDirection: "column", gap: "4px" },
  });

  const btnStyle: Partial<CSSStyleDeclaration> = {
    padding: "6px 10px", border: "none", borderRadius: "8px",
    background: "rgba(255,255,255,0.9)", boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
    cursor: "pointer", fontSize: "16px", backdropFilter: "blur(8px)",
  };

  // Save button
  container.appendChild(h("button", {
    text: "\ud83d\udcbe",
    title: "Save (.note)",
    style: { ...btnStyle },
    onClick: async () => {
      try {
        await saveNoteFile(state.shapes);
      } catch (err) {
        console.error("Save failed:", err);
      }
    },
  }));

  // Open button
  container.appendChild(h("button", {
    text: "\ud83d\udcc2",
    title: "Open (.note)",
    style: { ...btnStyle },
    onClick: async () => {
      try {
        const shapes = await openNoteFile();
        if (!shapes) return;
        state.shapes = shapes;
        state.selectedIds = new Set();
        state.initHistory();
        state.notify("shapes");
        state.notify("selectedIds");
      } catch (err) {
        console.error("Open failed:", err);
      }
    },
  }));

  // New Window button (desktop only — WebviewWindow API unavailable on mobile)
  if (supportsMultiWindow()) {
    container.appendChild(h("button", {
      text: "\u2795",
      title: "New window",
      style: { ...btnStyle },
      onClick: async () => {
        try {
          await openNewWindow();
        } catch (err) {
          console.error("New window failed:", err);
        }
      },
    }));
  }

  // Prevent canvas interactions when clicking panel
  container.addEventListener("pointerdown", (e) => e.stopPropagation());

  return container;
}
