import test from "node:test";
import assert from "node:assert/strict";
import { hexDistance, hexNeighbors, hexPosition, HEX_RADIUS } from "./hex.ts";
import { defaultLayout, index, editLayout, canStart, runToEnd, result, counts } from "./model.ts";

test("hex neighbors are reciprocal, unique, in bounds and equally spaced in the rendered world", () => {
  for (let i = 0; i < 64; i++) {
    const ns = hexNeighbors(i);
    assert.equal(new Set(ns).size, ns.length);
    if (i % 8 > 0 && i % 8 < 7 && i >= 8 && i < 56) assert.equal(ns.length, 6);
    for (const n of ns) {
      assert.ok(n >= 0 && n < 64);
      assert.ok(hexNeighbors(n).includes(i));
      assert.equal(hexDistance(i, n), 1);
      const a = hexPosition(i), b = hexPosition(n);
      assert.ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - Math.sqrt(3) * HEX_RADIUS) < 1e-8);
    }
  }
  for (const i of [-1, 64, 1.5]) assert.deepEqual(hexNeighbors(i), []);
});

test("sprinkler distance matches shortest paths across odd and even rows", () => {
  for (let start = 0; start < 64; start++) {
    const steps = new Map([[start, 0]]), queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const i = queue[cursor];
      for (const n of hexNeighbors(i)) if (!steps.has(n)) {
        steps.set(n, steps.get(i)! + 1); queue.push(n);
      }
    }
    for (let end = 0; end < 64; end++) assert.equal(hexDistance(start, end), steps.get(end));
  }
});

test("natural rock belt makes local protection effective without permitting construction", () => {
  for (let x = 0; x < 8; x++) assert.ok(editLayout(defaultLayout(), index(x, 3), "break").error);
  for (const [rows, expected] of [[[], 0], [[1, 2], 6], [[4, 5, 6], 6], [[1, 2, 4, 5, 6], 12]] as const) {
    const layout = defaultLayout();
    for (const z of rows) layout[index(1, z)] = "break";
    assert.equal(canStart(layout), true);
    assert.equal(result(runToEnd(layout)).saved, expected);
  }
});

test("two sprinklers preserve homes while using fewer construction sites than a full barrier", () => {
  const layout = defaultLayout();
  layout[index(1, 1)] = "station";
  layout[index(1, 5)] = "station";
  assert.equal(canStart(layout), true);
  assert.equal(counts(layout).spent, 8);
  assert.equal(result(runToEnd(layout)).saved, 12);
});
