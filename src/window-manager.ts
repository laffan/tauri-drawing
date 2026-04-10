/** Multi-window management — desktop only (WebviewWindow API is not available on mobile) */

let windowCounter = 0;

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

/** Returns true on desktop Tauri (macOS/Windows/Linux), false on mobile or web. */
export function supportsMultiWindow(): boolean {
  if (!isTauri()) return false;
  // WebviewWindow API is unavailable on iOS/Android — check for mobile user agents
  const ua = navigator.userAgent.toLowerCase();
  return !(
    /iphone|ipad|ipod|android/.test(ua) ||
    ("ontouchstart" in window && /mobile|tablet/.test(ua))
  );
}

/** Open a new independent canvas window. Returns the label of the created window. */
export async function openNewWindow(): Promise<string | null> {
  if (!supportsMultiWindow()) return null;

  // Dynamic import so the module is never loaded on web/mobile builds
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

  windowCounter++;
  const label = `canvas-${Date.now()}-${windowCounter}`;

  const webview = new WebviewWindow(label, {
    url: "/",
    title: "Notes Canvas",
    width: 1200,
    height: 800,
    center: true,
    resizable: true,
    dragDropEnabled: false,
  });

  return new Promise((resolve) => {
    webview.once("tauri://created", () => resolve(label));
    webview.once("tauri://error", (e) => {
      console.error("Failed to create window:", e);
      resolve(null);
    });
  });
}
