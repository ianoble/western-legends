import type { Game, Ctx, FnContext } from 'boardgame.io';
import { TurnOrder } from 'boardgame.io/core';
import {
	createStandardDeck,
	shuffle,
	defineGame,
	redactCards,
	INVALID_MOVE,
	isCardHidden,
	type BaseGameState,
	type VisibleCard,
	type StandardCard,
} from '@engine/client';
import {
	applyDefenderDowngradeChallengerOneCard,
	bestPokerScoreFromHandAndFlopSaloon,
	compareFightPlayedCards,
	compareFightPlayedCardsWithRankPenalty,
	comparePokerScores,
	compareTwoCardPokerHands,
	compareThreeCardFight,
	pickBestTwoForFlopSaloon,
	saloonPickedHoleUsesRedTenBonus,
} from './poker';
import { actionBEffectKindForCardId, fightReactionPlayKind, pokerCardHasTiming } from './pokerCardEffects';
import { buildFightStartEffectQueue } from './fight';
import { movementPointsForEquippedMount as movementCapFromTurnMount } from './movementCap';
import { DEFAULT_MOVEMENT_POINTS, getReachableSpaceIds, getShortestPathLength } from '../map/boardGraph';
import {
	ARREST_JAIL_SPACE_ID,
	BANDIT_HIDEOUT_SPACE_IDS,
	NPC_SHERIFF_ID,
	banditNpcId,
	BOARD_SPACES_BY_ID,
	BOARD_STARTING_SPACE_ID,
	type MapBoardSpace,
	getBoardSpaceCity,
	getSheriffOfficeSpaceId,
	isInsideAnyBoardCity,
	isInsideRedFallsCity,
	spaceLabelForLog,
} from '../map/boardSpaces';
import { STARTER_CHARACTER_BY_ID, STARTER_CHARACTERS, characterHasStartSpaceChoices, type StarterCharacterDef } from './starterCharacters';
import { GENERAL_STORE_BASE_ITEM_IDS, GENERAL_STORE_COPIES_PER_BASE_ITEM } from '../data/itemCards';
import {
	buildManInBlackDeck,
	MIB_BANDIT_SPAWN_C_SPACE_IDS,
	MIB_HIDEOUT_CLIFF_C,
	MIB_HIDEOUT_DIXON_B,
	MIB_HIDEOUT_MESITO_A,
	MIB_HIDEOUT_SPIKE_C,
	MIB_HIDEOUT_SUNNY_A,
	MIB_HIDEOUT_SUNNY_B,
	MIB_RED_FALLS_CABARET_SPACE_ID,
} from '../data/manInBlackCards';
import {
	ITEM_UPGRADE_BASE,
	MOUNT_ITEM_ID_SET,
	WEAPON_ITEM_ID_SET,
	generalStoreStockLineId,
	isMiscItemId,
	uniqueMountOptions,
	uniqueWeaponOptions,
} from './equipment';
import {
	DEPOSIT_GOLD_PER_NUGGET,
	DEPOSIT_LP_PER_NUGGET,
	HEAL_COST_GOLD,
	HEIST_LOSE_WANTED,
	HEIST_WIN_GOLD,
	HEIST_WIN_WANTED,
	GENERAL_STORE_MAX_MISC_ITEMS,
	GENERAL_STORE_PRICES,
	LEGEND_POINTS_TO_WIN,
	MAX_NUGGETS,
	MAX_PLAYER_GOLD,
	MAX_ROUNDS,
	PLAYER_COLORS,
	POKER_ANTE_GOLD,
	PROSPECT_TAILINGS_GOLD,
	REVEL_GOLD_PER_LP,
	RUSTLE_BONUS_GOLD,
	RUSTLE_WANTED_POINTS,
	SALOON_HOUSE_ADDS_TO_POT,
	SALOON_WIN_LEGEND_POINTS,
	SHORT_GAME_LEGEND_GOAL,
	storyDiscsRequiredToResolve,
	STICK_EM_UP_RANK_STEPS_PER_PLAY,
	TURN_ACTIONS_PER_TURN,
	maxDiscreteTurnSlotsForPlayer,
	WORK_PAY_GOLD,
	WRANGLE_BONUS_GOLD,
	WRANGLE_MARSHAL_POINTS,
	LEGENDARY_ACTION_MIN_LP,
	START_TURN_INCOME_DRAW,
	START_TURN_INCOME_GOLD_ONLY,
	START_TURN_INCOME_SPLIT_DRAW,
	START_TURN_INCOME_SPLIT_GOLD,
	type GameLogEntry,
	type StartTurnIncomeOption,
	type TurnActionKind,
	type WesternLegendsGameOver,
	type WesternLegendsSetupData,
	type SaloonRevealEntry,
	type FightState,
	type FightKind,
	type FightOutcome,
	FIGHT_TIE_WINS,
	type BoardNpc,
	type CattleTokenFaceId,
	type WesternLegendsPlayer,
	type WesternLegendsState,
	type StoryInPlayEntry,
	type SheriffEncounterState,
	type ManInBlackPendingState,
	type MibDeferredPassContext,
	type MibDeferredPassPurpose,
	MAN_IN_BLACK_FIGHT_DEFENDER_ID,
	CATTLE_LEGACY_DEFAULT_FACE,
	CATTLE_TOKEN_FACE_IDS,
	isLivingLegendCardId,
} from './types';
import { formatStoryCardForLog, getStoryCardByCardId } from '../data/storyCardContent';
import { buildStoryCardDeck, getStoryCardBackMeta, type StoryBackKind } from '../data/storyCards';
import { buildInitialCattlePiles, normalizeCattleTokenColor } from './cattleTokens';
import { MARSHAL_TRACK_SPACE_REWARDS, WANTED_TRACK_SPACE_REWARDS } from './reputationTrackRewards';
import { applyStoryCardResolved } from './storyCardEffects';
import { contributorsForResolvedStoryRow } from './storyContributors';
import {
	buildInitialFightDeck,
	fightCardFaceToSyntheticPokerCard,
	highestOfThreeFightCardFaces,
	type FightCardFaceId,
} from './fightCards';
import { maxPokerHandSize } from './player-hand';
import { type ProspectFace, type ProspectMapDieOutcome, type ProspectSlotFaces, resolveProspectRoll, rollProspectDieSlot } from './prospect';

const MAX_LOG = 120;

/** 2P Man in Black draft pools (Jesse/Billy vs Wyatt/Bass). */
const MIB_LOBBY_OUTLAW_CHARACTER_IDS: readonly string[] = ['wl-20', 'wl-17'];
const MIB_LOBBY_MARSHAL_CHARACTER_IDS: readonly string[] = ['wl-21', 'wl-12'];
const MAN_IN_BLACK_RAIL_SPACE_ID = 'rs-1';
/** MIB duel/rob: challenger’s card counts as one rank lower vs MIB’s fight card. */
const MIB_VS_PLAYER_EXTRA_CHALLENGER_RANK_STEPS = 1;

function mibCharacterPoolValidIds(ids: readonly string[]): string[] {
	return ids.filter((id) => {
		const c = STARTER_CHARACTER_BY_ID[id];
		if (!c) return false;
		const spaceIds = c.startSpaceChoices && c.startSpaceChoices.length > 0 ? c.startSpaceChoices : [c.startSpaceId];
		return spaceIds.every((sid) => BOARD_SPACES_BY_ID[sid] != null);
	});
}

function isManInBlackVariant(G: WesternLegendsState): boolean {
	return G.manInBlackVariant === true && G.manInBlack != null;
}

function migrateManInBlackIfMissing(G: WesternLegendsState): void {
	if (G.manInBlackVariant === undefined) G.manInBlackVariant = false;
	if (!isManInBlackVariant(G)) {
		G.manInBlack = null;
		return;
	}
	if (G.manInBlack == null) {
		G.manInBlack = {
			locationId: MAN_IN_BLACK_RAIL_SPACE_ID,
			legendaryPoints: 0,
			color: 'orange',
			deck: buildManInBlackDeck(),
			discard: [],
		};
	} else {
		const mib = G.manInBlack;
		if (mib.deck.some((c) => c.startsWith('mib-stub')) || mib.deck.length === 0) {
			mib.deck = buildManInBlackDeck();
			mib.discard = [];
		}
	}
	if (G.endgameTriggeredByManInBlack === undefined) G.endgameTriggeredByManInBlack = false;
	if (G.endgamePendingMibFinalTurn === undefined) G.endgamePendingMibFinalTurn = false;
	if (G.endgameMibEpilogueResolved === undefined) G.endgameMibEpilogueResolved = false;
	if (G.manInBlackPending === undefined) G.manInBlackPending = null;
	if (G.mibDeferredPass === undefined) G.mibDeferredPass = null;
	if (G.mibDeferredPass != null) {
		const m = G.mibDeferredPass as MibDeferredPassContext & { purpose?: MibDeferredPassPurpose };
		if (m.purpose === undefined) {
			G.mibDeferredPass = { passerPlayerId: m.passerPlayerId, purpose: 'resumeRoundPass' };
		}
	}
}

/** End of game: gain 1 LP per this many dollars (floor; no rounding). */
const END_GAME_GOLD_PER_LEGEND_POINT = 60;

const GENERAL_STORE_BASE_ITEM_ID_SET = new Set<string>(GENERAL_STORE_BASE_ITEM_IDS);

/** LP gained when flipping to this upgrade at the General Store (printed on upgrade cards). */
const UPGRADE_FLIP_LEGEND_POINTS: Record<string, number> = {
	mule_upgrade: 1,
	mustang_upgrade: 2,
	revolver_upgrade: 1,
	rifle_upgrade: 1,
	shotgun_upgrade: 1,
};

function migrateEndgameStateIfMissing(G: WesternLegendsState): void {
	if (G.endgamePhase === undefined) G.endgamePhase = 'none';
	if (G.endgameTriggeredByPlayerId === undefined) G.endgameTriggeredByPlayerId = null;
	if (G.endgamePartialPassesRemaining === undefined) G.endgamePartialPassesRemaining = 0;
	if (G.endgameFinalPassesRemaining === undefined) G.endgameFinalPassesRemaining = 0;
	if (G.endgameTriggeredByManInBlack === undefined) G.endgameTriggeredByManInBlack = false;
	if (G.endgamePendingMibFinalTurn === undefined) G.endgamePendingMibFinalTurn = false;
	if (G.endgameMibEpilogueResolved === undefined) G.endgameMibEpilogueResolved = false;
}

function migratePlayerGoalTokensIfMissing(p: WesternLegendsPlayer): void {
	if (p.legendaryGoalTokens === undefined) p.legendaryGoalTokens = 0;
}

/** Matches boardgame.io `EventsAPI.endTurn` for `progressEndgameAfterPass`. */
type EndTurnEvents = { endTurn: (arg?: { next: string } | undefined) => void };

/**
 * Rulebook endgame progression after a successful `pass` (caller already logged “passed”).
 * @internal Exported for tests only.
 */
export function progressEndgameAfterPass(
	G: WesternLegendsState,
	ctx: Pick<Ctx, 'numPlayers' | 'playOrder' | 'currentPlayer'>,
	events: SaloonEvents,
): void {
	const p = G.players[ctx.currentPlayer];
	if (!p) {
		events.endTurn();
		return;
	}

	migrateEndgameStateIfMissing(G);
	migrateManInBlackIfMissing(G);
	const n = ctx.numPlayers;
	const order = ctx.playOrder;

	/** MIB reached LP goal after stub (runs same pass as last human in order). */
	if (
		isManInBlackVariant(G) &&
		G.manInBlack != null &&
		G.endgamePhase === 'none' &&
		G.manInBlack.legendaryPoints >= G.legendGoal
	) {
		G.endgameTriggeredByManInBlack = true;
		G.endgameTriggeredByPlayerId = null;
		G.endgamePhase = 'final_round';
		G.endgameFinalPassesRemaining = n;
		G.endgamePartialPassesRemaining = 0;
		G.endgameMibEpilogueResolved = false;
		appendLog(G, ctx.currentPlayer, `Man in Black reached ${G.legendGoal} LP — final round (${n} turn(s))`);
		events.endTurn({ next: order[0] });
		return;
	}

	if (G.endgamePhase === 'none' && p.legendaryPoints >= G.legendGoal) {
		G.endgameTriggeredByPlayerId = ctx.currentPlayer;
		const partialLeft = n - 1;
		if (partialLeft <= 0) {
			G.endgamePhase = 'final_round';
			G.endgameFinalPassesRemaining = n;
			G.endgamePartialPassesRemaining = 0;
			migrateManInBlackIfMissing(G);
			if (isManInBlackVariant(G)) G.endgameMibEpilogueResolved = false;
			appendLog(G, ctx.currentPlayer, `legend goal reached — final round (${n} turn(s) from first player)`);
			events.endTurn({ next: order[0] });
			return;
		}
		G.endgamePhase = 'finish_round';
		G.endgamePartialPassesRemaining = partialLeft;
		appendLog(
			G,
			ctx.currentPlayer,
			'legend goal reached — finish this round, then one final round from first player',
		);
		events.endTurn();
		return;
	}

	if (G.endgamePhase === 'finish_round') {
		G.endgamePartialPassesRemaining = (G.endgamePartialPassesRemaining ?? 0) - 1;
		if (G.endgamePartialPassesRemaining <= 0) {
			G.endgamePhase = 'final_round';
			G.endgameFinalPassesRemaining = n;
			migrateManInBlackIfMissing(G);
			if (isManInBlackVariant(G)) G.endgameMibEpilogueResolved = false;
			appendLog(G, ctx.currentPlayer, 'endgame: final round — first player’s turn');
			events.endTurn({ next: order[0] });
			return;
		}
		events.endTurn();
		return;
	}

	if (G.endgamePhase === 'final_round') {
		G.endgameFinalPassesRemaining = (G.endgameFinalPassesRemaining ?? 0) - 1;
		if (G.endgameFinalPassesRemaining <= 0) {
			migrateManInBlackIfMissing(G);
			if (isManInBlackVariant(G) && !G.endgameMibEpilogueResolved) {
				const epilogueSync = resolveManInBlackEpilogue(G, ctx, events);
				if (!epilogueSync) {
					events.endTurn();
					return;
				}
				G.endgameMibEpilogueResolved = true;
			}
			G.endgamePhase = 'done';
			appendLog(G, ctx.currentPlayer, 'endgame: scoring');
		}
		events.endTurn();
		return;
	}

	events.endTurn();
}

function grantMibLegendPoints(G: WesternLegendsState, delta: number, logPid: string, note: string): void {
	const mib = G.manInBlack;
	if (!mib || delta === 0) return;
	mib.legendaryPoints += delta;
	appendLog(G, logPid, `${note} (+${delta} LP → MIB now ${mib.legendaryPoints})`);
}

function shuffleMibDiscardIntoDeck(G: WesternLegendsState, logPid: string): void {
	const mib = G.manInBlack;
	if (!mib) return;
	mib.deck = shuffle([...mib.deck, ...mib.discard]);
	mib.discard = [];
	appendLog(G, logPid, 'Man in Black: shuffled discard pile into deck');
}

function bothPlayersLoseGoldMib(G: WesternLegendsState, amt: number, logLine: string): void {
	for (const pid of Object.keys(G.players)) {
		const pl = G.players[pid];
		if (!pl) continue;
		migratePlayerItemsIfMissing(pl);
		const pay = Math.min(amt, pl.gold);
		pl.gold = Math.max(0, pl.gold - pay);
	}
	appendLog(G, Object.keys(G.players)[0] ?? '0', logLine);
}

function applyMibDuelArrestIfWanted(G: WesternLegendsState, victimId: string, logPid: string): void {
	const def = G.players[victimId];
	if (!def || def.wantedPoints < 1) return;
	migratePlayerItemsIfMissing(def);
	const jail = sheriffJailSpaceIdForLocation(def.locationId);
	def.locationId = jail;
	def.wantedPoints = 0;
	def.carriedCattle = null;
	const goldLoss = Math.ceil(def.gold / 2);
	const nugLoss = Math.ceil(def.nuggets / 2);
	def.gold = Math.max(0, def.gold - goldLoss);
	def.nuggets = Math.max(0, def.nuggets - nugLoss);
	appendLog(G, logPid, `MIB: wanted ${victimId} arrested after losing — jailed to ${jail}`);
}

function getLeaderTargetInfo(G: WesternLegendsState): { targetId: string; leadersTied: boolean } {
	const ids = Object.keys(G.players);
	let maxLp = -1;
	for (const pid of ids) {
		const lp = G.players[pid]?.legendaryPoints ?? 0;
		if (lp > maxLp) maxLp = lp;
	}
	const leaders = ids.filter((pid) => (G.players[pid]?.legendaryPoints ?? 0) === maxLp).sort();
	return { targetId: leaders[0] ?? ids[0]!, leadersTied: leaders.length > 1 };
}

function removeBanditAtHideout(G: WesternLegendsState, spaceId: string): boolean {
	const b = findBanditNpcAtSpace(G, spaceId);
	if (!b) return false;
	G.boardNpcs = G.boardNpcs.filter((n) => n.id !== b.id);
	return true;
}

function spawnBanditOnHideoutMib(G: WesternLegendsState, spaceId: string): boolean {
	if (findBanditNpcAtSpace(G, spaceId) != null) return false;
	if (!BOARD_SPACES_BY_ID[spaceId]) return false;
	G.boardNpcs.push({ id: banditNpcId(spaceId), kind: 'bandit', spaceId });
	appendLog(G, '0', `MIB: bandit at ${spaceId}`);
	return true;
}

function transitionToEndgameScoringPhase(
	G: WesternLegendsState,
	ctx: Pick<Ctx, 'numPlayers' | 'playOrder' | 'currentPlayer'>,
	events: EndTurnEvents,
	logPlayerId: string,
): void {
	migrateEndgameStateIfMissing(G);
	migrateManInBlackIfMissing(G);
	G.endgameMibEpilogueResolved = true;
	G.endgamePhase = 'done';
	appendLog(G, logPlayerId, 'endgame: scoring');
	events.endTurn();
}

function finishMibDeferredProgressEndgame(
	G: WesternLegendsState,
	ctx: Pick<Ctx, 'numPlayers' | 'playOrder' | 'currentPlayer'>,
	events: SaloonEvents,
): void {
	const deferred = G.mibDeferredPass;
	const passer = deferred?.passerPlayerId;
	const purpose: MibDeferredPassPurpose = deferred?.purpose ?? 'resumeRoundPass';
	G.manInBlackPending = null;
	G.mibDeferredPass = null;
	fightClearActivePlayers(events);
	if (passer == null) return;
	if (purpose === 'completeEpilogue') {
		transitionToEndgameScoringPhase(G, ctx, events, passer);
		return;
	}
	progressEndgameAfterPass(G, { ...ctx, currentPlayer: passer }, events);
}

/**
 * @returns `true` if MIB resolution finished synchronously (caller should run endgame pass). `false` if pending async step.
 */
function dispatchManInBlackCard(
	G: WesternLegendsState,
	ctx: Pick<Ctx, 'numPlayers' | 'playOrder' | 'currentPlayer'>,
	events: SaloonEvents,
	cardId: string,
	passerId: string,
	deferPurpose: MibDeferredPassPurpose,
): boolean {
	const mib = G.manInBlack;
	if (!mib) return true;
	const order = ctx.playOrder;

	const startInteraction = (interaction: 'duel' | 'rob', mibCardId: string): boolean => {
		const { targetId, leadersTied } = getLeaderTargetInfo(G);
		const tp = G.players[targetId];
		if (!tp) return true;
		mib.locationId = tp.locationId;
		appendLog(
			G,
			passerId,
			`MIB (${mibCardId}): placed with leader ${targetId} at ${tp.locationId} — ${interaction}`,
		);
		G.manInBlackPending = {
			kind: 'interaction',
			mibCardId,
			interaction,
			targetPlayerId: targetId,
			leadersTied,
		};
		G.mibDeferredPass = { passerPlayerId: passerId, purpose: deferPurpose };
		events.setActivePlayers({ value: { [targetId]: 'mibCardAct' } });
		return false;
	};

	const runHideout = (
		hideoutId: string,
		opts: {
			lose10?: boolean;
			spawnBanditsC?: boolean;
			woundIfNoWound?: boolean;
			discardBoth?: boolean;
		},
	): boolean => {
		mib.locationId = hideoutId;
		const had = removeBanditAtHideout(G, hideoutId);
		if (had) {
			grantMibLegendPoints(G, 1, passerId, `MIB removed bandit at ${hideoutId}`);
			if (opts.lose10) bothPlayersLoseGoldMib(G, 10, `MIB (${cardId}): both players lose $10`);
			if (opts.spawnBanditsC) {
				for (const sid of MIB_BANDIT_SPAWN_C_SPACE_IDS) spawnBanditOnHideoutMib(G, sid);
			}
			if (opts.woundIfNoWound) {
				for (const pid of Object.keys(G.players)) {
					const pl = G.players[pid];
					if (pl && pl.wounds === 0) {
						pl.wounds += 1;
						appendLog(G, passerId, `MIB (${cardId}): ${pid} gains 1 wound (had none)`);
					}
				}
			}
			if (opts.discardBoth) {
				G.manInBlackPending = {
					kind: 'discardBoth',
					mibCardId: cardId,
					awaitingPlayerId: String(order[0]),
				};
				G.mibDeferredPass = { passerPlayerId: passerId, purpose: deferPurpose };
				events.setActivePlayers({ value: { [String(order[0])]: 'mibCardAct' } });
				return false;
			}
		} else {
			appendLog(G, passerId, `MIB (${cardId}): no bandit at ${hideoutId} — MIB still moves here`);
		}
		return true;
	};

	switch (cardId) {
		case 'mib-01':
		case 'mib-02':
			return startInteraction('duel', cardId);
		case 'mib-03':
			return startInteraction('rob', cardId);
		case 'mib-04':
			return runHideout(MIB_HIDEOUT_MESITO_A, { lose10: true });
		case 'mib-05':
			return runHideout(MIB_HIDEOUT_SUNNY_A, { lose10: true, spawnBanditsC: true });
		case 'mib-06':
			return runHideout(MIB_HIDEOUT_SUNNY_B, { woundIfNoWound: true });
		case 'mib-07':
			return runHideout(MIB_HIDEOUT_DIXON_B, { woundIfNoWound: true });
		case 'mib-08':
			return runHideout(MIB_HIDEOUT_SPIKE_C, { discardBoth: true });
		case 'mib-09':
			return runHideout(MIB_HIDEOUT_CLIFF_C, { discardBoth: true });
		case 'mib-10':
			return resolveMibCard10Cabaret(G, ctx, events, passerId, deferPurpose);
		default:
			appendLog(G, passerId, `Man in Black: unknown card ${cardId} (ignored)`);
			return true;
	}
}

function resolveMibCard10Cabaret(
	G: WesternLegendsState,
	ctx: Pick<Ctx, 'numPlayers' | 'playOrder' | 'currentPlayer'>,
	events: SaloonEvents,
	passerId: string,
	deferPurpose: MibDeferredPassPurpose,
): boolean {
	const mib = G.manInBlack!;
	mib.locationId = MIB_RED_FALLS_CABARET_SPACE_ID;
	const order = ctx.playOrder;
	const inRf = order.filter((pid) => {
		const pl = G.players[pid];
		return pl != null && isInsideRedFallsCity(pl.locationId);
	});

	if (inRf.length === 0) {
		grantMibLegendPoints(G, 1, passerId, 'MIB (cabaret): no players in Red Falls');
		shuffleMibDiscardIntoDeck(G, passerId);
		return true;
	}

	if (inRf.length === 2) {
		const a = drawFromPokerDeck(G, 2);
		const b = drawFromPokerDeck(G, 2);
		const p0 = G.players[order[0]!]!;
		const p1 = G.players[order[1]!]!;
		migratePlayerItemsIfMissing(p0);
		migratePlayerItemsIfMissing(p1);
		p0.hand.push(...a);
		p1.hand.push(...b);
		const cmp = compareTwoCardPokerHands(a, b);
		if (cmp === 0) {
			appendLog(G, passerId, 'MIB (cabaret): both in Red Falls — poker tie, neither wins');
		} else if (cmp > 0) {
			p0.legendaryPoints += 1;
			grantGold(p0, 50);
			appendLog(G, passerId, `MIB (cabaret): ${order[0]} wins vs ${order[1]} (+1 LP, +$50)`);
		} else {
			p1.legendaryPoints += 1;
			grantGold(p1, 50);
			appendLog(G, passerId, `MIB (cabaret): ${order[1]} wins vs ${order[0]} (+1 LP, +$50)`);
		}
		shuffleMibDiscardIntoDeck(G, passerId);
		return true;
	}

	const inRfPid = inRf[0]!;
	const proxyPid = order.find((x) => x !== inRfPid)!;
	const pIn = G.players[inRfPid]!;
	const pPx = G.players[proxyPid]!;
	migratePlayerItemsIfMissing(pIn);
	migratePlayerItemsIfMissing(pPx);
	const h2 = drawFromPokerDeck(G, 2);
	const h4 = drawFromPokerDeck(G, 4);
	pIn.hand.push(...h2);
	pPx.hand.push(...h4);
	const poolIds = h4.map((c) => c.id) as [string, string, string, string];
	const inRfIds = [h2[0]!.id, h2[1]!.id] as [string, string];
	G.manInBlackPending = {
		kind: 'cabaretProxyPick',
		inRfPlayerId: inRfPid,
		proxyPlayerId: proxyPid,
		inRfCardIds: inRfIds,
		mibPoolCardIds: poolIds,
	};
	G.mibDeferredPass = { passerPlayerId: passerId, purpose: deferPurpose };
	events.setActivePlayers({ value: { [proxyPid]: 'mibCardAct' } });
	appendLog(
		G,
		passerId,
		`MIB (cabaret): ${inRfPid} in Red Falls vs MIB (proxy ${proxyPid}) — pick 2 of 4 for MIB`,
	);
	return false;
}

function resolveManInBlackAfterRound(
	G: WesternLegendsState,
	ctx: Pick<Ctx, 'numPlayers' | 'playOrder' | 'currentPlayer'>,
	events: SaloonEvents,
): boolean {
	const mib = G.manInBlack;
	if (!mib) return true;
	const cardId = mib.deck.shift();
	if (cardId) mib.discard.push(cardId);
	appendLog(G, ctx.currentPlayer, cardId ? `Man in Black: drew ${cardId}` : 'Man in Black: deck empty');
	if (!cardId) return true;
	return dispatchManInBlackCard(G, ctx, events, cardId, ctx.currentPlayer, 'resumeRoundPass');
}

/**
 * @returns `true` if epilogue MIB resolution finished synchronously; `false` if players must resolve pending MIB moves first.
 */
function resolveManInBlackEpilogue(
	G: WesternLegendsState,
	ctx: Pick<Ctx, 'numPlayers' | 'playOrder' | 'currentPlayer'>,
	events: SaloonEvents,
): boolean {
	const mib = G.manInBlack;
	if (!mib) return true;
	const cardId = mib.deck.shift();
	if (cardId) mib.discard.push(cardId);
	appendLog(
		G,
		ctx.currentPlayer,
		cardId ? `Man in Black (final round): drew ${cardId}` : 'Man in Black (final round): deck empty',
	);
	if (!cardId) return true;
	return dispatchManInBlackCard(G, ctx, events, cardId, ctx.currentPlayer, 'completeEpilogue');
}

type WLCtx = FnContext<WesternLegendsState>;

type ProspectDieOutcome = Omit<ProspectMapDieOutcome, 'slotIndex'>;

function appendLog(G: WesternLegendsState, actorPlayerId: string, message: string): void {
	const player = G.players[actorPlayerId];
	const entry: GameLogEntry = { message, playerColor: player?.color };
	G.gameLog.push(entry);
	if (G.gameLog.length > MAX_LOG) G.gameLog.shift();
}

/** +LP for story resolution; used by {@link applyStoryCardResolved} and tests. */
export function grantLegendaryPointsForStory(
	G: WesternLegendsState,
	playerId: string,
	delta: number,
	logPid: string,
	reason: string,
): void {
	if (delta <= 0) return;
	const p = G.players[playerId];
	if (!p) return;
	p.legendaryPoints += delta;
	appendLog(G, logPid, `${reason}: +${delta} LP (now ${p.legendaryPoints} LP)`);
}

function grantGold(p: WesternLegendsPlayer, delta: number): void {
	p.gold = Math.min(MAX_PLAYER_GOLD, p.gold + delta);
}

function drawFromPokerDeck(G: WesternLegendsState, n: number): StandardCard[] {
	const out: StandardCard[] = [];
	for (let i = 0; i < n; i++) {
		if (G.pokerDeck.length === 0) {
			if (G.pokerDiscard.length === 0) break;
			G.pokerDeck = shuffle([...G.pokerDiscard]);
			G.pokerDiscard = [];
		}
		const c = G.pokerDeck.pop();
		if (c) out.push(c);
	}
	return out;
}

const MAX_REPUTATION_TRACK = 9;

/** Row LP for marshal/wanted 3×3 track (spaces 1–3 / 4–6 / 7–9) — end-of-turn wanted and end-of-game marshal. */
function trackRowLpGainForReputation(trackPoints: number): number {
	if (trackPoints <= 0) return 0;
	const slot = Math.min(MAX_REPUTATION_TRACK, trackPoints);
	if (slot <= 3) return 1;
	if (slot <= 6) return 2;
	return 3;
}

function applyReputationTrackSpaceRewards(
	G: WesternLegendsState,
	p: WesternLegendsPlayer,
	kind: 'marshal' | 'wanted',
	slot: number,
	logPid: string,
): void {
	const table = kind === 'marshal' ? MARSHAL_TRACK_SPACE_REWARDS : WANTED_TRACK_SPACE_REWARDS;
	const r = table[slot];
	if (!r) return;
	const parts: string[] = [];
	if (r.gold != null && r.gold !== 0) {
		grantGold(p, r.gold);
		parts.push(`+$${r.gold}`);
	}
	if (r.lp != null && r.lp !== 0) {
		p.legendaryPoints += r.lp;
		parts.push(`+${r.lp} LP`);
	}
	if (r.drawPoker != null && r.drawPoker > 0) {
		const drawn = drawFromPokerDeck(G, r.drawPoker);
		p.hand.push(...drawn);
		parts.push(drawn.length === r.drawPoker ? `drew ${drawn.length} poker` : `drew ${drawn.length}/${r.drawPoker} poker (deck empty)`);
	}
	if (r.sheriffActive === true) {
		parts.push('Sheriff Active (sheriff moves only while any player is wanted)');
	}
	if (parts.length) appendLog(G, logPid, `${kind} track space ${slot}: ${parts.join(', ')}`);
}

/**
 * Adds one disc to the first {@link StoryInPlayEntry} whose card back matches {@link backKind}
 * (marshal/wanted, wilderness, etc.). No-op if no matching row or at cap.
 */
