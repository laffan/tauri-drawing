import "./index.css";
import { RatchetCanvas } from "./ratchet-canvas";

const root = document.getElementById("root");
if (root) {
  new RatchetCanvas(root);
}
