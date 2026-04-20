import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import { useGameStore, isCardHidden, type Card, type VisibleCard } from '@engine/client';
import type { WesternLegendsState } from '../logic/types';
import { maxDiscreteTurnSlotsForPlayer } from '../logic/types';
import { uiGamePhase } from '../logic/phaseUi';
import { actionBEffectKindForCardId } from '../logic/pokerCardEffects';

export const saddleUpPickActive: Ref<boolean> = ref(false);
export const saddleUpPickCardId: Ref<string | null> = ref(null);

let consumerCount = 0;
let stopStaleWatch: (() => void) | null = null;
let stopEscapeWatch: (() => void) | null = null;
let escapeKeydownBound = false;

function onEscapeKey(ev: KeyboardEvent) {
	if (ev.key !== 'Escape') return;
	const t = ev.target;
	if (t instanceof HTMLElement) {
		const tag = t.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		if (t.isContentEditable) return;
	}
	if (!saddleUpPickActive.value) return;
	ev.preventDefault();
	cancelSaddleUpPick();
}

function bindEscapeKey() {
	if (escapeKeydownBound) return;
	window.addEventListener('keydown', onEscapeKey);
	escapeKeydownBound = true;
}

function unbindEscapeKey() {
	if (!escapeKeydownBound) return;
	window.removeEventListener('keydown', onEscapeKey);
	escapeKeydownBound = false;
}

function installGuards(store: ReturnType<typeof useGameStore>) {
	const pokerOk = (): boolean => {
		const G = store.G as WesternLegendsState;
		const pid = store.playerID;
		if (pid == null) return false;
		const p = G.players?.[pid];
		if (!p) return false;
		const phase = uiGamePhase(G, store.ctx?.phase);
		if (!store.isMyTurn || phase !== 'play') return false;
		if (p.needsStartTurnIncomeChoice === true) return false;
		if (p.needsTurnWeaponMountChoice === true) return false;
		if ((p.turnActions?.length ?? 0) >= maxDiscreteTurnSlotsForPlayer(p)) return false;
		if (G.fight != null) return false;
		if (G.saloonRound != null) return false;
		if (G.sheriffEncounter != null) return false;
		if (p.pendingCattleMarshalOrWanted) return false;
		if (p.pendingBanditBountyChoice) return false;
		if (G.saloonReveal != null) return false;
		const pr = G.prospectReveal;
		if (pr != null && pr.playerId === pid) return false;
		return true;
	};

	const handStillHasSaddleCard = (cardId: string | null): boolean => {
		if (cardId == null) return false;
		const pid = store.playerID;
		if (pid == null) return false;
		const p = (store.G as WesternLegendsState).players?.[pid];
		const h = p?.hand;
		if (!h) return false;
		return h.some(
			(c) =>
				!isCardHidden(c as Card) &&
				(c as VisibleCard).id === cardId &&
				actionBEffectKindForCardId((c as VisibleCard).id) === 'saddle_up',
		);
	};

	stopStaleWatch = watch(
		() => store.G,
		() => {
			if (!saddleUpPickActive.value) return;
			if (!pokerOk() || !store.isMyTurn) {
				cancelSaddleUpPick();
				return;
			}
			if (!handStillHasSaddleCard(saddleUpPickCardId.value)) {
				cancelSaddleUpPick();
			}
		},
		{ deep: true },
	);

	stopEscapeWatch = watch(
		saddleUpPickActive,
		(active) => {
			if (active) bindEscapeKey();
			else unbindEscapeKey();
		},
		{ immediate: true },
	);
}

function teardownGuards() {
	stopStaleWatch?.();
	stopStaleWatch = null;
	stopEscapeWatch?.();
	stopEscapeWatch = null;
	unbindEscapeKey();
}

export function startSaddleUpPick(cardId: string) {
	saddleUpPickCardId.value = cardId;
	saddleUpPickActive.value = true;
}

export function cancelSaddleUpPick() {
	saddleUpPickActive.value = false;
	saddleUpPickCardId.value = null;
}

export function clearSaddleUpPick() {
	cancelSaddleUpPick();
}

/** Call from `GameBoard` / `BoardMap` setup so stale + Escape behavior is registered once per app mount. */
export function useSaddleUpMapPick() {
	const store = useGameStore();

	consumerCount += 1;
	if (consumerCount === 1) {
		installGuards(store);
	}

	onScopeDispose(() => {
		consumerCount -= 1;
		if (consumerCount <= 0) {
			consumerCount = 0;
			cancelSaddleUpPick();
			teardownGuards();
		}
	});

	const pokerBSlotCtxOk = computed(() => {
		const G = store.G as WesternLegendsState;
		const pid = store.playerID;
		if (pid == null) return false;
		const p = G.players?.[pid];
		if (!p) return false;
		const phase = uiGamePhase(G, store.ctx?.phase);
		if (!store.isMyTurn || phase !== 'play') return false;
		if (p.needsStartTurnIncomeChoice === true) return false;
		if (p.needsTurnWeaponMountChoice === true) return false;
		if ((p.turnActions?.length ?? 0) >= maxDiscreteTurnSlotsForPlayer(p)) return false;
		if (G.fight != null) return false;
		if (G.saloonRound != null) return false;
		if (G.sheriffEncounter != null) return false;
		if (p.pendingCattleMarshalOrWanted) return false;
		if (p.pendingBanditBountyChoice) return false;
		if (G.saloonReveal != null) return false;
		const pr = G.prospectReveal;
		if (pr != null && pr.playerId === pid) return false;
		return true;
	});

	return {
		saddleUpPickActive,
		saddleUpPickCardId,
		pokerBSlotCtxOk,
		startSaddleUpPick,
		cancelSaddleUpPick,
		clearSaddleUpPick,
	};
}
