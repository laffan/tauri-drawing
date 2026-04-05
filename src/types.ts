export type Tool = "draw" | "select" | "erase" | "text";

export const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
export const LINE_HEIGHT_RATIO = 1.3;

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ShapeBase {
  id: string;
  color: string;
  groupId?: string;
}

export interface DrawShape extends ShapeBase {
  type: "draw";
  points: Point[];
  width: number;
}

export interface TextShape extends ShapeBase {
  type: "text";
  position: Point;
  text: string;
  fontSize: number;
}

export type Shape = DrawShape | TextShape;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface SelectionBox {
  start: Point;
  end: Point;
}
