import { describe, expect, it, vi } from 'vitest';
import { INVALID_MOVE, createStandardDeck } from '@engine/client';
import type { Ctx } from 'boardgame.io';
import {
	buildInitialBoardNpcs,
	grantMarshalPoints,
	grantWantedPoints,
	performEndGameScoring,
	westernLegendsGameDef,
} from './game';
import type { WesternLegendsState } from './types';
import { GENERAL_STORE_BASE_ITEM_IDS, GENERAL_STORE_COPIES_PER_BASE_ITEM } from '../data/itemCards';
import { buildInitialCattlePiles } from './cattleTokens';
import { buildInitialFightDeck } from './fightCards';
import { BOARD_STARTING_SPACE_ID } from '../map/boardSpaces';

function basePlayer(overrides: Partial<WesternLegendsState['players'][string]>): WesternLegendsState['players'][string] {
	return {
		color: 'red',
		characterOffers: null,
		characterId: 'wl-02',
		locationId: BOARD_STARTING_SPACE_ID,
		movementPointsLeft: 0,
		gold: 50,
		legendaryPoints: 0,
		wounds: 0,
		nuggets: 0,
		carriedCattle: null,
		wantedPoints: 0,
		marshalPoints: 0,
		hand: [],
		turnActions: [],
		needsStartTurnIncomeChoice: false,
		ownedWeaponItemIds: [],
		ownedMountItemIds: [],
		ownedMiscItemIds: [],
		usedHeistThisTurn: false,
		turnWeaponItemId: null,
		turnMountItemId: null,
		needsTurnWeaponMountChoice: false,
		prospectMapRerollDice: null,
		whiskeyReactionAvailable: false,
		...overrides,
	};
}

function makeCtx(currentPlayer: string, numPlayers = 2): Ctx {
	const order = Array.from({ length: numPlayers }, (_, i) => String(i));
	return {
		numPlayers,
		playOrder: order,
		playOrderPos: 0,
		currentPlayer,
		turn: 0,
		round: 0,
		phase: 'play',
	} as Ctx;
}

function buildG(numPlayers = 2): WesternLegendsState {
	const pokerDeck = createStandardDeck();
	const initialStock = Object.fromEntries(
		GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]),
	);
	const players: WesternLegendsState['players'] = {};
	for (let i = 0; i < numPlayers; i++) {
		const pid = String(i);
		players[pid] = basePlayer({
			color: i === 0 ? 'red' : 'blue',
			locationId: BOARD_STARTING_SPACE_ID,
		});
	}
	return {
		round: 0,
		turnOrderIndex: 0,
		players,
		pokerDeck,
		pokerDiscard: [],
		saloonRound: null,
		saloonReveal: null,
		fight: null,
		prospectReveal: null,
		generalStoreStock: initialStock,
		storyDeckLeft: [],
		storyDeckRight: [],
		storyDiscard: [],
		storyInPlay: [null, null],
		boardNpcs: buildInitialBoardNpcs(),
		cattlePiles: buildInitialCattlePiles(),
		fightDeck: buildInitialFightDeck(),
		fightDiscard: [],
		endGameScored: false,
		endGameScoreBreakdown: {},
		gameLog: [],
		legendGoal: 25,
		history: [],
	};
}

describe('reputation tracks (marshal / wanted exclusivity)', () => {
	it('gaining wanted clears marshal and applies delta from wanted baseline (not MP+WP merge)', () => {
		const G = buildG();
		const p = G.players['0']!;
		p.marshalPoints = 5;
		p.wantedPoints = 0;
		grantWantedPoints(G, '0', 2, '0', 'test');
		expect(p.marshalPoints).toBe(0);
		expect(p.wantedPoints).toBe(2);
	});

	it('gaining marshal while wanted is a no-op', () => {
		const G = buildG();
		const p = G.players['0']!;
		p.wantedPoints = 2;
		p.marshalPoints = 0;
		grantMarshalPoints(G, '0', 3, '0', 'test');
		expect(p.wantedPoints).toBe(2);
		expect(p.marshalPoints).toBe(0);
	});

	it('marshal cattle choice is invalid when wanted', () => {
		const choose = westernLegendsGameDef.game.moves!.chooseCattleTrackReward!;
		const G = buildG();
		const p = G.players['0']!;
		p.pendingCattleMarshalOrWanted = true;
		p.wantedPoints = 1;
		const ctx = makeCtx('0');
		expect(choose({ G, ctx, playerID: '0' } as never, 'marshal')).toBe(INVALID_MOVE);
	});

	it('choosing wanted from cattle clears marshal', () => {
		const choose = westernLegendsGameDef.game.moves!.chooseCattleTrackReward!;
		const G = buildG();
		const p = G.players['0']!;
		p.pendingCattleMarshalOrWanted = true;
		p.marshalPoints = 4;
		p.wantedPoints = 0;
		const ctx = makeCtx('0');
		expect(choose({ G, ctx, playerID: '0' } as never, 'wanted')).not.toBe(INVALID_MOVE);
		expect(p.marshalPoints).toBe(0);
		expect(p.wantedPoints).toBe(1);
	});
});

