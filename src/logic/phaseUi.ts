import type { WesternLegendsState } from './types';

/** True when every seat has committed a starter character (draft finished). */
export function everyPlayerHasCharacter(G: WesternLegendsState | undefined): boolean {
  if (!G?.players || typeof G.players !== 'object') return false;
  const vals = Object.values(G.players);
  if (vals.length === 0) return false;
  return vals.every((p) => p != null && p.characterId != null);
}

export type UiGamePhase = 'play' | 'chooseCharacter';

/**
 * Phase for layout/copy. Prefer `G` when ctx omits `phase` after some syncs — avoids “stuck in draft” UI.
 */
export function uiGamePhase(G: WesternLegendsState | undefined, ctxPhase: string | null | undefined): UiGamePhase {
  if (everyPlayerHasCharacter(G)) return 'play';
  if (ctxPhase === 'play') return 'play';
  return 'chooseCharacter';
}