function tryContributeStoryDiscForBackKind(
	G: WesternLegendsState,
	ctx: Pick<Ctx, 'currentPlayer' | 'numPlayers'> | undefined,
	playerId: string,
	backKind: StoryBackKind,
): void {
	if (!ctx || ctx.currentPlayer !== playerId) return;
	migrateStoryInPlayIfMissing(G);
	const numPlayers = ctx.numPlayers ?? Object.keys(G.players).length;
	const cap = storyDiscsRequiredToResolve(numPlayers, isManInBlackVariant(G));
	for (let si = 0; si < 2; si++) {
		const row = G.storyInPlay[si];
		if (row == null) continue;
		if (getStoryCardBackMeta(row.cardId)?.backKind !== backKind) continue;
		if (row.discs >= cap) return;
		row.discs += 1;
		const slotIndex = row.discs - 1;
		const slotCount = 3;
		if (!row.discSlotPlayerIds) {
			row.discSlotPlayerIds = Array.from({ length: slotCount }, () => null);
		} else {
			while (row.discSlotPlayerIds.length < slotCount) row.discSlotPlayerIds.push(null);
		}
		row.discSlotPlayerIds[slotIndex] = playerId;
		return;
	}
}

function tryContributeStoryDiscMarshalOrWanted(
	G: WesternLegendsState,
	ctx: Pick<Ctx, 'currentPlayer' | 'numPlayers'> | undefined,
	playerId: string,
): void {
	tryContributeStoryDiscForBackKind(G, ctx, playerId, 'gain_marshal_or_wanted_on_turn');
}

/**
 * Wanted gains: marshal and wanted are exclusive — any marshal progress is forfeited first, then this gain applies
 * from the current wanted position (usually 0 after a switch). Excess beyond space 9 becomes LP.
 *
 * Does **not** start a sheriff encounter. A player may become wanted while already on the sheriff’s hex
 * ({@link moveMoveToLocation} only blocks **entering** that hex while wanted).
 */
export function grantWantedPoints(
	G: WesternLegendsState,
	playerId: string,
	delta: number,
	logPid: string,
	reason: string,
	ctx?: Pick<Ctx, 'currentPlayer' | 'numPlayers'>,
): void {
	if (delta <= 0) return;
	const p = G.players[playerId];
	if (!p) return;
	migratePlayerItemsIfMissing(p);
	if (p.marshalPoints > 0) {
		appendLog(G, logPid, `${reason}: ${playerId} left marshal track (${p.marshalPoints} MP cleared) for wanted`);
		p.marshalPoints = 0;
	}
	const old = p.wantedPoints;
	const room = Math.max(0, MAX_REPUTATION_TRACK - old);
	const toTrack = Math.min(delta, room);
	const overflow = delta - toTrack;
	for (let s = old + 1; s <= old + toTrack; s++) {
		const slot = Math.min(MAX_REPUTATION_TRACK, s);
		applyReputationTrackSpaceRewards(G, p, 'wanted', slot, logPid);
	}
	p.wantedPoints = Math.min(MAX_REPUTATION_TRACK, old + toTrack);
	if (overflow > 0) {
		p.legendaryPoints += overflow;
		appendLog(G, logPid, `${reason}: +${overflow} LP (wanted track full)`);
	}
	if (toTrack > 0) appendLog(G, logPid, `${reason}: +${toTrack} Wanted (now ${p.wantedPoints} WP)`);
	if (toTrack > 0 && ctx?.currentPlayer === playerId) {
		p.pendingReputationSevenReaction = true;
	}
	if (toTrack > 0) tryContributeStoryDiscMarshalOrWanted(G, ctx, playerId);
}

/** Marshal gains only if not wanted ({@link wantedPoints} must be 0). Excess beyond space 9 becomes LP. */
export function grantMarshalPoints(
	G: WesternLegendsState,
	playerId: string,
	delta: number,
	logPid: string,
	reason: string,
	ctx?: Pick<Ctx, 'currentPlayer' | 'numPlayers'>,
): void {
	if (delta <= 0) return;
	const p = G.players[playerId];
	if (!p) return;
	migratePlayerItemsIfMissing(p);
	if (p.wantedPoints >= 1) {
		appendLog(G, logPid, `${reason}: +${delta} MP not applied (${playerId} is wanted)`);
		return;
	}
	const old = p.marshalPoints;
	const room = Math.max(0, MAX_REPUTATION_TRACK - old);
	const toTrack = Math.min(delta, room);
	const overflow = delta - toTrack;
	for (let s = old + 1; s <= old + toTrack; s++) {
		const slot = Math.min(MAX_REPUTATION_TRACK, s);
		applyReputationTrackSpaceRewards(G, p, 'marshal', slot, logPid);
	}
	p.marshalPoints = Math.min(MAX_REPUTATION_TRACK, old + toTrack);
	if (overflow > 0) {
		p.legendaryPoints += overflow;
		appendLog(G, logPid, `${reason}: +${overflow} LP (marshal track full)`);
	}
	if (toTrack > 0) appendLog(G, logPid, `${reason}: +${toTrack} Marshal (now ${p.marshalPoints} MP)`);
	if (toTrack > 0 && ctx?.currentPlayer === playerId) {
		p.pendingReputationSevenReaction = true;
	}
	if (toTrack > 0) tryContributeStoryDiscMarshalOrWanted(G, ctx, playerId);
}

export function performEndGameScoring(G: WesternLegendsState): void {
	if (G.endGameScored) return;
	G.endGameScored = true;
	G.endGameScoreBreakdown = {};

	const goalsOn = G.goalsVariant === true;

	for (const pid of Object.keys(G.players)) {
		const p = G.players[pid]!;
		migratePlayerItemsIfMissing(p);
		migratePlayerGoalTokensIfMissing(p);
		const lines: { label: string; vp: number }[] = [];

		let upgradeLp = 0;
		for (const id of p.ownedWeaponItemIds) {
			const add = UPGRADE_FLIP_LEGEND_POINTS[id];
			if (add != null) upgradeLp += add;
		}
		for (const id of p.ownedMountItemIds) {
			const add = UPGRADE_FLIP_LEGEND_POINTS[id];
			if (add != null) upgradeLp += add;
		}
		if (upgradeLp !== 0) {
			p.legendaryPoints += upgradeLp;
			lines.push({ label: 'Upgraded weapons & mounts', vp: upgradeLp });
		}

		const goldLp = Math.floor(p.gold / END_GAME_GOLD_PER_LEGEND_POINT);
		if (goldLp !== 0) {
			p.legendaryPoints += goldLp;
			lines.push({ label: `Gold (${END_GAME_GOLD_PER_LEGEND_POINT}$ = 1 LP)`, vp: goldLp });
		}

		if (p.wounds > 0) {
			p.legendaryPoints -= p.wounds;
			lines.push({ label: 'Wounds', vp: -p.wounds });
		}

		if (goalsOn && (p.legendaryGoalTokens ?? 0) > 0) {
			const gt = p.legendaryGoalTokens ?? 0;
			p.legendaryPoints += gt;
			lines.push({ label: 'Legendary goal tokens', vp: gt });
		}

		if (p.wantedPoints < 1) {
			const rowLp = trackRowLpGainForReputation(p.marshalPoints);
			if (rowLp > 0) {
				p.legendaryPoints += rowLp;
				lines.push({ label: 'Marshal track row', vp: rowLp });
			}
		}

		G.endGameScoreBreakdown[pid] = lines;
	}

	/**
	 * Most wanted (end of game): sole leader at max WP → +3 LP; tie for max → +1 LP each tied;
	 * every other wanted player (WP ≥ 1, not tied at max) → +1 LP.
	 */
	const wantedIds = Object.keys(G.players).filter((id) => (G.players[id]?.wantedPoints ?? 0) >= 1);
	if (wantedIds.length > 0) {
		const maxW = Math.max(...wantedIds.map((id) => G.players[id]!.wantedPoints));
		const leaders = wantedIds.filter((id) => G.players[id]!.wantedPoints === maxW);
		for (const pid of wantedIds) {
			const p = G.players[pid]!;
			const add = leaders.includes(pid) ? (leaders.length === 1 ? 3 : 1) : 1;
			p.legendaryPoints += add;
			const arr = G.endGameScoreBreakdown[pid] ?? [];
			arr.push({ label: 'Wanted track (most-wanted bonus)', vp: add });
			G.endGameScoreBreakdown[pid] = arr;
		}
	}

	for (const pid of Object.keys(G.players)) {
		const p = G.players[pid]!;
		const arr = G.endGameScoreBreakdown[pid] ?? [];
		arr.push({
			label: 'Tiebreak: reputation (MP+WP)',
			vp: p.marshalPoints + p.wantedPoints,
		});
		arr.push({ label: 'Tiebreak: nuggets', vp: p.nuggets });
		arr.push({ label: 'Tiebreak: wounds (fewer wins)', vp: p.wounds });
		arr.push({ label: 'Final legendary points', vp: p.legendaryPoints });
		G.endGameScoreBreakdown[pid] = arr;
	}
}

export function getGameOverResult(G: WesternLegendsState): WesternLegendsGameOver | undefined {
	if (!G.endGameScored) return undefined;
	const mib = G.manInBlack;
	const mibLp = mib?.legendaryPoints ?? 0;
	const pids = Object.keys(G.players);
	if (pids.length === 0) return undefined;
	const ranked = pids.map((pid) => {
		const p = G.players[pid];
		return {
			pid,
			lp: p.legendaryPoints,
			rep: p.marshalPoints + p.wantedPoints,
			nuggets: p.nuggets,
			wounds: p.wounds,
		};
	});
	ranked.sort(
		(a, b) =>
			b.lp - a.lp ||
			b.rep - a.rep ||
			b.nuggets - a.nuggets ||
			a.wounds - b.wounds,
	);
	const top = ranked[0];
	if (!top) return undefined;
	if (isManInBlackVariant(G) && mibLp >= top.lp) {
		if (mibLp > top.lp) return { manInBlackWins: true };
		return { manInBlackWins: true };
	}
	const tied = ranked.filter(
		(r) =>
			r.lp === top.lp && r.rep === top.rep && r.nuggets === top.nuggets && r.wounds === top.wounds,
	);
	if (tied.length > 1) return { sharedWinners: tied.map((t) => t.pid) };
	return { winner: top.pid };
}

function buildStoryDeck(): string[] {
	return buildStoryCardDeck();
}

function currentSpace(G: WesternLegendsState, playerId: string) {
	const p = G.players[playerId];
	if (!p) return undefined;
	return BOARD_SPACES_BY_ID[p.locationId];
}

function migrateSaloonRoundIfMissing(G: WesternLegendsState): void {
	if (G.saloonRound === undefined) G.saloonRound = null;
	else if (G.saloonRound != null && G.saloonRound.dealerShowdown === undefined) {
		G.saloonRound.dealerShowdown = null;
	}
}

function migrateSaloonRevealIfMissing(G: WesternLegendsState): void {
	if (G.saloonReveal === undefined) G.saloonReveal = null;
}

function migrateProspectRevealIfMissing(G: WesternLegendsState): void {
	if (G.prospectReveal === undefined) G.prospectReveal = null;
}

function migrateFightIfMissing(G: WesternLegendsState): void {
	if (G.fight === undefined) G.fight = null;
	else if (G.fight != null && G.fight.outcome === undefined) G.fight.outcome = null;
	if (G.fight != null && G.fight.kind === 'bandit') {
		if (G.fight.banditBountyMarshalBlocked !== true && G.fight.banditBountyMarshalBlocked !== false) {
			G.fight.banditBountyMarshalBlocked = false;
		}
		if (G.fight.npcFightCardApplied === undefined) G.fight.npcFightCardApplied = null;
	}
	if (G.fight != null && G.fight.kind === 'sheriffArrest') {
		if (G.fight.sheriffFightCardApplied === undefined) G.fight.sheriffFightCardApplied = null;
	}
	if (G.fight != null && G.fight.kind === 'manInBlack') {
		if (G.fight.mibFightCardResolved === undefined) G.fight.mibFightCardResolved = null;
	}
}

function migrateSheriffEncounterIfMissing(G: WesternLegendsState): void {
	if (G.sheriffEncounter === undefined) G.sheriffEncounter = null;
}

/** Wanted players who still owe a forced discard; those with no visible poker are skipped (logged). */
function filterSheriffForcedDiscardQueue(G: WesternLegendsState, wantedIds: readonly string[]): string[] {
	const out: string[] = [];
	for (const pid of wantedIds) {
		const p = G.players[pid];
		if (!p) continue;
		migratePlayerItemsIfMissing(p);
		if (p.hand.some((c) => c != null && !isCardHidden(c))) out.push(pid);
		else appendLog(G, pid, 'Sheriff arrival: no visible poker to discard (skipped)');
	}
	return out;
}

function migrateGeneralStoreStockIfMissing(G: WesternLegendsState): void {
	if (!G.generalStoreStock || typeof G.generalStoreStock !== 'object') {
		G.generalStoreStock = Object.fromEntries(GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]));
		return;
	}
	for (const id of GENERAL_STORE_BASE_ITEM_IDS) {
		const v = G.generalStoreStock[id];
		if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
			G.generalStoreStock[id] = GENERAL_STORE_COPIES_PER_BASE_ITEM;
		}
	}
}

/** Initial sheriff + bandits; exported for tests and manual state builders. */
export function buildInitialBoardNpcs(): BoardNpc[] {
	return [
		{
			id: NPC_SHERIFF_ID,
			kind: 'sheriff',
			spaceId: getSheriffOfficeSpaceId('darkrock'),
		},
		...BANDIT_HIDEOUT_SPACE_IDS.map((spaceId) => ({
			id: banditNpcId(spaceId),
			kind: 'bandit' as const,
			spaceId,
		})),
	];
}

function migrateBoardNpcsIfMissing(G: WesternLegendsState): void {
	if (!Array.isArray(G.boardNpcs)) {
		G.boardNpcs = buildInitialBoardNpcs();
	}
}

function migrateCattlePilesIfMissing(G: WesternLegendsState): void {
	const ok = G.cattlePiles != null && Array.isArray(G.cattlePiles.green) && Array.isArray(G.cattlePiles.blue);
	if (!ok) {
		G.cattlePiles = buildInitialCattlePiles();
	}
}

/** Rebuild fight deck + discard if absent (older saves). Exported for tests. */
export function migrateFightDeckIfMissing(G: WesternLegendsState): void {
	const ok = G.fightDeck != null && Array.isArray(G.fightDeck) && G.fightDiscard != null && Array.isArray(G.fightDiscard);
	if (!ok) {
		G.fightDeck = buildInitialFightDeck();
		G.fightDiscard = [];
	}
}

function maxDiscreteTurnSlots(p: WesternLegendsPlayer): number {
	return maxDiscreteTurnSlotsForPlayer(p);
}

function applyCattleProspectDieForToken(G: WesternLegendsState, actorId: string, p: WesternLegendsPlayer): void {
	const slot = rollProspectDieSlot(Math.random, 0);
	const parts: string[] = [];
	let sawGravel = false;
	for (const face of slot.faces) {
		const o = applyProspectFaceWithOutcome(p, face);
		parts.push(describeProspectOutcome(o, p));
		if (face === 'gravel') sawGravel = true;
	}
	if (sawGravel) {
		const drawn = drawFromPokerDeck(G, 1);
		if (drawn.length) p.hand.push(...drawn);
		parts.push(drawn.length ? 'gravel: drew 1 poker card' : 'gravel: deck empty');
	}
	appendLog(G, actorId, `cattle token: prospect die — ${parts.join('; ')}`);
}

function applyCattleTokenFace(G: WesternLegendsState, actorId: string, p: WesternLegendsPlayer, face: CattleTokenFaceId): void {
	migratePlayerItemsIfMissing(p);
	switch (face) {
		case 'cattle-prospect-die':
			applyCattleProspectDieForToken(G, actorId, p);
			break;
		case 'cattle-nugget': {
			const cap = maxNuggetsForPlayer(p);
			if (p.nuggets < cap) p.nuggets += 1;
			appendLog(G, actorId, p.nuggets >= cap ? 'cattle token: nugget (at carry cap)' : 'cattle token: +1 nugget');
			break;
		}
		case 'cattle-gold10-extra-action':
			grantGold(p, 10);
			p.bonusTurnSlots = (p.bonusTurnSlots ?? 0) + 1;
			appendLog(G, actorId, 'cattle token: +$10 and +1 action this turn');
			break;
		case 'cattle-gold40':
			grantGold(p, 40);
			appendLog(G, actorId, 'cattle token: +$40');
			break;
		case 'cattle-lp1':
			p.legendaryPoints += 1;
			appendLog(G, actorId, 'cattle token: +1 LP');
			break;
		case 'cattle-gold30-heal-wound':
			grantGold(p, 30);
			if (p.wounds > 0) p.wounds -= 1;
			appendLog(G, actorId, 'cattle token: +$30, −1 wound');
			break;
		case 'cattle-marshal-or-wanted':
			p.pendingCattleMarshalOrWanted = true;
			appendLog(G, actorId, 'cattle token: choose +1 Marshal or +1 Wanted');
			break;
		case 'cattle-gold30-draw': {
			grantGold(p, 30);
			const drawn = drawFromPokerDeck(G, 1);
			if (drawn.length) p.hand.push(...drawn);
			appendLog(G, actorId, drawn.length ? 'cattle token: +$30, drew 1 poker card' : 'cattle token: +$30 (deck empty)');
			break;
		}
		default:
			break;
	}
}

function moveChooseCattleTrackReward({ G, ctx, playerID }: WLCtx, pickArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid == null || pid !== ctx.currentPlayer) return INVALID_MOVE;
	if (pickArg !== 'marshal' && pickArg !== 'wanted') return INVALID_MOVE;
	const p = G.players[pid];
	if (!p) return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	if (!p.pendingCattleMarshalOrWanted) return INVALID_MOVE;
	if (pickArg === 'marshal') {
		if (p.wantedPoints >= 1) return INVALID_MOVE;
		delete p.pendingCattleMarshalOrWanted;
		grantMarshalPoints(G, pid, 1, pid, 'cattle reward', ctx);
	} else {
		delete p.pendingCattleMarshalOrWanted;
		grantWantedPoints(G, pid, 1, pid, 'cattle reward', ctx);
	}
}

/** One physical store copy removed for this weapon/mount line (base or upgrade). */
function consumeGeneralStoreLineForItem(G: WesternLegendsState, itemId: string): void {
	const line = generalStoreStockLineId(itemId);
	if (line == null) return;
	migrateGeneralStoreStockIfMissing(G);
	const cur = G.generalStoreStock[line] ?? 0;
	if (cur > 0) G.generalStoreStock[line] = cur - 1;
}

function saloonEligibleToRespond(G: WesternLegendsState, pid: string): boolean {
	const r = G.saloonRound;
	if (!r) return false;
	if (r.tieBreakCandidateIds != null) return false;
	return r.pendingPlayerIds.includes(pid);
}

type SaloonEvents = NonNullable<WLCtx['events']>;

/** Restore normal turn (only currentPlayer may act when null). */
function saloonClearActivePlayers(events: SaloonEvents): void {
	events.setActivePlayers({ value: {} });
}

/** Host waits; same-town pending seats may join or skip only. */
function saloonApplyJoinPhaseActivePlayers(events: SaloonEvents, r: NonNullable<WesternLegendsState['saloonRound']>): void {
	const value: Record<string, string> = { [r.activePlayerId]: 'saloonHostWait' };
	for (const pid of r.pendingPlayerIds) {
		value[pid] = 'saloonJoin';
	}
	events.setActivePlayers({ value });
}

function saloonApplyTieBreakActivePlayers(events: SaloonEvents, activePlayerId: string): void {
	events.setActivePlayers({ value: { [activePlayerId]: 'saloonTieBreak' } });
}

function saloonApplyHolePickActivePlayers(events: SaloonEvents, activePlayerId: string): void {
	events.setActivePlayers({ value: { [activePlayerId]: 'saloonHolePick' } });
}

/** Any seat may dismiss the post-Saloon summary (see validateMove). */
function saloonApplyRevealDismissActivePlayers(ctx: Ctx, events: SaloonEvents): void {
	events.setActivePlayers({ all: 'saloonDismiss' });
}

function fightClearActivePlayers(events: SaloonEvents): void {
	events.setActivePlayers({ value: {} });
}

function findBanditNpcAtSpace(G: WesternLegendsState, spaceId: string): BoardNpc | null {
	for (const n of G.boardNpcs) {
		if (n.kind === 'bandit' && n.spaceId === spaceId) return n;
	}
	return null;
}

function findSheriffNpc(G: WesternLegendsState): BoardNpc | null {
	for (const n of G.boardNpcs) {
		if (n.kind === 'sheriff') return n;
	}
	return null;
}

/**
 * Rulebook **Sheriff Active**: the sheriff may move only if there is at least one player on the wanted
 * track (`wantedPoints` ≥ 1). With no wanted players, sheriff movement is ignored (see {@link moveSheriffToSpace}).
 */
export function isSheriffActive(G: WesternLegendsState): boolean {
	return Object.values(G.players).some((p) => p != null && p.wantedPoints >= 1);
}

function npcSheriffOnSpace(G: WesternLegendsState, spaceId: string): boolean {
	return G.boardNpcs.some((n) => n.kind === 'sheriff' && n.spaceId === spaceId);
}

/**
 * Story / setup: place a bandit only if the hex has no bandit, no player, and no sheriff.
 * Exported for tests and future story card effects.
 */
export function spawnBanditOnSpaceIfAllowed(G: WesternLegendsState, spaceId: string): boolean {
	if (!BOARD_SPACES_BY_ID[spaceId]) return false;
	if (findBanditNpcAtSpace(G, spaceId) != null) return false;
	if (npcSheriffOnSpace(G, spaceId)) return false;
	for (const p of Object.values(G.players)) {
		if (p?.locationId === spaceId) return false;
	}
	G.boardNpcs.push({ id: banditNpcId(spaceId), kind: 'bandit', spaceId });
	appendLog(G, '0', `Bandit spawned at ${spaceId}`);
	return true;
}

/** Log bandit spawns from indexed story data; map placement is still TODO. */
function trySpawnBanditsFromStoryStub(G: WesternLegendsState, cardId: string): void {
	const c = getStoryCardByCardId(cardId);
	const n = c?.spawn_bandits ?? 0;
	if (n <= 0) return;
	appendLog(
		G,
		'0',
		`story: ${formatStoryCardForLog(cardId)} — place ${n} bandit(s) (location not automated)`,
	);
}

/** Log when printed sheriff movement exists; pathfinding not automated. */
function tryMoveSheriffFromStoryStub(G: WesternLegendsState, cardId: string): void {
	const c = getStoryCardByCardId(cardId);
	if (!c?.sheriff_move) return;
	appendLog(
		G,
		'0',
		`story: ${formatStoryCardForLog(cardId)} — Sheriff move (not automated)`,
	);
}

function returnBanditFightCardsToDeckBottom(G: WesternLegendsState, f: FightState): void {
	const opts = f.npcFightCardOptions;
	if (!opts || opts.length !== 2) return;
	const applied = f.npcFightCardApplied;
	const [o0, o1] = opts;
	const pair = applied != null ? [applied, applied === o0 ? o1 : o0] : [o0, o1];
	G.fightDeck.push(...shuffle(pair));
}

function returnSheriffFightCardsToDeckBottom(G: WesternLegendsState, f: FightState): void {
	const opts = f.sheriffFightCardOptions;
	if (!opts || opts.length !== 4) return;
	G.fightDeck.push(...shuffle([...opts]));
}

function returnManInBlackFightTripletToDeckBottom(G: WesternLegendsState, f: FightState): void {
	const t = f.mibFightCardTriplet;
	if (!t) return;
	G.fightDeck.push(...shuffle([...t]));
}

function fightRunRevealManInBlack(G: WesternLegendsState, f: FightState, events: SaloonEvents, ctx: Ctx): void {
	const challenger = G.players[f.challengerId]!;
	migratePlayerItemsIfMissing(challenger);
	const ch = f.challengerCommittedCard;
	if (!ch) return;
	const a = G.fightDeck.shift();
	const b = G.fightDeck.shift();
	const c3 = G.fightDeck.shift();
	if (a == null || b == null || c3 == null) {
		if (a) G.fightDeck.unshift(a);
		if (b) G.fightDeck.unshift(b);
		appendLog(G, f.challengerId, 'Man in Black fight: fight deck exhausted');
		f.revealCompareSummary = 'Fight deck exhausted.';
		f.outcome = 'defenderWins';
		snapshotFightOutcomeReveal(f);
		pushCommittedFightCardsToDiscard(G, f);
		enterFightOutcomePhase(G, events, f);
		return;
	}
	const triplet = [a, b, c3] as [FightCardFaceId, FightCardFaceId, FightCardFaceId];
	f.mibFightCardTriplet = triplet;
	const hi = highestOfThreeFightCardFaces(triplet);
	f.mibFightCardResolved = hi;
	const df = fightCardFaceToSyntheticPokerCard(hi);
	f.defenderCommittedCard = df;
	const cmp = compareFightPlayedCardsWithRankPenalty(
		ch,
		df,
		(f.challengerFightRankPenalty ?? 0) + MIB_VS_PLAYER_EXTRA_CHALLENGER_RANK_STEPS,
		f.defenderFightRankPenalty ?? 0,
	);
	let summary: string;
	if (cmp > 0) {
		f.outcome = 'challengerWins';
		summary = `Man in Black fight: you win (${ch.id} beats MIB ${hi})`;
	} else {
		f.outcome = 'defenderWins';
		summary =
			cmp < 0
				? `Man in Black fight: MIB wins (MIB ${hi} beats ${ch.id} after −1 rank to your card)`
				: `Man in Black fight: tie — MIB wins (${ch.id} vs ${hi})`;
	}
	f.revealCompareSummary = summary;
	appendLog(G, f.challengerId, summary);
	finishManInBlackFightRewards(G, events, f, ctx);
}

function finishManInBlackFightRewards(G: WesternLegendsState, events: SaloonEvents, f: FightState, ctx?: Ctx): void {
	const outcome = f.outcome;
	if (outcome == null) {
		appendLog(G, f.challengerId, 'Man in Black fight: internal error (no outcome)');
		snapshotFightOutcomeReveal(f);
		pushCommittedFightCardsToDiscard(G, f);
		returnManInBlackFightTripletToDeckBottom(G, f);
		f.revealCompareSummary = 'Man in Black fight: internal error (no outcome).';
		enterFightOutcomePhase(G, events, f);
		return;
	}

	snapshotFightOutcomeReveal(f);
	pushCommittedFightCardsToDiscard(G, f);
	returnManInBlackFightTripletToDeckBottom(G, f);

	const chPl = G.players[f.challengerId]!;
	migratePlayerItemsIfMissing(chPl);
	const mibKind = f.manInBlackFightKind ?? 'duel';

	if (outcome === 'defenderWins') {
		const bulletproof = f.challengerCommittedCard?.rank === 'J';
		if (bulletproof) {
			chPl.wounds = Math.max(0, chPl.wounds - 1);
			appendLog(G, f.challengerId, 'Bulletproof: no fight wound; heal 1');
		} else {
			applyFightLoserWoundDraw(G, f.challengerId);
		}
		appendLog(G, f.challengerId, 'Lost to Man in Black');
		enterFightOutcomePhase(G, events, f);
		return;
	}

	if (mibKind === 'duel') {
		chPl.legendaryPoints += 2;
		appendLog(G, f.challengerId, 'Duel won vs Man in Black: +2 LP');
		enterFightOutcomePhase(G, events, f);
		return;
	}

	grantWantedPoints(G, f.challengerId, 1, f.challengerId, 'rob MIB won', ctx);
	appendLog(G, f.challengerId, 'Rob vs Man in Black won: +1 WP — choose loot ($60 or 2 nuggets from supply)');
	f.phase = 'rewardRob';
	fightApplyActivePlayers(G, events, f);
}

function fightApplyActivePlayers(G: WesternLegendsState, events: SaloonEvents, f: FightState): void {
	const c = f.challengerId;
	const d = f.defenderId;
	if (f.kind === 'manInBlack') {
		if (f.phase === 'startEffects') {
			const step = f.startEffectQueue[f.startEffectQueueIndex];
			if (!step) {
				events.setActivePlayers({ value: { [c]: 'fightAct' } });
				return;
			}
			events.setActivePlayers({ value: { [step.actorId]: 'fightAct' } });
			return;
		}
		if (f.phase === 'challengerCard') {
			events.setActivePlayers({ value: { [c]: 'fightAct' } });
			return;
		}
		if (f.phase === 'outcome' || f.phase === 'rewardRob') {
			events.setActivePlayers({ value: { [c]: 'fightAct' } });
			return;
		}
	}
	if (f.phase === 'banditFightCard' || f.phase === 'sheriffFightCard') {
		const fighter = G.players[f.challengerId];
		migratePlayerItemsIfMissing(fighter!);
		if (fighter?.pendingBanditFightFighterChoice) {
			events.setActivePlayers({ value: { [c]: 'fightAct', [d]: 'fightWait' } });
			return;
		}
		events.setActivePlayers({ value: { [d]: 'fightAct', [c]: 'fightWait' } });
		return;
	}
	if (f.phase === 'startEffects') {
		const step = f.startEffectQueue[f.startEffectQueueIndex];
		if (!step) {
			events.setActivePlayers({ value: { [c]: 'fightAct', [d]: 'fightWait' } });
			return;
		}
		const actor = step.actorId;
		const waiter = actor === c ? d : c;
		events.setActivePlayers({ value: { [actor]: 'fightAct', [waiter]: 'fightWait' } });
		return;
	}
	if (f.phase === 'challengerCard') {
		events.setActivePlayers({ value: { [c]: 'fightAct', [d]: 'fightWait' } });
		return;
	}
	if (f.phase === 'defenderChoice') {
		events.setActivePlayers({ value: { [d]: 'fightAct', [c]: 'fightWait' } });
		return;
	}
	if (f.phase === 'reaction') {
		const turn = f.reactionTurn === 'challenger' ? c : d;
		const wait = turn === c ? d : c;
		events.setActivePlayers({ value: { [turn]: 'fightAct', [wait]: 'fightWait' } });
		return;
	}
	if (f.phase === 'outcome') {
		events.setActivePlayers({ value: { [c]: 'fightAct', [d]: 'fightAct' } });
		return;
	}
	if (f.phase === 'rewardRob') {
		events.setActivePlayers({ value: { [c]: 'fightAct', [d]: 'fightWait' } });
	}
}

function pullCardFromHandById(p: WesternLegendsPlayer, cardId: string): StandardCard | null {
	const idx = p.hand.findIndex((c) => !isCardHidden(c) && (c as StandardCard).id === cardId);
	if (idx < 0) return null;
	const [c] = p.hand.splice(idx, 1);
	return c as StandardCard;
}

function pushCommittedFightCardsToDiscard(G: WesternLegendsState, f: FightState): void {
	const a = f.challengerCommittedCard;
	const b = f.defenderCommittedCard;
	if (a) {
		G.pokerDiscard.push(a);
		f.challengerCommittedCard = null;
	}
	if (b) {
		G.pokerDiscard.push(b);
		f.defenderCommittedCard = null;
	}
}

/** Copy committed cards for {@link FightState.outcomeReveal} before they are discarded. */
function snapshotFightOutcomeReveal(f: FightState): void {
	const copy = (c: StandardCard | null): StandardCard | null => (c ? { ...c } : null);
	f.outcomeReveal = {
		challenger: copy(f.challengerCommittedCard),
		defender: copy(f.defenderCommittedCard),
	};
}

