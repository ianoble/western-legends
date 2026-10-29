/**
 * Board image URL and optional UI callouts (story / poker zones) as %-positions of the outer map row.
 * Playable **spaces** are polygons in {@link BOARD_SPACES} / {@link boardSpaces.ts}.
 */
export const BOARD_IMAGE_PATH = '/board/western-legends-board.png';

/** Left story pile — center (% of board bitmap / SVG viewBox), other half of deck is {@link STORY_PILE_RIGHT_ZONE}. */
export const STORY_PILE_LEFT_ZONE = { xPct: 7.23, yPct: 44.61 } as const;
/** Right story pile — center (% of board bitmap / viewBox). */
export const STORY_PILE_RIGHT_ZONE = { xPct: 17.29, yPct: 44.61 } as const;

/** Left in-play story card zone: three printed disc spots, left→right (viewBox %). */
export const STORY_DISC_SPOTS_LEFT: readonly [readonly [number, number], readonly [number, number], readonly [number, number]] = [
	[4.69, 44],
	[7.32, 44.45],
	[9.47, 44.45],
];

/** Right in-play story card zone: three printed disc spots, left→right (viewBox %). */
export const STORY_DISC_SPOTS_RIGHT: readonly [readonly [number, number], readonly [number, number], readonly [number, number]] = [
	[15.04, 44.3],
	[17.19, 44.3],
	[19.92, 44],
];

/**
 * Center of each in-play story card for overlay images ({@link getStoryCardFrontImageUrl} on resolution).
 * Derived from the centroid of {@link STORY_DISC_SPOTS_LEFT} / {@link STORY_DISC_SPOTS_RIGHT} so the revealed front aligns with disc holes.
 * The base board PNG shows placeholder art; overlays reflect `G.storyInPlay` and resolve reveal from game state.
 */
export const STORY_FACEUP_LEFT_ZONE = { xPct: 7.16, yPct: 44.3 } as const;
export const STORY_FACEUP_RIGHT_ZONE = { xPct: 17.38, yPct: 44.2 } as const;

export const POKER_ZONE = { xPct: 87, yPct: 56 } as const;
