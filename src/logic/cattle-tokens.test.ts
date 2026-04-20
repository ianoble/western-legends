import { describe, expect, it } from 'vitest';
import { INVALID_MOVE } from '@engine/client';
import type { Ctx } from 'boardgame.io';
import { CATTLE_TOKEN_FACE_IDS, type WesternLegendsState } from './types';
import { buildInitialCattlePiles } from './cattleTokens';
import { buildInitialFightDeck } from './fightCards';
import { buildInitialBoardNpcs, westernLegendsGameDef } from './game';
import { GENERAL_STORE_BASE_ITEM_IDS, GENERAL_STORE_COPIES_PER_BASE_ITEM } from '../data/itemCards';
import { createStandardDeck } from '@engine/client';

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

function minimalPlayer(
	overrides: Partial<WesternLegendsState['players'][string]>,
): WesternLegendsState['players'][string] {
	return {
		color: 'red',
		characterOffers: null,
		characterId: 'wl-02',
		locationId: 'mp-2',
		movementPointsLeft: 3,
		gold: 40,
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
		generalStoreVisitPaidLocationId: null,
		...overrides,
	};
}

function buildRustleG(): WesternLegendsState {
	const pokerDeck = createStandardDeck();
	const initialStock = Object.fromEntries(
		GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]),
	);
	return {
		round: 0,
		turnOrderIndex: 0,
		players: {
			'0': minimalPlayer({
				locationId: 'mp-2',
				carriedCattle: { color: 'blue', face: 'cattle-lp1' },
				legendaryPoints: 2,
				needsStartTurnIncomeChoice: false,
				needsTurnWeaponMountChoice: false,
			}),
			'1': minimalPlayer({ locationId: 'dk-3', color: 'blue' }),
		},
		pokerDeck,
		pokerDiscard: [],
		saloonRound: null,
		saloonReveal: null,
		prospectReveal: null,
		fight: null,
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

describe('cattle token piles', () => {
	const acquireCattle = westernLegendsGameDef.game.moves!.acquireCattle!;
	const chooseTrack = westernLegendsGameDef.game.moves!.chooseCattleTrackReward!;

	it('setup shuffles eight faces per pile', () => {
		const setup = westernLegendsGameDef.game.setup!;
		const G = setup({
			ctx: {
				numPlayers: 2,
				playOrder: ['0', '1'],
				playOrderPos: 0,
				currentPlayer: '0',
				turn: 0,
				round: 0,
				phase: 'chooseCharacter',
			} as Ctx,
		});
		expect(G.cattlePiles.green).toHaveLength(8);
		expect(G.cattlePiles.blue).toHaveLength(8);
		const gset = new Set(G.cattlePiles.green);
		const bset = new Set(G.cattlePiles.blue);
		for (const id of CATTLE_TOKEN_FACE_IDS) {
			expect(gset.has(id)).toBe(true);
			expect(bset.has(id)).toBe(true);
		}
	});

	it('rustle applies token face after wanted/gold (e.g. +1 LP)', () => {
		const G = buildRustleG();
		const lpBefore = G.players['0'].legendaryPoints;
		const ctx = makeCtx('0');
		const r = acquireCattle({ G, ctx } as Parameters<typeof acquireCattle>[0]);
		expect(r).not.toBe(INVALID_MOVE);
		expect(G.players['0'].carriedCattle).toBeNull();
		expect(G.players['0'].legendaryPoints).toBe(lpBefore + 1);
		expect(G.players['0'].wantedPoints).toBeGreaterThan(0);
	});

	it('marshal-or-wanted face requires chooseCattleTrackReward', () => {
		const G = buildRustleG();
		G.players['0'].carriedCattle = { color: 'blue', face: 'cattle-marshal-or-wanted' };
		G.players['0'].legendaryPoints = 0;
		const ctx = makeCtx('0');
		const r = acquireCattle({ G, ctx } as Parameters<typeof acquireCattle>[0]);
		expect(r).not.toBe(INVALID_MOVE);
		expect(G.players['0'].pendingCattleMarshalOrWanted).toBe(true);
		// Rustle already put this seat on the wanted track; marshal reward is disallowed.
		expect(
			chooseTrack({ G, ctx, playerID: '0' } as Parameters<typeof chooseTrack>[0], 'marshal'),
		).toBe(INVALID_MOVE);
		const rWanted = chooseTrack({ G, ctx, playerID: '0' } as Parameters<typeof chooseTrack>[0], 'wanted');
		expect(rWanted).not.toBe(INVALID_MOVE);
		expect(G.players['0'].pendingCattleMarshalOrWanted).toBeUndefined();
		expect(G.players['0'].wantedPoints).toBeGreaterThan(0);
	});

	it('marshal-or-wanted: +1 Marshal when not wanted', () => {
		const G = buildRustleG();
		G.players['0'].pendingCattleMarshalOrWanted = true;
		G.players['0'].wantedPoints = 0;
		G.players['0'].marshalPoints = 0;
		const ctx = makeCtx('0');
		expect(chooseTrack({ G, ctx, playerID: '0' } as Parameters<typeof chooseTrack>[0], 'marshal')).not.toBe(
			INVALID_MOVE,
		);
		expect(G.players['0'].pendingCattleMarshalOrWanted).toBeUndefined();
		expect(G.players['0'].marshalPoints).toBe(1);
	});
});
