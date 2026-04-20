<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useGame, isCardHidden, type Card, type StandardCard, type VisibleCard } from '@engine/client';
import { FIGHT_CARD_FACE_LABELS, FIGHT_CARD_IMAGE_PATHS, type FightCardFaceId } from '../logic/fightCards';
import { compareFightPlayedCards } from '../logic/poker';
import { fightReactionPlayKind } from '../logic/pokerCardEffects';
import { uiGamePhase } from '../logic/phaseUi';
import { gameDef } from '../logic/index';
import { SERVER_URL } from '../config';
import PokerCard from './PokerCard.vue';
import type { FightState, WesternLegendsPlayer, WesternLegendsState } from '../logic/types';
import { MAN_IN_BLACK_FIGHT_DEFENDER_ID } from '../logic/types';

/**
 * When `ctx.activePlayers` is missing, empty, or omits this seat (BGIO client sync quirk),
 * derive the same fightAct / fightWait split as {@link fightApplyActivePlayers} in game.ts.
 */
function inferFightStageFromState(
	f: FightState,
	pid: string,
	players: Record<string, WesternLegendsPlayer> | null | undefined,
): 'fightAct' | 'fightWait' | undefined {
	const c = f.challengerId;
	const d = f.defenderId;
	if (f.kind === 'manInBlack') {
		if (f.phase === 'startEffects') {
			const step = f.startEffectQueue[f.startEffectQueueIndex];
			if (!step) return pid === c ? 'fightAct' : 'fightWait';
			return step.actorId === pid ? 'fightAct' : 'fightWait';
		}
		if (f.phase === 'challengerCard') return pid === c ? 'fightAct' : 'fightWait';
		if (f.phase === 'outcome' || f.phase === 'rewardRob') return pid === c ? 'fightAct' : 'fightWait';
		return 'fightWait';
	}
	if (f.phase === 'banditFightCard' || f.phase === 'sheriffFightCard') {
		const fighter = players?.[c];
		if (fighter?.pendingBanditFightFighterChoice) {
			return pid === c ? 'fightAct' : 'fightWait';
		}
		return pid === d ? 'fightAct' : 'fightWait';
	}
	if (f.phase === 'startEffects') {
		const step = f.startEffectQueue[f.startEffectQueueIndex];
		if (!step) {
			return pid === c ? 'fightAct' : 'fightWait';
		}
		return step.actorId === pid ? 'fightAct' : 'fightWait';
	}
	if (f.phase === 'challengerCard') {
		return pid === c ? 'fightAct' : 'fightWait';
	}
	if (f.phase === 'defenderChoice') {
		return pid === d ? 'fightAct' : 'fightWait';
	}
	if (f.phase === 'reaction') {
		const turn = f.reactionTurn === 'challenger' ? c : d;
		return pid === turn ? 'fightAct' : 'fightWait';
	}
	if (f.phase === 'rewardRob') {
		return pid === c ? 'fightAct' : 'fightWait';
	}
	if (f.phase === 'outcome') {
		if (f.kind === 'manInBlack' || d === MAN_IN_BLACK_FIGHT_DEFENDER_ID) return pid === c ? 'fightAct' : undefined;
		return pid === c || pid === d ? 'fightAct' : undefined;
	}
	return undefined;
}

const { state, playerID, move, ctx, matchID } = useGame<WesternLegendsState>();

const G = computed(() => state.value);
const gamePhase = computed(() => uiGamePhase(G.value as WesternLegendsState, ctx.value?.phase));
const fight = computed(() => (G.value as WesternLegendsState | undefined)?.fight ?? null);

const me = computed(() => {
	const pid = playerID.value;
	if (!pid) return undefined;
	return G.value?.players?.[pid];
});

const showFight = computed(
	() => fight.value != null && gamePhase.value === 'play' && playerID.value != null && me.value != null,
);

/** Seat id → lobby join name (`playerName`), same as {@link SaloonOverlay} `seatUserNames`. */
const seatUserNames = ref<Record<string, string>>({});

