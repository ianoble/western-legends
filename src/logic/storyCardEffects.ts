import type { Ctx } from 'boardgame.io';
import type { WesternLegendsState } from './types';

/** Injected by {@link resolveStoriesAtEndOfTurn} in game.ts so this module stays free of circular imports. */
export type StoryResolutionApi = {
	grantMarshalPoints: (playerId: string, delta: number, logPid: string, reason: string) => void;
	grantWantedPoints: (playerId: string, delta: number, logPid: string, reason: string) => void;
	appendLog: (G: WesternLegendsState, actorId: string, message: string) => void;
};

/**
 * When a story card resolves (enough discs), apply printed rewards. Extend the `switch` as card definitions exist.
 */
export function applyStoryCardResolved(
	G: WesternLegendsState,
	_ctx: Ctx,
	cardId: string,
	actingPlayerId: string,
	api: StoryResolutionApi,
): void {
	switch (cardId) {
		default:
			break;
	}
}
