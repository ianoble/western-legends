/**
 * Board image URL and optional UI callouts (story / poker zones) as %-positions of the outer map row.
 * Playable **spaces** are polygons in {@link BOARD_SPACES} / {@link boardSpaces.ts}.
 */
export const BOARD_IMAGE_PATH = '/board/western-legends-board.png';

export const STORY_DECK_ZONE = { xPct: 11, yPct: 44 } as const;
export const STORY_DISCARD_ZONE = { xPct: 20, yPct: 44 } as const;

export const POKER_ZONE = { xPct: 87, yPct: 56 } as const;