/** Terminal UI phase: both duelists dismiss via {@link moveDismissFightOutcome}. */
function enterFightOutcomePhase(G: WesternLegendsState, events: SaloonEvents, f: FightState): void {
	if (f.defenderDeclined) {
		const oc = f.outcomeReveal?.challenger ?? null;
		const line = oc ? `Defender declined — challenger wins. (Challenger played ${oc.id}.)` : `Defender declined — challenger wins.`;
		f.revealCompareSummary = f.revealCompareSummary ? `${f.revealCompareSummary} · ${line}` : line;
	}
	if (f.revealCompareSummary == null || f.revealCompareSummary === '') {
		const o = f.outcome;
		if (o === 'challengerWins') {
			f.revealCompareSummary = 'Challenger wins.';
		} else if (o === 'defenderWins') {
			f.revealCompareSummary = 'Defender wins.';
		} else {
			f.revealCompareSummary = 'Fight resolved.';
		}
	}
	f.phase = 'outcome';
	fightApplyActivePlayers(G, events, f);
}

/** J / Q bonuses when a poker card is committed as this duelist’s fight card (not post-reveal reactions). */
function applyCommittedPokerFightBonuses(G: WesternLegendsState, f: FightState, pid: string, card: StandardCard): void {
	if (card.rank === 'J') {
		appendLog(G, pid, 'Bulletproof: if you lose this fight, you take no fight wound and heal 1');
	}
	if (card.rank === 'Q' && (f.kind === 'bandit' || f.kind === 'sheriffArrest')) {
		f.quickdrawNegatesFightCard = true;
		appendLog(G, pid, 'Quickdraw: you may cancel the next fight card effect');
	}
}

function loserHasCommittedBulletproofJack(f: FightState, loserId: string): boolean {
	const c = loserId === f.challengerId ? f.challengerCommittedCard : f.defenderCommittedCard;
	return c != null && c.rank === 'J';
}

function applyFightLoserWoundDraw(G: WesternLegendsState, loserId: string): void {
	const p = G.players[loserId];
	if (!p) return;
	p.wounds += 1;
	const d = drawFromPokerDeck(G, 1);
	if (d[0]) p.hand.push(d[0]);
	appendLog(G, loserId, 'Fight: lost — +1 wound, drew 1 poker card');
}

function sheriffJailSpaceIdForLocation(_locId: string): string {
	return ARREST_JAIL_SPACE_ID;
}

/**
 * After reactions or decline: discard played cards, loser wound+draw, kind-specific rewards.
 * ROB win leaves `phase === 'rewardRob'` until {@link moveResolveFightRobLoot}.
 */
function finishFightRewardsOrEnterRobLoot(G: WesternLegendsState, events: SaloonEvents, f: FightState, ctx?: Ctx): void {
	const outcome = f.outcome;
	if (outcome == null) {
		appendLog(G, f.challengerId, 'Fight: internal error (no outcome)');
		snapshotFightOutcomeReveal(f);
		pushCommittedFightCardsToDiscard(G, f);
		f.revealCompareSummary = 'Fight: internal error (no outcome).';
		enterFightOutcomePhase(G, events, f);
		return;
	}

	if (f.kind === 'bandit') {
		finishBanditFightRewards(G, events, f);
		return;
	}

	if (f.kind === 'sheriffArrest') {
		finishSheriffArrestRewards(G, events, f);
		return;
	}

	const loserId = outcome === 'challengerWins' ? f.defenderId : f.challengerId;
	const loserBulletproof = loserHasCommittedBulletproofJack(f, loserId);

	snapshotFightOutcomeReveal(f);
	pushCommittedFightCardsToDiscard(G, f);

	const ch = G.players[f.challengerId]!;
	const def = G.players[f.defenderId]!;
	migratePlayerItemsIfMissing(ch);
	migratePlayerItemsIfMissing(def);

	if (loserBulletproof) {
		const lp = G.players[loserId]!;
		migratePlayerItemsIfMissing(lp);
		lp.wounds = Math.max(0, lp.wounds - 1);
		appendLog(G, loserId, 'Bulletproof: no fight wound; heal 1');
	} else {
		applyFightLoserWoundDraw(G, loserId);
	}

	if (outcome === 'challengerWins') {
		if (f.kind === 'duel') {
			ch.legendaryPoints += 2;
			appendLog(G, f.challengerId, 'Duel won: +2 LP');
		}
		if (f.kind === 'arrest') {
			grantMarshalPoints(G, f.challengerId, 1, f.challengerId, 'arrest succeeded', ctx);
			const jail = sheriffJailSpaceIdForLocation(def.locationId);
			def.locationId = jail;
			def.wantedPoints = 0;
			def.carriedCattle = null;
			const goldLoss = Math.ceil(def.gold / 2);
			const nugLoss = Math.ceil(def.nuggets / 2);
			def.gold = Math.max(0, def.gold - goldLoss);
			def.nuggets = Math.max(0, def.nuggets - nugLoss);
			appendLog(G, f.challengerId, `Arrest succeeded: +1 MP; jailed to ${jail}; target stripped (wanted/cattle/halved gold & nuggets)`);
		}
		if (f.kind === 'rob') {
			grantWantedPoints(G, f.challengerId, 1, f.challengerId, 'rob won', ctx);
			appendLog(G, f.challengerId, 'Rob won: +1 WP — choose loot');
			f.phase = 'rewardRob';
			fightApplyActivePlayers(G, events, f);
			return;
		}
	} else {
		if (f.kind === 'duel') {
			def.legendaryPoints += 2;
			appendLog(G, f.defenderId, 'Duel won: +2 LP');
		}
	}

	enterFightOutcomePhase(G, events, f);
}

function fightRunRevealAndEnterReaction(G: WesternLegendsState, f: FightState): void {
	const challenger = G.players[f.challengerId]!;
	const target = G.players[f.defenderId]!;
	migratePlayerItemsIfMissing(challenger);
	migratePlayerItemsIfMissing(target);
	const ch = f.challengerCommittedCard;
	const df = f.defenderCommittedCard;
	if (!ch || !df) return;
	const defWeapon = target.turnWeaponItemId;
	const defenderDowngrades = defWeapon === 'revolver_upgrade' || defWeapon === 'rifle_upgrade' || defWeapon === 'shotgun_upgrade';
	let chResolved: StandardCard[] = [ch];
	if (defenderDowngrades) {
		const down = applyDefenderDowngradeChallengerOneCard([ch], [df]);
		chResolved = down.challenger;
		if (down.summary != null) appendLog(G, f.defenderId, `${defWeapon}: ${down.summary}`);
	}
	const c0 = chResolved[0]!;
	const cmp = compareFightPlayedCards(c0, df);
	let summary: string;
	if (cmp > 0) {
		f.outcome = 'challengerWins';
		summary = `Fight reveal: CHALLENGER wins (${c0.id} vs ${df.id})`;
	} else if (cmp < 0) {
		f.outcome = 'defenderWins';
		summary = `Fight reveal: DEFENDER wins (${c0.id} vs ${df.id})`;
	} else {
		f.outcome = FIGHT_TIE_WINS === 'defender' ? 'defenderWins' : 'challengerWins';
		summary = `Fight reveal: TIE (${c0.id} vs ${df.id}) — ${FIGHT_TIE_WINS} wins`;
	}
	appendLog(G, f.challengerId, summary);
	f.revealCompareSummary = summary;
	f.phase = 'reaction';
	f.reactionTurn = 'challenger';
	f.reactionConsecutivePasses = 0;
}

/** Bandit fight: reveal poker but defer outcome until after fight card + fighter sub-choices. */
function fightRunRevealBandit(G: WesternLegendsState, f: FightState): void {
	const challenger = G.players[f.challengerId]!;
	const target = G.players[f.defenderId]!;
	migratePlayerItemsIfMissing(challenger);
	migratePlayerItemsIfMissing(target);
	const ch = f.challengerCommittedCard;
	const df = f.defenderCommittedCard;
	if (!ch || !df) return;
	const defWeapon = target.turnWeaponItemId;
	const defenderDowngrades = defWeapon === 'revolver_upgrade' || defWeapon === 'rifle_upgrade' || defWeapon === 'shotgun_upgrade';
	let chResolved: StandardCard[] = [ch];
	if (defenderDowngrades) {
		const down = applyDefenderDowngradeChallengerOneCard([ch], [df]);
		chResolved = down.challenger;
		if (down.summary != null) appendLog(G, f.defenderId, `${defWeapon}: ${down.summary}`);
	}
	const c0 = chResolved[0]!;
	const summary = `Bandit fight reveal: ${c0.id} vs ${df.id} — reactions, then fight card, then winner`;
	appendLog(G, f.challengerId, summary);
	f.revealCompareSummary = summary;
	f.outcome = null;
	f.phase = 'reaction';
	f.reactionTurn = 'challenger';
	f.reactionConsecutivePasses = 0;
}

/** Sheriff arrest: reveal poker; outcome fixed only after fight card + reactions (like bandit). */
function fightRunRevealSheriff(G: WesternLegendsState, f: FightState): void {
	const challenger = G.players[f.challengerId]!;
	const target = G.players[f.defenderId]!;
	migratePlayerItemsIfMissing(challenger);
	migratePlayerItemsIfMissing(target);
	const ch = f.challengerCommittedCard;
	const df = f.defenderCommittedCard;
	if (!ch || !df) return;
	const defWeapon = target.turnWeaponItemId;
	const defenderDowngrades = defWeapon === 'revolver_upgrade' || defWeapon === 'rifle_upgrade' || defWeapon === 'shotgun_upgrade';
	let chResolved: StandardCard[] = [ch];
	if (defenderDowngrades) {
		const down = applyDefenderDowngradeChallengerOneCard([ch], [df]);
		chResolved = down.challenger;
		if (down.summary != null) appendLog(G, f.defenderId, `${defWeapon}: ${down.summary}`);
	}
	const c0 = chResolved[0]!;
	const summary = `Sheriff arrest reveal: ${c0.id} vs ${df.id} — reactions, then fight card, then winner`;
	appendLog(G, f.challengerId, summary);
	f.revealCompareSummary = summary;
	f.outcome = null;
	f.phase = 'reaction';
	f.reactionTurn = 'challenger';
	f.reactionConsecutivePasses = 0;
}

function resolvedChallengerCardAndDefenderForCompare(G: WesternLegendsState, f: FightState): { c0: StandardCard; df: StandardCard } | null {
	const challenger = G.players[f.challengerId]!;
	const target = G.players[f.defenderId]!;
	migratePlayerItemsIfMissing(challenger);
	migratePlayerItemsIfMissing(target);
	const ch = f.challengerCommittedCard;
	const df = f.defenderCommittedCard;
	if (!ch || !df) return null;
	const defWeapon = target.turnWeaponItemId;
	const defenderDowngrades = defWeapon === 'revolver_upgrade' || defWeapon === 'rifle_upgrade' || defWeapon === 'shotgun_upgrade';
	let chResolved: StandardCard[] = [ch];
	if (defenderDowngrades) {
		const down = applyDefenderDowngradeChallengerOneCard([ch], [df]);
		chResolved = down.challenger;
	}
	return { c0: chResolved[0]!, df };
}

/** Re-score PvP fight after Stick Em Up reactions (rank penalties on committed cards). */
function recomputePvPFightOutcomeAfterStickEmUp(G: WesternLegendsState, f: FightState): void {
	if (f.kind !== 'duel' && f.kind !== 'rob' && f.kind !== 'arrest') return;
	const pair = resolvedChallengerCardAndDefenderForCompare(G, f);
	if (!pair) return;
	const cmp = compareFightPlayedCardsWithRankPenalty(pair.c0, pair.df, f.challengerFightRankPenalty ?? 0, f.defenderFightRankPenalty ?? 0);
	let summary: string;
	if (cmp > 0) {
		f.outcome = 'challengerWins';
		summary = `Fight (after reactions): challenger wins (${pair.c0.id} vs ${pair.df.id})`;
	} else if (cmp < 0) {
		f.outcome = 'defenderWins';
		summary = `Fight (after reactions): defender wins (${pair.c0.id} vs ${pair.df.id})`;
	} else {
		f.outcome = FIGHT_TIE_WINS === 'defender' ? 'defenderWins' : 'challengerWins';
		summary = `Fight (after reactions): tie (${pair.c0.id} vs ${pair.df.id}) — ${FIGHT_TIE_WINS} wins`;
	}
	appendLog(G, f.challengerId, summary);
	f.revealCompareSummary = `${f.revealCompareSummary ?? ''} · ${summary}`;
}

function sheriffArrestCompareAndFinish(G: WesternLegendsState, f: FightState, events: SaloonEvents, ctx?: Ctx): void {
	const challenger = G.players[f.challengerId]!;
	const target = G.players[f.defenderId]!;
	migratePlayerItemsIfMissing(challenger);
	migratePlayerItemsIfMissing(target);
	const ch = f.challengerCommittedCard;
	const df = f.defenderCommittedCard;
	if (!ch || !df) {
		appendLog(G, f.challengerId, 'Sheriff arrest: internal error (missing committed cards)');
		f.revealCompareSummary = 'Sheriff arrest: internal error (missing committed cards).';
		snapshotFightOutcomeReveal(f);
		enterFightOutcomePhase(G, events, f);
		return;
	}
	const defWeapon = target.turnWeaponItemId;
	const defenderDowngrades = defWeapon === 'revolver_upgrade' || defWeapon === 'rifle_upgrade' || defWeapon === 'shotgun_upgrade';
	let chResolved: StandardCard[] = [ch];
	if (defenderDowngrades) {
		const down = applyDefenderDowngradeChallengerOneCard([ch], [df]);
		chResolved = down.challenger;
	}
	const c0 = chResolved[0]!;
	const cmp = compareFightPlayedCardsWithRankPenalty(c0, df, f.challengerFightRankPenalty ?? 0, f.defenderFightRankPenalty ?? 0);
	let outcome: FightOutcome;
	let summary: string;
	if (cmp > 0) {
		outcome = 'challengerWins';
		summary = `Sheriff arrest: wanted escapes (${c0.id} beats ${df.id})`;
	} else if (cmp < 0) {
		outcome = 'defenderWins';
		summary = `Sheriff arrest: sheriff wins (${df.id} beats ${c0.id})`;
	} else {
		outcome = 'defenderWins';
		summary = `Sheriff arrest: tie (${c0.id} vs ${df.id}) — sheriff wins`;
	}
	f.outcome = outcome;
	f.revealCompareSummary = `${f.revealCompareSummary ?? ''} · ${summary}`;
	appendLog(G, f.challengerId, summary);
	finishFightRewardsOrEnterRobLoot(G, events, f, ctx);
}

function finishSheriffArrestRewards(G: WesternLegendsState, events: SaloonEvents, f: FightState): void {
	const outcome = f.outcome;
	if (outcome == null) {
		appendLog(G, f.challengerId, 'Sheriff arrest: internal error (no outcome)');
		snapshotFightOutcomeReveal(f);
		pushCommittedFightCardsToDiscard(G, f);
		returnSheriffFightCardsToDeckBottom(G, f);
		f.revealCompareSummary = 'Sheriff arrest: internal error (no outcome).';
		enterFightOutcomePhase(G, events, f);
		return;
	}

	const wantedBulletproof = outcome === 'defenderWins' && f.challengerCommittedCard != null && f.challengerCommittedCard.rank === 'J';

	snapshotFightOutcomeReveal(f);
	pushCommittedFightCardsToDiscard(G, f);
	returnSheriffFightCardsToDeckBottom(G, f);

	const wanted = G.players[f.challengerId]!;
	migratePlayerItemsIfMissing(wanted);

	if (outcome === 'defenderWins') {
		if (wantedBulletproof) {
			wanted.wounds = Math.max(0, wanted.wounds - 1);
			appendLog(G, f.challengerId, 'Bulletproof: no fight wound; heal 1');
		} else {
			applyFightLoserWoundDraw(G, f.challengerId);
		}
		const jail = sheriffJailSpaceIdForLocation(wanted.locationId);
		wanted.locationId = jail;
		wanted.wantedPoints = 0;
		wanted.carriedCattle = null;
		const goldLoss = Math.ceil(wanted.gold / 2);
		const nugLoss = Math.ceil(wanted.nuggets / 2);
		wanted.gold = Math.max(0, wanted.gold - goldLoss);
		wanted.nuggets = Math.max(0, wanted.nuggets - nugLoss);
		appendLog(G, f.challengerId, `Sheriff arrest succeeded: jailed to ${jail}; stripped (wanted/cattle/halved gold & nuggets)`);
		const sh = findSheriffNpc(G);
		if (sh) sh.spaceId = jail;
	} else {
		const sh = findSheriffNpc(G);
		if (sh) {
			const city = getBoardSpaceCity(sh.spaceId);
			sh.spaceId = city != null ? getSheriffOfficeSpaceId(city) : getSheriffOfficeSpaceId('darkrock');
		}
		appendLog(G, f.challengerId, 'Sheriff arrest: avoided capture — sheriff returns to office');
	}

	enterFightOutcomePhase(G, events, f);
}

function banditFightCompareAndFinish(G: WesternLegendsState, f: FightState, events: SaloonEvents, ctx?: Ctx): void {
	const challenger = G.players[f.challengerId]!;
	const target = G.players[f.defenderId]!;
	migratePlayerItemsIfMissing(challenger);
	migratePlayerItemsIfMissing(target);
	const ch = f.challengerCommittedCard;
	const df = f.defenderCommittedCard;
	if (!ch || !df) {
		appendLog(G, f.challengerId, 'Bandit fight: internal error (missing committed cards)');
		f.revealCompareSummary = 'Bandit fight: internal error (missing committed cards).';
		snapshotFightOutcomeReveal(f);
		enterFightOutcomePhase(G, events, f);
		return;
	}
	const defWeapon = target.turnWeaponItemId;
	const defenderDowngrades = defWeapon === 'revolver_upgrade' || defWeapon === 'rifle_upgrade' || defWeapon === 'shotgun_upgrade';
	let chResolved: StandardCard[] = [ch];
	if (defenderDowngrades) {
		const down = applyDefenderDowngradeChallengerOneCard([ch], [df]);
		chResolved = down.challenger;
	}
	const c0 = chResolved[0]!;
	const cmp = compareFightPlayedCardsWithRankPenalty(c0, df, f.challengerFightRankPenalty ?? 0, f.defenderFightRankPenalty ?? 0);
	let outcome: FightOutcome;
	let summary: string;
	if (cmp > 0) {
		outcome = 'challengerWins';
		summary = `Bandit fight: fighter wins (${c0.id} beats ${df.id})`;
	} else if (cmp < 0) {
		outcome = 'defenderWins';
		summary = `Bandit fight: bandit wins (${df.id} beats ${c0.id})`;
	} else {
		outcome = 'defenderWins';
		summary = `Bandit fight: tie (${c0.id} vs ${df.id}) — bandit wins`;
	}
	f.outcome = outcome;
	f.revealCompareSummary = `${f.revealCompareSummary ?? ''} · ${summary}`;
	appendLog(G, f.challengerId, summary);
	finishFightRewardsOrEnterRobLoot(G, events, f, ctx);
}

function finishBanditFightRewards(G: WesternLegendsState, events: SaloonEvents, f: FightState): void {
	const outcome = f.outcome;
	if (outcome == null) {
		appendLog(G, f.challengerId, 'Bandit fight: internal error (no outcome)');
		snapshotFightOutcomeReveal(f);
		pushCommittedFightCardsToDiscard(G, f);
		returnBanditFightCardsToDeckBottom(G, f);
		f.revealCompareSummary = 'Bandit fight: internal error (no outcome).';
		enterFightOutcomePhase(G, events, f);
		return;
	}

	const fighterBulletproof = outcome === 'defenderWins' && f.challengerCommittedCard != null && f.challengerCommittedCard.rank === 'J';

	snapshotFightOutcomeReveal(f);
	pushCommittedFightCardsToDiscard(G, f);

	const ch = G.players[f.challengerId]!;
	migratePlayerItemsIfMissing(ch);

	if (outcome === 'defenderWins') {
		if (fighterBulletproof) {
			ch.wounds = Math.max(0, ch.wounds - 1);
			appendLog(G, f.challengerId, 'Bulletproof: no fight wound; heal 1');
		} else {
			applyFightLoserWoundDraw(G, f.challengerId);
		}
		appendLog(G, f.challengerId, 'Lost to bandit');
	} else {
		if (ch.wantedPoints >= 1) {
			ch.legendaryPoints += 1;
			appendLog(G, f.challengerId, 'Beat bandit: +1 LP (wanted)');
		} else if (f.banditBountyMarshalBlocked) {
			ch.legendaryPoints += 1;
			appendLog(G, f.challengerId, 'Beat bandit: +1 LP (Marshal bounty blocked by fight card)');
		} else {
			ch.pendingBanditBountyChoice = true;
			appendLog(G, f.challengerId, 'Beat bandit: choose +1 LP or +1 MP');
		}
	}

	if (f.banditNpcId) {
		G.boardNpcs = G.boardNpcs.filter((n) => n.id !== f.banditNpcId);
	}
	returnBanditFightCardsToDeckBottom(G, f);

	enterFightOutcomePhase(G, events, f);
}

/**
 * Apply fight card text to the wanted fighter (challenger) in NPC fights. May set {@link WesternLegendsPlayer.pendingBanditFightFighterChoice}.
 * @returns true if the fighter must resolve a sub-choice before poker compare.
 */
function applyFightCardFaceEffectsToWantedFighter(G: WesternLegendsState, f: FightState, face: FightCardFaceId): boolean {
	const fighter = G.players[f.challengerId]!;
	const controllerId = f.defenderId;
	migratePlayerItemsIfMissing(fighter);

	if (f.quickdrawNegatesFightCard === true) {
		appendLog(G, controllerId, 'Quickdraw: fight card effect canceled');
		f.quickdrawNegatesFightCard = false;
		return false;
	}

	switch (face) {
		case 'fc-2':
			fighter.wounds += 1;
			fighter.legendaryPoints = Math.max(0, fighter.legendaryPoints - 1);
			appendLog(G, controllerId, 'Fight card: fighter +1 wound, −1 LP');
			break;
		case 'fc-3':
			fighter.wounds += 2;
			appendLog(G, controllerId, 'Fight card: fighter +2 wounds');
			break;
		case 'fc-4': {
			fighter.wounds += 1;
			const vis = fighter.hand.find((c) => !isCardHidden(c)) as StandardCard | undefined;
			if (vis) {
				const disc = pullCardFromHandById(fighter, vis.id);
				if (disc) G.pokerDiscard.push(disc);
				appendLog(G, controllerId, disc ? `Fight card: fighter +1 wound, discarded ${disc.id}` : 'Fight card: fighter +1 wound');
			} else {
				appendLog(G, controllerId, 'Fight card: fighter +1 wound (no card to discard)');
			}
			break;
		}
		case 'fc-5':
			fighter.wounds += 1;
			f.banditBountyMarshalBlocked = true;
			appendLog(G, controllerId, 'Fight card: fighter +1 wound; Marshal bounty blocked if they win');
			break;
		case 'fc-6':
			fighter.wounds += 1;
			appendLog(G, controllerId, 'Fight card: fighter +1 wound (cannot be canceled — not fully wired)');
			break;
		case 'fc-7':
			fighter.pendingBanditFightFighterChoice = 'fc-7';
			appendLog(G, controllerId, 'Fight card: fighter chooses wound or random discard');
			break;
		case 'fc-8':
			fighter.wounds += 1;
			appendLog(G, controllerId, 'Fight card: fighter +1 wound');
			break;
		case 'fc-9':
			fighter.pendingBanditFightFighterChoice = 'fc-9';
			f.banditBountyMarshalBlocked = true;
			appendLog(G, controllerId, 'Fight card: fighter chooses discard or −$10; Marshal bounty blocked if they win');
			break;
		case 'fc-10':
			appendLog(G, controllerId, 'Fight card fc-10 (cancel fight / redraw) — not fully implemented; continuing resolution');
			break;
		case 'fc-J':
			grantGold(fighter, 10);
			appendLog(G, controllerId, 'Fight card: fighter +$10');
			break;
		case 'fc-Q': {
			const drawn = drawFromPokerDeck(G, 1);
			if (drawn[0]) fighter.hand.push(drawn[0]);
			appendLog(G, controllerId, drawn[0] ? 'Fight card: fighter draws 1 poker card' : 'Fight card: fighter draws (deck empty)');
			break;
		}
		case 'fc-K':
			fighter.legendaryPoints += 1;
			appendLog(G, controllerId, 'Fight card: fighter +1 LP');
			break;
		case 'fc-A':
			fighter.pendingBanditFightFighterChoice = 'fc-A';
			appendLog(G, controllerId, 'Fight card: fighter chooses +1 LP, +1 Marshal, or +1 Wanted');
			break;
		default:
			break;
	}

	return !!fighter.pendingBanditFightFighterChoice;
}

/**
 * Apply chosen fight card for bandit fight (controller already picked index). May set fighter pending choice.
 * When no pending, advances to poker compare + finish.
 */
function applyBanditFightCardThenMaybeCompare(G: WesternLegendsState, f: FightState, face: FightCardFaceId, events: SaloonEvents, ctx?: Ctx): void {
	const fighter = G.players[f.challengerId]!;
	if (applyFightCardFaceEffectsToWantedFighter(G, f, face)) {
		fightApplyActivePlayers(G, events, f);
		return;
	}
	delete fighter.pendingBanditFightFighterChoice;
	banditFightCompareAndFinish(G, f, events, ctx);
}

function applySheriffFightCardThenMaybeCompare(G: WesternLegendsState, f: FightState, face: FightCardFaceId, events: SaloonEvents, ctx?: Ctx): void {
	const fighter = G.players[f.challengerId]!;
	if (applyFightCardFaceEffectsToWantedFighter(G, f, face)) {
		fightApplyActivePlayers(G, events, f);
		return;
	}
	delete fighter.pendingBanditFightFighterChoice;
	sheriffArrestCompareAndFinish(G, f, events, ctx);
}

function startBanditFight(G: WesternLegendsState, ctx: Ctx, events: SaloonEvents, banditNpcId: string, fighterId: string): void {
	migrateFightDeckIfMissing(G);
	migrateFightIfMissing(G);
	const fighter = G.players[fighterId];
	const controllerId = clockwiseNextPlayerId(ctx, G, fighterId);
	const controller = G.players[controllerId];
	if (!fighter || !controller) return;
	if (fighter.hand.length < 1) {
		appendLog(G, fighterId, 'Bandit encounter: no poker card — fight aborted');
		return;
	}
	if (controller.hand.length < 1) {
		appendLog(G, fighterId, 'Bandit encounter: bandit controller has no card — fighter wins by default');
		G.boardNpcs = G.boardNpcs.filter((n) => n.id !== banditNpcId);
		return;
	}

	const a = G.fightDeck.shift();
	const b = G.fightDeck.shift();
	if (a == null || b == null) {
		if (a) G.fightDeck.unshift(a);
		appendLog(G, fighterId, 'Bandit fight: fight deck exhausted');
		return;
	}

	migratePlayerItemsIfMissing(fighter);
	migratePlayerItemsIfMissing(controller);
	if (fighter.turnWeaponItemId === 'rifle' || fighter.turnWeaponItemId === 'rifle_upgrade') {
		logRiflePeekAtDefenderHand(G, fighterId, controller);
	}

	const queue = buildFightStartEffectQueue(fighter, fighterId, controller, controllerId);
	const phase = queue.length > 0 ? 'startEffects' : 'challengerCard';
	G.fight = {
		challengerId: fighterId,
		defenderId: controllerId,
		kind: 'bandit',
		phase,
		startEffectQueue: queue,
		startEffectQueueIndex: 0,
		challengerCommittedCard: null,
		defenderCommittedCard: null,
		defenderDeclined: false,
		outcome: null,
		revealCompareSummary: null,
		reactionTurn: 'challenger',
		reactionConsecutivePasses: 0,
		banditNpcId,
		npcFightCardOptions: [a, b],
		npcFightCardApplied: null,
		banditBountyMarshalBlocked: false,
	};
	appendLog(G, fighterId, `Bandit fight started vs ${banditNpcId} (controller: ${controllerId})`);
	fightApplyActivePlayers(G, events, G.fight);
}

function advanceFightAfterStartEffects(G: WesternLegendsState, f: FightState, events: SaloonEvents): void {
	f.phase = 'challengerCard';
	const ch = G.players[f.challengerId]!;
	if (ch.hand.length === 0) {
		appendLog(G, f.challengerId, 'Fight: no poker card to play — fight ends');
		if (f.kind === 'bandit' && f.npcFightCardOptions) {
			G.fightDeck.push(...shuffle([...f.npcFightCardOptions]));
		}
		if (f.kind === 'sheriffArrest' && f.sheriffFightCardOptions) {
			G.fightDeck.push(...shuffle([...f.sheriffFightCardOptions]));
		}
		f.revealCompareSummary = 'Fight ended: challenger has no poker card to play.';
		snapshotFightOutcomeReveal(f);
		enterFightOutcomePhase(G, events, f);
		return;
	}
	fightApplyActivePlayers(G, events, f);
}

function sheriffApplyEncounterActivePlayers(events: SaloonEvents, enc: SheriffEncounterState): void {
	if (enc.phase === 'chooseTarget') {
		events.setActivePlayers({ value: { [enc.moverId]: 'fightAct' } });
		return;
	}
	const value: Record<string, string> = {};
	for (const pid of enc.pendingDiscardPlayerIds) {
		value[pid] = 'fightAct';
	}
	events.setActivePlayers({ value });
}

function tryFinishSheriffEncounterDiscards(G: WesternLegendsState, ctx: Ctx, events: SaloonEvents): void {
	const enc = G.sheriffEncounter;
	if (!enc || enc.phase !== 'discard' || enc.pendingDiscardPlayerIds.length > 0) return;
	const arrestTargetId = enc.arrestTargetId;
	if (!arrestTargetId) return;
	G.sheriffEncounter = null;
	fightClearActivePlayers(events);
	startSheriffArrestFight(G, ctx, events, arrestTargetId);
}

