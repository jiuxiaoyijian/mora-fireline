import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, awardStars, newCampaign, readCampaign } from "./levels.ts";
import { canStart, counts, createSimulation, distance, editLayout, result, runToEnd, step, validateScenarioLayout, weatherAt } from "./model.ts";
import { completeSimulation } from "./playback.ts";

// Verified solutions, intentionally kept out of the runtime level data.
const plans = [["C2"], ["B2", "B3"], ["B2s"], ["D2", "D3s"], ["D2", "D3s", "B5", "B6", "B7"], ["D2", "D3s", "G5", "G6", "G7"], ["D2s", "D5s"], ["D2", "D3s", "E5", "E6s"]];
function plan(stage: number, actions = plans[stage]) {
  const level = LEVELS[stage];
  let map = level.layout.slice();
  for (const p of actions) {
    const next = editLayout(map, (Number(p[1])-1)*8+p.charCodeAt(0)-65, p.endsWith("s") ? "station" : "break", level);
    assert.equal(next.error, undefined); map = next.layout;
  }
  return map;
}
for (const [i, level] of LEVELS.entries()) test(`campaign ${level.id}: baseline fails, authored solution protects all within budget`, () => {
  assert.equal(level.layout.length, 64);
  assert.ok(level.layout.every(Boolean));
  assert.equal(canStart(level.layout, level), true);
  assert.equal(result(runToEnd(level.layout, level)).success, false);
  const solution = plan(i);
  assert.ok(counts(solution).spent <= level.budget);
  const simulation = runToEnd(solution, level);
  assert.equal(result(simulation).saved, counts(level.layout).homes);
  assert.equal(simulation.tick, level.duration * 10);
  assert.deepEqual(simulation, runToEnd(solution, level));
});
test("campaign houses and terrain cannot be moved, replaced, erased or changed by a save", () => {
  for (const level of LEVELS) {
    level.layout.forEach((kind, i) => {
      if (kind === "grass") return;
      for (const tool of ["house", "break", "station", "erase"] as const) assert.ok(editLayout(level.layout, i, tool, level).error);
      const map = level.layout.slice(); map[i] = "grass";
      assert.equal(validateScenarioLayout(map, level), false);
    });
  }
  assert.ok(editLayout(LEVELS[0].layout, 10, "station", LEVELS[0]).error);
});
test("firebreak stops ground heat but cannot stop telegraphed jumping embers", () => {
  const level = LEVELS[3];
  const map = plan(3, ["D2", "D3"]);
  const sim = runToEnd(map, level);
  assert.ok(sim.stats.barriers > 0);
  assert.equal(result(sim).success, false);
  const ignite = sim.events.find(e => e.type === "ignite" && e.cause === "ember")!;
  assert.ok(ignite);
  assert.ok(distance(ignite.source, ignite.target) >= 2);
  assert.ok(sim.events.some(e => e.type === "ember-warning" && e.target === ignite.target && e.tick === ignite.tick - 15));
  const wet = runToEnd(plan(3), level);
  assert.ok(wet.stats.intercepted > 0);
  assert.equal(wet.stats.emberHits, 0);
});
test("brick roofs tolerate an isolated ember that ignites timber; sprinklers do not heal burning homes", () => {
  const level = LEVELS[3];
  const map = plan(3, ["D2", "D3"]);
  const timber = createSimulation(map, level);
  const brick = createSimulation(map, { ...level, houseTypes: Object.fromEntries(Object.keys(level.houseTypes).map(i => [i, "brick"])) });
  for (let i=0;i<55;i++) { step(timber); step(brick); }
  assert.ok(timber.cells.some(c => c.kind === "house" && c.burning));
  assert.ok(brick.cells.every(c => !c.burning || c.kind === "source"));
  const protectedSim = createSimulation(plan(3), level);
  protectedSim.cells[12].burning = true;
  step(protectedSim);
  assert.equal(protectedSim.cells[12].burning, true);
  assert.equal(protectedSim.cells[12].hp, 99);
});
test("wind phase and delayed fire source activate at the forecast time", () => {
  const level = LEVELS[5];
  assert.equal(weatherAt(level, 11.9).direction, "east");
  assert.equal(weatherAt(level, 12).direction, "west");
  const sim = createSimulation(level.layout, level);
  for (let i=0;i<120;i++) step(sim);
  assert.equal(sim.cells[39].burning, false);
  step(sim); assert.equal(sim.cells[39].burning, true);
});
test("skipping campaign playback has the same result, events and interceptions as full playback", () => {
  const level = LEVELS[7], map = plan(7), sim = createSimulation(map, level);
  for (let i=0;i<150;i++) step(sim);
  completeSimulation(sim);
  assert.deepEqual(sim, runToEnd(map, level));
});
test("campaign persistence restores valid per-level defenses and derives unlocks from contiguous clears", () => {
  const save = newCampaign(); save.current = 3; save.unlocked = 7; save.stars = [3,2,2,0,0,0,0,0]; save.layouts["4"] = plan(3);
  const read = readCampaign(JSON.parse(JSON.stringify(save)));
  assert.equal(read.current, 3); assert.equal(read.unlocked, 3); assert.deepEqual(read.layouts["4"], plan(3));
  assert.equal(readCampaign({ unlocked: 7, current: 7, stars: [4, -1, "3"] }).unlocked, 0);
  const tampered = plan(3); tampered[12] = "grass";
  assert.deepEqual(readCampaign({ layouts: { "4": tampered } }).layouts, {});
  assert.equal(awardStars(0, 0, LEVELS[0]), 0);
  assert.equal(awardStars(2, 2, LEVELS[0]), 2);
  assert.equal(awardStars(2, 1, LEVELS[0]), 3);
});

test("every campaign star target is achievable, and partial late-level protection can unlock the next level", () => {
  const efficient = [["C2"], ["B2", "B3"], ["B2s"], ["D3s"], ["D3s", "B5", "B6", "B7"], ["D3s", "G5", "G6", "G7"], ["D2s", "D5s"], ["D3s", "E6s"]];
  LEVELS.forEach((level, i) => {
    const map = plan(i, efficient[i]);
    assert.equal(awardStars(result(runToEnd(map, level)).saved, counts(map).spent, level), 3, level.name);
  });
  assert.equal(awardStars(8, 8, LEVELS[4]), 1);
  assert.equal(awardStars(7, 8, LEVELS[4]), 0);
});
