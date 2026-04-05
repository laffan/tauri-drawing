export type Tool = "draw" | "select" | "erase";

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  groupId?: string;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface SelectionBox {
  start: Point;
  end: Point;
}
