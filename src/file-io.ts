/** Save and open .note files (zip containing data.json + images/) */
import JSZip from "jszip";
import type { Shape, ImageShape } from "./types";

export interface NoteFile {
  shapes: Shape[];
}

/**
 * Save shapes as a .note file (zip archive).
 * Images are extracted from dataUrl and stored in an images/ folder.
 * The JSON references images by filename instead of inline dataUrl.
 */
export async function saveNoteFile(shapes: Shape[], filename: string): Promise<void> {
  const zip = new JSZip();
  const imgFolder = zip.folder("images")!;
  let imgIndex = 0;

  // Clone shapes and extract image data
  const exportShapes = shapes.map((s) => {
    if (s.type !== "image") return s;
    const imgShape = s as ImageShape;
    const ext = guessExtension(imgShape.dataUrl);
    const imgFilename = `img_${imgIndex++}${ext}`;
    // Store the binary in the zip
    const base64 = imgShape.dataUrl.split(",")[1];
    if (base64) imgFolder.file(imgFilename, base64, { base64: true });
    // Replace dataUrl with a reference
    return { ...imgShape, dataUrl: `images/${imgFilename}` };
  });

  zip.file("data.json", JSON.stringify({ shapes: exportShapes }, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, filename.endsWith(".note") ? filename : filename + ".note");
}

/**
 * Open a .note file and return the shapes with images restored.
 */
export async function openNoteFile(file: File): Promise<Shape[]> {
  const zip = await JSZip.loadAsync(file);
  const dataFile = zip.file("data.json");
  if (!dataFile) throw new Error("Invalid .note file: missing data.json");

  const json = await dataFile.async("string");
  const noteData: NoteFile = JSON.parse(json);

  // Restore image dataUrls from the zip
  const shapes = await Promise.all(noteData.shapes.map(async (s) => {
    if (s.type !== "image") return s;
    const imgShape = s as ImageShape;
    if (imgShape.dataUrl.startsWith("data:")) return s; // already inline
    const imgFile = zip.file(imgShape.dataUrl);
    if (!imgFile) return s;
    const data = await imgFile.async("base64");
    const ext = imgShape.dataUrl.split(".").pop() || "png";
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : `image/${ext}`;
    return { ...imgShape, dataUrl: `data:${mime};base64,${data}` };
  }));

  return shapes;
}

function guessExtension(dataUrl: string): string {
  if (dataUrl.includes("image/png")) return ".png";
  if (dataUrl.includes("image/jpeg") || dataUrl.includes("image/jpg")) return ".jpg";
  if (dataUrl.includes("image/webp")) return ".webp";
  if (dataUrl.includes("image/gif")) return ".gif";
  if (dataUrl.includes("image/svg")) return ".svg";
  return ".png";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
