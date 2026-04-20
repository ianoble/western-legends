import { describe, expect, it, vi } from 'vitest';
import { INVALID_MOVE } from '@engine/client';
import { createStandardDeck } from '@engine/client';
import type { Ctx } from 'boardgame.io';
import { buildInitialCattlePiles } from './cattleTokens';
import { buildInitialFightDeck } from './fightCards';
import { buildInitialBoardNpcs, westernLegendsGameDef } from './game';
import type { WesternLegendsState } from './types';
import { GENERAL_STORE_BASE_ITEM_IDS, GENERAL_STORE_COPIES_PER_BASE_ITEM } from '../data/itemCards';
import { POKER_ANTE_GOLD, SALOON_HOUSE_ADDS_TO_POT } from './types';

function pick(ids: string[]) {
	const deck = createStandardDeck();
	const m = new Map(deck.map((c) => [c.id, c]));
	return ids.map((id) => m.get(id)!);
}

function basePlayer(
	hand: WesternLegendsState['players'][string]['hand'],
	gold: number,
	locationId: string,
): WesternLegendsState['players'][string] {
	return {
		color: 'red' as const,
		characterOffers: null,
		characterId: 'wl-02',
		locationId,
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
		generalStoreVisitPaidLocationId: null,
	};
}

function makeCtx(): Ctx {
	return {
		numPlayers: 3,
		playOrder: ['0', '1', '2'],
		playOrderPos: 0,
		currentPlayer: '0',
		turn: 0,
		round: 0,
		phase: 'play',
	} as Ctx;
}

function buildJoinPhaseState(): WesternLegendsState {
	const flop = pick(['8-spades', '9-diamonds', 'J-clubs']);
	const used = new Set(flop.map((c) => c.id));
	const pokerDeck = createStandardDeck().filter((c) => !used.has(c.id));
	const initialStock = Object.fromEntries(
		GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]),
	);

	return {
		round: 0,
		turnOrderIndex: 0,
		players: {
			'0': basePlayer([], 40, 'dk-3'),
			'1': basePlayer([], 40, 'dk-4'),
			'2': basePlayer([], 40, 'dk-5'),
		},
		pokerDeck,
		pokerDiscard: [],
		saloonRound: {
			activePlayerId: '0',
			cityId: 'darkrock',
			flop,
			potGold: SALOON_HOUSE_ADDS_TO_POT + POKER_ANTE_GOLD,
			pendingPlayerIds: ['1', '2'],
			joinedPlayerIds: ['0'],
			tieBreakCandidateIds: null,
			dealerShowdown: null,
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
	} satisfies WesternLegendsState;
}

describe('Saloon join / skip (activePlayers + endStage)', () => {
	const skipSaloon = westernLegendsGameDef.game.moves!.skipSaloon!;

	it('pending seat may skipSaloon while not currentPlayer; calls endStage', () => {
		const G = buildJoinPhaseState();
		const endStage = vi.fn();
		const setActivePlayers = vi.fn();
		const ctx = makeCtx();

		const r = skipSaloon({ G, ctx, playerID: '1', events: { endStage, setActivePlayers } } as never);
		expect(r).not.toBe(INVALID_MOVE);
		expect(G.saloonRound!.pendingPlayerIds).toEqual(['2']);
		expect(endStage).toHaveBeenCalledTimes(1);
	});

	it('reject skipSaloon for host (not in pending)', () => {
		const G = buildJoinPhaseState();
		const ctx = makeCtx();
		const r = skipSaloon({
			G,
			ctx,
			playerID: '0',
			events: { endStage: vi.fn(), setActivePlayers: vi.fn() },
		} as never);
		expect(r).toBe(INVALID_MOVE);
	});
});
