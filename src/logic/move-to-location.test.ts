import { describe, expect, it } from 'vitest';
import { INVALID_MOVE } from '@engine/client';
import { createStandardDeck } from '@engine/client';
import type { Ctx } from 'boardgame.io';
import { DEFAULT_MOVEMENT_POINTS, getShortestPathLength } from '../map/boardGraph';
import { BOARD_SPACES_BY_ID, BOARD_STARTING_SPACE_ID } from '../map/boardSpaces';
import { buildInitialCattlePiles } from './cattleTokens';
import { buildInitialFightDeck } from './fightCards';
import { buildInitialBoardNpcs, westernLegendsGameDef } from './game';
import type { WesternLegendsState } from './types';
import { GENERAL_STORE_BASE_ITEM_IDS, GENERAL_STORE_COPIES_PER_BASE_ITEM } from '../data/itemCards';

/** Darkrock Saloon — graph tests use dk-3 → mp-8 as a 2-edge path. */
const START = 'dk-3';
const MID = 'mp-8';
const DK4 = 'dk-4';
const DK5 = 'dk-5';

function basePlayer(
	overrides: Partial<WesternLegendsState['players'][string]>,
): WesternLegendsState['players'][string] {
	return {
		color: 'red',
		characterOffers: null,
		characterId: 'wl-02',
		locationId: START,
		movementPointsLeft: 0,
		gold: 50,
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
		ownedMountItemIds: [],
		ownedMiscItemIds: [],
		usedHeistThisTurn: false,
		turnWeaponItemId: null,
		turnMountItemId: null,
		needsTurnWeaponMountChoice: false,
		prospectMapRerollDice: null,
		whiskeyReactionAvailable: false,
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

function buildG(): WesternLegendsState {
	const pokerDeck = createStandardDeck();
	const initialStock = Object.fromEntries(
		GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]),
	);

	return {
		round: 0,
		turnOrderIndex: 0,
		players: {
			'0': basePlayer({}),
			'1': basePlayer({ locationId: BOARD_STARTING_SPACE_ID, color: 'blue' }),
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

type MoveToLocationFn = (ctx: { G: WesternLegendsState; ctx: Ctx; events?: unknown }, dest: string) => unknown;

function getMoveToLocation(): MoveToLocationFn {
	const m = westernLegendsGameDef.game.moves!.moveToLocation!;
	return (typeof m === 'function' ? m : m.move) as MoveToLocationFn;
}

const DK10 = 'dk-10';
const DK1 = 'dk-1';

describe('moveToLocation (move leg MP)', () => {
	const moveToLocation = getMoveToLocation();

	it('uses dk-3 → mp-8 as a 2 MP leg', () => {
		expect(getShortestPathLength(BOARD_SPACES_BY_ID, START, MID)).toBe(2);
	});

	it('one move slot can spend MP over multiple 1-edge steps (dk-5 → dk-10 → dk-1)', () => {
		expect(getShortestPathLength(BOARD_SPACES_BY_ID, DK5, DK10)).toBe(1);
		expect(getShortestPathLength(BOARD_SPACES_BY_ID, DK10, DK1)).toBe(1);

		const G = buildG();
		G.players['0'].locationId = DK5;
		const ctx = makeCtx('0');
		const ctxArg = { G, ctx } as Parameters<typeof moveToLocation>[0];

		expect(moveToLocation(ctxArg, DK10)).not.toBe(INVALID_MOVE);
		expect(G.players['0'].turnActions).toEqual(['move']);
		expect(G.players['0'].movementPointsLeft).toBe(DEFAULT_MOVEMENT_POINTS - 1);

		expect(moveToLocation(ctxArg, DK1)).not.toBe(INVALID_MOVE);
		expect(G.players['0'].turnActions).toEqual(['move']);
		expect(G.players['0'].movementPointsLeft).toBe(0);
	});

	it('allows two successive 2-MP moves on one turn with default mount (2 MP per leg)', () => {
		const end =
			Object.keys(BOARD_SPACES_BY_ID).find(
				(id) => id !== MID && getShortestPathLength(BOARD_SPACES_BY_ID, MID, id) === 2,
			) ?? null;
		expect(end, 'need a space 2 edges from mp-8').not.toBeNull();

		const G = buildG();
		const ctx = makeCtx('0');
		const ctxArg = { G, ctx } as Parameters<typeof moveToLocation>[0];

		expect(moveToLocation(ctxArg, MID)).not.toBe(INVALID_MOVE);
		expect(G.players['0'].locationId).toBe(MID);
		expect(G.players['0'].turnActions).toEqual(['move']);
		expect(G.players['0'].movementPointsLeft).toBe(0);

		expect(moveToLocation(ctxArg, end!)).not.toBe(INVALID_MOVE);
		expect(G.players['0'].locationId).toBe(end);
		expect(G.players['0'].turnActions).toEqual(['move', 'move']);
	});

	it('refreshes movement points to mount budget after a non-move action (location slot)', () => {
		const workForPay = westernLegendsGameDef.game.moves!.workForPay!;
		expect(getShortestPathLength(BOARD_SPACES_BY_ID, START, DK4)).toBe(1);

		const G = buildG();
		const ctx = makeCtx('0');
		const ctxArg = { G, ctx } as Parameters<typeof moveToLocation>[0];

		expect(moveToLocation(ctxArg, DK4)).not.toBe(INVALID_MOVE);
		expect(G.players['0'].locationId).toBe(DK4);
		expect(G.players['0'].movementPointsLeft).toBe(DEFAULT_MOVEMENT_POINTS - 1);

		expect(workForPay(ctxArg)).not.toBe(INVALID_MOVE);
		expect(G.players['0'].movementPointsLeft).toBe(DEFAULT_MOVEMENT_POINTS);
		expect(G.players['0'].turnActions).toEqual(['move', 'location']);
	});

	it('restores movement points when a discrete location action fails after taking the slot', () => {
		const heist = westernLegendsGameDef.game.moves!.heist!;
		expect(getShortestPathLength(BOARD_SPACES_BY_ID, DK4, DK5)).toBe(1);

		const G = buildG();
		G.players['0'].locationId = DK4;
		G.pokerDeck = [];
		G.pokerDiscard = [];
		const ctx = makeCtx('0');
		const ctxArg = { G, ctx } as Parameters<typeof moveToLocation>[0];

		expect(moveToLocation(ctxArg, DK5)).not.toBe(INVALID_MOVE);
		const mpAfterMove = DEFAULT_MOVEMENT_POINTS - 1;
		expect(G.players['0'].movementPointsLeft).toBe(mpAfterMove);

		expect(heist(ctxArg)).toBe(INVALID_MOVE);
		expect(G.players['0'].turnActions).toEqual(['move']);
		expect(G.players['0'].movementPointsLeft).toBe(mpAfterMove);
	});
});
