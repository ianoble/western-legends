import { onUnmounted, watch, type Ref } from 'vue';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { isCardHidden, shuffle, type VisibleCard } from '@engine/client';
import { gameDef } from '../logic';
import { maxPokerHandSize } from '../logic/player-hand';
import { pickBestTwoForFlop } from '../logic/poker';
import type { WesternLegendsState } from '../logic/types';
import { POKER_ANTE_GOLD } from '../logic/types';
import { uiGamePhase } from '../logic/phaseUi';
import { SERVER_URL } from '../config';
import { uniqueMountOptions, uniqueWeaponOptions } from '../logic/equipment';
import { STARTER_CHARACTER_BY_ID, characterHasStartSpaceChoices } from '../logic/starterCharacters';

type SaloonRound = NonNullable<WesternLegendsState['saloonRound']>;

interface BotClient {
	playerID: string;
	client: ReturnType<typeof Client>;
	unsubscribe: () => void;
	watchdogId: ReturnType<typeof setInterval>;
}

function loadBotCredentials(matchID: string): Record<string, string> {
	const key = `bgf:bots:${gameDef.id}:${matchID}`;
	try {
		return JSON.parse(localStorage.getItem(key) || '{}');
	} catch {
		return {};
	}
}

function saloonJoinPhaseKey(sr: SaloonRound): string {
	const flop0 = sr.flop[0]?.id ?? '';
	return `${sr.activePlayerId}|${sr.cityId}|${flop0}`;
}

type SaloonJoinTracker = { roundKey: string; firstActionDone: boolean };

/**
 * Join/skip for Saloon join phase. If the first action leaves us still pending (e.g. join rejected),
 * a second call forces skip once for this round key.
 */
function trySaloonJoinOrSkip(
	client: ReturnType<typeof Client>,
	pid: string,
	p: WesternLegendsState['players'][string],
	sr2: SaloonRound,
	tracker: { value: SaloonJoinTracker | null },
): void {
	if (!sr2.pendingPlayerIds.includes(pid) || sr2.tieBreakCandidateIds != null) {
		tracker.value = null;
		return;
	}
	const roundKey = saloonJoinPhaseKey(sr2);
	if (tracker.value == null || tracker.value.roundKey !== roundKey) {
		tracker.value = { roundKey, firstActionDone: false };
	}
	if (tracker.value.firstActionDone) {
		client.moves.skipSaloon();
		tracker.value = null;
		return;
	}
	tracker.value.firstActionDone = true;
	const canPay = p.gold >= POKER_ANTE_GOLD;
	if (canPay && Math.random() < 0.6) client.moves.joinSaloon();
	else client.moves.skipSaloon();
}

type ClientState = {
	G: WesternLegendsState;
	ctx: {
		currentPlayer: string;
		phase?: string | null;
		gameover?: unknown;
		activePlayers?: Record<string, string> | null;
	};
} | null;

function runBotTick(
	client: ReturnType<typeof Client>,
	pid: string,
	acting: { current: boolean },
	saloonJoinTracker: { value: SaloonJoinTracker | null },
): void {
	if (acting.current) return;
	const fresh = client.getState() as ClientState;
	if (fresh == null || fresh.ctx.gameover != null) return;
	if (!fresh.G?.players?.[pid]) return;

	const srNow = fresh.G.saloonRound ?? null;
	if (srNow == null || !srNow.pendingPlayerIds.includes(pid) || srNow.tieBreakCandidateIds != null) {
		saloonJoinTracker.value = null;
		return;
	}

	acting.current = true;
	try {
		const p = fresh.G.players[pid]!;
		trySaloonJoinOrSkip(client, pid, p, srNow, saloonJoinTracker);
	} finally {
		acting.current = false;
	}
}

/**
 * Headless boardgame.io clients for seats created via “Fill with Bots” in the lobby.
 * Handles character draft and a minimal play phase so matches don’t stall.
 */
