<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useGame, isCardHidden, type Card, type StandardCard, type VisibleCard } from '@engine/client';
import PokerCard from './PokerCard.vue';
import type { SaloonRevealEntry, WesternLegendsState } from '../logic/types';
import {
	POKER_ANTE_GOLD,
	SALOON_HOUSE_ADDS_TO_POT,
	SALOON_WIN_LEGEND_POINTS,
	type PlayerColor,
} from '../logic/types';
import { formatPokerScoreLabel } from '../logic/poker';
import { uiGamePhase } from '../logic/phaseUi';
import { gameDef } from '../logic/index';
import { SERVER_URL } from '../config';
import confetti from 'canvas-confetti';

const PLAYER_COLOR_HEX: Record<PlayerColor, string> = {
	red: '#dc2626',
	blue: '#60a5fa',
	green: '#4ade80',
	yellow: '#facc15',
	black: '#64748b',
	orange: '#fb923c',
};

const route = useRoute();
const { state, playerID, isMyTurn, move, ctx } = useGame<WesternLegendsState>();

const G = computed(() => state.value);
const gamePhase = computed(() => uiGamePhase(G.value as WesternLegendsState, ctx.value?.phase));
const me = computed(() => {
	const pid = playerID.value;
	if (!pid) return undefined;
	return G.value?.players?.[pid];
});

const saloonRound = computed(() => (G.value as WesternLegendsState | undefined)?.saloonRound ?? null);
const saloonReveal = computed(() => (G.value as WesternLegendsState | undefined)?.saloonReveal ?? null);

/**
 * Which role does the viewer play in this saloon round?
 *
 * - `active`: they initiated the Saloon action (may pick vs dealer and/or tie-break).
 * - `pending`: invited in the same town, still owes a join/skip response.
 * - `joined`: already paid the ante and is waiting for showdown resolution.
 * - `spectator`: anyone else (different town, already skipped, or no seat).
 */
type ViewerRole = 'active' | 'pending' | 'joined' | 'spectator';

const viewerRole = computed<ViewerRole>(() => {
	const r = saloonRound.value;
	const pid = playerID.value;
	if (!r || !pid) return 'spectator';
	if (pid === r.activePlayerId) return 'active';
	if ((r.pendingPlayerIds ?? []).includes(pid)) return 'pending';
	if ((r.joinedPlayerIds ?? []).includes(pid)) return 'joined';
	return 'spectator';
});

/** Participants we show in the intro step (active + invited + joined), deduped in seat order. */
const participantIds = computed(() => {
	const r = saloonRound.value;
	if (!r) return [] as string[];
	const ids = new Set<string>([r.activePlayerId, ...(r.pendingPlayerIds ?? []), ...(r.joinedPlayerIds ?? [])]);
	return Array.from(ids).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
});

type ParticipantStatus = 'active' | 'pending' | 'joined' | 'skipped';

function statusFor(pid: string): ParticipantStatus {
	const r = saloonRound.value;
	if (!r) return 'skipped';
	if (pid === r.activePlayerId) return 'active';
	if ((r.pendingPlayerIds ?? []).includes(pid)) return 'pending';
	if ((r.joinedPlayerIds ?? []).includes(pid)) return 'joined';
	return 'skipped';
}

const STATUS_LABEL: Record<ParticipantStatus, string> = {
	active: 'Dealer / host',
	pending: 'Deciding…',
	joined: 'Joined',
	skipped: 'Skipped',
};

const STATUS_CLASS: Record<ParticipantStatus, string> = {
	active: 'bg-amber-900/60 text-amber-100 border-amber-700/55',
	pending: 'bg-sky-950/60 text-sky-100 border-sky-700/55',
	joined: 'bg-emerald-950/60 text-emerald-100 border-emerald-700/55',
	skipped: 'bg-slate-800 text-slate-400 border-slate-700',
};

function cityIdToLabel(id: string | undefined): string {
	if (id === 'darkrock') return 'Darkrock';
	if (id === 'redFalls') return 'Red Falls';
	return 'the saloon';
}

const cityLabel = computed(() => cityIdToLabel(saloonRound.value?.cityId));

const cityLabelReveal = computed(() => cityIdToLabel(saloonReveal.value?.cityId));

