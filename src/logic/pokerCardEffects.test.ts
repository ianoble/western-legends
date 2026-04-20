import { createStandardDeck } from '@engine/client';
import { describe, expect, it } from 'vitest';
import { fightReactionPlayKind, POKER_CARD_EFFECT_BY_ID, pokerCardEffectHooks } from './pokerCardEffects';

describe('POKER_CARD_EFFECT_BY_ID', () => {
	it('has one entry per standard deck card', () => {
		const deck = createStandardDeck();
		expect(Object.keys(POKER_CARD_EFFECT_BY_ID).length).toBe(52);
		for (const c of deck) {
			expect(POKER_CARD_EFFECT_BY_ID[c.id]).toBeDefined();
			expect(pokerCardEffectHooks(c.id).length).toBeGreaterThan(0);
		}
	});

	it('Instincts has action and discard_trigger hooks', () => {
		const h = pokerCardEffectHooks('9-hearts');
		const kinds = h.map((x) => x.kind);
		expect(kinds).toContain('instincts_draw_three');
		expect(kinds).toContain('instincts_discard_draw_one');
	});
});

describe('fightReactionPlayKind', () => {
	it('classifies reaction-phase poker powers', () => {
		expect(fightReactionPlayKind('6-clubs')).toBe('stick_em_up');
		expect(fightReactionPlayKind('J-hearts')).toBe(null);
		expect(fightReactionPlayKind('Q-spades')).toBe(null);
		expect(fightReactionPlayKind('8-diamonds')).toBe('shootout');
		expect(fightReactionPlayKind('8-clubs')).toBe(null);
		expect(fightReactionPlayKind('K-hearts')).toBe(null);
		expect(fightReactionPlayKind('A-hearts')).toBe(null);
	});
});