function startSheriffArrestFight(G: WesternLegendsState, ctx: Ctx, events: SaloonEvents, wantedId: string): void {
	migrateFightDeckIfMissing(G);
	migrateFightIfMissing(G);
	if (G.fight != null) return;
	const wanted = G.players[wantedId];
	const controllerId = clockwiseNextPlayerId(ctx, G, wantedId);
	const controller = G.players[controllerId];
	if (!wanted || !controller || wanted.wantedPoints < 1) return;
	if (controller.hand.length < 1) {
		appendLog(G, wantedId, 'Sheriff arrest: sheriff controller has no poker card — aborted');
		return;
	}
	migratePlayerItemsIfMissing(wanted);
	const visibleWanted = wanted.hand.some((c) => c != null && !isCardHidden(c));
	if (!visibleWanted) {
		appendLog(G, wantedId, 'Sheriff arrest: wanted has no poker card to play — aborted');
		return;
	}

	const drawn: FightCardFaceId[] = [];
	for (let i = 0; i < 4; i++) {
		const c = G.fightDeck.shift();
		if (c == null) {
			for (const d of drawn) G.fightDeck.unshift(d);
			appendLog(G, wantedId, 'Sheriff arrest: fight deck exhausted');
			return;
		}
		drawn.push(c);
	}
	const quad = drawn as [FightCardFaceId, FightCardFaceId, FightCardFaceId, FightCardFaceId];

	migratePlayerItemsIfMissing(controller);
	if (wanted.turnWeaponItemId === 'rifle' || wanted.turnWeaponItemId === 'rifle_upgrade') {
		logRiflePeekAtDefenderHand(G, wantedId, controller);
	}

	const queue = buildFightStartEffectQueue(wanted, wantedId, controller, controllerId);
	const phase = queue.length > 0 ? 'startEffects' : 'challengerCard';
	G.fight = {
		challengerId: wantedId,
		defenderId: controllerId,
		kind: 'sheriffArrest',
		phase,
		startEffectQueue: queue,
		startEffectQueueIndex: 0,
		challengerCommittedCard: null,
		defenderCommittedCard: null,
		defenderDeclined: false,
		outcome: null,
		revealCompareSummary: null,
		reactionTurn: 'challenger',
		reactionConsecutivePasses: 0,
		sheriffFightCardOptions: quad,
		sheriffFightCardApplied: null,
	};
	appendLog(G, wantedId, `Sheriff arrest fight (controller: ${controllerId})`);
	fightApplyActivePlayers(G, events, G.fight);
}

/**
 * Core sheriff relocation + encounter pipeline. Does **not** consume a `fight` turn slot.
 * Use {@link moveManhuntSheriff} from a player turn (consumes `card` slot).
 *
 * **Arrest:** only after the sheriff **moves** to `destinationId` and one or more **wanted** players
 * are on that space. Gaining wanted while already sharing the hex does not run this pipeline
 * ({@link grantWantedPoints} does not call here).
 */
/** @internal Exported for sheriff encounter tests. */
export function moveSheriffToSpace(G: WesternLegendsState, ctx: Ctx, events: SaloonEvents, destinationId: string, moverId: string): void {
	migrateSheriffEncounterIfMissing(G);
	if (!isSheriffActive(G)) {
		appendLog(G, moverId, 'Sheriff movement: ignored (Sheriff Active — no wanted players, sheriff cannot move)');
		return;
	}
	if (!BOARD_SPACES_BY_ID[destinationId]) return;
	const sh = findSheriffNpc(G);
	if (!sh) return;
	if (G.fight != null) return;
	if (G.sheriffEncounter != null) return;

	sh.spaceId = destinationId;
	appendLog(G, moverId, `Sheriff moved to ${destinationId}`);

	const wantedHere = Object.keys(G.players)
		.filter((pid) => {
			const p = G.players[pid];
			return p != null && p.wantedPoints >= 1 && p.locationId === destinationId;
		})
		.sort();
	if (wantedHere.length === 0) return;

	if (wantedHere.length >= 2) {
		G.sheriffEncounter = {
			phase: 'chooseTarget',
			spaceId: destinationId,
			wantedPlayerIds: wantedHere,
			moverId,
			arrestTargetId: null,
			pendingDiscardPlayerIds: [],
		};
		sheriffApplyEncounterActivePlayers(events, G.sheriffEncounter);
		return;
	}

	const only = wantedHere[0]!;
	const need = filterSheriffForcedDiscardQueue(G, wantedHere);
	G.sheriffEncounter = {
		phase: 'discard',
		spaceId: destinationId,
		wantedPlayerIds: wantedHere,
		moverId,
		arrestTargetId: only,
		pendingDiscardPlayerIds: need,
	};
	if (need.length === 0) tryFinishSheriffEncounterDiscards(G, ctx, events);
	else sheriffApplyEncounterActivePlayers(events, G.sheriffEncounter);
}

function normalizeFightKind(k: unknown): FightKind | null {
	if (k === 'arrest' || k === 'duel' || k === 'rob') return k;
	return null;
}

/** True if this turn’s PvP fight list already contains `playerId` (string-normalized for BGIO seat ids). */
function pvpFightTargetsIncludes(list: string[] | undefined, playerId: string): boolean {
	if (list == null || list.length === 0) return false;
	const want = String(playerId);
	return list.some((x) => String(x) === want);
}

function getPvpFightTargetsThisTurn(p: WesternLegendsPlayer): string[] {
	if (!Array.isArray(p.pvpFightTargetsThisTurn)) p.pvpFightTargetsThisTurn = [];
	return p.pvpFightTargetsThisTurn;
}

/** Rulebook C: both duelists record the pairing so neither can start another arrest/duel/rob vs the other this turn. */
function registerPvpFightPairingThisTurn(G: WesternLegendsState, challengerId: string, defenderId: string): void {
	const c = String(challengerId);
	const d = String(defenderId);
	const challenger = G.players[c];
	const defender = G.players[d];
	if (!challenger || !defender) return;
	migratePlayerItemsIfMissing(challenger);
	migratePlayerItemsIfMissing(defender);
	const chList = getPvpFightTargetsThisTurn(challenger);
	const dfList = getPvpFightTargetsThisTurn(defender);
	if (!pvpFightTargetsIncludes(chList, d)) chList.push(d);
	if (!pvpFightTargetsIncludes(dfList, c)) dfList.push(c);
}

function moveStartFight({ G, ctx, events }: WLCtx, kindArg: unknown, targetIdArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateFightIfMissing(G);
	if (G.fight != null) return INVALID_MOVE;
	migrateSheriffEncounterIfMissing(G);
	if (G.sheriffEncounter != null) return INVALID_MOVE;
	migrateSaloonRoundIfMissing(G);
	if (G.saloonRound != null) return INVALID_MOVE;
	migrateProspectRevealIfMissing(G);
	if (G.prospectReveal != null) return INVALID_MOVE;

	const kind = normalizeFightKind(kindArg);
	const targetId = typeof targetIdArg === 'string' ? targetIdArg : null;
	const challengerId = String(ctx.currentPlayer);
	if (kind == null || targetId == null || targetId === challengerId) return INVALID_MOVE;

	if (targetId === MAN_IN_BLACK_FIGHT_DEFENDER_ID) {
		migrateManInBlackIfMissing(G);
		if (!isManInBlackVariant(G) || !G.manInBlack) return INVALID_MOVE;
		if (kind === 'arrest') return INVALID_MOVE;
		const challengerMib = G.players[challengerId];
		if (!challengerMib) return INVALID_MOVE;
		migratePlayerItemsIfMissing(challengerMib);
		if (challengerMib.locationId !== G.manInBlack.locationId) return INVALID_MOVE;
		if (challengerMib.hand.length < 1) return INVALID_MOVE;
		if (challengerMib.turnActions.includes('fight')) return INVALID_MOVE;
		if (!takeDiscreteTurnSlot(challengerMib, 'fight')) return INVALID_MOVE;
		if (challengerMib.turnWeaponItemId === 'rifle' || challengerMib.turnWeaponItemId === 'rifle_upgrade') {
			appendLog(G, challengerId, 'Rifle: peek at Man in Black (no hidden hand)');
		}
		const mibStandIn = {
			...challengerMib,
			characterId: null,
			legendaryPoints: 0,
			characterOffers: null,
		} as WesternLegendsPlayer;
		const mibQueue = buildFightStartEffectQueue(
			challengerMib,
			challengerId,
			mibStandIn,
			MAN_IN_BLACK_FIGHT_DEFENDER_ID,
		).filter((s) => s.actorId !== MAN_IN_BLACK_FIGHT_DEFENDER_ID);
		const mibPhase = mibQueue.length > 0 ? 'startEffects' : 'challengerCard';
		G.fight = {
			challengerId,
			defenderId: MAN_IN_BLACK_FIGHT_DEFENDER_ID,
			kind: 'manInBlack',
			manInBlackFightKind: kind === 'rob' ? 'rob' : 'duel',
			phase: mibPhase,
			startEffectQueue: mibQueue,
			startEffectQueueIndex: 0,
			challengerCommittedCard: null,
			defenderCommittedCard: null,
			defenderDeclined: false,
			outcome: null,
			revealCompareSummary: null,
			reactionTurn: 'challenger',
			reactionConsecutivePasses: 0,
		};
		appendLog(G, challengerId, `Fight started (${kind}) vs Man in Black`);
		fightApplyActivePlayers(G, events, G.fight);
		return;
	}

	const challenger = G.players[challengerId];
	const defender = G.players[targetId];
	if (!challenger || !defender) return INVALID_MOVE;
	migratePlayerItemsIfMissing(challenger);
	migratePlayerItemsIfMissing(defender);
	if (challenger.locationId !== defender.locationId) return INVALID_MOVE;
	if (kind === 'arrest') {
		if (challenger.marshalPoints < 1) return INVALID_MOVE;
		if (defender.wantedPoints < 1) return INVALID_MOVE;
	}
	if (challenger.hand.length < 1) return INVALID_MOVE;
	/** One PvP fight (arrest / duel / rob) per turn — matches a single `fight` discrete slot. */
	if (challenger.turnActions.includes('fight')) return INVALID_MOVE;
	if (pvpFightTargetsIncludes(challenger.pvpFightTargetsThisTurn, targetId)) return INVALID_MOVE;
	if (!takeDiscreteTurnSlot(challenger, 'fight')) return INVALID_MOVE;

	if (challenger.turnWeaponItemId === 'rifle' || challenger.turnWeaponItemId === 'rifle_upgrade') {
		logRiflePeekAtDefenderHand(G, challengerId, defender);
	}

	const queue = buildFightStartEffectQueue(challenger, challengerId, defender, targetId);
	const phase = queue.length > 0 ? 'startEffects' : 'challengerCard';
	G.fight = {
		challengerId,
		defenderId: targetId,
		kind,
		phase,
		startEffectQueue: queue,
		startEffectQueueIndex: 0,
		challengerCommittedCard: null,
		defenderCommittedCard: null,
		defenderDeclined: false,
		outcome: null,
		revealCompareSummary: null,
		reactionTurn: 'challenger',
		reactionConsecutivePasses: 0,
	};
	registerPvpFightPairingThisTurn(G, challengerId, targetId);
	appendLog(G, challengerId, `Fight started (${kind}) vs ${targetId}`);
	fightApplyActivePlayers(G, events, G.fight);
}

function moveResolveFightStartEffect({ G, ctx, events, playerID }: WLCtx, choiceArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateFightIfMissing(G);
	const f = G.fight;
	if (!f || f.phase !== 'startEffects') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid == null) return INVALID_MOVE;
	const step = f.startEffectQueue[f.startEffectQueueIndex];
	if (!step || step.actorId !== pid) return INVALID_MOVE;
	const p = G.players[pid]!;
	if (step.kind === 'annieOakleyOpponent') {
		if (choiceArg === '__wound__') {
			p.wounds += 1;
			appendLog(G, pid, 'Start of fight: took 1 wound (vs discard — Annie Oakley)');
		} else if (typeof choiceArg === 'string') {
			const rem = pullCardFromHandById(p, choiceArg);
			if (!rem) return INVALID_MOVE;
			G.pokerDiscard.push(rem);
			appendLog(G, pid, `Start of fight: discarded ${rem.id} (Annie Oakley)`);
		} else return INVALID_MOVE;
	} else return INVALID_MOVE;

	f.startEffectQueueIndex += 1;
	if (f.startEffectQueueIndex >= f.startEffectQueue.length) {
		advanceFightAfterStartEffects(G, f, events);
	} else {
		fightApplyActivePlayers(G, events, f);
	}
}

function moveFightCommitChallengerCard({ G, ctx, events, playerID }: WLCtx, cardIdArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateFightIfMissing(G);
	const f = G.fight;
	if (!f || f.phase !== 'challengerCard') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid !== f.challengerId) return INVALID_MOVE;
	if (typeof cardIdArg !== 'string') return INVALID_MOVE;
	const challenger = G.players[f.challengerId]!;
	const card = pullCardFromHandById(challenger, cardIdArg);
	if (!card) return INVALID_MOVE;
	f.challengerCommittedCard = card;
	applyCommittedPokerFightBonuses(G, f, f.challengerId, card);
	if (f.kind === 'manInBlack') {
		fightRunRevealManInBlack(G, f, events, ctx);
		return;
	}
	f.phase = 'defenderChoice';
	fightApplyActivePlayers(G, events, f);
}

function moveFightDefenderDecline({ G, ctx, events, playerID }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateFightIfMissing(G);
	const f = G.fight;
	if (!f || f.phase !== 'defenderChoice') return INVALID_MOVE;
	if (f.kind === 'bandit' || f.kind === 'sheriffArrest') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid !== f.defenderId) return INVALID_MOVE;
	f.defenderDeclined = true;
	f.outcome = 'challengerWins';
	appendLog(G, f.challengerId, 'Fight: defender declined — challenger wins');
	finishFightRewardsOrEnterRobLoot(G, events, f, ctx);
}

function moveFightDefenderCommitCard({ G, ctx, events, playerID }: WLCtx, cardIdArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateFightIfMissing(G);
	const f = G.fight;
	if (!f || f.phase !== 'defenderChoice') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid !== f.defenderId) return INVALID_MOVE;
	if (typeof cardIdArg !== 'string') return INVALID_MOVE;
	const defender = G.players[f.defenderId]!;
	const card = pullCardFromHandById(defender, cardIdArg);
	if (!card) return INVALID_MOVE;
	f.defenderCommittedCard = card;
	applyCommittedPokerFightBonuses(G, f, f.defenderId, card);
	if (f.kind === 'bandit') {
		fightRunRevealBandit(G, f);
	} else if (f.kind === 'sheriffArrest') {
		fightRunRevealSheriff(G, f);
	} else {
		fightRunRevealAndEnterReaction(G, f);
	}
	fightApplyActivePlayers(G, events, f);
}

function moveSheriffArrestDecline({ G, ctx, events, playerID }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateFightIfMissing(G);
	const f = G.fight;
	if (!f || f.kind !== 'sheriffArrest' || f.phase !== 'challengerCard') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid !== f.challengerId) return INVALID_MOVE;
	f.outcome = 'defenderWins';
	appendLog(G, f.challengerId, 'Sheriff arrest: wanted declined to fight — arrested');
	finishSheriffArrestRewards(G, events, f);
}

function moveChooseBanditFightCard({ G, ctx, events, playerID }: WLCtx, indexArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateFightIfMissing(G);
	const f = G.fight;
	if (!f || f.kind !== 'bandit' || f.phase !== 'banditFightCard') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid !== f.defenderId) return INVALID_MOVE;
	if (indexArg !== 0 && indexArg !== 1) return INVALID_MOVE;
	const opts = f.npcFightCardOptions;
	if (!opts || opts.length !== 2) return INVALID_MOVE;
	const fighter = G.players[f.challengerId]!;
	migratePlayerItemsIfMissing(fighter);
	if (fighter.pendingBanditFightFighterChoice) return INVALID_MOVE;
	const face = opts[indexArg]!;
	f.npcFightCardApplied = face;
	applyBanditFightCardThenMaybeCompare(G, f, face, events, ctx);
}

function moveResolveBanditFightFighterChoice({ G, ctx, events, playerID }: WLCtx, arg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateFightIfMissing(G);
	const f = G.fight;
	if (!f) return INVALID_MOVE;
	const phaseOk = (f.kind === 'bandit' && f.phase === 'banditFightCard') || (f.kind === 'sheriffArrest' && f.phase === 'sheriffFightCard');
	if (!phaseOk) return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid !== f.challengerId) return INVALID_MOVE;
	const fighter = G.players[f.challengerId]!;
	migratePlayerItemsIfMissing(fighter);
	const pending = fighter.pendingBanditFightFighterChoice;
	if (!pending) return INVALID_MOVE;

	if (pending === 'fc-7') {
		if (arg === '__wound__') {
			fighter.wounds += 1;
			appendLog(G, f.defenderId, 'Fight card: fighter took wound (vs random discard)');
		} else if (typeof arg === 'string') {
			const c = pullCardFromHandById(fighter, arg);
			if (!c) return INVALID_MOVE;
			G.pokerDiscard.push(c);
			appendLog(G, f.defenderId, `Fight card: fighter discarded ${c.id} (vs wound)`);
		} else return INVALID_MOVE;
	} else if (pending === 'fc-9') {
		if (arg === '__gold10__') {
			fighter.gold = Math.max(0, fighter.gold - 10);
			appendLog(G, f.defenderId, 'Fight card: fighter paid $10 (vs discard)');
		} else if (typeof arg === 'string') {
			const c = pullCardFromHandById(fighter, arg);
			if (!c) return INVALID_MOVE;
			G.pokerDiscard.push(c);
			appendLog(G, f.defenderId, `Fight card: fighter discarded ${c.id} (vs $10)`);
		} else return INVALID_MOVE;
	} else if (pending === 'fc-A') {
		if (arg === 'lp') {
			fighter.legendaryPoints += 1;
			appendLog(G, f.defenderId, 'Fight card: fighter +1 LP');
		} else if (arg === 'marshal') {
			grantMarshalPoints(G, f.challengerId, 1, f.defenderId, 'fight card fc-A', ctx);
			appendLog(G, f.defenderId, 'Fight card: fighter +1 Marshal');
		} else if (arg === 'wanted') {
			grantWantedPoints(G, f.challengerId, 1, f.defenderId, 'fight card fc-A', ctx);
			appendLog(G, f.defenderId, 'Fight card: fighter +1 Wanted');
		} else return INVALID_MOVE;
	}

	delete fighter.pendingBanditFightFighterChoice;
	if (f.kind === 'sheriffArrest') {
		sheriffArrestCompareAndFinish(G, f, events, ctx);
	} else {
		banditFightCompareAndFinish(G, f, events, ctx);
	}
}

function moveChooseSheriffFightCard({ G, ctx, events, playerID }: WLCtx, indexArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateFightIfMissing(G);
	const f = G.fight;
	if (!f || f.kind !== 'sheriffArrest' || f.phase !== 'sheriffFightCard') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid !== f.defenderId) return INVALID_MOVE;
	if (indexArg !== 0 && indexArg !== 1 && indexArg !== 2 && indexArg !== 3) return INVALID_MOVE;
	const opts = f.sheriffFightCardOptions;
	if (!opts || opts.length !== 4) return INVALID_MOVE;
	const fighter = G.players[f.challengerId]!;
	migratePlayerItemsIfMissing(fighter);
	if (fighter.pendingBanditFightFighterChoice) return INVALID_MOVE;
	const face = opts[indexArg]!;
	f.sheriffFightCardApplied = face;
	applySheriffFightCardThenMaybeCompare(G, f, face, events, ctx);
}

function moveChooseSheriffArrestTarget({ G, ctx, events, playerID }: WLCtx, wantedIdArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateSheriffEncounterIfMissing(G);
	const enc = G.sheriffEncounter;
	if (!enc || enc.phase !== 'chooseTarget') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid !== enc.moverId) return INVALID_MOVE;
	if (typeof wantedIdArg !== 'string' || !enc.wantedPlayerIds.includes(wantedIdArg)) return INVALID_MOVE;
	enc.arrestTargetId = wantedIdArg;
	enc.phase = 'discard';
	enc.pendingDiscardPlayerIds = filterSheriffForcedDiscardQueue(G, enc.wantedPlayerIds);
	appendLog(G, pid, `Sheriff: arrest target chosen — ${wantedIdArg}`);
	if (enc.pendingDiscardPlayerIds.length === 0) tryFinishSheriffEncounterDiscards(G, ctx, events);
	else sheriffApplyEncounterActivePlayers(events, enc);
}

function moveSheriffEncounterDiscard({ G, ctx, events, playerID }: WLCtx, cardIdArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateSheriffEncounterIfMissing(G);
	const enc = G.sheriffEncounter;
	if (!enc || enc.phase !== 'discard') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid == null || !enc.pendingDiscardPlayerIds.includes(pid)) return INVALID_MOVE;
	if (typeof cardIdArg !== 'string') return INVALID_MOVE;
	const p = G.players[pid];
	if (!p) return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	const card = pullCardFromHandById(p, cardIdArg);
	if (!card) return INVALID_MOVE;
	G.pokerDiscard.push(card);
	appendLog(G, pid, `Sheriff arrival: discarded ${card.id} (forced)`);
	enc.pendingDiscardPlayerIds = enc.pendingDiscardPlayerIds.filter((id) => id !== pid);
	if (enc.pendingDiscardPlayerIds.length === 0) {
		tryFinishSheriffEncounterDiscards(G, ctx, events);
	} else {
		sheriffApplyEncounterActivePlayers(events, enc);
	}
}

/** @deprecated Prefer `useCardAction` with a Manhunt (4) card id and sheriff destination. */
function moveManhuntSheriff(ctx: WLCtx, cardIdArg: unknown, spaceIdArg: unknown) {
	return moveUseCardAction(ctx, cardIdArg, spaceIdArg);
}

function moveChooseBanditBountyReward({ G, ctx, playerID }: WLCtx, pickArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid == null) return INVALID_MOVE;
	const p = G.players[pid];
	if (!p) return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	if (!p.pendingBanditBountyChoice) return INVALID_MOVE;
	if (pickArg !== 'lp' && pickArg !== 'marshal') return INVALID_MOVE;
	if (pickArg === 'marshal' && p.wantedPoints >= 1) return INVALID_MOVE;
	delete p.pendingBanditBountyChoice;
	if (pickArg === 'lp') {
		p.legendaryPoints += 1;
		appendLog(G, pid, 'Bandit bounty: +1 LP');
	} else {
		grantMarshalPoints(G, pid, 1, pid, 'bandit bounty', ctx);
	}
}

function moveFightReactionPass({ G, ctx, events, playerID }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateFightIfMissing(G);
	const f = G.fight;
	if (!f || f.phase !== 'reaction') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid == null) return INVALID_MOVE;
	const must = f.reactionTurn === 'challenger' ? f.challengerId : f.defenderId;
	if (pid !== must) return INVALID_MOVE;
	f.reactionConsecutivePasses += 1;
	if (f.reactionConsecutivePasses >= 2) {
		if (f.kind === 'bandit') {
			appendLog(G, f.challengerId, 'Fight: reactions done — bandit controller chooses fight card');
			f.phase = 'banditFightCard';
			f.reactionConsecutivePasses = 0;
			fightApplyActivePlayers(G, events, f);
			return;
		}
		if (f.kind === 'sheriffArrest') {
			appendLog(G, f.challengerId, 'Fight: reactions done — sheriff controller chooses fight card');
			f.phase = 'sheriffFightCard';
			f.reactionConsecutivePasses = 0;
			fightApplyActivePlayers(G, events, f);
			return;
		}
		recomputePvPFightOutcomeAfterStickEmUp(G, f);
		appendLog(G, f.challengerId, 'Fight: reactions done — applying rewards');
		finishFightRewardsOrEnterRobLoot(G, events, f, ctx);
		return;
	}
	f.reactionTurn = f.reactionTurn === 'challenger' ? 'defender' : 'challenger';
	fightApplyActivePlayers(G, events, f);
}

function moveFightReactionPlay({ G, ctx, events, playerID }: WLCtx, cardIdArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateFightIfMissing(G);
	const f = G.fight;
	if (!f || f.phase !== 'reaction') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid == null) return INVALID_MOVE;
	const must = f.reactionTurn === 'challenger' ? f.challengerId : f.defenderId;
	if (pid !== must) return INVALID_MOVE;
	if (typeof cardIdArg !== 'string') return INVALID_MOVE;
	const p = G.players[pid]!;
	const card = pullCardFromHandById(p, cardIdArg);
	if (!card) return INVALID_MOVE;

	const rxKind = fightReactionPlayKind(card.id);
	if (rxKind == null) {
		p.hand.push(card);
		return INVALID_MOVE;
	}

	G.pokerDiscard.push(card);
	maybeInstinctsDiscardDraw(G, pid, p, card.id);

	if (rxKind === 'stick_em_up') {
		if (pid === f.challengerId) {
			f.defenderFightRankPenalty = (f.defenderFightRankPenalty ?? 0) + STICK_EM_UP_RANK_STEPS_PER_PLAY;
			appendLog(
				G,
				pid,
				`Stick Em Up: opponent’s card counts as −${STICK_EM_UP_RANK_STEPS_PER_PLAY} ranks (${f.defenderFightRankPenalty} total steps)`,
			);
		} else {
			f.challengerFightRankPenalty = (f.challengerFightRankPenalty ?? 0) + STICK_EM_UP_RANK_STEPS_PER_PLAY;
			appendLog(
				G,
				pid,
				`Stick Em Up: opponent’s card counts as −${STICK_EM_UP_RANK_STEPS_PER_PLAY} ranks (${f.challengerFightRankPenalty} total steps)`,
			);
		}
	} else if (rxKind === 'shootout') {
		appendLog(G, pid, 'Shootout: cancel fight and refight — not fully implemented');
	}

	f.reactionConsecutivePasses = 0;
	f.reactionTurn = f.reactionTurn === 'challenger' ? 'defender' : 'challenger';
	fightApplyActivePlayers(G, events, f);
}

function moveResolveFightRobLoot({ G, ctx, events, playerID }: WLCtx, stealArg: unknown, takeCattleArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateFightIfMissing(G);
	const f = G.fight;
	if (!f || f.phase !== 'rewardRob') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid !== f.challengerId) return INVALID_MOVE;
	if (stealArg !== 'gold' && stealArg !== 'nuggets') return INVALID_MOVE;
	const takeCattle = takeCattleArg === true;
	const ch = G.players[f.challengerId]!;
	migratePlayerItemsIfMissing(ch);
	if (f.kind === 'manInBlack') {
		if (takeCattle) return INVALID_MOVE;
		if (stealArg === 'gold') {
			grantGold(ch, 60);
			appendLog(G, f.challengerId, 'Rob MIB: took $60 from supply');
		} else {
			const cap = maxNuggetsForPlayer(ch);
			ch.nuggets = Math.min(cap, ch.nuggets + 2);
			appendLog(G, f.challengerId, 'Rob MIB: took 2 gold nuggets from supply');
		}
		enterFightOutcomePhase(G, events, f);
		return;
	}
	const def = G.players[f.defenderId]!;
	migratePlayerItemsIfMissing(def);

	if (stealArg === 'gold') {
		const amt = Math.ceil(def.gold / 2);
		def.gold = Math.max(0, def.gold - amt);
		grantGold(ch, amt);
		appendLog(G, f.challengerId, `Rob: stole ${amt} gold`);
	} else {
		const amt = Math.ceil(def.nuggets / 2);
		def.nuggets = Math.max(0, def.nuggets - amt);
		const cap = maxNuggetsForPlayer(ch);
		ch.nuggets = Math.min(cap, ch.nuggets + amt);
		appendLog(G, f.challengerId, `Rob: stole ${amt} nugget(s)`);
	}

	if (takeCattle) {
		if (def.carriedCattle == null) return INVALID_MOVE;
		if (ch.carriedCattle != null) return INVALID_MOVE;
		ch.carriedCattle = def.carriedCattle;
		def.carriedCattle = null;
		appendLog(G, f.challengerId, 'Rob: took cattle token');
	}

	enterFightOutcomePhase(G, events, f);
}

function moveDismissFightOutcome({ G, ctx, events, playerID }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateFightIfMissing(G);
	const f = G.fight;
	if (!f || f.phase !== 'outcome') return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (f.kind === 'manInBlack') {
		if (pid !== f.challengerId) return INVALID_MOVE;
	} else if (pid !== f.challengerId && pid !== f.defenderId) return INVALID_MOVE;
	G.fight = null;
	fightClearActivePlayers(events);
}

function resolveSaloonRound(G: WesternLegendsState, ctx: Ctx, events: SaloonEvents): void {
	const r = G.saloonRound;
	if (!r) return;
	if (r.pendingPlayerIds.length > 0) return;
	if (r.tieBreakCandidateIds != null) return;
	if (r.dealerShowdown != null) return;

	const flop = r.flop;
	const joined = r.joinedPlayerIds.filter((pid) => G.players[pid] != null);
	if (joined.length <= 0) {
		G.pokerDiscard.push(...flop);
		G.saloonRound = null;
		saloonClearActivePlayers(events);
		return;
	}

	const scores = joined.map((pid) => ({
		pid,
		score: bestPokerScoreFromHandAndFlopSaloon(G.players[pid].hand as StandardCard[], flop),
	}));
	let best = scores[0]!;
	for (const s of scores.slice(1)) {
		if (comparePokerScores(s.score, best.score) > 0) best = s;
	}
	const tied = scores.filter((s) => comparePokerScores(s.score, best.score) === 0).map((s) => s.pid);

	if (tied.length > 1 && !tied.includes(r.activePlayerId)) {
		r.tieBreakCandidateIds = tied;
		saloonApplyTieBreakActivePlayers(events, r.activePlayerId);
		return;
	}

	const winner = tied.includes(r.activePlayerId) ? r.activePlayerId : tied[0]!;
	const pot = r.potGold;

	const ranked: SaloonRevealEntry[] = joined
		.map((pid) => {
			const hand = G.players[pid]!.hand as StandardCard[];
			return {
				playerId: pid,
				role: 'player' as const,
				holeCards: pickBestTwoForFlopSaloon(hand, flop),
				score: bestPokerScoreFromHandAndFlopSaloon(hand, flop),
			};
		})
		.sort((a, b) => comparePokerScores(b.score, a.score));

	const wp = G.players[winner]!;
	const goldBeforeW = wp.gold;
	const lpBeforeW = wp.legendaryPoints;
	grantGold(wp, pot);
	wp.legendaryPoints += SALOON_WIN_LEGEND_POINTS;
	migratePlayerItemsIfMissing(wp);
	if (wp.ownedMiscItemIds.includes('hat')) {
		wp.legendaryPoints += 1;
	}

	const losers = joined.filter((pid) => pid !== winner);
	for (const pid of losers) {
		const lp = G.players[pid];
		if (!lp) continue;
		const hand = lp.hand as StandardCard[];
		const hole = pickBestTwoForFlopSaloon(hand, flop);
		if (saloonPickedHoleUsesRedTenBonus(hole)) {
			grantGold(lp, 30);
			appendLog(G, pid, 'Poker bonus (red 10): +$30 (lost showdown)');
		}
		const d = drawFromPokerDeck(G, 1);
		if (d[0]) lp.hand.push(d[0]);
		if (saloonPickedHoleUsesRedTenBonus(hole)) {
			const d2 = drawFromPokerDeck(G, 1);
			if (d2[0]) {
				lp.hand.push(d2[0]);
				appendLog(G, pid, 'Poker bonus (red 10): drew 1 extra card (lost showdown)');
			}
		}
		migratePlayerItemsIfMissing(lp);
		if (lp.ownedMiscItemIds.includes('hat')) {
			grantGold(lp, 10);
		}
	}

	appendLog(
		G,
		r.activePlayerId,
		`Saloon: ${winner} won ${pot} gold and +${SALOON_WIN_LEGEND_POINTS} LP (${joined.length} player(s))${
			wp.ownedMiscItemIds.includes('hat') ? '; Ten-Gallon Hat: winner +1 LP' : ''
		}`,
	);

	const notes: string[] = [];
	if (wp.ownedMiscItemIds.includes('hat')) {
		notes.push('Ten-Gallon Hat: winner +1 LP');
	}

	G.saloonReveal = {
		cityId: r.cityId,
		flop: [...flop],
		ranked,
		winnerId: winner,
		potGold: pot,
		winnerGold: wp.gold - goldBeforeW,
		winnerLegendPoints: wp.legendaryPoints - lpBeforeW,
		notes: notes.length ? notes : undefined,
	};

	G.pokerDiscard.push(...flop);
	G.saloonRound = null;
	saloonApplyRevealDismissActivePlayers(ctx, events);
}

