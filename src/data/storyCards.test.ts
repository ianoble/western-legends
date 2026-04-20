import { describe, expect, it } from 'vitest';
import {
	ALL_STORY_CARD_IDS,
	STORY_BACK_IMAGE_PATHS,
	STORY_BACK_KINDS,
	STORY_CARD_FRONT_COUNT,
	buildStoryCardDeck,
	getStoryCardBackImageUrl,
	getStoryCardBackMeta,
	getStoryCardFrontImageUrl,
	getStoryCardFrontNumber,
	isStoryCatalogCardId,
	storyBackImageUrl,
	storyCardFrontImageUrl,
} from './storyCards';

describe('storyCards catalog', () => {
	it('has 4 back kinds with 10 ids each (40 total)', () => {
		expect(STORY_BACK_KINDS).toHaveLength(4);
		for (const row of STORY_BACK_KINDS) {
			expect(row.cardIds).toHaveLength(10);
		}
		expect(ALL_STORY_CARD_IDS).toHaveLength(40);
	});

	it('has no duplicate card ids', () => {
		const set = new Set(ALL_STORY_CARD_IDS);
		expect(set.size).toBe(40);
	});

	it('buildStoryCardDeck returns a 40-card permutation', () => {
		const d = buildStoryCardDeck();
		expect(d).toHaveLength(40);
		expect(new Set(d).size).toBe(40);
		for (const id of d) {
			expect(ALL_STORY_CARD_IDS).toContain(id);
		}
	});

	it('getStoryCardBackMeta resolves each catalog id', () => {
		for (const id of ALL_STORY_CARD_IDS) {
			const m = getStoryCardBackMeta(id);
			expect(m).toBeDefined();
			expect(m!.conditionSummary.length).toBeGreaterThan(0);
			expect(m!.imageUrl).toMatch(/^\/images\/story_card_0[1-4]b\.png$/);
			expect(m!.frontImageUrl).toMatch(/^\/images\/story_card_\d{2}a\.png$/);
			expect(getStoryCardFrontImageUrl(id)).toBe(m!.frontImageUrl);
			expect(getStoryCardBackImageUrl(id)).toBe(m!.imageUrl);
			expect(isStoryCatalogCardId(id)).toBe(true);
		}
		expect(getStoryCardBackMeta('story-unknown-01')).toBeUndefined();
		expect(isStoryCatalogCardId('story-unknown-01')).toBe(false);
	});

	it('maps printed fronts story_card_01a–40a in catalog order', () => {
		expect(getStoryCardFrontNumber('story-spend-01')).toBe(1);
		expect(getStoryCardFrontImageUrl('story-spend-01')).toBe('/images/story_card_01a.png');
		expect(getStoryCardFrontNumber('story-wild-10')).toBe(40);
		expect(getStoryCardFrontImageUrl('story-wild-10')).toBe('/images/story_card_40a.png');
		expect(STORY_CARD_FRONT_COUNT).toBe(40);
		expect(() => storyCardFrontImageUrl(0)).toThrow(RangeError);
		expect(() => storyCardFrontImageUrl(41)).toThrow(RangeError);
	});

	it('maps four back kinds to story_card_01b–04b images', () => {
		expect(STORY_BACK_IMAGE_PATHS.spend_80_town_single_action).toBe('/images/story_card_01b.png');
		expect(STORY_BACK_IMAGE_PATHS.gain_2_lp_single_action).toBe('/images/story_card_02b.png');
		expect(STORY_BACK_IMAGE_PATHS.gain_marshal_or_wanted_on_turn).toBe('/images/story_card_03b.png');
		expect(STORY_BACK_IMAGE_PATHS.end_turn_outside_town).toBe('/images/story_card_04b.png');
		for (const row of STORY_BACK_KINDS) {
			expect(storyBackImageUrl(row.backKind)).toBe(STORY_BACK_IMAGE_PATHS[row.backKind]);
		}
	});
});
