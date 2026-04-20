import { shuffle } from '@engine/client';

/**
 * Four distinct story card backs (10 copies each, 40 cards total).
 * Each back has three printed spaces; the third is only used at 5–6 players (see `storyDiscsRequiredToResolve` in types).
 * Physical setup: shuffle all 40, split into two equal face-down piles (two options for players).
 */
export type StoryBackKind =
	| 'spend_80_town_single_action'
	| 'gain_2_lp_single_action'
	| 'gain_marshal_or_wanted_on_turn'
	| 'end_turn_outside_town';

/**
 * Printed back art (`public/images/`). Order matches {@link STORY_BACK_KINDS}: spend / LP / marshal–wanted / wilderness.
 * Files: `story_card_01b.png` … `story_card_04b.png`.
 */
export const STORY_BACK_IMAGE_PATHS: Record<StoryBackKind, string> = {
	spend_80_town_single_action: '/images/story_card_01b.png',
	gain_2_lp_single_action: '/images/story_card_02b.png',
	gain_marshal_or_wanted_on_turn: '/images/story_card_03b.png',
	end_turn_outside_town: '/images/story_card_04b.png',
};

export function storyBackImageUrl(backKind: StoryBackKind): string {
	return STORY_BACK_IMAGE_PATHS[backKind];
}

export interface StoryBackKindMeta {
	backKind: StoryBackKind;
	/** Short rules text matching the printed back. */
	conditionSummary: string;
	/** Stable ids for this back (10 cards). */
	cardIds: readonly string[];
}

const RANGE_10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function ids(prefix: string): string[] {
	return RANGE_10.map((n) => `${prefix}-${String(n).padStart(2, '0')}`);
}

/** Ordered catalog: spend / LP / reputation tracks / wilderness. */
export const STORY_BACK_KINDS: readonly StoryBackKindMeta[] = [
	{
		backKind: 'spend_80_town_single_action',
		conditionSummary: 'Spend $80 or more in a town with a single action',
		cardIds: ids('story-spend'),
	},
	{
		backKind: 'gain_2_lp_single_action',
		conditionSummary: 'Gain 2 or more LP from a single action',
		cardIds: ids('story-lp'),
	},
	{
		backKind: 'gain_marshal_or_wanted_on_turn',
		conditionSummary: 'Gain any number of Marshal or Wanted points on your turn',
		cardIds: ids('story-rep'),
	},
	{
		backKind: 'end_turn_outside_town',
		conditionSummary: 'End your turn at a location outside of a town',
		cardIds: ids('story-wild'),
	},
] as const;

/** All 40 story card ids (four backs × 10). */
export const ALL_STORY_CARD_IDS: string[] = STORY_BACK_KINDS.flatMap((b) => [...b.cardIds]);

/** Printed card front art: `story_card_01a.png` … `story_card_40a.png` in {@link ALL_STORY_CARD_IDS} order. */
export const STORY_CARD_FRONT_COUNT = 40;

const CARD_ID_TO_META = new Map<string, { backKind: StoryBackKind; conditionSummary: string }>();
/** 1–40 printed index for `story_card_[n]a.png` (same order as {@link ALL_STORY_CARD_IDS}). */
const CARD_ID_TO_FRONT_NUMBER = new Map<string, number>();
for (const row of STORY_BACK_KINDS) {
	for (const id of row.cardIds) {
		CARD_ID_TO_META.set(id, { backKind: row.backKind, conditionSummary: row.conditionSummary });
	}
}
ALL_STORY_CARD_IDS.forEach((id, i) => {
	CARD_ID_TO_FRONT_NUMBER.set(id, i + 1);
});

/** `/images/story_card_01a.png` … `/images/story_card_40a.png` */
export function storyCardFrontImageUrl(printedNumber: number): string {
	if (printedNumber < 1 || printedNumber > STORY_CARD_FRONT_COUNT) {
		throw new RangeError(`story card front number must be 1–${STORY_CARD_FRONT_COUNT}, got ${printedNumber}`);
	}
	return `/images/story_card_${String(printedNumber).padStart(2, '0')}a.png`;
}

/** Printed front index 1–40 for a catalog id, or `undefined` if unknown. */
export function getStoryCardFrontNumber(cardId: string): number | undefined {
	return CARD_ID_TO_FRONT_NUMBER.get(cardId);
}

/** Front face URL for a catalog card id. */
export function getStoryCardFrontImageUrl(cardId: string): string | undefined {
	const n = CARD_ID_TO_FRONT_NUMBER.get(cardId);
	return n != null ? storyCardFrontImageUrl(n) : undefined;
}

export function buildStoryCardDeck(): string[] {
	return shuffle([...ALL_STORY_CARD_IDS]);
}

export function getStoryCardBackMeta(
	cardId: string,
): {
	backKind: StoryBackKind;
	conditionSummary: string;
	/** Back face (`story_card_01b`–`04b` by kind). */
	imageUrl: string;
	/** Front face (`story_card_01a`–`40a` by printed order). */
	frontImageUrl: string;
} | undefined {
	const row = CARD_ID_TO_META.get(cardId);
	if (!row) return undefined;
	const front = getStoryCardFrontImageUrl(cardId);
	if (front == null) return undefined;
	return { ...row, imageUrl: storyBackImageUrl(row.backKind), frontImageUrl: front };
}

/** Back image URL for a catalog card id, or `undefined` if unknown. */
export function getStoryCardBackImageUrl(cardId: string): string | undefined {
	return getStoryCardBackMeta(cardId)?.imageUrl;
}

export function isStoryCatalogCardId(id: string): boolean {
	return CARD_ID_TO_META.has(id);
}
