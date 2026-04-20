/**
 * Face art in `public/images/poker_card_{rank}{suit}.png`
 * (rank: A,2–9,10,J,Q,K — suit letter: h,d,c,s).
 */

const SUIT_LETTER: Record<string, string> = {
	hearts: 'h',
	diamonds: 'd',
	clubs: 'c',
	spades: 's',
};

/**
 * @param cardId Standard deck id (`rank-suit`, e.g. `10-hearts`, `A-spades`).
 * @returns Public URL path for Vite static asset, or empty string if invalid.
 */
export function pokerCardImagePath(cardId: string): string {
	const i = cardId.lastIndexOf('-');
	if (i <= 0) return '';
	const rank = cardId.slice(0, i);
	const suitKey = cardId.slice(i + 1);
	const suitLetter = SUIT_LETTER[suitKey];
	if (!suitLetter || rank.length === 0) return '';
	return `/images/poker_card_${rank}${suitLetter}.png`;
}
