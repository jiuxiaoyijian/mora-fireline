import test from "node:test";
import assert from "node:assert/strict";
import { RULES, blankLayout, createSimulation, defaultLayout, index, runToEnd, step } from "./model.ts";
import { advancePlayback, completeSimulation } from "./playback.ts";

test("automatic total-loss completion preserves the full simulation and event history", () => {
  const layout = defaultLayout();
  const sim = createSimulation(layout);
  let stoppedAt: number | null = null;
  while (!sim.done) stoppedAt = advancePlayback(sim) ?? stoppedAt;
  assert.equal(stoppedAt, 192);
  assert.equal(sim.tick, RULES.steps);
  assert.deepEqual(sim, runToEnd(layout));
});

test("burning homes and quiet early ticks must not trigger automatic completion", () => {
  const sim = createSimulation(defaultLayout());
  while (sim.tick < 191) {
    assert.equal(advancePlayback(sim), null);
    assert.equal(sim.done, false);
  }
  assert.ok(sim.cells.some((cell) => cell.kind === "house" && cell.burning));
});

test("partial and full protection keep normal playback through the full duration", () => {
  const wall = defaultLayout();
  for (const z of [1, 2, 4, 5, 6]) wall[index(1, z)] = "break";
  const partial = defaultLayout();
  partial[index(1, 2)] = "station";
  for (const layout of [wall, partial]) {
    const sim = createSimulation(layout);
    for (let tick = 1; tick <= RULES.steps; tick++) {
      assert.equal(advancePlayback(sim), null);
      assert.equal(sim.tick, tick);
    }
    assert.deepEqual(sim, runToEnd(layout));
  }
});

test("manual completion from different playback positions matches a full run and is idempotent", () => {
  const layout = defaultLayout();
  for (const elapsed of [0, 37, 96, 195, 450]) {
    const sim = createSimulation(layout);
    for (let tick = 0; tick < elapsed; tick++) step(sim);
    completeSimulation(sim);
    assert.deepEqual(sim, runToEnd(layout));
    assert.equal(advancePlayback(sim), null);
    completeSimulation(sim);
    assert.deepEqual(sim, runToEnd(layout));
  }
});

test("empty maps do not qualify as a total loss", () => {
  const sim = createSimulation(blankLayout());
  assert.equal(advancePlayback(sim), null);
  assert.equal(sim.tick, 1);
});
