import { shuffle } from '@engine/client';

/** Printed MIB deck card ids (10 cards). */
export const MAN_IN_BLACK_CARD_IDS = ['mib-01', 'mib-02', 'mib-03', 'mib-04', 'mib-05', 'mib-06', 'mib-07', 'mib-08', 'mib-09', 'mib-10'] as const;

export type ManInBlackCardId = (typeof MAN_IN_BLACK_CARD_IDS)[number];

/** Bandit hideout targets from cards 4–9 (graph ids). */
export const MIB_HIDEOUT_MESITO_A = 'bh-a-2';
export const MIB_HIDEOUT_SUNNY_A = 'bh-a-1';
export const MIB_HIDEOUT_SUNNY_B = 'bh-b-1';
export const MIB_HIDEOUT_DIXON_B = 'bh-b-2';
export const MIB_HIDEOUT_SPIKE_C = 'bh-c-1';
export const MIB_HIDEOUT_CLIFF_C = 'bh-c-2';

/** Red Falls Cabaret (card 10). */
export const MIB_RED_FALLS_CABARET_SPACE_ID = 'rf-4';

export const MIB_BANDIT_SPAWN_C_SPACE_IDS = ['bh-c-1', 'bh-c-2'] as const;

export function buildManInBlackDeck(): string[] {
	return shuffle([...MAN_IN_BLACK_CARD_IDS]);
}

export function isManInBlackCatalogCardId(id: string): id is ManInBlackCardId {
	return (MAN_IN_BLACK_CARD_IDS as readonly string[]).includes(id);
}

/** Short UI copy for the board overlay (aligned with {@link dispatchManInBlackCard} in game logic). */
export const MIB_CARD_OVERLAY_COPY: Record<ManInBlackCardId, { title: string; body: string }> = {
	'mib-01': {
		title: 'Challenge the legendary leader',
		body: 'The Man in Black joins the leader — the leader must duel you or lose the duel automatically.',
	},
	'mib-02': {
		title: 'Challenge the legendary leader',
		body: 'Same as mib-01: the MIB is placed with the leader; the leader faces a duel challenge.',
	},
	'mib-03': {
		title: 'Robbery at the leader',
		body: 'The MIB joins the legendary leader — the leader must resolve a rob interaction with you.',
	},
	'mib-04': {
		title: 'Mesito bandit hideout',
		body: 'MIB moves to the Mesito hideout. If a bandit was there: the bandit is removed, each player loses $10 (already applied to your gold), and the MIB gains 1 legendary point.',
	},
	'mib-05': {
		title: 'Sunny bandit hideout',
		body: 'MIB moves to a Sunny Side hideout. If a bandit was there: both lose $10, extra bandits may spawn on C hideouts, MIB gains a legendary point.',
	},
	'mib-06': {
		title: 'Sunny Hills hideout',
		body: 'Place the Man In Black in Bandit Hideout B in Sunny Hills. If there is a Bandit there, remove that bandit. The Man In Black gails 1LP, and each player without a wound gains 1 wound.',
	},
	'mib-07': {
		title: 'Dixon bandit hideout',
		body: 'If a bandit was at this hideout, each player with no wounds takes 1 wound (MIB gains a legendary point).',
	},
	'mib-08': {
		title: 'Spike bandit hideout',
		body: 'If a bandit was removed here, both players must discard one visible poker card in turn order.',
	},
	'mib-09': {
		title: 'Cliff bandit hideout',
		body: 'If a bandit was removed here, both players must discard one visible poker card in turn order.',
	},
	'mib-10': {
		title: 'Red Falls Cabaret',
		body: 'MIB moves to Red Falls. Players in town may resolve a two-card poker showdown; the MIB can win ties.',
	},
};

export function mibOverlayCopyForCardId(cardId: string): { title: string; body: string } {
	if (isManInBlackCatalogCardId(cardId)) return MIB_CARD_OVERLAY_COPY[cardId];
	return {
		title: 'Man in Black card',
		body: 'Resolve this card using the side panel.',
	};
}
