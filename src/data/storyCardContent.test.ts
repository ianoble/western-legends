import { describe, expect, it } from 'vitest';
import { ALL_STORY_CARD_IDS, getStoryCardFrontNumber } from './storyCards';
import {
	ALL_STORY_CARD_CONTENT,
	STORY_CARD_CONTENT_COUNT,
	formatStoryCardForLog,
	getStoryCardByCardId,
	getStoryCardByFrontNumber,
} from './storyCardContent';

describe('storyCardContent', () => {
	it('has 40 cards with ids 01–40', () => {
		expect(ALL_STORY_CARD_CONTENT).toHaveLength(40);
		for (let i = 0; i < 40; i++) {
			const id = String(i + 1).padStart(2, '0');
			expect(ALL_STORY_CARD_CONTENT[i]!.id).toBe(id);
		}
	});

	it('round-trips every catalog cardId with getStoryCardByFrontNumber', () => {
		for (const cardId of ALL_STORY_CARD_IDS) {
			const n = getStoryCardFrontNumber(cardId);
			expect(n).toBeDefined();
			const byId = getStoryCardByCardId(cardId);
			const byN = getStoryCardByFrontNumber(n!);
			expect(byId).toBeDefined();
			expect(byN).toBe(byId);
			expect(byId!.title.length).toBeGreaterThan(0);
		}
	});

	it('spot-check: story-spend-01 is THE GOOD BOOK', () => {
		const c = getStoryCardByCardId('story-spend-01');
		expect(c?.title).toBe('THE GOOD BOOK');
	});

	it('returns undefined for out-of-range front numbers and unknown ids', () => {
		expect(getStoryCardByFrontNumber(0)).toBeUndefined();
		expect(getStoryCardByFrontNumber(41)).toBeUndefined();
		expect(getStoryCardByCardId('story-unknown-01')).toBeUndefined();
	});

	it('matches STORY_CARD_FRONT_COUNT', () => {
		expect(STORY_CARD_CONTENT_COUNT).toBe(40);
	});

	it('formatStoryCardForLog uses title or falls back to id', () => {
		expect(formatStoryCardForLog('story-spend-01')).toBe('THE GOOD BOOK');
		expect(formatStoryCardForLog('not-a-story-card')).toBe('not-a-story-card');
	});
});
