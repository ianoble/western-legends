import { describe, expect, it, vi } from 'vitest';
import { INVALID_MOVE, createStandardDeck } from '@engine/client';
import type { Ctx } from 'boardgame.io';
import { banditNpcId } from '../map/boardSpaces';
import { buildInitialCattlePiles } from './cattleTokens';
import { buildInitialFightDeck } from './fightCards';
import { buildInitialBoardNpcs, spawnBanditOnSpaceIfAllowed, westernLegendsGameDef } from './game';
import type { FightCardFaceId } from './fightCards';
import type { FightState, WesternLegendsState } from './types';
import { GENERAL_STORE_BASE_ITEM_IDS, GENERAL_STORE_COPIES_PER_BASE_ITEM } from '../data/itemCards';

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
		locationId: 'cj-8',
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

const events = () => ({ setActivePlayers: vi.fn(), endStage: vi.fn(), endTurn: vi.fn() });

describe('spawnBanditOnSpaceIfAllowed', () => {
	it('returns false when a bandit is already on the space', () => {
		const G = buildG({
			'0': basePlayer({ hand: pick(['A-spades']), locationId: 'bh-a-1' }),
			'1': basePlayer({ hand: pick(['K-hearts']), locationId: 'dk-3' }),
		});
		expect(spawnBanditOnSpaceIfAllowed(G, 'bh-a-1')).toBe(false);
	});

	it('returns false when a player occupies the space', () => {
		const G = buildG({
			'0': basePlayer({ hand: pick(['A-spades']), locationId: 'sh-2' }),
			'1': basePlayer({ hand: pick(['K-hearts']), locationId: 'dk-3' }),
		});
		G.boardNpcs = G.boardNpcs.filter((n) => n.kind !== 'bandit' || n.spaceId !== 'sh-2');
		expect(spawnBanditOnSpaceIfAllowed(G, 'sh-2')).toBe(false);
	});
});