/** After join/skip phase: either dealer showdown (solo joiner) or multi-player resolve. */
function maybeAdvanceSaloonAfterJoinPhase(G: WesternLegendsState, ctx: Ctx, events: SaloonEvents): void {
	migrateSaloonRoundIfMissing(G);
	const r = G.saloonRound;
	if (!r || r.pendingPlayerIds.length > 0 || r.tieBreakCandidateIds != null) return;
	if (r.dealerShowdown != null) return;
	const joined = r.joinedPlayerIds.filter((pid) => G.players[pid] != null);
	if (joined.length <= 0) {
		G.pokerDiscard.push(...r.flop);
		G.saloonRound = null;
		saloonClearActivePlayers(events);
		return;
	}
	if (joined.length === 1) {
		enterSaloonDealerShowdown(G, ctx, r, events);
		return;
	}
	resolveSaloonRound(G, ctx, events);
}

function enterSaloonDealerShowdown(G: WesternLegendsState, ctx: Ctx, r: NonNullable<WesternLegendsState['saloonRound']>, events: SaloonEvents): void {
	const dealerId = clockwiseNextPlayerId(ctx, G, r.activePlayerId);
	if (dealerId === r.activePlayerId) {
		resolveSaloonRound(G, ctx, events);
		return;
	}
	const hole = drawFromPokerDeck(G, 4);
	if (hole.length < 4) {
		G.pokerDiscard.push(...hole);
		appendLog(G, r.activePlayerId, 'Saloon: deck too thin for dealer — resolving without dealer');
		resolveSaloonRound(G, ctx, events);
		return;
	}
	const pick = pickBestTwoForFlopSaloon(hole, r.flop);
	r.dealerShowdown = {
		dealerId,
		dealerHoleCards: hole,
		dealerPickCardIds: [pick[0]!.id, pick[1]!.id],
	};
	appendLog(G, r.activePlayerId, `Saloon: dealer is ${dealerId} (4 hole cards); choose 2 of your cards with the flop`);
	saloonApplyHolePickActivePlayers(events, r.activePlayerId);
}

function moveSubmitSaloonHolePick({ G, ctx, events }: WLCtx, idA: unknown, idB: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateSaloonRoundIfMissing(G);
	const r = G.saloonRound;
	if (!r?.dealerShowdown) return INVALID_MOVE;
	if (ctx.currentPlayer !== r.activePlayerId) return INVALID_MOVE;
	if (typeof idA !== 'string' || typeof idB !== 'string' || idA === idB) return INVALID_MOVE;

	const active = G.players[r.activePlayerId];
	if (!active) return INVALID_MOVE;

	const ds = r.dealerShowdown;
	const dealerHole = ds.dealerPickCardIds
		.map((id) => ds.dealerHoleCards.find((c) => !isCardHidden(c) && (c as StandardCard).id === id))
		.filter((c): c is StandardCard => c != null);
	if (dealerHole.length !== 2) return INVALID_MOVE;

	const idxOf = (id: string) => active.hand.findIndex((c) => !isCardHidden(c) && (c as StandardCard).id === id);
	const iA = idxOf(idA);
	const iB = idxOf(idB);
	if (iA < 0 || iB < 0 || iA === iB) return INVALID_MOVE;

	const lo = Math.min(iA, iB);
	const hi = Math.max(iA, iB);
	const hiCard = active.hand.splice(hi, 1)[0] as StandardCard;
	const loCard = active.hand.splice(lo, 1)[0] as StandardCard;
	const picked: StandardCard[] = [loCard, hiCard];

	const activeScore = bestPokerScoreFromHandAndFlopSaloon(picked, r.flop);
	const dealerScore = bestPokerScoreFromHandAndFlopSaloon(dealerHole, r.flop);
	const dealerWins = comparePokerScores(dealerScore, activeScore) > 0;

	const pot = r.potGold;
	const dealerPid = ds.dealerId;

	const goldBeforeActive = active.gold;
	const lpBeforeActive = active.legendaryPoints;

	const activeEntry: SaloonRevealEntry = {
		playerId: r.activePlayerId,
		role: 'player',
		holeCards: [...picked],
		score: activeScore,
	};
	const dealerEntry: SaloonRevealEntry = {
		playerId: dealerPid,
		role: 'dealer',
		holeCards: [...dealerHole],
		score: dealerScore,
	};
	const ranked = [activeEntry, dealerEntry].sort((a, b) => comparePokerScores(b.score, a.score));

	if (dealerWins) {
		const d = drawFromPokerDeck(G, 1);
		if (d[0]) {
			active.hand.push(d[0]);
			migratePlayerItemsIfMissing(active);
			if (active.ownedMiscItemIds.includes('hat')) {
				grantGold(active, 10);
			}
		}
		if (saloonPickedHoleUsesRedTenBonus(picked)) {
			grantGold(active, 30);
			const d2 = drawFromPokerDeck(G, 1);
			if (d2[0]) {
				active.hand.push(d2[0]);
				appendLog(G, r.activePlayerId, 'Poker bonus (red 10): +$30 and 1 extra draw (lost vs dealer)');
			} else {
				appendLog(G, r.activePlayerId, 'Poker bonus (red 10): +$30 (lost vs dealer; deck empty for extra draw)');
			}
		}
		appendLog(G, r.activePlayerId, `Saloon: dealer ${dealerPid} wins; pot to supply; you drew 1 poker card`);
	} else {
		grantGold(active, pot);
		active.legendaryPoints += SALOON_WIN_LEGEND_POINTS;
		migratePlayerItemsIfMissing(active);
		if (active.ownedMiscItemIds.includes('hat')) {
			active.legendaryPoints += 1;
		}
		const dealerPl = G.players[dealerPid];
		if (dealerPl) {
			const ld = drawFromPokerDeck(G, 1);
			if (ld[0]) {
				dealerPl.hand.push(ld[0]);
				migratePlayerItemsIfMissing(dealerPl);
				if (dealerPl.ownedMiscItemIds.includes('hat')) {
					grantGold(dealerPl, 10);
				}
			}
		}
		appendLog(
			G,
			r.activePlayerId,
			`Saloon: you won ${pot} gold and +${SALOON_WIN_LEGEND_POINTS} LP vs dealer ${dealerPid}${
				active.ownedMiscItemIds.includes('hat') ? '; Ten-Gallon Hat: +1 LP' : ''
			}`,
		);
	}

	const winnerId = dealerWins ? dealerPid : r.activePlayerId;
	const winnerGold = dealerWins ? 0 : active.gold - goldBeforeActive;
	const winnerLp = dealerWins ? 0 : active.legendaryPoints - lpBeforeActive;
	const revealNotes: string[] = [];
	if (dealerWins) {
		revealNotes.push('Dealer wins — pot to supply.');
	} else if (active.ownedMiscItemIds.includes('hat')) {
		revealNotes.push('Ten-Gallon Hat: winner +1 LP');
	}

	G.saloonReveal = {
		cityId: r.cityId,
		flop: [...r.flop],
		ranked,
		winnerId,
		potGold: pot,
		winnerGold,
		winnerLegendPoints: winnerLp,
		notes: revealNotes.length ? revealNotes : undefined,
	};

	const dealerToDiscard = ds.dealerHoleCards.filter((c): c is StandardCard => !isCardHidden(c));
	G.pokerDiscard.push(...r.flop, ...dealerToDiscard, ...picked);
	G.saloonRound = null;
	saloonApplyRevealDismissActivePlayers(ctx, events);
}

const MAX_TRACK_POINTS = 9;

function clampTrackPoints(n: number): number {
	return Math.max(0, Math.min(MAX_TRACK_POINTS, n));
}

/** Clockwise “player to your right” = next seat in `ctx.playOrder`. */
function clockwiseNextPlayerId(ctx: Ctx, G: WesternLegendsState, fromId: string): string {
	const order = ctx.playOrder != null && ctx.playOrder.length > 0 ? ctx.playOrder : Object.keys(G.players).sort((a, b) => Number(a) - Number(b));
	const i = order.indexOf(fromId);
	const idx = i >= 0 ? (i + 1) % order.length : 0;
	return order[idx] ?? fromId;
}

/**
 * Rustle: deliver opposing-color cattle at the wrong ranch (+WP, +gold, token face).
 * Preconditions: `mp-2` with a blue token, or `sh-3` with a green token.
 */
function performRustleAtRanch(G: WesternLegendsState, ctx: Ctx, p: WesternLegendsPlayer, loc: MapBoardSpace): void {
	migratePlayerItemsIfMissing(p);
	const cc = p.carriedCattle;
	if (cc == null) return;
	migrateCattlePilesIfMissing(G);
	migrateFightDeckIfMissing(G);
	if (loc.id === 'mp-2' && normalizeCattleTokenColor(cc.color) === 'blue') {
		const face = cc.face;
		grantWantedPoints(G, ctx.currentPlayer, RUSTLE_WANTED_POINTS, ctx.currentPlayer, 'rustle (blue at green herd)', ctx);
		grantGold(p, RUSTLE_BONUS_GOLD);
		appendLog(
			G,
			ctx.currentPlayer,
			`rustle: delivered Blue cattle at ${spaceLabelForLog(loc)} (+${RUSTLE_WANTED_POINTS} wanted, +${RUSTLE_BONUS_GOLD} gold)`,
		);
		p.carriedCattle = null;
		applyCattleTokenFace(G, ctx.currentPlayer, p, face);
		return;
	}
	if (loc.id === 'sh-3' && normalizeCattleTokenColor(cc.color) === 'green') {
		const face = cc.face;
		grantWantedPoints(G, ctx.currentPlayer, RUSTLE_WANTED_POINTS, ctx.currentPlayer, 'rustle (green at blue herd)', ctx);
		grantGold(p, RUSTLE_BONUS_GOLD);
		appendLog(
			G,
			ctx.currentPlayer,
			`rustle: delivered Green cattle at ${spaceLabelForLog(loc)} (+${RUSTLE_WANTED_POINTS} wanted, +${RUSTLE_BONUS_GOLD} gold)`,
		);
		p.carriedCattle = null;
		applyCattleTokenFace(G, ctx.currentPlayer, p, face);
	}
}

/** After a move ends at `destId`, resolve cattle wrangle (`rs-1`) or rustle (opposing ranch). */
function tryResolveCattleDelivery(G: WesternLegendsState, ctx: Ctx, p: WesternLegendsPlayer, destId: string): void {
	migratePlayerItemsIfMissing(p);
	if (p.carriedCattle == null) return;
	const dest = BOARD_SPACES_BY_ID[destId];
	if (!dest) return;
	if (destId === 'rs-1') {
		p.carriedCattle = null;
		grantMarshalPoints(G, ctx.currentPlayer, WRANGLE_MARSHAL_POINTS, ctx.currentPlayer, 'wrangle', ctx);
		grantGold(p, WRANGLE_BONUS_GOLD);
		appendLog(G, ctx.currentPlayer, `wrangle: delivered cattle at Rail Station (+${WRANGLE_MARSHAL_POINTS} MP, +${WRANGLE_BONUS_GOLD} gold)`);
		return;
	}
	if (destId === 'mp-2' || destId === 'sh-3') {
		performRustleAtRanch(G, ctx, p, dest);
	}
}

/** Each map move consumes one A slot (up to {@link TURN_ACTIONS_PER_TURN} + bonus cattle actions per turn). */
function ensureMoveSlotOrReject(p: WesternLegendsPlayer): boolean {
	if (!Array.isArray(p.turnActions)) p.turnActions = [];
	if (p.turnActions.length >= maxDiscreteTurnSlots(p)) return false;
	p.turnActions.push('move');
	return true;
}

/** Location / card / fight each consume one of the 3 turn slots (rulebook B/C/D). Refreshes MP for the next move leg. */
function takeDiscreteTurnSlot(p: WesternLegendsPlayer, kind: Exclude<TurnActionKind, 'move'>): boolean {
	if (!Array.isArray(p.turnActions)) p.turnActions = [];
	if (p.turnActions.length >= maxDiscreteTurnSlots(p)) return false;
	p.movementPointsLeftBeforeDiscreteAction = p.movementPointsLeft;
	p.turnActions.push(kind);
	refreshMovementPointsForTurnMount(p);
	return true;
}

/** Undo {@link takeDiscreteTurnSlot} after a failed move that must not consume the slot (deck empty, etc.). */
function revertDiscreteTurnSlot(p: WesternLegendsPlayer): void {
	p.turnActions.pop();
	const prev = p.movementPointsLeftBeforeDiscreteAction;
	if (prev !== undefined) {
		p.movementPointsLeft = prev;
		delete p.movementPointsLeftBeforeDiscreteAction;
	}
}

function maxNuggetsForPlayer(p: WesternLegendsPlayer): number {
	migratePlayerItemsIfMissing(p);
	const mounts = p.ownedMountItemIds;
	const base = mounts.includes('mule') || mounts.includes('mule_upgrade') ? MAX_NUGGETS + 2 : MAX_NUGGETS;
	const foolsGold =
		p.hand.some(
			(c) =>
				!isCardHidden(c) &&
				(c as StandardCard).rank === '10' &&
				((c as StandardCard).suit === 'clubs' || (c as StandardCard).suit === 'spades'),
		) === true;
	return base + (foolsGold ? 1 : 0);
}

/** Movement points from the mount equipped this turn (after loadout / income). */
function movementPointsForEquippedMount(p: WesternLegendsPlayer): number {
	migratePlayerItemsIfMissing(p);
	return movementCapFromTurnMount(p);
}

function refreshMovementPointsForTurnMount(p: WesternLegendsPlayer): void {
	p.movementPointsLeft = movementPointsForEquippedMount(p);
}

/** Apply one prospecting die outcome (no nested gold-dust reroll). */
function applyProspectFaceWithOutcome(p: WesternLegendsPlayer, face: ProspectFace): ProspectDieOutcome {
	const cap = maxNuggetsForPlayer(p);
	let nuggetAdded = false;
	let goldAdded = 0;
	if (face === 'nugget') {
		if (p.nuggets < cap) {
			p.nuggets += 1;
			nuggetAdded = true;
		}
	} else if (face === 'tailings' || face === 'goldDust') {
		grantGold(p, PROSPECT_TAILINGS_GOLD);
		goldAdded = PROSPECT_TAILINGS_GOLD;
	}
	return { face, nuggetAdded, goldAdded };
}

function undoProspectOutcome(p: WesternLegendsPlayer, o: ProspectDieOutcome): void {
	if (o.nuggetAdded) p.nuggets = Math.max(0, p.nuggets - 1);
	if (o.goldAdded > 0) p.gold = Math.max(0, p.gold - o.goldAdded);
}

function describeProspectOutcome(o: ProspectDieOutcome, p: WesternLegendsPlayer): string {
	if (o.face === 'nugget') {
		return o.nuggetAdded ? 'gold nugget' : `nugget (at carry cap ${maxNuggetsForPlayer(p)})`;
	}
	if (o.face === 'tailings') return 'tailings +10 gold';
	if (o.face === 'goldDust') return 'gold dust +10 gold';
	return 'gravel';
}

function allPlayersChoseCharacter(G: WesternLegendsState): boolean {
	return Object.values(G.players).every((p) => p.characterId != null);
}

function characterSelectionIncomplete(G: WesternLegendsState): boolean {
	return Object.values(G.players).some((p) => p.characterId == null);
}

/** Older / persisted states may omit {@link WesternLegendsPlayer.marshalPoints}; backfill from starter def. */
function migrateMarshalPointsIfMissing(G: WesternLegendsState): void {
	for (const pl of Object.values(G.players)) {
		if (pl.marshalPoints != null && Number.isFinite(pl.marshalPoints)) continue;
		const def = pl.characterId ? STARTER_CHARACTER_BY_ID[pl.characterId] : undefined;
		pl.marshalPoints = def?.startingMarshal ?? 0;
	}
}

function migrateStoryInPlayIfMissing(G: WesternLegendsState): void {
	const a = G.storyInPlay as unknown;
	if (!Array.isArray(a)) {
		G.storyInPlay = [null, null];
		return;
	}
	if (a.length === 0) {
		G.storyInPlay = [null, null];
		return;
	}
	if (a.length === 1) {
		G.storyInPlay = [(a[0] as StoryInPlayEntry | null) ?? null, null];
		return;
	}
	G.storyInPlay = [
		(a[0] as StoryInPlayEntry | null | undefined) ?? null,
		(a[1] as StoryInPlayEntry | null | undefined) ?? null,
	];
}

/** Draw next story card into empty slots (left deck → slot 0, right deck → slot 1). */
function refillStorySlotsFromDecks(G: WesternLegendsState, logPid: string): void {
	migrateStoryInPlayIfMissing(G);
	migrateStoryDecksIfMissing(G);
	for (let i = 0; i < 2; i++) {
		if (G.storyInPlay[i] != null) continue;
		const deck = i === 0 ? G.storyDeckLeft : G.storyDeckRight;
		if (deck.length === 0) continue;
		const id = deck.shift()!;
		G.storyInPlay[i] = { cardId: id, discs: 0 };
		appendLog(
			G,
			logPid,
			`story: ${i === 0 ? 'left' : 'right'} in play (face down) — ${formatStoryCardForLog(id)}`,
		);
	}
}

function migrateStoryDecksIfMissing(G: WesternLegendsState): void {
	const GAny = G as unknown as { storyDeck?: string[] };
	if (Array.isArray(GAny.storyDeck) && GAny.storyDeck.length > 0) {
		const totalNew = (G.storyDeckLeft?.length ?? 0) + (G.storyDeckRight?.length ?? 0);
		if (totalNew === 0) {
			const legacy = GAny.storyDeck;
			const mid = Math.floor(legacy.length / 2);
			G.storyDeckLeft = legacy.slice(0, mid);
			G.storyDeckRight = legacy.slice(mid);
		}
		delete GAny.storyDeck;
	}
	if (!Array.isArray(G.storyDeckLeft)) G.storyDeckLeft = [];
	if (!Array.isArray(G.storyDeckRight)) G.storyDeckRight = [];
}

/** First time entering play: deal one story card from each draw pile to the in-play slots (face down on the board). */
function dealInitialFaceUpStoryCardsIfEmpty(G: WesternLegendsState): void {
	migrateStoryInPlayIfMissing(G);
	migrateStoryDecksIfMissing(G);
	if (G.storyInPlay[0] != null || G.storyInPlay[1] != null) return;
	if (G.storyDeckLeft.length === 0 || G.storyDeckRight.length === 0) return;
	const idLeft = G.storyDeckLeft.shift()!;
	const idRight = G.storyDeckRight.shift()!;
	G.storyInPlay[0] = { cardId: idLeft, discs: 0 };
	G.storyInPlay[1] = { cardId: idRight, discs: 0 };
	const logPid = Object.keys(G.players)[0] ?? '0';
	appendLog(
		G,
		logPid,
		`story: in play (face down) — ${formatStoryCardForLog(idLeft)} / ${formatStoryCardForLog(idRight)}`,
	);
}

/** Wanted track rows1–3 (points 1–3 / 4–6 / 7–9): LP gained at end of turn while wanted. */
function wantedTrackRowLpGain(wantedPoints: number): number {
	return trackRowLpGainForReputation(wantedPoints);
}

function resolveStoriesAtEndOfTurn(G: WesternLegendsState, ctx: Ctx, actingPlayerId: string): void {
	migrateManInBlackIfMissing(G);
	migrateStoryInPlayIfMissing(G);
	const numPlayers =
		ctx.numPlayers != null && ctx.numPlayers > 0 ? ctx.numPlayers : Object.keys(G.players).length;
	const need = storyDiscsRequiredToResolve(numPlayers, isManInBlackVariant(G));
	const flipReveals: { slotIndex: 0 | 1; cardId: string }[] = [];
	const next: [StoryInPlayEntry | null, StoryInPlayEntry | null] = [
		G.storyInPlay[0],
		G.storyInPlay[1],
	];
	for (let i = 0; i < 2; i++) {
		const row = next[i];
		if (row == null) continue;
		if (row.discs < need) continue;
		flipReveals.push({ slotIndex: i as 0 | 1, cardId: row.cardId });
		const slotIndex = i as 0 | 1;
		const contributors = contributorsForResolvedStoryRow(row, need);
		if (row.discs >= need && row.discSlotPlayerIds == null) {
			appendLog(
				G,
				actingPlayerId,
				'story: contributors unknown (legacy disc tracking) — printed effects skipped',
			);
		}
		trySpawnBanditsFromStoryStub(G, row.cardId);
		tryMoveSheriffFromStoryStub(G, row.cardId);
		applyStoryCardResolved(
			G,
			ctx,
			{ row, slotIndex, needDiscs: need, contributors, actingPlayerId },
			{
				grantMarshalPoints: (pid, d, log, r) => grantMarshalPoints(G, pid, d, log, r, ctx),
				grantWantedPoints: (pid, d, log, r) => grantWantedPoints(G, pid, d, log, r, ctx),
				grantLegendaryPoints: (pid, d, log, r) => grantLegendaryPointsForStory(G, pid, d, log, r),
				appendLog,
			},
		);
		G.storyDiscard.push(row.cardId);
		appendLog(
			G,
			actingPlayerId,
			`story resolved: ${formatStoryCardForLog(row.cardId)} (${row.discs} discs, need ${need})`,
		);
		next[i] = null;
	}
	G.storyInPlay = next;
	if (flipReveals.length > 0) {
		G.storyResolvedReveal = { reveals: flipReveals };
	} else {
		delete G.storyResolvedReveal;
	}
	refillStorySlotsFromDecks(G, actingPlayerId);
}

function parsePassDiscardIds(discardIds: unknown): string[] | null {
	if (discardIds === undefined || discardIds === null) return [];
	if (!Array.isArray(discardIds)) return null;
	const out: string[] = [];
	for (const x of discardIds) {
		if (typeof x !== 'string' || x.length === 0) return null;
		out.push(x);
	}
	return out;
}

function validatePassDiscards(p: WesternLegendsPlayer, maxH: number, discardIds: string[]): boolean {
	const over = Math.max(0, p.hand.length - maxH);
	if (discardIds.length !== over) return false;
	if (over === 0) return true;
	const need = new Map<string, number>();
	for (const id of discardIds) {
		need.set(id, (need.get(id) ?? 0) + 1);
	}
	const have = new Map<string, number>();
	for (const c of p.hand) {
		if (!isCardHidden(c)) {
			const id = (c as VisibleCard).id;
			have.set(id, (have.get(id) ?? 0) + 1);
		}
	}
	for (const [id, n] of need) {
		if ((have.get(id) ?? 0) < n) return false;
	}
	return true;
}

/** Instincts (9): draw 1 when discarded for any reason other than end-of-turn hand trim. */
function maybeInstinctsDiscardDraw(G: WesternLegendsState, logPid: string, p: WesternLegendsPlayer, cardId: string): void {
	if (!cardId.startsWith('9-')) return;
	const drawn = drawFromPokerDeck(G, 1);
	if (drawn[0]) {
		p.hand.push(drawn[0]);
		appendLog(G, logPid, 'Instincts: drew 1 poker (non–end-of-turn discard)');
	}
}

function discardVisibleCardsFromHand(
	G: WesternLegendsState,
	logPid: string,
	p: WesternLegendsPlayer,
	discardIds: string[],
	reason: 'end_of_turn_trim' | 'other' = 'other',
): void {
	const need = new Map<string, number>();
	for (const id of discardIds) {
		need.set(id, (need.get(id) ?? 0) + 1);
	}
	const instinctIds: string[] = [];
	const next: typeof p.hand = [];
	for (const c of p.hand) {
		if (!isCardHidden(c)) {
			const id = (c as VisibleCard).id;
			const n = need.get(id) ?? 0;
			if (n > 0) {
				need.set(id, n - 1);
				G.pokerDiscard.push(c as StandardCard);
				if (reason !== 'end_of_turn_trim') instinctIds.push(id);
				continue;
			}
		}
		next.push(c);
	}
	p.hand = next;
	for (const id of instinctIds) {
		maybeInstinctsDiscardDraw(G, logPid, p, id);
	}
}

/** Older / persisted states may omit item arrays; backfill from starter def. */
function migratePlayerItemsIfMissing(p: WesternLegendsPlayer): void {
	if (!Array.isArray(p.ownedWeaponItemIds)) {
		const def = p.characterId ? STARTER_CHARACTER_BY_ID[p.characterId] : undefined;
		p.ownedWeaponItemIds = [...(def?.startingWeaponItemIds ?? [])];
	}
	if (!Array.isArray(p.ownedMountItemIds)) {
		const def = p.characterId ? STARTER_CHARACTER_BY_ID[p.characterId] : undefined;
		p.ownedMountItemIds = [...(def?.startingMountItemIds ?? [])];
	}
	if (p.turnWeaponItemId === undefined) p.turnWeaponItemId = null;
	if (p.turnMountItemId === undefined) p.turnMountItemId = null;
	if (!Array.isArray(p.ownedMiscItemIds)) p.ownedMiscItemIds = [];
	if (p.carriedCattle === undefined) p.carriedCattle = null;
	if (p.usedHeistThisTurn !== true && p.usedHeistThisTurn !== false) p.usedHeistThisTurn = false;

	const anyP = p as unknown as { hasCattle?: boolean; cattleSourceRanchId?: unknown };
	if (anyP.hasCattle === true && p.carriedCattle == null) {
		if (anyP.cattleSourceRanchId === 'mp-2') {
			p.carriedCattle = { color: 'green', face: CATTLE_LEGACY_DEFAULT_FACE };
		} else if (anyP.cattleSourceRanchId === 'sh-3') {
			p.carriedCattle = { color: 'blue', face: CATTLE_LEGACY_DEFAULT_FACE };
		}
	}

	if (typeof p.carriedCattle === 'string') {
		const col = normalizeCattleTokenColor(p.carriedCattle);
		if (col != null) {
			p.carriedCattle = { color: col, face: CATTLE_LEGACY_DEFAULT_FACE };
		} else {
			p.carriedCattle = null;
		}
	} else if (p.carriedCattle != null) {
		const cc = p.carriedCattle;
		const col = normalizeCattleTokenColor(cc.color);
		if (col != null) {
			cc.color = col;
		}
		if (
			col == null ||
			typeof cc.face !== 'string' ||
			!(CATTLE_TOKEN_FACE_IDS as readonly string[]).includes(cc.face)
		) {
			p.carriedCattle = null;
		}
	}

	if (p.bonusTurnSlots != null && (!Number.isFinite(p.bonusTurnSlots) || p.bonusTurnSlots < 0)) {
		delete p.bonusTurnSlots;
	}
	if (p.pendingCattleMarshalOrWanted !== true && p.pendingCattleMarshalOrWanted !== false) {
		delete p.pendingCattleMarshalOrWanted;
	}
	if (p.pendingBanditBountyChoice !== true && p.pendingBanditBountyChoice !== false) {
		delete p.pendingBanditBountyChoice;
	}
	if (
		p.pendingBanditFightFighterChoice !== 'fc-7' &&
		p.pendingBanditFightFighterChoice !== 'fc-9' &&
		p.pendingBanditFightFighterChoice !== 'fc-A'
	) {
		delete p.pendingBanditFightFighterChoice;
	}
	if (p.prospectMapRerollDice === undefined) p.prospectMapRerollDice = null;
	if (Array.isArray(p.prospectMapRerollDice) && p.prospectMapRerollDice.length > 0) {
		const ok = p.prospectMapRerollDice.every(
			(e) =>
				e != null &&
				typeof (e as ProspectMapDieOutcome).slotIndex === 'number' &&
				((e as ProspectMapDieOutcome).slotIndex === 0 || (e as ProspectMapDieOutcome).slotIndex === 1),
		);
		if (!ok) p.prospectMapRerollDice = null;
	}
	if (p.whiskeyReactionAvailable !== true && p.whiskeyReactionAvailable !== false) {
		p.whiskeyReactionAvailable = false;
	}
	if (p.generalStoreVisitPaidLocationId === undefined) p.generalStoreVisitPaidLocationId = null;
	if (p.usedReputationCardThisTurn === true && p.usedLivingLegendThisTurn !== true) {
		p.usedLivingLegendThisTurn = true;
	}
	delete p.usedReputationCardThisTurn;
	if (p.usedLivingLegendThisTurn !== true && p.usedLivingLegendThisTurn !== false) {
		delete p.usedLivingLegendThisTurn;
	}
	if (p.usedReputationSevenThisTurn !== true && p.usedReputationSevenThisTurn !== false) {
		delete p.usedReputationSevenThisTurn;
	}
	if (p.pendingReputationSevenReaction !== true && p.pendingReputationSevenReaction !== false) {
		delete p.pendingReputationSevenReaction;
	}
	if (p.pendingSprintAfterMove !== true && p.pendingSprintAfterMove !== false) {
		delete p.pendingSprintAfterMove;
	}
	if (p.pendingWallopAfterMove !== true && p.pendingWallopAfterMove !== false) {
		delete p.pendingWallopAfterMove;
	}
	if (!Array.isArray(p.pvpFightTargetsThisTurn)) p.pvpFightTargetsThisTurn = [];
}

/** Rifle: log up to two random face-up cards from the defender's poker hand (before the duel draw). */
function logRiflePeekAtDefenderHand(G: WesternLegendsState, challengerId: string, target: WesternLegendsPlayer): void {
	migratePlayerItemsIfMissing(target);
	const visible: StandardCard[] = [];
	for (const c of target.hand) {
		if (!isCardHidden(c)) visible.push(c as StandardCard);
	}
	if (visible.length === 0) {
		appendLog(G, challengerId, 'Rifle: defender has no face-up cards in hand to peek');
		return;
	}
	const k = Math.min(2, visible.length);
	const picked = shuffle([...visible]).slice(0, k);
	const labels = picked.map((c) => (c as VisibleCard).id);
	appendLog(G, challengerId, `Rifle: peeked ${picked.length} random card(s) from defender's hand: ${labels.join(', ')}`);
}

