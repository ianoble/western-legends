/**
 * Board image URL and optional UI callouts (story / poker zones) as %-positions of the outer map row.
 * Playable **spaces** are polygons in {@link BOARD_SPACES} / {@link boardSpaces.ts}.
 */
export const BOARD_IMAGE_PATH = '/board/western-legends-board.png';

/** Left story pile — center (% of board bitmap / SVG viewBox), other half of deck is {@link STORY_PILE_RIGHT_ZONE}. */
export const STORY_PILE_LEFT_ZONE = { xPct: 7.23, yPct: 44.61 } as const;
/** Right story pile — center (% of board bitmap / viewBox). */
export const STORY_PILE_RIGHT_ZONE = { xPct: 17.29, yPct: 44.61 } as const;

/** Left face-up story card: three printed disc spots, left→right (viewBox %). */
export const STORY_DISC_SPOTS_LEFT: readonly [readonly [number, number], readonly [number, number], readonly [number, number]] = [
	[4.69, 44],
	[7.32, 44.45],
	[9.47, 44.45],
];

/** Right face-up story card: three printed disc spots, left→right (viewBox %). */
export const STORY_DISC_SPOTS_RIGHT: readonly [readonly [number, number], readonly [number, number], readonly [number, number]] = [
	[15.04, 44.3],
	[17.19, 44.3],
	[19.92, 44],
];

export const POKER_ZONE = { xPct: 87, yPct: 56 } as const;
