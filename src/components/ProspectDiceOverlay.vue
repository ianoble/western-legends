<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useGame } from '@engine/client';
import type { WesternLegendsState } from '../logic/types';
import type { ProspectFace } from '../logic/prospect';
import { PROSPECT_DIE_FACE_POOL } from '../logic/prospect';
import { uiGamePhase } from '../logic/phaseUi';

const { state, playerID, move, ctx } = useGame<WesternLegendsState>();

const G = computed(() => state.value);
const gamePhase = computed(() => uiGamePhase(G.value as WesternLegendsState, ctx.value?.phase));

const prospectReveal = computed(() => (G.value as WesternLegendsState | undefined)?.prospectReveal ?? null);

const showOverlay = computed(() => {
	const r = prospectReveal.value;
	const pid = playerID.value;
	if (!r || pid == null) return false;
	if (gamePhase.value !== 'play') return false;
	return r.playerId === pid;
});

/** Stable key when the server sends a new mine result (restarts animation). */
const revealKey = computed(() => {
	const r = prospectReveal.value;
	if (!r) return '';
	return `${r.playerId}:${r.summaries.join('|')}:${r.slots.map((s) => s.faces.join(',')).join(';')}`;
});

const phase = ref<'rolling' | 'done'>('rolling');
const tumbleIdx = ref(0);

const FACE_LABEL: Record<ProspectFace, string> = {
	nugget: 'Nugget',
	tailings: 'Tailings',
	goldDust: 'Gold dust',
	gravel: 'Gravel',
};

function faceLabel(f: ProspectFace): string {
	return FACE_LABEL[f] ?? f;
}

function tumbleFaceAt(i: number): ProspectFace {
	return PROSPECT_DIE_FACE_POOL[i % PROSPECT_DIE_FACE_POOL.length]!;
}

let rafId = 0;
let tumbleStart = 0;
const TUMBLE_MS = 1200;

function stopTumble() {
	if (rafId) {
		cancelAnimationFrame(rafId);
		rafId = 0;
	}
}

function runTumble() {
	stopTumble();
	phase.value = 'rolling';
	tumbleStart = 0;

	const step = (now: number) => {
		if (tumbleStart === 0) tumbleStart = now;
		tumbleIdx.value = Math.floor(now / 72) % PROSPECT_DIE_FACE_POOL.length;
		if (now - tumbleStart < TUMBLE_MS) {
			rafId = requestAnimationFrame(step);
		} else {
			rafId = 0;
			phase.value = 'done';
		}
	};
	rafId = requestAnimationFrame(step);
}

watch(
	revealKey,
	(k) => {
		if (!k) {
			stopTumble();
			return;
		}
		runTumble();
	},
	{ immediate: true },
);

onUnmounted(() => {
	stopTumble();
});

const slotsSorted = computed(() => {
	const r = prospectReveal.value;
	if (!r?.slots?.length) return [];
	return [...r.slots].sort((a, b) => a.slotIndex - b.slotIndex);
});

const me = computed(() => {
	const pid = playerID.value;
	if (pid == null || G.value?.players == null) return undefined;
	return G.value.players[pid];
});

const isMyTurn = computed(() => ctx.value?.currentPlayer === playerID.value);

/** Die slots 0 and 1 present in the last prospect (for Miner's Map reroll). */
const mapRerollDieSlots = computed((): (0 | 1)[] => {
	const d = me.value?.prospectMapRerollDice;
	if (!d?.length) return [];
	const s = new Set(d.map((e) => e.slotIndex));
	return Array.from(s).sort((a, b) => a - b) as (0 | 1)[];
});

/** Miner's Map: one optional reroll per prospect (same action — no extra turn slot). */
const showMinerMapRerollSection = computed(
	() =>
		phase.value === 'done' &&
		isMyTurn.value &&
		me.value != null &&
		(me.value.ownedMiscItemIds?.includes('map') ?? false) &&
		me.value.prospectMapRerollDice != null &&
		me.value.prospectMapRerollDice.length > 0,
);
</script>

