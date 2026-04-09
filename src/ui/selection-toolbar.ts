import type { DrawingState } from "../state";
import { COLOR_PALETTE, BACKGROUND_COLORS, TEXT_COLORS } from "../types";
import { canvasToScreen, getShapeBounds } from "../utils";
import { h, clearChildren } from "./dom-helpers";

export function createSelectionToolbar(state: DrawingState, onMoveToShelf: () => void): HTMLElement {
  const container = h("div", {
    style: { position: "absolute", display: "none", gap: "2px", zIndex: "200", pointerEvents: "auto" },
  });

  let activePopup: "color" | "bg" | "size" | null = null;
  let popupEl: HTMLElement | null = null;
  let popupWrapper: HTMLElement | null = null;

  function closePopup() {
    if (popupEl) { popupEl.remove(); popupEl = null; }
    activePopup = null;
    popupWrapper = null;
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
      attrs: { type: "range", min: "6", max: "30", step: "1" },
      style: { width: "100px" },
    }) as HTMLInputElement;
    slider.value = String(currentSize);
    const label = h("span", { text: `${currentSize}px`, style: { fontSize: "11px", color: "#666", minWidth: "32px" } });
    slider.addEventListener("input", () => {
      const v = parseInt(slider.value, 10);
      label.textContent = `${v}px`;
      onChange(v);
    });
    // Prevent pointer events from reaching the canvas during slider interaction
    panel.addEventListener("pointerdown", (e) => e.stopPropagation());
    panel.appendChild(h("span", { text: "A", style: { fontSize: "10px", color: "#999" } }));
    panel.appendChild(slider);
    panel.appendChild(h("span", { text: "A", style: { fontSize: "16px", fontWeight: "600", color: "#555" } }));
    panel.appendChild(label);
    return panel;
  }

  // Close popup on click outside
  document.addEventListener("pointerdown", (e) => {
    if (!popupEl || !activePopup) return;
    const target = e.target as HTMLElement;
    if (popupEl.contains(target)) return;
    // Check if click is on the button that opened it (toggle behavior)
    if (popupWrapper?.contains(target)) return;
    closePopup();
  });

  function togglePopup(type: "color" | "bg" | "size", wrapper: HTMLElement, create: () => HTMLElement) {
    if (activePopup === type) { closePopup(); return; }
    closePopup();
    popupEl = create();
    popupWrapper = wrapper;
    activePopup = type;
    wrapper.appendChild(popupEl);
  }

  function update() {
    // Preserve popup state across rebuilds
    const savedPopup = activePopup;
    clearChildren(container);
    popupEl = null;
    popupWrapper = null;
    activePopup = null;

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
    const hasImage = selected.some((s) => s.type === "image");
    const hasColorable = selected.some((s) => s.type === "text");
    const hasBgable = selected.some((s) => s.type === "text" || s.type === "drag-area");
    const multiSelect = selected.length > 1;

    if (multiSelect) container.appendChild(makeIconBtn("\ud83d\udcd0", "Align left", () => state.alignSelected("left")));
    if (hasText) container.appendChild(makeIconBtn("\ud83d\udccb", "Move to shelf", onMoveToShelf));

    if (hasImage && selected.length === 1) {
      const isCropping = state.croppingImageId === selected[0].id;
      container.appendChild(makeIconBtn("\u2702\ufe0f", isCropping ? "Finish crop" : "Crop image", () => {
        if (isCropping) state.stopCropping();
        else state.startCropping(selected[0].id);
      }));
    }

    if (hasColorable) {
      const wrapper = h("div", { style: { position: "relative" } });
      wrapper.appendChild(makeIconBtn("\ud83d\udd8d\ufe0f", "Text color", () => {
        togglePopup("color", wrapper, () => makePalette(TEXT_COLORS, (c) => {
          state.changeSelectedColor(c === "reset" ? "black" : c);
          closePopup();
        }));
      }));
      container.appendChild(wrapper);
      if (savedPopup === "color") togglePopup("color", wrapper, () => makePalette(TEXT_COLORS, (c) => {
        state.changeSelectedColor(c === "reset" ? "black" : c);
        closePopup();
      }));
    }

    if (hasBgable) {
      const wrapper = h("div", { style: { position: "relative" } });
      wrapper.appendChild(makeIconBtn("\ud83e\udea3", "Background", () => {
        togglePopup("bg", wrapper, () => makePalette(BACKGROUND_COLORS, (c) => {
          state.changeSelectedBackground(c);
          closePopup();
        }));
      }));
      container.appendChild(wrapper);
      if (savedPopup === "bg") togglePopup("bg", wrapper, () => makePalette(BACKGROUND_COLORS, (c) => {
        state.changeSelectedBackground(c);
        closePopup();
      }));
    }

    if (hasText) {
      const wrapper = h("div", { style: { position: "relative" } });
      wrapper.appendChild(makeIconBtn("\ud83d\udd0d", "Text size", () => {
        const textShape = selected.find((s) => s.type === "text");
        const currentSize = textShape && textShape.type === "text" ? textShape.fontSize : 18;
        togglePopup("size", wrapper, () => makeSizeSlider(currentSize, (size) => {
          state.changeSelectedFontSize(size);
        }));
      }));
      container.appendChild(wrapper);
      // Restore size slider if it was open
      if (savedPopup === "size") {
        const textShape = selected.find((s) => s.type === "text");
        const currentSize = textShape && textShape.type === "text" ? textShape.fontSize : 18;
        togglePopup("size", wrapper, () => makeSizeSlider(currentSize, (size) => {
          state.changeSelectedFontSize(size);
        }));
      }
    }

    container.appendChild(makeIconBtn("\ud83d\uddd1", "Delete", () => state.deleteSelected()));
  }

  state.addEventListener("change", update);
  update();
  return container;
}
