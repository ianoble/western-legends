import { getStoryCardFrontNumber, STORY_CARD_FRONT_COUNT } from './storyCards';
import storyCardsJson from './story_cards.json';

export type StoryCardContent = {
	id: string;
	image: string;
	title: string;
	flavor: string;
	event: string;
	spawn_bandits: number;
	sheriff_move: string | null;
};

const data = storyCardsJson as { cards: StoryCardContent[] };

const BY_FRONT = new Map<number, StoryCardContent>();
for (const c of data.cards) {
	BY_FRONT.set(parseInt(c.id, 10), c);
}

/** Same as {@link STORY_CARD_FRONT_COUNT} (single source: printed `story_card_01a`–`40a`). */
export const STORY_CARD_CONTENT_COUNT = STORY_CARD_FRONT_COUNT;

/**
 * All story card text entries in printed order (front 1 = index 0 … front 40 = index 39).
 * Frozen at init: missing or duplicate fronts throw.
 */
export const ALL_STORY_CARD_CONTENT: readonly StoryCardContent[] = Object.freeze(
	Array.from({ length: STORY_CARD_CONTENT_COUNT }, (_, i) => {
		const c = BY_FRONT.get(i + 1);
		if (c == null) {
			throw new Error(`story_cards.json: missing card for printed front ${i + 1}`);
		}
		return c;
	}),
);

/** Printed card front 1–40 (`story_card_01a.png` …); out of range returns `undefined`. */
export function getStoryCardByFrontNumber(n: number): StoryCardContent | undefined {
	if (n < 1 || n > STORY_CARD_CONTENT_COUNT) return undefined;
	return BY_FRONT.get(n);
}

/** Catalog id (e.g. `story-spend-01`); unknown id returns `undefined`. */
export function getStoryCardByCardId(cardId: string): StoryCardContent | undefined {
	const n = getStoryCardFrontNumber(cardId);
	return n != null ? getStoryCardByFrontNumber(n) : undefined;
}

/** Printed title for game log lines, or the catalog id when unknown. */
export function formatStoryCardForLog(cardId: string): string {
	return getStoryCardByCardId(cardId)?.title ?? cardId;
}
