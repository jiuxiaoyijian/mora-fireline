import { hexDistance, hexNeighbors } from "./hex.ts";
export type Kind = "grass" | "house" | "break" | "station" | "stone" | "source";
export type Tool = "house" | "break" | "station" | "erase";
export type Layout = Kind[];
export type HouseType = "timber" | "brick";
export interface Weather { at: number; direction: "east" | "west" | "calm"; strength: number }
export interface Scenario {
  layout: Layout; budget: number; goal: number; duration: number;
  tools: readonly Tool[]; houseTypes: Record<number, HouseType>;
  weather: readonly Weather[]; emberInterval: number; seed: number;
  sourceStarts?: Record<number, number>;
  sprinkler?: { radius: number; cooling: number; charges: number; refillSeconds: number };
  emberVolley?: number;
}
export const sprinklerRules = (scenario?: Scenario) => scenario?.sprinkler ?? { radius: 2, cooling: 72, charges: Infinity, refillSeconds: 0 };
export interface Supply { cell: number; covered: number[]; charges: number; refillAt: number }
export interface Ember { source: number; target: number; launched: number; lands: number }
export interface Cell {
  kind: Kind;
  heat: number;
  cooling: number;
  hp: number;
  burning: boolean;
  burned: boolean;
  fuel: number;
  threshold: number;
  wet: boolean;
}
export interface FireEvent {
  tick: number;
  target: number;
  source: number;
  type: "ignite" | "destroy" | "block" | "ember-warning" | "ember-block" | "ember-hit";
  cause?: "ground" | "ember";
}
export interface Simulation {
  cells: Cell[];
  tick: number;
  events: FireEvent[];
  done: boolean;
  scenario?: Scenario;
  embers: Ember[];
  blocked: Set<string>;
  stats: { barriers: number; intercepted: number; emberHits: number; dryHits: number };
  supplies: Supply[];
  threats: { source: number; target: number; blocked: boolean }[];
}
export interface Result {
  saved: number;
  destroyed: number;
  burning: number;
  success: boolean;
}

export const RULES = Object.freeze({
  size: 8,
  homes: 12,
  budget: 12,
  goal: 8,
  dt: 0.1,
  duration: 45,
  steps: 450,
  eastHeat: 22,
  sideHeat: 12,
  westHeat: 6,
  cooling: 2,
  grassThreshold: 24,
  houseThreshold: 50,
  grassFuel: 9,
  houseFuel: 14,
  houseDamage: 10,
  stationCapacity: 72,
  stationRadius: 2,
});

