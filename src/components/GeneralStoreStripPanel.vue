<script setup lang="ts">
import { computed, watch } from 'vue';
import { GENERAL_STORE_BASE_ITEM_IDS, ITEM_CARD_BY_ID, itemCardImageUrl } from '../data/itemCards';
import { GENERAL_STORE_PRICES } from '../logic/types';
import { closeGeneralStoreStrip, generalStoreStripOpen } from '../composables/generalStoreStrip';
import { useGeneralStoreCatalog } from '../composables/useGeneralStoreCatalog';

const {
	kind,
	isMyTurn,
	gamePhase,
	storeStockCount,
	storeRowDisplayId,
	storeRowPurchaseId,
	storeStripTileDisabled,
	storeStripTileTooltip,
	buyFromStoreStrip,
} = useGeneralStoreCatalog();

function itemCardLabel(id: string | null | undefined): string {
	if (id == null || id === '') return 'None';
	return ITEM_CARD_BY_ID[id]?.name ?? id;
}

const stripVisible = computed(
	() =>
		generalStoreStripOpen.value &&
		kind.value === 'generalStore' &&
		isMyTurn.value &&
		gamePhase.value === 'play',
);

watch([kind, isMyTurn], () => {
	if (kind.value !== 'generalStore' || !isMyTurn.value) closeGeneralStoreStrip();
});
</script>

<template>
	<div
		v-if="stripVisible"
		class="mb-3 rounded-xl border border-amber-900/40 bg-slate-900/95 px-3 py-3 shadow-lg shadow-black/30 ring-1 ring-amber-900/20 backdrop-blur-sm"
	>
		<div class="mb-2 flex items-center justify-between gap-2">
			<p class="text-xs font-semibold uppercase tracking-wide text-amber-200/90">General Store</p>
			<button
				type="button"
				class="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-700"
				@click="closeGeneralStoreStrip()"
			>
				Close
			</button>
		</div>
		<p class="mb-2 text-[10px] text-slate-500">Click a card to buy (uses D). Piles show copies left in the store.</p>
		<div class="flex gap-3 overflow-x-auto pb-2">
			<button
				v-for="baseId in GENERAL_STORE_BASE_ITEM_IDS"
				:key="'store-strip-' + baseId"
				type="button"
				class="flex w-[6.5rem] shrink-0 flex-col items-center gap-1 rounded-lg border border-slate-600 bg-slate-800/90 p-2 text-center hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
				:disabled="storeStripTileDisabled(baseId)"
				:title="storeStripTileTooltip(baseId)"
				@click="buyFromStoreStrip(baseId)"
			>
				<img
					:src="itemCardImageUrl(storeRowDisplayId(baseId))"
					:alt="itemCardLabel(storeRowDisplayId(baseId))"
					class="h-16 w-full object-contain"
					loading="lazy"
					decoding="async"
				/>
				<span class="text-[10px] font-medium leading-tight text-slate-200">{{
					itemCardLabel(storeRowDisplayId(baseId))
				}}</span>
				<span v-if="storeRowPurchaseId(baseId)" class="text-[10px] text-amber-200/90">
					-{{ GENERAL_STORE_PRICES[storeRowPurchaseId(baseId)!] }}g
				</span>
				<span v-else class="text-[10px] text-slate-500">Owned</span>
				<span class="text-[9px] text-slate-500">×{{ storeStockCount(baseId) }} in store</span>
			</button>
		</div>
	</div>
</template>
