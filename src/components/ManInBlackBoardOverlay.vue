<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useGame } from '@engine/client';
import type { ManInBlackPendingState, WesternLegendsState } from '../logic/types';
import { isManInBlackCatalogCardId, mibOverlayCopyForCardId } from '../data/manInBlackCards';

const { state, matchID } = useGame<WesternLegendsState>();
const G = computed(() => state.value);

/** After async MIB finishes, discard tail matches the resolved card — suppress a duplicate sync sheet. */
const suppressDiscardKey = ref('');

const ackTick = ref(0);

/** Shown after duel/rob commit so players see Trail-equivalent lines before the map unlocks. */
const interactionOutcomeMessages = ref<string[] | null>(null);
const interactionOutcomeCardId = ref<string | null>(null);

function syncAckStorageKey(k: string): string {
	const m = matchID.value;
	if (!m || !k) return '';
	return `wl-mib-sync-ack:${m}:${k}`;
}

function readSyncAcked(k: string): boolean {
	if (!k) return false;
	return sessionStorage.getItem(syncAckStorageKey(k)) === '1';
}

const currentDiscardKey = computed((): string => {
	const d = G.value?.manInBlack?.discard ?? [];
	if (d.length === 0) return '';
	const tail = d[d.length - 1]!;
	return `${d.length}_${tail}`;
});

watch(currentDiscardKey, (k) => {
	if (suppressDiscardKey.value && k !== suppressDiscardKey.value) {
		suppressDiscardKey.value = '';
	}
});

/** Clear a stale outcome panel when a new MIB interaction starts. */
watch(
	() => G.value?.manInBlackPending ?? null,
	(p) => {
		if (p?.kind === 'interaction') {
			interactionOutcomeMessages.value = null;
			interactionOutcomeCardId.value = null;
		}
	},
);

watch(
	() => G.value?.manInBlackPending ?? null,
	(p, pPrev) => {
		if (p != null || pPrev == null) return;
		const k = currentDiscardKey.value;
		if (k) suppressDiscardKey.value = k;

		if (pPrev.kind === 'interaction') {
			const log = G.value?.gameLog ?? [];
			interactionOutcomeMessages.value = log.slice(-12).map((e) => e.message);
			interactionOutcomeCardId.value = pPrev.mibCardId;
			if (k) {
				const key = syncAckStorageKey(k);
				if (key) {
					sessionStorage.setItem(key, '1');
					ackTick.value++;
				}
			}
		}
	},
);

type PendingPayload = {
	mode: 'pending';
	cardId: string;
	title: string;
	body: string;
	subtitle: string;
};

type SyncPayload = {
	mode: 'syncAck';
	cardId: string;
	title: string;
	body: string;
	subtitle: string;
};

type InteractionOutcomePayload = {
	mode: 'interactionOutcome';
	cardId: string;
	messages: readonly string[];
};

const pendingPayload = computed((): PendingPayload | null => {
	const p = G.value?.manInBlackPending as ManInBlackPendingState | null | undefined;
	if (p == null) return null;

	if (p.kind === 'cabaretProxyPick') {
		const c = mibOverlayCopyForCardId('mib-10');
		return {
			mode: 'pending',
			cardId: 'mib-10',
			title: c.title,
			body: c.body,
			subtitle:
				'Cabaret proxy: pick two of your four dealt cards for the poker showdown (MIB wins ties). Use the side panel.',
		};
	}

	const copy = mibOverlayCopyForCardId(p.mibCardId);
	if (p.kind === 'interaction') {
		return {
			mode: 'pending',
			cardId: p.mibCardId,
			title: copy.title,
			body: copy.body,
			subtitle:
				p.interaction === 'duel'
					? 'The challenged player plays one poker card from hand (see side panel).'
					: 'The challenged player plays one poker card from hand — rob interaction (see side panel).',
		};
	}

	if (p.kind === 'discardBoth') {
		return {
			mode: 'pending',
			cardId: p.mibCardId,
			title: copy.title,
			body: copy.body,
			subtitle: 'Both players discard one visible poker card in turn order. Use the side panel.',
		};
	}

	return null;
});

const outcomePayload = computed((): InteractionOutcomePayload | null => {
	const msgs = interactionOutcomeMessages.value;
	if (!msgs?.length) return null;
	return {
		mode: 'interactionOutcome',
		cardId: interactionOutcomeCardId.value ?? '?',
		messages: msgs,
	};
});

