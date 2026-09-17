export type Point = { x: number; y: number };
export type GestureMode = "tap" | "paint" | "orbit";

/** Sample the actual pointer path rather than drawing a shortcut across the hex map. */
export function sampleSegment(from: Point, to: Point): Point[] {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 8));
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: from.x + (to.x - from.x) * i / steps,
    y: from.y + (to.y - from.y) * i / steps,
  }));
}

export class PointerGesture {
  readonly pointerId: number;
  readonly mode: GestureMode;
  private origin: Point;
  private previous: Point;
  private moved = false;
  private visited = new Set<number>();

  constructor(pointerId: number, mode: GestureMode, point: Point) {
    this.pointerId = pointerId;
    this.mode = mode;
    this.origin = point;
    this.previous = point;
  }

  move(pointerId: number, point: Point): { points: Point[]; dx: number; dy: number } {
    if (pointerId !== this.pointerId) return { points: [], dx: 0, dy: 0 };
    const dx = point.x - this.previous.x, dy = point.y - this.previous.y;
    if (!this.moved && Math.hypot(point.x - this.origin.x, point.y - this.origin.y) <= 5)
      return { points: [], dx: 0, dy: 0 };
    this.moved = true;
    const points = this.mode === "paint" ? sampleSegment(this.previous, point) : [];
    this.previous = point;
    return { points, dx: this.mode === "orbit" ? dx : 0, dy: this.mode === "orbit" ? dy : 0 };
  }

  end(pointerId: number, point: Point): Point[] {
    if (pointerId !== this.pointerId) return [];
    const { points } = this.move(pointerId, point);
    return this.mode === "orbit" ? [] : this.moved ? points : [point];
  }

  visit(index: number): boolean {
    if (index < 0 || this.visited.has(index)) return false;
    this.visited.add(index);
    return true;
  }
}
