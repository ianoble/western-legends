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

function orderToRank(o: number): Rank {
  if (o === 14) return 'A';
  if (o === 13) return 'K';
  if (o === 12) return 'Q';
  if (o === 11) return 'J';
  if (o === 10) return '10';
  if (o >= 2 && o <= 9) return String(o) as Rank;
  throw new Error(`invalid rank order ${o}`);
}

/** One step weaker for poker rank (A→K→…→3); `2` cannot go lower. */
export function decreaseRankByOne(rank: Rank): Rank | null {
  const o = rankOrder(rank);
  if (o <= 2) return null;
  return orderToRank(o - 1);
}

/** Blackjack-style card `value` (same convention as the standard deck builder). */
function standardCardValueForRank(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return parseInt(rank, 10);
}

/**
 * Defender items (Six Iron, Old Betsy, Long Tom): after fight cards are revealed, reduce **one**
 * challenger's card by one rank and re-score if that flips a challenger win to a defender win,
 * or to a tie (prefers defender win when possible).
 */
export function applyDefenderDowngradeChallengerOneCard(
  handChallenger: StandardCard[],
  handDefender: StandardCard[],
): { challenger: StandardCard[]; summary: string | null } {
  const baseCmp = comparePokerHands(handChallenger, handDefender);
  if (baseCmp <= 0) {
    return { challenger: handChallenger, summary: null };
  }

  for (const want of ['defenderWin', 'tie'] as const) {
    for (let i = 0; i < handChallenger.length; i++) {
      const c = handChallenger[i]!;
      const newR = decreaseRankByOne(c.rank);
      if (newR == null) continue;
      const next = handChallenger.map((card, j) =>
        j === i
          ? ({
              ...card,
              rank: newR,
              value: standardCardValueForRank(newR),
              id: `${newR}-${card.suit}`,
            } as StandardCard)
          : card,
      );
      const cmp = comparePokerHands(next, handDefender);
      if (want === 'defenderWin' && cmp < 0) {
        return {
          challenger: next,
          summary: `reduced challenger's ${c.rank}→${newR}; defender wins fight`,
        };
      }
      if (want === 'tie' && cmp === 0) {
        return {
          challenger: next,
          summary: `reduced challenger's ${c.rank}→${newR}; fight tied`,
        };
      }
    }
  }

  return { challenger: handChallenger, summary: null };
}

/**
 * Best 5-card poker score using exactly 3 community cards and 2 distinct hole cards from `hand`.
 * (Saloon: flop + choose 2 from your hand.)
 */
export function bestPokerScoreFromHandAndFlop(hand: StandardCard[], flop: StandardCard[]): PokerScore {
  if (flop.length !== 3 || hand.length < 2) {
    return { category: HAND_CATEGORY.highCard, kickers: [] };
  }
  const subs = combinations(hand, 2);
  let best: PokerScore | null = null;
  for (const two of subs) {
    const s = scoreFiveCards([...two, ...flop]);
    if (!best || comparePokerScores(s, best) > 0) best = s;
  }
  return best ?? { category: HAND_CATEGORY.highCard, kickers: [] };
}

/** Category scale for 3-card “fight” draws (heist guard); separate numeric range from 5-card poker. */
export const THREE_CARD_CATEGORY = {
  highCard: 0,
  pair: 1,
  flush: 2,
  straight: 3,
  trips: 4,
  straightFlush: 5,
} as const;

/** Score exactly three cards (heist guard draw). Higher category and kickers win. */
export function scoreThreeCardFight(cards: StandardCard[]): PokerScore {
  if (cards.length !== 3) return { category: 0, kickers: [] };
  const ranks = cards.map((c) => rankOrder(c.rank)).sort((a, b) => b - a);
  const flush = cards[0]!.suit === cards[1]!.suit && cards[1]!.suit === cards[2]!.suit;
  const trip = ranks[0] === ranks[1] && ranks[1] === ranks[2];
  const pair = ranks[0] === ranks[1] || ranks[1] === ranks[2];
  const straightHigh = threeCardStraightHigh(ranks);

  if (flush && straightHigh !== null) {
    return { category: THREE_CARD_CATEGORY.straightFlush, kickers: [straightHigh] };
  }
  if (trip) {
    return { category: THREE_CARD_CATEGORY.trips, kickers: [ranks[0]] };
  }
  if (straightHigh !== null) {
    return { category: THREE_CARD_CATEGORY.straight, kickers: [straightHigh] };
  }
  if (flush) {
    return { category: THREE_CARD_CATEGORY.flush, kickers: [...ranks] };
  }
  if (pair) {
    const pr = ranks[0] === ranks[1] ? ranks[0]! : ranks[1]!;
    const kicker = ranks[0] === ranks[1] ? ranks[2]! : ranks[0]!;
    return { category: THREE_CARD_CATEGORY.pair, kickers: [pr, kicker] };
  }
  return { category: THREE_CARD_CATEGORY.highCard, kickers: [...ranks] };
}

function threeCardStraightHigh(sortedDesc: number[]): number | null {
  if (sortedDesc.length !== 3) return null;
  const [a, b, c] = sortedDesc;
  if (a === 14 && b === 3 && c === 2) return 3;
  if (a - b === 1 && b - c === 1) return a;
  return null;
}

/** Compare 3-card fight hands. Positive if a wins; 0 tie. */
export function compareThreeCardFight(a: StandardCard[], b: StandardCard[]): number {
  return comparePokerScores(scoreThreeCardFight(a), scoreThreeCardFight(b));
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
