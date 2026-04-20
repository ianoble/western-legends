import { describe, expect, it, vi } from 'vitest';
import { INVALID_MOVE, createStandardDeck } from '@engine/client';
import type { Ctx } from 'boardgame.io';
import { buildInitialCattlePiles } from './cattleTokens';
import { buildInitialFightDeck } from './fightCards';
import {
	buildInitialBoardNpcs,
	getGameOverResult,
	performEndGameScoring,
	progressEndgameAfterPass,
	westernLegendsGameDef,
} from './game';
import type { WesternLegendsState } from './types';
import { MAN_IN_BLACK_FIGHT_DEFENDER_ID } from './types';
import { GENERAL_STORE_BASE_ITEM_IDS, GENERAL_STORE_COPIES_PER_BASE_ITEM } from '../data/itemCards';

function pick(ids: string[]) {
	const deck = createStandardDeck();
	const m = new Map(deck.map((c) => [c.id, c]));
	return ids.map((id) => m.get(id)!);
}

function basePlayer(
	overrides: Partial<WesternLegendsState['players'][string]> & {
		hand: WesternLegendsState['players'][string]['hand'];
	},
): WesternLegendsState['players'][string] {
	return {
		color: 'red',
		characterOffers: null,
		characterId: 'wl-12',
		locationId: 'rs-1',
		movementPointsLeft: 3,
		gold: 40,
		legendaryPoints: 0,
		wounds: 0,
		nuggets: 0,
		carriedCattle: null,
		wantedPoints: 0,
		marshalPoints: 0,
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
		generalStoreVisitPaidLocationId: null,
		...overrides,
	};
}

function emptyStock(): Record<string, number> {
	return Object.fromEntries(GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]));
}

function buildG(players: WesternLegendsState['players'], mib?: Partial<NonNullable<WesternLegendsState['manInBlack']>>): WesternLegendsState {
	const pokerDeck = createStandardDeck();
	return {
		round: 0,
		turnOrderIndex: 0,
		players,
		pokerDeck,
		pokerDiscard: [],
		saloonRound: null,
		saloonReveal: null,
		prospectReveal: null,
		fight: null,
		generalStoreStock: emptyStock(),
		storyDeckLeft: [],
		storyDeckRight: [],
		storyDiscard: [],
		storyInPlay: [],
		boardNpcs: buildInitialBoardNpcs(),
		cattlePiles: buildInitialCattlePiles(),
		fightDeck: buildInitialFightDeck(),
		fightDiscard: [],
		endGameScored: false,
		endGameScoreBreakdown: {},
		gameLog: [],
		legendGoal: 25,
		history: [],
		endgamePhase: 'none',
		manInBlackVariant: true,
		manInBlackPending: null,
		mibDeferredPass: null,
		manInBlack: {
			locationId: 'rs-1',
			legendaryPoints: 0,
			color: 'orange',
			deck: ['mib-01'],
			discard: [],
			...mib,
		},
	};
}

const events = () => ({ setActivePlayers: vi.fn(), endStage: vi.fn(), endTurn: vi.fn() });

function makeCtx(currentPlayer: string): Ctx {
	return {
		numPlayers: 2,
		playOrder: ['0', '1'],
		playOrderPos: 0,
		currentPlayer,
		turn: 0,
		round: 0,
		phase: 'play',
	} as Ctx;
}

