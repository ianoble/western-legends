import { describe, expect, it } from 'vitest';
import { createStandardDeck } from '@engine/client';
import {
	buildInitialBoardNpcs,
	isMoveToLocationUndoableAfterBanditApproach,
	isUseCardActionUndoableAfterManhuntEncounter,
} from './game';
import type { FightState, WesternLegendsState } from './types';
import { GENERAL_STORE_BASE_ITEM_IDS, GENERAL_STORE_COPIES_PER_BASE_ITEM } from '../data/itemCards';
import { buildInitialCattlePiles } from './cattleTokens';
import { buildInitialFightDeck } from './fightCards';

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

function emptyStock(): Record<string, number> {
	return Object.fromEntries(GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]));
}

function minimalG(over: Partial<WesternLegendsState> = {}): WesternLegendsState {
	return {
		round: 0,
		turnOrderIndex: 0,
		players: {},
		pokerDeck: createStandardDeck(),
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
		...over,
	};
}

describe('isMoveToLocationUndoableAfterBanditApproach', () => {
	it('is true after a plain map move (no overlays)', () => {
		expect(isMoveToLocationUndoableAfterBanditApproach(minimalG())).toBe(true);
	});

	it('is false when saloon or prospect UI is open', () => {
		expect(isMoveToLocationUndoableAfterBanditApproach(minimalG({ saloonRound: {} as WesternLegendsState['saloonRound'] }))).toBe(
			false,
		);
		expect(isMoveToLocationUndoableAfterBanditApproach(minimalG({ prospectReveal: {} as WesternLegendsState['prospectReveal'] }))).toBe(
			false,
		);
	});

	it('is true for bandit fight in startEffects or challengerCard', () => {
		expect(
			isMoveToLocationUndoableAfterBanditApproach(
				minimalG({
					fight: makeFight({
						kind: 'bandit',
						phase: 'startEffects',
						challengerId: '0',
						defenderId: '1',
					}),
				}),
			),
		).toBe(true);
		expect(
			isMoveToLocationUndoableAfterBanditApproach(
				minimalG({
					fight: makeFight({
						kind: 'bandit',
						phase: 'challengerCard',
						challengerId: '0',
						defenderId: '1',
					}),
				}),
			),
		).toBe(true);
	});

	it('is false after defenderChoice and for non-bandit fights', () => {
		expect(
			isMoveToLocationUndoableAfterBanditApproach(
				minimalG({
					fight: makeFight({
						kind: 'bandit',
						phase: 'defenderChoice',
						challengerId: '0',
						defenderId: '1',
					}),
				}),
			),
		).toBe(false);
		expect(
			isMoveToLocationUndoableAfterBanditApproach(
				minimalG({
					fight: makeFight({
						kind: 'duel',
						phase: 'challengerCard',
						challengerId: '0',
						defenderId: '1',
					}),
				}),
			),
		).toBe(false);
	});
});

describe('isUseCardActionUndoableAfterManhuntEncounter', () => {
	it('is true for chooseTarget or discard with pending discards', () => {
		expect(
			isUseCardActionUndoableAfterManhuntEncounter(
				minimalG({
					sheriffEncounter: {
						phase: 'chooseTarget',
						spaceId: 'x',
						wantedPlayerIds: ['0', '1'],
						moverId: '0',
						arrestTargetId: null,
						pendingDiscardPlayerIds: [],
					},
				}),
			),
		).toBe(true);
		expect(
			isUseCardActionUndoableAfterManhuntEncounter(
				minimalG({
					sheriffEncounter: {
						phase: 'discard',
						spaceId: 'x',
						wantedPlayerIds: ['1'],
						moverId: '0',
						arrestTargetId: '1',
						pendingDiscardPlayerIds: ['1'],
					},
				}),
			),
		).toBe(true);
	});

	it('is false with no encounter or empty pending discard queue', () => {
		expect(isUseCardActionUndoableAfterManhuntEncounter(minimalG())).toBe(false);
		expect(
			isUseCardActionUndoableAfterManhuntEncounter(
				minimalG({
					sheriffEncounter: {
						phase: 'discard',
						spaceId: 'x',
						wantedPlayerIds: ['1'],
						moverId: '0',
						arrestTargetId: '1',
						pendingDiscardPlayerIds: [],
					},
				}),
			),
		).toBe(false);
	});
});
