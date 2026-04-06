import "./index.css";
import { NotesCanvas } from "./notes-canvas";

const root = document.getElementById("root");
if (root) {
  new NotesCanvas(root);
}
