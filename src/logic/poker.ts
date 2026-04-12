import type { StandardCard, Rank } from '@engine/client';

/** Numeric rank for poker compare (A high). */
export function rankOrder(rank: Rank): number {
  if (rank === 'A') return 14;
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  if (rank === '10') return 10;
  return parseInt(rank, 10);
}

/** Category strength (higher wins). */
export const HAND_CATEGORY = {
  highCard: 0,
  pair: 1,
  twoPair: 2,
  trips: 3,
  straight: 4,
  flush: 5,
  fullHouse: 6,
  quads: 7,
  straightFlush: 8,
} as const;

export interface PokerScore {
  category: number;
  /** Lexicographic tie-break (higher first). */
  kickers: number[];
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

/**
 * Best 5-card poker score from 5–7 cards (hold'em style).
 * Returns score for the strongest 5-card subset.
 */
export function bestPokerScore(cards: StandardCard[]): PokerScore {
  if (cards.length < 5) {
    return { category: HAND_CATEGORY.highCard, kickers: [] };
  }
  const subs = cards.length === 5 ? [cards] : combinations(cards, 5);
  let best: PokerScore | null = null;
  for (const five of subs) {
    const s = scoreFiveCards(five);
    if (!best || comparePokerScores(s, best) > 0) best = s;
  }
  return best ?? { category: HAND_CATEGORY.highCard, kickers: [] };
}

/** Compare two scores: positive if a wins, negative if b wins, 0 tie. */
export function comparePokerScores(a: PokerScore, b: PokerScore): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
    const av = a.kickers[i] ?? 0;
    const bv = b.kickers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Compare two hands (5–7 cards each). Positive if handA wins. */
export function comparePokerHands(handA: StandardCard[], handB: StandardCard[]): number {
  return comparePokerScores(bestPokerScore(handA), bestPokerScore(handB));
}

function scoreFiveCards(cards: StandardCard[]): PokerScore {
  const ranks = cards.map((c) => rankOrder(c.rank)).sort((x, y) => y - x);
  const rankCounts = new Map<number, number>();
  for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
  const suits = new Map<string, number>();
  for (const c of cards) suits.set(c.suit, (suits.get(c.suit) ?? 0) + 1);
  const isFlush = [...suits.values()].some((n) => n >= 5);

  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  const straightHigh = getStraightHigh(uniqueRanks);

  const counts = [...rankCounts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const isStraight = straightHigh !== null;

  if (isFlush && isStraight && straightHigh !== null) {
    return { category: HAND_CATEGORY.straightFlush, kickers: [straightHigh] };
  }
  if (counts[0][1] === 4) {
    const quad = counts[0][0];
    const kicker = counts.find(([r]) => r !== quad)?.[0] ?? 0;
    return { category: HAND_CATEGORY.quads, kickers: [quad, kicker] };
  }
  if (counts[0][1] === 3 && counts[1]?.[1] === 2) {
    return { category: HAND_CATEGORY.fullHouse, kickers: [counts[0][0], counts[1][0]] };
  }
  if (isFlush) {
    return { category: HAND_CATEGORY.flush, kickers: [...ranks] };
  }
  if (isStraight && straightHigh !== null) {
    return { category: HAND_CATEGORY.straight, kickers: [straightHigh] };
  }
  if (counts[0][1] === 3) {
    const trip = counts[0][0];
    const kickers = counts
      .filter(([r]) => r !== trip)
      .map(([r]) => r)
      .sort((a, b) => b - a);
    return { category: HAND_CATEGORY.trips, kickers: [trip, ...kickers] };
  }
  if (counts[0][1] === 2 && counts[1]?.[1] === 2) {
    const pairs = [counts[0][0], counts[1][0]].sort((a, b) => b - a);
    const kicker = counts.find(([r]) => !pairs.includes(r))?.[0] ?? 0;
    return { category: HAND_CATEGORY.twoPair, kickers: [...pairs, kicker] };
  }
  if (counts[0][1] === 2) {
    const pair = counts[0][0];
    const kickers = counts
      .filter(([r]) => r !== pair)
      .map(([r]) => r)
      .sort((a, b) => b - a);
    return { category: HAND_CATEGORY.pair, kickers: [pair, ...kickers] };
  }
  return { category: HAND_CATEGORY.highCard, kickers: [...ranks] };
}

/** Highest top card of a straight, or null. Wheel: returns 5 (five-high). */
function getStraightHigh(sortedUniqueDesc: number[]): number | null {
  const s = new Set(sortedUniqueDesc);
  const isWheel = s.has(14) && s.has(5) && s.has(4) && s.has(3) && s.has(2);
  if (isWheel) return 5;

  for (let top = 14; top >= 5; top--) {
    let ok = true;
    for (let d = 0; d < 5; d++) {
      if (!s.has(top - d)) {
        ok = false;
        break;
      }
    }
    if (ok) return top;
  }
  return null;
}