/** After draft pick: rulebook starting cash, poker hand size, wounds, nuggets, wanted, marshal. */
function applyCharacterStartingKit(G: WesternLegendsState, p: WesternLegendsPlayer, def: StarterCharacterDef): void {
	p.gold = Math.min(MAX_PLAYER_GOLD, def.startingGold ?? 40);
	p.wounds = def.startingWounds ?? 0;
	p.wantedPoints = def.startingWanted ?? 0;
	p.marshalPoints = def.startingMarshal ?? 0;
	p.ownedWeaponItemIds = [...(def.startingWeaponItemIds ?? [])];
	p.ownedMountItemIds = [...(def.startingMountItemIds ?? [])];
	p.nuggets = Math.min(maxNuggetsForPlayer(p), def.startingNuggets ?? 0);
	p.ownedMiscItemIds = [];
	p.carriedCattle = null;
	delete p.bonusTurnSlots;
	delete p.pendingCattleMarshalOrWanted;
	p.usedHeistThisTurn = false;
	p.turnWeaponItemId = null;
	p.turnMountItemId = null;
	p.needsTurnWeaponMountChoice = false;
	p.generalStoreVisitPaidLocationId = null;
	const n = def.startingPokerCards ?? 2;
	for (const c of p.hand) {
		G.pokerDiscard.push(c as StandardCard);
	}
	p.hand = drawFromPokerDeck(G, n);

	const linesSeen = new Set<string>();
	for (const id of [...p.ownedWeaponItemIds, ...p.ownedMountItemIds]) {
		const line = generalStoreStockLineId(id);
		if (line == null || linesSeen.has(line)) continue;
		linesSeen.add(line);
		consumeGeneralStoreLineForItem(G, id);
	}
}

function moveChooseCharacter({ G, ctx, events }: WLCtx, pickArg: unknown, startSpaceArg?: unknown) {
	if (ctx.phase !== 'chooseCharacter') return INVALID_MOVE;
	const pick = pickArg === 0 || pickArg === 1 ? pickArg : Number(pickArg);
	if (pick !== 0 && pick !== 1) return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	if (!p?.characterOffers || p.characterId != null) return INVALID_MOVE;
	const chosenId = p.characterOffers[pick];
	const def = STARTER_CHARACTER_BY_ID[chosenId];
	if (!def) return INVALID_MOVE;

	const choices = characterHasStartSpaceChoices(def) ? def.startSpaceChoices! : null;
	let locationId: string;
	if (choices) {
		if (typeof startSpaceArg !== 'string' || !choices.includes(startSpaceArg)) return INVALID_MOVE;
		if (!BOARD_SPACES_BY_ID[startSpaceArg]) return INVALID_MOVE;
		locationId = startSpaceArg;
	} else {
		if (startSpaceArg != null && startSpaceArg !== '') return INVALID_MOVE;
		if (!BOARD_SPACES_BY_ID[def.startSpaceId]) return INVALID_MOVE;
		locationId = def.startSpaceId;
	}

	p.characterId = chosenId;
	p.locationId = locationId;
	p.characterOffers = null;
	applyCharacterStartingKit(G, p, def);
	const startSpace = BOARD_SPACES_BY_ID[locationId]!;
	appendLog(G, ctx.currentPlayer, `chose ${def.name} (starts ${spaceLabelForLog(startSpace)})`);
	if (allPlayersChoseCharacter(G)) {
		events.endPhase();
	}
}

/**
 * Predicate for {@link moveMoveToLocation} `undoable` (boardgame.io long-form move).
 * Undo rewinds the whole move (hex, MP, logs, cattle wrangle, optional bandit fight start).
 * - Plain map moves: undoable while no fight / saloon / mining overlays are open.
 * - Bandit from this move: undoable through `startEffects` / `challengerCard` only.
 */
export function isMoveToLocationUndoableAfterBanditApproach(G: WesternLegendsState): boolean {
	if (
		G.saloonRound != null ||
		G.saloonReveal != null ||
		G.prospectReveal != null ||
		G.sheriffEncounter != null
	) {
		return false;
	}
	const f = G.fight;
	if (f != null) {
		if (f.kind !== 'bandit') return false;
		return f.phase === 'startEffects' || f.phase === 'challengerCard';
	}
	return true;
}

/**
 * Predicate for {@link moveUseCardAction} `undoable` when Manhunt created a pending sheriff encounter.
 */
export function isUseCardActionUndoableAfterManhuntEncounter(G: WesternLegendsState): boolean {
	const e = G.sheriffEncounter;
	if (e == null) return false;
	if (e.phase === 'chooseTarget') return true;
	if (e.phase === 'discard' && e.pendingDiscardPlayerIds.length > 0) return true;
	return false;
}

function moveMoveToLocation({ G, ctx, events }: WLCtx, locationId: string) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	if (!p || !BOARD_SPACES_BY_ID[locationId]) return INVALID_MOVE;
	if (locationId === p.locationId) return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	migrateSheriffEncounterIfMissing(G);
	const sheriffNpc = findSheriffNpc(G);
	/** Wanted players may not **enter** the sheriff’s space (they can become wanted while already there). */
	if (p.wantedPoints >= 1 && sheriffNpc != null && locationId === sheriffNpc.spaceId) {
		return INVALID_MOVE;
	}
	const mountCap = movementPointsForEquippedMount(p);
	/** Remaining MP this move leg, or full mount when starting a new leg from 0. */
	const budgetNow = p.movementPointsLeft === 0 ? mountCap : p.movementPointsLeft;
	const cost = getShortestPathLength(BOARD_SPACES_BY_ID, p.locationId, locationId);
	if (cost == null || cost < 1) return INVALID_MOVE;
	if (cost > budgetNow) return INVALID_MOVE;
	const reachable = getReachableSpaceIds(BOARD_SPACES_BY_ID, p.locationId, budgetNow);
	if (!reachable.has(locationId)) return INVALID_MOVE;
	const fromId = p.locationId;
	const fromSpace = BOARD_SPACES_BY_ID[fromId]!;
	const dest = BOARD_SPACES_BY_ID[locationId];

	if (p.movementPointsLeft === 0) {
		if (!ensureMoveSlotOrReject(p)) return INVALID_MOVE;
		p.movementPointsLeft = mountCap;
	} else if (p.movementPointsLeft === mountCap) {
		if (!ensureMoveSlotOrReject(p)) return INVALID_MOVE;
	}

	delete p.movementPointsLeftBeforeDiscreteAction;
	p.whiskeyReactionAvailable = false;
	p.movementPointsLeft -= cost;
	p.locationId = locationId;
	p.generalStoreVisitPaidLocationId = null;
	appendLog(
		G,
		ctx.currentPlayer,
		`moved from ${spaceLabelForLog(fromSpace)} to ${spaceLabelForLog(dest)} — ${cost} MP (${fromId} → ${locationId})`,
	);
	tryResolveCattleDelivery(G, ctx, p, locationId);

	migrateFightIfMissing(G);
	migrateSaloonRoundIfMissing(G);
	migrateProspectRevealIfMissing(G);
	if (G.fight == null && G.saloonRound == null && G.prospectReveal == null) {
		const banditNpc = findBanditNpcAtSpace(G, locationId);
		if (banditNpc != null) {
			/** Forced encounter: does not consume a `fight` turn slot (see {@link startBanditFight}). */
			p.movementPointsLeft = 0;
			startBanditFight(G, ctx, events, banditNpc.id, ctx.currentPlayer);
		}
	}

	const othersHere = Object.keys(G.players).filter((oid) => oid !== ctx.currentPlayer && G.players[oid]?.locationId === locationId);
	if (p.ownedMiscItemIds.includes('whiskey') && othersHere.length > 0) {
		p.whiskeyReactionAvailable = true;
	}
	p.pendingSprintAfterMove = true;
	p.pendingWallopAfterMove = othersHere.length > 0;
}

/** Work — only on a location-action hex (same rule as other location actions). Counts as D. */
function moveWorkForPay({ G, ctx }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	const loc = currentSpace(G, ctx.currentPlayer);
	if (!p || !loc?.actionKind) return INVALID_MOVE;
	if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;
	grantGold(p, WORK_PAY_GOLD);
	appendLog(G, ctx.currentPlayer, `worked (+${WORK_PAY_GOLD} gold)`);
}

/** B — poker card actions (Payday, Determination, Instincts, Living Legend, Saddle Up, Manhunt, …). */
function moveUseCardAction({ G, ctx, events }: WLCtx, cardIdArg: unknown, extraArg?: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	if (!p) return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	if (typeof cardIdArg !== 'string' || cardIdArg.length === 0) return INVALID_MOVE;

	const pre = p.hand.find((c) => !isCardHidden(c) && (c as StandardCard).id === cardIdArg) as StandardCard | undefined;
	if (!pre) return INVALID_MOVE;
	const kind = actionBEffectKindForCardId(pre.id);
	if (kind == null) return INVALID_MOVE;

	if (kind === 'living_legend') {
		if (p.usedLivingLegendThisTurn === true) return INVALID_MOVE;
		if (!isLivingLegendCardId(pre.id)) return INVALID_MOVE;
		const choice = extraArg === 'wanted' || extraArg === 'marshal' ? extraArg : null;
		if (choice == null) return INVALID_MOVE;
		if (!takeDiscreteTurnSlot(p, 'card')) return INVALID_MOVE;
		const pulled = pullCardFromHandById(p, cardIdArg);
		if (!pulled) {
			revertDiscreteTurnSlot(p);
			return INVALID_MOVE;
		}
		G.pokerDiscard.push(pulled);
		p.usedLivingLegendThisTurn = true;
		maybeInstinctsDiscardDraw(G, ctx.currentPlayer, p, pulled.id);
		if (choice === 'wanted') {
			grantWantedPoints(G, ctx.currentPlayer, 1, ctx.currentPlayer, 'Living Legend', ctx);
			appendLog(G, ctx.currentPlayer, 'Living Legend: +1 Wanted');
		} else {
			grantMarshalPoints(G, ctx.currentPlayer, 1, ctx.currentPlayer, 'Living Legend', ctx);
			appendLog(G, ctx.currentPlayer, 'Living Legend: +1 Marshal');
		}
		return;
	}

	if (!takeDiscreteTurnSlot(p, 'card')) return INVALID_MOVE;
	const pulled = pullCardFromHandById(p, cardIdArg);
	if (!pulled) {
		revertDiscreteTurnSlot(p);
		return INVALID_MOVE;
	}

	const revert = (): void => {
		p.hand.push(pulled);
		G.pokerDiscard.pop();
		revertDiscreteTurnSlot(p);
	};

	G.pokerDiscard.push(pulled);
	maybeInstinctsDiscardDraw(G, ctx.currentPlayer, p, pulled.id);

	switch (kind) {
		case 'payday':
			grantGold(p, 30);
			appendLog(G, ctx.currentPlayer, 'Payday: +$30');
			break;
		case 'determination':
			p.bonusTurnSlots = (p.bonusTurnSlots ?? 0) + 2;
			appendLog(G, ctx.currentPlayer, 'Determination: +2 actions this turn');
			break;
		case 'instincts_draw_three': {
			const d = drawFromPokerDeck(G, 3);
			p.hand.push(...d);
			appendLog(
				G,
				ctx.currentPlayer,
				d.length >= 3 ? 'Instincts: drew 3 poker cards' : `Instincts: drew ${d.length} poker card(s) (deck thin)`,
			);
			break;
		}
		case 'saddle_up': {
			const dest = typeof extraArg === 'string' ? extraArg : '';
			if (!BOARD_SPACES_BY_ID[dest] || getBoardSpaceCity(dest) == null) {
				revert();
				return INVALID_MOVE;
			}
			p.locationId = dest;
			p.generalStoreVisitPaidLocationId = null;
			appendLog(G, ctx.currentPlayer, `Saddle Up: moved to ${spaceLabelForLog(BOARD_SPACES_BY_ID[dest]!)}`);
			tryResolveCattleDelivery(G, ctx, p, dest);
			break;
		}
		case 'manhunt': {
			if (pulled.rank !== '4') {
				revert();
				return INVALID_MOVE;
			}
			const dest = typeof extraArg === 'string' ? extraArg : '';
			migrateFightIfMissing(G);
			migrateSheriffEncounterIfMissing(G);
			if (!BOARD_SPACES_BY_ID[dest] || G.fight != null || G.sheriffEncounter != null) {
				revert();
				return INVALID_MOVE;
			}
			const sh = findSheriffNpc(G);
			if (!sh) {
				revert();
				return INVALID_MOVE;
			}
			const dist = getShortestPathLength(BOARD_SPACES_BY_ID, sh.spaceId, dest);
			if (dist == null || dist < 1 || dist > 3) {
				revert();
				return INVALID_MOVE;
			}
			moveSheriffToSpace(G, ctx, events, dest, ctx.currentPlayer);
			if ((p.marshalPoints ?? 0) >= 1 || (p.wantedPoints ?? 0) >= 1) {
				p.legendaryPoints += 1;
				appendLog(G, ctx.currentPlayer, 'Manhunt: +1 LP (Marshal or Wanted player)');
			}
			appendLog(G, ctx.currentPlayer, `Manhunt: sheriff moved (${dist} step(s)) to ${dest}`);
			break;
		}
		default:
			revert();
			return INVALID_MOVE;
	}
}

/** B — Reputation (7): reaction after you gained Marshal/Wanted this turn; +1 LP (once per turn). Does not consume an A/B/C/D slot. */
function movePlayReputationSeven({ G, ctx }: WLCtx, cardIdArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	if (!p) return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	if (p.pendingReputationSevenReaction !== true) return INVALID_MOVE;
	if (p.usedReputationSevenThisTurn === true) return INVALID_MOVE;
	if (typeof cardIdArg !== 'string' || !cardIdArg.startsWith('7-')) return INVALID_MOVE;
	if (!pokerCardHasTiming(cardIdArg, 'after_marshal_wanted_on_your_turn')) return INVALID_MOVE;
	const card = pullCardFromHandById(p, cardIdArg);
	if (!card) return INVALID_MOVE;
	G.pokerDiscard.push(card);
	p.usedReputationSevenThisTurn = true;
	delete p.pendingReputationSevenReaction;
	p.legendaryPoints += 1;
	maybeInstinctsDiscardDraw(G, ctx.currentPlayer, p, card.id);
	appendLog(G, ctx.currentPlayer, 'Reputation (7): +1 LP');
}

/** B — Sprint (after move) or Wallop (after move with others present). */
function movePlayPokerAfterMove({ G, ctx }: WLCtx, cardIdArg: unknown, targetIdArg?: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	if (!p) return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	if (typeof cardIdArg !== 'string') return INVALID_MOVE;
	const pre = p.hand.find((c) => !isCardHidden(c) && (c as StandardCard).id === cardIdArg) as StandardCard | undefined;
	if (!pre) return INVALID_MOVE;

	if (pre.rank === '3' && pokerCardHasTiming(pre.id, 'after_move')) {
		if (p.pendingSprintAfterMove !== true) return INVALID_MOVE;
		if (!takeDiscreteTurnSlot(p, 'card')) return INVALID_MOVE;
		const card = pullCardFromHandById(p, cardIdArg);
		if (!card) {
			revertDiscreteTurnSlot(p);
			return INVALID_MOVE;
		}
		G.pokerDiscard.push(card);
		p.pendingSprintAfterMove = false;
		p.movementPointsLeft += 2;
		maybeInstinctsDiscardDraw(G, ctx.currentPlayer, p, card.id);
		appendLog(G, ctx.currentPlayer, 'Sprint: +2 movement spaces this leg');
		return;
	}

	if (pre.rank === '8' && (pre.suit === 'clubs' || pre.suit === 'spades') && pokerCardHasTiming(pre.id, 'after_move')) {
		if (p.pendingWallopAfterMove !== true) return INVALID_MOVE;
		const tid = typeof targetIdArg === 'string' ? targetIdArg : '';
		const tgt = G.players[tid];
		if (!tgt || tid === ctx.currentPlayer || tgt.locationId !== p.locationId) return INVALID_MOVE;
		if (!takeDiscreteTurnSlot(p, 'card')) return INVALID_MOVE;
		const card = pullCardFromHandById(p, cardIdArg);
		if (!card) {
			revertDiscreteTurnSlot(p);
			return INVALID_MOVE;
		}
		G.pokerDiscard.push(card);
		p.pendingWallopAfterMove = false;
		tgt.wounds += 1;
		maybeInstinctsDiscardDraw(G, ctx.currentPlayer, p, card.id);
		const vis = tgt.hand.filter((c) => !isCardHidden(c)).map((c) => (c as StandardCard).id);
		appendLog(G, ctx.currentPlayer, `Wallop: ${tid} +1 wound; peeked hand: ${vis.length ? vis.join(', ') : '(none visible)'}`);
		return;
	}

	return INVALID_MOVE;
}

/** Prospect for gold — Mine space; roll both prospecting dice (rulebook D3). */
function moveProspectForGold({ G, ctx }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	const loc = currentSpace(G, ctx.currentPlayer);
	if (!p || loc?.actionKind !== 'prospectGold') return INVALID_MOVE;
	if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	const slots = resolveProspectRoll(Math.random);
	const flat: ProspectMapDieOutcome[] = [];
	for (const slot of slots) {
		for (const face of slot.faces) {
			const o = applyProspectFaceWithOutcome(p, face);
			flat.push({
				slotIndex: slot.slotIndex,
				face: o.face,
				nuggetAdded: o.nuggetAdded,
				goldAdded: o.goldAdded,
			});
		}
	}
	p.prospectMapRerollDice = p.ownedMiscItemIds.includes('map') ? flat : null;
	const parts = flat.map((o) => describeProspectOutcome(o, p));
	appendLog(G, ctx.currentPlayer, `prospected: ${parts.join('; ')}`);
	migrateProspectRevealIfMissing(G);
	G.prospectReveal = {
		playerId: ctx.currentPlayer,
		slots,
		summaries: parts,
	};
}

/** Miner's Map: reroll one prospecting die (slot 0 or 1); supplements the same prospect action (no extra turn slot). */
function moveMinerMapRerollProspect({ G, ctx }: WLCtx, dieIndexArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	if (!p) return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	if (!p.ownedMiscItemIds.includes('map')) return INVALID_MOVE;
	const dice = p.prospectMapRerollDice;
	const idx = typeof dieIndexArg === 'number' ? dieIndexArg : Number(dieIndexArg);
	if (!Number.isInteger(idx) || (idx !== 0 && idx !== 1) || dice == null || dice.length === 0) {
		return INVALID_MOVE;
	}
	if (!dice.some((e) => e.slotIndex === idx)) return INVALID_MOVE;

	const slotIndex = idx as 0 | 1;
	const slot0FacesBefore = dice.filter((e) => e.slotIndex === 0).map((e) => e.face);
	const slot1FacesBefore = dice.filter((e) => e.slotIndex === 1).map((e) => e.face);

	const prevForSlot = dice.filter((e) => e.slotIndex === idx);
	const prevSummary = prevForSlot.map((o) => describeProspectOutcome(o, p)).join('; ');
	for (const o of [...prevForSlot].reverse()) {
		undoProspectOutcome(p, o);
	}

	const newSlot = rollProspectDieSlot(Math.random, slotIndex);
	const newFlat: ProspectMapDieOutcome[] = [];
	for (const face of newSlot.faces) {
		const o = applyProspectFaceWithOutcome(p, face);
		newFlat.push({
			slotIndex,
			face: o.face,
			nuggetAdded: o.nuggetAdded,
			goldAdded: o.goldAdded,
		});
	}
	const keep = dice.filter((e) => e.slotIndex !== slotIndex);
	const slot0 = slotIndex === 0 ? newFlat : keep.filter((e) => e.slotIndex === 0);
	const slot1 = slotIndex === 1 ? newFlat : keep.filter((e) => e.slotIndex === 1);
	const nextSummary = [...slot0, ...slot1].map((o) => describeProspectOutcome(o, p)).join('; ');
	const summaryLines = [...slot0, ...slot1].map((o) => describeProspectOutcome(o, p));

	p.prospectMapRerollDice = null;
	appendLog(G, ctx.currentPlayer, `Miner's Map: rerolled die ${idx + 1} (${prevSummary}) → ${nextSummary}`);

	migrateProspectRevealIfMissing(G);
	if (G.prospectReveal != null && G.prospectReveal.playerId === ctx.currentPlayer) {
		const revealSlots: ProspectSlotFaces[] = [
			{
				slotIndex: 0,
				faces: slotIndex === 0 ? newSlot.faces : slot0FacesBefore,
			},
			{
				slotIndex: 1,
				faces: slotIndex === 1 ? newSlot.faces : slot1FacesBefore,
			},
		];
		G.prospectReveal = {
			playerId: ctx.currentPlayer,
			slots: revealSlots,
			summaries: summaryLines,
		};
	}
}

/** B — Whiskey reaction: discard Whiskey to give another player in your space 1 wound. */
function moveUseWhiskeyReaction({ G, ctx }: WLCtx, targetIdArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	if (typeof targetIdArg !== 'string' || targetIdArg.length === 0) return INVALID_MOVE;
	const targetId = targetIdArg;
	const p = G.players[ctx.currentPlayer];
	if (!p) return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	if (p.whiskeyReactionAvailable !== true) return INVALID_MOVE;
	const ix = p.ownedMiscItemIds.indexOf('whiskey');
	if (ix < 0) return INVALID_MOVE;
	const target = G.players[targetId];
	if (!target || targetId === ctx.currentPlayer) return INVALID_MOVE;
	if (target.locationId !== p.locationId) return INVALID_MOVE;
	if (!takeDiscreteTurnSlot(p, 'card')) return INVALID_MOVE;
	p.ownedMiscItemIds.splice(ix, 1);
	target.wounds += 1;
	p.whiskeyReactionAvailable = false;
	appendLog(G, ctx.currentPlayer, `Whiskey: discarded — gave 1 wound to player ${targetId} (same space)`);
}

/** B — Provisions: discard to draw 1 poker card and heal 1 wound. */
function moveUseProvisions({ G, ctx }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	if (!p) return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	const ix = p.ownedMiscItemIds.indexOf('provisions');
	if (ix < 0) return INVALID_MOVE;
	if (!takeDiscreteTurnSlot(p, 'card')) return INVALID_MOVE;
	p.ownedMiscItemIds.splice(ix, 1);
	p.wounds = Math.max(0, p.wounds - 1);
	const d = drawFromPokerDeck(G, 1);
	if (d[0]) p.hand.push(d[0]);
	appendLog(G, ctx.currentPlayer, 'Provisions: discarded — drew 1 poker card, -1 wound');
}

/** Saloon — start a multiplayer poker round in the current town (join/skip prompt for others). */
function moveStartSaloon({ G, ctx, events }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateSaloonRoundIfMissing(G);
	migrateSaloonRevealIfMissing(G);
	G.saloonReveal = null;
	migrateProspectRevealIfMissing(G);
	G.prospectReveal = null;
	migrateFightIfMissing(G);
	if (G.fight != null) return INVALID_MOVE;
	if (G.saloonRound != null) return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	const loc = currentSpace(G, ctx.currentPlayer);
	if (!p || loc?.actionKind !== 'playPoker') return INVALID_MOVE;
	const cityId = getBoardSpaceCity(p.locationId);
	if (cityId == null) return INVALID_MOVE;
	if (p.gold < POKER_ANTE_GOLD) return INVALID_MOVE;
	if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;

	// Active player antes + draws 1 immediately.
	p.gold -= POKER_ANTE_GOLD;
	const anteCard = drawFromPokerDeck(G, 1)[0];
	if (!anteCard) {
		p.gold += POKER_ANTE_GOLD;
		revertDiscreteTurnSlot(p);
		return INVALID_MOVE;
	}
	p.hand.push(anteCard);

	const flop = drawFromPokerDeck(G, 3);
	if (flop.length < 3) {
		// Roll back ante card.
		p.hand.pop();
		G.pokerDiscard.push(anteCard);
		p.gold += POKER_ANTE_GOLD;
		revertDiscreteTurnSlot(p);
		return INVALID_MOVE;
	}

	const eligible = Object.keys(G.players).filter((pid) => {
		if (pid === ctx.currentPlayer) return false;
		const pl = G.players[pid];
		if (!pl) return false;
		if (getBoardSpaceCity(pl.locationId) !== cityId) return false;
		return true;
	});

	G.saloonRound = {
		activePlayerId: ctx.currentPlayer,
		cityId,
		flop,
		potGold: SALOON_HOUSE_ADDS_TO_POT + POKER_ANTE_GOLD,
		pendingPlayerIds: eligible,
		joinedPlayerIds: [ctx.currentPlayer],
		tieBreakCandidateIds: null,
		dealerShowdown: null,
	};

	appendLog(G, ctx.currentPlayer, `Saloon started in ${cityId} (waiting on ${eligible.length} player(s))`);

	if (eligible.length === 0) maybeAdvanceSaloonAfterJoinPhase(G, ctx, events);
	else saloonApplyJoinPhaseActivePlayers(events, G.saloonRound!);
}

function moveJoinSaloon({ G, ctx, events, playerID }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateSaloonRoundIfMissing(G);
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid == null) return INVALID_MOVE;
	if (!saloonEligibleToRespond(G, pid)) return INVALID_MOVE;
	const r = G.saloonRound!;
	const p = G.players[pid];
	if (!p) return INVALID_MOVE;
	if (getBoardSpaceCity(p.locationId) !== r.cityId) return INVALID_MOVE;
	if (p.gold < POKER_ANTE_GOLD) return INVALID_MOVE;

	p.gold -= POKER_ANTE_GOLD;
	const c = drawFromPokerDeck(G, 1)[0];
	if (!c) {
		p.gold += POKER_ANTE_GOLD;
		return INVALID_MOVE;
	}
	p.hand.push(c);

	r.potGold += POKER_ANTE_GOLD;
	r.joinedPlayerIds.push(pid);
	r.pendingPlayerIds = r.pendingPlayerIds.filter((id) => id !== pid);
	appendLog(G, pid, 'joined Saloon poker');
	events.endStage();
	maybeAdvanceSaloonAfterJoinPhase(G, ctx, events);
}

function moveSkipSaloon({ G, ctx, events, playerID }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateSaloonRoundIfMissing(G);
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid == null) return INVALID_MOVE;
	if (!saloonEligibleToRespond(G, pid)) return INVALID_MOVE;
	const r = G.saloonRound!;
	r.pendingPlayerIds = r.pendingPlayerIds.filter((id) => id !== pid);
	appendLog(G, pid, 'skipped Saloon poker');
	events.endStage();
	maybeAdvanceSaloonAfterJoinPhase(G, ctx, events);
}

function moveChooseSaloonWinner({ G, ctx, events }: WLCtx, winnerIdArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateSaloonRoundIfMissing(G);
	const r = G.saloonRound;
	if (!r || r.tieBreakCandidateIds == null) return INVALID_MOVE;
	if (ctx.currentPlayer !== r.activePlayerId) return INVALID_MOVE;
	if (typeof winnerIdArg !== 'string' || winnerIdArg.length === 0) return INVALID_MOVE;
	const winner = winnerIdArg;
	if (!r.tieBreakCandidateIds.includes(winner)) return INVALID_MOVE;

	const flop = r.flop;
	const joined = r.joinedPlayerIds.filter((pid) => G.players[pid] != null);
	const ranked: SaloonRevealEntry[] = joined
		.map((pid) => {
			const hand = G.players[pid]!.hand as StandardCard[];
			return {
				playerId: pid,
				role: 'player' as const,
				holeCards: pickBestTwoForFlopSaloon(hand, flop),
				score: bestPokerScoreFromHandAndFlopSaloon(hand, flop),
			};
		})
		.sort((a, b) => comparePokerScores(b.score, a.score));

	const pot = r.potGold;
	const wp = G.players[winner];
	if (!wp) return INVALID_MOVE;
	const goldBeforeW = wp.gold;
	const lpBeforeW = wp.legendaryPoints;
	grantGold(wp, pot);
	wp.legendaryPoints += SALOON_WIN_LEGEND_POINTS;

	const losers = r.joinedPlayerIds.filter((pid) => pid !== winner);
	for (const pid of losers) {
		const lp = G.players[pid];
		if (!lp) continue;
		const hand = lp.hand as StandardCard[];
		const hole = pickBestTwoForFlopSaloon(hand, flop);
		if (saloonPickedHoleUsesRedTenBonus(hole)) {
			grantGold(lp, 30);
			appendLog(G, pid, 'Poker bonus (red 10): +$30 (lost tie-break)');
		}
		const d = drawFromPokerDeck(G, 1);
		if (d[0]) lp.hand.push(d[0]);
		if (saloonPickedHoleUsesRedTenBonus(hole)) {
			const d2 = drawFromPokerDeck(G, 1);
			if (d2[0]) {
				lp.hand.push(d2[0]);
				appendLog(G, pid, 'Poker bonus (red 10): drew 1 extra card (lost tie-break)');
			}
		}
	}

	appendLog(G, r.activePlayerId, `Saloon: tie broken, ${winner} wins ${pot} gold and +${SALOON_WIN_LEGEND_POINTS} LP`);

	G.saloonReveal = {
		cityId: r.cityId,
		flop: [...flop],
		ranked,
		winnerId: winner,
		potGold: pot,
		winnerGold: wp.gold - goldBeforeW,
		winnerLegendPoints: wp.legendaryPoints - lpBeforeW,
	};

	G.pokerDiscard.push(...r.flop);
	G.saloonRound = null;
	saloonApplyRevealDismissActivePlayers(ctx, events);
}

function moveDismissSaloonReveal({ G, ctx, events }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateSaloonRevealIfMissing(G);
	if (G.saloonReveal == null) return INVALID_MOVE;
	G.saloonReveal = null;
	saloonClearActivePlayers(events);
}

function moveDismissProspectReveal({ G, ctx, playerID }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateProspectRevealIfMissing(G);
	if (G.prospectReveal == null) return INVALID_MOVE;
	const pid = typeof playerID === 'string' ? playerID : null;
	if (pid == null || pid !== G.prospectReveal.playerId) return INVALID_MOVE;
	const miningPid = G.prospectReveal.playerId;
	G.prospectReveal = null;
	const miner = G.players[miningPid];
	if (miner) miner.prospectMapRerollDice = null;
}

/** Revel — Cabaret; $30 × tiers → tiers LP (tiers 1–4). */
function moveRevel({ G, ctx }: WLCtx, tiersArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const tiers = typeof tiersArg === 'number' ? tiersArg : Number(tiersArg);
	const p = G.players[ctx.currentPlayer];
	const loc = currentSpace(G, ctx.currentPlayer);
	if (!p || loc?.actionKind !== 'cabaret') return INVALID_MOVE;
	if (!Number.isInteger(tiers) || tiers < 1 || tiers > 4) return INVALID_MOVE;
	const cost = tiers * REVEL_GOLD_PER_LP;
	if (p.gold < cost) return INVALID_MOVE;
	if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;
	p.gold -= cost;
	p.legendaryPoints += tiers;
	appendLog(G, ctx.currentPlayer, `revel (−${cost} gold, +${tiers} LP)`);
}

/** Deposit nuggets — Bank; sell all carried nuggets. */
function moveDepositNuggets({ G, ctx }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	const loc = currentSpace(G, ctx.currentPlayer);
	if (!p || loc?.actionKind !== 'bank') return INVALID_MOVE;
	if (p.nuggets <= 0) return INVALID_MOVE;
	if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;
	const n = p.nuggets;
	p.nuggets = 0;
	grantGold(p, n * DEPOSIT_GOLD_PER_NUGGET);
	p.legendaryPoints += n * DEPOSIT_LP_PER_NUGGET;
	migratePlayerItemsIfMissing(p);
	let extra = '';
	if (p.ownedMountItemIds.includes('mule_upgrade') && n >= 4) {
		p.legendaryPoints += 1;
		extra = '; Rosinane: +1 LP (deposited 4+ nuggets)';
	}
	appendLog(G, ctx.currentPlayer, `deposited ${n} nugget(s) (+${n * DEPOSIT_GOLD_PER_NUGGET} gold, +${n * DEPOSIT_LP_PER_NUGGET} LP)${extra}`);
}

