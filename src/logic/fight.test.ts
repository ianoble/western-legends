import { describe, expect, it, vi } from 'vitest';
import { INVALID_MOVE, createStandardDeck } from '@engine/client';
import type { Ctx } from 'boardgame.io';
import { buildInitialCattlePiles } from './cattleTokens';
import { buildInitialFightDeck } from './fightCards';
import { CATTLE_LEGACY_DEFAULT_FACE } from './types';
import { buildInitialBoardNpcs, westernLegendsGameDef } from './game';
import type { FightState, WesternLegendsState } from './types';
import { GENERAL_STORE_BASE_ITEM_IDS, GENERAL_STORE_COPIES_PER_BASE_ITEM } from '../data/itemCards';
import { buildFightStartEffectQueue } from './fight';
import { compareFightPlayedCards } from './poker';

function pick(ids: string[]) {
	const deck = createStandardDeck();
	const m = new Map(deck.map((c) => [c.id, c]));
	return ids.map((id) => m.get(id)!);
}

function basePlayer(
	overrides: Partial<WesternLegendsState['players'][string]> & {
		hand: WesternLegendsState['players'][string]['hand'];
	},
): WesternLegendsState['players'][string] {
	return {
		color: 'red',
		characterOffers: null,
		characterId: 'wl-12',
		locationId: 'dk-3',
		movementPointsLeft: 3,
		gold: 40,
		legendaryPoints: 0,
		wounds: 0,
		nuggets: 0,
		carriedCattle: null,
		wantedPoints: 0,
		marshalPoints: 0,
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
		generalStoreVisitPaidLocationId: null,
		...overrides,
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

function emptyStock(): Record<string, number> {
	return Object.fromEntries(GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]));
}