export const COST: Record<Tool, number> = {
  house: 0,
  break: 1,
  station: 4,
  erase: 0,
};
export const NAMES: Record<Kind, string> = {
  grass: "可燃草地",
  house: "住宅",
  break: "防火带",
  station: "蓄水喷淋",
  stone: "天然岩地（不传火）",
  source: "山火入口",
};
export const index = (x: number, z: number) => z * RULES.size + x;
export const coords = (i: number) => ({
  x: i % RULES.size,
  z: Math.floor(i / RULES.size),
});
export const distance = hexDistance;
export function buildable(i: number): boolean {
  if (!Number.isInteger(i) || i < 0 || i >= 64) return false;
  const { x, z } = coords(i);
  return x > 0 && x < 7 && z > 0 && z < 7 && z !== 3;
}
export function blankLayout(): Layout {
  return Array.from({ length: 64 }, (_, i) => {
    const { x, z } = coords(i);
    if (i === index(0, 2) || i === index(0, 5)) return "source";
    return buildable(i) || (x === 0 && z > 0 && z < 7 && z !== 3) ? "grass" : "stone";
  });
}
export function defaultLayout(): Layout {
  const layout = blankLayout();
  for (const z of [1, 2, 4, 5])
    for (let x = 3; x <= 5; x++) layout[index(x, z)] = "house";
  return layout;
}
export function counts(layout: Layout) {
  return {
    homes: layout.filter((k) => k === "house").length,
    spent: layout.reduce(
      (n, k) => n + (k === "station" ? 4 : k === "break" ? 1 : 0),
      0,
    ),
  };
}
export function validateLayout(value: unknown): value is Layout {
  if (!Array.isArray(value) || value.length !== 64) return false;
  const base = blankLayout();
  if (
    !value.every((kind, i) =>
      buildable(i)
        ? ["grass", "house", "break", "station"].includes(kind)
        : kind === base[i],
    )
  )
    return false;
  const n = counts(value as Layout);
  return n.homes <= RULES.homes && n.spent <= RULES.budget;
}
export function editLayout(
  layout: Layout,
  i: number,
  tool: Tool,
  scenario?: Scenario,
): { layout: Layout; error?: string } {
  if (scenario && (!scenario.tools.includes(tool) || tool === "house"))
    return { layout, error: "本关未开放此工具；住宅由关卡固定。" };
  if (scenario && scenario.layout[i] !== "grass")
    return { layout, error: scenario.layout[i] === "house" ? "住宅是固定保护目标，不能移动、替换或拆除。" : "固定岩地与火源不可改建。" };
  if (!buildable(i))
    return { layout, error: "天然岩地、边界和火源不可建造。请选择草地。" };
  const kind = tool === "erase" ? "grass" : tool;
  if (layout[i] === kind) return { layout };
  const next = layout.slice();
  next[i] = kind;
  const n = counts(next);
  if (n.homes > RULES.homes)
    return { layout, error: "12 栋住宅已放完。先拆除一栋，再选择新位置。" };
  if (n.spent > (scenario?.budget ?? RULES.budget))
    return { layout, error: "防灾预算不足。拆除设施可以退还预算。" };
  return { layout: next };
}
export function canStart(layout: Layout, scenario?: Scenario): boolean {
  if (scenario) return validateScenarioLayout(layout, scenario);
  return validateLayout(layout) && counts(layout).homes === RULES.homes;
}
export function validateScenarioLayout(value: unknown, scenario: Scenario): value is Layout {
  if (!Array.isArray(value) || value.length !== 64) return false;
  return value.every((kind, i) => scenario.layout[i] === "grass" && buildable(i)
    ? ["grass", ...(scenario.tools.includes("break") ? ["break"] : []), ...(scenario.tools.includes("station") ? ["station"] : [])].includes(kind)
    : kind === scenario.layout[i]) && counts(value).spent <= scenario.budget;
}
export function weatherAt(scenario: Scenario | undefined, seconds: number): Weather {
  return scenario?.weather.filter(w => w.at <= seconds).at(-1) ?? { at: 0, direction: "east", strength: 1 };
}
export function createSimulation(layout: Layout, scenario?: Scenario): Simulation {
  return {
    cells: layout.map((kind, i) => ({
      kind,
      heat: 0,
      cooling: 0,
      hp: kind === "house" ? 100 : 0,
      burning: kind === "source" && !(scenario?.sourceStarts?.[i]),
      burned: false,
      threshold: kind === "house" ? (scenario?.houseTypes[i] === "timber" ? 40 : scenario?.houseTypes[i] === "brick" ? 90 : RULES.houseThreshold) : RULES.grassThreshold,
      wet: false,
      fuel:
        kind === "house"
          ? RULES.houseFuel
          : kind === "source"
            ? 999
            : RULES.grassFuel,
    })),
    tick: 0,
    events: [],
    done: false,
    scenario, embers: [], blocked: new Set(), stats: { barriers: 0, intercepted: 0, emberHits: 0, dryHits: 0 }, threats: [],
    supplies: layout.flatMap((kind, i) => kind === "station" ? [{ cell: i, covered: layout.flatMap((_, j) => distance(i, j) <= sprinklerRules(scenario).radius ? [j] : []), charges: sprinklerRules(scenario).charges, refillAt: 0 }] : []),
  };
}
function flammable(cell: Cell) {
  return (cell.kind === "grass" || cell.kind === "house") && !cell.burned;
}
export const neighbors = hexNeighbors;
export function step(sim: Simulation): void {
  if (sim.done) return;
  const tick = sim.tick + 1;
  const weather = weatherAt(sim.scenario, sim.tick * RULES.dt);
  sim.threats = [];
  const sprinkler = sprinklerRules(sim.scenario);
  for (const supply of sim.supplies) {
    if (supply.charges < sprinkler.charges && tick >= supply.refillAt) {
      supply.charges++;
      supply.refillAt = tick + Math.round(sprinkler.refillSeconds / RULES.dt);
    }
  }
  sim.cells.forEach((cell, i) => {
    if (cell.kind === "source" && sim.tick * RULES.dt >= (sim.scenario?.sourceStarts?.[i] ?? 0)) cell.burning = true;
    cell.wet = cell.kind === "house" && sim.supplies.some(supply => supply.charges > 0 && supply.covered.includes(i));
  });
  const incoming = new Float64Array(64);
  const strongest = new Float64Array(64);
  const source = new Int16Array(64).fill(-1);
  const cooling = new Float64Array(64);
  for (let i = 0; i < 64; i++) {
    if (!sim.cells[i].burning) continue;
    for (const j of neighbors(i)) {
      if (sim.cells[j].kind === "break") {
        sim.threats.push({ source: i, target: j, blocked: true });
        const key = `${i}:${j}`;
        if (!sim.blocked.has(key)) { sim.blocked.add(key); sim.stats.barriers++; sim.events.push({ tick, source: i, target: j, type: "block" }); }
      }
      if (!flammable(sim.cells[j]) || sim.cells[j].burning) continue;
      sim.threats.push({ source: i, target: j, blocked: false });
      const east = coords(j).x > coords(i).x;
      const west = coords(j).x < coords(i).x;
      const downwind = weather.direction === "east" ? east : weather.direction === "west" && west;
      const upwind = weather.direction === "east" ? west : weather.direction === "west" && east;
      const rate = sim.scenario
        ? (downwind ? 22 * weather.strength : upwind ? 6 : 12)
        : j === i + 1 ? RULES.eastHeat : j === i - 1 ? RULES.westHeat : RULES.sideHeat;
      incoming[j] += rate;
      if (rate > strongest[j]) {
        strongest[j] = rate;
        source[j] = i;
      }
    }
  }
  for (const supply of sim.supplies) {
    const targets = supply.covered.filter(j => flammable(sim.cells[j]) && !sim.cells[j].burning && (sim.cells[j].heat > 0 || incoming[j] > 0));
    for (const j of targets) cooling[j] += sprinkler.cooling / targets.length;
  }
  // Seeded, telegraphed embers: retries use the same weather and selection sequence.
  const interval = sim.scenario?.emberInterval ?? 0;
  if (interval > 0 && weather.direction !== "calm" && tick % Math.round(interval / RULES.dt) === 0) {
    const candidates: { source: number; target: number }[] = [];
    sim.cells.forEach((cell, i) => {
      if (!cell.burning) return;
      sim.cells.forEach((target, j) => {
        const dx = coords(j).x - coords(i).x;
        if (target.kind === "house" && !target.burning && !target.burned && distance(i,j) >= 2 && distance(i,j) <= 3
          && (weather.direction === "east" ? dx > 0 : dx < 0)) candidates.push({ source:i, target:j });
      });
    });
    for (let n = 0; n < (sim.scenario?.emberVolley ?? 1) && candidates.length; n++) {
      const hash = Math.imul((sim.scenario!.seed ^ tick ^ (n * 101)) >>> 0, 1664525) + 1013904223;
      const selected = candidates[(hash >>> 0) % candidates.length];
      sim.embers.push({ ...selected, launched:tick, lands:tick + 15 });
      sim.events.push({ ...selected, tick, type:"ember-warning" });
      for (let i = candidates.length - 1; i >= 0; i--) if (candidates[i].target === selected.target || candidates[i].source === selected.source) candidates.splice(i, 1);
    }
  }
  const emberSources = new Map<number, number>();
  for (const ember of sim.embers.filter(e => e.lands <= tick)) {
    const cell = sim.cells[ember.target];
    if (cell.burning || cell.burned) continue;
    const supply = sim.supplies.filter(s => s.covered.includes(ember.target) && s.charges > 0).sort((a,b) => b.charges - a.charges || a.cell - b.cell)[0];
    if (supply) {
      if (supply.charges === sprinkler.charges) supply.refillAt = tick + Math.round(sprinkler.refillSeconds / RULES.dt);
      supply.charges--;
      sim.stats.intercepted++; sim.events.push({ ...ember, tick, type:"ember-block" });
    }
    else {
      if (sim.supplies.some(s => s.covered.includes(ember.target))) sim.stats.dryHits++; cell.heat += 65; emberSources.set(ember.target, ember.source); sim.stats.emberHits++; sim.events.push({ ...ember, tick, type:"ember-hit" }); }
  }
  sim.embers = sim.embers.filter(e => e.lands > tick);
  sim.cells.forEach((cell, i) => {
    cell.cooling = cooling[i];
    cell.wet = cell.kind === "house" && sim.supplies.some(supply => supply.charges > 0 && supply.covered.includes(i));
    if (cell.burning && cell.kind !== "source") {
      cell.fuel = Math.max(0, cell.fuel - RULES.dt);
      if (cell.kind === "house")
        cell.hp = Math.max(0, cell.hp - RULES.houseDamage * RULES.dt);
      if (cell.fuel < 0.00001 || (cell.kind === "house" && cell.hp <= 0)) {
        cell.burning = false;
        cell.burned = true;
        if (cell.kind === "house")
          sim.events.push({ tick, target: i, source: i, type: "destroy" });
      }
    } else if (flammable(cell)) {
      cell.heat = Math.max(
        0,
        cell.heat + (incoming[i] - RULES.cooling - cooling[i]) * RULES.dt,
      );
      const threshold = cell.threshold;
      if (cell.heat >= threshold) {
        cell.burning = true;
        sim.events.push({ tick, target: i, source: emberSources.get(i) ?? source[i], type: "ignite", ...(sim.scenario ? { cause: emberSources.has(i) ? "ember" as const : "ground" as const } : {}) });
      }
    }
  });
  sim.tick = tick;
  sim.done = tick >= (sim.scenario ? Math.round(sim.scenario.duration / RULES.dt) : RULES.steps);
}
export function result(sim: Simulation): Result {
  const houses = sim.cells.filter((c) => c.kind === "house");
  const destroyed = houses.filter((c) => c.burned).length;
  const burning = houses.filter((c) => c.burning).length;
  const saved = houses.filter((c) => !c.burned && !c.burning).length;
  return {
    saved,
    destroyed,
    burning,
    success: houses.length === (sim.scenario ? counts(sim.scenario.layout).homes : RULES.homes) && saved >= (sim.scenario?.goal ?? RULES.goal),
  };
}
export function runToEnd(layout: Layout, scenario?: Scenario): Simulation {
  const sim = createSimulation(layout, scenario);
  while (!sim.done) step(sim);
  return sim;
}
