export type Kind = "grass" | "house" | "break" | "station" | "stone" | "source";
export type Tool = "house" | "break" | "station" | "erase";
export type Layout = Kind[];
export interface Cell {
  kind: Kind;
  heat: number;
  hp: number;
  burning: boolean;
  burned: boolean;
  fuel: number;
}
export interface FireEvent {
  tick: number;
  target: number;
  source: number;
  type: "ignite" | "destroy";
}
export interface Simulation {
  cells: Cell[];
  tick: number;
  events: FireEvent[];
  done: boolean;
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
  station: "消防站",
  stone: "石地边界",
  source: "预定火源",
};
export const index = (x: number, z: number) => z * RULES.size + x;
export const coords = (i: number) => ({
  x: i % RULES.size,
  z: Math.floor(i / RULES.size),
});
export const distance = (a: number, b: number) => {
  const p = coords(a),
    q = coords(b);
  return Math.abs(p.x - q.x) + Math.abs(p.z - q.z);
};
export function buildable(i: number): boolean {
  if (!Number.isInteger(i) || i < 0 || i >= 64) return false;
  const { x, z } = coords(i);
  return x > 0 && x < 7 && z > 0 && z < 7;
}
export function blankLayout(): Layout {
  return Array.from({ length: 64 }, (_, i) => {
    const { x, z } = coords(i);
    if (i === index(0, 2) || i === index(0, 5)) return "source";
    return buildable(i) || (x === 0 && z > 0 && z < 7) ? "grass" : "stone";
  });
}
export function defaultLayout(): Layout {
  const layout = blankLayout();
  for (let z = 2; z <= 4; z++)
    for (let x = 2; x <= 5; x++) layout[index(x, z)] = "house";
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
): { layout: Layout; error?: string } {
  if (!buildable(i))
    return { layout, error: "边界和火源不可建造。请选择街区内的格子。" };
  const kind = tool === "erase" ? "grass" : tool;
  if (layout[i] === kind) return { layout };
  const next = layout.slice();
  next[i] = kind;
  const n = counts(next);
  if (n.homes > RULES.homes)
    return { layout, error: "12 栋住宅已放完。先拆除一栋，再选择新位置。" };
  if (n.spent > RULES.budget)
    return { layout, error: "防灾预算不足。拆除设施可以退还预算。" };
  return { layout: next };
}
export function canStart(layout: Layout): boolean {
  return validateLayout(layout) && counts(layout).homes === RULES.homes;
}
export function createSimulation(layout: Layout): Simulation {
  return {
    cells: layout.map((kind) => ({
      kind,
      heat: 0,
      hp: kind === "house" ? 100 : 0,
      burning: kind === "source",
      burned: false,
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
  };
}
function flammable(cell: Cell) {
  return (cell.kind === "grass" || cell.kind === "house") && !cell.burned;
}
export function neighbors(i: number): number[] {
  const { x, z } = coords(i);
  return [
    x > 0 ? i - 1 : -1,
    x < 7 ? i + 1 : -1,
    z > 0 ? i - 8 : -1,
    z < 7 ? i + 8 : -1,
  ].filter((j) => j >= 0);
}
export function step(sim: Simulation): void {
  if (sim.done) return;
  const incoming = new Float64Array(64);
  const strongest = new Float64Array(64);
  const source = new Int16Array(64).fill(-1);
  const cooling = new Float64Array(64);
  for (let i = 0; i < 64; i++) {
    if (!sim.cells[i].burning) continue;
    for (const j of neighbors(i)) {
      if (!flammable(sim.cells[j]) || sim.cells[j].burning) continue;
      const rate =
        j === i + 1
          ? RULES.eastHeat
          : j === i - 1
            ? RULES.westHeat
            : RULES.sideHeat;
      incoming[j] += rate;
      if (rate > strongest[j]) {
        strongest[j] = rate;
        source[j] = i;
      }
    }
  }
  for (let i = 0; i < 64; i++) {
    if (sim.cells[i].kind !== "station") continue;
    const targets = sim.cells.flatMap((cell, j) =>
      flammable(cell) &&
      !cell.burning &&
      (cell.heat > 0 || incoming[j] > 0) &&
      distance(i, j) <= RULES.stationRadius
        ? [j]
        : [],
    );
    for (const j of targets)
      cooling[j] += RULES.stationCapacity / targets.length;
  }
  const tick = sim.tick + 1;
  sim.cells.forEach((cell, i) => {
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
      const threshold =
        cell.kind === "house" ? RULES.houseThreshold : RULES.grassThreshold;
      if (cell.heat >= threshold) {
        cell.burning = true;
        sim.events.push({ tick, target: i, source: source[i], type: "ignite" });
      }
    }
  });
  sim.tick = tick;
  sim.done = tick >= RULES.steps;
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
    success: houses.length === RULES.homes && saved >= RULES.goal,
  };
}
export function runToEnd(layout: Layout): Simulation {
  const sim = createSimulation(layout);
  while (!sim.done) step(sim);
  return sim;
}
