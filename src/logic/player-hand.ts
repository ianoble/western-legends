import { STARTER_CHARACTER_BY_ID } from './starterCharacters';
import type { WesternLegendsPlayer } from './types';

/** Rulebook base: 5 poker cards minus 1 per wound (unless character ignores wounds for hand size). */
export const BASE_MAX_POKER_HAND = 5;

export function maxPokerHandSize(p: WesternLegendsPlayer): number {
  const def = p.characterId ? STARTER_CHARACTER_BY_ID[p.characterId] : undefined;
  const bonus = def?.handSizeBonus ?? 0;
  const woundPenalty = def?.handSizeIgnoresWounds ? 0 : p.wounds;
  return Math.max(0, BASE_MAX_POKER_HAND - woundPenalty + bonus);
}