<template>
	<Teleport to="body">
		<div
			v-if="showOverlay && prospectReveal"
			class="fixed inset-0 z-[195] flex items-center justify-center overflow-y-auto bg-slate-950/88 p-3 backdrop-blur-sm sm:p-6"
			role="dialog"
			aria-modal="true"
			aria-labelledby="prospect-dice-title"
		>
			<div
				class="w-full max-w-lg rounded-xl border border-emerald-800/50 bg-slate-900/96 p-4 shadow-xl ring-1 ring-emerald-950/35 sm:max-w-xl sm:p-5"
			>
				<header class="mb-4">
					<p class="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/85">Mine</p>
					<h2 id="prospect-dice-title" class="text-lg font-semibold text-emerald-50">Prospecting dice</h2>
					<p class="mt-1 text-xs text-slate-400">Two D6 prospecting dice (rulebook D3).</p>
				</header>

				<div class="mb-6 flex flex-wrap items-start justify-center gap-6 sm:gap-10">
					<template v-if="phase === 'rolling'">
						<div
							v-for="n in 2"
							:key="'roll-' + n"
							class="flex flex-col items-center gap-2"
						>
							<span class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Die {{ n }}</span>
							<div
								class="flex h-24 w-24 items-center justify-center rounded-xl border-2 border-emerald-700/55 bg-slate-950/90 px-2 text-center shadow-inner sm:h-28 sm:w-28"
							>
								<span class="text-sm font-semibold leading-tight text-emerald-100 sm:text-base">
									{{ faceLabel(tumbleFaceAt(tumbleIdx + n)) }}
								</span>
							</div>
						</div>
					</template>
					<template v-else>
						<div
							v-for="slot in slotsSorted"
							:key="'slot-' + slot.slotIndex"
							class="flex flex-col items-center gap-2"
						>
							<span class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
								Die {{ slot.slotIndex + 1 }}
							</span>
							<div
								class="flex min-h-24 min-w-[6.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-emerald-600/50 bg-slate-950/90 px-3 py-3 shadow-inner sm:min-h-28 sm:min-w-[7.5rem]"
							>
								<div class="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-center">
									<template v-for="(f, fi) in slot.faces" :key="'f-' + slot.slotIndex + '-' + fi">
										<span v-if="fi > 0" class="text-emerald-500/90" aria-hidden="true">→</span>
										<span class="text-sm font-semibold text-emerald-100">{{ faceLabel(f) }}</span>
									</template>
								</div>
								<p v-if="slot.faces.length > 1" class="text-center text-[10px] text-slate-500">
									Gold dust: +$10, then this die rolled again
								</p>
							</div>
						</div>
					</template>
				</div>

				<div
					v-if="phase === 'done' && prospectReveal.summaries.length"
					class="mb-4 rounded-lg border border-slate-700/80 bg-slate-950/60 px-3 py-3"
				>
					<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Results</p>
					<ul class="space-y-1.5 text-sm text-slate-200" role="list">
						<li v-for="(line, i) in prospectReveal.summaries" :key="'sum-' + i" class="list-none">
							<span class="tabular-nums text-slate-500">{{ i + 1 }}.</span>
							{{ line }}
						</li>
					</ul>
				</div>

				<div v-if="showMinerMapRerollSection" class="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
					<button
						v-for="idx in mapRerollDieSlots"
						:key="'map-reroll-' + idx"
						type="button"
						class="w-full rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-2.5 text-sm font-medium text-amber-100 hover:bg-amber-900/35 sm:w-auto sm:min-w-[10rem]"
						title="Part of your prospect action — does not use another A/B/C/D slot"
						@click="move('minerMapRerollProspect', idx)"
					>
						Miner's Map: reroll die {{ idx + 1 }}
					</button>
				</div>

				<button
					v-if="phase === 'done'"
					type="button"
					class="w-full rounded-lg border border-emerald-700/55 bg-emerald-950/45 px-4 py-2.5 text-sm font-medium text-emerald-50 hover:bg-emerald-900/40"
					@click="move('dismissProspectReveal')"
				>
					Close
				</button>
				<p v-else class="text-center text-xs text-slate-500">Rolling…</p>
			</div>
		</div>
	</Teleport>
</template>