const syncPayload = computed((): SyncPayload | null => {
	ackTick.value;
	if (pendingPayload.value != null) return null;
	if (outcomePayload.value != null) return null;
	const k = currentDiscardKey.value;
	if (!k) return null;
	if (suppressDiscardKey.value === k) return null;
	if (readSyncAcked(k)) return null;
	const tail = k.split('_').pop();
	if (!tail || !isManInBlackCatalogCardId(tail)) return null;
	const copy = mibOverlayCopyForCardId(tail);
	return {
		mode: 'syncAck',
		cardId: tail,
		title: copy.title,
		body: copy.body,
		subtitle: 'This card resolved immediately. Gold, wounds, and other effects are already applied.',
	};
});

const panelPayload = computed(
	() => pendingPayload.value ?? outcomePayload.value ?? syncPayload.value,
);

function onGotItSync(): void {
	const k = currentDiscardKey.value;
	const key = syncAckStorageKey(k);
	if (key) sessionStorage.setItem(key, '1');
	ackTick.value++;
}

function onGotItOutcome(): void {
	interactionOutcomeMessages.value = null;
	interactionOutcomeCardId.value = null;
}
</script>

<template>
	<div
		v-if="panelPayload"
		class="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center p-4 sm:p-6"
		role="dialog"
		aria-modal="true"
		:aria-labelledby="panelPayload.mode === 'interactionOutcome' ? 'mib-outcome-title' : 'mib-overlay-title'"
	>
		<div class="absolute inset-0 bg-slate-950/65 backdrop-blur-[2px]" aria-hidden="true" />
		<div
			class="relative z-10 flex w-full max-w-md flex-col gap-4 rounded-xl border-2 border-orange-500/45 bg-slate-950/95 p-5 shadow-2xl shadow-orange-950/40 ring-2 ring-orange-400/30"
			:class="panelPayload.mode === 'interactionOutcome' ? 'max-h-[min(90vh,520px)]' : ''"
		>
			<template v-if="panelPayload.mode === 'interactionOutcome'">
				<div class="min-w-0 shrink-0">
					<p class="text-[10px] font-semibold uppercase tracking-wider text-orange-300/90">Man in Black — outcome</p>
					<p id="mib-outcome-title" class="font-mono text-lg font-semibold tracking-tight text-orange-50">
						{{ panelPayload.cardId }}
					</p>
					<p class="mt-1 text-xs text-slate-400">What happened (same as the Trail):</p>
				</div>
				<ul
					class="min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-lg border border-slate-700/80 bg-slate-900/50 px-3 py-2 text-xs leading-relaxed text-slate-200"
				>
					<li v-for="(line, i) in panelPayload.messages" :key="'mib-out-' + i + '-' + line.slice(0, 24)" class="list-none">
						{{ line }}
					</li>
				</ul>
				<p class="text-[10px] text-slate-500">Click Got it when you have read the results. You can always re-read the Trail in the side panel.</p>
				<button
					type="button"
					class="w-full shrink-0 rounded-lg border border-orange-600/70 bg-orange-900/45 px-4 py-2.5 text-sm font-semibold text-orange-50 hover:bg-orange-800/50"
					@click="onGotItOutcome"
				>
					Got it
				</button>
			</template>
			<template v-else>
				<div class="flex gap-4">
					<div class="shrink-0 overflow-hidden rounded-lg border border-orange-900/50 bg-slate-900 shadow-inner">
						<img
							src="/images/mib-card-placeholder.svg"
							width="140"
							height="190"
							alt=""
							class="h-[min(190px,28vh)] w-auto max-w-[140px] object-cover"
						/>
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-[10px] font-semibold uppercase tracking-wider text-orange-300/90">Man in Black</p>
						<p id="mib-overlay-title" class="font-mono text-lg font-semibold tracking-tight text-orange-50">
							{{ panelPayload.cardId }}
						</p>
						<p class="mt-1 text-sm font-medium text-orange-100/95">{{ panelPayload.title }}</p>
					</div>
				</div>
				<p class="text-sm leading-snug text-slate-200">{{ panelPayload.body }}</p>
				<p class="text-xs leading-relaxed text-slate-400">{{ panelPayload.subtitle }}</p>
				<p v-if="panelPayload.mode === 'pending'" class="text-[10px] text-slate-500">
					Use the side panel to take actions. Map input is dimmed until this card resolves.
				</p>
				<p v-else class="text-[10px] text-slate-500">
					Effects already applied (gold, wounds, etc.). Click Got it to continue on the map.
				</p>
				<button
					v-if="panelPayload.mode === 'syncAck'"
					type="button"
					class="w-full rounded-lg border border-orange-600/70 bg-orange-900/45 px-4 py-2.5 text-sm font-semibold text-orange-50 hover:bg-orange-800/50"
					@click="onGotItSync"
				>
					Got it
				</button>
			</template>
		</div>
	</div>
</template>
