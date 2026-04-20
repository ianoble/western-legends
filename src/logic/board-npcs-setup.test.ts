import { describe, expect, it } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { FIGHT_CARD_FACE_IDS } from './fightCards';
import { CATTLE_TOKEN_FACE_IDS } from './types';
import { BANDIT_HIDEOUT_SPACE_IDS, NPC_SHERIFF_ID, getSheriffOfficeSpaceId } from '../map/boardSpaces';
import { westernLegendsGameDef } from './game';

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

describe('board NPCs (setup)', () => {
	const setup = westernLegendsGameDef.game.setup!;

	it('places the sheriff on Darkrock sheriff office and one bandit per hideout', () => {
		const G = setup({ ctx: makeSetupCtx(2) });
		const sheriffOffice = getSheriffOfficeSpaceId('darkrock');

		const sheriffs = G.boardNpcs.filter((n) => n.kind === 'sheriff');
		expect(sheriffs).toHaveLength(1);
		expect(sheriffs[0]!.id).toBe(NPC_SHERIFF_ID);
		expect(sheriffs[0]!.spaceId).toBe(sheriffOffice);

		const bandits = G.boardNpcs.filter((n) => n.kind === 'bandit');
		expect(bandits).toHaveLength(BANDIT_HIDEOUT_SPACE_IDS.length);
		const banditSpaces = new Set(bandits.map((b) => b.spaceId));
		for (const id of BANDIT_HIDEOUT_SPACE_IDS) {
			expect(banditSpaces.has(id)).toBe(true);
		}
		expect(G.boardNpcs).toHaveLength(1 + BANDIT_HIDEOUT_SPACE_IDS.length);

		expect(G.cattlePiles.green).toHaveLength(CATTLE_TOKEN_FACE_IDS.length);
		expect(G.cattlePiles.blue).toHaveLength(CATTLE_TOKEN_FACE_IDS.length);

		expect(G.fightDiscard).toHaveLength(0);
		expect(G.fightDeck).toHaveLength(FIGHT_CARD_FACE_IDS.length);
		const deckSet = new Set(G.fightDeck);
		for (const id of FIGHT_CARD_FACE_IDS) {
			expect(deckSet.has(id)).toBe(true);
		}
	});
});
