import { describe, expect, it, vi } from 'vitest';
import { createStandardDeck } from '@engine/client';
import type { Ctx } from 'boardgame.io';
import { getSheriffOfficeSpaceId, NPC_SHERIFF_ID } from '../map/boardSpaces';
import { buildInitialCattlePiles } from './cattleTokens';
import { buildInitialFightDeck } from './fightCards';
import { buildInitialBoardNpcs, grantWantedPoints, isSheriffActive, moveSheriffToSpace, westernLegendsGameDef } from './game';
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

function makeCtx(currentPlayer: string, numPlayers = 2): Ctx {
	const order = Array.from({ length: numPlayers }, (_, i) => String(i));
	return {
		numPlayers,
		playOrder: order,
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
		sheriffEncounter: null,
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

describe('isSheriffActive', () => {
	it('is false when no player is wanted', () => {
		const G = buildG({
			'0': basePlayer({ hand: pick(['2-clubs', '3-clubs']), locationId: 'dk-3', wantedPoints: 0 }),
		});
		expect(isSheriffActive(G)).toBe(false);
	});

	it('is true when any player has wanted', () => {
		const G = buildG({
			'0': basePlayer({ hand: pick(['2-clubs', '3-clubs']), locationId: 'dk-3', wantedPoints: 1 }),
		});
		expect(isSheriffActive(G)).toBe(true);
	});
});

describe('validateMove — wanted cannot enter sheriff hex', () => {
	it('rejects moveToLocation onto the sheriff NPC space for wanted players', () => {
		const office = getSheriffOfficeSpaceId('darkrock');
		const G = buildG({
			'0': basePlayer({
				hand: pick(['2-clubs', '3-clubs', '4-clubs']),
				locationId: 'dk-0',
				movementPointsLeft: 6,
				wantedPoints: 1,
			}),
		});
		const sh = G.boardNpcs.find((n) => n.id === NPC_SHERIFF_ID);
		expect(sh).toBeDefined();
		sh!.spaceId = office;
		const v = westernLegendsGameDef.validateMove!(
			{ G, playerID: '0', currentPlayer: '0' },
			'moveToLocation',
			office,
		);
		expect(v).toBe('Wanted players cannot move onto the sheriff');
	});
});

describe('wanted + sheriff hex', () => {
	it('becoming wanted while on the sheriff space does not start an encounter', () => {
		const office = getSheriffOfficeSpaceId('darkrock');
		const G = buildG({
			'0': basePlayer({
				hand: pick(['2-clubs', '3-clubs']),
				locationId: office,
				wantedPoints: 0,
			}),
		});
		const sh = G.boardNpcs.find((n) => n.id === NPC_SHERIFF_ID)!;
		sh.spaceId = office;
		grantWantedPoints(G, '0', 1, '0', 'test');
		expect(G.players['0'].wantedPoints).toBe(1);
		expect(G.players['0'].locationId).toBe(office);
		expect(G.sheriffEncounter).toBeNull();
		expect(G.fight).toBeNull();
	});
});

describe('stripSecretInfo — sheriff fight cards', () => {
	it('hides sheriffFightCardOptions from the wanted player during sheriffFightCard', () => {
		const quad: readonly [FightCardFaceId, FightCardFaceId, FightCardFaceId, FightCardFaceId] = [
			'fc-2',
			'fc-3',
			'fc-4',
			'fc-5',
		];
		const G = buildG({
			'0': basePlayer({ hand: pick(['H2', 'H3']), wantedPoints: 1 }),
			'1': basePlayer({ hand: pick(['D2', 'D3']) }),
		});
		const f: FightState = {
			challengerId: '0',
			defenderId: '1',
			kind: 'sheriffArrest',
			phase: 'sheriffFightCard',
			startEffectQueue: [],
			startEffectQueueIndex: 0,
			challengerCommittedCard: null,
			defenderCommittedCard: null,
			defenderDeclined: false,
			outcome: null,
			revealCompareSummary: 'x',
			reactionTurn: 'challenger',
			reactionConsecutivePasses: 0,
			sheriffFightCardOptions: quad,
			sheriffFightCardApplied: null,
		};
		G.fight = f;
		const forWanted = westernLegendsGameDef.stripSecretInfo!(G, '0') as WesternLegendsState;
		expect(forWanted.fight?.sheriffFightCardOptions).toBeUndefined();
		const forController = westernLegendsGameDef.stripSecretInfo!(G, '1') as WesternLegendsState;
		expect(forController.fight?.sheriffFightCardOptions?.length).toBe(4);
	});
});

describe('moveSheriffToSpace encounter', () => {
	it('with one wanted and no visible poker to discard, skips discard phase and does not start fight if wanted cannot play poker', () => {
		const shared = 'cj-8';
		const deck = buildInitialFightDeck();
		const G = buildG({
			'0': basePlayer({
				hand: [{ hidden: true }, { hidden: true }],
				locationId: shared,
				wantedPoints: 1,
			}),
			'1': basePlayer({ hand: pick(['2-diamonds', '3-diamonds']), locationId: 'dk-0' }),
		});
		G.fightDeck = [...deck];
		const beforeDeck = G.fightDeck.length;
		const sh = G.boardNpcs.find((n) => n.kind === 'sheriff')!;
		sh.spaceId = 'dk-0';
		const ctx = makeCtx('1');
		moveSheriffToSpace(G, ctx, events() as never, shared, '1');
		expect(G.sheriffEncounter).toBeNull();
		expect(G.fight).toBeNull();
		expect(G.fightDeck.length).toBe(beforeDeck);
	});

	it('enters discard phase when wanted has visible cards to discard', () => {
		const shared = 'cj-8';
		const deck = buildInitialFightDeck();
		const G = buildG({
			'0': basePlayer({
				hand: pick(['2-clubs', '3-clubs']),
				locationId: shared,
				wantedPoints: 1,
			}),
			'1': basePlayer({ hand: pick(['2-diamonds', '3-diamonds']), locationId: 'dk-0' }),
		});
		G.fightDeck = [...deck];
		const sh = G.boardNpcs.find((n) => n.kind === 'sheriff')!;
		sh.spaceId = 'dk-0';
		const ctx = makeCtx('1');
		moveSheriffToSpace(G, ctx, events() as never, shared, '1');
		expect(G.sheriffEncounter?.phase).toBe('discard');
		expect(G.sheriffEncounter?.pendingDiscardPlayerIds).toEqual(['0']);
		expect(G.fight).toBeNull();
	});
});
