import type { PlayerColor } from '../logic/types';

/**
 * On-map player piece art (`public/images/players/<name>.png`).
 * `green` / `black` / `orange` fall back to existing files until named assets exist
 * (swap paths here when you add `green.png`, `gray.png` / `black.png`, `orange.png`).
 */
export const PLAYER_PIECE_IMAGE: Record<PlayerColor, string> = {
	red: '/images/players/red.png',
	blue: '/images/players/blue.png',
	/** No `green.png` yet — same token style as the white/gray meeple. */
	green: '/images/players/white.png',
	yellow: '/images/players/yellow.png',
	/** Seat "black" uses a light disk in UI; white meeple reads as a neutral light token. */
	black: '/images/players/white.png',
	/** No `orange.png` yet — use purple as a distinct warm-adjacent stand-in, or add `orange.png` and point here. */
	orange: '/images/players/purple.png',
};

export const SHERIFF_PIECE_IMAGE = '/images/players/sheriff.png' as const;
export const BANDIT_PIECE_IMAGE = '/images/players/bandit.png' as const;