// --- Wizard plumbing ---------------------------------------------------------

/**
 * Step catalogue. Per-viewer visibility is computed below - `pending` players see the
 * join/skip step; only the active player sees the dealer hole-card pick.
 */
type StepId = 'intro' | 'respond' | 'deal' | 'pick' | 'resolve';

const ALL_STEPS: readonly StepId[] = ['intro', 'respond', 'deal', 'pick', 'resolve'] as const;

const STEP_TITLE: Record<StepId, string> = {
	intro: 'Saloon showdown',
	respond: 'Join the game?',
	deal: 'The flop',
	pick: 'Pick your two',
	resolve: 'Resolution',
};

const visibleSteps = computed<StepId[]>(() => {
	const r = saloonRound.value;
	const role = viewerRole.value;
	if (!r || role === 'spectator') return [];
	return ALL_STEPS.filter((id) => {
		if (id === 'respond') return role === 'pending' || r.pendingPlayerIds.length > 0;
		if (id === 'pick') return role === 'active' && r.dealerShowdown != null;
		return true;
	});
});

/**
 * Farthest step the server has opened. Role-agnostic; `pick` is only reported when a
 * dealer showdown is live, which only happens for the active player anyway.
 */
const serverStepId = computed<StepId>(() => {
	const r = saloonRound.value;
	if (!r) return 'intro';
	if (r.tieBreakCandidateIds != null) return 'resolve';
	if (r.dealerShowdown != null) return 'pick';
	if (r.pendingPlayerIds.length > 0) return 'respond';
	return 'deal';
});

const currentStepIdx = ref(0);

/**
 * `-1` until the viewer has observed at least one server step for this round. We use it to
 * distinguish "round just opened, land on intro" from "server advanced, snap forward".
 */
const lastSeenServerStepIdx = ref(-1);

/** When a new round starts (or saloonRound clears), reset the wizard to step 1. */
watch(
	() => saloonRound.value?.activePlayerId ?? null,
	(next, prev) => {
		if (next !== prev) {
			currentStepIdx.value = 0;
			lastSeenServerStepIdx.value = -1;
		}
	},
	{ immediate: true },
);

/**
 * Snap forward only when the server actually progresses AND the user was caught up to the
 * prior server step. If they've intentionally stepped backwards to re-read, we leave them
 * be - they can click Next to catch up manually.
 */
watch([serverStepId, visibleSteps], ([serverStep, steps]) => {
	const target = steps.indexOf(serverStep);
	if (target < 0) return;
	const prev = lastSeenServerStepIdx.value;
	lastSeenServerStepIdx.value = target;
	if (prev < 0) return;
	if (target <= prev) return;
	if (currentStepIdx.value === prev) currentStepIdx.value = target;
	if (currentStepIdx.value >= steps.length) currentStepIdx.value = steps.length - 1;
});

const currentStepId = computed<StepId>(() => {
	const steps = visibleSteps.value;
	if (steps.length === 0) return 'intro';
	const idx = Math.min(Math.max(currentStepIdx.value, 0), steps.length - 1);
	return steps[idx]!;
});

const canGoPrev = computed(() => currentStepIdx.value > 0);

/**
 * Forward advance requires the step's server action to be complete:
 * intro / deal are informational; respond needs this player's join-or-skip resolved;
 * pick needs the dealer showdown cleared; resolve is the terminal step.
 */
const canGoNext = computed(() => {
	const steps = visibleSteps.value;
	if (currentStepIdx.value >= steps.length - 1) return false;
	const step = currentStepId.value;
	const r = saloonRound.value;
	if (!r) return false;
	if (step === 'intro') return true;
	if (step === 'respond') {
		if (viewerRole.value === 'pending') return false;
		return r.pendingPlayerIds.length === 0;
	}
	if (step === 'deal') return true;
	if (step === 'pick') {
		if (viewerRole.value !== 'active') return true;
		return r.dealerShowdown == null;
	}
	return false;
});

function goPrev() {
	if (canGoPrev.value) currentStepIdx.value -= 1;
}

function goNext() {
	if (canGoNext.value) currentStepIdx.value += 1;
}

// --- Step 4: pick two hole cards (active player vs dealer) -------------------

