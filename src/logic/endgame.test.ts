import { describe, expect, it, vi } from 'vitest';
import {
	buildInitialBoardNpcs,
	getGameOverResult,
	performEndGameScoring,
	progressEndgameAfterPass,
} from './game';
import type { WesternLegendsState } from './types';
import { GENERAL_STORE_BASE_ITEM_IDS, GENERAL_STORE_COPIES_PER_BASE_ITEM } from '../data/itemCards';
import { buildInitialCattlePiles } from './cattleTokens';
import { buildInitialFightDeck } from './fightCards';
import { BOARD_STARTING_SPACE_ID } from '../map/boardSpaces';
import { createStandardDeck } from '@engine/client';

function minimalG(numPlayers: number): WesternLegendsState {
	const pokerDeck = createStandardDeck();
	const initialStock = Object.fromEntries(
		GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]),
	);
	const players: WesternLegendsState['players'] = {};
	for (let i = 0; i < numPlayers; i++) {
		const pid = String(i);
		players[pid] = {
			color: 'red',
			characterOffers: null,
			characterId: 'wl-02',
			locationId: BOARD_STARTING_SPACE_ID,
			movementPointsLeft: 0,
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
			legendaryGoalTokens: 0,
			pvpFightTargetsThisTurn: [],
		};
	}
	return {
		round: 0,
		turnOrderIndex: 0,
		players,
		pokerDeck,
		pokerDiscard: [],
		saloonRound: null,
		saloonReveal: null,
		fight: null,
		prospectReveal: null,
		sheriffEncounter: null,
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
		goalsVariant: false,
		endgamePhase: 'none',
		endgameTriggeredByPlayerId: null,
		endgamePartialPassesRemaining: 0,
		endgameFinalPassesRemaining: 0,
		history: [],
	};
}

describe('performEndGameScoring (extended)', () => {
	it('adds floor(gold/60) LP and subtracts wounds', () => {
		const G = minimalG(2);
		G.players['0']!.gold = 125;
		G.players['0']!.wounds = 2;
		G.players['0']!.legendaryPoints = 10;
		performEndGameScoring(G);
		expect(G.players['0']!.legendaryPoints).toBe(10 + Math.floor(125 / 60) - 2);
	});

	it('adds upgrade LP from owned weapon/mount upgrades', () => {
		const G = minimalG(2);
		G.players['0']!.ownedMountItemIds = ['mustang_upgrade'];
		G.players['0']!.ownedWeaponItemIds = ['revolver_upgrade'];
		G.players['0']!.legendaryPoints = 0;
		performEndGameScoring(G);
		expect(G.players['0']!.legendaryPoints).toBe(2 + 1);
	});

	it('goalsVariant adds legendaryGoalTokens as LP', () => {
		const G = minimalG(2);
		G.goalsVariant = true;
		G.players['0']!.legendaryGoalTokens = 4;
		G.players['0']!.legendaryPoints = 5;
		performEndGameScoring(G);
		expect(G.players['0']!.legendaryPoints).toBe(5 + 4);
	});
});

