# Notes Canvas

An infinite canvas for visual note-taking, built with vanilla TypeScript and Canvas 2D in a Tauri desktop shell. Zero framework dependencies.

## Features

**Text**
- Double-click anywhere to create new text; click outside or press Escape to confirm
- Inline editing with word wrapping at a default 350px width
- Markdown rendering: `# headings`, `**bold**`, `*italic*`, `[links](url)`
- Headings render in the theme's accent color; links are underlined and Cmd+click opens them
- Text and background color pickers, font size slider in the selection toolbar
- Auto-fit bounding box shrinks to content width; manual resize is preserved
- 10 bundled fonts: Inter (default), Source Sans Pro, Source Serif Pro, Libre Franklin, Libre Baskerville, Karla, Lora, Helvetica, EB Garamond, Fira Code

**Images**
- Drag-and-drop images (png, jpg, webp) and text files (txt, md) onto the canvas
- Paste images from clipboard
- Aspect-ratio-locked resizing
- Non-destructive crop: ✂️ button enters crop mode with red handles, drag to pan the crop window, click outside to confirm
- Auto-selected immediately after drop

**Organization**
- Drag Areas (🧺): dashed container regions that group shapes
- Grouping: Cmd/Ctrl+G to group, Cmd/Ctrl+Shift+G to ungroup
- Alignment & distribution: top/bottom/left/right align + horizontal/vertical distribute
- Shelf Panel: right-side panel with search, #tag filtering, pinning, and drag-to-restore

**Brainstorm Mode**
- Click anywhere to open a persistent text input
- Type and press Enter to place notes in an expanding spiral pattern
- Input stays open for rapid sequential entry

**Canvas**
- Infinite pan (hold Space or middle-click) and zoom (scroll wheel)
- Background patterns: grid, dot grid, or blank with spacing and opacity controls
- 16 themes from thememirror.net (8 light, 8 dark) with light/dark/auto appearance
- Undo/redo (Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z) with 100-entry snapshot history
- Canvas bookmarks: save and restore named camera positions

**File I/O**
- Save/open `.note` files (zip archives containing JSON + images folder)
- Native macOS save/open dialogs via Tauri plugins
- Cmd+click links open in browser via `tauri-plugin-opener` (supports https, mailto, tel, obsidian://, zotero://)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| 1 | Select tool |
| T | Text tool (default) |
| A | Drag Area tool |
| B | Toggle Brainstorm mode |
| Space (hold) | Pan canvas |
| Delete/Backspace | Delete selected |
| Cmd/Ctrl+Z | Undo |
| Cmd/Ctrl+Shift+Z | Redo |
| Cmd/Ctrl+G | Group selected |
| Cmd/Ctrl+Shift+G | Ungroup |
| Alt/Option+drag | Duplicate selection |
| Double-click | New text |
| Cmd/Ctrl+click | Open link |

## Getting Started

```bash
npm install
```

**Web development:**
```bash
npm run dev
# Visit http://localhost:5173
```

**Desktop app (Tauri):**
```bash
npm run tauri:dev      # Dev with hot reload
npm run tauri:build    # Production build
```

**Mobile (requires macOS with Xcode / Android Studio):**
```bash
npm run tauri:ios-init && npm run tauri:ios-dev
npm run tauri:android-init && npm run tauri:android-dev
```

## Integration

Notes Canvas is designed to be embedded in other applications:

```typescript
import { NotesCanvas } from "./notes-canvas";

const canvas = new NotesCanvas(document.getElementById("mount")!);

// Load/save shapes
canvas.loadShapes(savedShapes);
const shapes = canvas.getShapes();

// Listen for changes
canvas.on("change", () => persist(canvas.getShapes()));

// Cleanup
canvas.destroy();
```
