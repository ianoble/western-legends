import { describe, expect, it } from 'vitest';
import { contributorsForResolvedStoryRow } from './storyContributors';
import type { StoryInPlayEntry } from './types';

function row(partial: Partial<StoryInPlayEntry> & Pick<StoryInPlayEntry, 'cardId' | 'discs'>): StoryInPlayEntry {
	return {
		cardId: partial.cardId,
		discs: partial.discs,
		discSlotPlayerIds: partial.discSlotPlayerIds,
	};
}

describe('contributorsForResolvedStoryRow', () => {
	it('returns unique contributors in order for the first N slots (need=2)', () => {
		const s = row({
			cardId: 'x',
			discs: 2,
			discSlotPlayerIds: ['0', '1', null],
		});
		expect(contributorsForResolvedStoryRow(s, 2)).toEqual(['0', '1']);
	});

	it('dedupes the same id in two slots (need=2)', () => {
		const s = row({
			cardId: 'x',
			discs: 2,
			discSlotPlayerIds: ['0', '0', null],
		});
		expect(contributorsForResolvedStoryRow(s, 2)).toEqual(['0']);
	});

	it('respects need=3: includes third slot', () => {
		const s = row({
			cardId: 'x',
			discs: 3,
			discSlotPlayerIds: ['0', '1', '2'],
		});
		expect(contributorsForResolvedStoryRow(s, 3)).toEqual(['0', '1', '2']);
	});

	it('ignores null slots and skips when empty', () => {
		const s = row({
			cardId: 'x',
			discs: 2,
			discSlotPlayerIds: [null, '1'],
		});
		expect(contributorsForResolvedStoryRow(s, 2)).toEqual(['1']);
	});

	it('returns [] without discSlotPlayerIds (legacy row)', () => {
		const s = { cardId: 'x', discs: 2 } as StoryInPlayEntry;
		expect(contributorsForResolvedStoryRow(s, 2)).toEqual([]);
	});

	it('returns [] for need=0', () => {
		const s = row({ cardId: 'x', discs: 1, discSlotPlayerIds: ['0', null, null] });
		expect(contributorsForResolvedStoryRow(s, 0)).toEqual([]);
	});
});
