import { describe, expect, it } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { applyStoryCardResolved, type StoryResolutionApi } from './storyCardEffects';
import {
	buildInitialBoardNpcs,
} from './game';
import { buildInitialCattlePiles } from './cattleTokens';
import { buildInitialFightDeck } from './fightCards';
import { createStandardDeck } from '@engine/client';
import { BOARD_STARTING_SPACE_ID } from '../map/boardSpaces';
import { GENERAL_STORE_BASE_ITEM_IDS, GENERAL_STORE_COPIES_PER_BASE_ITEM } from '../data/itemCards';
import { grantLegendaryPointsForStory } from './game';
import type { WesternLegendsState } from './types';

function minimalG(): WesternLegendsState {
	const pokerDeck = createStandardDeck();
	const initialStock = Object.fromEntries(
		GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]),
	);
	return {
		round: 0,
		turnOrderIndex: 0,
		players: {
			'0': {
				color: 'red',
				characterOffers: null,
				characterId: 'wl-02',
				locationId: BOARD_STARTING_SPACE_ID,
				movementPointsLeft: 0,
				gold: 50,
				legendaryPoints: 2,
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
			},
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
		storyInPlay: [null, null],
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

describe('applyStoryCardResolved', () => {
	it('grants +1 LP to each contributor for story-spend-03 (The Widow)', () => {
		const granted: { pid: string; d: number }[] = [];
		const api: StoryResolutionApi = {
			grantMarshalPoints: () => {},
			grantWantedPoints: () => {},
			grantLegendaryPoints: (pid, d) => granted.push({ pid, d }),
			appendLog: () => {},
		};
		applyStoryCardResolved(
			{} as WesternLegendsState,
			{} as Ctx,
			{
				row: { cardId: 'story-spend-03', discs: 2, discSlotPlayerIds: ['0', '1', null] },
				slotIndex: 0,
				needDiscs: 2,
				contributors: ['0', '1'],
				actingPlayerId: '0',
			},
			api,
		);
		expect(granted).toEqual([
			{ pid: '0', d: 1 },
			{ pid: '1', d: 1 },
		]);
	});

	it('no-op for unimplemented card id with contributors', () => {
		const granted: { pid: string; d: number }[] = [];
		const api: StoryResolutionApi = {
			grantMarshalPoints: () => {},
			grantWantedPoints: () => {},
			grantLegendaryPoints: (pid, d) => granted.push({ pid, d }),
			appendLog: () => {},
		};
		applyStoryCardResolved(
			{} as WesternLegendsState,
			{} as Ctx,
			{
				row: { cardId: 'story-spend-01', discs: 2, discSlotPlayerIds: ['0', '1'] },
				slotIndex: 0,
				needDiscs: 2,
				contributors: ['0', '1'],
				actingPlayerId: '0',
			},
			api,
		);
		expect(granted).toHaveLength(0);
	});

	it('no LP when contributor list is empty (supported card)', () => {
		const granted: { pid: string; d: number }[] = [];
		const api: StoryResolutionApi = {
			grantMarshalPoints: () => {},
			grantWantedPoints: () => {},
			grantLegendaryPoints: (pid, d) => granted.push({ pid, d }),
			appendLog: () => {},
		};
		applyStoryCardResolved(
			{} as WesternLegendsState,
			{} as Ctx,
			{
				row: { cardId: 'story-spend-03', discs: 2, discSlotPlayerIds: [null, null, null] },
				slotIndex: 0,
				needDiscs: 2,
				contributors: [],
				actingPlayerId: '0',
			},
			api,
		);
		expect(granted).toHaveLength(0);
	});

	it('integration: grantLegendaryPointsForStory from game updates LP and log', () => {
		const G = minimalG();
		grantLegendaryPointsForStory(G, '0', 1, '0', 'story: THE WIDOW');
		expect(G.players['0']!.legendaryPoints).toBe(3);
		expect(G.gameLog.some((e) => e.message.includes('THE WIDOW') && e.message.includes('+1 LP'))).toBe(true);
	});
});
