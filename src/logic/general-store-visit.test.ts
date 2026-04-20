import { describe, expect, it } from 'vitest';
import { INVALID_MOVE } from '@engine/client';
import { createStandardDeck } from '@engine/client';
import type { Ctx } from 'boardgame.io';
import { buildInitialCattlePiles } from './cattleTokens';
import { buildInitialFightDeck } from './fightCards';
import { buildInitialBoardNpcs, westernLegendsGameDef } from './game';
import type { WesternLegendsState } from './types';
import { GENERAL_STORE_BASE_ITEM_IDS, GENERAL_STORE_COPIES_PER_BASE_ITEM } from '../data/itemCards';
import { DEFAULT_MOVEMENT_POINTS } from '../map/boardGraph';

const STORE_A = 'dk-6';
const STORE_B = 'dk-7';

function getMoveToLocation(): (
	ctx: { G: WesternLegendsState; ctx: Ctx; events?: unknown },
	dest: string,
) => unknown {
	const m = westernLegendsGameDef.game.moves!.moveToLocation!;
	return (typeof m === 'function' ? m : m.move) as (
		ctx: { G: WesternLegendsState; ctx: Ctx; events?: unknown },
		dest: string,
	) => unknown;
}

function basePlayer(
	overrides: Partial<WesternLegendsState['players'][string]>,
): WesternLegendsState['players'][string] {
	return {
		color: 'red',
		characterOffers: null,
		characterId: 'wl-02',
		locationId: STORE_A,
		movementPointsLeft: 2,
		gold: 100,
		legendaryPoints: 0,
		wounds: 0,
		nuggets: 0,
		carriedCattle: null,
		wantedPoints: 0,
		marshalPoints: 0,
		hand: [],
		turnActions: [],
		needsStartTurnIncomeChoice: false,
		ownedWeaponItemIds: [],
		ownedMountItemIds: ['mule'],
		ownedMiscItemIds: [],
		usedHeistThisTurn: false,
		turnWeaponItemId: null,
		turnMountItemId: 'mule',
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

function buildG(playerOverrides: Partial<WesternLegendsState['players'][string]> = {}): WesternLegendsState {
	const pokerDeck = createStandardDeck();
	const initialStock = Object.fromEntries(
		GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]),
	);

	return {
		round: 0,
		turnOrderIndex: 0,
		players: {
			'0': basePlayer(playerOverrides),
			'1': basePlayer({ locationId: 'dk-3', color: 'blue' }),
		},
		pokerDeck,
		pokerDiscard: [],
		saloonRound: null,
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

describe('General Store — one location slot per visit, immediate weapon equip', () => {
	const buyFromGeneralStore = westernLegendsGameDef.game.moves!.buyFromGeneralStore!;
	const moveToLocation = getMoveToLocation();

	it('consumes only one location turn slot for two misc purchases on the same hex', () => {
		const G = buildG();
		const ctx = makeCtx('0');
		const arg = { G, ctx } as Parameters<typeof buyFromGeneralStore>[0];

		expect(buyFromGeneralStore(arg, 'whiskey')).not.toBe(INVALID_MOVE);
		expect(buyFromGeneralStore(arg, 'map')).not.toBe(INVALID_MOVE);

		expect(G.players['0'].turnActions).toEqual(['location']);
		expect(G.players['0'].generalStoreVisitPaidLocationId).toBe(STORE_A);
		expect(G.players['0'].ownedMiscItemIds).toContain('whiskey');
		expect(G.players['0'].ownedMiscItemIds).toContain('map');
	});

	it('sets turnWeaponItemId when buying a weapon', () => {
		const G = buildG();
		const ctx = makeCtx('0');
		const arg = { G, ctx } as Parameters<typeof buyFromGeneralStore>[0];

		expect(buyFromGeneralStore(arg, 'revolver')).not.toBe(INVALID_MOVE);
		expect(G.players['0'].turnWeaponItemId).toBe('revolver');
		expect(G.players['0'].ownedWeaponItemIds).toContain('revolver');
		expect(G.players['0'].turnActions).toEqual(['location']);
	});

	it('clears visit after move; next store hex purchase consumes another location slot', () => {
		const G = buildG();
		const ctx = makeCtx('0');
		const buyArg = { G, ctx } as Parameters<typeof buyFromGeneralStore>[0];
		const moveArg = { G, ctx } as Parameters<typeof moveToLocation>[0];

		expect(buyFromGeneralStore(buyArg, 'hat')).not.toBe(INVALID_MOVE);
		expect(G.players['0'].generalStoreVisitPaidLocationId).toBe(STORE_A);
		expect(G.players['0'].turnActions).toEqual(['location']);

		expect(moveToLocation(moveArg, STORE_B)).not.toBe(INVALID_MOVE);
		expect(G.players['0'].generalStoreVisitPaidLocationId).toBeNull();
		expect(G.players['0'].locationId).toBe(STORE_B);

		expect(buyFromGeneralStore(buyArg, 'whiskey')).not.toBe(INVALID_MOVE);
		expect(G.players['0'].turnActions).toEqual(['location', 'move', 'location']);
	});

	it('refreshes movement points to equipped mount budget after purchase (stale remainder)', () => {
		const G = buildG({
			movementPointsLeft: 1,
			ownedMountItemIds: [],
			turnMountItemId: null,
		});
		const ctx = makeCtx('0');
		const arg = { G, ctx } as Parameters<typeof buyFromGeneralStore>[0];

		expect(buyFromGeneralStore(arg, 'hat')).not.toBe(INVALID_MOVE);
		expect(G.players['0'].movementPointsLeft).toBe(DEFAULT_MOVEMENT_POINTS);
	});

	it('refreshes movement points after buying a mustang (4 MP)', () => {
		const G = buildG({
			movementPointsLeft: 1,
			ownedMountItemIds: [],
			turnMountItemId: null,
		});
		const ctx = makeCtx('0');
		const arg = { G, ctx } as Parameters<typeof buyFromGeneralStore>[0];

		expect(buyFromGeneralStore(arg, 'mustang')).not.toBe(INVALID_MOVE);
		expect(G.players['0'].turnMountItemId).toBe('mustang');
		expect(G.players['0'].movementPointsLeft).toBe(4);
	});

	it('refreshes movement points on second purchase same visit when slot was already paid', () => {
		const G = buildG({
			movementPointsLeft: 1,
			ownedMountItemIds: [],
			turnMountItemId: null,
		});
		const ctx = makeCtx('0');
		const arg = { G, ctx } as Parameters<typeof buyFromGeneralStore>[0];

		expect(buyFromGeneralStore(arg, 'hat')).not.toBe(INVALID_MOVE);
		G.players['0'].movementPointsLeft = 1;

		expect(buyFromGeneralStore(arg, 'whiskey')).not.toBe(INVALID_MOVE);
		expect(G.players['0'].turnActions).toEqual(['location']);
		expect(G.players['0'].movementPointsLeft).toBe(DEFAULT_MOVEMENT_POINTS);
	});
});
