import type { StoryInPlayEntry } from './types';

/**
 * Player ids that contributed to a story row for resolution (first `needDiscs` disc slots, left to right).
 * De-duplicated, preserving first-seen order.
 */
export function contributorsForResolvedStoryRow(row: StoryInPlayEntry, needDiscs: number): string[] {
	if (needDiscs <= 0) return [];
	const slots = row.discSlotPlayerIds;
	if (!slots?.length) return [];
	const out: string[] = [];
	const seen = new Set<string>();
	const cap = Math.min(needDiscs, slots.length);
	for (let i = 0; i < cap; i++) {
		const pid = slots[i];
		if (pid == null || pid === '') continue;
		if (seen.has(pid)) continue;
		seen.add(pid);
		out.push(pid);
	}
	return out;
}
