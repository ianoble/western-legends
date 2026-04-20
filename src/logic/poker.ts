import type { StandardCard, Rank, Suit } from '@engine/client';

/** Tie-break for single-card fight plays: spades highest (common high-card tiebreak). */
function fightPlaySuitOrder(suit: Suit): number {
  const o: Record<Suit, number> = { spades: 4, hearts: 3, diamonds: 2, clubs: 1 };
  return o[suit];
}

/**
 * Compare one revealed fight card each (high rank wins; same rank → higher suit wins).
 * Positive if `a` wins; negative if `b` wins; 0 tie.
 */
export function compareFightPlayedCards(a: StandardCard, b: StandardCard): number {
  const ra = rankOrder(a.rank);
  const rb = rankOrder(b.rank);
  if (ra !== rb) return ra - rb;
  return fightPlaySuitOrder(a.suit) - fightPlaySuitOrder(b.suit);
}

/**
 * Compare fight plays after optional rank penalties (e.g. Stick Em Up), without mutating cards.
 * Effective rank order is floored at deuce (2).
 *
 * If effective ranks tie, the card with **more** rank penalty loses (Stick Em Up weakens the card;
 * e.g. natural Q ties a K penalized by 1 — the penalized K loses, not suit on the physical K).
 * If penalties are equal, uses the same suit tiebreak as {@link compareFightPlayedCards}.
 */
export function compareFightPlayedCardsWithRankPenalty(
  a: StandardCard,
  b: StandardCard,
  penaltyStepsA: number,
  penaltyStepsB: number,
): number {
  const pa = Math.max(0, penaltyStepsA);
  const pb = Math.max(0, penaltyStepsB);
  const ra = Math.max(2, rankOrder(a.rank) - pa);
  const rb = Math.max(2, rankOrder(b.rank) - pb);
  if (ra !== rb) return ra - rb;
  if (pa !== pb) {
    if (pa > pb) return -1;
    if (pb > pa) return 1;
  }
  return fightPlaySuitOrder(a.suit) - fightPlaySuitOrder(b.suit);
}

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

/**
 * Best 2-card poker score (pair beats high card). For MIB Cabaret / short-showdown rules.
 */
/** Exported for MIB cabaret 2-card showdowns. */
export function bestTwoCardPokerScore(cards: readonly StandardCard[]): PokerScore {
  if (cards.length < 2) return { category: HAND_CATEGORY.highCard, kickers: [] };
  const a = cards[0]!;
  const b = cards[1]!;
  const ra = rankOrder(a.rank);
  const rb = rankOrder(b.rank);
  if (ra === rb) return { category: HAND_CATEGORY.pair, kickers: [ra] };
  const hi = Math.max(ra, rb);
  const lo = Math.min(ra, rb);
  return { category: HAND_CATEGORY.highCard, kickers: [hi, lo] };
}

/** Compare exactly two cards as a 2-card hand. Positive if first hand wins. */
export function compareTwoCardPokerHands(a: readonly StandardCard[], b: readonly StandardCard[]): number {
  return comparePokerScores(bestTwoCardPokerScore(a), bestTwoCardPokerScore(b));
}

/**
 * Best 2-card score choosing any pair from `cards` (length ≥ 2). Used when the MIB proxy holds 4 cards.
 */
export function bestTwoCardPokerScoreFromPool(cards: readonly StandardCard[]): { score: PokerScore; pick: [StandardCard, StandardCard] } {
  let best: PokerScore | null = null;
  let bestPick: [StandardCard, StandardCard] = [cards[0]!, cards[1]!];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const pair = [cards[i]!, cards[j]!] as [StandardCard, StandardCard];
      const s = bestTwoCardPokerScore(pair);
      if (!best || comparePokerScores(s, best) > 0) {
        best = s;
        bestPick = pair;
      }
    }
  }
  return { score: best ?? { category: HAND_CATEGORY.highCard, kickers: [] }, pick: bestPick };
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
  const cmpHands =
    handChallenger.length === 1 && handDefender.length === 1
      ? compareFightPlayedCards(handChallenger[0]!, handDefender[0]!)
      : comparePokerHands(handChallenger, handDefender);
  if (cmpHands <= 0) {
    return { challenger: handChallenger, summary: null };
  }

  const compareAfter = (next: StandardCard[]): number =>
    handChallenger.length === 1 && handDefender.length === 1
      ? compareFightPlayedCards(next[0]!, handDefender[0]!)
      : comparePokerHands(next, handDefender);

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
      const cmp = compareAfter(next);
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

/**
 * The two hole cards that make the best 5-card hand with `flop` (first winning combo on ties).
 */
