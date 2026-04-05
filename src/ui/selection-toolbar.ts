import type { DrawingState } from "../state";
import { COLOR_PALETTE, BACKGROUND_COLORS, TEXT_COLORS } from "../types";
import { canvasToScreen, getShapeBounds } from "../utils";
import { h, clearChildren } from "./dom-helpers";

export function createSelectionToolbar(state: DrawingState, onMoveToShelf: () => void): HTMLElement {
  const container = h("div", {
    style: { position: "absolute", display: "none", gap: "2px", zIndex: "200", pointerEvents: "auto" },
  });

  let colorPickerEl: HTMLElement | null = null;
  let bgPickerEl: HTMLElement | null = null;

  function makeIconBtn(icon: string, title: string, onClick: () => void): HTMLButtonElement {
    return h("button", {
      title, text: icon,
      style: { width: "28px", height: "28px", border: "none", borderRadius: "6px", background: "transparent", cursor: "pointer", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center" },
      onClick,
    });
  }

  function makePalette(colors: readonly string[], onSelect: (c: string) => void): HTMLElement {
    return h("div", {
      style: { position: "absolute", top: "-36px", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "4px", padding: "6px 8px", background: "#fff", borderRadius: "8px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", border: "1px solid #e5e7eb", zIndex: "300" },
      children: colors.map((c) => {
        if (c === "reset") {
          const btn = h("button", {
            title: "Reset",
            style: { width: "14px", height: "14px", borderRadius: "50%", border: "1px solid #ccc", background: "#fff", cursor: "pointer", padding: "0", position: "relative" },
            onClick: () => onSelect(c),
          });
          const slash = h("span", { style: { position: "absolute", top: "50%", left: "-1px", width: "14px", height: "1px", background: "red", transform: "rotate(45deg)", transformOrigin: "center" } });
          btn.appendChild(slash);
          return btn;
        }
        return h("button", {
          title: c,
          style: { width: "14px", height: "14px", borderRadius: "50%", border: "none", background: COLOR_PALETTE[c] || "#ccc", cursor: "pointer", padding: "0" },
          onClick: () => onSelect(c),
        });
      }),
    });
  }

  function update() {
    clearChildren(container);
    colorPickerEl = null;
    bgPickerEl = null;

    if (state.selectedIds.size === 0) {
      container.style.display = "none";
      return;
    }

    const selected = state.shapes.filter((s) => state.selectedIds.has(s.id));
    if (selected.length === 0) { container.style.display = "none"; return; }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of selected) {
      const b = getShapeBounds(s);
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    const topLeft = canvasToScreen({ x: minX, y: minY }, state.camera);

    container.style.display = "flex";
    container.style.left = topLeft.x + "px";
    container.style.top = (topLeft.y - 44) + "px";

    const hasText = selected.some((s) => s.type === "text");
    const hasColorable = selected.some((s) => s.type === "text" || s.type === "draw");
    const hasBgable = selected.some((s) => s.type === "text" || s.type === "drag-area");
    const multiSelect = selected.length > 1;

    if (multiSelect) container.appendChild(makeIconBtn("📐", "Align left", () => state.alignSelected("left")));
    if (hasText) container.appendChild(makeIconBtn("📋", "Move to shelf", onMoveToShelf));

    if (hasColorable) {
      const wrapper = h("div", { style: { position: "relative" } });
      wrapper.appendChild(makeIconBtn("🖍️", "Text color", () => {
        if (colorPickerEl) { colorPickerEl.remove(); colorPickerEl = null; }
        else {
          if (bgPickerEl) { bgPickerEl.remove(); bgPickerEl = null; }
          colorPickerEl = makePalette(TEXT_COLORS, (c) => {
            state.changeSelectedColor(c === "reset" ? "black" : c);
            if (colorPickerEl) { colorPickerEl.remove(); colorPickerEl = null; }
          });
          wrapper.appendChild(colorPickerEl);
        }
      }));
      container.appendChild(wrapper);
    }

    if (hasBgable) {
      const wrapper = h("div", { style: { position: "relative" } });
      wrapper.appendChild(makeIconBtn("🪣", "Background", () => {
        if (bgPickerEl) { bgPickerEl.remove(); bgPickerEl = null; }
        else {
          if (colorPickerEl) { colorPickerEl.remove(); colorPickerEl = null; }
          bgPickerEl = makePalette(BACKGROUND_COLORS, (c) => {
            state.changeSelectedBackground(c);
            if (bgPickerEl) { bgPickerEl.remove(); bgPickerEl = null; }
          });
          wrapper.appendChild(bgPickerEl);
        }
      }));
      container.appendChild(wrapper);
    }

    container.appendChild(makeIconBtn("🗑", "Delete", () => state.deleteSelected()));
  }

  state.addEventListener("change", update);
  update();
  return container;
}
