import { RULES, step } from "./model.ts";
import type { Simulation } from "./model.ts";

/** Skip presentation only: retain every deterministic step and event. */
export function completeSimulation(sim: Simulation): void {
  while (!sim.done) step(sim);
}

/** Returns the simulation tick at which an irreversible total loss ended playback. */
export function advancePlayback(sim: Simulation): number | null {
  step(sim);
  if (sim.done) return null;
  const houses = sim.cells.filter((cell) => cell.kind === "house");
  // Wait for destruction, so players still see the burning/destruction feedback.
  // Quiet periods or a lack of new ignitions do not prove that homes are safe.
  if (houses.length !== (sim.scenario ? sim.scenario.layout.filter(k => k === "house").length : RULES.homes) || !houses.every((cell) => cell.burned))
    return null;
  const stoppedAt = sim.tick;
  completeSimulation(sim);
  return stoppedAt;
}
