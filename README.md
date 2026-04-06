# Notes Canvas

An infinite canvas for visual note-taking, built with vanilla TypeScript and Canvas 2D in a Tauri desktop shell. Zero framework dependencies.

## Features

**Drawing & Text**
- Freehand drawing with smooth curve interpolation
- Text with inline editing, word wrapping, and basic markdown rendering (`# headings`, `**bold**`, `*italic*`)
- Drag-and-drop or paste images directly onto the canvas
- Adjustable stroke width and color palette

**Organization**
- Drag Areas: dashed container regions that group shapes. Draw one around existing shapes or drag shapes into it.
- Grouping: Cmd/Ctrl+G to group, Cmd/Ctrl+Shift+G to ungroup
- Shelf Panel: right-side panel mirroring the canvas hierarchy with search, #tag filtering, and pinning

**Brainstorm Mode**
- Click anywhere to open a persistent text input
- Type and press Enter to place notes in an expanding spiral pattern
- Input stays open for rapid sequential entry

**Canvas**
- Infinite pan (middle-click or Hand tool) and zoom (scroll wheel)
- Select, move, and resize shapes with handles
- Alt/Option+drag to duplicate
- Canvas bookmarks: save and restore named camera positions
- Cross-platform paste and drag-drop (macOS, iOS, Windows, Linux)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| 1 | Select tool |
| 2 | Hand (pan) tool |
| 3 | Draw tool |
| T | Text tool |
| E | Erase tool |
| A | Drag Area tool |
| B | Toggle Brainstorm mode |
| Delete/Backspace | Delete selected |
| Cmd/Ctrl+G | Group selected |
| Cmd/Ctrl+Shift+G | Ungroup |
| Alt/Option+drag | Duplicate selection |

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