describe('Man in Black (2P)', () => {
	const startFight = westernLegendsGameDef.game.moves!.startFight!;
	const commitChallenger = westernLegendsGameDef.game.moves!.fightCommitChallengerCard!;
	const resolveRob = westernLegendsGameDef.game.moves!.resolveFightRobLoot!;
	const pass = westernLegendsGameDef.game.moves!.pass!;

	it('duel vs MIB: challenger wins — +2 LP; triplet resolves to highest fight card', () => {
		const G = buildG({
			'0': basePlayer({ hand: pick(['K-hearts']), locationId: 'rs-1' }),
			'1': basePlayer({ hand: pick(['2-clubs']), locationId: 'dk-3' }),
		});
		G.fightDeck = ['fc-2', 'fc-3', 'fc-4'];
		const ev = events();
		expect(startFight({ G, ctx: makeCtx('0'), events: ev } as never, 'duel', MAN_IN_BLACK_FIGHT_DEFENDER_ID)).not.toBe(INVALID_MOVE);
		expect(G.fight?.kind).toBe('manInBlack');
		commitChallenger({ G, ctx: makeCtx('0'), events: ev, playerID: '0' } as never, 'K-hearts');
		expect(G.fight?.mibFightCardResolved).toBe('fc-4');
		expect(G.fight?.outcome).toBe('challengerWins');
		expect(G.players['0'].legendaryPoints).toBe(2);
		// Triplet is shuffled back under the fight deck after resolution.
		expect(G.fightDeck.length).toBe(3);
		expect(new Set(G.fightDeck).size).toBe(3);
	});

	it('duel vs MIB: tie at K — MIB wins (defender)', () => {
		const G = buildG({
			'0': basePlayer({ hand: pick(['A-diamonds']), locationId: 'rs-1' }),
			'1': basePlayer({ hand: pick(['2-clubs']), locationId: 'dk-3' }),
		});
		G.fightDeck = ['fc-2', 'fc-3', 'fc-K'];
		const ev = events();
		startFight({ G, ctx: makeCtx('0'), events: ev } as never, 'duel', MAN_IN_BLACK_FIGHT_DEFENDER_ID);
		commitChallenger({ G, ctx: makeCtx('0'), events: ev, playerID: '0' } as never, 'A-diamonds');
		expect(G.fight?.outcome).toBe('defenderWins');
		expect(G.players['0'].legendaryPoints).toBe(0);
		expect(G.players['0'].wounds).toBeGreaterThanOrEqual(1);
	});

	it('rob vs MIB: win rob loot — +$60 from supply', () => {
		const G = buildG({
			'0': basePlayer({ hand: pick(['K-hearts']), locationId: 'rs-1', gold: 40 }),
			'1': basePlayer({ hand: pick(['2-clubs']), locationId: 'dk-3' }),
		});
		G.fightDeck = ['fc-2', 'fc-3', 'fc-4'];
		const ev = events();
		startFight({ G, ctx: makeCtx('0'), events: ev } as never, 'rob', MAN_IN_BLACK_FIGHT_DEFENDER_ID);
		commitChallenger({ G, ctx: makeCtx('0'), events: ev, playerID: '0' } as never, 'K-hearts');
		expect(G.fight?.phase).toBe('rewardRob');
		expect(G.players['0'].wantedPoints).toBe(1);
		resolveRob({ G, ctx: makeCtx('0'), events: ev, playerID: '0' } as never, 'gold', false);
		expect(G.players['0'].gold).toBe(100);
		expect(G.fight?.phase).toBe('outcome');
	});

	it('MIB round card: last pass draws mib-01 and sets interaction pending for leader', () => {
		const G = buildG({
			'0': basePlayer({ hand: [], locationId: 'rs-1' }),
			'1': basePlayer({ hand: [], locationId: 'dk-3' }),
		});
		G.manInBlack!.deck = ['mib-01'];
		const ev = events();
		pass({ G, ctx: makeCtx('1'), events: ev } as never);
		expect(G.manInBlack?.discard).toEqual(['mib-01']);
		expect(G.manInBlackPending?.kind).toBe('interaction');
		if (G.manInBlackPending?.kind === 'interaction') {
			expect(G.manInBlackPending.interaction).toBe('duel');
			expect(G.manInBlackPending.targetPlayerId).toBe('0');
		}
		expect(ev.setActivePlayers).toHaveBeenCalled();
	});

	it('MIB interaction commit: leader plays card and clears pending', () => {
		const G = buildG({
			'0': basePlayer({ hand: pick(['K-hearts']), locationId: 'rs-1' }),
			'1': basePlayer({ hand: pick(['2-clubs']), locationId: 'dk-3' }),
		});
		G.manInBlack!.deck = ['mib-01'];
		G.fightDeck = ['fc-2', 'fc-3', 'fc-4'];
		const ev = events();
		pass({ G, ctx: makeCtx('1'), events: ev } as never);
		expect(G.manInBlackPending?.kind).toBe('interaction');
		const mibCommit = westernLegendsGameDef.game.moves!.manInBlackInteractionCommit!;
		mibCommit({ G, ctx: makeCtx('0'), events: ev, playerID: '0' } as never, 'K-hearts');
		expect(G.manInBlackPending).toBeNull();
		expect(G.mibDeferredPass).toBeNull();
	});

	it('MIB epilogue (final round): sync card mib-04 resolves and sets scoring phase', () => {
		const G = buildG({
			'0': basePlayer({ hand: [], locationId: 'rs-1' }),
			'1': basePlayer({ hand: [], locationId: 'dk-3' }),
		});
		G.manInBlack!.deck = ['mib-04'];
		G.endgamePhase = 'final_round';
		G.endgameFinalPassesRemaining = 1;
		G.endgameMibEpilogueResolved = false;
		const ev = events();
		progressEndgameAfterPass(G, { numPlayers: 2, playOrder: ['0', '1'], currentPlayer: '1' }, ev as never);
		expect(G.endgamePhase).toBe('done');
		expect(G.endgameMibEpilogueResolved).toBe(true);
		expect(G.manInBlack?.discard).toContain('mib-04');
		expect(G.manInBlackPending).toBeNull();
	});

	it('MIB epilogue (final round): async mib-01 then interaction commit reaches scoring phase', () => {
		const G = buildG({
			'0': basePlayer({ hand: pick(['K-hearts']), locationId: 'rs-1' }),
			'1': basePlayer({ hand: pick(['2-clubs']), locationId: 'dk-3' }),
		});
		G.manInBlack!.deck = ['mib-01'];
		G.fightDeck = ['fc-2', 'fc-3', 'fc-4'];
		G.endgamePhase = 'final_round';
		G.endgameFinalPassesRemaining = 1;
		G.endgameMibEpilogueResolved = false;
		const ev = events();
		progressEndgameAfterPass(G, { numPlayers: 2, playOrder: ['0', '1'], currentPlayer: '1' }, ev as never);
		expect(G.endgamePhase).toBe('final_round');
		expect(G.manInBlackPending?.kind).toBe('interaction');
		expect(G.mibDeferredPass?.purpose).toBe('completeEpilogue');

		const mibCommit = westernLegendsGameDef.game.moves!.manInBlackInteractionCommit!;
		mibCommit({ G, ctx: makeCtx('0'), events: ev, playerID: '0' } as never, 'K-hearts');
		expect(G.endgamePhase).toBe('done');
		expect(G.endgameMibEpilogueResolved).toBe(true);
		expect(G.manInBlackPending).toBeNull();
	});

	it('getGameOverResult: MIB wins when MIB LP ≥ top human LP after scoring', () => {
		const G = buildG(
			{
				'0': basePlayer({ hand: [], legendaryPoints: 20, locationId: 'rs-1' }),
				'1': basePlayer({ hand: [], legendaryPoints: 18, locationId: 'dk-3' }),
			},
			{ legendaryPoints: 25 },
		);
		performEndGameScoring(G);
		expect(getGameOverResult(G)).toEqual({ manInBlackWins: true });
	});
});