export function pickBestTwoForFlop(hand: StandardCard[], flop: StandardCard[]): StandardCard[] {
  if (flop.length !== 3 || hand.length < 2) {
    return hand.slice(0, 2);
  }
  const subs = combinations(hand, 2);
  let best: PokerScore | null = null;
  let bestTwo: StandardCard[] | null = null;
  for (const two of subs) {
    const s = scoreFiveCards([...two, ...flop]);
    if (!best || comparePokerScores(s, best) > 0) {
      best = s;
      bestTwo = two;
    }
  }
  return bestTwo ?? hand.slice(0, 2);
}

const SALOON_CHEAT_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function isSaloonCheatCard(c: StandardCard): boolean {
  return c.rank === '2' && (c.suit === 'hearts' || c.suit === 'diamonds');
}

/** Expand a red 2 into rank variants for best-hand evaluation (printed card stays in hand). */
function expandSaloonCheatRankVariants(c: StandardCard): StandardCard[] {
  if (!isSaloonCheatCard(c)) return [c];
  return SALOON_CHEAT_RANKS.map(
    (rank) =>
      ({
        ...c,
        rank,
        value: standardCardValueForRank(rank),
        id: `${rank}-${c.suit}`,
      }) as StandardCard,
  );
}

function bestPickTwoScoreForSaloon(hand: StandardCard[], flop: StandardCard[]): { score: PokerScore; two: StandardCard[] } {
  if (flop.length !== 3 || hand.length < 2) {
    return { score: { category: HAND_CATEGORY.highCard, kickers: [] }, two: hand.slice(0, 2) };
  }
  const subs = combinations(hand, 2);
  let best: PokerScore | null = null;
  let bestTwo: StandardCard[] | null = null;
  for (const two of subs) {
    const aOpts = expandSaloonCheatRankVariants(two[0]!);
    const bOpts = expandSaloonCheatRankVariants(two[1]!);
    for (const va of aOpts) {
      for (const vb of bOpts) {
        const s = scoreFiveCards([va, vb, ...flop]);
        if (!best || comparePokerScores(s, best) > 0) {
          best = s;
          bestTwo = two;
        }
      }
    }
  }
  return { score: best ?? { category: HAND_CATEGORY.highCard, kickers: [] }, two: bestTwo ?? hand.slice(0, 2) };
}

/**
 * Saloon scoring: red 2 (Cheat) may count as any rank for the best 5-card hand with the flop.
 */
export function bestPokerScoreFromHandAndFlopSaloon(hand: StandardCard[], flop: StandardCard[]): PokerScore {
  return bestPickTwoScoreForSaloon(hand, flop).score;
}

/** The two actual hole cards from the hand that achieve {@link bestPokerScoreFromHandAndFlopSaloon}. */
export function pickBestTwoForFlopSaloon(hand: StandardCard[], flop: StandardCard[]): StandardCard[] {
  return bestPickTwoScoreForSaloon(hand, flop).two;
}

/** Red 10 “Poker bonus” — hole card text triggers on a lost showdown. */
export function saloonPickedHoleUsesRedTenBonus(holeCards: StandardCard[]): boolean {
  return holeCards.some((c) => c.rank === '10' && (c.suit === 'hearts' || c.suit === 'diamonds'));
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

function kickerOrderToShortRank(o: number): string {
  if (o === 14) return 'A';
  if (o === 13) return 'K';
  if (o === 12) return 'Q';
  if (o === 11) return 'J';
  if (o === 10) return '10';
  return String(o);
}

/** Short English label for a 5-card {@link PokerScore} (Saloon / fight summaries). */
export function formatPokerScoreLabel(score: PokerScore): string {
  const hi = (i: number) =>
    score.kickers[i] != null ? kickerOrderToShortRank(score.kickers[i]!) : '';
  switch (score.category) {
    case HAND_CATEGORY.straightFlush:
      return `Straight flush (${hi(0)} high)`;
    case HAND_CATEGORY.quads:
      return `Four of a kind (${hi(0)}s)`;
    case HAND_CATEGORY.fullHouse:
      return `Full house (${hi(0)} full of ${hi(1)}s)`;
    case HAND_CATEGORY.flush:
      return 'Flush';
    case HAND_CATEGORY.straight:
      return `Straight (${hi(0)} high)`;
    case HAND_CATEGORY.trips:
      return `Three of a kind (${hi(0)}s)`;
    case HAND_CATEGORY.twoPair:
      return `Two pair (${hi(0)}s and ${hi(1)}s)`;
    case HAND_CATEGORY.pair:
      return `Pair of ${hi(0)}s`;
    case HAND_CATEGORY.highCard:
    default:
      return score.kickers[0] != null ? `High card (${hi(0)})` : 'High card';
  }
}
