import type { DrawingState } from "../state";
import { saveNoteFile, openNoteFile } from "../file-io";
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
  const saveBtn = h("button", {
    text: "\ud83d\udcbe",
    title: "Save (.note)",
    style: { ...btnStyle },
    onClick: async () => {
      const name = prompt("File name:", "untitled");
      if (!name) return;
      await saveNoteFile(state.shapes, name);
    },
  });
  container.appendChild(saveBtn);

  // Open button
  const openBtn = h("button", {
    text: "\ud83d\udcc2",
    title: "Open (.note)",
    style: { ...btnStyle },
    onClick: () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".note,.zip";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const shapes = await openNoteFile(file);
          state.shapes = shapes;
          state.selectedIds = new Set();
          state.initHistory();
          state.notify("shapes");
          state.notify("selectedIds");
        } catch (err) {
          alert("Failed to open file: " + (err as Error).message);
        }
      });
      input.click();
    },
  });
  container.appendChild(openBtn);

  return container;
}