function buildG(players: WesternLegendsState['players']): WesternLegendsState {
	const pokerDeck = createStandardDeck();
	return {
		round: 0,
		turnOrderIndex: 0,
		players,
		pokerDeck,
		pokerDiscard: [],
		saloonRound: null,
		saloonReveal: null,
		prospectReveal: null,
		fight: null,
		generalStoreStock: emptyStock(),
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

const events = () => ({ setActivePlayers: vi.fn(), endStage: vi.fn() });

function makeFight(
	partial: Partial<FightState> & Pick<FightState, 'challengerId' | 'defenderId' | 'kind' | 'phase'>,
): FightState {
	return {
		startEffectQueue: [],
		startEffectQueueIndex: 0,
		challengerCommittedCard: null,
		defenderCommittedCard: null,
		defenderDeclined: false,
		outcome: null,
		revealCompareSummary: null,
		reactionTurn: 'challenger',
		reactionConsecutivePasses: 0,
		...partial,
	};
}

describe('compareFightPlayedCards', () => {
	it('ranks beat lower ranks; spades beats hearts on tie', () => {
		const a = pick(['K-spades'])[0]!;
		const b = pick(['Q-hearts'])[0]!;
		expect(compareFightPlayedCards(a, b)).toBeGreaterThan(0);
		const kH = pick(['K-hearts'])[0]!;
		const kS = pick(['K-spades'])[0]!;
		expect(compareFightPlayedCards(kH, kS)).toBeLessThan(0);
	});
});

describe('buildFightStartEffectQueue', () => {
	it('Annie Oakley legendary adds opponent step for each side', () => {
		const ch = basePlayer({
			characterId: 'wl-02',
			legendaryPoints: 1,
			hand: pick(['2-clubs']),
		});
		const def = basePlayer({
			characterId: 'wl-12',
			hand: pick(['3-clubs']),
		});
		const q = buildFightStartEffectQueue(ch, '0', def, '1');
		expect(q).toEqual([{ actorId: '1', kind: 'annieOakleyOpponent' }]);
		const q2 = buildFightStartEffectQueue(def, '1', ch, '0');
		// Defender is Annie: the challenger ('1') resolves discard/wound.
		expect(q2).toEqual([{ actorId: '1', kind: 'annieOakleyOpponent' }]);
	});

	it('interleaves when both have Annie legendary', () => {
		const ch = basePlayer({
			characterId: 'wl-02',
			legendaryPoints: 1,
			hand: pick(['2-clubs']),
		});
		const def = basePlayer({
			characterId: 'wl-02',
			legendaryPoints: 1,
			hand: pick(['3-clubs']),
		});
		const q = buildFightStartEffectQueue(ch, '0', def, '1');
		// Interleave: challenger-originated (defender Annie → challenger '0' acts) then defender-originated.
		expect(q).toEqual([
			{ actorId: '0', kind: 'annieOakleyOpponent' },
			{ actorId: '1', kind: 'annieOakleyOpponent' },
		]);
	});
});

describe('Fight moves', () => {
	const decline = westernLegendsGameDef.game.moves!.fightDefenderDecline!;
	const dismissFight = westernLegendsGameDef.game.moves!.dismissFightOutcome!;
	const vm = westernLegendsGameDef.validateMove!;
	const resolveRob = westernLegendsGameDef.game.moves!.resolveFightRobLoot!;

	it('validateMove rejects arrest without marshal / wanted', () => {
		const G = buildG({
			'0': basePlayer({ hand: pick(['A-spades']), marshalPoints: 0 }),
			'1': basePlayer({ hand: pick(['K-hearts']), wantedPoints: 0, locationId: 'dk-3' }),
		});
		const r = vm({ G, playerID: '0', currentPlayer: '0' }, 'startFight', 'arrest', '1');
		expect(r).not.toBe(true);
	});

	it('validateMove rejects a second fight vs the same target in one turn', () => {
		const G = buildG({
			'0': basePlayer({
				hand: pick(['A-spades', 'K-hearts']),
				marshalPoints: 1,
				locationId: 'dk-3',
				pvpFightTargetsThisTurn: ['1'],
			}),
			'1': basePlayer({ hand: pick(['2-clubs']), wantedPoints: 1, locationId: 'dk-3' }),
		});
		expect(vm({ G, playerID: '0', currentPlayer: '0' }, 'startFight', 'arrest', '1')).not.toBe(true);
		expect(vm({ G, playerID: '0', currentPlayer: '0' }, 'startFight', 'duel', '1')).not.toBe(true);
		expect(vm({ G, playerID: '0', currentPlayer: '0' }, 'startFight', 'rob', '1')).not.toBe(true);
	});

	it('validateMove rejects a second fight vs a different target if fight action already used', () => {
		const G = buildG({
			'0': basePlayer({
				hand: pick(['A-spades', 'K-hearts', '3-clubs']),
				locationId: 'dk-3',
				turnActions: ['move', 'fight'],
				pvpFightTargetsThisTurn: ['1'],
			}),
			'1': basePlayer({ hand: pick(['2-clubs']), locationId: 'dk-3' }),
			'2': basePlayer({ hand: pick(['4-clubs']), locationId: 'dk-3' }),
		});
		expect(vm({ G, playerID: '0', currentPlayer: '0' }, 'startFight', 'duel', '2')).not.toBe(true);
	});

	it('moveStartFight rejects duplicate target after a duel already started this turn', () => {
		const startFight = westernLegendsGameDef.game.moves!.startFight!;
		const G = buildG({
			'0': basePlayer({
				hand: pick(['A-spades', 'K-hearts']),
				locationId: 'dk-3',
				turnActions: ['fight'],
				pvpFightTargetsThisTurn: ['1'],
			}),
			'1': basePlayer({ hand: pick(['2-clubs']), locationId: 'dk-3' }),
		});
		expect(startFight({ G, ctx: makeCtx('0'), events: events() } as never, 'duel', '1')).toBe(INVALID_MOVE);
	});

	it('defender decline on duel: discards challenger card, defender wound+draw, challenger +2 LP', () => {
		const c0 = pick(['7-diamonds'])[0]!;
		const defHandBefore = pick(['2-clubs']);
		const G = buildG({
			'0': basePlayer({ hand: [], legendaryPoints: 0, turnActions: ['fight'], locationId: 'dk-3' }),
			'1': basePlayer({ hand: defHandBefore, locationId: 'dk-3' }),
		});
		const deckSizeBefore = G.pokerDeck.length;
		G.fight = makeFight({
			challengerId: '0',
			defenderId: '1',
			kind: 'duel',
			phase: 'defenderChoice',
			challengerCommittedCard: c0,
		});
		const ev = events();
		const r = decline({ G, ctx: makeCtx('0'), playerID: '1', events: ev } as never);
		expect(r).not.toBe(INVALID_MOVE);
		expect(G.fight?.phase).toBe('outcome');
		expect(G.fight?.outcomeReveal?.challenger?.id).toBe(c0.id);
		dismissFight({ G, ctx: makeCtx('0'), playerID: '0', events: ev } as never);
		expect(G.fight).toBeNull();
		expect(G.pokerDiscard.some((x) => x.id === c0.id)).toBe(true);
		expect(G.players['1'].wounds).toBe(1);
		expect(G.players['1'].hand.length).toBe(2);
		expect(G.pokerDeck.length).toBe(deckSizeBefore - 1);
		expect(G.players['0'].legendaryPoints).toBe(2);
		expect(ev.setActivePlayers).toHaveBeenCalled();
	});

	it('defender decline on rob: rewardRob phase, challenger +1 WP, defender wounded', () => {
		const c0 = pick(['7-diamonds'])[0]!;
		const G = buildG({
			'0': basePlayer({ hand: [], wantedPoints: 3, turnActions: ['fight'], locationId: 'dk-3' }),
			'1': basePlayer({ hand: pick(['2-clubs']), locationId: 'dk-3' }),
		});
		G.fight = makeFight({
			challengerId: '0',
			defenderId: '1',
			kind: 'rob',
			phase: 'defenderChoice',
			challengerCommittedCard: c0,
		});
		const ev = events();
		const r = decline({ G, ctx: makeCtx('0'), playerID: '1', events: ev } as never);
		expect(r).not.toBe(INVALID_MOVE);
		expect(G.fight?.phase).toBe('rewardRob');
		expect(G.players['0'].wantedPoints).toBe(4);
		expect(G.players['1'].wounds).toBe(1);
	});

	it('defender decline on arrest: jails to dk-9, strips wanted/cattle/halves gold & nuggets, +1 MP', () => {
		const c0 = pick(['7-diamonds'])[0]!;
		const G = buildG({
			'0': basePlayer({ hand: [], marshalPoints: 1, turnActions: ['fight'], locationId: 'dk-3' }),
			'1': basePlayer({
				hand: pick(['2-clubs']),
				locationId: 'dk-3',
				wantedPoints: 2,
				carriedCattle: { color: 'green', face: CATTLE_LEGACY_DEFAULT_FACE },
				gold: 41,
				nuggets: 5,
			}),
		});
		G.fight = makeFight({
			challengerId: '0',
			defenderId: '1',
			kind: 'arrest',
			phase: 'defenderChoice',
			challengerCommittedCard: c0,
		});
		const ev = events();
		const r = decline({ G, ctx: makeCtx('0'), playerID: '1', events: ev } as never);
		expect(r).not.toBe(INVALID_MOVE);
		expect(G.fight?.phase).toBe('outcome');
		dismissFight({ G, ctx: makeCtx('0'), playerID: '1', events: ev } as never);
		expect(G.fight).toBeNull();
		expect(G.players['1'].locationId).toBe('dk-9');
		expect(G.players['1'].wantedPoints).toBe(0);
		expect(G.players['1'].carriedCattle).toBeNull();
		expect(G.players['1'].gold).toBe(20);
		expect(G.players['1'].nuggets).toBe(2);
		expect(G.players['1'].wounds).toBe(1);
		expect(G.players['0'].marshalPoints).toBe(2);
	});

	it('reaction ends (challenger won): discards both, defender wound+draw, challenger +2 LP', () => {
		const c0 = pick(['A-spades'])[0]!;
		const c1 = pick(['K-hearts'])[0]!;
		const G = buildG({
			'0': basePlayer({ hand: [], legendaryPoints: 0, turnActions: ['fight'], locationId: 'dk-3' }),
			'1': basePlayer({ hand: [], locationId: 'dk-3' }),
		});
		const deckSizeBefore = G.pokerDeck.length;
		G.fight = makeFight({
			challengerId: '0',
			defenderId: '1',
			kind: 'duel',
			phase: 'reaction',
			challengerCommittedCard: c0,
			defenderCommittedCard: c1,
			outcome: 'challengerWins',
			revealCompareSummary: 'Fight reveal: challenger wins',
		});
		const pass = westernLegendsGameDef.game.moves!.fightReactionPass!;
		const ev = events();
		pass({ G, ctx: makeCtx('0'), playerID: '0', events: ev } as never);
		expect(G.fight?.reactionConsecutivePasses).toBe(1);
		pass({ G, ctx: makeCtx('0'), playerID: '1', events: ev } as never);
		expect(G.fight?.phase).toBe('outcome');
		dismissFight({ G, ctx: makeCtx('0'), playerID: '0', events: ev } as never);
		expect(G.fight).toBeNull();
		const ids = G.pokerDiscard.map((c) => c.id).sort();
		expect(ids).toContain(c0.id);
		expect(ids).toContain(c1.id);
		expect(G.players['1'].wounds).toBe(1);
		expect(G.players['1'].hand.length).toBe(1);
		expect(G.pokerDeck.length).toBe(deckSizeBefore - 1);
		expect(G.players['0'].legendaryPoints).toBe(2);
	});

	it('reaction ends (defender won): challenger wound+draw, defender +2 LP', () => {
		const c0 = pick(['2-clubs'])[0]!;
		const c1 = pick(['A-spades'])[0]!;
		const G = buildG({
			'0': basePlayer({ hand: [], locationId: 'dk-3' }),
			'1': basePlayer({ hand: [], legendaryPoints: 0, locationId: 'dk-3' }),
		});
		const deckSizeBefore = G.pokerDeck.length;
		G.fight = makeFight({
			challengerId: '0',
			defenderId: '1',
			kind: 'duel',
			phase: 'reaction',
			challengerCommittedCard: c0,
			defenderCommittedCard: c1,
			outcome: 'defenderWins',
			revealCompareSummary: 'Fight reveal: defender wins',
		});
		const pass = westernLegendsGameDef.game.moves!.fightReactionPass!;
		const ev = events();
		pass({ G, ctx: makeCtx('0'), playerID: '0', events: ev } as never);
		pass({ G, ctx: makeCtx('0'), playerID: '1', events: ev } as never);
		expect(G.fight?.phase).toBe('outcome');
		dismissFight({ G, ctx: makeCtx('0'), playerID: '1', events: ev } as never);
		expect(G.fight).toBeNull();
		expect(G.players['0'].wounds).toBe(1);
		expect(G.players['0'].hand.length).toBe(1);
		expect(G.pokerDeck.length).toBe(deckSizeBefore - 1);
		expect(G.players['1'].legendaryPoints).toBe(2);
	});

	it('resolveFightRobLoot transfers half gold and optional cattle', () => {
		const G = buildG({
			'0': basePlayer({ hand: [], gold: 10, turnActions: ['fight'], locationId: 'dk-3' }),
			'1': basePlayer({
				hand: pick(['2-clubs']),
				gold: 41,
				nuggets: 0,
				carriedCattle: { color: 'blue', face: CATTLE_LEGACY_DEFAULT_FACE },
				locationId: 'dk-3',
			}),
		});
		G.fight = makeFight({
			challengerId: '0',
			defenderId: '1',
			kind: 'rob',
			phase: 'rewardRob',
			outcome: 'challengerWins',
		});
		const ev = events();
		const r = resolveRob({ G, ctx: makeCtx('0'), playerID: '0', events: ev } as never, 'gold', true);
		expect(r).not.toBe(INVALID_MOVE);
		expect(G.fight?.phase).toBe('outcome');
		dismissFight({ G, ctx: makeCtx('0'), playerID: '0', events: ev } as never);
		expect(G.fight).toBeNull();
		expect(G.players['1'].gold).toBe(20);
		expect(G.players['0'].gold).toBe(31);
		expect(G.players['0'].carriedCattle).toEqual({ color: 'blue', face: CATTLE_LEGACY_DEFAULT_FACE });
		expect(G.players['1'].carriedCattle).toBeNull();
	});

	it('resolveFightRobLoot transfers half nuggets', () => {
		const G = buildG({
			'0': basePlayer({ hand: [], nuggets: 0, turnActions: ['fight'], locationId: 'dk-3' }),
			'1': basePlayer({ hand: pick(['2-clubs']), gold: 0, nuggets: 7, locationId: 'dk-3' }),
		});
		G.fight = makeFight({
			challengerId: '0',
			defenderId: '1',
			kind: 'rob',
			phase: 'rewardRob',
			outcome: 'challengerWins',
		});
		const ev = events();
		const r = resolveRob({ G, ctx: makeCtx('0'), playerID: '0', events: ev } as never, 'nuggets', false);
		expect(r).not.toBe(INVALID_MOVE);
		expect(G.fight?.phase).toBe('outcome');
		dismissFight({ G, ctx: makeCtx('0'), playerID: '0', events: ev } as never);
		expect(G.fight).toBeNull();
		expect(G.players['1'].nuggets).toBe(3);
		expect(G.players['0'].nuggets).toBe(4);
	});

	it('arrest in Red Falls jails to dk-9', () => {
		const c0 = pick(['7-diamonds'])[0]!;
		const G = buildG({
			'0': basePlayer({ hand: [], marshalPoints: 1, turnActions: ['fight'], locationId: 'rf-4' }),
			'1': basePlayer({
				hand: pick(['2-clubs']),
				locationId: 'rf-4',
				wantedPoints: 1,
				gold: 10,
				nuggets: 0,
			}),
		});
		G.fight = makeFight({
			challengerId: '0',
			defenderId: '1',
			kind: 'arrest',
			phase: 'defenderChoice',
			challengerCommittedCard: c0,
		});
		const ev = events();
		decline({ G, ctx: makeCtx('0'), playerID: '1', events: ev } as never);
		expect(G.players['1'].locationId).toBe('dk-9');
	});
});