export function useBotPlayers(matchID: Ref<string>, humanPlayerID: Ref<string>) {
	const bots: BotClient[] = [];
	let started = false;

	function startBots() {
		if (started) return;
		started = true;

		const creds = loadBotCredentials(matchID.value);
		const botPlayerIDs = Object.keys(creds).filter((id) => id !== humanPlayerID.value);

		for (const pid of botPlayerIDs) {
			const client = Client({
				game: gameDef.game,
				debug: false,
				multiplayer: SocketIO({ server: SERVER_URL }),
				matchID: matchID.value,
				playerID: pid,
				credentials: creds[pid],
			} as Parameters<typeof Client>[0]);

			const acting = { current: false };
			const saloonJoinTracker: { value: SaloonJoinTracker | null } = { value: null };

			const unsubscribe = client.subscribe((state: unknown) => {
				if (state == null || acting.current) return;
				const s = state as {
					G: WesternLegendsState;
					ctx: {
						currentPlayer: string;
						phase?: string | null;
						gameover?: unknown;
						activePlayers?: Record<string, string> | null;
					};
				};
				if (s.ctx.gameover != null) return;
				const sr = s.G?.saloonRound ?? null;
				const saloonNeedsResponse =
					sr != null && Array.isArray(sr.pendingPlayerIds) && sr.pendingPlayerIds.includes(pid);
				const saloonTieBreak = sr != null && sr.tieBreakCandidateIds != null && sr.activePlayerId === pid;
				const saloonHolePick =
					sr != null && sr.dealerShowdown != null && sr.activePlayerId === pid;
				const fightAct =
					(s.G?.fight != null || s.G?.sheriffEncounter != null) && s.ctx.activePlayers?.[pid] === 'fightAct';
				const mibAct = s.G?.manInBlackPending != null && s.ctx.activePlayers?.[pid] === 'mibCardAct';
				if (
					s.ctx.currentPlayer !== pid &&
					!saloonNeedsResponse &&
					!saloonTieBreak &&
					!saloonHolePick &&
					!fightAct &&
					!mibAct
				)
					return;

				if (!s.G?.players?.[pid]) return;

				const isSaloonQuick = saloonNeedsResponse || saloonTieBreak || saloonHolePick || fightAct || mibAct;
				const delayMs = isSaloonQuick ? Math.floor(Math.random() * 120) : 450 + Math.floor(Math.random() * 400);

				acting.current = true;
				window.setTimeout(() => {
					try {
						const fresh = client.getState() as ClientState;
						if (fresh == null || fresh.ctx.gameover != null) return;
						const srNow = fresh.G.saloonRound ?? null;
						const apNow = fresh.ctx.activePlayers;
						const canActOutOfTurn =
							(srNow != null &&
								Array.isArray(srNow.pendingPlayerIds) &&
								srNow.pendingPlayerIds.includes(pid)) ||
							(srNow != null && srNow.tieBreakCandidateIds != null && srNow.activePlayerId === pid) ||
							(srNow != null && srNow.dealerShowdown != null && srNow.activePlayerId === pid) ||
							fresh.G.saloonReveal != null ||
							(fresh.G.fight != null && apNow?.[pid] === 'fightAct') ||
							(fresh.G.sheriffEncounter != null && apNow?.[pid] === 'fightAct') ||
							(fresh.G.manInBlackPending != null && apNow?.[pid] === 'mibCardAct');
						if (fresh.ctx.currentPlayer !== pid && !canActOutOfTurn) return;

						const p = fresh.G?.players?.[pid];
						if (!p) return;

						const phase = uiGamePhase(fresh.G, fresh.ctx.phase);
						const stillNeedsCharacter =
							p.characterId == null && p.characterOffers != null && p.characterOffers.length === 2;

						if (stillNeedsCharacter && phase !== 'play') {
							const pick = Math.random() < 0.5 ? 0 : 1;
							const offeredId = p.characterOffers![pick];
							const def = STARTER_CHARACTER_BY_ID[offeredId];
							if (characterHasStartSpaceChoices(def)) {
								const opts = def.startSpaceChoices!;
								const space = opts[Math.floor(Math.random() * opts.length)]!;
								client.moves.chooseCharacter(pick, space);
							} else {
								client.moves.chooseCharacter(pick);
							}
							return;
						}

						if (phase === 'play' && p.characterId != null) {
							// Do not auto-dismiss Saloon results: only the human closes the overlay (see dismiss button).
							const prDismiss = fresh.G.prospectReveal;
							if (prDismiss != null && prDismiss.playerId === pid) {
								const dice = p.prospectMapRerollDice;
								if (p.ownedMiscItemIds.includes('map') && dice != null && dice.length > 0) {
									const idxs = [...new Set(dice.map((e) => e.slotIndex))];
									const pick = idxs[Math.floor(Math.random() * idxs.length)]!;
									client.moves.minerMapRerollProspect(pick);
									return;
								}
								client.moves.dismissProspectReveal();
								return;
							}
							const sr2 = fresh.G.saloonRound ?? null;
							const needsSaloonResponse =
								sr2 != null &&
								Array.isArray(sr2.pendingPlayerIds) &&
								sr2.pendingPlayerIds.includes(pid) &&
								sr2.tieBreakCandidateIds == null;
							const needsSaloonTieBreak =
								sr2 != null && sr2.tieBreakCandidateIds != null && sr2.activePlayerId === pid;

							if (needsSaloonTieBreak) {
								const opts = sr2!.tieBreakCandidateIds!;
								const pick = opts[Math.floor(Math.random() * opts.length)]!;
								client.moves.chooseSaloonWinner(pick);
								return;
							}
							if (needsSaloonResponse) {
								trySaloonJoinOrSkip(client, pid, p, sr2, saloonJoinTracker);
								return;
							}
							const needsSaloonHolePick =
								sr2 != null &&
								sr2.dealerShowdown != null &&
								sr2.activePlayerId === pid &&
								sr2.tieBreakCandidateIds == null;
							if (needsSaloonHolePick) {
								const flop = sr2.flop;
								const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
								if (visible.length >= 2) {
									const two = pickBestTwoForFlop(visible, flop);
									client.moves.submitSaloonHolePick(two[0]!.id, two[1]!.id);
								}
								return;
							}

							const enc = fresh.G.sheriffEncounter;
							if (enc != null && fresh.ctx.activePlayers?.[pid] === 'fightAct') {
								if (enc.phase === 'chooseTarget' && enc.moverId === pid) {
									const wid = enc.wantedPlayerIds[Math.floor(Math.random() * enc.wantedPlayerIds.length)]!;
									client.moves.chooseSheriffArrestTarget(wid);
									return;
								}
								if (enc.phase === 'discard' && enc.pendingDiscardPlayerIds.includes(pid)) {
									const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
									if (visible[0]) client.moves.sheriffEncounterDiscard(visible[0].id);
									return;
								}
							}

							const mibPend = fresh.G.manInBlackPending;
							if (mibPend != null && fresh.ctx.activePlayers?.[pid] === 'mibCardAct') {
								if (mibPend.kind === 'interaction' && mibPend.targetPlayerId === pid) {
									const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
									if (visible[0]) client.moves.manInBlackInteractionCommit(visible[0].id);
									return;
								}
								if (mibPend.kind === 'discardBoth' && mibPend.awaitingPlayerId === pid) {
									const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
									if (visible[0]) client.moves.manInBlackDiscardCommit(visible[0].id);
									return;
								}
								if (mibPend.kind === 'cabaretProxyPick' && mibPend.proxyPlayerId === pid) {
									const pool = new Set(mibPend.mibPoolCardIds);
									const inPool = p.hand.filter(
										(c) => !isCardHidden(c) && pool.has((c as VisibleCard).id),
									) as VisibleCard[];
									if (inPool.length >= 2) {
										const a = inPool[0]!;
										const b = inPool[1]!;
										if (a.id !== b.id) client.moves.manInBlackCabaretProxyPick(a.id, b.id);
									}
									return;
								}
							}

							const fg = fresh.G.fight;
							if (fg != null && fresh.ctx.activePlayers?.[pid] === 'fightAct') {
								if (fg.phase === 'outcome') {
									// One dismiss clears fight for the whole match; let the human read the result.
									const humanSeat = humanPlayerID.value;
									if (humanSeat === fg.challengerId || humanSeat === fg.defenderId) return;
									client.moves.dismissFightOutcome();
									return;
								}
								if (fg.phase === 'rewardRob' && fg.challengerId === pid) {
									const defP = fresh.G.players[fg.defenderId];
									const steal: 'gold' | 'nuggets' =
										Math.random() < 0.5 ? 'gold' : 'nuggets';
									const takeCattle =
										defP?.carriedCattle != null && Math.random() < 0.45;
									client.moves.resolveFightRobLoot(steal, takeCattle);
									return;
								}
								if (fg.phase === 'startEffects') {
									const step = fg.startEffectQueue[fg.startEffectQueueIndex];
									if (step?.actorId === pid && step.kind === 'annieOakleyOpponent') {
										const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
										if (visible.length > 0 && Math.random() < 0.65) {
											const c = visible[Math.floor(Math.random() * visible.length)]!;
											client.moves.resolveFightStartEffect(c.id);
										} else {
											client.moves.resolveFightStartEffect('__wound__');
										}
									}
									return;
								}
								if (fg.phase === 'challengerCard' && fg.challengerId === pid) {
									if (fg.kind === 'sheriffArrest') {
										const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
										if (Math.random() < 0.12) {
											client.moves.sheriffArrestDecline();
										} else if (visible[0]) {
											client.moves.fightCommitChallengerCard(visible[0].id);
										}
										return;
									}
									const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
									if (visible[0]) client.moves.fightCommitChallengerCard(visible[0].id);
									return;
								}
								if (fg.phase === 'defenderChoice' && fg.defenderId === pid) {
									const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
									if (fg.kind === 'bandit' || fg.kind === 'sheriffArrest') {
										if (visible[0]) client.moves.fightDefenderCommitCard(visible[0].id);
										return;
									}
									if (Math.random() < 0.2) {
										client.moves.fightDefenderDecline();
									} else if (visible[0]) {
										client.moves.fightDefenderCommitCard(visible[0].id);
									} else {
										client.moves.fightDefenderDecline();
									}
									return;
								}
								if (fg.phase === 'reaction') {
									const myTurn =
										(fg.reactionTurn === 'challenger' && fg.challengerId === pid) ||
										(fg.reactionTurn === 'defender' && fg.defenderId === pid);
									if (myTurn) {
										if (Math.random() < 0.72) {
											client.moves.fightReactionPass();
										} else {
											const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
											if (visible[0]) client.moves.fightReactionPlay(visible[0].id);
											else client.moves.fightReactionPass();
										}
									}
									return;
								}
								if (fg.phase === 'banditFightCard' && fg.kind === 'bandit') {
									const pending = fresh.G.players[fg.challengerId]?.pendingBanditFightFighterChoice;
									if (pending && fg.challengerId === pid) {
										if (pending === 'fc-A') {
											const r = Math.random();
											if (r < 0.34) client.moves.resolveBanditFightFighterChoice('lp');
											else if (r < 0.67) client.moves.resolveBanditFightFighterChoice('marshal');
											else client.moves.resolveBanditFightFighterChoice('wanted');
										} else if (pending === 'fc-9') {
											const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
											if (p.gold >= 10 && Math.random() < 0.45) {
												client.moves.resolveBanditFightFighterChoice('__gold10__');
											} else if (visible[0]) {
												client.moves.resolveBanditFightFighterChoice(visible[0].id);
											} else {
												client.moves.resolveBanditFightFighterChoice('__gold10__');
											}
										} else if (pending === 'fc-7') {
											const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
											if (visible.length > 0 && Math.random() < 0.55) {
												const c = visible[Math.floor(Math.random() * visible.length)]!;
												client.moves.resolveBanditFightFighterChoice(c.id);
											} else {
												client.moves.resolveBanditFightFighterChoice('__wound__');
											}
										}
										return;
									}
									if (fg.defenderId === pid) {
										const chPending = fresh.G.players[fg.challengerId]?.pendingBanditFightFighterChoice;
										if (!chPending) {
											client.moves.chooseBanditFightCard(Math.random() < 0.5 ? 0 : 1);
										}
									}
									return;
								}
								if (fg.phase === 'sheriffFightCard' && fg.kind === 'sheriffArrest') {
									const pending = fresh.G.players[fg.challengerId]?.pendingBanditFightFighterChoice;
									if (pending && fg.challengerId === pid) {
										if (pending === 'fc-A') {
											const r = Math.random();
											if (r < 0.34) client.moves.resolveBanditFightFighterChoice('lp');
											else if (r < 0.67) client.moves.resolveBanditFightFighterChoice('marshal');
											else client.moves.resolveBanditFightFighterChoice('wanted');
										} else if (pending === 'fc-9') {
											const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
											if (p.gold >= 10 && Math.random() < 0.45) {
												client.moves.resolveBanditFightFighterChoice('__gold10__');
											} else if (visible[0]) {
												client.moves.resolveBanditFightFighterChoice(visible[0].id);
											} else {
												client.moves.resolveBanditFightFighterChoice('__gold10__');
											}
										} else if (pending === 'fc-7') {
											const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
											if (visible.length > 0 && Math.random() < 0.55) {
												const c = visible[Math.floor(Math.random() * visible.length)]!;
												client.moves.resolveBanditFightFighterChoice(c.id);
											} else {
												client.moves.resolveBanditFightFighterChoice('__wound__');
											}
										}
										return;
									}
									if (fg.defenderId === pid) {
										const chPending = fresh.G.players[fg.challengerId]?.pendingBanditFightFighterChoice;
										if (!chPending) {
											client.moves.chooseSheriffFightCard(Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3);
										}
									}
									return;
								}
								return;
							}

							if (p.pendingBanditBountyChoice) {
								client.moves.chooseBanditBountyReward(p.marshalPoints <= p.legendaryPoints ? 'marshal' : 'lp');
								return;
							}

							if (p.pendingCattleMarshalOrWanted) {
								client.moves.chooseCattleTrackReward(Math.random() < 0.5 ? 'marshal' : 'wanted');
							} else if (p.needsStartTurnIncomeChoice) {
								const opts = ['gold20', 'draw2', 'gold10draw1'] as const;
								client.moves.chooseStartTurnIncome(opts[Math.floor(Math.random() * 3)]!);
							} else if (p.needsTurnWeaponMountChoice) {
								const wo = uniqueWeaponOptions(p.ownedWeaponItemIds);
								const mo = uniqueMountOptions(p.ownedMountItemIds);
								const w =
									wo.length <= 1 ? wo[0] ?? null : wo[Math.floor(Math.random() * wo.length)]!;
								const m =
									mo.length <= 1 ? mo[0] ?? null : mo[Math.floor(Math.random() * mo.length)]!;
								client.moves.chooseTurnWeaponMount(w, m);
							} else {
								const here = p.locationId;
								const city =
									here.startsWith('dk-') ? 'darkrock' : here.startsWith('rf-') ? 'redFalls' : null;
								const canSaloon =
									city != null && p.gold >= POKER_ANTE_GOLD && fresh.G.saloonRound == null;
								if (canSaloon && Math.random() < 0.12) {
									client.moves.startSaloon();
									return;
								}

								const maxH = maxPokerHandSize(p);
								const over = Math.max(0, p.hand.length - maxH);
								if (over > 0) {
									const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
									const pick = shuffle([...visible]).slice(0, over).map((c) => c.id);
									client.moves.pass(pick);
								} else {
									client.moves.pass();
								}
							}
						}
					} finally {
						acting.current = false;
					}
				}, delayMs);
			});

			const watchdogId = window.setInterval(() => {
				runBotTick(client, pid, acting, saloonJoinTracker);
			}, 350);

			client.start();
			bots.push({ playerID: pid, client, unsubscribe, watchdogId });
		}
	}

	watch(
		matchID,
		() => {
			if (matchID.value) startBots();
		},
		{ immediate: true },
	);

	onUnmounted(() => {
		for (const bot of bots) {
			window.clearInterval(bot.watchdogId);
			bot.unsubscribe();
			bot.client.stop();
		}
		bots.length = 0;
		started = false;
	});
}
