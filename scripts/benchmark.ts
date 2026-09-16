import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { defaultLayout, index, runToEnd, result } from "../src/sim/model.ts";

const layouts = [defaultLayout(), defaultLayout(), defaultLayout()];
for (const z of [1, 2]) layouts[1][index(1, z)] = "break";
for (const z of [1, 2, 4, 5, 6]) layouts[2][index(1, z)] = "break";
for (let i = 0; i < 9; i++) runToEnd(layouts[i % 3]);
const timings: number[] = [];
for (let i = 0; i < 60; i++) {
  const start = performance.now();
  const sim = runToEnd(layouts[i % 3]);
  timings.push(performance.now() - start);
  assert.equal(result(sim).saved, [0, 6, 12][i % 3]);
}
timings.sort((a, b) => a - b);
const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
const budget = Number(process.env.PERF_SIM_BUDGET_MS ?? 100);
assert.ok(Number.isFinite(budget) && budget > 0, "invalid simulation benchmark budget");
console.log(JSON.stringify({ scope: "CPU only; 60 complete 450-step simulations after warmup; not browser FPS", node: process.version,
  samples: timings.length, p95Ms: +p95.toFixed(2), maxMs: +timings.at(-1)!.toFixed(2), budgetMs: budget }, null, 2));
assert.ok(p95 <= budget, `Full-simulation p95 ${p95.toFixed(2)} ms exceeds ${budget} ms`);
