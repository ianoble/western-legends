import { isCardHidden, type Card, type StandardCard, type VisibleCard } from '@engine/client';

export type PokerCardCatalogEntry = {
	/** Optional display name from the printed card / CSV “Card Name”. */
	name?: string;
	/** Printed rules; use blank lines for paragraph breaks in the tooltip. */
	text?: string;
};

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

const ALL_SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RED: Suit[] = ['hearts', 'diamonds'];
const BLACK: Suit[] = ['clubs', 'spades'];

function cardIds(rank: string, suits: readonly Suit[]): string[] {
	return suits.map((s) => `${rank}-${s}`);
}

function add(map: Partial<Record<string, PokerCardCatalogEntry>>, ids: string[], entry: PokerCardCatalogEntry): void {
	for (const id of ids) {
		map[id] = entry;
	}
}

/** Keyed by standard deck id (`rank-suit`, e.g. `Q-hearts`). */
export const POKER_CARD_ABILITY: Partial<Record<string, PokerCardCatalogEntry>> = (() => {
	const M: Partial<Record<string, PokerCardCatalogEntry>> = {};

	add(M, cardIds('2', RED), {
		name: 'Cheat',
		text: 'If this card is played in a game of poker, you may treat this card as though it is any value.',
	});
	add(M, cardIds('2', BLACK), {
		name: 'Saddle Up',
		text: 'Action: Move to any town space.',
	});
	add(M, cardIds('3', ALL_SUITS), {
		name: 'Sprint',
		text: 'Reaction: After you move, place this from your hand to move 2 additional spaces.',
	});
	add(M, cardIds('4', ALL_SUITS), {
		name: 'Manhunt',
		text: 'Move the Sheriff up to 3 spaces. If you are the Marshal or Wanted player, gain 1 LP.',
	});
	add(M, cardIds('5', ALL_SUITS), {
		name: 'Payday',
		text: 'Action: Gain $30.',
	});
	add(M, cardIds('6', ALL_SUITS), {
		name: 'Stick Em Up',
		text: 'Reaction: After cards are revealed in a fight, play this from hand to decrease the value of a card played against you by 2.',
	});
	add(M, cardIds('7', ALL_SUITS), {
		name: 'Reputation',
		text: 'Reaction: After you gain any amount of Marshal or Wanted points on your turn, play this from your hand to gain 1 LP. You may only play 1 Reputation per turn.',
	});
	add(M, cardIds('8', RED), {
		name: 'Shootout',
		text: 'Bonus: If this card is played in a fight, you may immediately cancel the results of that fight and initiate a new fight.',
	});
	add(M, cardIds('8', BLACK), {
		name: 'Wallop',
		text: 'Reaction: After you end your move action in a space with another player, play this card from hand to give another player in your space 1 wound. Look at that player’s hand.',
	});
	add(M, cardIds('9', ALL_SUITS), {
		name: 'Instincts',
		text: 'Action: Draw 3 poker cards.\n\nBonus: If you discard this card for any reason other than discarding down to your hand size at the end of the turn, draw 1 poker card.',
	});
	add(M, cardIds('10', BLACK), {
		name: 'Fools Gold',
		text: 'Bonus: This card is considered a gold nugget for all actions and effects.',
	});
	/** Printed list gave ability only for red tens; using a short title for the tooltip. */
	add(M, cardIds('10', RED), {
		name: 'Lady Luck',
		text: 'Bonus: If this card is played in a game of poker, choose one: Gain $30 or draw 1 poker card. If you lose, gain both.',
	});
	add(M, cardIds('J', ALL_SUITS), {
		name: 'Bulletproof',
		text: 'Bonus: If this card is played in a fight, cancel any wounds you would gain. Lose 1 wound.',
	});
	add(M, cardIds('Q', ALL_SUITS), {
		name: 'Quickdraw',
		text: 'Bonus: If this card is played in a fight against a Bandit, Guard, or the Sheriff, you may cancel the effect on the fight card played.',
	});
	add(M, cardIds('K', ALL_SUITS), {
		name: 'Determination',
		text: 'Action: Gain 2 actions.',
	});
	add(M, cardIds('A', ALL_SUITS), {
		name: 'Living Legend',
		text: 'Action: Gain 1 Marshal point or 1 Wanted point.',
	});

	return M;
})();

const SUIT_LABEL: Record<string, string> = {
	hearts: 'Hearts',
	diamonds: 'Diamonds',
	clubs: 'Clubs',
	spades: 'Spades',
};

function defaultTitle(card: StandardCard): string {
	const suit = SUIT_LABEL[card.suit] ?? card.suit;
	return `${card.rank} of ${suit}`;
}

/** Tooltip lines: bold first line (title), then body paragraphs or a placeholder. */
export function getPokerCardAbilityLines(card: Card): string[] {
	if (isCardHidden(card)) {
		return ['Hidden card'];
	}
	const v = card as StandardCard;
	const id = (card as VisibleCard).id;
	const entry = POKER_CARD_ABILITY[id];
	const title = entry?.name?.trim() || defaultTitle(v);
	const lines: string[] = [title];
	const body = entry?.text?.trim();
	if (body) {
		for (const para of body.split(/\n\s*\n/)) {
			const t = para.trim();
			if (t) lines.push(t);
		}
	} else {
		lines.push('Printed ability not catalogued yet.');
	}
	return lines;
}
