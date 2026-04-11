# iPadOS Sync & Autosave Research

Research notes on adding autosave and folder sync to Notes Canvas on iPadOS
via Tauri v2. Current as of April 2026.

## Goal

Enable the same workflow on iPadOS that exists on macOS:

1. Open a `.note` file (or a folder of them) from iCloud Drive / Dropbox /
   local storage
2. Edits autosave in-place to the original location
3. Cloud providers sync the changes automatically
4. On next launch, the last-opened file or folder is available without
   re-prompting

The save/open dialogs already work on iPad as of the latest Tauri v2 release,
so the question is whether we can build on top of that to get real autosave
rather than one-shot export.

## TL;DR

**Yes, it can work** — but with caveats:

- In-session autosave works out of the box using the existing Tauri plugins,
  provided you use `fileAccessMode: "scoped"` on the `open()` dialog.
- Cross-session persistence (auto-reopen last file on relaunch) needs either
  `tauri-plugin-persisted-scope` (which handles Tauri's scope glob only, not
  iOS native bookmarks) or a custom Swift plugin wrapping
  `URL.bookmarkData(.minimalBookmark)`.
- **Folder-based sync is the more natural pattern on iPad** — one folder pick
  grants recursive access to all files inside, supports creating new files,
  and gets cloud sync for free via iCloud Drive or Dropbox.
- `save()` on iPad uses `.exportToService` mode which is a **one-shot copy**,
  not a persistent writable reference. Autosave must be built on `open()`.

## Architecture Background

### How Tauri accesses files on iOS

Tauri on iPad runs the frontend inside a WKWebView. WKWebView runs its
rendering engine in a separate process that has no filesystem access — it
cannot directly read or write anywhere, sandbox or external.

All file I/O happens via IPC to the native Rust/Swift host process:

```
TypeScript (WKWebView)
    │  writeFile(path, bytes)
    ▼
Tauri IPC bridge
    │
    ▼
tauri-plugin-fs (Rust/Swift)
    │  startAccessingSecurityScopedResource()
    │  std::fs::write(...)
    │  stopAccessingSecurityScopedResource()
    ▼
iOS filesystem
```

This is actually an architectural advantage on iOS: the native host process
can call the proper security-scoped resource APIs that WKWebView cannot.

Source: `plugins-workspace/plugins/fs/src/ios.rs` implements exactly this —
when a `file://` URL is passed to `open()` or `writeFile()`, the plugin calls
`startAccessingSecurityScopedResource()` before opening the file.

### The iOS App Sandbox

iOS apps can freely read and write within their own container:

