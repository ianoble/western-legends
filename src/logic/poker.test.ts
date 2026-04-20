import { describe, it, expect } from 'vitest';
import { createStandardDeck } from '../../../noble-bg-engine/packages/engine/src/utils/deck-utils.js';
import {
  applyDefenderDowngradeChallengerOneCard,
  bestPokerScore,
  bestPokerScoreFromHandAndFlop,
  bestPokerScoreFromHandAndFlopSaloon,
  compareFightPlayedCardsWithRankPenalty,
  comparePokerHands,
  comparePokerScores,
  compareThreeCardFight,
  decreaseRankByOne,
  formatPokerScoreLabel,
  HAND_CATEGORY,
  pickBestTwoForFlop,
  THREE_CARD_CATEGORY,
  rankOrder,
  scoreThreeCardFight,
} from './poker';

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

describe('formatPokerScoreLabel', () => {
  it('labels common categories', () => {
    const flush = bestPokerScore(pick(['A-hearts', 'J-hearts', '9-hearts', '4-hearts', '2-hearts']));
    expect(formatPokerScoreLabel(flush)).toContain('Flush');
    const straight = bestPokerScore(pick(['10-clubs', '9-diamonds', '8-spades', '7-hearts', '6-clubs']));
    expect(formatPokerScoreLabel(straight)).toContain('Straight');
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

describe('decreaseRankByOne', () => {
  it('steps ace down to king and two has no lower', () => {
    expect(decreaseRankByOne('A')).toBe('K');
    expect(decreaseRankByOne('3')).toBe('2');
    expect(decreaseRankByOne('2')).toBeNull();
  });
});

describe('applyDefenderDowngradeChallengerOneCard', () => {
  it('flips a narrow challenger win to defender win when lowering one rank works', () => {
    const ch = pick(['A-hearts', 'J-diamonds', '9-clubs', '4-hearts', '2-spades']);
    const def = pick(['K-clubs', 'Q-diamonds', 'J-spades', '8-hearts', '3-clubs']);
    expect(comparePokerHands(ch, def)).toBeGreaterThan(0);
    const r = applyDefenderDowngradeChallengerOneCard(ch, def);
    expect(r.summary).toMatch(/defender wins fight/);
    expect(comparePokerHands(r.challenger, def)).toBeLessThan(0);
  });

  it('does nothing when challenger already loses', () => {
    const weak = pick(['7-hearts', '5-diamonds', '4-spades', '3-hearts', '2-clubs']);
    const strong = pick(['A-hearts', 'K-diamonds', 'Q-spades', 'J-hearts', '10-clubs']);
    expect(comparePokerHands(weak, strong)).toBeLessThan(0);
    const r = applyDefenderDowngradeChallengerOneCard(weak, strong);
    expect(r.summary).toBeNull();
    expect(r.challenger).toBe(weak);
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

describe('bestPokerScoreFromHandAndFlop', () => {
  it('combines two hole cards with flop', () => {
    const hand = pick(['A-hearts', 'K-hearts', '2-clubs', '3-spades']);
    const flop = pick(['Q-hearts', 'J-hearts', '10-hearts']);
    const s = bestPokerScoreFromHandAndFlop(hand, flop);
    expect(s.category).toBe(HAND_CATEGORY.straightFlush);
  });
});

describe('pickBestTwoForFlop', () => {
  it('matches bestPokerScoreFromHandAndFlop strength', () => {
    const hand = pick(['A-hearts', 'K-hearts', '2-clubs', '3-spades']);
    const flop = pick(['Q-hearts', 'J-hearts', '10-hearts']);
    const two = pickBestTwoForFlop(hand, flop);
    expect(two).toHaveLength(2);
    const fromPick = bestPokerScoreFromHandAndFlop(two, flop);
    const fromAll = bestPokerScoreFromHandAndFlop(hand, flop);
    expect(comparePokerScores(fromPick, fromAll)).toBe(0);
  });

  it('prefers first combination on exact tie', () => {
    const hand = pick(['8-hearts', '8-diamonds', '7-clubs', '7-spades']);
    const flop = pick(['2-clubs', '3-diamonds', '4-spades']);
    const two = pickBestTwoForFlop(hand, flop);
    const ids = new Set(two.map((c) => c.id));
    expect(ids.has('8-hearts')).toBe(true);
    expect(ids.has('8-diamonds')).toBe(true);
  });
});

describe('compareFightPlayedCardsWithRankPenalty', () => {
  it('Stick Em Up strength (−2 ranks) can flip K vs Q when defender is penalized', () => {
    const challenger = pick(['Q-hearts'])[0]!;
    const defender = pick(['K-spades'])[0]!;
    // K − 2 = J (11); Q wins outright.
    expect(compareFightPlayedCardsWithRankPenalty(challenger, defender, 0, 2)).toBeGreaterThan(0);
  });

  it('on effective rank tie, more-penalized card loses (e.g. A weakened to Q vs natural Q)', () => {
    const challenger = pick(['Q-hearts'])[0]!;
    const defender = pick(['A-spades'])[0]!;
    // A (−2) = Q; ties natural Q — penalized card loses, not A♠ suit vs Q♥.
    expect(compareFightPlayedCardsWithRankPenalty(challenger, defender, 0, 2)).toBeGreaterThan(0);
  });

  it('on effective rank tie with equal penalties, suit tiebreak still applies', () => {
    const a = pick(['K-hearts'])[0]!;
    const b = pick(['K-spades'])[0]!;
    expect(compareFightPlayedCardsWithRankPenalty(a, b, 2, 2)).toBeLessThan(0);
  });
});

describe('bestPokerScoreFromHandAndFlopSaloon (Cheat)', () => {
  it('red 2 can count as missing rank for straight', () => {
    const hand = pick(['2-hearts', '3-clubs']);
    const flop = pick(['4-diamonds', '5-spades', '6-hearts']);
    const s = bestPokerScoreFromHandAndFlopSaloon(hand, flop);
    expect(s.category).toBe(HAND_CATEGORY.straight);
  });
});

describe('compareThreeCardFight', () => {
  it('trips beat pair', () => {
    const trips = pick(['7-hearts', '7-diamonds', '7-spades']);
    const pair = pick(['K-hearts', 'K-diamonds', '2-spades']);
    expect(compareThreeCardFight(trips, pair)).toBeGreaterThan(0);
    expect(scoreThreeCardFight(trips).category).toBe(THREE_CARD_CATEGORY.trips);
  });
});