/**
 * Heist — Bank; once per turn. Clockwise neighbor is guard; both draw 3 poker cards as fight stubs.
 * Robber wins ties. Win: $80 + 3 wanted. Lose: +1 wanted, +1 wound, draw 1 poker.
 */
function moveHeist({ G, ctx }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	const loc = currentSpace(G, ctx.currentPlayer);
	if (!p || loc?.actionKind !== 'bank') return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	if (p.usedHeistThisTurn) return INVALID_MOVE;
	if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;

	const drawRobber = drawFromPokerDeck(G, 3);
	const drawGuard = drawFromPokerDeck(G, 3);
	if (drawRobber.length < 3 || drawGuard.length < 3) {
		revertDiscreteTurnSlot(p);
		return INVALID_MOVE;
	}

	p.usedHeistThisTurn = true;
	const cmp = compareThreeCardFight(drawRobber, drawGuard);
	G.pokerDiscard.push(...drawRobber, ...drawGuard);

	const guardId = clockwiseNextPlayerId(ctx, G, ctx.currentPlayer);
	const guardPl = G.players[guardId];
	const guardLabel = guardPl?.characterId != null ? (STARTER_CHARACTER_BY_ID[guardPl.characterId]?.name ?? `seat ${guardId}`) : `seat ${guardId}`;

	if (cmp >= 0) {
		grantGold(p, HEIST_WIN_GOLD);
		grantWantedPoints(G, ctx.currentPlayer, HEIST_WIN_WANTED, ctx.currentPlayer, 'heist succeeded', ctx);
		appendLog(G, ctx.currentPlayer, `heist succeeded vs ${guardLabel} (+${HEIST_WIN_GOLD} gold, +${HEIST_WIN_WANTED} wanted)`);
	} else {
		grantWantedPoints(G, ctx.currentPlayer, HEIST_LOSE_WANTED, ctx.currentPlayer, 'heist failed', ctx);
		p.wounds += 1;
		const drawn = drawFromPokerDeck(G, 1);
		if (drawn[0]) p.hand.push(drawn[0]);
		appendLog(G, ctx.currentPlayer, `heist failed vs ${guardLabel} (+${HEIST_LOSE_WANTED} wanted, +1 wound, drew 1 card)`);
	}
}

/** Heal — Doctor's Office; $10, lose all wounds, draw 1 poker per wound healed. */
function moveHeal({ G, ctx }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	const loc = currentSpace(G, ctx.currentPlayer);
	if (!p || loc?.actionKind !== 'doctor') return INVALID_MOVE;
	if (p.wounds <= 0) return INVALID_MOVE;
	if (p.gold < HEAL_COST_GOLD) return INVALID_MOVE;
	if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;
	p.gold -= HEAL_COST_GOLD;
	const healed = p.wounds;
	p.wounds = 0;
	const drawn = drawFromPokerDeck(G, healed);
	p.hand.push(...drawn);
	appendLog(G, ctx.currentPlayer, `healed (−${HEAL_COST_GOLD} gold, −${healed} wound(s), drew ${drawn.length} card(s))`);
}

/** Acquire cattle — Ranch; one token at a time. */
function moveAcquireCattle({ G, ctx }: WLCtx) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	const loc = currentSpace(G, ctx.currentPlayer);
	if (!p || loc?.actionKind !== 'ranch') return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	migrateCattlePilesIfMissing(G);
	migrateFightDeckIfMissing(G);
	if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;

	// Green herd: pick up at mp-2, deliver at sh-3.
	if (loc.id === 'mp-2') {
		if (p.carriedCattle === null) {
			const face = G.cattlePiles.green.shift();
			if (face == null) {
				revertDiscreteTurnSlot(p);
				return INVALID_MOVE;
			}
			p.carriedCattle = { color: 'green', face };
			appendLog(G, ctx.currentPlayer, `picked up Green cattle at ${spaceLabelForLog(loc)}`);
			return;
		}
		performRustleAtRanch(G, ctx, p, loc);
		if (p.carriedCattle === null) return;
		revertDiscreteTurnSlot(p);
		return INVALID_MOVE;
	}

	// Blue herd: pick up at sh-3, deliver at mp-2.
	if (loc.id === 'sh-3') {
		if (p.carriedCattle === null) {
			const face = G.cattlePiles.blue.shift();
			if (face == null) {
				revertDiscreteTurnSlot(p);
				return INVALID_MOVE;
			}
			p.carriedCattle = { color: 'blue', face };
			appendLog(G, ctx.currentPlayer, `picked up Blue cattle at ${spaceLabelForLog(loc)}`);
			return;
		}
		performRustleAtRanch(G, ctx, p, loc);
		if (p.carriedCattle === null) return;
		revertDiscreteTurnSlot(p);
		return INVALID_MOVE;
	}

	revertDiscreteTurnSlot(p);
	return INVALID_MOVE;
}

/**
 * Rulebook: buying a weapon/mount at the General Store equips it for the rest of this turn.
 * {@link moveBuyFromGeneralStore} calls {@link refreshMovementPointsForTurnMount} after each successful purchase.
 */
function applyGeneralStoreImmediateEquip(p: WesternLegendsPlayer, itemId: string): void {
	if (WEAPON_ITEM_ID_SET.has(itemId)) {
		p.turnWeaponItemId = itemId;
		p.needsTurnWeaponMountChoice = false;
	}
	if (MOUNT_ITEM_ID_SET.has(itemId)) {
		p.turnMountItemId = itemId;
		p.needsTurnWeaponMountChoice = false;
	}
}

/** General Store — buy or upgrade; first purchase on this hex after a move costs one `location` slot; further purchases while stationary do not. */
function moveBuyFromGeneralStore({ G, ctx }: WLCtx, itemIdArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	if (typeof itemIdArg !== 'string' || itemIdArg.length === 0) return INVALID_MOVE;
	const itemId = itemIdArg;
	const price = GENERAL_STORE_PRICES[itemId];
	if (price == null) return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	const loc = currentSpace(G, ctx.currentPlayer);
	if (!p || loc?.actionKind !== 'generalStore') return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	if (p.gold < price) return INVALID_MOVE;

	const baseForUpgrade = ITEM_UPGRADE_BASE[itemId];
	if (baseForUpgrade != null) {
		if (WEAPON_ITEM_ID_SET.has(itemId)) {
			if (!p.ownedWeaponItemIds.includes(baseForUpgrade)) return INVALID_MOVE;
			if (p.ownedWeaponItemIds.includes(itemId)) return INVALID_MOVE;
		} else if (MOUNT_ITEM_ID_SET.has(itemId)) {
			if (!p.ownedMountItemIds.includes(baseForUpgrade)) return INVALID_MOVE;
			if (p.ownedMountItemIds.includes(itemId)) return INVALID_MOVE;
		} else {
			return INVALID_MOVE;
		}
	} else if (WEAPON_ITEM_ID_SET.has(itemId)) {
		if (p.ownedWeaponItemIds.includes(itemId)) return INVALID_MOVE;
	} else if (MOUNT_ITEM_ID_SET.has(itemId)) {
		if (p.ownedMountItemIds.includes(itemId)) return INVALID_MOVE;
	} else if (isMiscItemId(itemId)) {
		if (p.ownedMiscItemIds.includes(itemId)) return INVALID_MOVE;
		if (p.ownedMiscItemIds.length >= GENERAL_STORE_MAX_MISC_ITEMS) return INVALID_MOVE;
	} else {
		return INVALID_MOVE;
	}

	migrateGeneralStoreStockIfMissing(G);
	if (baseForUpgrade == null && GENERAL_STORE_BASE_ITEM_ID_SET.has(itemId)) {
		const left = G.generalStoreStock[itemId] ?? 0;
		if (left <= 0) return INVALID_MOVE;
	}

	const storeVisitAlreadyPaid = p.generalStoreVisitPaidLocationId != null && p.generalStoreVisitPaidLocationId === p.locationId;
	if (!storeVisitAlreadyPaid) {
		if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;
		p.generalStoreVisitPaidLocationId = p.locationId;
	}

	p.gold -= price;

	if (baseForUpgrade != null) {
		if (WEAPON_ITEM_ID_SET.has(itemId)) {
			p.ownedWeaponItemIds = p.ownedWeaponItemIds.filter((id) => id !== baseForUpgrade);
			p.ownedWeaponItemIds.push(itemId);
		} else {
			p.ownedMountItemIds = p.ownedMountItemIds.filter((id) => id !== baseForUpgrade);
			p.ownedMountItemIds.push(itemId);
		}
		const lp = UPGRADE_FLIP_LEGEND_POINTS[itemId] ?? 0;
		if (lp > 0) p.legendaryPoints += lp;
		applyGeneralStoreImmediateEquip(p, itemId);
		appendLog(
			G,
			ctx.currentPlayer,
			lp > 0 ? `General Store: flipped to ${itemId} (−${price} gold, +${lp} LP)` : `General Store: flipped to ${itemId} (−${price} gold)`,
		);
		refreshMovementPointsForTurnMount(p);
		return;
	}

	if (GENERAL_STORE_BASE_ITEM_ID_SET.has(itemId)) {
		G.generalStoreStock[itemId] = (G.generalStoreStock[itemId] ?? 0) - 1;
	}

	if (WEAPON_ITEM_ID_SET.has(itemId)) {
		p.ownedWeaponItemIds.push(itemId);
	} else if (MOUNT_ITEM_ID_SET.has(itemId)) {
		p.ownedMountItemIds.push(itemId);
	} else {
		p.ownedMiscItemIds.push(itemId);
	}

	applyGeneralStoreImmediateEquip(p, itemId);

	if (itemId === 'provisions') {
		const d = drawFromPokerDeck(G, 1);
		if (d[0]) p.hand.push(d[0]);
		appendLog(G, ctx.currentPlayer, `General Store: bought ${itemId} (-${price} gold); Provisions: drew 1 poker card`);
		refreshMovementPointsForTurnMount(p);
		return;
	}
	if (itemId === 'whiskey') {
		p.wounds = Math.max(0, p.wounds - 1);
		appendLog(G, ctx.currentPlayer, `General Store: bought ${itemId} (-${price} gold); Whiskey: -1 wound`);
		refreshMovementPointsForTurnMount(p);
		return;
	}

	appendLog(G, ctx.currentPlayer, `General Store: bought ${itemId} (-${price} gold)`);
	refreshMovementPointsForTurnMount(p);
}

function resolveTurnLoadoutAfterIncome(G: WesternLegendsState, playerId: string): void {
	const p = G.players[playerId];
	if (!p) return;
	migratePlayerItemsIfMissing(p);
	const weapons = uniqueWeaponOptions(p.ownedWeaponItemIds);
	const mounts = uniqueMountOptions(p.ownedMountItemIds);
	if (weapons.length <= 1 && mounts.length <= 1) {
		p.turnWeaponItemId = weapons[0] ?? null;
		p.turnMountItemId = mounts[0] ?? null;
		p.needsTurnWeaponMountChoice = false;
		const w = p.turnWeaponItemId ?? 'no weapon';
		const m = p.turnMountItemId ?? 'no mount';
		appendLog(G, playerId, `turn loadout: ${w}, ${m} (auto)`);
		refreshMovementPointsForTurnMount(p);
	} else {
		p.turnWeaponItemId = null;
		p.turnMountItemId = null;
		p.needsTurnWeaponMountChoice = true;
		refreshMovementPointsForTurnMount(p);
	}
}

function normalizeLoadoutArg(a: unknown): string | null {
	if (a == null || a === '') return null;
	if (typeof a !== 'string') return null;
	return a;
}

function moveChooseTurnWeaponMount({ G, ctx }: WLCtx, weaponArg: unknown, mountArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	if (!p?.needsTurnWeaponMountChoice) return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	const weapons = uniqueWeaponOptions(p.ownedWeaponItemIds);
	const mounts = uniqueMountOptions(p.ownedMountItemIds);
	const weaponId = normalizeLoadoutArg(weaponArg);
	const mountId = normalizeLoadoutArg(mountArg);
	if (weapons.length === 0) {
		if (weaponId != null) return INVALID_MOVE;
	} else if (weaponId == null || !weapons.includes(weaponId)) return INVALID_MOVE;
	if (mounts.length === 0) {
		if (mountId != null) return INVALID_MOVE;
	} else if (mountId == null || !mounts.includes(mountId)) return INVALID_MOVE;
	p.turnWeaponItemId = weaponId;
	p.turnMountItemId = mountId;
	p.needsTurnWeaponMountChoice = false;
	appendLog(G, ctx.currentPlayer, `turn loadout: ${weaponId ?? 'no weapon'}, ${mountId ?? 'no mount'}`);
	refreshMovementPointsForTurnMount(p);
}

function moveChooseStartTurnIncome({ G, ctx }: WLCtx, option: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	if (!p?.needsStartTurnIncomeChoice) return INVALID_MOVE;
	const o = option as StartTurnIncomeOption;
	if (o !== 'gold20' && o !== 'draw2' && o !== 'gold10draw1') return INVALID_MOVE;
	p.needsStartTurnIncomeChoice = false;
	if (o === 'gold20') {
		grantGold(p, START_TURN_INCOME_GOLD_ONLY);
		appendLog(G, ctx.currentPlayer, `turn income: +$${START_TURN_INCOME_GOLD_ONLY}`);
	} else if (o === 'draw2') {
		const drawn = drawFromPokerDeck(G, START_TURN_INCOME_DRAW);
		if (drawn.length) p.hand.push(...drawn);
		appendLog(
			G,
			ctx.currentPlayer,
			drawn.length >= START_TURN_INCOME_DRAW
				? `turn income: drew ${START_TURN_INCOME_DRAW} poker cards`
				: `turn income: drew ${drawn.length} poker card(s) (deck thin)`,
		);
	} else {
		grantGold(p, START_TURN_INCOME_SPLIT_GOLD);
		const drawn = drawFromPokerDeck(G, START_TURN_INCOME_SPLIT_DRAW);
		if (drawn.length) p.hand.push(...drawn);
		appendLog(
			G,
			ctx.currentPlayer,
			drawn.length
				? `turn income: +$${START_TURN_INCOME_SPLIT_GOLD}, drew ${START_TURN_INCOME_SPLIT_DRAW} poker card`
				: `turn income: +$${START_TURN_INCOME_SPLIT_GOLD} (could not draw card)`,
		);
	}
	resolveTurnLoadoutAfterIncome(G, ctx.currentPlayer);
}

function movePass({ G, ctx, events }: WLCtx, discardIdsArg?: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	migrateProspectRevealIfMissing(G);
	migrateSaloonRevealIfMissing(G);
	migrateSheriffEncounterIfMissing(G);
	if (G.sheriffEncounter != null) return INVALID_MOVE;
	if (G.prospectReveal != null) return INVALID_MOVE;
	if (G.saloonReveal != null) return INVALID_MOVE;
	const p = G.players[ctx.currentPlayer];
	if (p?.needsStartTurnIncomeChoice) return INVALID_MOVE;
	if (p?.needsTurnWeaponMountChoice) return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	if (p.pendingCattleMarshalOrWanted) return INVALID_MOVE;
	if (p.pendingBanditBountyChoice) return INVALID_MOVE;
	migrateStoryInPlayIfMissing(G);
	migrateStoryDecksIfMissing(G);

	const maxH = maxPokerHandSize(p);
	const parsed = parsePassDiscardIds(discardIdsArg);
	if (parsed === null) return INVALID_MOVE;
	if (!validatePassDiscards(p, maxH, parsed)) return INVALID_MOVE;

	/**
	 * End-of-turn story steps run only after pass (hand trim) is valid — otherwise boardgame.io rolls the
	 * whole move back and story resolution would be lost.
	 */
	/** Wilderness story back: end turn outside Darkrock / Red Falls city hexes (see {@link isInsideAnyBoardCity}). */
	if (!isInsideAnyBoardCity(p.locationId)) {
		tryContributeStoryDiscForBackKind(G, ctx, ctx.currentPlayer, 'end_turn_outside_town');
	}
	resolveStoriesAtEndOfTurn(G, ctx, ctx.currentPlayer);

	if (parsed.length > 0) discardVisibleCardsFromHand(G, ctx.currentPlayer, p, parsed, 'end_of_turn_trim');

	const lpGain = wantedTrackRowLpGain(p.wantedPoints);
	if (lpGain > 0) {
		p.legendaryPoints += lpGain;
		appendLog(G, ctx.currentPlayer, `end of turn: +${lpGain} LP (wanted track row)`);
	}

	appendLog(G, ctx.currentPlayer, 'passed');

	migrateManInBlackIfMissing(G);
	const orderPass = ctx.playOrder;
	const lastSeat = orderPass[orderPass.length - 1];
	let mibRoundCompleteSync = true;
	if (
		isManInBlackVariant(G) &&
		G.endgamePhase === 'none' &&
		String(ctx.currentPlayer) === String(lastSeat)
	) {
		mibRoundCompleteSync = resolveManInBlackAfterRound(G, ctx, events);
	}

	/** Rulebook: legend goal is evaluated on **pass**, not mid-turn; then finish round + final round before `endIf`. */
	if (mibRoundCompleteSync) {
		progressEndgameAfterPass(G, ctx, events);
	}
}

function stdCardFromHandById(p: WesternLegendsPlayer, cardId: string): StandardCard | null {
	for (const c of p.hand) {
		if (isCardHidden(c)) continue;
		const v = c as VisibleCard;
		if (v.id === cardId && typeof (c as StandardCard).rank === 'string') return c as StandardCard;
	}
	return null;
}

function moveManInBlackInteractionCommit({ G, ctx, events, playerID }: WLCtx, cardIdArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	if (typeof playerID !== 'string') return INVALID_MOVE;
	migrateManInBlackIfMissing(G);
	const pend = G.manInBlackPending;
	if (!pend || pend.kind !== 'interaction') return INVALID_MOVE;
	if (playerID !== pend.targetPlayerId) return INVALID_MOVE;
	if (typeof cardIdArg !== 'string') return INVALID_MOVE;
	const p = G.players[playerID];
	if (!p) return INVALID_MOVE;
	migratePlayerItemsIfMissing(p);
	const card = pullCardFromHandById(p, cardIdArg);
	if (!card) return INVALID_MOVE;

	const a = G.fightDeck.shift();
	const b = G.fightDeck.shift();
	const c3 = G.fightDeck.shift();
	if (a == null || b == null || c3 == null) {
		if (a) G.fightDeck.unshift(a);
		if (b) G.fightDeck.unshift(b);
		G.pokerDiscard.push(card);
		appendLog(G, playerID, 'MIB interaction: fight deck exhausted');
		finishMibDeferredProgressEndgame(G, ctx, events);
		return;
	}
	const triplet = [a, b, c3] as [FightCardFaceId, FightCardFaceId, FightCardFaceId];
	const hi = highestOfThreeFightCardFaces(triplet);
	const mibSynth = fightCardFaceToSyntheticPokerCard(hi);
	G.fightDeck.push(...shuffle([...triplet]));
	G.pokerDiscard.push(card);

	const cmp = compareFightPlayedCardsWithRankPenalty(
		card,
		mibSynth,
		MIB_VS_PLAYER_EXTRA_CHALLENGER_RANK_STEPS,
		0,
	);
	const humanWins = cmp > 0;
	const leadersTied = pend.leadersTied;

	if (pend.interaction === 'duel') {
		if (humanWins) {
			appendLog(G, playerID, `MIB duel: you win (${card.id} vs MIB ${hi})`);
		} else {
			const mibLp = leadersTied ? 1 : 2;
			grantMibLegendPoints(G, mibLp, playerID, `MIB (${pend.mibCardId}) wins duel`);
			const bulletproof = card.rank === 'J';
			if (bulletproof) {
				p.wounds = Math.max(0, p.wounds - 1);
				appendLog(G, playerID, 'Bulletproof: no fight wound; heal 1');
			} else {
				applyFightLoserWoundDraw(G, playerID);
			}
			if (p.wantedPoints >= 1) {
				applyMibDuelArrestIfWanted(G, playerID, playerID);
			}
		}
	} else {
		if (humanWins) {
			appendLog(G, playerID, `MIB rob: you win (${card.id} vs MIB ${hi})`);
		} else {
			grantMibLegendPoints(G, 1, playerID, `MIB (${pend.mibCardId}) wins rob`);
			if (p.nuggets > 0) {
				const loss = Math.ceil(p.nuggets / 2);
				p.nuggets = Math.max(0, p.nuggets - loss);
				appendLog(G, playerID, `MIB rob: lost ${loss} nugget(s)`);
			} else {
				const loss = Math.ceil(p.gold / 2);
				p.gold = Math.max(0, p.gold - loss);
				appendLog(G, playerID, `MIB rob: lost $${loss} (no nuggets)`);
			}
		}
	}
	finishMibDeferredProgressEndgame(G, ctx, events);
}

function moveManInBlackDiscardCommit({ G, ctx, events, playerID }: WLCtx, cardIdArg: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	if (typeof playerID !== 'string') return INVALID_MOVE;
	migrateManInBlackIfMissing(G);
	const pend = G.manInBlackPending;
	if (!pend || pend.kind !== 'discardBoth') return INVALID_MOVE;
	if (typeof cardIdArg !== 'string') return INVALID_MOVE;
	const p = G.players[playerID];
	if (!p) return INVALID_MOVE;
	if (playerID !== pend.awaitingPlayerId) return INVALID_MOVE;
	const card = pullCardFromHandById(p, cardIdArg);
	if (!card) return INVALID_MOVE;
	G.pokerDiscard.push(card);
	const o0 = String(ctx.playOrder[0]);
	const o1 = String(ctx.playOrder[1]);
	if (playerID === o0) {
		pend.awaitingPlayerId = o1;
		events.setActivePlayers({ value: { [o1]: 'mibCardAct' } });
		return;
	}
	finishMibDeferredProgressEndgame(G, ctx, events);
}

function moveManInBlackCabaretProxyPick({ G, ctx, events, playerID }: WLCtx, a: unknown, b: unknown) {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	if (typeof playerID !== 'string') return INVALID_MOVE;
	migrateManInBlackIfMissing(G);
	const pend = G.manInBlackPending;
	if (!pend || pend.kind !== 'cabaretProxyPick') return INVALID_MOVE;
	if (playerID !== pend.proxyPlayerId) return INVALID_MOVE;
	if (typeof a !== 'string' || typeof b !== 'string' || a === b) return INVALID_MOVE;
	const pool = new Set(pend.mibPoolCardIds);
	if (!pool.has(a) || !pool.has(b)) return INVALID_MOVE;
	const pPx = G.players[playerID]!;
	const pIn = G.players[pend.inRfPlayerId]!;
	migratePlayerItemsIfMissing(pPx);
	migratePlayerItemsIfMissing(pIn);
	const cPx1 = pullCardFromHandById(pPx, a);
	const cPx2 = pullCardFromHandById(pPx, b);
	if (!cPx1 || !cPx2) return INVALID_MOVE;
	const in1 = pullCardFromHandById(pIn, pend.inRfCardIds[0]);
	const in2 = pullCardFromHandById(pIn, pend.inRfCardIds[1]);
	if (!in1 || !in2) return INVALID_MOVE;
	const mibHand: StandardCard[] = [cPx1, cPx2];
	const humHand: StandardCard[] = [in1, in2];
	const cmp = compareTwoCardPokerHands(humHand, mibHand);
	G.pokerDiscard.push(cPx1, cPx2, in1, in2);

	const mibWins = cmp < 0 || cmp === 0;
	if (mibWins) {
		grantMibLegendPoints(G, 1, playerID, 'MIB (cabaret): wins vs lone Red Falls player');
	} else {
		pIn.legendaryPoints += 1;
		grantGold(pIn, 50);
		appendLog(G, pend.inRfPlayerId, 'MIB (cabaret): you win vs MIB (+1 LP, +$50)');
	}
	shuffleMibDiscardIntoDeck(G, playerID);
	finishMibDeferredProgressEndgame(G, ctx, events);
}