const saloonHolePickIds = ref<string[]>([]);
watch(
	() => saloonRound.value?.dealerShowdown?.dealerId ?? null,
	() => {
		saloonHolePickIds.value = [];
	},
);

function toggleSaloonHolePick(id: string) {
	const cur = saloonHolePickIds.value;
	const ix = cur.indexOf(id);
	if (ix >= 0) {
		saloonHolePickIds.value = cur.filter((x) => x !== id);
	} else if (cur.length < 2) {
		saloonHolePickIds.value = [...cur, id];
	}
}

function confirmSaloonHolePick() {
	const ids = saloonHolePickIds.value;
	if (ids.length !== 2) return;
	move('submitSaloonHolePick', ids[0], ids[1]);
}

const hiddenPokerCard = { hidden: true as const };

function handCardKey(c: Card, i: number): string {
	return isCardHidden(c) ? `h-${i}` : (c as VisibleCard).id;
}

// --- Step 5: last log entry (e.g. "Seat 1 wins $60, +1 LP") ------------------

const resolutionLogTail = computed(() => {
	const log = G.value?.gameLog ?? [];
	return log
		.slice(-6)
		.filter((e) => /saloon|pot|winner|tie/i.test(e.message))
		.slice(-3);
});

// --- Visibility --------------------------------------------------------------

/** In-progress Saloon wizard (join / flop / pick / tie-break). */
const showWizard = computed(() => {
	if (!saloonRound.value) return false;
	if (gamePhase.value !== 'play') return false;
	if (viewerRole.value === 'spectator') return false;
	return true;
});

/** Post-round ranked hands + payout; server keeps this until `dismissSaloonReveal`. */
const showRevealOnly = computed(() => {
	if (!saloonReveal.value) return false;
	if (saloonRound.value) return false;
	if (gamePhase.value !== 'play') return false;
	return playerID.value != null;
});

/** Seat id → display name from lobby join (`playerName`), same source as MatchInfo.players in LobbyView. */
const seatUserNames = ref<Record<string, string>>({});

