import { describe, expect, it } from 'vitest';
import { INVALID_MOVE } from '@engine/client';
import { createStandardDeck } from '@engine/client';
import type { Ctx } from 'boardgame.io';
import { buildInitialCattlePiles } from './cattleTokens';
import { buildInitialFightDeck } from './fightCards';
import { buildInitialBoardNpcs, westernLegendsGameDef } from './game';
import { pickBestTwoForFlop } from './poker';
import type { WesternLegendsState } from './types';
import { GENERAL_STORE_BASE_ITEM_IDS, GENERAL_STORE_COPIES_PER_BASE_ITEM } from '../data/itemCards';
import { POKER_ANTE_GOLD, SALOON_HOUSE_ADDS_TO_POT, SALOON_WIN_LEGEND_POINTS } from './types';
import { BOARD_STARTING_SPACE_ID } from '../map/boardSpaces';

function mockSaloonEvents() {
	return {
		setActivePlayers: () => {},
		endStage: () => {},
	};
}

function pick(ids: string[]) {
  const deck = createStandardDeck();
  const m = new Map(deck.map((c) => [c.id, c]));
  return ids.map((id) => m.get(id)!);
}

function basePlayer(hand: WesternLegendsState['players'][string]['hand'], gold: number) {
  return {
    color: 'red' as const,
    characterOffers: null,
    characterId: 'wl-02',
    locationId: BOARD_STARTING_SPACE_ID,
    movementPointsLeft: 3,
    gold,
    legendaryPoints: 0,
    wounds: 0,
    nuggets: 0,
    carriedCattle: null,
    wantedPoints: 0,
    marshalPoints: 0,
    hand,
    turnActions: [],
    needsStartTurnIncomeChoice: false,
    ownedWeaponItemIds: [],
    ownedMountItemIds: [],
    ownedMiscItemIds: [],
    usedHeistThisTurn: false,
    turnWeaponItemId: null,
    turnMountItemId: null,
    needsTurnWeaponMountChoice: false,
    prospectMapRerollDice: null,
    whiskeyReactionAvailable: false,
  };
}

function makeCtx(currentPlayer: string): Ctx {
  return {
    numPlayers: 2,
    playOrder: ['0', '1'],
    playOrderPos: 0,
    currentPlayer,
    turn: 0,
    round: 0,
    phase: 'play',
  } as Ctx;
}

function buildSaloonG(opts: {
  flop: ReturnType<typeof pick>;
  dealerHole: ReturnType<typeof pick>;
  activeHand: ReturnType<typeof pick>;
  activeGold: number;
}): WesternLegendsState {
  const { flop, dealerHole, activeHand, activeGold } = opts;
  const dealerPick = pickBestTwoForFlop(dealerHole, flop);
  const used = new Set([...flop, ...dealerHole, ...activeHand].map((c) => c.id));
  const pokerDeck = createStandardDeck().filter((c) => !used.has(c.id));

  const initialStock = Object.fromEntries(
    GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]),
  );

  return {
    round: 0,
    turnOrderIndex: 0,
    players: {
      '0': basePlayer([...activeHand], activeGold),
      '1': basePlayer([], 40),
    },
    pokerDeck,
    pokerDiscard: [],
    saloonRound: {
      activePlayerId: '0',
      cityId: 'darkrock',
      flop,
      potGold: SALOON_HOUSE_ADDS_TO_POT + POKER_ANTE_GOLD,
      pendingPlayerIds: [],
      joinedPlayerIds: ['0'],
      tieBreakCandidateIds: null,
      dealerShowdown: {
        dealerId: '1',
        dealerHoleCards: dealerHole,
        dealerPickCardIds: [dealerPick[0]!.id, dealerPick[1]!.id],
      },
    },
    saloonReveal: null,
    fight: null,
    prospectReveal: null,
    generalStoreStock: initialStock,
    storyDeckLeft: [],
    storyDeckRight: [],
    storyDiscard: [],
    storyInPlay: [],
    boardNpcs: buildInitialBoardNpcs(),
    cattlePiles: buildInitialCattlePiles(),
    fightDeck: buildInitialFightDeck(),
    fightDiscard: [],
    endGameScored: false,
    endGameScoreBreakdown: {},
    gameLog: [],
    legendGoal: 25,
    history: [],
  };
}