describe('getGameOverResult (tiebreaks)', () => {
	it('prefers higher MP+WP when LP ties', () => {
		const G = minimalG(2);
		G.players['0']!.legendaryPoints = 20;
		G.players['0']!.marshalPoints = 2;
		G.players['0']!.wantedPoints = 0;
		G.players['1']!.legendaryPoints = 20;
		G.players['1']!.marshalPoints = 3;
		G.players['1']!.wantedPoints = 0;
		G.endGameScored = true;
		expect(getGameOverResult(G)).toEqual({ winner: '1' });
	});

	it('then prefers more nuggets', () => {
		const G = minimalG(2);
		for (const pid of ['0', '1']) {
			const p = G.players[pid]!;
			p.legendaryPoints = 15;
			p.marshalPoints = 1;
			p.wantedPoints = 1;
		}
		G.players['0']!.nuggets = 2;
		G.players['1']!.nuggets = 5;
		G.endGameScored = true;
		expect(getGameOverResult(G)).toEqual({ winner: '1' });
	});

	it('then prefers fewer wounds', () => {
		const G = minimalG(2);
		for (const pid of ['0', '1']) {
			const p = G.players[pid]!;
			p.legendaryPoints = 12;
			p.marshalPoints = 0;
			p.wantedPoints = 0;
			p.nuggets = 3;
		}
		G.players['0']!.wounds = 2;
		G.players['1']!.wounds = 1;
		G.endGameScored = true;
		expect(getGameOverResult(G)).toEqual({ winner: '1' });
	});

	it('returns sharedWinners when all tiebreakers match', () => {
		const G = minimalG(3);
		for (const pid of ['0', '1', '2']) {
			const p = G.players[pid]!;
			p.legendaryPoints = 10;
			p.marshalPoints = 1;
			p.wantedPoints = 0;
			p.nuggets = 4;
			p.wounds = 0;
		}
		G.endGameScored = true;
		expect(getGameOverResult(G)).toEqual({ sharedWinners: ['0', '1', '2'] });
	});
});

function peEvents() {
	const endTurn = vi.fn();
	const setActivePlayers = vi.fn();
	return { endTurn, setActivePlayers };
}

describe('progressEndgameAfterPass (epilogue)', () => {
	it('2p: trigger arms finish_round with one partial pass then final_round', () => {
		const G = minimalG(2);
		G.legendGoal = 20;
		G.players['0']!.legendaryPoints = 20;
		const { endTurn, setActivePlayers } = peEvents();
		progressEndgameAfterPass(G, { numPlayers: 2, playOrder: ['0', '1'], currentPlayer: '0' }, { endTurn, setActivePlayers });
		expect(G.endgamePhase).toBe('finish_round');
		expect(G.endgamePartialPassesRemaining).toBe(1);
		expect(endTurn).toHaveBeenCalledWith();

		endTurn.mockClear();
		progressEndgameAfterPass(G, { numPlayers: 2, playOrder: ['0', '1'], currentPlayer: '1' }, { endTurn, setActivePlayers });
		expect(G.endgamePhase).toBe('final_round');
		expect(G.endgameFinalPassesRemaining).toBe(2);
		expect(endTurn).toHaveBeenCalledWith({ next: '0' });
	});

	it('1p: trigger skips finish_round and starts final_round immediately', () => {
		const G = minimalG(1);
		G.legendGoal = 10;
		G.players['0']!.legendaryPoints = 10;
		const { endTurn, setActivePlayers } = peEvents();
		progressEndgameAfterPass(G, { numPlayers: 1, playOrder: ['0'], currentPlayer: '0' }, { endTurn, setActivePlayers });
		expect(G.endgamePhase).toBe('final_round');
		expect(G.endgameFinalPassesRemaining).toBe(1);
		expect(endTurn).toHaveBeenCalledWith({ next: '0' });
	});

	it('final_round: last pass sets done', () => {
		const G = minimalG(2);
		G.endgamePhase = 'final_round';
		G.endgameFinalPassesRemaining = 1;
		const endTurn = vi.fn();
		progressEndgameAfterPass(G, { numPlayers: 2, playOrder: ['0', '1'], currentPlayer: '1' }, { endTurn });
		expect(G.endgamePhase).toBe('done');
		expect(endTurn).toHaveBeenCalledWith();
	});

	it('below legend goal does not arm epilogue', () => {
		const G = minimalG(2);
		G.legendGoal = 99;
		G.players['0']!.legendaryPoints = 5;
		const { endTurn, setActivePlayers } = peEvents();
		progressEndgameAfterPass(G, { numPlayers: 2, playOrder: ['0', '1'], currentPlayer: '0' }, { endTurn, setActivePlayers });
		expect(G.endgamePhase).toBe('none');
		expect(endTurn).toHaveBeenCalledWith();
	});
});
