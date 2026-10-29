import { shuffle } from '@engine/client';
import { CATTLE_TOKEN_FACE_IDS, type CattlePiles, type CattleTokenColor } from './types';

/** Accepts legacy / hand-edited values so rustle and migration never miss `blue` vs `Blue`. */
export function normalizeCattleTokenColor(raw: unknown): CattleTokenColor | null {
	if (raw === 'green' || raw === 'blue') return raw;
	if (typeof raw !== 'string') return null;
	const s = raw.trim().toLowerCase();
	if (s === 'green' || s === 'blue') return s;
	return null;
}

export function buildInitialCattlePiles(): CattlePiles {
	return {
		green: shuffle([...CATTLE_TOKEN_FACE_IDS]),
		blue: shuffle([...CATTLE_TOKEN_FACE_IDS]),
	};
}
