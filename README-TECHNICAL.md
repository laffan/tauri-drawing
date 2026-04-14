# Technical Guide

Development patterns and conventions for Notes Canvas.

## Architecture

The app is vanilla TypeScript with zero framework dependencies. Rendering uses the Canvas 2D API. UI chrome (toolbars, panels) is built with imperative DOM creation. State management uses a single class with EventTarget-based change notification.

```
src/
  main.ts                 Entry point — mounts NotesCanvas
  notes-canvas.ts         Public API class — orchestrates everything
  state.ts                DrawingState class — all app state + mutations
  state-helpers.ts        Pure helper functions (find, resize, crop, link hit-test, autoFitWidth, pinned hit-test)
  renderer.ts             Canvas 2D draw functions (pure, no side effects)
  input-handler.ts        Wires native DOM events to state methods
  external-content.ts     Clipboard/drag-drop/file helpers
  file-io.ts              Save/open .note files (JSZip + Tauri fs/dialog)
  markdown.ts             Markdown parser: headings, bold, italic, links
  themes.ts               16 color themes + appearance mode (light/dark/auto)
  types.ts                Shape types, constants, color palettes
  undo-manager.ts         Snapshot-based undo/redo (100 entries)
  utils.ts                Geometry, hit testing, text measurement, alignment, pinned layout
  ui/
    dom-helpers.ts         h() element builder, setStyles(), clearChildren()
    toolbar.ts             Bottom floating tool bar
    selection-toolbar.ts   Context toolbar above selected shapes (color, bg, size, align, crop, pin)
    bookmarks-panel.ts     Camera bookmark dropdown
    file-panel.ts          Save/open buttons (native dialogs)
    settings-panel.ts      Settings modal (appearance, theme, font, background, shortcuts)
    shelf-panel.ts         Right-side hierarchical shape browser (themed)
    text-editor.ts         Inline textarea overlay for text editing
    brainstorm-input.ts    Persistent input for brainstorm mode
    status-bar.ts          Zoom/shape count display
```

### Tauri plugins

| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-dialog` | Native save/open file dialogs |
| `tauri-plugin-fs` | Read/write .note files to disk |
| `tauri-plugin-opener` | Open URLs in browser / inter-app links (obsidian://, etc.) |
| `tauri-plugin-log` | Debug logging (dev only) |

### Key dependencies

| Package | Purpose |
|---------|---------|
| `jszip` | Create/read .note zip archives |
| Bundled woff2 fonts | 9 Google Fonts in `public/fonts/` for offline use |

## Rules

### No file larger than 700 lines

Every source file (`.ts`, `.rs`, `.css`) must stay under 700 lines. If a file grows beyond this, split it into focused sub-modules (e.g. `state-helpers.ts` was split from `state.ts`). This keeps files navigable, reduces merge conflicts, and forces clean separation of concerns.

### No framework dependencies

The codebase deliberately has zero runtime framework dependencies (no React, Vue, etc.). This makes it embeddable in any host application. Do not introduce framework dependencies. Use the existing patterns:

- **State**: Add properties to `DrawingState` in `state.ts`, call `this.notify("key")` after mutation
- **UI**: Create a `createXxx(state): HTMLElement` function in `src/ui/`, subscribe to state changes with `state.addEventListener("change", update)`
- **Rendering**: Add draw functions to `renderer.ts` as pure functions taking a `CanvasRenderingContext2D`

### Keep rendering pure

All functions in `renderer.ts` are pure — they take a canvas context and data, draw, and return. They must not read from or write to any global state, DOM elements, or class instances. This makes them testable and ensures the render loop is a simple data-in-pixels-out pipeline.

### State mutations go through DrawingState

Never mutate shapes, selection, camera, or tool state from UI components or input handlers. Always go through `DrawingState` methods or property assignment + `notify()`. This ensures change events fire consistently and the UI stays in sync.

### Batched notifications

`DrawingState.notify()` uses `queueMicrotask` to batch multiple notifications within the same synchronous call stack into a single `"change"` event. This means you can safely call `notify("shapes")` and `notify("selectedIds")` in the same method without triggering redundant UI rebuilds.

### Undo/redo

`UndoManager` in `undo-manager.ts` stores up to 100 shape snapshots. Call `state.recordHistory()` after each completed user action (not during continuous interactions like dragging). For drag/resize, record once on pointer-up.

### Pinning

Pinning attaches shapes to the left edge of the viewport, independent of camera pan/zoom. The shape's canvas position never changes — pinning only affects how and where it is rendered.

- `ShapeBase.pinned` marks a shape as pinned. `ShapeBase.pinnedExpanded` controls the thumbnail toggle for pinned images.
- `computePinnedLayout()` in `utils.ts` groups pinned shapes (by `groupId`, including drag-area children), computes screen-space positions stacked vertically on the left side, and returns a `PinnedLayout` with offsets, scale factors, screen bounds, and the full set of pinned shape IDs.
- The renderer draws pinned shapes twice: once at 20% opacity at their original canvas position (inside camera transform), then at full opacity at their screen-space position (outside camera transform) on a card background.
- Hit testing in `state.ts` checks pinned screen bounds first (via `findPinnedShapeAtScreen` in `state-helpers.ts`), then falls back to normal canvas hit testing with pinned shapes filtered out.
- Pinned images render as thumbnails (max 120px) by default. Clicking a pinned image toggles `pinnedExpanded`, switching between thumbnail and full-size.

### Safe area handling

The canvas extends full-bleed (`viewport-fit=cover`). Individual UI elements apply `env(safe-area-inset-*)` via inline styles rather than using root-level padding, so the canvas renders behind notches/status bars while buttons stay accessible.

### Settings modal mounting

The settings overlay is mounted directly on the root container (not inside the top bar) to avoid iOS WebKit's broken `position: fixed` inside parents with CSS `transform`. The `createSettingsPanel` function accepts an optional `mountOverlayOn` element for this purpose.

## Patterns

### Adding a new shape type

1. Add the interface to `types.ts` extending `ShapeBase`, add it to the `Shape` union
2. Add bounds calculation to `getShapeBounds()` in `utils.ts`
3. Add hit testing to `hitTestShape()` in `utils.ts`
4. Add a draw function in `renderer.ts`, call it from the main `render()` loop
5. Add creation logic in `state.ts` (tool handler or method)
6. Add resize handling in `applyResize()` in `state-helpers.ts` if applicable

### Adding a new tool

1. Add the tool name to the `Tool` union in `types.ts`
2. Add pointer handling in `DrawingState.handlePointerDown/Move/Up` in `state.ts`
3. Add the tool button in `ui/toolbar.ts` (in the `TOOLS` array)
4. Add the keyboard shortcut in `input-handler.ts`
5. Add a cursor style in the `cursorMap` in `notes-canvas.ts`

### Adding a UI panel

1. Create `src/ui/my-panel.ts` exporting `createMyPanel(state: DrawingState): HTMLElement`
2. Inside, build DOM with `h()` from `dom-helpers.ts`
3. Subscribe to state changes: `state.addEventListener("change", rebuild)`
4. Use closure variables for local UI state (open/closed, search term, etc.)
5. Mount it in `notes-canvas.ts` constructor: `container.appendChild(createMyPanel(this.state))`

### Adding a theme

Add an entry to `THEMES` in `themes.ts` using the `light()` or `dark()` helper:

```typescript
"my-theme": light("My Theme", "#bg", "#fg", "#headingColor", "#selection", "#accent"),
```

Each theme provides: `canvasBackground`, `foreground`, `headingColor`, `selection`, `accent`, `gridColor`, `uiBackground`, `uiBorder`.

### DOM building with h()

Use the `h()` helper instead of raw `document.createElement`:

```typescript
import { h } from "./dom-helpers";

