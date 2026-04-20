import type { WesternLegendsState } from '../logic/types';

const HISTORY_TAIL = 50;
const TRAIL_TAIL = 40;

/** JSON-serializable summary for GitHub / Discord bug reports (truncates secrets and large decks). */
export function summarizeWesternLegendsForBugReport(
	G: WesternLegendsState,
	viewerPlayerId: string | null,
): Record<string, unknown> {
	const players: Record<string, unknown> = {};
	for (const [id, p] of Object.entries(G.players ?? {})) {
		const isViewer = viewerPlayerId != null && id === viewerPlayerId;
		players[id] = {
			color: p.color,
			characterId: p.characterId,
			locationId: p.locationId,
			gold: p.gold,
			marshalPoints: p.marshalPoints,
			wantedPoints: p.wantedPoints,
			legendaryPoints: p.legendaryPoints,
			wounds: p.wounds,
			movementPointsLeft: p.movementPointsLeft,
			turnActions: p.turnActions,
			needsStartTurnIncomeChoice: p.needsStartTurnIncomeChoice,
			needsTurnWeaponMountChoice: p.needsTurnWeaponMountChoice,
			usedLivingLegendThisTurn: p.usedLivingLegendThisTurn,
			usedReputationSevenThisTurn: p.usedReputationSevenThisTurn,
			pendingReputationSevenReaction: p.pendingReputationSevenReaction,
			pendingSprintAfterMove: p.pendingSprintAfterMove,
			pendingWallopAfterMove: p.pendingWallopAfterMove,
			pendingCattleMarshalOrWanted: p.pendingCattleMarshalOrWanted,
			pendingBanditBountyChoice: p.pendingBanditBountyChoice,
			hand: isViewer ? p.hand : `[${p.hand.length} cards — hidden from snapshot]`,
		};
	}

	return {
		round: G.round,
		turnOrderIndex: G.turnOrderIndex,
		legendGoal: G.legendGoal,
		saloonRound: G.saloonRound,
		saloonReveal: G.saloonReveal,
		prospectReveal: G.prospectReveal,
		fight: G.fight,
		sheriffEncounter: G.sheriffEncounter,
		boardNpcs: G.boardNpcs,
		cattlePiles: G.cattlePiles,
		players,
		deckSizes: {
			pokerDeck: G.pokerDeck.length,
			pokerDiscard: G.pokerDiscard.length,
			storyDeckLeft: G.storyDeckLeft.length,
			storyDeckRight: G.storyDeckRight.length,
			storyDiscard: G.storyDiscard.length,
			fightDeck: G.fightDeck.length,
			fightDiscard: G.fightDiscard.length,
		},
		trailLogTail: G.gameLog.slice(-TRAIL_TAIL),
		moveHistoryTail: G.history.slice(-HISTORY_TAIL),
	};
}

export function formatBugReportMarkdown(payload: {
	generatedAt: string;
	pageUrl: string;
	gameId: string | null;
	matchID: string | null;
	playerID: string | null;
	userAgent: string;
	ctx: Record<string, unknown>;
	summary: Record<string, unknown>;
}): string {
	const body = JSON.stringify(payload, null, 2);
	return [
		'### Western Legends — debug bundle',
		'',
		'Paste under a bug report. Move-level audit is in `summary.moveHistoryTail`; narrative trail in `summary.trailLogTail`.',
		'',
		'```json',
		body,
		'```',
		'',
	].join('\n');
}