watch(
	() => [showFight.value, matchID.value] as const,
	async ([show, mid]) => {
		if (!show || mid == null || mid.length === 0) {
			seatUserNames.value = {};
			return;
		}
		try {
			const res = await fetch(`${SERVER_URL}/games/${gameDef.id}/${encodeURIComponent(mid)}`);
			if (!res.ok) return;
			const data = (await res.json()) as { players?: { id: number | string; name?: string }[] };
			const map: Record<string, string> = {};
			for (const p of data.players ?? []) {
				const id = String(p.id);
				const n = typeof p.name === 'string' ? p.name.trim() : '';
				map[id] = n.length > 0 ? n : `Seat ${id}`;
			}
			seatUserNames.value = map;
		} catch {
			seatUserNames.value = {};
		}
	},
	{ immediate: true },
);

function seatDisplayName(playerId: string): string {
	return seatUserNames.value[playerId] ?? `Seat ${playerId}`;
}

const activePlayers = computed(() => ctx.value?.activePlayers);

const myHand = computed(() => me.value?.hand ?? []);

function isStdPokerCard(c: Card): c is StandardCard {
	return (
		!isCardHidden(c) &&
		typeof (c as VisibleCard).rank === 'string' &&
		typeof (c as VisibleCard).suit === 'string'
	);
}

/** Same cards as {@link myHand}, ordered high rank → low (A high); hidden / non-poker cards last, stable within each group. */
const fightHandByValue = computed(() => {
	const hand = myHand.value;
	const tagged = hand.map((c, origIdx) => ({ c, origIdx }));
	tagged.sort((a, b) => {
		const ha = isCardHidden(a.c);
		const hb = isCardHidden(b.c);
		if (ha && hb) return a.origIdx - b.origIdx;
		if (ha) return 1;
		if (hb) return -1;
		const sa = isStdPokerCard(a.c);
		const sb = isStdPokerCard(b.c);
		if (!sa && !sb) return a.origIdx - b.origIdx;
		if (!sa) return 1;
		if (!sb) return -1;
		return compareFightPlayedCards(b.c, a.c);
	});
	return tagged.map((t) => t.c);
});

const players = computed(() => G.value?.players ?? null);

function runMove(name: string, ...args: unknown[]): void {
	move(name as Parameters<typeof move>[0], ...(args as never[]));
}

const robStealGold = ref(true);
const robTakeCattle = ref(false);

const robDefender = computed(() => {
	const f = fight.value;
	const pl = players.value;
	if (!f || !pl) return null;
	return pl[f.defenderId] ?? null;
});

const outcomeReveal = computed(() => fight.value?.outcomeReveal ?? null);

function handCardKey(c: Card, i: number): string {
	return isCardHidden(c) ? `h-${i}` : (c as VisibleCard).id;
}

const myStage = computed((): 'fightAct' | 'fightWait' | undefined => {
	const pid = playerID.value;
	const f = fight.value;
	if (!pid || !f) return undefined;
	const ap = activePlayers.value;
	if (ap != null && pid in ap) {
		const s = ap[pid];
		if (s === 'fightAct' || s === 'fightWait') return s;
	}
	return inferFightStageFromState(f, pid, players.value);
});

const canAct = computed(() => myStage.value === 'fightAct');

/** True only if fight phase doesn't let us infer act vs wait (should be rare). */
const fightActSyncPending = computed(() => myStage.value === undefined);

function duelistBlockedMessage(): string {
	if (fightActSyncPending.value) return 'Receiving who may act from the server…';
	if (myStage.value === 'fightWait') return 'Waiting for the other duelist.';
	return "Can't act yet — if this doesn't clear, refresh the page.";
}

const imChallenger = computed(() => {
	const f = fight.value;
	const pid = playerID.value;
	if (!f || pid == null) return false;
	return pid === f.challengerId;
});

