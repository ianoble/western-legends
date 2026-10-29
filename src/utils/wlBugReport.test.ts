import { describe, expect, it } from 'vitest';
import type { WesternLegendsState } from '../logic/types';
import { safeJsonStringify, summarizeWesternLegendsForBugReport } from './wlBugReport';

describe('safeJsonStringify', () => {
	it('stringifies plain objects', () => {
		expect(JSON.parse(safeJsonStringify({ a: 1 }))).toEqual({ a: 1 });
	});

	it('does not throw on circular references', () => {
		const a: Record<string, unknown> = { name: 'a' };
		a.self = a;
		const s = safeJsonStringify({ root: a });
		expect(s).toContain('[Circular]');
		expect(() => JSON.parse(s)).not.toThrow();
	});
});

describe('summarizeWesternLegendsForBugReport', () => {
	it('does not throw when deck / log arrays are undefined (partial sync)', () => {
		const G = {
			round: 0,
			turnOrderIndex: 0,
			legendGoal: 25,
			players: {
				'0': {
					color: 'red',
					hand: [],
				},
			},
			pokerDeck: [],
			pokerDiscard: [],
			storyDeckLeft: undefined,
			storyDeckRight: [],
			storyDiscard: [],
			fightDeck: [],
			fightDiscard: [],
			gameLog: undefined,
			history: [],
		} as unknown as WesternLegendsState;

		const s = summarizeWesternLegendsForBugReport(G, '0');
		expect(s.deckSizes).toEqual(
			expect.objectContaining({
				storyDeckLeft: 0,
			}),
		);
		expect(s.trailLogTail).toEqual([]);
		expect(s.moveHistoryTail).toEqual([]);
	});
});
