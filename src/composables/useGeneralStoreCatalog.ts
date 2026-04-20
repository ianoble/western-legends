import { computed } from 'vue';
import { useGame } from '@engine/client';
import type { WesternLegendsState } from '../logic/types';
import {
	GENERAL_STORE_MAX_MISC_ITEMS,
	GENERAL_STORE_PRICES,
	maxDiscreteTurnSlotsForPlayer,
} from '../logic/types';
import { BOARD_SPACES_BY_ID } from '../map/boardSpaces';
import { uiGamePhase } from '../logic/phaseUi';
import {
	ITEM_UPGRADE_BASE,
	MOUNT_ITEM_ID_SET,
	WEAPON_ITEM_ID_SET,
	generalStoreStockLineId,
	isMiscItemId,
	upgradeItemIdForBase,
} from '../logic/equipment';
import {
	GENERAL_STORE_BASE_ITEM_IDS,
	GENERAL_STORE_COPIES_PER_BASE_ITEM,
	GENERAL_STORE_ITEM_TOOLTIPS,
	ITEM_CARD_BY_ID,
} from '../data/itemCards';

/**
 * General Store purchase row logic (shared by {@link GeneralStoreStripPanel.vue}).
 * Mirrors the former helpers in GameBoard.vue.
 */
export function useGeneralStoreCatalog() {
	const { state, playerID, isMyTurn, move, ctx } = useGame<WesternLegendsState>();

	const G = computed(() => state.value);
	const me = computed(() => {
		const pid = playerID.value;
		if (!pid) return undefined;
		return G.value.players?.[pid];
	});
	const gamePhase = computed(() => uiGamePhase(G.value as WesternLegendsState, ctx.value?.phase));
	const here = computed(() => (me.value ? BOARD_SPACES_BY_ID[me.value.locationId] : undefined));
	const kind = computed(() => here.value?.actionKind ?? null);

	const turnSlotsUsed = computed(() => me.value?.turnActions?.length ?? 0);
	const canTakeDiscrete = computed(() => turnSlotsUsed.value < maxDiscreteTurnSlotsForPlayer(me.value));

	/** First store buy on this hex costs a turn slot; further buys this visit do not. */
	const canUseGeneralStoreLocationSlot = computed(
		() =>
			kind.value === 'generalStore' &&
			(canTakeDiscrete.value ||
				(me.value?.generalStoreVisitPaidLocationId != null &&
					me.value.generalStoreVisitPaidLocationId === me.value.locationId)),
	);

	function storeStockCount(itemId: string): number {
		const st = G.value as WesternLegendsState;
		const line = generalStoreStockLineId(itemId) ?? itemId;
		const raw = st?.generalStoreStock?.[line];
		if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
		return GENERAL_STORE_COPIES_PER_BASE_ITEM;
	}

	function storeItemTooltip(itemId: string): string {
		return GENERAL_STORE_ITEM_TOOLTIPS[itemId] ?? ITEM_CARD_BY_ID[itemId]?.name ?? itemId;
	}

	function playerOwnsStoreItem(itemId: string): boolean {
		if (!me.value) return false;
		if (WEAPON_ITEM_ID_SET.has(itemId)) return me.value.ownedWeaponItemIds.includes(itemId);
		if (MOUNT_ITEM_ID_SET.has(itemId)) return me.value.ownedMountItemIds.includes(itemId);
		if (isMiscItemId(itemId)) return me.value.ownedMiscItemIds.includes(itemId);
		return false;
	}

	function storeRowDisplayId(baseId: string): string {
		const up = upgradeItemIdForBase(baseId);
		if (up != null) {
			if (playerOwnsStoreItem(up)) return up;
			if (playerOwnsStoreItem(baseId)) return up;
		}
		return baseId;
	}

	function storeRowPurchaseId(baseId: string): string | null {
		const up = upgradeItemIdForBase(baseId);
		if (up != null) {
			if (playerOwnsStoreItem(up)) return null;
			if (playerOwnsStoreItem(baseId)) return up;
		}
		return baseId;
	}

	function storeBuyDisabled(itemId: string): boolean {
		if (!me.value || kind.value !== 'generalStore' || !canUseGeneralStoreLocationSlot.value) return true;
		const price = GENERAL_STORE_PRICES[itemId];
		if (price == null || me.value.gold < price) return true;
		const base = ITEM_UPGRADE_BASE[itemId];
		if (base != null) {
			if (WEAPON_ITEM_ID_SET.has(itemId)) {
				return !me.value.ownedWeaponItemIds.includes(base) || me.value.ownedWeaponItemIds.includes(itemId);
			}
			if (MOUNT_ITEM_ID_SET.has(itemId)) {
				return !me.value.ownedMountItemIds.includes(base) || me.value.ownedMountItemIds.includes(itemId);
			}
			return true;
		}
		if (WEAPON_ITEM_ID_SET.has(itemId)) {
			if (me.value.ownedWeaponItemIds.includes(itemId)) return true;
			if (ITEM_UPGRADE_BASE[itemId] == null) {
				const line = generalStoreStockLineId(itemId);
				if (line != null && storeStockCount(itemId) <= 0) return true;
			}
			return false;
		}
		if (MOUNT_ITEM_ID_SET.has(itemId)) {
			if (me.value.ownedMountItemIds.includes(itemId)) return true;
			if (ITEM_UPGRADE_BASE[itemId] == null) {
				const line = generalStoreStockLineId(itemId);
				if (line != null && storeStockCount(itemId) <= 0) return true;
			}
			return false;
		}
		if (isMiscItemId(itemId)) {
			const misc = me.value.ownedMiscItemIds ?? [];
			if (misc.includes(itemId) || misc.length >= GENERAL_STORE_MAX_MISC_ITEMS) return true;
			if (GENERAL_STORE_BASE_ITEM_IDS.includes(itemId) && storeStockCount(itemId) <= 0) return true;
			return false;
		}
		return true;
	}

	function storeStripTileDisabled(baseId: string): boolean {
		const pid = storeRowPurchaseId(baseId);
		if (pid == null) return true;
		return storeBuyDisabled(pid);
	}

	function storeStripTileTooltip(baseId: string): string {
		const pid = storeRowPurchaseId(baseId);
		return storeItemTooltip(pid ?? storeRowDisplayId(baseId));
	}

	function buyFromStoreStrip(baseId: string): void {
		const pid = storeRowPurchaseId(baseId);
		if (pid != null && !storeBuyDisabled(pid)) move('buyFromGeneralStore', pid);
	}

	return {
		kind,
		isMyTurn,
		gamePhase,
		storeStockCount,
		storeRowDisplayId,
		storeRowPurchaseId,
		storeStripTileDisabled,
		storeStripTileTooltip,
		buyFromStoreStrip,
	};
}