describe('Bandit fight — movement and flow', () => {
	const rawMoveTo = westernLegendsGameDef.game.moves!.moveToLocation!;
	const moveTo = (typeof rawMoveTo === 'function' ? rawMoveTo : rawMoveTo.move) as (
		ctx: unknown,
		dest: string,
	) => unknown;
	const chooseCard = westernLegendsGameDef.game.moves!.chooseBanditFightCard!;
	const chooseBounty = westernLegendsGameDef.game.moves!.chooseBanditBountyReward!;
	const dismissFight = westernLegendsGameDef.game.moves!.dismissFightOutcome!;
	const vm = westernLegendsGameDef.validateMove!;

	it('entering a bandit hideout ends movement and starts a bandit fight', () => {
		const G = buildG({
			'0': basePlayer({
				hand: pick(['A-spades', '2-clubs']),
				locationId: 'cj-8',
				movementPointsLeft: 0,
				turnActions: ['move'],
			}),
			'1': basePlayer({ hand: pick(['K-hearts', '3-clubs']), locationId: 'dk-3', color: 'blue' }),
		});
		const deckLenBefore = G.fightDeck.length;
		const ev = events();
		const r = moveTo({ G, ctx: makeCtx('0'), events: ev } as never, 'bh-a-1');
		expect(r).not.toBe(INVALID_MOVE);
		expect(G.players['0'].locationId).toBe('bh-a-1');
		expect(G.players['0'].movementPointsLeft).toBe(0);
		expect(G.fight).not.toBeNull();
		expect(G.fight!.kind).toBe('bandit');
		expect(G.fight!.challengerId).toBe('0');
		expect(G.fight!.defenderId).toBe('1');
		expect(G.fight!.npcFightCardOptions?.length).toBe(2);
		expect(G.fightDeck.length).toBe(deckLenBefore - 2);
	});

	it('validateMove rejects fightDefenderDecline for bandit fights', () => {
		const G = buildG({
			'0': basePlayer({ hand: pick(['A-spades']), locationId: 'bh-a-1' }),
			'1': basePlayer({ hand: pick(['K-hearts']), locationId: 'dk-3' }),
		});
		G.fight = {
			challengerId: '0',
			defenderId: '1',
			kind: 'bandit',
			phase: 'defenderChoice',
			startEffectQueue: [],
			startEffectQueueIndex: 0,
			challengerCommittedCard: pick(['7-diamonds'])[0]!,
			defenderCommittedCard: null,
			defenderDeclined: false,
			outcome: null,
			revealCompareSummary: null,
			reactionTurn: 'challenger',
			reactionConsecutivePasses: 0,
			banditNpcId: banditNpcId('bh-a-1'),
			npcFightCardOptions: ['fc-8', 'fc-3'],
			npcFightCardApplied: null,
			banditBountyMarshalBlocked: false,
		} as FightState;
		const v = vm({ G, playerID: '1', currentPlayer: '0' }, 'fightDefenderDecline');
		expect(v).not.toBe(true);
	});

	it('controller fight card then poker: fighter wins, bounty choice, bandit removed, cards return to deck', () => {
		const cFighter = pick(['A-spades'])[0]!;
		const cBandit = pick(['K-hearts'])[0]!;
		const G = buildG({
			'0': basePlayer({ hand: [], locationId: 'bh-a-1', wounds: 0 }),
			'1': basePlayer({ hand: [], locationId: 'dk-3', color: 'blue' }),
		});
		const bid = banditNpcId('bh-a-1');
		expect(G.boardNpcs.some((n) => n.id === bid)).toBe(true);

		const opt0: FightCardFaceId = 'fc-8';
		const opt1: FightCardFaceId = 'fc-3';
		G.fightDeck = buildInitialFightDeck().filter((id) => id !== opt0 && id !== opt1);
		expect(G.fightDeck.length).toBe(11);

		G.fight = {
			challengerId: '0',
			defenderId: '1',
			kind: 'bandit',
			phase: 'banditFightCard',
			startEffectQueue: [],
			startEffectQueueIndex: 0,
			challengerCommittedCard: cFighter,
			defenderCommittedCard: cBandit,
			defenderDeclined: false,
			outcome: null,
			revealCompareSummary: 'revealed',
			reactionTurn: 'challenger',
			reactionConsecutivePasses: 0,
			banditNpcId: bid,
			npcFightCardOptions: [opt0, opt1],
			npcFightCardApplied: null,
			banditBountyMarshalBlocked: false,
		};
		const ev = events();
		const r = chooseCard({ G, ctx: makeCtx('0'), playerID: '1', events: ev } as never, 0);
		expect(r).not.toBe(INVALID_MOVE);
		expect(G.fight?.phase).toBe('outcome');
		dismissFight({ G, ctx: makeCtx('0'), playerID: '0', events: ev } as never);
		expect(G.fight).toBeNull();
		expect(G.boardNpcs.some((n) => n.id === bid)).toBe(false);
		expect(G.players['0'].wounds).toBe(1);
		expect(G.players['0'].pendingBanditBountyChoice).toBe(true);
		expect(G.pokerDiscard.some((c) => c.id === cFighter.id)).toBe(true);
		expect(G.pokerDiscard.some((c) => c.id === cBandit.id)).toBe(true);
		expect(G.fightDeck.length).toBe(13);
		expect(new Set(G.fightDeck).size).toBe(13);

		const r2 = chooseBounty({ G, ctx: makeCtx('0'), playerID: '0', events: ev } as never, 'marshal');
		expect(r2).not.toBe(INVALID_MOVE);
		expect(G.players['0'].pendingBanditBountyChoice).toBeUndefined();
		expect(G.players['0'].marshalPoints).toBe(1);
	});

	it('fighter loses: wound+draw only on fighter, no bounty', () => {
		const cFighter = pick(['2-clubs'])[0]!;
		const cBandit = pick(['A-spades'])[0]!;
		const G = buildG({
			'0': basePlayer({ hand: [], locationId: 'bh-a-1', wounds: 0 }),
			'1': basePlayer({ hand: [], locationId: 'dk-3', color: 'blue' }),
		});
		const bid = banditNpcId('bh-a-1');
		const deckSize = G.pokerDeck.length;
		const o0: FightCardFaceId = 'fc-J';
		const o1: FightCardFaceId = 'fc-Q';
		G.fightDeck = buildInitialFightDeck().filter((id) => id !== o0 && id !== o1);
		G.fight = {
			challengerId: '0',
			defenderId: '1',
			kind: 'bandit',
			phase: 'banditFightCard',
			startEffectQueue: [],
			startEffectQueueIndex: 0,
			challengerCommittedCard: cFighter,
			defenderCommittedCard: cBandit,
			defenderDeclined: false,
			outcome: null,
			revealCompareSummary: 'revealed',
			reactionTurn: 'challenger',
			reactionConsecutivePasses: 0,
			banditNpcId: bid,
			npcFightCardOptions: [o0, o1],
			npcFightCardApplied: null,
			banditBountyMarshalBlocked: false,
		};
		const ev = events();
		chooseCard({ G, ctx: makeCtx('0'), playerID: '1', events: ev } as never, 1);
		expect(G.fight?.phase).toBe('outcome');
		dismissFight({ G, ctx: makeCtx('0'), playerID: '1', events: ev } as never);
		expect(G.fight).toBeNull();
		expect(G.fightDeck.length).toBe(13);
		expect(G.players['0'].wounds).toBe(1);
		expect(G.players['0'].gold).toBe(40);
		expect(G.players['0'].hand.length).toBe(2);
		expect(G.pokerDeck.length).toBe(deckSize - 2);
		expect(G.players['0'].pendingBanditBountyChoice).toBeFalsy();
		expect(G.players['1'].wounds).toBe(0);
		expect(G.boardNpcs.some((n) => n.id === bid)).toBe(false);
	});
});
