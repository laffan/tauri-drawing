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

  // Save name input (hidden until save clicked)
  let nameInputEl: HTMLElement | null = null;

  function showNameInput() {
    if (nameInputEl) { nameInputEl.remove(); nameInputEl = null; return; }
    const wrapper = h("div", {
      style: {
        position: "absolute", left: "44px", top: "0", display: "flex", gap: "4px",
        background: "#fff", borderRadius: "8px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        padding: "4px", border: "1px solid #e5e7eb", zIndex: "10",
      },
    });
    const input = h("input", {
      attrs: { type: "text", placeholder: "filename" },
      style: { width: "140px", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: "4px", fontSize: "12px", outline: "none" },
    }) as HTMLInputElement;
    input.value = "untitled";
    const goBtn = h("button", {
      text: "\u2713",
      style: { border: "none", background: "#4285f4", color: "#fff", borderRadius: "4px", padding: "4px 8px", cursor: "pointer", fontSize: "12px" },
      onClick: () => doSave(input.value.trim()),
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSave(input.value.trim());
      if (e.key === "Escape") { wrapper.remove(); nameInputEl = null; }
    });
    wrapper.appendChild(input);
    wrapper.appendChild(h("span", { text: ".note", style: { fontSize: "11px", color: "#999", alignSelf: "center" } }));
    wrapper.appendChild(goBtn);
    container.appendChild(wrapper);
    nameInputEl = wrapper;
    setTimeout(() => { input.focus(); input.select(); }, 20);
  }

  async function doSave(name: string) {
    if (!name) name = "untitled";
    if (nameInputEl) { nameInputEl.remove(); nameInputEl = null; }
    try {
      await saveNoteFile(state.shapes, name);
    } catch (err) {
      console.error("Save failed:", err);
    }
  }

  // Save button
  container.appendChild(h("button", {
    text: "\ud83d\udcbe",
    title: "Save (.note)",
    style: { ...btnStyle },
    onClick: () => showNameInput(),
  }));

  // Open button
  container.appendChild(h("button", {
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
          console.error("Open failed:", err);
        }
      });
      input.click();
    },
  }));

  // Prevent canvas interactions when clicking panel
  container.addEventListener("pointerdown", (e) => e.stopPropagation());

  return container;
}
