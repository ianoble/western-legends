import { describe, expect, it } from 'vitest';
import { INVALID_MOVE } from '@engine/client';
import { createStandardDeck } from '@engine/client';
import type { Ctx } from 'boardgame.io';
import { buildInitialCattlePiles } from './cattleTokens';
import { buildInitialFightDeck } from './fightCards';
import { buildInitialBoardNpcs, westernLegendsGameDef } from './game';
import type { WesternLegendsState } from './types';
import { GENERAL_STORE_BASE_ITEM_IDS, GENERAL_STORE_COPIES_PER_BASE_ITEM } from '../data/itemCards';
import { BOARD_STARTING_SPACE_ID } from '../map/boardSpaces';

/** Sunny Hills - Mine (`prospectGold`). */
const MINE_SPACE_ID = 'tr-1';

function basePlayer(
	overrides: Partial<WesternLegendsState['players'][string]>,
): WesternLegendsState['players'][string] {
	return {
		color: 'red',
		characterOffers: null,
		characterId: 'wl-02',
		locationId: BOARD_STARTING_SPACE_ID,
		movementPointsLeft: 3,
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

function buildMineG(): WesternLegendsState {
	const pokerDeck = createStandardDeck();
	const initialStock = Object.fromEntries(
		GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]),
	);

	return {
		round: 0,
		turnOrderIndex: 0,
		players: {
			'0': basePlayer({ locationId: MINE_SPACE_ID, color: 'red' }),
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

describe('prospectForGold + prospectReveal', () => {
	const prospect = westernLegendsGameDef.game.moves!.prospectForGold!;
	const dismiss = westernLegendsGameDef.game.moves!.dismissProspectReveal!;
	const minerMapReroll = westernLegendsGameDef.game.moves!.minerMapRerollProspect!;

	it('sets prospectReveal with two slots and summaries after a successful mine action', () => {
		const G = buildMineG();
		const ctx = makeCtx('0');
		const r = prospect({ G, ctx } as Parameters<typeof prospect>[0]);
		expect(r).not.toBe(INVALID_MOVE);
		expect(G.prospectReveal).not.toBeNull();
		expect(G.prospectReveal!.playerId).toBe('0');
		expect(G.prospectReveal!.slots).toHaveLength(2);
		expect(G.prospectReveal!.slots[0]!.slotIndex).toBe(0);
		expect(G.prospectReveal!.slots[1]!.slotIndex).toBe(1);
		expect(G.prospectReveal!.summaries.length).toBeGreaterThanOrEqual(2);
		const totalFaces = G.prospectReveal!.slots.reduce((n, s) => n + s.faces.length, 0);
		expect(G.prospectReveal!.summaries.length).toBe(totalFaces);
	});

	it('dismissProspectReveal clears state for the mining player only', () => {
		const G = buildMineG();
		const ctx = makeCtx('0');
		prospect({ G, ctx } as Parameters<typeof prospect>[0]);
		expect(G.prospectReveal).not.toBeNull();

		expect(dismiss({ G, ctx, playerID: '1' } as Parameters<typeof dismiss>[0])).toBe(INVALID_MOVE);
		expect(G.prospectReveal).not.toBeNull();

		const ok = dismiss({ G, ctx, playerID: '0' } as Parameters<typeof dismiss>[0]);
		expect(ok).not.toBe(INVALID_MOVE);
		expect(G.prospectReveal).toBeNull();
	});

	it('dismissProspectReveal clears prospectMapRerollDice when miner has Miners Map', () => {
		const G = buildMineG();
		G.players['0']!.ownedMiscItemIds = ['map'];
		const ctx = makeCtx('0');
		prospect({ G, ctx } as Parameters<typeof prospect>[0]);
		expect(G.players['0']!.prospectMapRerollDice).not.toBeNull();
		expect(G.players['0']!.prospectMapRerollDice!.length).toBeGreaterThan(0);

		dismiss({ G, ctx, playerID: '0' } as Parameters<typeof dismiss>[0]);
		expect(G.prospectReveal).toBeNull();
		expect(G.players['0']!.prospectMapRerollDice).toBeNull();
	});

	it('minerMapRerollProspect still works when prospect was the third discrete action this turn', () => {
		const G = buildMineG();
		G.players['0']!.ownedMiscItemIds = ['map'];
		G.players['0']!.turnActions = ['move', 'card'];
		const ctx = makeCtx('0');
		prospect({ G, ctx } as Parameters<typeof prospect>[0]);
		expect(G.players['0']!.turnActions.length).toBe(3);

		const rr = minerMapReroll({ G, ctx } as Parameters<typeof minerMapReroll>[0], 1);
		expect(rr).not.toBe(INVALID_MOVE);
		expect(G.players['0']!.prospectMapRerollDice).toBeNull();
		expect(G.players['0']!.turnActions.length).toBe(3);
	});

	it('minerMapRerollProspect updates prospectReveal summaries to match slot faces', () => {
		const G = buildMineG();
		G.players['0']!.ownedMiscItemIds = ['map'];
		const ctx = makeCtx('0');
		prospect({ G, ctx } as Parameters<typeof prospect>[0]);
		expect(G.prospectReveal).not.toBeNull();
		const actionsAfterProspect = G.players['0']!.turnActions.length;

		const rr = minerMapReroll({ G, ctx } as Parameters<typeof minerMapReroll>[0], 0);
		expect(rr).not.toBe(INVALID_MOVE);
		expect(G.players['0']!.prospectMapRerollDice).toBeNull();
		expect(G.players['0']!.turnActions.length).toBe(actionsAfterProspect);
		expect(G.prospectReveal).not.toBeNull();
		const totalFaces = G.prospectReveal!.slots.reduce((n, s) => n + s.faces.length, 0);
		expect(G.prospectReveal!.summaries.length).toBe(totalFaces);
	});

	it('validateMove blocks pass until mining summary is dismissed', () => {
		const G = buildMineG();
		const ctx = makeCtx('0');
		prospect({ G, ctx } as Parameters<typeof prospect>[0]);
		expect(G.prospectReveal).not.toBeNull();
		const vm = westernLegendsGameDef.validateMove!;
		const blocked = vm({ G, playerID: '0', currentPlayer: '0' }, 'pass');
		expect(blocked).toBe('Close the mining results summary first');
	});
});
