import { describe, expect, it } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { FIGHT_CARD_FACE_IDS, buildInitialFightDeck } from './fightCards';
import { migrateFightDeckIfMissing, westernLegendsGameDef } from './game';
import type { WesternLegendsState } from './types';

function makeSetupCtx(numPlayers: number): Ctx {
	return {
		numPlayers,
		playOrder: Array.from({ length: numPlayers }, (_, i) => String(i)),
		playOrderPos: 0,
		currentPlayer: '0',
		turn: 0,
		round: 0,
		phase: 'chooseCharacter',
	} as Ctx;
}

describe('fight card deck', () => {
	const setup = westernLegendsGameDef.game.setup!;

	it('setup initializes a shuffled 13-card deck and empty discard', () => {
		const G = setup({ ctx: makeSetupCtx(2) });
		expect(G.fightDiscard).toEqual([]);
		expect(G.fightDeck).toHaveLength(FIGHT_CARD_FACE_IDS.length);
		const set = new Set(G.fightDeck);
		expect(set.size).toBe(FIGHT_CARD_FACE_IDS.length);
		for (const id of FIGHT_CARD_FACE_IDS) {
			expect(set.has(id)).toBe(true);
		}
	});

	it('buildInitialFightDeck is a permutation of all face ids', () => {
		const deck = buildInitialFightDeck();
		expect(deck).toHaveLength(FIGHT_CARD_FACE_IDS.length);
		expect(new Set(deck).size).toBe(FIGHT_CARD_FACE_IDS.length);
	});

	it('migrateFightDeckIfMissing restores deck and discard on partial G', () => {
		const G = {
			fightDeck: undefined,
			fightDiscard: undefined,
		} as unknown as WesternLegendsState;
		migrateFightDeckIfMissing(G);
		expect(G.fightDiscard).toEqual([]);
		expect(G.fightDeck).toHaveLength(FIGHT_CARD_FACE_IDS.length);
		const set = new Set(G.fightDeck);
		for (const id of FIGHT_CARD_FACE_IDS) {
			expect(set.has(id)).toBe(true);
		}
	});
});
