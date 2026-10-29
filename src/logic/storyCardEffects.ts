import type { Ctx } from 'boardgame.io';
import { getStoryCardByCardId } from '../data/storyCardContent';
import type { StoryInPlayEntry, WesternLegendsState } from './types';

/** Injected by {@link resolveStoriesAtEndOfTurn} in game.ts so this module stays free of circular imports. */
export type StoryResolutionApi = {
	grantMarshalPoints: (playerId: string, delta: number, logPid: string, reason: string) => void;
	grantWantedPoints: (playerId: string, delta: number, logPid: string, reason: string) => void;
	grantLegendaryPoints: (playerId: string, delta: number, logPid: string, reason: string) => void;
	appendLog: (G: WesternLegendsState, actorId: string, message: string) => void;
};

/** Context for one resolving story card (enough story discs at end of pass; printed front was face-down until now). */
export type StoryCardResolutionContext = {
	row: StoryInPlayEntry;
	slotIndex: 0 | 1;
	needDiscs: number;
	contributors: string[];
	actingPlayerId: string;
};

/**
 * Printed "gain 1LP" to each contributor; optional "may …" text on the same card is not automated yet.
 * Catalog ids: front 3, 6, 18, 25 — see `story_cards.json` titles The Widow, High Noon, Presidential Visit, Tribes of the Mesa.
 */
const STORY_CATALOG_GAIN_ONE_LP_TO_EACH_CONTRIBUTOR: readonly string[] = [
	'story-spend-03',
	'story-spend-06',
	'story-lp-08',
	'story-rep-05',
];

/**
 * When a story card resolves (enough discs), apply printed rewards. Extend with more `cardId` handling as needed.
 */
export function applyStoryCardResolved(
	G: WesternLegendsState,
	_ctx: Ctx,
	context: StoryCardResolutionContext,
	api: StoryResolutionApi,
): void {
	const { row, actingPlayerId, contributors } = context;
	const cardId = row.cardId;
	const logReasonBase = `story: ${getStoryCardByCardId(cardId)?.title ?? cardId}`;

	if (STORY_CATALOG_GAIN_ONE_LP_TO_EACH_CONTRIBUTOR.includes(cardId)) {
		if (contributors.length === 0) return;
		for (const pid of contributors) {
			api.grantLegendaryPoints(pid, 1, actingPlayerId, logReasonBase);
		}
	}
}
