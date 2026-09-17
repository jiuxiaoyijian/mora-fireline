import test from "node:test";
import assert from "node:assert/strict";
import { PointerGesture, sampleSegment } from "./gesture.ts";

test("paint visits each picked cell once per gesture, including after backtracking", () => {
  const gesture = new PointerGesture(1, "paint", { x: 0, y: 0 });
  assert.deepEqual([9, 17, 9, -1, 17, 25].filter(i => gesture.visit(i)), [9, 17, 25]);
  assert.equal(new PointerGesture(1, "paint", { x: 0, y: 0 }).visit(9), true);
});

test("small successive moves accumulate against the original 5px threshold", () => {
  const gesture = new PointerGesture(1, "paint", { x: 0, y: 0 });
  for (let x = 1; x <= 5; x++) assert.deepEqual(gesture.move(1, { x, y: 0 }).points, []);
  assert.deepEqual(gesture.move(1, { x: 6, y: 0 }).points, [{ x: 0, y: 0 }, { x: 6, y: 0 }]);
  assert.deepEqual(gesture.move(1, { x: 7, y: 0 }).points.at(-1), { x: 7, y: 0 });
});

test("other pointer moves and releases do not change the active gesture", () => {
  const gesture = new PointerGesture(1, "paint", { x: 0, y: 0 });
  assert.deepEqual(gesture.move(2, { x: 100, y: 100 }), { points: [], dx: 0, dy: 0 });
  assert.deepEqual(gesture.end(2, { x: 100, y: 100 }), []);
  assert.deepEqual(gesture.end(1, { x: 2, y: 0 }), [{ x: 2, y: 0 }]);
});

test("release samples the final paint segment even without a matching move event", () => {
  const gesture = new PointerGesture(1, "paint", { x: 0, y: 0 });
  gesture.move(1, { x: 16, y: 0 });
  assert.deepEqual(gesture.end(1, { x: 40, y: 0 }), [16, 24, 32, 40].map(x => ({ x, y: 0 })));
  const fast = new PointerGesture(1, "paint", { x: 0, y: 0 });
  assert.deepEqual(fast.end(1, { x: 24, y: 0 }), [0, 8, 16, 24].map(x => ({ x, y: 0 })));
});

test("orbit produces camera deltas without paint or release selections", () => {
  const gesture = new PointerGesture(1, "orbit", { x: 10, y: 10 });
  assert.deepEqual(gesture.move(1, { x: 12, y: 10 }), { points: [], dx: 0, dy: 0 });
  assert.deepEqual(gesture.move(1, { x: 20, y: 13 }), { points: [], dx: 10, dy: 3 });
  assert.deepEqual(gesture.move(1, { x: 18, y: 12 }), { points: [], dx: -2, dy: -1 });
  assert.deepEqual(gesture.end(1, { x: 18, y: 12 }), []);
  assert.deepEqual(new PointerGesture(1, "orbit", { x: 0, y: 0 }).end(1, { x: 0, y: 0 }), []);
});

test("tap tolerates 5px jitter but a larger drag cannot become a click again", () => {
  const tap = new PointerGesture(1, "tap", { x: 0, y: 0 });
  assert.deepEqual(tap.move(1, { x: 3, y: 4 }).points, []);
  assert.deepEqual(tap.end(1, { x: 3, y: 4 }), [{ x: 3, y: 4 }]);
  const dragged = new PointerGesture(1, "tap", { x: 0, y: 0 });
  assert.deepEqual(dragged.move(1, { x: 20, y: 0 }).points, []);
  assert.deepEqual(dragged.end(1, { x: 0, y: 0 }), []);
  assert.deepEqual(new PointerGesture(1, "tap", { x: 0, y: 0 }).end(1, { x: 20, y: 0 }), []);
});

test("sampling includes both endpoints and has no gap longer than 8 CSS pixels", () => {
  for (const end of [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 17, y: 0 }, { x: -31, y: 43 }]) {
    const origin = { x: 0, y: 0 };
    const points = sampleSegment(origin, end);
    assert.deepEqual(points[0], origin);
    assert.deepEqual(points.at(-1), end);
    for (let i = 1; i < points.length; i++) {
      assert.ok(Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) <= 8 + 1e-9);
    }
  }
});

test("painting follows each recorded turn rather than a shortcut from the origin", () => {
  const gesture = new PointerGesture(1, "paint", { x: 0, y: 0 });
  assert.ok(gesture.move(1, { x: 16, y: 0 }).points.every(p => p.y === 0));
  const turned = gesture.end(1, { x: 16, y: 16 });
  assert.ok(turned.every(p => p.x === 16));
  assert.deepEqual(turned.at(-1), { x: 16, y: 16 });
});