const imDefender = computed(() => {
	const f = fight.value;
	const pid = playerID.value;
	if (!f || pid == null) return false;
	if (f.defenderId === MAN_IN_BLACK_FIGHT_DEFENDER_ID) return false;
	return pid === f.defenderId;
});

const startStep = computed(() => {
	const f = fight.value;
	if (!f || f.phase !== 'startEffects') return null;
	return f.startEffectQueue[f.startEffectQueueIndex] ?? null;
});

const myReactionTurn = computed(() => {
	const f = fight.value;
	if (!f || f.phase !== 'reaction') return false;
	return f.reactionTurn === 'challenger' ? imChallenger.value : imDefender.value;
});

const isBanditFight = computed(() => fight.value?.kind === 'bandit');
const isSheriffArrest = computed(() => fight.value?.kind === 'sheriffArrest');
const isManInBlackFight = computed(() => fight.value?.kind === 'manInBlack');

const fighterProfile = computed(() => {
	const pl = players.value;
	const id = fight.value?.challengerId;
	if (!pl || id == null) return null;
	return pl[id] ?? null;
});

const banditFightCardOptions = computed((): readonly FightCardFaceId[] | null => {
	const o = fight.value?.npcFightCardOptions;
	return o && o.length === 2 ? o : null;
});

const sheriffFightCardOptions = computed((): readonly FightCardFaceId[] | null => {
	const o = fight.value?.sheriffFightCardOptions;
	return o && o.length === 4 ? o : null;
});

const fighterPendingFightCard = computed(() => fighterProfile.value?.pendingBanditFightFighterChoice ?? null);

const imBanditController = computed(() => isBanditFight.value && imDefender.value);
const imSheriffController = computed(() => isSheriffArrest.value && imDefender.value);

function fightCardImg(face: FightCardFaceId): string {
	return FIGHT_CARD_IMAGE_PATHS[face];
}

function canPlayFightReactionCard(c: Card): boolean {
	if (isCardHidden(c)) return false;
	return fightReactionPlayKind((c as VisibleCard).id) != null;
}

function fightHandCardLabel(c: Card, verb: 'discard' | 'play' | 'fight' | 'react'): string {
	if (isCardHidden(c)) return `${verb} hidden card`;
	const id = (c as VisibleCard).id;
	switch (verb) {
		case 'discard':
			return `Discard ${id}`;
		case 'play':
			return `Play ${id}`;
		case 'fight':
			return `Fight with ${id}`;
		case 'react':
			return `React with ${id}`;
		default:
			return id;
	}
}
</script>