watch(
	() => [showRevealOnly.value, route.params.matchID] as const,
	async ([show, mid]) => {
		if (!show || typeof mid !== 'string' || mid.length === 0) {
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

function revealRowLabel(entry: SaloonRevealEntry): string {
	return entry.role === 'dealer' ? `Dealer (${seatDisplayName(entry.playerId)})` : seatDisplayName(entry.playerId);
}

function revealWinnerLine(r: NonNullable<typeof saloonReveal.value>): string {
	if (r.winnerId == null) return 'No winner';
	const row = r.ranked.find((e) => e.playerId === r.winnerId);
	if (row?.role === 'dealer') return `Dealer (${seatDisplayName(r.winnerId)})`;
	return seatDisplayName(r.winnerId);
}

const potGold = computed(() => saloonRound.value?.potGold ?? POKER_ANTE_GOLD + SALOON_HOUSE_ADDS_TO_POT);

const saloonConfettiFired = ref(false);
watch(
	() =>
		showRevealOnly.value &&
		saloonReveal.value != null &&
		playerID.value != null &&
		saloonReveal.value.winnerId === playerID.value,
	(shouldFire) => {
		if (!shouldFire) {
			saloonConfettiFired.value = false;
			return;
		}
		if (saloonConfettiFired.value) return;
		saloonConfettiFired.value = true;
		const color = me.value?.color;
		const confettiColors = color ? [PLAYER_COLOR_HEX[color] ?? '#94a3b8'] : ['#eab308'];
		const duration = 3000;
		const end = Date.now() + duration;
		const frame = () => {
			confetti({
				particleCount: 3,
				angle: 60,
				spread: 55,
				origin: { x: 0 },
				colors: confettiColors,
			});
			confetti({
				particleCount: 3,
				angle: 120,
				spread: 55,
				origin: { x: 1 },
				colors: confettiColors,
			});
			if (Date.now() < end) requestAnimationFrame(frame);
		};
		frame();
	},
	{ immediate: true },
);
</script>

<template>
	<Teleport to="body">
		<!-- Post-showdown: ranked hands + payout (all seats see the same reveal). -->
		<div
			v-if="showRevealOnly && saloonReveal && me"
			class="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-slate-950/85 p-3 backdrop-blur-sm sm:p-6"
			role="dialog"
			aria-modal="true"
			aria-labelledby="saloon-reveal-title"
		>
			<div
				class="w-full max-w-xl rounded-xl border border-amber-800/45 bg-slate-900/96 p-4 shadow-xl ring-1 ring-amber-950/40 sm:max-w-2xl sm:p-5"
			>
				<header class="mb-4">
					<p class="text-[10px] font-semibold uppercase tracking-wide text-amber-300/80">Saloon at {{ cityLabelReveal }}</p>
					<h2 id="saloon-reveal-title" class="text-lg font-semibold text-amber-100">Showdown results</h2>
				</header>

				<div class="mb-4">
					<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Flop</p>
					<div class="flex flex-wrap gap-2">
						<PokerCard
							v-for="(c, fi) in saloonReveal.flop"
							:key="'rev-flop-' + fi + '-' + (c as StandardCard).id"
							:card="c as Card"
						/>
					</div>
				</div>

				<p class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Hands (best first)</p>
				<ol class="mb-4 space-y-3" role="list">
					<li
						v-for="(entry, ri) in saloonReveal.ranked"
						:key="'rev-' + entry.playerId + '-' + entry.role + '-' + ri"
						class="list-none rounded-lg border border-slate-700/80 bg-slate-950/50 p-3"
						:class="entry.playerId === saloonReveal.winnerId ? 'ring-1 ring-amber-500/50' : ''"
					>
						<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
							<span class="text-sm font-medium text-slate-200">
								#{{ ri + 1 }} · {{ revealRowLabel(entry) }}
								<span v-if="entry.playerId === saloonReveal.winnerId" class="ml-2 text-amber-300/95">Winner</span>
							</span>
							<span class="text-xs text-slate-400">{{ formatPokerScoreLabel(entry.score) }}</span>
						</div>
						<div class="flex flex-wrap gap-2">
							<PokerCard v-for="(hc, hi) in entry.holeCards" :key="'hc-' + hi + '-' + hc.id" :card="hc as Card" />
						</div>
					</li>
				</ol>

				<div class="mb-4 rounded-lg border border-amber-900/35 bg-amber-950/25 px-3 py-3 text-sm">
					<p class="font-medium text-amber-100">{{ revealWinnerLine(saloonReveal) }}</p>
					<p class="mt-1 text-slate-300">
						Pot <strong class="tabular-nums text-amber-200">${{ saloonReveal.potGold }}</strong>
						<span v-if="saloonReveal.winnerGold > 0 || saloonReveal.winnerLegendPoints > 0">
							· Award
							<strong v-if="saloonReveal.winnerGold > 0" class="tabular-nums text-amber-200">
								+${{ saloonReveal.winnerGold }} gold</strong>
							<span v-if="saloonReveal.winnerGold > 0 && saloonReveal.winnerLegendPoints > 0">, </span>
							<strong v-if="saloonReveal.winnerLegendPoints > 0" class="tabular-nums text-teal-200">
								+{{ saloonReveal.winnerLegendPoints }} LP</strong>
						</span>
						<span v-else class="text-slate-400"> · No gold or LP to the winner this round.</span>
					</p>
					<ul v-if="saloonReveal.notes?.length" class="mt-2 list-inside list-disc text-xs text-slate-400">
						<li v-for="(n, ni) in saloonReveal.notes" :key="'note-' + ni">{{ n }}</li>
					</ul>
				</div>

				<button
					type="button"
					class="w-full rounded-lg border border-amber-700/55 bg-amber-950/45 px-4 py-2.5 text-sm font-medium text-amber-100 hover:bg-amber-900/40"
					@click="move('dismissSaloonReveal')"
				>
					Done
				</button>
			</div>
		</div>

		<div
			v-else-if="showWizard && saloonRound && me"
			class="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-slate-950/85 p-3 backdrop-blur-sm sm:p-6"
			role="dialog"
			aria-modal="true"
			aria-labelledby="saloon-overlay-title"
		>
			<div
				class="w-full max-w-xl rounded-xl border border-amber-800/45 bg-slate-900/96 p-4 shadow-xl ring-1 ring-amber-950/40 sm:p-5"
			>
				<header class="mb-3 flex items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="text-[10px] font-semibold uppercase tracking-wide text-amber-300/80">
							Saloon at {{ cityLabel }}
						</p>
						<h2 id="saloon-overlay-title" class="truncate text-lg font-semibold text-amber-100">
							{{ STEP_TITLE[currentStepId] }}
						</h2>
					</div>
					<span class="shrink-0 rounded-full border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-[11px] tabular-nums text-slate-300">
						{{ visibleSteps.indexOf(currentStepId) + 1 }} / {{ visibleSteps.length }}
					</span>
				</header>

				<!-- Step 1 · Showdown intro -->
				<section v-if="currentStepId === 'intro'" class="space-y-3">
					<p class="text-sm leading-relaxed text-slate-300">
						A Saloon round has opened at
						<strong class="text-amber-200">{{ cityLabel }}</strong>. The pot is
						<strong class="tabular-nums text-amber-200">${{ potGold }}</strong>
						(ante ${{ POKER_ANTE_GOLD }} + house ${{ SALOON_HOUSE_ADDS_TO_POT }}). Winner takes the pot
						and gains +{{ SALOON_WIN_LEGEND_POINTS }} LP.
					</p>
					<div>
						<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Players in town</p>
						<ul class="flex flex-wrap gap-2" role="list">
							<li v-for="pid in participantIds" :key="'p-' + pid" class="list-none">
								<span
									class="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
									:class="STATUS_CLASS[statusFor(pid)]"
								>
									<span class="font-semibold tabular-nums">Seat {{ pid }}</span>
									<span class="opacity-80">· {{ STATUS_LABEL[statusFor(pid)] }}</span>
								</span>
							</li>
						</ul>
					</div>
				</section>

				<!-- Step 2 · Join / skip -->
				<section v-else-if="currentStepId === 'respond'" class="space-y-3">
					<template v-if="viewerRole === 'pending'">
						<p class="text-sm text-slate-300">
							You're in the same town. Pay
							<strong class="text-amber-200">${{ POKER_ANTE_GOLD }}</strong> to join the hand (and draw 1 card),
							or skip this showdown.
						</p>
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								class="rounded-lg border border-amber-700/55 bg-amber-950/45 px-3 py-1.5 text-sm font-medium text-amber-100 hover:bg-amber-900/40 disabled:cursor-not-allowed disabled:opacity-40"
								:disabled="me.gold < POKER_ANTE_GOLD"
								@click="move('joinSaloon')"
							>
								Join (−${{ POKER_ANTE_GOLD }}, draw 1)
							</button>
							<button
								type="button"
								class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
								@click="move('skipSaloon')"
							>
								Skip
							</button>
						</div>
					</template>
					<template v-else>
						<p class="text-sm text-slate-300">
							Waiting for other players to decide whether to ante in.
						</p>
						<ul class="space-y-1 text-xs text-slate-400" role="list">
							<li v-for="pid in saloonRound.pendingPlayerIds" :key="'wait-' + pid" class="list-none">
								Seat <strong class="text-slate-200">{{ pid }}</strong> - still deciding…
							</li>
							<li v-if="saloonRound.pendingPlayerIds.length === 0" class="list-none italic text-slate-500">
								Everyone has responded. Advance to the flop.
							</li>
						</ul>
					</template>
				</section>

				<!-- Step 3 · The flop + dealer -->
				<section v-else-if="currentStepId === 'deal'" class="space-y-3">
					<p class="text-sm text-slate-300">
						Three community cards are dealt face up. The dealer keeps four hole cards face down and will play
						their best two against yours.
					</p>
					<div>
						<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Flop</p>
						<div class="flex flex-wrap gap-2">
							<PokerCard
								v-for="(c, fi) in saloonRound.flop"
								:key="'flop-' + fi + '-' + (c as StandardCard).id"
								:card="c as Card"
							/>
						</div>
					</div>
					<div>
						<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
							Dealer (seat {{ saloonRound.dealerShowdown?.dealerId ?? '?' }}) - 4 hole cards
						</p>
						<div class="flex flex-wrap gap-2">
							<PokerCard v-for="n in 4" :key="'dh-' + n" :card="hiddenPokerCard" />
						</div>
					</div>
				</section>

				<!-- Step 4 · Pick two hole cards -->
				<section v-else-if="currentStepId === 'pick'" class="space-y-3">
					<p class="text-sm text-slate-300">
						Tap two of your poker cards to play with the flop. The dealer will reveal their best two when you
						confirm.
					</p>
					<div>
						<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Flop</p>
						<div class="flex flex-wrap gap-2">
							<PokerCard
								v-for="(c, fi) in saloonRound.flop"
								:key="'pick-flop-' + fi + '-' + (c as StandardCard).id"
								:card="c as Card"
							/>
						</div>
					</div>
					<div>
						<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Your hand — tap two</p>
					</div>
					<ul class="flex flex-wrap gap-2" role="list">
						<li v-for="(c, i) in me.hand" :key="'pick-' + handCardKey(c as Card, i)" class="list-none">
							<button
								v-if="!isCardHidden(c as Card)"
								type="button"
								class="rounded-md transition-[box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
								:class="
									saloonHolePickIds.includes((c as VisibleCard).id)
										? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900'
										: ''
								"
								@click="toggleSaloonHolePick((c as VisibleCard).id)"
							>
								<PokerCard :card="c as Card" />
							</button>
							<div v-else class="rounded-md opacity-60">
								<PokerCard :card="c as Card" />
							</div>
						</li>
					</ul>
					<div class="flex flex-wrap items-center justify-end gap-2 border-t border-slate-700/60 pt-3">
						<span class="mr-auto text-xs text-slate-500">{{ saloonHolePickIds.length }} / 2 selected</span>
						<button
							type="button"
							class="rounded-lg border border-amber-700/55 bg-amber-950/50 px-4 py-2 text-sm font-medium text-amber-50 hover:bg-amber-900/45 disabled:cursor-not-allowed disabled:opacity-40"
							:disabled="saloonHolePickIds.length !== 2"
							@click="confirmSaloonHolePick"
						>
							Play cards
						</button>
					</div>
				</section>

				<!-- Step 5 · Resolution / tie-break -->
				<section v-else-if="currentStepId === 'resolve'" class="space-y-3">
					<template v-if="saloonRound.tieBreakCandidateIds && saloonRound.tieBreakCandidateIds.length">
						<p class="text-sm text-slate-300">
							Top hands are tied.
							<template v-if="isMyTurn">
								Pick the winner among the tied candidates.
							</template>
							<template v-else>
								Waiting for seat <strong class="text-slate-200">{{ saloonRound.activePlayerId }}</strong> to pick the winner.
							</template>
						</p>
						<div v-if="isMyTurn" class="flex flex-wrap gap-2">
							<button
								v-for="pid in saloonRound.tieBreakCandidateIds"
								:key="'tie-' + pid"
								type="button"
								class="rounded-lg border border-amber-700/55 bg-amber-950/45 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-900/40"
								@click="move('chooseSaloonWinner', pid)"
							>
								Seat {{ pid }} wins
							</button>
						</div>
					</template>
					<template v-else>
						<p class="text-sm text-slate-300">Showdown complete.</p>
						<ul v-if="resolutionLogTail.length" class="space-y-1 text-xs text-slate-400" role="list">
							<li v-for="(e, i) in resolutionLogTail" :key="'rlog-' + i" class="list-none">{{ e.message }}</li>
						</ul>
						<p v-else class="text-xs italic text-slate-500">Resolving…</p>
					</template>
				</section>

				<!-- Footer · step controls -->
				<footer class="mt-4 flex items-center justify-between gap-3 border-t border-slate-700/60 pt-3">
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="!canGoPrev"
						@click="goPrev"
					>
						Back
					</button>
					<div class="flex items-center gap-1.5" aria-hidden="true">
						<span
							v-for="(id, idx) in visibleSteps"
							:key="'pip-' + id"
							class="h-1.5 w-4 rounded-full"
							:class="idx === currentStepIdx ? 'bg-amber-400/90' : idx < currentStepIdx ? 'bg-amber-600/60' : 'bg-slate-700'"
						/>
					</div>
					<button
						type="button"
						class="rounded-lg border border-amber-700/55 bg-amber-950/45 px-3 py-1.5 text-sm font-medium text-amber-100 hover:bg-amber-900/40 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="!canGoNext"
						@click="goNext"
					>
						Next
					</button>
				</footer>
			</div>
		</div>
	</Teleport>
</template>
