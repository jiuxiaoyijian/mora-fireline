import test from "node:test";
import assert from "node:assert/strict";
import {
  RULES,
  blankLayout,
  defaultLayout,
  index,
  counts,
  editLayout,
  validateLayout,
  canStart,
  createSimulation,
  step,
  runToEnd,
  result,
  neighbors,
} from "./model.ts";

test("cooling feedback reports actual allocation, never mere coverage", () => {
  const layout = defaultLayout();
  layout[index(1, 2)] = "station";
  const sim = createSimulation(layout);
  assert.ok(sim.cells.every((c) => c.cooling === 0));
  step(sim);
  assert.ok(sim.cells.some((c) => c.cooling > 0));
  assert.ok(
    Math.abs(
      sim.cells.reduce((sum, c) => sum + c.cooling, 0) - RULES.stationCapacity,
    ) < 1e-8,
  );
  assert.equal(sim.cells[index(1, 2)].cooling, 0);
  assert.equal(
    sim.cells[index(3, 2)].cooling,
    0,
    "a covered but unheated house must not display active protection",
  );
});

test("default scenario contains 12 houses and no defenses; the unprotected settlement is lost", () => {
  const layout = defaultLayout();
  assert.deepEqual(counts(layout), { homes: 12, spent: 0 });
  assert.equal(canStart(layout), true);
  assert.deepEqual(result(runToEnd(layout)), {
    saved: 0,
    destroyed: 12,
    burning: 0,
    success: false,
  });
});
test("a continuous western firebreak protects all 12 houses within budget", () => {
  const layout = defaultLayout();
  for (const z of [1, 2, 4, 5, 6]) layout[index(1, z)] = "break";
  assert.equal(canStart(layout), true);
  assert.equal(counts(layout).spent, 5);
  const sim = runToEnd(layout);
  assert.equal(result(sim).saved, 12);
  assert.equal(
    sim.events.some((e) => e.type === "ignite" && layout[e.target] === "house"),
    false,
  );
});
test("a separate station strategy also protects all houses", () => {
  const layout = defaultLayout();
  for (const [x, z] of [
    [1, 2],
    [1, 5],
    [2, 4],
  ])
    layout[index(x, z)] = "station";
  assert.equal(counts(layout).spent, 12);
  assert.equal(canStart(layout), true);
  assert.equal(result(runToEnd(layout)).saved, 12);
});
test("blocking only the two initial entries fails because fire spreads along western brush", () => {
  const layout = defaultLayout();
  layout[index(1, 2)] = "break";
  layout[index(1, 5)] = "break";
  assert.equal(result(runToEnd(layout)).saved, 0);
});
test("same layout reproduces the entire event history and result", () => {
  assert.deepEqual(runToEnd(defaultLayout()), runToEnd(defaultLayout()));
});
test("fixed steps grouped into different render-sized batches produce identical results", () => {
  const a = createSimulation(defaultLayout()),
    b = createSimulation(defaultLayout());
  for (let i = 0; i < RULES.steps; i++) step(a);
  for (let i = 0; i < 150; i++) for (let j = 0; j < 3; j++) step(b);
  assert.deepEqual(a, b);
});
test("starting a fresh run restores every cell without changing the original layout", () => {
  const layout = defaultLayout();
  const before = layout.slice();
  const first = createSimulation(layout);
  runToEnd(layout);
  assert.deepEqual(createSimulation(layout), first);
  assert.deepEqual(layout, before);
});
test("completed simulations cannot advance again", () => {
  const sim = runToEnd(defaultLayout());
  const snapshot = structuredClone(sim);
  step(sim);
  assert.deepEqual(sim, snapshot);
});
test("home inventory prevents adding a thirteenth house but supports a move", () => {
  const initial = defaultLayout();
  assert.ok(editLayout(initial, index(1, 1), "house").error);
  const removed = editLayout(initial, index(3, 2), "erase").layout;
  assert.equal(canStart(removed), false);
  const moved = editLayout(removed, index(1, 1), "house").layout;
  assert.equal(canStart(moved), true);
  assert.equal(moved[index(3, 2)], "grass");
  assert.equal(initial[index(3, 2)], "house");
});
test("station budget cannot exceed 12 and removing a station refunds 4", () => {
  let layout = defaultLayout();
  for (const z of [1, 2, 5])
    layout = editLayout(layout, index(1, z), "station").layout;
  assert.equal(counts(layout).spent, 12);
  assert.ok(editLayout(layout, index(1, 4), "station").error);
  layout = editLayout(layout, index(1, 1), "erase").layout;
  assert.equal(counts(layout).spent, 8);
  assert.equal(editLayout(layout, index(1, 4), "station").error, undefined);
});
test("replacing a house or defense updates both resources correctly", () => {
  const replaced = editLayout(defaultLayout(), index(3, 2), "station").layout;
  assert.deepEqual(counts(replaced), { homes: 11, spent: 4 });
  const restored = editLayout(replaced, index(3, 2), "house").layout;
  assert.deepEqual(counts(restored), { homes: 12, spent: 0 });
});
test("boundary, fixed fire sources, and invalid coordinates cannot be edited", () => {
  for (const i of [-1, 64, 2.5, index(0, 2), index(0, 1), index(7, 5)]) {
    assert.ok(editLayout(defaultLayout(), i, "break").error);
  }
});
test("local storage validation rejects malformed, oversized, and tampered maps", () => {
  for (const value of [null, {}, [], new Array(64).fill("house"), ["invalid"]])
    assert.equal(validateLayout(value), false);
  const tampered = defaultLayout();
  tampered[index(0, 2)] = "break";
  assert.equal(validateLayout(tampered), false);
  assert.equal(validateLayout(defaultLayout()), true);
  assert.equal(validateLayout(blankLayout()), true);
  assert.equal(canStart(blankLayout()), false);
});
test("east wind ignites an equally distant eastern house before a northern house", () => {
  const layout = blankLayout();
  layout[index(3, 3)] = "source";
  layout[index(4, 3)] = "house";
  layout[index(3, 2)] = "house";
  const sim = createSimulation(layout);
  for (let i = 0; i < 80; i++) step(sim);
  const east = sim.events.find(
    (e) => e.type === "ignite" && e.target === index(4, 3),
  );
  const north = sim.events.find(
    (e) => e.type === "ignite" && e.target === index(3, 2),
  );
  assert.ok(east);
  assert.ok(north);
  assert.ok(east.tick < north.tick);
});
test("burning houses at cutoff are not counted as successfully protected", () => {
  const sim = createSimulation(defaultLayout());
  const house = sim.cells.find((c) => c.kind === "house")!;
  house.burning = true;
  assert.equal(result(sim).saved, 11);
  assert.equal(result(sim).burning, 1);
});
test("all ignition events have adjacent real sources and chronological timestamps", () => {
  const sim = runToEnd(defaultLayout());
  let lastTick = 0;
  for (const event of sim.events) {
    assert.ok(event.tick >= lastTick);
    lastTick = event.tick;
    if (event.type === "ignite")
      assert.ok(neighbors(event.source).includes(event.target));
  }
  assert.ok(sim.events.length > 12);
});