<template>
	<Teleport to="body">
		<div
			v-if="showFight && fight"
			class="fixed inset-0 z-[198] flex items-center justify-center overflow-y-auto bg-slate-950/85 p-3 backdrop-blur-sm sm:p-6"
			role="dialog"
			aria-modal="true"
			aria-labelledby="fight-overlay-title"
		>
			<div
				class="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-rose-900/50 bg-rose-950/40 p-4 text-sm text-rose-100 shadow-xl ring-1 ring-rose-950/35 sm:max-w-2xl sm:p-5"
			>
				<h3 id="fight-overlay-title" class="mb-2 font-medium text-rose-200">
					{{
						isBanditFight
							? 'Bandit fight'
							: isSheriffArrest
								? 'Sheriff arrest'
								: isManInBlackFight
									? `vs Man in Black (${fight.manInBlackFightKind ?? 'duel'})`
									: `Fight (${fight.kind})`
					}}
				</h3>
				<p class="mb-2 text-xs text-rose-200/80">
					<template v-if="isBanditFight">
						Fighter: {{ seatDisplayName(fight.challengerId) }} · Bandit controller:
						{{ seatDisplayName(fight.defenderId) }}
					</template>
					<template v-else-if="isSheriffArrest">
						Wanted: {{ seatDisplayName(fight.challengerId) }} · Sheriff (your right-hand neighbor):
						{{ seatDisplayName(fight.defenderId) }}
					</template>
					<template v-else-if="isManInBlackFight">
						Challenger: {{ seatDisplayName(fight.challengerId) }} · Defender: Man in Black (MIB card −1 to your play; MIB wins ties)
					</template>
					<template v-else>
						Challenger: {{ seatDisplayName(fight.challengerId) }} · Defender:
						{{ seatDisplayName(fight.defenderId) }}
					</template>
				</p>

				<template v-if="fight.phase === 'startEffects' && startStep">
					<p v-if="startStep.kind === 'annieOakleyOpponent'" class="mb-2 text-xs">
						Start of fight: discard 1 poker card or take 1 wound (Annie Oakley).
					</p>
					<template v-if="canAct && playerID != null && startStep.actorId === playerID">
						<div class="mb-2 flex flex-wrap gap-3">
							<button
								v-for="(c, i) in fightHandByValue"
								:key="handCardKey(c, i)"
								type="button"
								class="rounded-lg border border-rose-800/60 bg-rose-950/20 p-1.5 transition hover:ring-2 hover:ring-rose-400/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:ring-0"
								:disabled="isCardHidden(c)"
								@click="runMove('resolveFightStartEffect', (c as VisibleCard).id)"
							>
								<span class="sr-only">{{ fightHandCardLabel(c, 'discard') }}</span>
								<PokerCard :card="c" hand-tray />
							</button>
						</div>
						<button
							type="button"
							class="rounded border border-amber-800/60 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-100"
							@click="runMove('resolveFightStartEffect', '__wound__')"
						>
							Take 1 wound instead
						</button>
					</template>
					<p v-else class="text-xs text-rose-200/70">Waiting for start-of-fight effect…</p>
				</template>

				<template v-else-if="fight.phase === 'challengerCard'">
					<p class="mb-2 text-xs">
						{{
							isSheriffArrest
								? 'Wanted: play 1 poker card, or decline (you are arrested without a fight).'
								: isManInBlackFight
									? 'Play your poker card. Next, the top 3 fight cards are revealed — highest is MIB’s card (−1 rank to yours; MIB wins ties).'
									: 'Challenger: play 1 poker card facedown.'
						}}
					</p>
					<div v-if="imChallenger && canAct" class="flex flex-wrap items-end gap-3">
						<button
							v-if="isSheriffArrest"
							type="button"
							class="mb-0.5 mr-1 rounded border border-amber-800/60 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-100 self-center"
							@click="runMove('sheriffArrestDecline')"
						>
							Decline — arrested
						</button>
						<button
							v-for="(c, i) in fightHandByValue"
							:key="handCardKey(c, i)"
							type="button"
							class="rounded-lg border border-rose-800/60 bg-rose-950/20 p-1.5 transition hover:ring-2 hover:ring-rose-400/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:ring-0"
							:disabled="isCardHidden(c)"
							@click="runMove('fightCommitChallengerCard', (c as VisibleCard).id)"
						>
							<span class="sr-only">{{ fightHandCardLabel(c, 'play') }}</span>
							<PokerCard :card="c" hand-tray />
						</button>
					</div>
					<p v-else-if="imChallenger" class="text-xs text-rose-200/70">{{ duelistBlockedMessage() }}</p>
					<p v-else class="text-xs text-rose-200/70">Waiting for challenger's card…</p>
				</template>

				<template v-else-if="fight.phase === 'defenderChoice'">
					<p class="mb-2 text-xs">
						{{
							isBanditFight
								? 'Bandit controller: play a poker card for the bandit.'
								: isSheriffArrest
									? 'Sheriff controller: play a poker card for the sheriff.'
									: 'Defender: fight with a card or decline.'
						}}
					</p>
					<template v-if="imDefender && canAct">
						<button
							v-if="!isBanditFight && !isSheriffArrest"
							type="button"
							class="mb-2 mr-2 rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
							@click="runMove('fightDefenderDecline')"
						>
							Decline (challenger wins)
						</button>
						<div class="flex flex-wrap gap-3">
							<button
								v-for="(c, i) in fightHandByValue"
								:key="handCardKey(c, i)"
								type="button"
								class="rounded-lg border border-rose-800/60 bg-rose-950/20 p-1.5 transition hover:ring-2 hover:ring-rose-400/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:ring-0"
								:disabled="isCardHidden(c)"
								@click="runMove('fightDefenderCommitCard', (c as VisibleCard).id)"
							>
								<span class="sr-only">{{ fightHandCardLabel(c, 'fight') }}</span>
								<PokerCard :card="c" hand-tray />
							</button>
						</div>
					</template>
					<p v-else-if="imDefender" class="text-xs text-rose-200/70">{{ duelistBlockedMessage() }}</p>
					<p v-else class="text-xs text-rose-200/70">Waiting for defender…</p>
				</template>

				<template v-else-if="fight.phase === 'reaction'">
					<p class="mb-2 text-xs text-rose-200/90">{{ fight.revealCompareSummary }}</p>
					<p class="mb-2 text-xs">
						Reactions —
						{{
							fight.reactionTurn === 'challenger'
								? seatDisplayName(fight.challengerId)
								: seatDisplayName(fight.defenderId)
						}}'s
						turn.
					</p>
					<template v-if="canAct && myReactionTurn">
						<button
							type="button"
							class="mb-2 mr-2 rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
							@click="runMove('fightReactionPass')"
						>
							Pass (no reaction)
						</button>
						<p class="mb-1.5 text-[11px] text-violet-200/70">
							Only Stick Em Up (6) or Shootout (8♥/8♦) can be played as reactions; Bulletproof (J) and Quickdraw (Q) apply
							when played as your fight card. Other cards are disabled.
						</p>
						<div class="flex flex-wrap gap-3">
							<button
								v-for="(c, i) in fightHandByValue"
								:key="'r-' + handCardKey(c, i)"
								type="button"
								class="rounded-lg border border-violet-800/60 bg-violet-950/20 p-1.5 transition hover:ring-2 hover:ring-violet-400/50 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:ring-0"
								:disabled="!canPlayFightReactionCard(c)"
								:title="
									canPlayFightReactionCard(c)
										? 'Play this reaction'
										: isCardHidden(c)
											? 'Hidden card'
											: 'Not a legal fight reaction card'
								"
								@click="runMove('fightReactionPlay', (c as VisibleCard).id)"
							>
								<span class="sr-only">{{ fightHandCardLabel(c, 'react') }}</span>
								<PokerCard :card="c" hand-tray />
							</button>
						</div>
					</template>
					<p v-else class="text-xs text-rose-200/70">Waiting for reaction…</p>
				</template>

				<template v-else-if="fight.phase === 'banditFightCard'">
					<p class="mb-2 text-xs text-rose-200/90">Fight card — controller picks which card applies, then poker decides the winner.</p>
					<template v-if="fighterPendingFightCard === 'fc-7' && imChallenger && canAct">
						<p class="mb-2 text-xs">Take 1 wound or discard 1 poker card.</p>
						<button
							type="button"
							class="mb-2 mr-2 rounded border border-amber-800/60 bg-amber-950/40 px-3 py-1.5 text-xs"
							@click="runMove('resolveBanditFightFighterChoice', '__wound__')"
						>
							Take 1 wound
						</button>
						<div class="flex flex-wrap gap-3">
							<button
								v-for="(c, i) in fightHandByValue"
								:key="'bf7-' + handCardKey(c, i)"
								type="button"
								class="rounded-lg border border-rose-800/60 bg-rose-950/20 p-1.5 transition hover:ring-2 hover:ring-rose-400/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:ring-0"
								:disabled="isCardHidden(c)"
								@click="runMove('resolveBanditFightFighterChoice', (c as VisibleCard).id)"
							>
								<span class="sr-only">{{ fightHandCardLabel(c, 'discard') }}</span>
								<PokerCard :card="c" hand-tray />
							</button>
						</div>
					</template>
					<template v-else-if="fighterPendingFightCard === 'fc-9' && imChallenger && canAct">
						<p class="mb-2 text-xs">Discard 1 poker card or pay $10.</p>
						<button
							type="button"
							class="mb-2 mr-2 rounded border border-amber-800/60 bg-amber-950/40 px-3 py-1.5 text-xs"
							@click="runMove('resolveBanditFightFighterChoice', '__gold10__')"
						>
							Pay $10
						</button>
						<div class="flex flex-wrap gap-3">
							<button
								v-for="(c, i) in fightHandByValue"
								:key="'bf9-' + handCardKey(c, i)"
								type="button"
								class="rounded-lg border border-rose-800/60 bg-rose-950/20 p-1.5 transition hover:ring-2 hover:ring-rose-400/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:ring-0"
								:disabled="isCardHidden(c)"
								@click="runMove('resolveBanditFightFighterChoice', (c as VisibleCard).id)"
							>
								<span class="sr-only">{{ fightHandCardLabel(c, 'discard') }}</span>
								<PokerCard :card="c" hand-tray />
							</button>
						</div>
					</template>
					<template v-else-if="fighterPendingFightCard === 'fc-A' && imChallenger && canAct">
						<p class="mb-2 text-xs">Choose +1 LP, +1 Marshal, or +1 Wanted.</p>
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								class="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
								@click="runMove('resolveBanditFightFighterChoice', 'lp')"
							>
								+1 Legend
							</button>
							<button
								type="button"
								class="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
								@click="runMove('resolveBanditFightFighterChoice', 'marshal')"
							>
								+1 Marshal
							</button>
							<button
								type="button"
								class="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
								@click="runMove('resolveBanditFightFighterChoice', 'wanted')"
							>
								+1 Wanted
							</button>
						</div>
					</template>
					<template v-else-if="banditFightCardOptions && imBanditController && canAct && !fighterPendingFightCard">
						<p class="mb-3 text-xs">Choose one fight card to apply to the fighter.</p>
						<div class="flex flex-wrap gap-4">
							<button
								v-for="(face, idx) in banditFightCardOptions"
								:key="face + '-' + idx"
								type="button"
								class="max-w-[140px] rounded border border-rose-800/60 bg-rose-950/30 p-2 text-left text-xs hover:bg-rose-900/40"
								@click="runMove('chooseBanditFightCard', idx)"
							>
								<img :src="fightCardImg(face)" :alt="face" class="mb-1 w-full rounded border border-black/20" />
								<span class="text-[10px] text-rose-200/90">{{ FIGHT_CARD_FACE_LABELS[face] }}</span>
							</button>
						</div>
					</template>
					<p v-else class="text-xs text-rose-200/70">Waiting for bandit fight card resolution…</p>
				</template>

				<template v-else-if="fight.phase === 'sheriffFightCard'">
					<p class="mb-2 text-xs text-rose-200/90">
						Fight card — sheriff controller picks which of four cards applies, then poker decides (ties go to the sheriff).
					</p>
					<template v-if="fighterPendingFightCard === 'fc-7' && imChallenger && canAct">
						<p class="mb-2 text-xs">Take 1 wound or discard 1 poker card.</p>
						<button
							type="button"
							class="mb-2 mr-2 rounded border border-amber-800/60 bg-amber-950/40 px-3 py-1.5 text-xs"
							@click="runMove('resolveBanditFightFighterChoice', '__wound__')"
						>
							Take 1 wound
						</button>
						<div class="flex flex-wrap gap-3">
							<button
								v-for="(c, i) in fightHandByValue"
								:key="'sf7-' + handCardKey(c, i)"
								type="button"
								class="rounded-lg border border-rose-800/60 bg-rose-950/20 p-1.5 transition hover:ring-2 hover:ring-rose-400/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:ring-0"
								:disabled="isCardHidden(c)"
								@click="runMove('resolveBanditFightFighterChoice', (c as VisibleCard).id)"
							>
								<span class="sr-only">{{ fightHandCardLabel(c, 'discard') }}</span>
								<PokerCard :card="c" hand-tray />
							</button>
						</div>
					</template>
					<template v-else-if="fighterPendingFightCard === 'fc-9' && imChallenger && canAct">
						<p class="mb-2 text-xs">Discard 1 poker card or pay $10.</p>
						<button
							type="button"
							class="mb-2 mr-2 rounded border border-amber-800/60 bg-amber-950/40 px-3 py-1.5 text-xs"
							@click="runMove('resolveBanditFightFighterChoice', '__gold10__')"
						>
							Pay $10
						</button>
						<div class="flex flex-wrap gap-3">
							<button
								v-for="(c, i) in fightHandByValue"
								:key="'sf9-' + handCardKey(c, i)"
								type="button"
								class="rounded-lg border border-rose-800/60 bg-rose-950/20 p-1.5 transition hover:ring-2 hover:ring-rose-400/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:ring-0"
								:disabled="isCardHidden(c)"
								@click="runMove('resolveBanditFightFighterChoice', (c as VisibleCard).id)"
							>
								<span class="sr-only">{{ fightHandCardLabel(c, 'discard') }}</span>
								<PokerCard :card="c" hand-tray />
							</button>
						</div>
					</template>
					<template v-else-if="fighterPendingFightCard === 'fc-A' && imChallenger && canAct">
						<p class="mb-2 text-xs">Choose +1 LP, +1 Marshal, or +1 Wanted.</p>
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								class="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
								@click="runMove('resolveBanditFightFighterChoice', 'lp')"
							>
								+1 Legend
							</button>
							<button
								type="button"
								class="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
								@click="runMove('resolveBanditFightFighterChoice', 'marshal')"
							>
								+1 Marshal
							</button>
							<button
								type="button"
								class="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
								@click="runMove('resolveBanditFightFighterChoice', 'wanted')"
							>
								+1 Wanted
							</button>
						</div>
					</template>
					<template v-else-if="sheriffFightCardOptions && imSheriffController && canAct && !fighterPendingFightCard">
						<p class="mb-3 text-xs">Choose one fight card to apply to the wanted player.</p>
						<div class="flex flex-wrap gap-4">
							<button
								v-for="(face, idx) in sheriffFightCardOptions"
								:key="'sf-' + face + '-' + idx"
								type="button"
								class="max-w-[140px] rounded border border-rose-800/60 bg-rose-950/30 p-2 text-left text-xs hover:bg-rose-900/40"
								@click="runMove('chooseSheriffFightCard', idx)"
							>
								<img :src="fightCardImg(face)" :alt="face" class="mb-1 w-full rounded border border-black/20" />
								<span class="text-[10px] text-rose-200/90">{{ FIGHT_CARD_FACE_LABELS[face] }}</span>
							</button>
						</div>
					</template>
					<p v-else class="text-xs text-rose-200/70">Waiting for sheriff fight card resolution…</p>
				</template>

				<template v-else-if="fight.phase === 'rewardRob'">
					<template v-if="fight.kind === 'manInBlack'">
						<p class="mb-2 text-xs text-amber-200/90">Rob vs Man in Black — take $60 or 2 gold nuggets from the supply.</p>
						<template v-if="imChallenger && canAct">
							<div class="mb-2 flex flex-wrap gap-2">
								<label class="flex cursor-pointer items-center gap-2 text-xs">
									<input v-model="robStealGold" type="radio" :value="true" class="rounded border-slate-600" />
									$60 from supply
								</label>
								<label class="flex cursor-pointer items-center gap-2 text-xs">
									<input v-model="robStealGold" type="radio" :value="false" class="rounded border-slate-600" />
									2 gold nuggets
								</label>
							</div>
							<button
								type="button"
								class="rounded border border-amber-700/60 bg-amber-950/50 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-900/40"
								@click="runMove('resolveFightRobLoot', robStealGold ? 'gold' : 'nuggets', false)"
							>
								Confirm
							</button>
						</template>
						<p v-else class="text-xs text-rose-200/70">Waiting…</p>
					</template>
					<template v-else>
					<p class="mb-2 text-xs text-amber-200/90">Rob succeeded — choose what to steal (half, rounded up).</p>
					<template v-if="imChallenger && canAct && robDefender">
						<p class="mb-2 text-xs text-slate-400">
							Target: {{ Math.ceil(robDefender.gold / 2) }}g or {{ Math.ceil(robDefender.nuggets / 2) }} nugget(s)
							<span v-if="robDefender.carriedCattle"> · has cattle</span>
						</p>
						<div class="mb-2 flex flex-wrap gap-2">
							<label class="flex cursor-pointer items-center gap-2 text-xs">
								<input v-model="robStealGold" type="radio" :value="true" class="rounded border-slate-600" />
								Half gold
							</label>
							<label class="flex cursor-pointer items-center gap-2 text-xs">
								<input v-model="robStealGold" type="radio" :value="false" class="rounded border-slate-600" />
								Half nuggets
							</label>
						</div>
						<label
							v-if="robDefender.carriedCattle"
							class="mb-3 flex cursor-pointer items-center gap-2 text-xs text-slate-300"
						>
							<input v-model="robTakeCattle" type="checkbox" class="rounded border-slate-600" />
							Also take their cattle token
						</label>
						<button
							type="button"
							class="rounded border border-amber-700/60 bg-amber-950/50 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-900/40"
							@click="runMove('resolveFightRobLoot', robStealGold ? 'gold' : 'nuggets', robTakeCattle)"
						>
							Confirm loot
						</button>
					</template>
					<p v-else class="text-xs text-rose-200/70">Waiting for robber to choose loot…</p>
					</template>
				</template>

				<template v-else-if="fight.phase === 'outcome'">
					<p class="mb-2 font-medium text-emerald-200/95">Fight result</p>
					<p class="mb-3 whitespace-pre-wrap text-xs text-rose-100/90">
						{{ fight.revealCompareSummary }}
					</p>
					<div
						v-if="fight.kind === 'manInBlack' && fight.mibFightCardTriplet"
						class="mb-3 flex flex-wrap gap-2"
					>
						<span class="w-full text-[10px] uppercase tracking-wide text-rose-200/70">MIB fight cards (highest used)</span>
						<img
							v-for="face in fight.mibFightCardTriplet"
							:key="'mib3-' + face"
							:src="fightCardImg(face)"
							:alt="face"
							class="h-16 w-auto rounded border border-black/25"
						/>
					</div>
					<div
						v-if="outcomeReveal && (outcomeReveal.challenger || outcomeReveal.defender)"
						class="mb-4 flex flex-wrap items-end gap-4"
					>
						<div v-if="outcomeReveal.challenger" class="flex flex-col gap-1">
							<span class="text-[10px] uppercase tracking-wide text-rose-200/70">Challenger card</span>
							<PokerCard :card="outcomeReveal.challenger" hand-tray />
						</div>
						<div v-if="outcomeReveal.defender" class="flex flex-col gap-1">
							<span class="text-[10px] uppercase tracking-wide text-rose-200/70">{{
								fight.kind === 'manInBlack' ? 'MIB card (highest of 3)' : 'Defender card'
							}}</span>
							<PokerCard :card="outcomeReveal.defender" hand-tray />
						</div>
					</div>
					<button
						v-if="canAct"
						type="button"
						class="rounded border border-emerald-700/60 bg-emerald-950/50 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-900/40"
						@click="runMove('dismissFightOutcome')"
					>
						Continue
					</button>
					<p v-else class="text-xs text-rose-200/70">{{ duelistBlockedMessage() }}</p>
				</template>
			</div>
		</div>
	</Teleport>
</template>
