// Read-only design probes. These are scenario measurements, not human playtests.
import { RULES, defaultLayout, counts, coords, buildable, createSimulation, step, result, index } from '../src/sim/model.ts';
import type { Layout } from '../src/sim/model.ts';

function measure(layout: Layout) {
  const sim = createSimulation(layout);
  let lastSavedChange = 0;
  let saved = result(sim).saved;
  while (!sim.done) {
    step(sim);
    const next = result(sim).saved;
    if (next !== saved) lastSavedChange = sim.tick;
    saved = next;
  }
  const ignitions = sim.events.filter(e => e.type === 'ignite' && layout[e.target] === 'house');
  const destroyed = sim.events.filter(e => e.type === 'destroy');
  const seconds = (tick: number) => Number((tick * RULES.dt).toFixed(1));
  return {
    spent: counts(layout).spent,
    ...result(sim),
    firstHouseIgnition: ignitions.length ? seconds(ignitions[0].tick) : null,
    lastHouseIgnition: ignitions.length ? seconds(ignitions.at(-1)!.tick) : null,
    lastHouseDestruction: destroyed.length ? seconds(destroyed.at(-1)!.tick) : null,
    lastSavedCountChange: seconds(lastSavedChange),
    cutoff: RULES.duration,
  };
}
const base = defaultLayout();
const available = base.flatMap((kind, i) => buildable(i) && kind === 'grass' ? [i] : []);
const label = (i: number) => { const { x, z } = coords(i); return `${String.fromCharCode(65 + x)}${z + 1}`; };
const singleStations = available.map(i => {
  const layout = base.slice(); layout[i] = 'station';
  return { position: label(i), ...measure(layout) };
});
const doubleStations = [];
for (let a = 0; a < available.length; a++) for (let b = a + 1; b < available.length; b++) {
  const layout = base.slice(); layout[available[a]] = 'station'; layout[available[b]] = 'station';
  doubleStations.push({ positions: [label(available[a]), label(available[b])], ...measure(layout) });
}
const westernBreakSubsets = [];
const defenseRows = [1, 2, 4, 5, 6];
for (let mask = 0; mask < 2 ** defenseRows.length; mask++) {
  const layout = base.slice(); const positions = [];
  for (const [bit, z] of defenseRows.entries()) if (mask & (1 << bit)) {
    layout[index(1, z)] = 'break'; positions.push(label(index(1, z)));
  }
  westernBreakSubsets.push({ positions, ...measure(layout) });
}
const wall = base.slice();
for (const z of defenseRows) wall[index(1, z)] = 'break';
const histogram = (rows: { saved: number }[]) => rows.reduce<Record<string, number>>((acc, row) => {
  acc[String(row.saved)] = (acc[String(row.saved)] ?? 0) + 1;
  return acc;
}, {});
const best = [...singleStations].sort((a, b) => b.saved - a.saved || a.position.localeCompare(b.position));
const passingBreaks = westernBreakSubsets.filter(x => x.success).sort((a, b) => a.spent - b.spent || b.saved - a.saved);
console.log(JSON.stringify({
  scope: 'Hex valley v2: default 12 homes, all legal empty single-station sites and pairs, 32 subsets of B2/B3/B5/B6/B7. Natural rock belt is immutable. Not exhaustive over house moves or mixed defenses.',
  baseline: measure(base),
  fullWesternBreak: measure(wall),
  singleStation: { total: singleStations.length, histogram: histogram(singleStations), best: best.slice(0, 6) },
  doubleStation: { total: doubleStations.length, histogram: histogram(doubleStations), passing: doubleStations.filter(x => x.success).length },
  westernBreakSubsets: { total: westernBreakSubsets.length, histogram: histogram(westernBreakSubsets), cheapestPassing: passingBreaks.slice(0, 6) },
}, null, 2));
