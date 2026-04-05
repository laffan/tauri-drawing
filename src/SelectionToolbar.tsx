import { useState } from "react";
import { COLOR_PALETTE, BACKGROUND_COLORS, TEXT_COLORS } from "./types";
import type { Camera, Shape } from "./types";
import { canvasToScreen, getShapeBounds } from "./utils";

interface SelectionToolbarProps {
  shapes: Shape[];
  selectedIds: Set<string>;
  camera: Camera;
  onChangeColor: (color: string) => void;
  onChangeBackground: (color: string) => void;
  onDelete: () => void;
  onAlign: (dir: "left" | "center" | "right" | "top" | "middle" | "bottom") => void;
  onMoveToShelf: () => void;
}

export function SelectionToolbar({
  shapes,
  selectedIds,
  camera,
  onChangeColor,
  onChangeBackground,
  onDelete,
  onAlign,
  onMoveToShelf,
}: SelectionToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);

  if (selectedIds.size === 0) return null;

  // Calculate selection bounds in screen space
  const selected = shapes.filter((s) => selectedIds.has(s.id));
  if (selected.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of selected) {
    const b = getShapeBounds(s);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }

  const topLeft = canvasToScreen({ x: minX, y: minY }, camera);

  const hasText = selected.some((s) => s.type === "text");
  const hasColorable = selected.some(
    (s) => s.type === "text" || s.type === "draw"
  );
  const hasBgable = selected.some(
    (s) => s.type === "text" || s.type === "drag-area"
  );
  const multiSelect = selected.length > 1;

  const barX = topLeft.x;
  const barY = topLeft.y - 44;

  return (
    <div
      style={{
        position: "absolute",
        left: barX,
        top: barY,
        display: "flex",
        gap: 2,
        zIndex: 200,
        pointerEvents: "auto",
      }}
    >
      {multiSelect && (
        <IconBtn icon="📐" title="Align left" onClick={() => onAlign("left")} />
      )}
      {hasText && (
        <IconBtn icon="📋" title="Move to shelf" onClick={onMoveToShelf} />
      )}
      {hasColorable && (
        <div style={{ position: "relative" }}>
          <IconBtn
            icon="🖍️"
            title="Text color"
            active={showColorPicker}
            onClick={() => {
              setShowColorPicker(!showColorPicker);
              setShowBgPicker(false);
            }}
          />
          {showColorPicker && (
            <Palette
              colors={TEXT_COLORS as unknown as string[]}
              onSelect={(c) => {
                onChangeColor(c === "reset" ? "black" : c);
                setShowColorPicker(false);
              }}
            />
          )}
        </div>
      )}
      {hasBgable && (
        <div style={{ position: "relative" }}>
          <IconBtn
            icon="🪣"
            title="Background"
            active={showBgPicker}
            onClick={() => {
              setShowBgPicker(!showBgPicker);
              setShowColorPicker(false);
            }}
          />
          {showBgPicker && (
            <Palette
              colors={BACKGROUND_COLORS as unknown as string[]}
              onSelect={(c) => {
                onChangeBackground(c);
                setShowBgPicker(false);
              }}
            />
          )}
        </div>
      )}
      <IconBtn icon="🗑" title="Delete" onClick={onDelete} />
    </div>
  );
}

function IconBtn({
  icon,
  title,
  onClick,
  active,
}: {
  icon: string;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28,
        height: 28,
        border: "none",
        borderRadius: 6,
        background: active ? "rgba(66,133,244,0.1)" : "transparent",
        cursor: "pointer",
        fontSize: 15,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon}
    </button>
  );
}

function Palette({
  colors,
  onSelect,
}: {
  colors: string[];
  onSelect: (c: string) => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: -36,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: 4,
        padding: "6px 8px",
        background: "#fff",
        borderRadius: 8,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        border: "1px solid #e5e7eb",
        zIndex: 300,
      }}
    >
      {colors.map((c) => {
        if (c === "reset") {
          return (
            <button
              key={c}
              onClick={() => onSelect(c)}
              title="Reset"
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                padding: 0,
                position: "relative",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "50%",
                  left: -1,
                  width: 14,
                  height: 1,
                  background: "red",
                  transform: "rotate(45deg)",
                  transformOrigin: "center",
                }}
              />
            </button>
          );
        }
        return (
          <button
            key={c}
            onClick={() => onSelect(c)}
            title={c}
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: "none",
              background: COLOR_PALETTE[c] || "#ccc",
              cursor: "pointer",
              padding: 0,
            }}
          />
        );
      })}
    </div>
  );
}