describe('reputation tracks (overflow at 9 → LP)', () => {
	it('excess marshal points at space 9 become LP', () => {
		const G = buildG();
		const p = G.players['0']!;
		p.marshalPoints = 9;
		p.legendaryPoints = 10;
		grantMarshalPoints(G, '0', 2, '0', 'test');
		expect(p.marshalPoints).toBe(9);
		expect(p.legendaryPoints).toBe(12);
	});

	it('excess wanted points at space 9 become LP', () => {
		const G = buildG();
		const p = G.players['0']!;
		p.wantedPoints = 9;
		p.legendaryPoints = 1;
		grantWantedPoints(G, '0', 2, '0', 'test');
		expect(p.wantedPoints).toBe(9);
		expect(p.legendaryPoints).toBe(3);
	});
});

describe('wanted track space rewards (rulebook)', () => {
	it('entering space 2 draws one poker card', () => {
		const G = buildG();
		const p = G.players['0']!;
		p.wantedPoints = 1;
		const deckBefore = G.pokerDeck.length;
		grantWantedPoints(G, '0', 1, '0', 'test');
		expect(p.wantedPoints).toBe(2);
		expect(p.hand.length).toBe(1);
		expect(G.pokerDeck.length).toBe(deckBefore - 1);
	});

	it('entering space 1 logs Sheriff Active', () => {
		const G = buildG();
		const p = G.players['0']!;
		p.wantedPoints = 0;
		grantWantedPoints(G, '0', 1, '0', 'test');
		expect(p.wantedPoints).toBe(1);
		expect(G.gameLog.some((e) => e.message.includes('Sheriff Active'))).toBe(true);
	});
});

describe('marshal track space rewards (rulebook)', () => {
	it('entering space 1 grants +$20', () => {
		const G = buildG();
		const p = G.players['0']!;
		grantMarshalPoints(G, '0', 1, '0', 'test');
		expect(p.marshalPoints).toBe(1);
		expect(p.gold).toBe(70);
	});

	it('entering space 3 grants +2 LP', () => {
		const G = buildG();
		const p = G.players['0']!;
		p.marshalPoints = 2;
		grantMarshalPoints(G, '0', 1, '0', 'test');
		expect(p.marshalPoints).toBe(3);
		expect(p.legendaryPoints).toBe(2);
	});

	it('entering space 9 grants +6 LP', () => {
		const G = buildG();
		const p = G.players['0']!;
		p.marshalPoints = 8;
		grantMarshalPoints(G, '0', 1, '0', 'test');
		expect(p.marshalPoints).toBe(9);
		expect(p.legendaryPoints).toBe(6);
	});
});

describe('story discs (marshal/wanted story card)', () => {
	const pass = westernLegendsGameDef.game.moves!.pass!;
	const events = () => ({ setActivePlayers: vi.fn(), endStage: vi.fn(), endTurn: vi.fn() });

	it('grant WP on active player turn adds disc and slot color on rep story row', () => {
		const G = buildG();
		G.storyInPlay = [{ cardId: 'story-rep-01', discs: 0 }, null];
		const ctx = makeCtx('0');
		grantWantedPoints(G, '0', 1, '0', 'test', ctx);
		expect(G.storyInPlay[0]!.discs).toBe(1);
		expect(G.storyInPlay[0]!.discSlotPlayerIds?.[0]).toBe('0');
		expect(G.players['0']!.wantedPoints).toBe(1);
	});

	it('grant WP without ctx does not add story disc', () => {
		const G = buildG();
		G.storyInPlay = [{ cardId: 'story-rep-01', discs: 0 }, null];
		grantWantedPoints(G, '0', 1, '0', 'test');
		expect(G.storyInPlay[0]!.discs).toBe(0);
	});

	it('grant WP on another player turn does not add disc', () => {
		const G = buildG();
		G.storyInPlay = [{ cardId: 'story-rep-01', discs: 0 }, null];
		const ctx = makeCtx('1');
		grantWantedPoints(G, '0', 1, '0', 'test', ctx);
		expect(G.storyInPlay[0]!.discs).toBe(0);
	});

	it('grant marshal on turn adds disc to first rep row', () => {
		const G = buildG();
		G.storyInPlay = [{ cardId: 'story-rep-01', discs: 0 }, null];
		const ctx = makeCtx('0');
		grantMarshalPoints(G, '0', 1, '0', 'test', ctx);
		expect(G.storyInPlay[0]!.discs).toBe(1);
		expect(G.storyInPlay[0]!.discSlotPlayerIds?.[0]).toBe('0');
	});

	it('contributes to first in-play row with gain_marshal_or_wanted back', () => {
		const G = buildG();
		G.storyInPlay = [
			{ cardId: 'story-spend-01', discs: 0 },
			{ cardId: 'story-rep-01', discs: 0 },
		];
		const ctx = makeCtx('0');
		grantWantedPoints(G, '0', 1, '0', 'test', ctx);
		expect(G.storyInPlay[0]!.discs).toBe(0);
		expect(G.storyInPlay[1]!.discs).toBe(1);
		expect(G.storyInPlay[1]!.discSlotPlayerIds?.[0]).toBe('0');
	});

	it('pass discards and refills right slot when marshal/wanted story meets disc threshold', () => {
		const G = buildG(2);
		G.storyInPlay = [
			null,
			{
				cardId: 'story-rep-01',
				discs: 2,
				discSlotPlayerIds: ['0', '1', null],
			},
		];
		G.storyDeckRight = ['story-rep-02'];
		G.players['0']!.locationId = 'dk-3';
		const ctx = makeCtx('0');
		expect(pass({ G, ctx, events: events() } as never, [])).not.toBe(INVALID_MOVE);
		expect(G.storyDiscard).toContain('story-rep-01');
		expect(G.storyInPlay[1]?.cardId).toBe('story-rep-02');
		expect(G.storyInPlay[1]?.discs).toBe(0);
		expect(G.storyResolvedReveal?.reveals).toEqual([{ slotIndex: 1, cardId: 'story-rep-01' }]);
	});
});

