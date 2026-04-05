import type { DrawingState } from "../state";
import type { Tool } from "../types";
import { h } from "./dom-helpers";

interface ToolDef { icon: string; label: string; tool: Tool | "brainstorm"; shortcut: string }

const TOOLS: ToolDef[] = [
  { icon: "👆", label: "Select", tool: "select", shortcut: "1" },
  { icon: "✋", label: "Hand", tool: "hand", shortcut: "2" },
  { icon: "✏️", label: "Draw", tool: "draw", shortcut: "3" },
  { icon: "T", label: "Text", tool: "text", shortcut: "T" },
  { icon: "🗑", label: "Erase", tool: "erase", shortcut: "E" },
];

const EXTRA_TOOLS: ToolDef[] = [
  { icon: "⬜", label: "Drag Area", tool: "drag-area", shortcut: "A" },
  { icon: "💡", label: "Brainstorm", tool: "brainstorm", shortcut: "B" },
];

export function createToolbar(state: DrawingState): HTMLElement {
  const buttons = new Map<string, HTMLButtonElement>();

  function makeBtn(def: ToolDef): HTMLButtonElement {
    const btn = h("button", {
      title: `${def.label} (${def.shortcut})`,
      style: { width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", transition: "all 0.15s" },
      children: [h("span", { text: def.icon, style: { fontSize: "16px" } })],
      onClick: () => {
        if (def.tool === "brainstorm") {
          state.brainstormMode = !state.brainstormMode;
          if (state.brainstormMode) { state.tool = "text"; state.notify("tool"); }
          state.notify("brainstormMode");
        } else {
          state.tool = def.tool;
          state.brainstormMode = false;
          state.notify("tool");
          state.notify("brainstormMode");
        }
      },
    });
    buttons.set(def.tool, btn);
    return btn;
  }

  const divider = h("div", { style: { width: "1px", height: "28px", background: "#dee2e6", margin: "0 2px" } });
  const spacer = h("div", { style: { flex: "1" } });
  const resetBtn = h("button", {
    title: "Reset view", text: "⌂",
    style: { width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", background: "rgba(255,255,255,0.9)" },
    onClick: () => { state.camera = { x: 0, y: 0, zoom: 1 }; state.notify("camera"); },
  });

  const container = h("div", {
    style: {
      position: "absolute", bottom: "16px", left: "50%", transform: "translateX(-50%)",
      display: "flex", alignItems: "center", gap: "4px", padding: "6px 8px",
      background: "rgba(255,255,255,0.95)", borderRadius: "12px",
      boxShadow: "0 2px 12px rgba(0,0,0,0.12)", zIndex: "100", userSelect: "none",
      backdropFilter: "blur(8px)",
    },
    children: [
      ...TOOLS.map(makeBtn),
      divider,
      ...EXTRA_TOOLS.map(makeBtn),
      spacer,
      resetBtn,
    ],
  });

  function update() {
    for (const [key, btn] of buttons) {
      const active = key === "brainstorm" ? state.brainstormMode : (state.tool === key && !state.brainstormMode);
      btn.style.backgroundColor = active ? "#4285f4" : "rgba(255,255,255,0.9)";
      btn.style.color = active ? "#fff" : "#333";
      btn.style.fontWeight = active ? "600" : "400";
      btn.style.boxShadow = active ? "0 2px 8px rgba(66,133,244,0.3)" : "0 1px 3px rgba(0,0,0,0.1)";
    }
  }

  state.addEventListener("change", update);
  update();
  return container;
}
