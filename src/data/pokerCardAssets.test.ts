import { describe, expect, it } from 'vitest';
import { pokerCardImagePath } from './pokerCardAssets';

describe('pokerCardImagePath', () => {
	it('maps rank-suit ids to public filenames', () => {
		expect(pokerCardImagePath('10-hearts')).toBe('/images/poker_card_10h.png');
		expect(pokerCardImagePath('A-spades')).toBe('/images/poker_card_As.png');
		expect(pokerCardImagePath('2-diamonds')).toBe('/images/poker_card_2d.png');
		expect(pokerCardImagePath('Q-clubs')).toBe('/images/poker_card_Qc.png');
	});

	it('returns empty for invalid ids', () => {
		expect(pokerCardImagePath('')).toBe('');
		expect(pokerCardImagePath('nope')).toBe('');
		expect(pokerCardImagePath('10')).toBe('');
	});
});