- `$APPDATA`, `$APPCONFIG`, `$APPLOCALDATA`, `$APPLOG` — app-internal
  directories (note: `$APPCACHE` is the only one confirmed working on
  physical devices; see tauri-apps/tauri#8843)
- Anything else on disk is outside the sandbox and requires a
  security-scoped URL

User-level paths like `$DOCUMENT`, `$DOWNLOAD`, `$HOME` are inherited from
desktop but do not exist in the same form on iOS and will fail.

## Security-Scoped Resources

### What they are

When a user picks a file or folder via `UIDocumentPickerViewController`, iOS
returns a URL with an attached permission token. The app must call
`startAccessingSecurityScopedResource()` before reading or writing, and
`stopAccessingSecurityScopedResource()` when done.

- Access is **temporary** — it lasts while the resource is "started"
- The system limits how many scoped resources an app can have active
- Leaking (forgetting to stop) eventually prevents new access

### Persistence across app restarts

To keep access across launches, the security-scoped URL must be converted
to bookmark data and stored:

```swift
// Save (iOS uses .minimalBookmark; .withSecurityScope is macOS only)
let bookmarkData = try url.bookmarkData(
    options: .minimalBookmark,
    includingResourceValuesForKeys: nil,
    relativeTo: nil
)
UserDefaults.standard.set(bookmarkData, forKey: "lastFolder")

// Restore
var isStale = false
let url = try URL(
    resolvingBookmarkData: bookmarkData,
    bookmarkDataIsStale: &isStale
)
if isStale { /* re-create bookmark */ }
guard url.startAccessingSecurityScopedResource() else { return }
```

**Key distinction from macOS**: iOS uses `.minimalBookmark` — the
`.withSecurityScope` option does not exist on iOS. The security scope is
implicit because the original URL was security-scoped.

### Tauri's current handling

Tauri's fs plugin handles the `start`/`stopAccessingSecurityScopedResource`
lifecycle automatically when you pass a `file://` URL from the dialog to
`readFile()`, `writeFile()`, etc. This works for the duration of the app
session.

**Tauri does not persist bookmarks across app restarts.**
`tauri-plugin-persisted-scope` saves Tauri's internal scope glob patterns to
disk, but it contains no iOS-specific code and does not create native
`URL.bookmarkData()`. Its source code confirms this. Across restarts, the
user would have to re-pick the file or folder, unless a custom Swift plugin
is written.

## The Dialog Plugin on iOS

### `fileAccessMode` option

iOS 14+ only. Controls how picked files are handled:

| Mode | Behavior |
|------|----------|
| `"copy"` (default) | File is copied into the app sandbox. App owns the copy. Original is not affected by writes. **Not useful for autosave to external locations.** |
| `"scoped"` | File stays in place. App gets a `file://` URL with automatic security-scoped access management. **This is what autosave needs.** |

In Swift, `scoped` mode uses `UIDocumentPickerViewController.forOpeningContentTypes`
with `asCopy: false`.

### `open()` vs `save()`

**`open()` with `scoped` mode returns a persistent writable reference** for
the session. You can call `writeFile()` back to that same path repeatedly.

**`save()` on iPad uses `.exportToService` mode, which is a one-shot copy.**
The Swift implementation:

1. Creates an empty temporary file in the app's Documents directory
2. Presents a document picker in export-to-service mode
3. The user picks a destination in the Files app
4. The file is exported (copied) to that destination
5. Returns the destination URL — but subsequent `writeFile()` calls to that
   URL will **not** update the exported file

This means autosave cannot be built on `save()`. The flow for a new file
must be either:

- Save internally first (to `$APPCACHE`), then let the user "Export" as a
  one-shot `save()` call
- Or: have the user first create the file elsewhere, then `open()` it with
  `scoped` mode

### `pickerMode`

iOS has distinct document and media pickers. The `pickerMode` option forces
the right one:

- `"document"` — `UIDocumentPickerViewController`
- `"media"` / `"image"` / `"video"` — `PHPickerViewController`

Without this, the default can guess wrong (e.g., picking the photo picker
when you wanted files). Custom file extensions like `.note` need
`pickerMode: "document"`.

### Known dialog plugin issues

- [plugins-workspace#3030](https://github.com/tauri-apps/plugins-workspace/issues/3030):
  Files with custom extensions (like `.note`) may appear in the picker but
  cannot be selected. Partially fixed by PR #3034 (picker mode support);
  security-scoped resource improvements remain in development.
- [plugins-workspace#1578](https://github.com/tauri-apps/plugins-workspace/issues/1578):
  iOS opened photo picker instead of file picker. Fixed by PR #3034.

## Three-Tier Implementation Strategies

### Tier 1: Internal autosave

**Concept**: Always autosave to the app sandbox. Restore on crash/relaunch.

- Target: `$APPCACHE/autosave.note`
- No security scope issues — fully inside the sandbox
- Works across restarts
- No external sync — data never leaves the app

**Effort**: Low, all frontend. Track dirty state, debounced write on
changes.

**Use as**: Crash recovery layer underneath other tiers.

### Tier 2: Session-scoped external autosave

**Concept**: User opens a file with `scoped` access, autosave writes back
during the session.

```typescript
const path = await open({
  filters: [{ name: "Note", extensions: ["note"] }],
  fileAccessMode: "scoped",
  pickerMode: "document",
});
// path is a file:// URL on iOS
// Store in state, write back on changes
await writeFile(path, serializedBytes);
```

- Works on both macOS and iPad
- Lost on app restart — user re-picks file on next launch
- Current `file-io.ts` would need: `fileAccessMode: "scoped"`, track current
  path in `DrawingState`, add debounced autosave listener

**Effort**: Low-medium, mostly frontend.

### Tier 3: Cross-session persistence via native bookmark

**Concept**: Custom Swift Tauri plugin wrapping `URL.bookmarkData()` so the
app can auto-reopen the last file/folder on relaunch.

- iPad-specific (macOS doesn't need it — paths persist directly)
- Medium effort: requires custom Swift plugin in
  `src-tauri/gen/apple/` or a proper plugin crate
- Bookmarks can go stale; fall back to re-prompting
- Apple's recommendation when the user "opens" a document from the picker

**Effort**: Medium. Not necessary for Tier 1+2 to be useful, but it's the
difference between "re-pick file every launch" and "pick up where you left
off".

## Folder-Based Sync Pattern (Recommended)

This is the approach that fits best on iPad and is arguably better than
per-file access.

### How it works

When a user picks a **directory** via the dialog plugin, iOS grants
security-scoped access to the **entire directory tree** — all files and
subdirectories, recursively. This is how code editors, file managers, and
"project folder" apps work on iPad.

```typescript
const folderPath = await open({
  directory: true,
  fileAccessMode: "scoped",
});
```

### What you get within a scoped folder

| Operation | Tauri API | Works? |
|-----------|-----------|--------|
| List files | `readDir(folderPath)` | Yes |
| Read file | `readFile(folderPath + "/a.note")` | Yes |
| Write existing | `writeFile(folderPath + "/a.note", bytes)` | Yes |
| Create new file | `writeFile(folderPath + "/new.note", bytes)` | Yes |
| Create subdirectory | `mkdir(folderPath + "/archive")` | Yes |
| Nested items | Any depth | Yes |

### Why it's the right pattern for iPad

- One picker interaction grants access to everything in the tree
- One bookmark persists access to the whole tree (more powerful than
  per-file bookmarks)
- New files can be created without additional pickers
- Cloud sync is transparent — if the folder lives in iCloud Drive or
  Dropbox, those providers handle sync
- Maps cleanly to macOS where you'd just work with a regular folder

### Example workspace layout

```
~/iCloud Drive/Notes Canvas/        ← user picks this once
  ├── project-a.note
  ├── project-b.note
  └── archive/
      └── old-sketch.note
```

The app:

1. User sets the working folder once via "Set Working Folder"
2. App lists `.note` files inside (recursively or top-level)
3. User picks one to open; edits autosave in-place
4. User creates new documents without any additional picker
5. iCloud Drive / Dropbox syncs changes to other devices automatically

### Additional permissions needed

The current capabilities (`fs:allow-read-file`, `fs:allow-write-file`) are
not enough for folder operations. Would need to add:

- `fs:allow-read-dir` — to list directory contents
- `fs:allow-mkdir` — to create subdirectories
- `fs:allow-create` — for new file creation (may already be covered by
  write-file)

## Gaps and Limitations

### Known gaps

1. **No native bookmark persistence in Tauri.**
   `tauri-plugin-persisted-scope` does not create iOS bookmarks. Requires
   custom Swift plugin for true cross-session persistence.

2. **`save()` is one-shot.** Not usable for autosave. New files need a
   different flow.

3. **Custom `.note` extension may have picker issues.**
   [plugins-workspace#3030](https://github.com/tauri-apps/plugins-workspace/issues/3030).
   Partial fix via `pickerMode`; may need to add UTTypes declaration in
   Info.plist for best results.

4. **Only `$APPCACHE` confirmed working on physical iOS devices** for the
   app-internal directory (tauri-apps/tauri#8843). Other `$APP*` paths may
   work but have had reports of issues on device vs. simulator.

5. **File coordination** (`NSFileCoordinator`) is technically required by
   Apple when writing to external files (iCloud Drive, Dropbox). Tauri's
   fs plugin does not appear to use it. This may cause data loss if another
   process writes to the same file simultaneously — likely fine for
   single-user single-device scenarios, risky for concurrent editing.

6. **Tauri multi-window on iOS** (from the separate multi-window research):
   PR [tauri-apps/tauri#14484](https://github.com/tauri-apps/tauri/pull/14484)
   merged March 2026 but not yet released. Concurrent-write conflicts
   between two iPad windows editing the same file would need handling once
   multi-window lands.

### What would fail

- Opening a file with `fileAccessMode: "copy"` (or omitted) and expecting
  `writeFile()` to update the original — it only updates the sandbox copy.
- Calling `save()`, then trying to autosave back to the returned path —
  the returned path points to a one-shot export, not a live reference.
- Assuming `tauri-plugin-persisted-scope` preserves iPad access on restart
  — it does not persist the native iOS bookmark.
- Writing to `$DOCUMENT` or `$HOME` on iOS — these don't resolve the way
  they do on desktop.

## Recommended Architecture

A hybrid approach combining Tiers 1, 2, and optionally 3, plus folder-based
sync:

### Phase 1: Session autosave with folder sync

1. Add a "Set Working Folder" button to the file panel
2. User picks a folder via `open({ directory: true, fileAccessMode: "scoped" })`
3. Store the folder URL in `DrawingState.workingFolder`
4. Show a list of `.note` files in the folder (needs new UI — small file
   browser panel or integrate with existing shelf)
5. When user opens a file from the list, track the full path in
   `DrawingState.currentFilePath`
6. Add a debounced autosave listener on shape changes: if
   `currentFilePath` is set, write directly via `writeFile()` — no dialog
7. Add `tauri-plugin-persisted-scope` to save the folder path glob so
   Tauri's internal scope survives restart (even though iOS bookmarks
   don't without custom native code)
8. Add internal autosave to `$APPCACHE/crash-recovery.note` as a safety
   net on top of everything

### Phase 2: Cross-session persistence (iPad only)

1. Write a custom Swift Tauri plugin that exposes two commands:
   - `save_bookmark(path)` — wraps `URL.bookmarkData(.minimalBookmark)`,
     stores in UserDefaults
   - `resolve_bookmark(key)` — wraps `URL(resolvingBookmarkData:)`, returns
     a path the fs plugin can use
2. On app start, try to resolve the bookmark for the last working folder
3. If it resolves, restore the folder automatically
4. If stale, fall back to re-prompting

### Phase 3: Multi-window awareness (after Tauri mobile multi-window ships)

1. Listen for external file changes via the fs plugin's watch API (if it
   works on iOS) or poll file modification times
2. If a file is modified while open in another window, show a refresh
   prompt or handle gracefully
3. Consider write-locking or debouncing to avoid thrashing between windows

### Files that would change

- `src/file-io.ts` — add `fileAccessMode: "scoped"`, folder open, readDir
- `src/state.ts` — add `workingFolder`, `currentFilePath`, `isDirty`
- `src/ui/file-panel.ts` — add "Set Working Folder" button
- `src/ui/file-browser.ts` — new file listing the folder contents
- `src/autosave.ts` — new debounced autosave manager
- `src-tauri/capabilities/default.json` — add `fs:allow-read-dir`,
  `fs:allow-mkdir`, possibly `fs:allow-create`
- `src-tauri/Cargo.toml` — add `tauri-plugin-persisted-scope`
- `src-tauri/src/lib.rs` — register persisted-scope plugin **after** fs
- (Phase 2) `src-tauri/gen/apple/Sources/...` — custom Swift bookmark plugin

## References

### Tauri

- [Tauri v2 File System plugin](https://v2.tauri.app/plugin/file-system/)
- [Tauri v2 Dialog plugin](https://v2.tauri.app/plugin/dialog/)
- [Tauri v2 Persisted Scope plugin](https://v2.tauri.app/plugin/persisted-scope/)
- [Plugin source: plugins-workspace/plugins/fs/src/ios.rs](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/fs)
- [Plugin source: plugins-workspace/plugins/dialog/guest-js/index.ts](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/dialog/guest-js/index.ts)

### GitHub issues

- [tauri-apps/tauri#8843](https://github.com/tauri-apps/tauri/issues/8843) —
  FS access on physical iOS devices; only `$APPCACHE` confirmed
- [plugins-workspace#3030](https://github.com/tauri-apps/plugins-workspace/issues/3030) —
  iOS file picker custom extensions + security-scoped resource issues
- [plugins-workspace#1578](https://github.com/tauri-apps/plugins-workspace/issues/1578) —
  iOS opened photo picker instead of file picker (fixed in PR #3034)
- [plugins-workspace#1494](https://github.com/tauri-apps/plugins-workspace/issues/1494) —
  iOS save dialog implementation
- [tauri-apps/tauri#3716](https://github.com/tauri-apps/tauri/issues/3716) —
  macOS MAS security-scoped resource handling (related)
- [tauri-apps/tauri#12587](https://github.com/tauri-apps/tauri/issues/12587) —
  Dialog plugin not returning expected path on iOS
- [tauri-apps/tauri#14484](https://github.com/tauri-apps/tauri/pull/14484) —
  Mobile multi-window support (merged, not yet released)

### Apple documentation

- [UIDocumentPickerViewController](https://developer.apple.com/documentation/uikit/uidocumentpickerviewcontroller)
- [Providing access to directories](https://developer.apple.com/documentation/uikit/providing-access-to-directories)
- [NSURL.BookmarkCreationOptions](https://developer.apple.com/documentation/foundation/nsurl/bookmarkcreationoptions)
- [startAccessingSecurityScopedResource](https://developer.apple.com/documentation/foundation/nsurl/startaccessingsecurityscopedresource())
- [NSFileCoordinator](https://developer.apple.com/documentation/foundation/nsfilecoordinator)
- [The Role of File Coordinators and Presenters](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileCoordinators/FileCoordinators.html)
- [UIDocument](https://developer.apple.com/documentation/uikit/uidocument)
- [WWDC19 Session 719: What's New in File Management and Quick Look](https://developer.apple.com/videos/play/wwdc2019/719/)
