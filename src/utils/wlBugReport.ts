import type { WesternLegendsState } from '../logic/types';

const HISTORY_TAIL = 50;
const TRAIL_TAIL = 40;

/**
 * Same output shape as `JSON.stringify(value, null, space)` but replaces cyclic references
 * so bug-report bundles never throw (boardgame.io / Vue Proxies can introduce cycles).
 */
export function safeJsonStringify(value: unknown, space = 2): string {
	const seen = new WeakSet<object>();
	return JSON.stringify(
		value,
		(_k, v) => {
			if (typeof v === 'object' && v !== null) {
				if (seen.has(v as object)) return '[Circular]';
				seen.add(v as object);
			}
			return v;
		},
		space,
	);
}

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
			hand: isViewer ? p.hand : `[${p.hand?.length ?? 0} cards — hidden from snapshot]`,
		};
	}

	const pokerDeck = G.pokerDeck ?? [];
	const pokerDiscard = G.pokerDiscard ?? [];
	const storyDeckLeft = G.storyDeckLeft ?? [];
	const storyDeckRight = G.storyDeckRight ?? [];
	const storyDiscard = G.storyDiscard ?? [];
	const fightDeck = G.fightDeck ?? [];
	const fightDiscard = G.fightDiscard ?? [];
	const gameLog = G.gameLog ?? [];
	const history = G.history ?? [];

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
			pokerDeck: pokerDeck.length,
			pokerDiscard: pokerDiscard.length,
			storyDeckLeft: storyDeckLeft.length,
			storyDeckRight: storyDeckRight.length,
			storyDiscard: storyDiscard.length,
			fightDeck: fightDeck.length,
			fightDiscard: fightDiscard.length,
		},
		trailLogTail: gameLog.slice(-TRAIL_TAIL),
		moveHistoryTail: history.slice(-HISTORY_TAIL),
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
	const body = safeJsonStringify(payload, 2);
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
