import type { DrawingState } from "./state";
import {
  extractDroppedText, extractTextFromDataTransfer,
  fileToDataUrl, getImageDimensions, isTextFile,
} from "./external-content";
import { screenToCanvas } from "./utils";

export function bindInputEvents(canvas: HTMLCanvasElement, state: DrawingState): () => void {
  const cleanups: (() => void)[] = [];

  function on<K extends keyof HTMLElementEventMap>(
    el: EventTarget, type: K, handler: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions,
  ) {
    el.addEventListener(type, handler as EventListener, opts);
    cleanups.push(() => el.removeEventListener(type, handler as EventListener, opts));
  }

  // Canvas pointer events
  on(canvas, "pointerdown", (e) => state.handlePointerDown(e));
  on(canvas, "pointermove", (e) => state.handlePointerMove(e));
  on(canvas, "pointerup", (e) => state.handlePointerUp(e));
  on(canvas, "dblclick", (e) => state.handleDoubleClick(e));
  on(canvas, "wheel", (e) => state.handleWheel(e), { passive: false });

  // Keyboard shortcuts
  on(window as unknown as HTMLElement, "keydown", ((e: KeyboardEvent) => {
    if (state.editingText) {
      if (e.key === "Escape") {
        state.commitText(state.editingText);
        state.editingText = null;
        state.notify("editingText");
      }
      return;
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key) {
      case "1": state.tool = "select"; state.brainstormMode = false; state.notify("tool"); state.notify("brainstormMode"); break;
      case "2": state.tool = "hand"; state.brainstormMode = false; state.notify("tool"); state.notify("brainstormMode"); break;
      case "t": case "T": state.tool = "text"; state.brainstormMode = false; state.notify("tool"); state.notify("brainstormMode"); break;
      case "e": case "E": state.tool = "erase"; state.brainstormMode = false; state.notify("tool"); state.notify("brainstormMode"); break;
      case "a": case "A":
        if (!e.ctrlKey && !e.metaKey) { state.tool = "drag-area"; state.brainstormMode = false; state.notify("tool"); state.notify("brainstormMode"); }
        break;
      case "b": case "B":
        if (!e.ctrlKey && !e.metaKey) {
          state.brainstormMode = !state.brainstormMode;
          if (state.brainstormMode) { state.tool = "text"; state.notify("tool"); }
          state.notify("brainstormMode");
        }
        break;
      case "Delete": case "Backspace": state.deleteSelected(); break;
      case "g": case "G":
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          if (e.shiftKey) state.ungroupSelected();
          else state.groupSelected();
        }
        break;
      case "z": case "Z":
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          if (e.shiftKey) state.redo();
          else state.undo();
        }
        break;
      case "y": case "Y":
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          state.redo();
        }
        break;
    }
  }) as unknown as (e: HTMLElementEventMap["keydown"]) => void);

  // Paste
  on(document as unknown as HTMLElement, "paste", (async (e: ClipboardEvent) => {
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return;
    if (state.editingText) return;
    e.preventDefault();
    const cd = e.clipboardData;
    if (!cd) return;

    for (const item of Array.from(cd.items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const dataUrl = await fileToDataUrl(file);
          const dims = await getImageDimensions(dataUrl);
          state.addImageShape(dataUrl, file.name, dims.width, dims.height);
          return;
        }
      }
    }
    const text = extractTextFromDataTransfer(cd);
    if (text && text.trim()) state.addTextShapeAtCenter(text);
  }) as unknown as (e: HTMLElementEventMap["paste"]) => void);

  // Drag/drop
  on(document as unknown as HTMLElement, "dragover", ((e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }) as unknown as (e: HTMLElementEventMap["dragover"]) => void, { capture: true });

  on(document as unknown as HTMLElement, "drop", (async (e: DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer) return;
    const rect = canvas.getBoundingClientRect();
    const dropPos = screenToCanvas({ x: e.clientX - rect.left, y: e.clientY - rect.top }, state.camera);

    const files = Array.from(e.dataTransfer.files);
    let handledFile = false;
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        const dataUrl = await fileToDataUrl(file);
        const dims = await getImageDimensions(dataUrl);
        state.addImageShape(dataUrl, file.name, dims.width, dims.height, dropPos);
        handledFile = true;
      } else if (isTextFile(file)) {
        const text = await file.text();
        if (text.trim()) state.addTextShapeAtPosition(text, dropPos);
        handledFile = true;
      }
    }
    if (handledFile) return;

    const text = await extractDroppedText(e.dataTransfer);
    if (text && text.trim()) state.addTextShapeAtPosition(text, dropPos);
  }) as unknown as (e: HTMLElementEventMap["drop"]) => void, { capture: true });

  return () => { for (const fn of cleanups) fn(); };
}
