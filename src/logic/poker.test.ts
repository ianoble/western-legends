import { describe, it, expect } from 'vitest';
import { createStandardDeck } from '../../../noble-bg-engine/packages/engine/src/utils/deck-utils.js';
import { bestPokerScore, comparePokerHands, HAND_CATEGORY, rankOrder } from './poker';

function pick(ids: string[]): ReturnType<typeof createStandardDeck> {
  const deck = createStandardDeck();
  const map = new Map(deck.map((c) => [c.id, c]));
  return ids.map((id) => map.get(id)!).filter(Boolean);
}

describe('rankOrder', () => {
  it('ranks ace high', () => {
    expect(rankOrder('A')).toBe(14);
    expect(rankOrder('2')).toBe(2);
  });
});

describe('bestPokerScore', () => {
  it('detects a flush', () => {
    const hand = pick(['A-hearts', 'J-hearts', '9-hearts', '4-hearts', '2-hearts']);
    const s = bestPokerScore(hand);
    expect(s.category).toBe(HAND_CATEGORY.flush);
  });

  it('detects a straight', () => {
    const hand = pick(['10-clubs', '9-diamonds', '8-spades', '7-hearts', '6-clubs']);
    const s = bestPokerScore(hand);
    expect(s.category).toBe(HAND_CATEGORY.straight);
    expect(s.kickers[0]).toBe(10);
  });

  it('detects wheel straight', () => {
    const hand = pick(['A-hearts', '5-diamonds', '4-spades', '3-hearts', '2-clubs']);
    const s = bestPokerScore(hand);
    expect(s.category).toBe(HAND_CATEGORY.straight);
    expect(s.kickers[0]).toBe(5);
  });

  it('picks best 5 of 7 (full house beats flush)', () => {
    const seven = pick([
      'K-hearts',
      'K-diamonds',
      'K-spades',
      '9-clubs',
      '9-hearts',
      '2-spades',
      '4-hearts',
    ]);
    const s = bestPokerScore(seven);
    expect(s.category).toBe(HAND_CATEGORY.fullHouse);
  });
});

describe('comparePokerHands', () => {
  it('pair beats high card', () => {
    const pair = pick(['K-hearts', 'K-diamonds', '9-clubs', '4-hearts', '2-spades']);
    const high = pick(['A-hearts', 'J-diamonds', '9-clubs', '4-hearts', '2-spades']);
    expect(comparePokerHands(pair, high)).toBeGreaterThan(0);
  });

  it('returns 0 on identical strength (tie)', () => {
    const a = pick(['A-hearts', 'J-diamonds', '9-clubs', '4-hearts', '2-spades']);
    const b = pick(['A-clubs', 'J-hearts', '9-diamonds', '4-spades', '2-hearts']);
    expect(comparePokerHands(a, b)).toBe(0);
  });
});
