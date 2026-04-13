import type { DrawingState } from "../state";
import { COLOR_PALETTE, BACKGROUND_COLORS, TEXT_COLORS } from "../types";
import { canvasToScreen, computePinnedLayout, getShapeBounds } from "../utils";
import { h, clearChildren } from "./dom-helpers";

export function createSelectionToolbar(state: DrawingState, onMoveToShelf: () => void): HTMLElement {
  const container = h("div", {
    style: { position: "absolute", display: "none", gap: "2px", zIndex: "200", pointerEvents: "auto" },
  });

  let activePopup: "color" | "bg" | "size" | "align" | null = null;
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

  function makeAlignMenu(state: DrawingState): HTMLElement {
    const btnStyle: Partial<CSSStyleDeclaration> = {
      width: "26px", height: "26px", border: "none", borderRadius: "4px",
      background: "transparent", cursor: "pointer", fontSize: "13px",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "0",
    };
    const items: { icon: string; title: string; action: () => void }[] = [
      { icon: "\u2b06", title: "Align top", action: () => state.alignSelected("top") },
      { icon: "\u2b07", title: "Align bottom", action: () => state.alignSelected("bottom") },
      { icon: "\u2b05", title: "Align left", action: () => state.alignSelected("left") },
      { icon: "\u27a1", title: "Align right", action: () => state.alignSelected("right") },
      { icon: "\u2195", title: "Distribute vertically", action: () => state.distributeSelected("vertical") },
      { icon: "\u2194", title: "Distribute horizontally", action: () => state.distributeSelected("horizontal") },
    ];
    const panel = h("div", {
      style: { position: "absolute", top: "-40px", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "2px", padding: "4px 6px", background: "#fff", borderRadius: "8px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", border: "1px solid #e5e7eb", zIndex: "300" },
      children: items.map((it) => h("button", { text: it.icon, title: it.title, style: { ...btnStyle }, onClick: it.action })),
    });
    panel.addEventListener("pointerdown", (e) => e.stopPropagation());
    return panel;
  }

  function togglePopup(type: "color" | "bg" | "size" | "align", wrapper: HTMLElement, create: () => HTMLElement) {
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

    // Check if selected shapes are pinned (use screen bounds for positioning)
    const pinnedLayout = computePinnedLayout(state.shapes, state.fontFamily);
    const pinnedScreenMap = new Map<string, { minX: number; minY: number }>();
    for (const entry of pinnedLayout.entries) {
      for (const s of entry.shapes) {
        pinnedScreenMap.set(s.id, { minX: entry.screenBounds.minX, minY: entry.screenBounds.minY });
      }
    }
    const allSelectedPinned = selected.every((s) => pinnedLayout.pinnedIds.has(s.id));

    let screenMinX: number, screenMinY: number;
    if (allSelectedPinned) {
      screenMinX = Infinity; screenMinY = Infinity;
      for (const s of selected) {
        const sb = pinnedScreenMap.get(s.id);
        if (sb) { screenMinX = Math.min(screenMinX, sb.minX); screenMinY = Math.min(screenMinY, sb.minY); }
      }
    } else {
      let minX = Infinity, minY = Infinity;
      for (const s of selected) {
        if (pinnedLayout.pinnedIds.has(s.id)) continue;
        const b = getShapeBounds(s);
        if (b.minX < minX) minX = b.minX;
        if (b.minY < minY) minY = b.minY;
      }
      const topLeft = canvasToScreen({ x: minX, y: minY }, state.camera);
      screenMinX = topLeft.x;
      screenMinY = topLeft.y;
    }

    container.style.display = "flex";
    container.style.left = screenMinX + "px";
    container.style.top = (screenMinY - 44) + "px";

    const hasText = selected.some((s) => s.type === "text");
    const hasImage = selected.some((s) => s.type === "image");
    const hasColorable = selected.some((s) => s.type === "text");
    const hasBgable = selected.some((s) => s.type === "text" || s.type === "drag-area");
    const hasPinnable = selected.some((s) => s.type === "text" || s.type === "drag-area" || s.type === "image");
    const multiSelect = selected.length > 1;

    if (multiSelect) {
      const wrapper = h("div", { style: { position: "relative" } });
      wrapper.appendChild(makeIconBtn("\ud83d\udcd0", "Align / Distribute", () => {
        togglePopup("align", wrapper, () => makeAlignMenu(state));
      }));
      container.appendChild(wrapper);
      if (savedPopup === "align") togglePopup("align", wrapper, () => makeAlignMenu(state));
    }
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

    if (hasPinnable) {
      const anyPinned = selected.some((s) => s.pinned);
      container.appendChild(makeIconBtn("\uD83D\uDCCD", anyPinned ? "Unpin" : "Pin to side", () => state.toggleSelectedPinned()));
    }

    container.appendChild(makeIconBtn("\ud83d\uddd1", "Delete", () => state.deleteSelected()));
  }

  state.addEventListener("change", update);
  update();
  return container;
}
