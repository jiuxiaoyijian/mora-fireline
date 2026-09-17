import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, awardStars, newCampaign, readCampaign, migrateCampaign } from "./levels.ts";
import { canStart, counts, createSimulation, distance, editLayout, result, runToEnd, step, validateScenarioLayout, weatherAt } from "./model.ts";
import { completeSimulation } from "./playback.ts";

// Verified solutions, intentionally kept out of the runtime level data.
const plans = [["C2"], ["B2", "B3"], ["B2s"], ["E2s", "D3"], ["D2", "E2s", "C5", "C6"], ["E2s", "D3", "D5s", "F5"], ["E2s", "D3", "E6s", "D7"], ["E2s", "D3", "D5s", "F5"]];
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
  for (let i=0;i<75;i++) { step(timber); step(brick); }
  assert.ok(timber.cells.some(c => c.kind === "house" && c.burning));
  assert.ok(brick.cells.every(c => !c.burning || c.kind === "source"));
  const protectedSim = createSimulation(plan(3), level);
  protectedSim.cells[13].burning = true;
  step(protectedSim);
  assert.equal(protectedSim.cells[13].burning, true);
  assert.equal(protectedSim.cells[13].hp, 99);
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
  const tampered = plan(3); tampered[13] = "grass";
  assert.deepEqual(readCampaign({ layouts: { "4": tampered } }).layouts, {});
  assert.equal(awardStars(0, 0, LEVELS[0]), 0);
  assert.equal(awardStars(2, 2, LEVELS[0]), 2);
  assert.equal(awardStars(2, 1, LEVELS[0]), 3);
});

test("every campaign star target is achievable, and partial late-level protection can unlock the next level", () => {
  const efficient = [["C2"], ["B2", "B3"], ["B2s"], ["E2s"], ["D2", "E2s", "C5", "C6"], ["E2s", "D3", "D5s", "F5"], ["E2s", "D6", "E6s"], ["D2", "D3", "F5s", "G6"]];
  LEVELS.forEach((level, i) => {
    const map = plan(i, efficient[i]);
    assert.equal(awardStars(result(runToEnd(map, level)).saved, counts(map).spent, level), 3, level.name);
  });
  assert.equal(awardStars(8, 8, LEVELS[4]), 1);
  assert.equal(awardStars(7, 8, LEVELS[4]), 0);
});


test("local sprinklers share two interception charges across houses and refill one after four seconds", () => {
  const level = { ...LEVELS[3], emberInterval: 0 };
  const map = plan(3, ["E2s"]);
  const sim = createSimulation(map, level);
  sim.embers = [13,20,21].map(target => ({ source:10, target, launched:-14, lands:1 }));
  step(sim);
  assert.equal(sim.stats.intercepted, 2);
  assert.equal(sim.stats.dryHits, 1);
  assert.equal(sim.cells[21].burning, true);
  assert.equal(sim.supplies[0].charges, 0);
  for (let i=0;i<39;i++) step(sim);
  assert.equal(sim.supplies[0].charges, 0);
  step(sim);
  assert.equal(sim.supplies[0].charges, 1);
  assert.ok(!sim.supplies[0].covered.includes(14), "two-step houses must not receive roof immunity");
});

test("late volleys overload sprinkler-only plans; cutting ember-producing grass restores full protection", () => {
  const stage = LEVELS[6];
  const sprinklerOnly = runToEnd(plan(6, ["E2s", "E6s"]), stage);
  assert.equal(result(sprinklerOnly).success, false);
  assert.ok(sprinklerOnly.stats.dryHits > 0);
  const combined = runToEnd(plan(6), stage);
  assert.equal(result(combined).saved, 8);
  assert.equal(combined.stats.dryHits, 0);
  assert.equal(combined.events.filter(e => e.type === "ember-warning" && stage.layout[e.source] === "grass").length, 0);
  assert.ok(sprinklerOnly.events.some(e => e.type === "ember-warning" && stage.layout[e.source] === "grass"));
});

test("a volley selects distinct burning sources and targets and remains deterministic", () => {
  const stage = LEVELS[7], sim = runToEnd(stage.layout, stage);
  for (const tick of new Set(sim.events.filter(e => e.type === "ember-warning").map(e => e.tick))) {
    const events = sim.events.filter(e => e.type === "ember-warning" && e.tick === tick);
    assert.equal(new Set(events.map(e => e.source)).size, events.length);
    assert.equal(new Set(events.map(e => e.target)).size, events.length);
    assert.ok(events.length <= 3);
  }
  assert.deepEqual(sim, runToEnd(stage.layout, stage));
});


test("balance revision retains earned unlocks without copying incompatible layouts or old stars", () => {
  const legacy = { ...newCampaign(), current:6, stars:[3,3,2,2,2,3,0,0], layouts:{ "4": plan(3) } };
  const migrated = migrateCampaign(legacy);
  assert.equal(migrated.unlocked,6); assert.equal(migrated.current,6);
  assert.deepEqual(migrated.stars,[0,0,0,0,0,0,0,0]); assert.deepEqual(migrated.layouts,{});
  assert.equal(readCampaign(JSON.parse(JSON.stringify(migrated))).unlocked,6);
  migrated.stars[6] = 2;
  assert.equal(readCampaign(migrated).unlocked,7);
  assert.equal(legacy.stars[0],3);
});