describe('Saloon dealer showdown (submitSaloonHolePick)', () => {
  const submit = westernLegendsGameDef.game.moves!.submitSaloonHolePick!;

  it('dealer wins: no gold to active, active draws one card', () => {
    const flop = pick(['8-spades', '9-diamonds', 'J-clubs']);
    const dealerHole = pick(['A-hearts', 'A-diamonds', '2-clubs', '3-clubs']);
    const activeHand = pick(['4-hearts', '5-hearts', '6-hearts', '9-hearts']);
    const G = buildSaloonG({ flop, dealerHole, activeHand, activeGold: 90 });
    const deckBefore = G.pokerDeck.length;
    const handBefore = G.players['0'].hand.length;
    const goldBefore = G.players['0'].gold;

    const ctx = makeCtx('0');
    const r = submit({ G, ctx, events: mockSaloonEvents() } as Parameters<typeof submit>[0], '9-hearts', '6-hearts');
    expect(r).not.toBe(INVALID_MOVE);

    expect(G.saloonRound).toBeNull();
    expect(G.saloonReveal).not.toBeNull();
    expect(G.saloonReveal!.ranked).toHaveLength(2);
    expect(G.saloonReveal!.winnerId).toBe('1');
    expect(G.saloonReveal!.winnerGold).toBe(0);
    expect(G.saloonReveal!.winnerLegendPoints).toBe(0);
    expect(G.players['0'].gold).toBe(goldBefore);
    expect(G.players['0'].hand.length).toBe(handBefore - 2 + 1);
    expect(G.pokerDeck.length).toBe(deckBefore - 1);
    expect(G.pokerDiscard.length).toBeGreaterThan(0);
  });

  it('active wins: gains pot (capped) and LP; dealer draws one', () => {
    const flop = pick(['K-spades', '7-diamonds', '2-clubs']);
    const dealerHole = pick(['6-hearts', '5-diamonds', '4-spades', '3-hearts']);
    const activeHand = pick(['A-hearts', '3-diamonds', '8-clubs', '9-spades']);
    const G = buildSaloonG({ flop, dealerHole, activeHand, activeGold: 40 });
    const dealerHandBefore = G.players['1'].hand.length;

    const ctx = makeCtx('0');
    const r = submit({ G, ctx, events: mockSaloonEvents() } as Parameters<typeof submit>[0], 'A-hearts', '3-diamonds');
    expect(r).not.toBe(INVALID_MOVE);

    expect(G.players['0'].legendaryPoints).toBe(SALOON_WIN_LEGEND_POINTS);
    expect(G.players['0'].gold).toBe(40 + SALOON_HOUSE_ADDS_TO_POT + POKER_ANTE_GOLD);
    expect(G.players['1'].hand.length).toBe(dealerHandBefore + 1);
    expect(G.saloonReveal).not.toBeNull();
    expect(G.saloonReveal!.winnerId).toBe('0');
    expect(G.saloonReveal!.winnerGold).toBe(SALOON_HOUSE_ADDS_TO_POT + POKER_ANTE_GOLD);
    expect(G.saloonReveal!.winnerLegendPoints).toBe(SALOON_WIN_LEGEND_POINTS);
    expect(G.saloonReveal!.ranked[0]!.playerId).toBe('0');
  });

  it('tie goes to active player', () => {
    const flop = pick(['2-clubs', '3-clubs', '4-diamonds']);
    const dealerHole = pick(['A-spades', 'K-spades', '8-hearts', '9-hearts']);
    const activeHand = pick(['A-diamonds', 'K-diamonds']);
    const G = buildSaloonG({ flop, dealerHole, activeHand, activeGold: 50 });

    const ctx = makeCtx('0');
    const r = submit({ G, ctx, events: mockSaloonEvents() } as Parameters<typeof submit>[0], 'A-diamonds', 'K-diamonds');
    expect(r).not.toBe(INVALID_MOVE);
    expect(G.players['0'].gold).toBe(50 + SALOON_HOUSE_ADDS_TO_POT + POKER_ANTE_GOLD);
    expect(G.saloonReveal?.winnerId).toBe('0');
  });
});
