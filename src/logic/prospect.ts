/**
 * Western Legends **Prospect for Gold** (rulebook D3): two D6 prospecting dice per action.
 *
 * Each die has six faces: Nugget×2, Tailings×2, Gold Dust×1, Gravel×1.
 * Gold Dust: +$10 for that face, then reroll **that die only** once and apply the next result.
 */

export type ProspectFace = 'nugget' | 'tailings' | 'goldDust' | 'gravel';

/** Physical prospecting die — same multiset on both dice. */
export const PROSPECT_DIE_FACE_POOL: readonly ProspectFace[] = [
  'nugget',
  'nugget',
  'tailings',
  'tailings',
  'goldDust',
  'gravel',
] as const;

export type ProspectDieSlotIndex = 0 | 1;

/** One applied face after resolving gold/dust (used for undo + Miner's Map). */
export interface ProspectMapDieOutcome {
  slotIndex: ProspectDieSlotIndex;
  face: ProspectFace;
  nuggetAdded: boolean;
  goldAdded: number;
}

export interface ProspectSlotFaces {
  slotIndex: ProspectDieSlotIndex;
  faces: ProspectFace[];
}

/** `rng` returns a value in [0, 1). */
export function rollProspectingFace(rng: () => number): ProspectFace {
  const i = Math.floor(rng() * PROSPECT_DIE_FACE_POOL.length);
  return PROSPECT_DIE_FACE_POOL[i]!;
}

/**
 * Roll one prospecting die: if Gold Dust, roll again once for that die only (rulebook).
 */
export function rollProspectDieSlot(rng: () => number, slotIndex: ProspectDieSlotIndex): ProspectSlotFaces {
  const faces: ProspectFace[] = [];
  let f = rollProspectingFace(rng);
  faces.push(f);
  if (f === 'goldDust') {
    f = rollProspectingFace(rng);
    faces.push(f);
  }
  return { slotIndex, faces };
}

/** Roll both prospecting dice (independent), including per-die gold-dust follow-up. */
export function resolveProspectRoll(rng: () => number): ProspectSlotFaces[] {
  return [rollProspectDieSlot(rng, 0), rollProspectDieSlot(rng, 1)];
}
