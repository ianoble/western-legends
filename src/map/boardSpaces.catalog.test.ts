import { describe, expect, it } from 'vitest';
import { polygonCentroid } from './boardGraph';
import {
	BOARD_SPACES,
	getBoardSpaceCity,
	isInsideAnyBoardCity,
	isInsideDarkrockCity,
	isInsideRedFallsCity,
} from './boardSpaces';

describe('board space catalog', () => {
	it('has unique space ids', () => {
		const ids = BOARD_SPACES.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('has exactly one doctor space, in Red Falls (rf-3)', () => {
		const doctors = BOARD_SPACES.filter((s) => s.actionKind === 'doctor');
		expect(doctors).toHaveLength(1);
		expect(doctors[0]?.id).toBe('rf-3');
		expect(doctors[0]?.name).toMatch(/Red Falls/i);
	});

	it('classifies city membership for stories and goals', () => {
		expect(getBoardSpaceCity('dk-3')).toBe('darkrock');
		expect(isInsideDarkrockCity('dk-9')).toBe(true);
		expect(isInsideDarkrockCity('dk-6')).toBe(true);
		expect(isInsideDarkrockCity('dk-10')).toBe(true);
		expect(getBoardSpaceCity('mp-2')).toBe(null);
		expect(getBoardSpaceCity('ad-1')).toBe(null);
		expect(getBoardSpaceCity('ar-1')).toBe(null);
		expect(getBoardSpaceCity('rf-3')).toBe('redFalls');
		expect(isInsideRedFallsCity('rf-2')).toBe(true);
		expect(isInsideRedFallsCity('rf-7')).toBe(true);
		for (const s of BOARD_SPACES) {
			const c = getBoardSpaceCity(s.id);
			expect(c === 'darkrock' || c === 'redFalls' || c === null).toBe(true);
		}
	});

	it('has exactly two ranch POIs (mp-2 and sh-3)', () => {
		const ranches = BOARD_SPACES.filter((s) => s.actionKind === 'ranch').map((s) => s.id).sort();
		expect(ranches).toEqual(['mp-2', 'sh-3']);
	});

	it('does not have duplicate centroids (rounded to 2 decimals)', () => {
		const byKey = new Map<string, string[]>();
		for (const s of BOARD_SPACES) {
			const [x, y] = polygonCentroid(s.polygon);
			const key = `${x.toFixed(2)},${y.toFixed(2)}`;
			const list = byKey.get(key) ?? [];
			list.push(s.id);
			byKey.set(key, list);
		}

		const dupes = [...byKey.entries()].filter(([, ids]) => new Set(ids).size > 1 && ids.length > 1);
		expect(dupes, `Duplicate centroid buckets:\\n${dupes.map(([k, ids]) => `  ${k}: ${ids.join(', ')}`).join('\\n')}`).toEqual([]);
	});
});

