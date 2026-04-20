/**
 * Per-space rewards when advancing on Marshal / Wanted tracks (rulebook spaces 1–9).
 * Fill from the printed board; empty entries grant nothing beyond the point itself.
 *
 * **Past space 9:** each excess marshal/wanted point becomes +1 LP in `grantMarshalPoints` / `grantWantedPoints` (not stored here).
 */

export type ReputationTrackSpaceReward = {
	gold?: number;
	lp?: number;
	/** Draw this many poker cards from the deck (discard reshuffle when empty). */
	drawPoker?: number;
	/**
	 * Wanted space 1 — **Sheriff Active** reminder: the sheriff moves only while at least one player
	 * is on the wanted track (same rule as `moveSheriffToSpace` in game logic). This flag only adds the log line when entering the space.
	 */
	sheriffActive?: boolean;
};

function buildSlots(
	partial: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, ReputationTrackSpaceReward>>,
): Readonly<Record<number, ReputationTrackSpaceReward>> {
	const out: Record<number, ReputationTrackSpaceReward> = {};
	for (let i = 1; i <= 9; i++) {
		out[i] = partial[i as keyof typeof partial] ?? {};
	}
	return out;
}

/** Marshal track: rewards when entering each space (1–9). */
export const MARSHAL_TRACK_SPACE_REWARDS: Readonly<Record<number, ReputationTrackSpaceReward>> = buildSlots({
	1: { gold: 20 },
	2: { gold: 20 },
	3: { lp: 2 },
	4: { gold: 30 },
	5: { gold: 30 },
	6: { lp: 4 },
	7: { gold: 40 },
	8: { gold: 40 },
	9: { lp: 6 },
});

/** Wanted track: rewards when entering each space (1–9). */
export const WANTED_TRACK_SPACE_REWARDS: Readonly<Record<number, ReputationTrackSpaceReward>> = buildSlots({
	1: { sheriffActive: true },
	2: { drawPoker: 1 },
	4: { drawPoker: 1 },
	6: { drawPoker: 1 },
	8: { drawPoker: 1 },
});
