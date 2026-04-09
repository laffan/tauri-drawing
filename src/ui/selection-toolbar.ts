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
  let sizeSliderEl: HTMLElement | null = null;

  function closePopups() {
    if (colorPickerEl) { colorPickerEl.remove(); colorPickerEl = null; }
    if (bgPickerEl) { bgPickerEl.remove(); bgPickerEl = null; }
    if (sizeSliderEl) { sizeSliderEl.remove(); sizeSliderEl = null; }
  }

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

  function makeSizeSlider(currentSize: number, onChange: (size: number) => void): HTMLElement {
    const panel = h("div", {
      style: { position: "absolute", top: "-44px", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", background: "#fff", borderRadius: "8px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", border: "1px solid #e5e7eb", zIndex: "300", whiteSpace: "nowrap" },
    });
    const slider = h("input", {
      attrs: { type: "range", min: "10", max: "72", step: "1" },
      style: { width: "100px" },
    }) as HTMLInputElement;
    slider.value = String(currentSize);
    const label = h("span", { text: `${currentSize}px`, style: { fontSize: "11px", color: "#666", minWidth: "32px" } });
    slider.addEventListener("input", () => {
      const v = parseInt(slider.value, 10);
      label.textContent = `${v}px`;
      onChange(v);
    });
    panel.appendChild(h("span", { text: "A", style: { fontSize: "10px", color: "#999" } }));
    panel.appendChild(slider);
    panel.appendChild(h("span", { text: "A", style: { fontSize: "16px", fontWeight: "600", color: "#555" } }));
    panel.appendChild(label);
    return panel;
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
    const hasColorable = selected.some((s) => s.type === "text");
    const hasBgable = selected.some((s) => s.type === "text" || s.type === "drag-area");
    const multiSelect = selected.length > 1;

    if (multiSelect) container.appendChild(makeIconBtn("📐", "Align left", () => state.alignSelected("left")));
    if (hasText) container.appendChild(makeIconBtn("📋", "Move to shelf", onMoveToShelf));

    if (hasColorable) {
      const wrapper = h("div", { style: { position: "relative" } });
      wrapper.appendChild(makeIconBtn("\ud83d\udd8d\ufe0f", "Text color", () => {
        const wasOpen = !!colorPickerEl;
        closePopups();
        if (wasOpen) return;
        colorPickerEl = makePalette(TEXT_COLORS, (c) => {
          state.changeSelectedColor(c === "reset" ? "black" : c);
          closePopups();
        });
        wrapper.appendChild(colorPickerEl);
      }));
      container.appendChild(wrapper);
    }

    if (hasBgable) {
      const wrapper = h("div", { style: { position: "relative" } });
      wrapper.appendChild(makeIconBtn("\ud83e\udea3", "Background", () => {
        const wasOpen = !!bgPickerEl;
        closePopups();
        if (wasOpen) return;
        bgPickerEl = makePalette(BACKGROUND_COLORS, (c) => {
          state.changeSelectedBackground(c);
          closePopups();
        });
        wrapper.appendChild(bgPickerEl);
      }));
      container.appendChild(wrapper);
    }

    // Font size slider
    if (hasText) {
      const wrapper = h("div", { style: { position: "relative" } });
      wrapper.appendChild(makeIconBtn("\ud83d\udd0d", "Text size", () => {
        const wasOpen = !!sizeSliderEl;
        closePopups();
        if (wasOpen) return;
        // Get current font size from first selected text shape
        const textShape = selected.find((s) => s.type === "text");
        const currentSize = textShape && textShape.type === "text" ? textShape.fontSize : 18;
        sizeSliderEl = makeSizeSlider(currentSize, (size) => {
          state.changeSelectedFontSize(size);
        });
        wrapper.appendChild(sizeSliderEl);
      }));
      container.appendChild(wrapper);
    }

    container.appendChild(makeIconBtn("\ud83d\uddd1", "Delete", () => state.deleteSelected()));
  }

  state.addEventListener("change", update);
  update();
  return container;
}
