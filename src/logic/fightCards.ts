import { shuffle } from '@engine/client';
import type { Rank, StandardCard } from '@engine/client';

/**
 * Fight card deck (13 cards) — used when resolving encounters such as heists and NPC Bandit fights.
 *
 * **Designer:** Cards are read and applied by the player controlling the Bandit. On the physical cards,
 * **"You"** is the Bandit; **"the other player"** is the seat fighting the Bandit. (Sheriff / heist may use
 * analogous NPC-controller wording when those flows are implemented.)
 */
export const FIGHT_CARD_FACE_IDS = [
	'fc-2',
	'fc-3',
	'fc-4',
	'fc-5',
	'fc-6',
	'fc-7',
	'fc-8',
	'fc-9',
	'fc-10',
	'fc-J',
	'fc-Q',
	'fc-K',
	'fc-A',
] as const;

export type FightCardFaceId = (typeof FIGHT_CARD_FACE_IDS)[number];

/** Short labels for UI / logs. */
export const FIGHT_CARD_FACE_LABELS: Record<FightCardFaceId, string> = {
	'fc-2': '+1 wound, −1 LP (other player)',
	'fc-3': '+2 wounds (other player)',
	'fc-4': '+1 wound, discard 1 poker (other player)',
	'fc-5': '+1 wound; no MP choice if they beat a bandit (other player)',
	'fc-6': '+1 wound, cannot be canceled (other player)',
	'fc-7': '1 wound or discard 1 random poker — they choose (other player)',
	'fc-8': '+1 wound (other player)',
	'fc-9': 'Discard 1 poker or −$10; no MP choice if they beat a bandit (other player)',
	'fc-10': 'You (Bandit) may cancel fight & restart; other draws 1 poker; reshuffle drawn cards under deck',
	'fc-J': '+$10 (other player)',
	'fc-Q': 'Draw 1 poker (other player)',
	'fc-K': '+1 LP (other player)',
	'fc-A': '+1 LP or +1 Marshal or +1 Wanted — they choose (other player)',
};

/** Text as printed on the cards (all caps). */
export const FIGHT_CARD_FACE_RULES: Record<FightCardFaceId, string> = {
	'fc-2': 'THE OTHER PLAYER IN THIS FIGHT GAINS 1 WOUND AND LOSES 1LP.',
	'fc-3': 'THE OTHER PLAYER IN THIS FIGHT GAINS 2 WOUNDS.',
	'fc-4': 'THE OTHER PLAYER IN THIS FIGHT GAINS 1 WOUND AND DISCARDS 1 POKER CARD.',
	'fc-5':
		'THE OTHER PLAYER IN THIS FIGHT GAINS 1 WOUND. IF THAT PLAYER DEFEATS A BANDIT IN THIS FIGHT, THEY CANNOT CHOOSE TO GAIN MARSHAL POINTS. (THEY CAN STILL GAIN LP)',
	'fc-6': 'THE OTHER PLAYER IN THIS FIGHT GAINS 1 WOUND. THIS WOUND CANNOT BE CANCELED.',
	'fc-7': 'THE OTHER PLAYER IN THIS FIGHT GAINS 1 WOUND OR DISCARDS 1 RANDOM POKER CARD.',
	'fc-8': 'THE OTHER PLAYER IN THIS FIGHT GAINS 1 WOUND.',
	'fc-9':
		'THE OTHER PLAYER IN THIS FIGHT DISCARDS 1 POKER CARD OR LOSES $10. IF THAT PLAYER DEFEATS A BANDIT IN THIS FIGHT, THEY CANNOT CHOOSE TO GAIN MARSHAL POINTS. (THEY CAN STILL GAIN LP)',
	'fc-10':
		'YOU MAY IMMEDIATELY CANCEL THIS FIGHT AND INITIATE ANOTHER FIGHT. IF YOU DO, THE OTHER PLAYER DRAWS 1 POKER CARD. PLACE THIS FIGHT CARD AND ANY OTHERS YOU DREW BENEATH THE DECK IN RANDOM ORDER, THEN DRAW NEW FIGHT CARDS.',
	'fc-J': 'THE OTHER PLAYER IN THIS FIGHT GAINS $10.',
	'fc-Q': 'THE OTHER PLAYER IN THIS FIGHT DRAWS 1 POKER CARD.',
	'fc-K': 'THE OTHER PLAYER IN THIS FIGHT GAINS 1LP.',
	'fc-A': 'THE OTHER PLAYER IN THIS FIGHT GAINS 1LP, 1 MARSHAL POINT, OR 1 WANTED POINT.',
};

const RANK_FILE: Record<FightCardFaceId, string> = {
	'fc-2': '2',
	'fc-3': '3',
	'fc-4': '4',
	'fc-5': '5',
	'fc-6': '6',
	'fc-7': '7',
	'fc-8': '8',
	'fc-9': '9',
	'fc-10': '10',
	'fc-J': 'J',
	'fc-Q': 'Q',
	'fc-K': 'K',
	'fc-A': 'A',
};

export const FIGHT_CARD_IMAGE_PATHS: Record<FightCardFaceId, string> = Object.fromEntries(
	FIGHT_CARD_FACE_IDS.map((id) => [id, `/images/fight_card_${RANK_FILE[id]}.png`]),
) as Record<FightCardFaceId, string>;

export function buildInitialFightDeck(): FightCardFaceId[] {
	return shuffle([...FIGHT_CARD_FACE_IDS]);
}

/** Higher index = stronger fight card for MIB “highest of three” resolution. */
export function compareFightCardFaces(a: FightCardFaceId, b: FightCardFaceId): number {
	return FIGHT_CARD_FACE_IDS.indexOf(a) - FIGHT_CARD_FACE_IDS.indexOf(b);
}

export function highestOfThreeFightCardFaces(
	t: readonly [FightCardFaceId, FightCardFaceId, FightCardFaceId],
): FightCardFaceId {
	let best = t[0]!;
	for (let i = 1; i < 3; i++) {
		const c = t[i]!;
		if (compareFightCardFaces(c, best) > 0) best = c;
	}
	return best;
}

const FIGHT_FACE_TO_RANK: Record<FightCardFaceId, Rank> = {
	'fc-2': '2',
	'fc-3': '3',
	'fc-4': '4',
	'fc-5': '5',
	'fc-6': '6',
	'fc-7': '7',
	'fc-8': '8',
	'fc-9': '9',
	'fc-10': '10',
	'fc-J': 'J',
	'fc-Q': 'Q',
	'fc-K': 'K',
	'fc-A': 'A',
};

/**
 * Synthetic poker card for comparing a player’s fight play to the MIB’s fight-deck card (spades tiebreak).
 */
export function fightCardFaceToSyntheticPokerCard(face: FightCardFaceId): StandardCard {
	const rank = FIGHT_FACE_TO_RANK[face];
	return {
		id: `mib-synth-${face}`,
		rank,
		suit: 'spades',
	};
}

/** Placeholder MIB deck until real cards are cataloged. */
export function buildStubManInBlackDeck(): string[] {
	return shuffle(['mib-stub-1', 'mib-stub-2', 'mib-stub-3', 'mib-stub-4', 'mib-stub-5', 'mib-stub-6']);
}