const WesternLegendsGame: Game<WesternLegendsState> = {
	name: 'western-legends',

	events: {
		endPhase: true,
		endTurn: true,
	},

	setup: (firstArg: { ctx: Ctx; setupData?: WesternLegendsSetupData } | Ctx, secondArg?: WesternLegendsSetupData): WesternLegendsState => {
		const ctx = typeof (firstArg as { ctx?: Ctx }).ctx !== 'undefined' ? (firstArg as { ctx: Ctx }).ctx : (firstArg as Ctx);
		const setupData = (firstArg as { setupData?: WesternLegendsSetupData }).setupData ?? secondArg;
		const shortGame = setupData?.shortGame === true;
		const legendGoal = setupData?.legendGoal ?? (shortGame ? SHORT_GAME_LEGEND_GOAL : LEGEND_POINTS_TO_WIN);
		const goalsVariant = setupData?.goalsVariant === true;
		const n = ctx.numPlayers;
		const manInBlackOn = n === 2 && setupData?.manInBlack === true;
		const hostFaction: 'outlaw' | 'marshal' = setupData?.hostFaction === 'marshal' ? 'marshal' : 'outlaw';

		const pokerDeck = shuffle(createStandardDeck());
		const pokerDiscard: StandardCard[] = [];
		const players: WesternLegendsState['players'] = {};

		const fullCharIds = shuffle(
			STARTER_CHARACTERS.filter((c) => {
				const ids = c.startSpaceChoices && c.startSpaceChoices.length > 0 ? c.startSpaceChoices : [c.startSpaceId];
				return ids.every((id) => BOARD_SPACES_BY_ID[id] != null);
			}).map((c) => c.id),
		);
		if (!manInBlackOn && fullCharIds.length < n * 2) {
			throw new Error('starter character pool too small for player count');
		}

		const outlawMibPool = shuffle(mibCharacterPoolValidIds(MIB_LOBBY_OUTLAW_CHARACTER_IDS));
		const marshalMibPool = shuffle(mibCharacterPoolValidIds(MIB_LOBBY_MARSHAL_CHARACTER_IDS));
		if (manInBlackOn && (outlawMibPool.length < 2 || marshalMibPool.length < 2)) {
			throw new Error('Man in Black draft pools too small');
		}

		for (let i = 0; i < n; i++) {
			const pid = String(i);
			const hand: StandardCard[] = [];
			for (let h = 0; h < 2; h++) {
				const c = pokerDeck.pop();
				if (c) hand.push(c);
			}
			let oa: string;
			let ob: string;
			if (manInBlackOn) {
				const seatWantsOutlaw = hostFaction === 'outlaw' ? i === 0 : i === 1;
				const pool = seatWantsOutlaw ? outlawMibPool : marshalMibPool;
				oa = pool.pop()!;
				ob = pool.pop()!;
			} else {
				if (fullCharIds.length < 2) throw new Error('starter character pool too small for player count');
				oa = fullCharIds.pop()!;
				ob = fullCharIds.pop()!;
			}
			players[pid] = {
				color: PLAYER_COLORS[i % PLAYER_COLORS.length],
				characterOffers: [oa, ob],
				characterId: null,
				locationId: BOARD_STARTING_SPACE_ID,
				movementPointsLeft: DEFAULT_MOVEMENT_POINTS,
				gold: 40,
				legendaryPoints: 0,
				wounds: 0,
				nuggets: 0,
				carriedCattle: null,
				wantedPoints: 0,
				marshalPoints: 0,
				hand,
				turnActions: [],
				needsStartTurnIncomeChoice: false,
				ownedWeaponItemIds: [],
				ownedMountItemIds: [],
				ownedMiscItemIds: [],
				usedHeistThisTurn: false,
				pvpFightTargetsThisTurn: [],
				turnWeaponItemId: null,
				turnMountItemId: null,
				needsTurnWeaponMountChoice: false,
				prospectMapRerollDice: null,
				whiskeyReactionAvailable: false,
				generalStoreVisitPaidLocationId: null,
				legendaryGoalTokens: 0,
			};
		}

		const initialStock = Object.fromEntries(GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]));

		return {
			round: 0,
			turnOrderIndex: 0,
			players,
			pokerDeck,
			pokerDiscard,
			saloonRound: null,
			saloonReveal: null,
			prospectReveal: null,
			fight: null,
			generalStoreStock: initialStock,
			...(() => {
				const shuffled = buildStoryDeck();
				const mid = Math.floor(shuffled.length / 2);
				return {
					storyDeckLeft: shuffled.slice(0, mid),
					storyDeckRight: shuffled.slice(mid),
				};
			})(),
			storyDiscard: [],
			storyInPlay: [null, null],
			boardNpcs: buildInitialBoardNpcs(),
			cattlePiles: buildInitialCattlePiles(),
			fightDeck: buildInitialFightDeck(),
			fightDiscard: [],
			endGameScored: false,
			endGameScoreBreakdown: {},
			gameLog: [],
			legendGoal,
			goalsVariant,
			endgamePhase: 'none',
			endgameTriggeredByPlayerId: null,
			endgamePartialPassesRemaining: 0,
			endgameFinalPassesRemaining: 0,
			endgameTriggeredByManInBlack: false,
			endgamePendingMibFinalTurn: false,
			endgameMibEpilogueResolved: false,
			manInBlackVariant: manInBlackOn,
			manInBlack: manInBlackOn
				? {
						locationId: MAN_IN_BLACK_RAIL_SPACE_ID,
						legendaryPoints: 0,
						color: 'orange',
						deck: buildManInBlackDeck(),
						discard: [],
					}
				: null,
			manInBlackPending: null,
			mibDeferredPass: null,
			history: [],
			sheriffEncounter: null,
		};
	},

	phases: {
		chooseCharacter: {
			start: true,
			next: 'play',
			onBegin: ({ G }) => {
				migrateBoardNpcsIfMissing(G);
				migrateCattlePilesIfMissing(G);
				migrateFightDeckIfMissing(G);
				migrateSheriffEncounterIfMissing(G);
			},
			turn: {
				minMoves: 1,
				maxMoves: 1,
			},
		},
		play: {
			onBegin: ({ G }) => {
				migrateMarshalPointsIfMissing(G);
				migrateStoryInPlayIfMissing(G);
				migrateStoryDecksIfMissing(G);
				dealInitialFaceUpStoryCardsIfEmpty(G);
				migrateSaloonRoundIfMissing(G);
				migrateSaloonRevealIfMissing(G);
				migrateProspectRevealIfMissing(G);
				migrateFightIfMissing(G);
				migrateGeneralStoreStockIfMissing(G);
				migrateBoardNpcsIfMissing(G);
				migrateCattlePilesIfMissing(G);
				migrateFightDeckIfMissing(G);
			},
			turn: {
				/** After draft, DEFAULT would advance past seat 0; reset so play starts with `ctx.playOrder[0]`. */
				order: TurnOrder.RESET,
				stages: {
					/** No `moves`: host uses global moves; {@link validateMove} blocks until pending resolve. */
					saloonHostWait: {},
					saloonJoin: {
						moves: {
							joinSaloon: moveJoinSaloon,
							skipSaloon: moveSkipSaloon,
						},
					},
					saloonTieBreak: {
						moves: {
							chooseSaloonWinner: moveChooseSaloonWinner,
						},
					},
					saloonHolePick: {
						moves: {
							submitSaloonHolePick: moveSubmitSaloonHolePick,
						},
					},
					saloonDismiss: {
						moves: {
							dismissSaloonReveal: moveDismissSaloonReveal,
						},
					},
					fightWait: {},
					fightAct: {},
					mibCardAct: {},
				},
				onBegin: ({ G, ctx }) => {
					migrateMarshalPointsIfMissing(G);
					migrateStoryInPlayIfMissing(G);
					migrateStoryDecksIfMissing(G);
					migrateSaloonRoundIfMissing(G);
					migrateSaloonRevealIfMissing(G);
					migrateProspectRevealIfMissing(G);
					migrateFightIfMissing(G);
					migrateBoardNpcsIfMissing(G);
					migrateSheriffEncounterIfMissing(G);
					const p = G.players[ctx.currentPlayer];
					if (!p) return;
					migratePlayerItemsIfMissing(p);
					p.usedHeistThisTurn = false;
					// carried cattle persists across turns; nothing to reset
					delete p.movementPointsLeftBeforeDiscreteAction;
					p.prospectMapRerollDice = null;
					p.whiskeyReactionAvailable = false;
					p.turnActions = [];
					p.pvpFightTargetsThisTurn = [];
					p.turnWeaponItemId = null;
					p.turnMountItemId = null;
					p.needsTurnWeaponMountChoice = false;
					p.generalStoreVisitPaidLocationId = null;
					delete p.bonusTurnSlots;
					delete p.pendingCattleMarshalOrWanted;
					delete p.pendingBanditBountyChoice;
					delete p.pendingBanditFightFighterChoice;
					delete p.usedLivingLegendThisTurn;
					delete p.usedReputationSevenThisTurn;
					delete p.pendingReputationSevenReaction;
					p.pendingSprintAfterMove = false;
					p.pendingWallopAfterMove = false;
					delete p.usedReputationCardThisTurn;
					delete G.storyResolvedReveal;
					/** Wrangle / rustle if still carrying cattle on rail or opposing ranch (e.g. stranded after refresh or pre-fix saves). */
					tryResolveCattleDelivery(G, ctx, p, p.locationId);
					/** Foot baseline until {@link resolveTurnLoadoutAfterIncome} sets mount and refreshes again. */
					refreshMovementPointsForTurnMount(p);
					const def = p.characterId ? STARTER_CHARACTER_BY_ID[p.characterId] : undefined;
					const legendaryActive = p.legendaryPoints >= LEGENDARY_ACTION_MIN_LP;
					if (legendaryActive && def?.startOfTurnGold) {
						grantGold(p, def.startOfTurnGold);
						appendLog(G, ctx.currentPlayer, `start of turn: +$${def.startOfTurnGold} (${def.name})`);
					}
					if (legendaryActive && def?.startOfTurnDrawPoker) {
						const drawn = drawFromPokerDeck(G, def.startOfTurnDrawPoker);
						if (drawn.length) p.hand.push(...drawn);
						appendLog(
							G,
							ctx.currentPlayer,
							drawn.length
								? `start of turn: drew ${drawn.length} poker card(s) (${def.name})`
								: `start of turn: could not draw poker (${def.name}; deck empty)`,
						);
					}
					p.needsStartTurnIncomeChoice = true;
				},
				minMoves: 1,
				/** Enough room for movement, location actions, then {@link movePass} to end the turn. */
				maxMoves: 64,
			},
		},
	},

	moves: {
		chooseCharacter: moveChooseCharacter,
		chooseStartTurnIncome: moveChooseStartTurnIncome,
		chooseTurnWeaponMount: moveChooseTurnWeaponMount,
		moveToLocation: {
			move: moveMoveToLocation,
			undoable: ({ G }) => isMoveToLocationUndoableAfterBanditApproach(G as WesternLegendsState),
		},
		workForPay: moveWorkForPay,
		prospectForGold: moveProspectForGold,
		startSaloon: moveStartSaloon,
		joinSaloon: moveJoinSaloon,
		skipSaloon: moveSkipSaloon,
		chooseSaloonWinner: moveChooseSaloonWinner,
		submitSaloonHolePick: moveSubmitSaloonHolePick,
		dismissSaloonReveal: moveDismissSaloonReveal,
		dismissProspectReveal: moveDismissProspectReveal,
		revel: moveRevel,
		depositNuggets: moveDepositNuggets,
		heist: moveHeist,
		heal: moveHeal,
		acquireCattle: moveAcquireCattle,
		chooseCattleTrackReward: moveChooseCattleTrackReward,
		buyFromGeneralStore: moveBuyFromGeneralStore,
		minerMapRerollProspect: moveMinerMapRerollProspect,
		useWhiskeyReaction: moveUseWhiskeyReaction,
		useProvisions: moveUseProvisions,
		startFight: moveStartFight,
		resolveFightStartEffect: moveResolveFightStartEffect,
		fightCommitChallengerCard: moveFightCommitChallengerCard,
		fightDefenderCommitCard: moveFightDefenderCommitCard,
		fightDefenderDecline: moveFightDefenderDecline,
		fightReactionPass: moveFightReactionPass,
		fightReactionPlay: moveFightReactionPlay,
		chooseBanditFightCard: moveChooseBanditFightCard,
		chooseSheriffFightCard: moveChooseSheriffFightCard,
		resolveBanditFightFighterChoice: moveResolveBanditFightFighterChoice,
		chooseBanditBountyReward: moveChooseBanditBountyReward,
		sheriffArrestDecline: moveSheriffArrestDecline,
		chooseSheriffArrestTarget: moveChooseSheriffArrestTarget,
		sheriffEncounterDiscard: moveSheriffEncounterDiscard,
		manhuntSheriff: moveManhuntSheriff,
		resolveFightRobLoot: moveResolveFightRobLoot,
		dismissFightOutcome: moveDismissFightOutcome,
		useCardAction: {
			move: moveUseCardAction,
			undoable: ({ G }) => isUseCardActionUndoableAfterManhuntEncounter(G as WesternLegendsState),
		},
		playReputationSeven: movePlayReputationSeven,
		playPokerAfterMove: movePlayPokerAfterMove,
		pass: movePass,
		manInBlackInteractionCommit: moveManInBlackInteractionCommit,
		manInBlackDiscardCommit: moveManInBlackDiscardCommit,
		manInBlackCabaretProxyPick: moveManInBlackCabaretProxyPick,
	},

	/**
	 * boardgame.io may pass a frozen `G` here; do not mutate it. Run migrations only on a deep
	 * clone so `migrateManInBlackIfMissing` / `migrateEndgameStateIfMissing` do not assign to `G`.
	 */
	endIf: ({ G, ctx }: WLCtx) => {
		const maxTurns = MAX_ROUNDS * ctx.numPlayers;
		const GCheck = JSON.parse(JSON.stringify(G)) as WesternLegendsState;
		migrateEndgameStateIfMissing(GCheck);
		migrateManInBlackIfMissing(GCheck);

		if (ctx.turn >= maxTurns) {
			performEndGameScoring(GCheck);
			return (getGameOverResult(GCheck) ?? {
				sharedWinners: Object.keys(GCheck.players),
			}) as WesternLegendsGameOver;
		}

		const goalReached =
			Object.keys(GCheck.players).some((pid) => GCheck.players[pid].legendaryPoints >= GCheck.legendGoal) ||
			(isManInBlackVariant(GCheck) && (GCheck.manInBlack?.legendaryPoints ?? 0) >= GCheck.legendGoal);
		if (goalReached && GCheck.endgamePhase !== 'done') return undefined;

		if (GCheck.endgamePhase === 'done') {
			performEndGameScoring(GCheck);
			return (getGameOverResult(GCheck) ?? {
				sharedWinners: Object.keys(GCheck.players),
			}) as WesternLegendsGameOver;
		}

		return undefined;
	},

	/** Runs after `ctx.gameover` is set; replace `G` with scored state (mutable in this hook). */
	onEnd: ({ G }: WLCtx) => {
		const GScored = JSON.parse(JSON.stringify(G)) as WesternLegendsState;
		performEndGameScoring(GScored);
		return GScored;
	},
};

export const westernLegendsGameDef = defineGame<WesternLegendsState>({
	game: WesternLegendsGame,
	id: 'western-legends',
	displayName: 'Western Legends',
	description: 'Digital helper for Western Legends: map icon spaces and location actions from the rulebook, simplified poker and fights.',
	minPlayers: 2,
	maxPlayers: 6,
	setupOptions: [
		{
			type: 'boolean',
			id: 'shortGame',
			label: 'Short game (15 legend points)',
			description: 'Matches the rulebook short-game LP target in this prototype.',
			default: false,
		},
		{
			type: 'boolean',
			id: 'goalsVariant',
			label: 'Goals variant',
			description: 'At end scoring, add 1 LP per legendary goal token earned (see player legendaryGoalTokens).',
			default: false,
		},
	],
	validateMove({ G, playerID, currentPlayer }, moveName, ...args) {
		if (characterSelectionIncomplete(G)) {
			if (moveName !== 'chooseCharacter') return 'Finish character selection first';
			if (playerID !== currentPlayer) return 'Not your turn';
			const pick = args[0];
			if (pick !== 0 && pick !== 1) return 'Pick card 0 or 1';
			const p = G.players[playerID];
			if (!p?.characterOffers || p.characterId != null) return 'No character offers to choose';
			const offeredId = p.characterOffers[pick];
			const def = STARTER_CHARACTER_BY_ID[offeredId];
			if (!def) return 'Invalid character offer';
			if (characterHasStartSpaceChoices(def)) {
				const sid = args[1];
				if (typeof sid !== 'string' || !def.startSpaceChoices!.includes(sid)) {
					return 'Choose a bandit hideout to start in';
				}
			}
			return true;
		}
		migrateSaloonRoundIfMissing(G);
		migrateSaloonRevealIfMissing(G);
		migrateProspectRevealIfMissing(G);
		migrateFightIfMissing(G);
		migrateBoardNpcsIfMissing(G);
		migrateSheriffEncounterIfMissing(G);
		migrateCattlePilesIfMissing(G);
		migrateFightDeckIfMissing(G);
		if (moveName === 'dismissSaloonReveal') {
			if (G.fight != null) return 'Finish the fight first';
			if (G.sheriffEncounter != null) return 'Resolve sheriff encounter first';
			if (G.saloonReveal == null) return 'No Saloon results to dismiss';
			return true;
		}
		if (moveName === 'dismissProspectReveal') {
			if (G.fight != null) return 'Finish the fight first';
			if (G.sheriffEncounter != null) return 'Resolve sheriff encounter first';
			if (G.prospectReveal == null) return 'No mine results to dismiss';
			if (playerID !== G.prospectReveal.playerId) return 'Only the mining player can close this summary';
			return true;
		}
		if (G.saloonRound != null) {
			const r = G.saloonRound;
			if (r.tieBreakCandidateIds != null) {
				if (playerID !== r.activePlayerId) return 'Waiting for active player to break Saloon tie';
				if (moveName !== 'chooseSaloonWinner') return 'Choose Saloon winner (tie-break) first';
				return true;
			}
			if (r.dealerShowdown != null) {
				if (moveName !== 'submitSaloonHolePick') {
					if (playerID === r.activePlayerId) return 'Choose 2 hole cards for the Saloon (with the flop)';
					return 'Waiting for Saloon showdown';
				}
				if (playerID !== r.activePlayerId) return 'Only the Saloon active player can submit hole cards';
				return true;
			}
			if (playerID != null && r.pendingPlayerIds.includes(playerID)) {
				if (moveName !== 'joinSaloon' && moveName !== 'skipSaloon') return 'Respond to Saloon (join or skip) first';
				return true;
			}
			if (playerID === r.activePlayerId) {
				return 'Waiting for other players to respond to Saloon';
			}
			return 'Waiting for Saloon to resolve';
		}

		if (G.sheriffEncounter != null) {
			const enc = G.sheriffEncounter;
			const m = moveName;
			const pid = playerID;
			if (enc.phase === 'chooseTarget') {
				if (m !== 'chooseSheriffArrestTarget') return 'Choose which wanted player the sheriff arrests first';
				if (pid !== enc.moverId) return 'Only the player who moved the sheriff chooses the arrest target';
				const wid = args[0];
				if (typeof wid !== 'string' || !enc.wantedPlayerIds.includes(wid)) return 'Pick a wanted player on this space';
				return true;
			}
			if (enc.phase === 'discard') {
				if (m !== 'sheriffEncounterDiscard') return 'Discard a visible poker card (sheriff encounter) first';
				if (pid == null || !enc.pendingDiscardPlayerIds.includes(pid)) return 'Not your turn for this sheriff discard';
				if (typeof args[0] !== 'string') return 'Pick a card to discard';
				return true;
			}
			return 'Resolve sheriff encounter first';
		}

		migrateManInBlackIfMissing(G);
		if (G.manInBlackPending != null) {
			const pend = G.manInBlackPending;
			const pid = playerID;
			if (pend.kind === 'interaction') {
				if (moveName !== 'manInBlackInteractionCommit') return 'Play your Man in Black duel/rob card first';
				if (pid !== pend.targetPlayerId) return 'Only the leader resolves the Man in Black interaction';
				if (typeof args[0] !== 'string') return 'Choose a poker card to play';
				return true;
			}
			if (pend.kind === 'discardBoth') {
				if (moveName !== 'manInBlackDiscardCommit') return 'Discard a poker card for the Man in Black first';
				if (pid !== pend.awaitingPlayerId) return 'Not your turn for this Man in Black discard';
				if (typeof args[0] !== 'string') return 'Choose a card to discard';
				return true;
			}
			if (pend.kind === 'cabaretProxyPick') {
				if (moveName !== 'manInBlackCabaretProxyPick') return 'Choose two cards for the MIB cabaret first';
				if (pid !== pend.proxyPlayerId) return 'Only the MIB proxy chooses cabaret cards';
				if (typeof args[0] !== 'string' || typeof args[1] !== 'string') return 'Pick two distinct cards from the MIB pool';
				return true;
			}
		}

		if (G.fight != null) {
			const f = G.fight;
			const m = moveName;
			const pid = playerID;
			if (f.phase === 'outcome') {
				if (m !== 'dismissFightOutcome') return 'Dismiss the fight result first';
				if (f.kind === 'manInBlack') {
					if (pid !== f.challengerId) return 'Not part of this fight';
				} else if (pid !== f.challengerId && pid !== f.defenderId) return 'Not part of this fight';
				return true;
			}
			if (f.phase === 'rewardRob') {
				if (m !== 'resolveFightRobLoot') return 'Choose rob loot (gold or nuggets) first';
				if (pid !== f.challengerId) return 'Only the robber chooses loot';
				return true;
			}
			if (f.phase === 'banditFightCard') {
				const fighter = G.players[f.challengerId];
				migratePlayerItemsIfMissing(fighter!);
				if (fighter?.pendingBanditFightFighterChoice) {
					if (m !== 'resolveBanditFightFighterChoice') return 'Resolve the fight card effect on the fighter first';
					if (pid !== f.challengerId) return 'Only the fighter resolves this choice';
					return true;
				}
				if (m !== 'chooseBanditFightCard') return 'Bandit controller must choose which fight card applies';
				if (pid !== f.defenderId) return 'Only the bandit controller chooses a fight card';
				const idx = args[0];
				if (idx !== 0 && idx !== 1) return 'Pick fight card 0 or 1';
				return true;
			}
			if (f.phase === 'sheriffFightCard') {
				const fighter = G.players[f.challengerId];
				migratePlayerItemsIfMissing(fighter!);
				if (fighter?.pendingBanditFightFighterChoice) {
					if (m !== 'resolveBanditFightFighterChoice') return 'Resolve the fight card effect on the fighter first';
					if (pid !== f.challengerId) return 'Only the fighter resolves this choice';
					return true;
				}
				if (m !== 'chooseSheriffFightCard') return 'Sheriff controller must choose which fight card applies';
				if (pid !== f.defenderId) return 'Only the sheriff controller chooses a fight card';
				const idx = args[0];
				if (idx !== 0 && idx !== 1 && idx !== 2 && idx !== 3) return 'Pick fight card index 0–3';
				return true;
			}
			if (m === 'sheriffArrestDecline') {
				if (f.kind !== 'sheriffArrest' || f.phase !== 'challengerCard') return 'Cannot decline to fight now';
				if (pid !== f.challengerId) return 'Only the wanted player can decline';
				return true;
			}
			const allowed = new Set([
				'resolveFightStartEffect',
				'fightCommitChallengerCard',
				'fightDefenderCommitCard',
				'fightDefenderDecline',
				'fightReactionPass',
				'fightReactionPlay',
			]);
			if (!allowed.has(m)) return 'Finish the player fight first';
			if (m === 'fightDefenderDecline' && f.kind === 'bandit') return 'Cannot decline a bandit fight';
			if (m === 'fightDefenderDecline' && f.kind === 'sheriffArrest') return 'The sheriff cannot decline this fight';

			if (m === 'resolveFightStartEffect') {
				if (f.phase !== 'startEffects') return 'No start-of-fight effect to resolve';
				const step = f.startEffectQueue[f.startEffectQueueIndex];
				if (!step || step.actorId !== pid) return 'Not your turn to resolve this effect';
				return true;
			}
			if (m === 'fightCommitChallengerCard') {
				if (f.phase !== 'challengerCard') return 'Not committing challenger card now';
				if (pid !== f.challengerId) return 'Only the challenger plays a card now';
				return true;
			}
			if (m === 'fightDefenderCommitCard' || m === 'fightDefenderDecline') {
				if (f.phase !== 'defenderChoice') return 'Defender cannot act now';
				if (pid !== f.defenderId) return 'Only the defender responds now';
				return true;
			}
			if (m === 'fightReactionPass' || m === 'fightReactionPlay') {
				if (f.phase !== 'reaction') return 'Not in reaction phase';
				const want = f.reactionTurn === 'challenger' ? f.challengerId : f.defenderId;
				if (pid !== want) return 'Wait for your reaction turn';
				return true;
			}
			return true;
		}

		if (playerID !== currentPlayer) return 'Not your turn';
		if (moveName === 'chooseCharacter') return 'Character already chosen';
		const p = G.players[playerID];
		if (p?.needsStartTurnIncomeChoice) {
			if (moveName !== 'chooseStartTurnIncome') return 'Choose turn income first (+$20, draw 2 cards, or +$10 and 1 card)';
			return true;
		}
		if (moveName === 'chooseStartTurnIncome') return 'Turn income already chosen';
		if (p?.needsTurnWeaponMountChoice) {
			if (moveName !== 'chooseTurnWeaponMount') return 'Choose weapon and mount for this turn first';
			return true;
		}
		if (moveName === 'chooseTurnWeaponMount') return 'Weapon and mount already set for this turn';
		const curPl = G.players[playerID];
		if (curPl) migratePlayerItemsIfMissing(curPl);
		if (moveName === 'chooseCattleTrackReward') {
			if (!curPl?.pendingCattleMarshalOrWanted) return 'No cattle reward to choose';
			return true;
		}
		if (moveName === 'chooseBanditBountyReward') {
			if (!curPl?.pendingBanditBountyChoice) return 'No bandit bounty to choose';
			const pick = args[0];
			if (pick !== 'lp' && pick !== 'marshal') return 'Choose lp or marshal';
			if (pick === 'marshal' && (curPl.wantedPoints ?? 0) >= 1) return 'Wanted players must take Legendary for bandit bounty';
			return true;
		}
		if (curPl?.pendingCattleMarshalOrWanted) {
			return 'Choose cattle reward (+1 Marshal or +1 Wanted) first';
		}
		if (curPl?.pendingBanditBountyChoice) {
			return 'Choose bandit bounty (+1 LP or +1 Marshal) first';
		}
		if (moveName === 'moveToLocation') {
			migrateBoardNpcsIfMissing(G);
			migrateSheriffEncounterIfMissing(G);
			const loc = args[0];
			if (typeof loc !== 'string' || !BOARD_SPACES_BY_ID[loc]) return 'Invalid destination';
			const pl = G.players[playerID];
			if (!pl) return 'Invalid player';
			migratePlayerItemsIfMissing(pl);
			const sheriffNpc = findSheriffNpc(G);
			if (pl.wantedPoints >= 1 && sheriffNpc != null && loc === sheriffNpc.spaceId) {
				return 'Wanted players cannot move onto the sheriff';
			}
			return true;
		}
		if (moveName === 'useCardAction' || moveName === 'manhuntSheriff') {
			const cid = args[0];
			const extra = args[1];
			if (typeof cid !== 'string' || cid.length === 0) return 'Pick a poker card to use';
			const inHand = curPl?.hand.some((c) => !isCardHidden(c) && (c as StandardCard).id === cid);
			if (!inHand) return 'That card is not in your hand (face-up)';
			const bKind = actionBEffectKindForCardId(cid);
			if (bKind == null) return 'That card has no B-slot action';
			if (bKind === 'living_legend') {
				if (curPl?.usedLivingLegendThisTurn === true) return 'Already played Living Legend this turn';
				if (extra !== 'marshal' && extra !== 'wanted') return 'Choose marshal or wanted for Living Legend';
				return true;
			}
			if (bKind === 'saddle_up') {
				if (typeof extra !== 'string' || !BOARD_SPACES_BY_ID[extra] || getBoardSpaceCity(extra) == null) {
					return 'Pick a valid town space for Saddle Up';
				}
				return true;
			}
			if (bKind === 'manhunt') {
				if (!cid.startsWith('4-')) return 'Manhunt requires a 4 card';
				if (typeof extra !== 'string' || !BOARD_SPACES_BY_ID[extra]) return 'Pick sheriff destination';
				return true;
			}
			return true;
		}
		if (moveName === 'playReputationSeven') {
			if (curPl?.pendingReputationSevenReaction !== true) return 'No Reputation (7) reaction available';
			if (curPl?.usedReputationSevenThisTurn === true) return 'Already played Reputation this turn';
			const cid = args[0];
			if (typeof cid !== 'string' || !cid.startsWith('7-')) return 'Play a 7 card';
			const inHand = curPl?.hand.some((c) => !isCardHidden(c) && (c as StandardCard).id === cid);
			if (!inHand) return 'That card is not in your hand';
			return true;
		}
		if (moveName === 'playPokerAfterMove') {
			const cid = args[0];
			if (typeof cid !== 'string') return 'Pick a card';
			const pre = curPl?.hand.find((c) => !isCardHidden(c) && (c as StandardCard).id === cid) as StandardCard | undefined;
			if (!pre) return 'Card not in hand';
			if (pre.rank === '3') {
				if (curPl?.pendingSprintAfterMove !== true) return 'Sprint not available (move first)';
				return true;
			}
			if (pre.rank === '8' && (pre.suit === 'clubs' || pre.suit === 'spades')) {
				if (curPl?.pendingWallopAfterMove !== true) return 'Wallop not available';
				const tid = args[1];
				if (typeof tid !== 'string') return 'Choose another player in your space';
				const t = G.players[tid];
				if (!t || tid === playerID || t.locationId !== curPl?.locationId) return 'Invalid Wallop target';
				return true;
			}
			return 'Cannot play that card now';
		}
		if (moveName === 'startFight') {
			migrateFightIfMissing(G);
			migrateManInBlackIfMissing(G);
			if (G.fight != null) return 'A fight is already in progress';
			migrateSheriffEncounterIfMissing(G);
			if (G.sheriffEncounter != null) return 'Resolve sheriff encounter first';
			migrateSaloonRoundIfMissing(G);
			if (G.saloonRound != null) return 'Finish the Saloon first';
			migrateProspectRevealIfMissing(G);
			if (G.prospectReveal != null) return 'Close the mining results first';
			const kind = args[0];
			const targetId = args[1];
			if (kind !== 'arrest' && kind !== 'duel' && kind !== 'rob') return 'Choose arrest, duel, or rob';
			if (typeof targetId !== 'string' || targetId.length === 0) return 'Pick a target player';
			if (targetId === playerID) return 'Cannot fight yourself';
			if (targetId === MAN_IN_BLACK_FIGHT_DEFENDER_ID) {
				if (!isManInBlackVariant(G) || !G.manInBlack) return 'Man in Black variant not active';
				if (kind === 'arrest') return 'Cannot arrest Man in Black';
				const chMib = G.players[playerID];
				if (!chMib) return 'Invalid players';
				migratePlayerItemsIfMissing(chMib);
				if (chMib.locationId !== G.manInBlack.locationId) return 'Man in Black must be in your space';
				if (chMib.hand.length < 1) return 'You need at least 1 poker card to fight';
				if (chMib.turnActions.includes('fight')) {
					return 'You already used your fight this turn (arrest, duel, or rob)';
				}
				if (chMib.turnActions.length >= maxDiscreteTurnSlots(chMib)) return 'No fight action slot left this turn';
				return true;
			}
			const challenger = G.players[playerID];
			const defender = G.players[targetId];
			if (!challenger || !defender) return 'Invalid players';
			migratePlayerItemsIfMissing(challenger);
			if (challenger.locationId !== defender.locationId) return 'Target must be in your space';
			if (kind === 'arrest') {
				if (challenger.marshalPoints < 1) return 'Arrest requires at least 1 Marshal point';
				if (defender.wantedPoints < 1) return 'Arrest requires the target to have at least 1 Wanted point';
			}
			if (challenger.hand.length < 1) return 'You need at least 1 poker card to fight';
			if (challenger.turnActions.includes('fight')) {
				return 'You already used your fight this turn (arrest, duel, or rob)';
			}
			if (pvpFightTargetsIncludes(challenger.pvpFightTargetsThisTurn, targetId)) {
				return 'You already fought this player this turn (arrest, duel, or rob)';
			}
			if (challenger.turnActions.length >= maxDiscreteTurnSlots(challenger)) return 'No fight action slot left this turn';
			return true;
		}
		if (moveName === 'pass') {
			if (G.fight != null) return 'Finish the fight first';
			if (G.sheriffEncounter != null) return 'Resolve sheriff encounter first';
			migrateManInBlackIfMissing(G);
			if (G.manInBlackPending != null) return 'Resolve the Man in Black card first';
			if (G.players[playerID]?.pendingBanditBountyChoice) return 'Choose your bandit bounty first';
			if (G.prospectReveal != null) return 'Close the mining results summary first';
			if (G.saloonReveal != null) return 'Dismiss the Saloon results first';
			const maxH = maxPokerHandSize(p);
			const over = Math.max(0, p.hand.length - maxH);
			const raw = args[0];
			if (over > 0) {
				if (!Array.isArray(raw) || raw.length !== over) {
					return `Discard exactly ${over} poker card(s) before ending your turn (max hand ${maxH})`;
				}
			} else if (raw != null && Array.isArray(raw) && raw.length > 0) {
				return 'Your hand is within the limit; do not pass discards';
			}
			return true;
		}
		return true;
	},
	stripSecretInfo: (G: WesternLegendsState, playerID: string | null): BaseGameState => {
		const clone = JSON.parse(JSON.stringify(G)) as WesternLegendsState;
		if (playerID === null) {
			for (const pid of Object.keys(clone.players)) {
				clone.players[pid].hand = redactCards(clone.players[pid].hand as VisibleCard[]);
				clone.players[pid].characterOffers = null;
			}
			clone.pokerDeck = [];
			clone.fightDeck = [];
			if (clone.saloonRound?.dealerShowdown) {
				const ds = clone.saloonRound.dealerShowdown;
				ds.dealerHoleCards = redactCards(ds.dealerHoleCards as VisibleCard[]);
				ds.dealerPickCardIds = ['', ''];
			}
			if (clone.fight != null && clone.fight.phase !== 'reaction') {
				clone.fight.challengerCommittedCard = null;
				clone.fight.defenderCommittedCard = null;
			}
			if (clone.fight != null && clone.fight.kind === 'bandit' && clone.fight.phase === 'banditFightCard' && clone.fight.npcFightCardOptions) {
				clone.fight.npcFightCardOptions = undefined;
			}
			if (
				clone.fight != null &&
				clone.fight.kind === 'sheriffArrest' &&
				clone.fight.phase === 'sheriffFightCard' &&
				clone.fight.sheriffFightCardOptions
			) {
				clone.fight.sheriffFightCardOptions = undefined;
			}
			if (clone.fight != null && clone.fight.kind === 'manInBlack' && clone.fight.mibFightCardTriplet) {
				clone.fight.mibFightCardTriplet = undefined;
			}
			if (clone.manInBlackPending != null && clone.manInBlackPending.kind === 'cabaretProxyPick') {
				const c = clone.manInBlackPending;
				c.inRfCardIds = ['', ''] as [string, string];
				c.mibPoolCardIds = ['', '', '', ''] as [string, string, string, string];
			}
			return clone;
		}
		for (const pid of Object.keys(clone.players)) {
			if (pid !== playerID) {
				clone.players[pid].hand = redactCards(clone.players[pid].hand as VisibleCard[]);
				clone.players[pid].characterOffers = null;
			}
		}
		clone.pokerDeck = [];
		clone.fightDeck = [];
		if (clone.saloonRound?.dealerShowdown) {
			const ds = clone.saloonRound.dealerShowdown;
			if (playerID !== ds.dealerId) {
				ds.dealerHoleCards = redactCards(ds.dealerHoleCards as VisibleCard[]);
				ds.dealerPickCardIds = ['', ''];
			}
		}
		if (clone.fight != null && clone.fight.phase !== 'reaction') {
			const ff = clone.fight;
			if (playerID !== ff.challengerId) ff.challengerCommittedCard = null;
			if (playerID !== ff.defenderId) ff.defenderCommittedCard = null;
		}
		if (
			clone.fight != null &&
			clone.fight.kind === 'bandit' &&
			clone.fight.phase === 'banditFightCard' &&
			clone.fight.npcFightCardOptions &&
			playerID !== clone.fight.defenderId
		) {
			clone.fight.npcFightCardOptions = undefined;
		}
		if (
			clone.fight != null &&
			clone.fight.kind === 'sheriffArrest' &&
			clone.fight.phase === 'sheriffFightCard' &&
			clone.fight.sheriffFightCardOptions &&
			playerID !== clone.fight.defenderId
		) {
			clone.fight.sheriffFightCardOptions = undefined;
		}
		if (clone.fight != null && clone.fight.kind === 'manInBlack' && clone.fight.mibFightCardTriplet) {
			if (playerID == null || playerID !== clone.fight.challengerId) {
				clone.fight.mibFightCardTriplet = undefined;
			}
		}
		if (clone.manInBlackPending != null && clone.manInBlackPending.kind === 'cabaretProxyPick') {
			const c = clone.manInBlackPending;
			if (playerID !== c.inRfPlayerId) {
				c.inRfCardIds = ['', ''] as [string, string];
			}
			if (playerID !== c.proxyPlayerId) {
				c.mibPoolCardIds = ['', '', '', ''] as [string, string, string, string];
			}
		}
		return clone;
	},
});