const btn = h("button", {
  text: "Click me",
  title: "Does a thing",
  style: { padding: "8px", borderRadius: "4px" },
  onClick: () => doThing(),
});

const row = h("div", {
  style: { display: "flex", gap: "4px" },
  children: [label, input, btn],
});
```

### Text measurement

Always use `measureTextWidth()` from `utils.ts` (which uses an offscreen canvas) instead of character-count estimates. Pass the current `fontFamily` for accurate measurement:

```typescript
import { measureTextWidth } from "./utils";
const width = measureTextWidth("Hello world", 18, "Inter"); // accurate pixel width
```

### Opening external URLs

Use the `openExternalUrl()` helper from `state-helpers.ts`. It tries `@tauri-apps/plugin-opener` first (desktop), falling back to `window.open()` (web):

```typescript
import { openExternalUrl } from "./state-helpers";
await openExternalUrl("https://example.com");
await openExternalUrl("obsidian://open?vault=MyVault"); // inter-app links
```

## Tauri configuration

- **`dragDropEnabled: false`** in `tauri.conf.json` — disables Tauri's native drag handler so HTML5 drag events work
- **Capabilities** in `src-tauri/capabilities/default.json` — permissions for fs, dialog, opener plugins
- **CSP** allows `data:` and `blob:` URIs for inline images

## Build & Dev

```bash
npm run dev            # Vite dev server on :5173
npm run build          # TypeScript check + Vite production build
npm run tauri:dev      # Desktop app with hot reload
npm run tauri:build    # Production desktop bundles (.deb, .rpm, .AppImage, .dmg)
```

The Tauri config (`src-tauri/tauri.conf.json`) runs `npm run dev` as the `beforeDevCommand` and `npm run build` as the `beforeBuildCommand`, so `tauri:dev` and `tauri:build` handle both frontend and native compilation.

## Type checking

```bash
npx tsc -b
```

Run this before committing. The project uses `verbatimModuleSyntax` and `strict` mode. Use `import type` for type-only imports.

## Project conventions

- **TypeScript only** — no `.js` files in `src/`
- **No default exports** — use named exports for everything except `main.ts`
- **Inline styles** — UI components use `Object.assign(el.style, {...})` rather than CSS classes, keeping style co-located with the component that owns it. Global styles go in `index.css`.
- **No unused code** — if something is removed, delete it completely. No commented-out blocks, no `_unused` prefixed variables, no backward-compatibility shims.