describe('story discs (end turn outside town)', () => {
	const pass = westernLegendsGameDef.game.moves!.pass!;
	const events = () => ({ setActivePlayers: vi.fn(), endStage: vi.fn(), endTurn: vi.fn() });

	it('pass while outside a city adds a disc to the story-wild row', () => {
		const G = buildG();
		G.storyInPlay = [{ cardId: 'story-wild-01', discs: 0 }, null];
		G.players['0']!.locationId = 'sh-1';
		const ctx = makeCtx('0');
		expect(pass({ G, ctx, events: events() } as never, [])).not.toBe(INVALID_MOVE);
		expect(G.storyInPlay[0]!.discs).toBe(1);
		expect(G.storyInPlay[0]!.discSlotPlayerIds?.[0]).toBe('0');
	});

	it('pass while inside a city does not add a wilderness disc', () => {
		const G = buildG();
		G.storyInPlay = [{ cardId: 'story-wild-01', discs: 0 }, null];
		G.players['0']!.locationId = 'dk-3';
		const ctx = makeCtx('0');
		expect(pass({ G, ctx, events: events() } as never, [])).not.toBe(INVALID_MOVE);
		expect(G.storyInPlay[0]!.discs).toBe(0);
	});
});

describe('performEndGameScoring', () => {
	it('adds marshal row LP only for players not on wanted track', () => {
		const G = buildG(2);
		G.players['0']!.marshalPoints = 8;
		G.players['0']!.wantedPoints = 0;
		G.players['0']!.legendaryPoints = 5;
		G.players['1']!.marshalPoints = 2;
		G.players['1']!.wantedPoints = 0;
		G.players['1']!.legendaryPoints = 0;
		performEndGameScoring(G);
		expect(G.players['0']!.legendaryPoints).toBe(5 + 3);
		expect(G.players['1']!.legendaryPoints).toBe(1);
		expect(G.endGameScored).toBe(true);
	});

	it('most wanted: sole leader gets +3 LP; others with WP get +1 LP', () => {
		const G = buildG(3);
		G.players['0']!.wantedPoints = 5;
		G.players['0']!.legendaryPoints = 0;
		G.players['1']!.wantedPoints = 2;
		G.players['1']!.legendaryPoints = 0;
		G.players['2']!.wantedPoints = 0;
		G.players['2']!.legendaryPoints = 0;
		performEndGameScoring(G);
		expect(G.players['0']!.legendaryPoints).toBe(3);
		expect(G.players['1']!.legendaryPoints).toBe(1);
		expect(G.players['2']!.legendaryPoints).toBe(0);
	});

	it('most wanted: tie for max gives +1 LP to each tied leader; non-leaders +1 LP', () => {
		const G = buildG(3);
		G.players['0']!.wantedPoints = 5;
		G.players['1']!.wantedPoints = 5;
		G.players['2']!.wantedPoints = 2;
		performEndGameScoring(G);
		expect(G.players['0']!.legendaryPoints).toBe(1);
		expect(G.players['1']!.legendaryPoints).toBe(1);
		expect(G.players['2']!.legendaryPoints).toBe(1);
	});
});
