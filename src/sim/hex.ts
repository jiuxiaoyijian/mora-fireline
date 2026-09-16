// Pointy-top, odd-row offset coordinates. Shared by rules and rendering.
export const HEX_RADIUS = 0.62;
export const MAP_SIZE = 8;
export function axial(i: number) {
  const r = Math.floor(i / MAP_SIZE);
  return { q: i % MAP_SIZE - (r - (r & 1)) / 2, r };
}
export function hexDistance(a: number, b: number): number {
  const p = axial(a), q = axial(b);
  const dq = p.q - q.q, dr = p.r - q.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
export function hexPosition(i: number) {
  const r = Math.floor(i / MAP_SIZE), col = i % MAP_SIZE;
  return {
    x: Math.sqrt(3) * HEX_RADIUS * (col + (r & 1) * 0.5 - 3.75),
    z: HEX_RADIUS * 1.5 * (r - 3.5),
  };
}
export function hexNeighbors(i: number): number[] {
  if (!Number.isInteger(i) || i < 0 || i >= MAP_SIZE * MAP_SIZE) return [];
  const r = Math.floor(i / MAP_SIZE), col = i % MAP_SIZE;
  const shift = r & 1;
  return [[col - 1, r], [col + 1, r], [col - 1 + shift, r - 1],
    [col + shift, r - 1], [col - 1 + shift, r + 1], [col + shift, r + 1]]
    .filter(([x, z]) => x >= 0 && x < MAP_SIZE && z >= 0 && z < MAP_SIZE)
    .map(([x, z]) => z * MAP_SIZE + x);
}
