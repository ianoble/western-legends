/**
 * Graph reachability on the physical board space catalog.
 * Keep logic pure so client (BoardMap) and server (game.ts) stay in sync.
 */

export const DEFAULT_MOVEMENT_POINTS = 2;

export interface SpaceGraphNode {
  neighbors: string[];
}

export function getReachableSpaceIds(
  spaceById: Record<string, SpaceGraphNode>,
  startId: string,
  budget: number,
): Set<string> {
  if (!spaceById[startId]) return new Set();
  const dist = new Map<string, number>([[startId, 0]]);
  const queue: string[] = [startId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = dist.get(id)!;
    if (d >= budget) continue;
    const node = spaceById[id];
    if (!node) continue;
    for (const n of node.neighbors) {
      if (!spaceById[n]) continue;
      const next = d + 1;
      if (next <= budget && !dist.has(n)) {
        dist.set(n, next);
        queue.push(n);
      }
    }
  }
  return new Set(dist.keys());
}

export function getShortestPathLength(
  spaceById: Record<string, SpaceGraphNode>,
  fromId: string,
  toId: string,
): number | null {
  if (!spaceById[fromId] || !spaceById[toId]) return null;
  if (fromId === toId) return 0;
  const seen = new Map<string, number>([[fromId, 0]]);
  const queue: string[] = [fromId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = seen.get(id)!;
    const node = spaceById[id];
    if (!node) continue;
    for (const n of node.neighbors) {
      if (!spaceById[n]) continue;
      if (seen.has(n)) continue;
      const next = d + 1;
      if (n === toId) return next;
      seen.set(n, next);
      queue.push(n);
    }
  }
  return null;
}

export function polygonCentroid(points: readonly [number, number][]): [number, number] {
  if (points.length === 0) return [50, 50];
  let sx = 0; let sy = 0;
  for (const [x, y] of points) { sx += x; sy += y; }
  return [sx / points.length, sy / points.length];
}

export function polygonToSvgPoints(points: readonly [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}
