<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useGame, isCardHidden, type Card, type VisibleCard } from '@engine/client';
import PokerCard from './PokerCard.vue';
import type { WesternLegendsState } from '../logic/types';
import {
	GENERAL_STORE_MAX_MISC_ITEMS,
	GENERAL_STORE_PRICES,
	HEAL_COST_GOLD,
	MAX_PLAYER_GOLD,
	POKER_ANTE_GOLD,
	REVEL_GOLD_PER_LP,
	SALOON_HOUSE_ADDS_TO_POT,
	TURN_ACTION_LETTER,
	TURN_ACTION_RULEBOOK_LABEL,
	TURN_ACTIONS_PER_TURN,
	WORK_PAY_GOLD,
	START_TURN_INCOME_DRAW,
	START_TURN_INCOME_GOLD_ONLY,
	START_TURN_INCOME_SPLIT_DRAW,
	START_TURN_INCOME_SPLIT_GOLD,
} from '../logic/types';
import { STARTER_CHARACTER_BY_ID, characterCardBioUrl, characterCardFaceUrl, characterHasStartSpaceChoices } from '../logic/starterCharacters';
import { DEFAULT_MOVEMENT_POINTS } from '../map/boardGraph';
import { BOARD_SPACES_BY_ID, moveTargetLabel } from '../map/boardSpaces';
import { uiGamePhase } from '../logic/phaseUi';
import {
	ITEM_UPGRADE_BASE,
	MOUNT_ITEM_ID_SET,
	WEAPON_ITEM_ID_SET,
	generalStoreStockLineId,
	isMiscItemId,
	uniqueMountOptions,
	uniqueWeaponOptions,
} from '../logic/equipment';
import { maxPokerHandSize } from '../logic/player-hand';
import {
	GENERAL_STORE_BASE_ITEM_IDS,
	GENERAL_STORE_COPIES_PER_BASE_ITEM,
	ITEM_CARD_BY_ID,
} from '../data/itemCards';
import { IconCoin, IconMapPin, IconSparkles, IconStar, IconUser } from '@tabler/icons-vue';

const props = defineProps<{
	connectionOk: boolean;
	reconnecting: boolean;
	gameLoaded: boolean;
	/** True once setup() has run and the match is not over (not BGIO “isActive” / your turn). */
	matchRunning: boolean;
}>();

const { state, playerID, isMyTurn, move, ctx, currentPlayer } = useGame<WesternLegendsState>();

const G = computed(() => state.value);
const me = computed(() => {
	const pid = playerID.value;
	if (!pid) return undefined;
	return G.value.players?.[pid];
});
const gamePhase = computed(() => uiGamePhase(G.value as WesternLegendsState, ctx.value?.phase));
/** Draft UI whenever we’re not in `play` yet. */
const beforePlay = computed(() => gamePhase.value !== 'play');
/** This seat still owes a character pick (server sent two offers, no choice yet). */
const inCharacterDraft = computed(
	() =>
		me.value != null &&
		me.value.characterId == null &&
		me.value.characterOffers != null &&
		me.value.characterOffers.length === 2 &&
		beforePlay.value,
);

const saloonRound = computed(() => (G.value as WesternLegendsState).saloonRound ?? null);
const myPendingSaloonResponse = computed(() => {
	if (!playerID.value || !saloonRound.value) return false;
	return (saloonRound.value.pendingPlayerIds ?? []).includes(playerID.value);
});
const needSaloonTieBreakChoice = computed(() => {
	const r = saloonRound.value;
	if (!r) return false;
	return isMyTurn.value && (r.tieBreakCandidateIds ?? null) != null;
});

/** Offer index when the player picked a character that still needs a start-space choice (Wyatt). */
const draftExpandedOfferIndex = ref<number | null>(null);
watch(inCharacterDraft, (draft) => {
	if (!draft) draftExpandedOfferIndex.value = null;
});

function onCharacterOfferClick(idx: number) {
	const cid = me.value?.characterOffers?.[idx];
	if (cid == null) return;
	const def = STARTER_CHARACTER_BY_ID[cid];
	if (characterHasStartSpaceChoices(def)) {
		draftExpandedOfferIndex.value = idx;
		return;
	}
	move('chooseCharacter', idx);
}

function confirmDraftStartSpace(offerIdx: number, spaceId: string) {
	move('chooseCharacter', offerIdx, spaceId);
	draftExpandedOfferIndex.value = null;
}

/** Disambiguate e.g. three Red Falls General Store triplets (same display name). */
function draftSpaceChoiceLabel(spaceId: string): string {
	const s = BOARD_SPACES_BY_ID[spaceId];
	return `${moveTargetLabel(s)} (${spaceId})`;
}
const here = computed(() => (me.value ? BOARD_SPACES_BY_ID[me.value.locationId] : undefined));
const kind = computed(() => here.value?.actionKind ?? null);

/** Sidebar: POI name, or a short trail label (never hidden on blank hexes). */
const sidebarLocationLine = computed(() => {
	const h = here.value;
	if (!h) {
		const id = me.value?.locationId;
		if (id != null && id !== '') {
			return `Unknown space (${id}) - not on this board map; start a fresh match if the board was updated`;
		}
		return 'No location';
	}
	const named = h.name.trim();
	if (named.length > 0) return named;
	return `Trail · ${h.id}`;
});

const myCharacterName = computed(() => {
	const cid = me.value?.characterId;
	if (!cid) return '';
	return STARTER_CHARACTER_BY_ID[cid]?.name ?? cid;
});

const myLegendaryAction = computed(() => {
	const cid = me.value?.characterId;
	if (!cid) return '';
	const t = STARTER_CHARACTER_BY_ID[cid]?.legendaryAction?.trim();
	return t ?? '';
});

/**
 * Playing-card proportion (2.5×3.5); same frame in draft thumbnails and in-play header so art crops consistently.
 */
const CHARACTER_PORTRAIT_THUMB_CLASS =
	'flex w-[min(5.75rem,28vw)] shrink-0 aspect-[2.5/3.5] overflow-hidden border border-amber-800/40 bg-slate-950 shadow-sm items-center justify-center';

function characterPortraitUrl(characterId: string | null | undefined): string | undefined {
	if (!characterId) return undefined;
	const key = STARTER_CHARACTER_BY_ID[characterId]?.cardArtKey;
	if (!key) return undefined;
	return characterCardFaceUrl(key);
}

function characterBioCardUrl(characterId: string | null | undefined): string | undefined {
	if (!characterId) return undefined;
	const key = STARTER_CHARACTER_BY_ID[characterId]?.cardArtKey;
	if (!key) return undefined;
	return characterCardBioUrl(key);
}

/** Native tooltip: legendary action (matches printed card front). */
function characterDraftFrontTitle(characterId: string): string | undefined {
	const t = STARTER_CHARACTER_BY_ID[characterId]?.legendaryAction?.trim();
	return t ? t : undefined;
}

/** Native tooltip: starting equipment line (matches printed card back). */
function characterDraftBackTitle(characterId: string): string | undefined {
	const t = STARTER_CHARACTER_BY_ID[characterId]?.startingEquipment?.trim();
	return t ? t : undefined;
}

/** Rulebook: B/C/D (and first map move opening A) consume up to 3 slots per turn. */
const turnSlotsUsed = computed(() => me.value?.turnActions?.length ?? 0);
const canTakeDiscrete = computed(() => turnSlotsUsed.value < TURN_ACTIONS_PER_TURN);
const turnActionsSummary = computed(() => {
	const list = me.value?.turnActions;
	if (!list?.length) return '';
	return list.map((a) => `${TURN_ACTION_LETTER[a]} ${TURN_ACTION_RULEBOOK_LABEL[a]}`).join(' · ');
});

const revelTiers = [1, 2, 3, 4] as const;

const saloonPotGold = POKER_ANTE_GOLD + SALOON_HOUSE_ADDS_TO_POT;

const prospectMapRerollIndices = computed(() =>
	(me.value?.prospectMapRerollDice ?? []).map((_, i) => i),
);

const canUseProvisions = computed(
	() =>
		isMyTurn.value &&
		me.value != null &&
		gamePhase.value === 'play' &&
		!needsStartTurnIncomeChoice.value &&
		!needsTurnWeaponMountChoice.value &&
		(me.value.ownedMiscItemIds?.includes('provisions') ?? false) &&
		canTakeDiscrete.value,
);

const canUseWhiskeyReaction = computed(
	() =>
		isMyTurn.value &&
		me.value != null &&
		gamePhase.value === 'play' &&
		!needsStartTurnIncomeChoice.value &&
		!needsTurnWeaponMountChoice.value &&
		me.value.whiskeyReactionAvailable === true &&
		(me.value.ownedMiscItemIds?.includes('whiskey') ?? false) &&
		canTakeDiscrete.value &&
		othersHere.value.length > 0,
);

const storeCatalogIds = computed(() => {
	const upgradeIds = Object.keys(GENERAL_STORE_PRICES)
		.filter((id) => !GENERAL_STORE_BASE_ITEM_IDS.includes(id))
		.sort();
	return [...GENERAL_STORE_BASE_ITEM_IDS, ...upgradeIds];
});

function storeStockCount(itemId: string): number {
	const st = G.value as WesternLegendsState;
	const line = generalStoreStockLineId(itemId) ?? itemId;
	const raw = st?.generalStoreStock?.[line];
	if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
	return GENERAL_STORE_COPIES_PER_BASE_ITEM;
}

function storeBuyDisabled(itemId: string): boolean {
	if (!me.value || kind.value !== 'generalStore' || !canTakeDiscrete.value) return true;
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
		// Upgrades flip an owned copy; store line can be empty and you may still pay to flip.
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

const othersHere = computed(() => {
	const players = G.value.players;
	if (!playerID.value || !me.value || !players) return [];
	return Object.keys(players).filter((pid) => pid !== playerID.value && players[pid].locationId === me.value!.locationId);
});

function handCardKey(c: Card, i: number): string {
	return isCardHidden(c) ? `h-${i}` : (c as VisibleCard).id;
}

const panelClass = 'rounded-lg border border-slate-800 bg-slate-900/85 shadow backdrop-blur-sm';

/** Must pick turn income (+$20 / 2 cards / $10+1) before other moves. */
const needsStartTurnIncomeChoice = computed(() => me.value?.needsStartTurnIncomeChoice === true);

const needsTurnWeaponMountChoice = computed(() => me.value?.needsTurnWeaponMountChoice === true);

/** End-of-turn pass: discard down to this size (5 − wounds, + character modifiers). */
const maxPokerHandForMe = computed(() => (me.value ? maxPokerHandSize(me.value) : 0));
const passDiscardOver = computed(() => {
	if (!me.value) return 0;
	return Math.max(0, me.value.hand.length - maxPokerHandForMe.value);
});
const passDiscardSelectionMode = computed(
	() =>
		isMyTurn.value &&
		gamePhase.value === 'play' &&
		!needsStartTurnIncomeChoice.value &&
		!needsTurnWeaponMountChoice.value &&
		passDiscardOver.value > 0,
);
const passDiscardPickIds = ref<string[]>([]);
watch([isMyTurn, playerID, passDiscardOver, () => me.value?.hand.length], () => {
	passDiscardPickIds.value = [];
});

function togglePassDiscardForPass(cardId: string) {
	if (!passDiscardSelectionMode.value) return;
	const cap = passDiscardOver.value;
	const i = passDiscardPickIds.value.indexOf(cardId);
	if (i >= 0) {
		passDiscardPickIds.value = passDiscardPickIds.value.filter((_, j) => j !== i);
		return;
	}
	if (passDiscardPickIds.value.length >= cap) return;
	passDiscardPickIds.value = [...passDiscardPickIds.value, cardId];
}

const passEndTurnReady = computed(() => {
	if (!isMyTurn.value || gamePhase.value !== 'play') return false;
	if (needsStartTurnIncomeChoice.value || needsTurnWeaponMountChoice.value) return false;
	if (passDiscardOver.value > 0) return passDiscardPickIds.value.length === passDiscardOver.value;
	return true;
});

function submitPassEndTurn() {
	const over = passDiscardOver.value;
	if (over > 0) move('pass', [...passDiscardPickIds.value]);
	else move('pass');
}

const loadoutWeaponOptions = computed(() => uniqueWeaponOptions(me.value?.ownedWeaponItemIds));
const loadoutMountOptions = computed(() => uniqueMountOptions(me.value?.ownedMountItemIds));

const loadoutWeaponPick = ref<string | null>(null);
const loadoutMountPick = ref<string | null>(null);

watch(
	[needsTurnWeaponMountChoice, loadoutWeaponOptions, loadoutMountOptions],
	([need, wo, mo]) => {
		if (!need) return;
		loadoutWeaponPick.value = wo.length === 1 ? wo[0]! : null;
		loadoutMountPick.value = mo.length === 1 ? mo[0]! : null;
	},
	{ immediate: true },
);

function itemCardLabel(id: string | null | undefined): string {
	if (id == null || id === '') return 'None';
	return ITEM_CARD_BY_ID[id]?.name ?? id;
}

const loadoutReady = computed(() => {
	if (!needsTurnWeaponMountChoice.value) return false;
	const wo = loadoutWeaponOptions.value;
	const mo = loadoutMountOptions.value;
	const wOk =
		wo.length <= 1 || (loadoutWeaponPick.value != null && wo.includes(loadoutWeaponPick.value));
	const mOk =
		mo.length <= 1 || (loadoutMountPick.value != null && mo.includes(loadoutMountPick.value));
	return wOk && mOk;
});

function submitTurnLoadout() {
	const wo = loadoutWeaponOptions.value;
	const mo = loadoutMountOptions.value;
	const w = wo.length <= 1 ? wo[0] ?? null : loadoutWeaponPick.value;
	const m = mo.length <= 1 ? mo[0] ?? null : loadoutMountPick.value;
	move('chooseTurnWeaponMount', w, m);
}

const turnLoadoutSummary = computed(() => {
	if (!me.value || gamePhase.value !== 'play') return '';
	if (needsStartTurnIncomeChoice.value || needsTurnWeaponMountChoice.value) return '';
	const w = itemCardLabel(me.value.turnWeaponItemId);
	const m = itemCardLabel(me.value.turnMountItemId);
	return `${w} · ${m}`;
});

/**
 * Idle “waiting…” panel - hidden during draft because {@link inCharacterDraft} uses its own section
 * (pick buttons or “waiting for seat X”).
 */
const showTurnWait = computed(() => {
	if (!me.value) return true;
	if (inCharacterDraft.value) return false;
	if (isMyTurn.value && gamePhase.value === 'play') return false;
	return true;
});
</script>

<template>
	<div class="space-y-4">
		<section v-if="!props.connectionOk" :class="panelClass + ' p-4'">
			<h2 class="mb-2 text-sm font-medium text-slate-300">Connection</h2>
			<p class="text-sm text-slate-400">
				{{
					props.reconnecting
						? 'This browser has saved seat credentials for this match; we are waiting for the game server to respond. If nothing changes, the server at the URL below is likely not running, or VITE_SERVER_URL does not match that server’s host and port.'
						: 'Not connected yet. Check that the boardgame.io server is running and that VITE_SERVER_URL matches it (scheme, host, and port).'
				}}
			</p>
		</section>

		<section v-else-if="!props.gameLoaded" :class="panelClass + ' p-4'">
			<h2 class="mb-2 text-sm font-medium text-slate-300">Loading</h2>
			<p class="text-sm text-slate-400">Waiting for a full player state from the server…</p>
		</section>

		<section v-else-if="!props.matchRunning" :class="panelClass + ' p-4'">
			<h2 class="mb-2 text-sm font-medium text-slate-300">Match not running</h2>
			<p class="text-sm text-slate-400">
				Waiting for game state, or this match has ended. If you never left the lobby, finish joining there or wait for the host to start.
			</p>
		</section>

		<template v-else>
			<section
				v-if="me && G.legendGoal != null && gamePhase === 'play' && me.characterId != null"
				:class="
					panelClass +
					' flex min-w-0 items-start gap-2.5 border-amber-800/35 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-amber-950/20 p-3 ring-1 ring-amber-900/25'
				"
			>
				<div :class="CHARACTER_PORTRAIT_THUMB_CLASS">
					<img
						v-if="characterPortraitUrl(me.characterId)"
						:src="characterPortraitUrl(me.characterId)"
						alt=""
						class="pointer-events-none h-full w-full object-contain object-center"
					/>
					<div v-else class="flex h-full w-full items-center justify-center text-amber-300">
						<IconUser :size="22" stroke="2" aria-hidden="true" />
					</div>
				</div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-base font-semibold leading-tight text-slate-50">
						{{ myCharacterName }}
					</p>
					<p
						class="mt-1 flex min-w-0 items-start gap-1 text-xs leading-tight"
						:class="here ? 'items-center truncate text-slate-400' : 'text-amber-200/85'"
					>
						<IconMapPin :size="14" stroke="2" class="mt-0.5 shrink-0 text-amber-500/80" aria-hidden="true" />
						<span :class="here ? 'truncate' : ''">{{ sidebarLocationLine }}</span>
					</p>
					<div v-if="myLegendaryAction" class="mt-2 border-t border-amber-900/30 pt-2">
						<p class="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200/85">
							<IconSparkles :size="12" stroke="2" class="shrink-0 text-amber-400/90" aria-hidden="true" />
							Legendary action
						</p>
						<p class="text-xs leading-snug text-slate-300">
							{{ myLegendaryAction }}
						</p>
					</div>
				</div>
			</section>

			<section v-if="me && inCharacterDraft" :class="panelClass + ' border-amber-900/30 p-4 ring-1 ring-amber-900/20'">
				<h3 class="mb-1 text-sm font-medium text-amber-100/95">Choose your character</h3>
				<p class="mb-3 text-xs text-slate-500">
					Each offer shows the character card front (ability) and back (starting gear / flavor). Pick one - that sets where you start on the
					map. If your figure has a starting location choice, confirm it in the next step. Poker cards stay hidden until play begins.
				</p>
				<p v-if="!isMyTurn" class="mb-3 text-sm text-slate-400">
					Waiting for player {{ currentPlayer }} to choose. You’ll pick when it’s your turn.
				</p>
				<div v-else class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
					<div v-for="(cid, idx) in me.characterOffers" :key="cid" class="flex max-w-full flex-col gap-2 sm:max-w-[min(100%,20rem)]">
						<button
							type="button"
							class="flex w-full items-stretch gap-3 rounded-lg border border-amber-700/55 bg-amber-950/45 px-3 py-2 text-left text-sm text-amber-50 hover:bg-amber-900/45"
							:class="draftExpandedOfferIndex === idx ? 'ring-2 ring-amber-400/60' : ''"
							@click="onCharacterOfferClick(idx)"
						>
							<div v-if="characterPortraitUrl(cid) != null || characterBioCardUrl(cid) != null" class="flex shrink-0 gap-2">
								<div v-if="characterPortraitUrl(cid) != null" class="flex flex-col items-center gap-0.5">
									<span class="text-[10px] font-medium uppercase tracking-wide text-amber-200/80">Front</span>
									<div :class="CHARACTER_PORTRAIT_THUMB_CLASS + ' cursor-help'" :title="characterDraftFrontTitle(cid)">
										<img
											:src="characterPortraitUrl(cid) as string"
											alt=""
											class="pointer-events-none h-full w-full object-contain object-center"
										/>
									</div>
								</div>
								<div v-if="characterBioCardUrl(cid) != null" class="flex flex-col items-center gap-0.5">
									<span class="text-[10px] font-medium uppercase tracking-wide text-amber-200/80">Back</span>
									<div :class="CHARACTER_PORTRAIT_THUMB_CLASS + ' cursor-help'" :title="characterDraftBackTitle(cid)">
										<img
											:src="characterBioCardUrl(cid) as string"
											alt=""
											class="pointer-events-none h-full w-full object-contain object-center"
										/>
									</div>
								</div>
							</div>
							<div
								v-else
								class="flex aspect-[2.5/3.5] w-[min(5.75rem,28vw)] shrink-0 items-center justify-center border border-amber-800/40 bg-slate-950/80"
							>
								<IconUser :size="28" stroke="2" class="text-amber-500/60" aria-hidden="true" />
							</div>
							<div class="min-w-0 flex-1 py-1">
								<span class="font-semibold">{{ STARTER_CHARACTER_BY_ID[cid]?.name ?? cid }}</span>
								<span class="mt-0.5 block text-xs text-amber-200/75">
									<template v-if="characterHasStartSpaceChoices(STARTER_CHARACTER_BY_ID[cid])">
										Starts: choose your exact hex below
									</template>
									<template v-else>
										Starts:
										{{ moveTargetLabel(BOARD_SPACES_BY_ID[STARTER_CHARACTER_BY_ID[cid]?.startSpaceId ?? '']) }}
									</template>
								</span>
							</div>
						</button>
						<div
							v-if="draftExpandedOfferIndex === idx && characterHasStartSpaceChoices(STARTER_CHARACTER_BY_ID[cid])"
							class="flex flex-wrap gap-2 rounded-md border border-amber-800/50 bg-slate-950/80 px-2 py-2"
						>
							<span class="w-full text-xs text-slate-400">Starting space</span>
							<button
								v-for="sid in STARTER_CHARACTER_BY_ID[cid]!.startSpaceChoices"
								:key="sid"
								type="button"
								class="rounded border border-amber-700/50 bg-amber-950/60 px-2.5 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-900/50"
								@click="confirmDraftStartSpace(idx, sid)"
							>
								{{ draftSpaceChoiceLabel(sid) }}
							</button>
						</div>
					</div>
				</div>
			</section>

			<section v-if="me && gamePhase === 'play'" :class="panelClass + ' p-4'">
				<p class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
					<span class="inline-flex items-center gap-1.5">
						<IconStar :size="16" class="shrink-0 text-amber-400/90" aria-hidden="true" />
						Goal <strong class="tabular-nums text-amber-100">{{ G.legendGoal }}</strong>
					</span>
					<span class="inline-flex items-center gap-1.5">
						<IconStar :size="16" class="shrink-0 text-teal-400/85" aria-hidden="true" />
						Your LP <strong class="tabular-nums text-teal-100">{{ me.legendaryPoints }}</strong>
					</span>
				</p>
				<h3 class="mb-2 text-sm font-medium text-slate-300">Your hand</h3>
				<p class="mb-2 text-xs text-slate-500">
					Max <strong class="tabular-nums text-slate-300">{{ maxPokerHandForMe }}</strong> poker cards
					<span v-if="passDiscardSelectionMode" class="block mt-1 text-amber-200/90">
						End turn: tap {{ passDiscardOver }} card(s) to discard, then Pass.
					</span>
				</p>
				<p v-if="turnLoadoutSummary" class="mb-2 text-xs text-slate-500">
					This turn — weapon / mount:
					<span class="font-medium text-slate-300">{{ turnLoadoutSummary }}</span>
				</p>
				<ul class="flex flex-wrap items-end justify-start gap-2 sm:gap-2.5" role="list">
					<li
						v-for="(c, i) in me.hand"
						:key="handCardKey(c as Card, i)"
						class="list-none"
						:class="passDiscardSelectionMode && !isCardHidden(c as Card) ? 'cursor-pointer' : ''"
						@click="
						!isCardHidden(c as Card) && togglePassDiscardForPass((c as VisibleCard).id)
						"
					>
						<div
							class="rounded-md transition-[box-shadow]"
							:class="
								!isCardHidden(c as Card) && passDiscardPickIds.includes((c as VisibleCard).id)
									? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950'
									: ''
							"
						>
							<PokerCard :card="c as Card" />
						</div>
					</li>
				</ul>
				<p class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
					<span class="inline-flex items-center gap-1.5">
						<IconCoin :size="16" class="text-amber-400/90" aria-hidden="true" />
						<strong class="tabular-nums text-amber-200">{{ me.gold }}</strong>
						<span class="text-slate-500">/ {{ MAX_PLAYER_GOLD }} gold</span>
					</span>
					<span class="text-slate-600">·</span>
					<span
						>Wounds <strong class="text-slate-200">{{ me.wounds }}</strong></span
					>
					<span class="text-slate-600">·</span>
					<span
						>Nuggets <strong class="text-slate-200">{{ me.nuggets }}</strong></span
					>
					<span class="text-slate-600">·</span>
					<span
						>Wanted <strong class="text-slate-200">{{ me.wantedPoints }}</strong></span
					>
					<span class="text-slate-600">·</span>
					<span
						>Marshal <strong class="tabular-nums text-slate-200">{{ me.marshalPoints ?? 0 }}</strong></span
					>
					<span class="text-slate-600">·</span>
					<span
						>Cattle
						<strong class="text-slate-200">{{
							me.carriedCattle == null ? 'none' : me.carriedCattle === 'green' ? 'Green' : 'Blue'
						}}</strong></span
					>
					<span class="text-slate-600">·</span>
					<span>
						Move MP
						<strong class="text-slate-200">{{
							Number.isFinite(me.movementPointsLeft) ? me.movementPointsLeft : DEFAULT_MOVEMENT_POINTS
						}}</strong>
						/ {{ DEFAULT_MOVEMENT_POINTS }}
					</span>
				</p>
				<p v-if="(me.ownedMiscItemIds?.length ?? 0) > 0" class="mt-2 text-xs text-slate-500">
					Misc ({{ me.ownedMiscItemIds?.length ?? 0 }}/{{ GENERAL_STORE_MAX_MISC_ITEMS }}):
					<span class="text-slate-300">{{ (me.ownedMiscItemIds ?? []).map((id) => itemCardLabel(id)).join(', ') }}</span>
				</p>
			</section>

			<section
				v-if="gamePhase === 'play' && myPendingSaloonResponse"
				:class="panelClass + ' border-amber-900/40 p-4 ring-1 ring-amber-900/25'"
			>
				<h3 class="mb-1 text-sm font-medium text-amber-200">Saloon poker</h3>
				<p class="mb-3 text-xs text-slate-500">You’re in the same town. Pay {{ POKER_ANTE_GOLD }}g to join and draw 1 card.</p>
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class="rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-900/35 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="me == null || me.gold < POKER_ANTE_GOLD"
						@click="move('joinSaloon')"
					>
						Join (−{{ POKER_ANTE_GOLD }}g, draw 1)
					</button>
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
						@click="move('skipSaloon')"
					>
						Skip
					</button>
				</div>
			</section>

			<section
				v-if="isMyTurn && me && gamePhase === 'play' && needsStartTurnIncomeChoice"
				:class="panelClass + ' border-teal-900/40 p-4 ring-1 ring-teal-900/25'"
			>
				<h3 class="mb-1 text-sm font-medium text-teal-200">Turn income</h3>
				<p class="mb-3 text-xs text-slate-500">
					After start-of-turn effects, choose one option for this turn.
				</p>
				<div class="flex flex-col gap-2">
					<button
						type="button"
						class="rounded-lg border border-teal-700/50 bg-teal-950/40 px-3 py-2 text-left text-sm text-teal-50 hover:bg-teal-900/40"
						@click="move('chooseStartTurnIncome', 'gold20')"
					>
						Gain ${{ START_TURN_INCOME_GOLD_ONLY }}
					</button>
					<button
						type="button"
						class="rounded-lg border border-teal-700/50 bg-teal-950/40 px-3 py-2 text-left text-sm text-teal-50 hover:bg-teal-900/40"
						@click="move('chooseStartTurnIncome', 'draw2')"
					>
						Draw {{ START_TURN_INCOME_DRAW }} poker cards
					</button>
					<button
						type="button"
						class="rounded-lg border border-teal-700/50 bg-teal-950/40 px-3 py-2 text-left text-sm text-teal-50 hover:bg-teal-900/40"
						@click="move('chooseStartTurnIncome', 'gold10draw1')"
					>
						Gain ${{ START_TURN_INCOME_SPLIT_GOLD }} and draw {{ START_TURN_INCOME_SPLIT_DRAW }} poker card
					</button>
				</div>
			</section>

			<section
				v-if="isMyTurn && me && gamePhase === 'play' && needsTurnWeaponMountChoice"
				:class="panelClass + ' border-violet-900/40 p-4 ring-1 ring-violet-900/25'"
			>
				<h3 class="mb-1 text-sm font-medium text-violet-200">Weapon &amp; mount</h3>
				<p class="mb-3 text-xs text-slate-500">
					Choose what you are using this turn. (Skipped when you own at most one weapon and at most one mount.)
				</p>
				<div class="mb-3 space-y-2">
					<div v-if="loadoutWeaponOptions.length > 1">
						<p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-200/85">Weapon</p>
						<div class="flex flex-wrap gap-2">
							<button
								v-for="id in loadoutWeaponOptions"
								:key="'w-' + id"
								type="button"
								class="rounded-lg border px-2.5 py-1.5 text-xs"
								:class="
									loadoutWeaponPick === id
										? 'border-violet-400/70 bg-violet-950/50 text-violet-50'
										: 'border-violet-800/50 bg-slate-900/80 text-slate-300 hover:bg-slate-800/80'
								"
								@click="loadoutWeaponPick = id"
							>
								{{ itemCardLabel(id) }}
							</button>
						</div>
					</div>
					<div v-else class="text-xs text-slate-400">
						<span class="font-medium text-slate-500">Weapon:</span>
						{{ loadoutWeaponOptions.length === 1 ? itemCardLabel(loadoutWeaponOptions[0]) : 'None' }}
					</div>
					<div v-if="loadoutMountOptions.length > 1">
						<p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-200/85">Mount</p>
						<div class="flex flex-wrap gap-2">
							<button
								v-for="id in loadoutMountOptions"
								:key="'m-' + id"
								type="button"
								class="rounded-lg border px-2.5 py-1.5 text-xs"
								:class="
									loadoutMountPick === id
										? 'border-violet-400/70 bg-violet-950/50 text-violet-50'
										: 'border-violet-800/50 bg-slate-900/80 text-slate-300 hover:bg-slate-800/80'
								"
								@click="loadoutMountPick = id"
							>
								{{ itemCardLabel(id) }}
							</button>
						</div>
					</div>
					<div v-else class="text-xs text-slate-400">
						<span class="font-medium text-slate-500">Mount:</span>
						{{ loadoutMountOptions.length === 1 ? itemCardLabel(loadoutMountOptions[0]) : 'None' }}
					</div>
				</div>
				<button
					type="button"
					class="w-full rounded-lg border border-violet-600/60 bg-violet-950/45 px-3 py-2 text-sm font-medium text-violet-50 hover:bg-violet-900/40 disabled:cursor-not-allowed disabled:opacity-40"
					:disabled="!loadoutReady"
					@click="submitTurnLoadout"
				>
					Confirm loadout
				</button>
			</section>

			<section
				v-if="isMyTurn && me && gamePhase === 'play' && !needsStartTurnIncomeChoice && !needsTurnWeaponMountChoice"
				:class="panelClass + ' p-4'"
			>
				<h3 class="mb-1 text-sm font-medium text-slate-300">Actions</h3>
				<div class="mb-3 rounded-md border border-slate-700/80 bg-slate-900/50 px-3 py-2 text-xs text-slate-400">
					<p class="font-medium text-slate-300">This turn - {{ turnSlotsUsed }}/{{ TURN_ACTIONS_PER_TURN }} actions</p>
					<p class="mt-1 text-slate-500">
						A Move · B Card · C Fight · D Location (Work and location buttons count as D). Same action can repeat unless a rule says
						otherwise.
					</p>
					<p v-if="turnActionsSummary" class="mt-1.5 text-slate-200">{{ turnActionsSummary }}</p>
					<p v-else class="mt-1.5 italic text-slate-500">None resolved yet.</p>
				</div>
				<p class="mb-3 text-xs text-slate-500">
					Movement is only on the board - click a green-highlighted space (uses A once, then any distance until MP runs out).
				</p>
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="!passEndTurnReady"
						@click="submitPassEndTurn"
					>
						Pass (end turn)
					</button>
					<button
						type="button"
						class="rounded-lg border border-violet-800/45 bg-violet-950/35 px-3 py-1.5 text-sm text-violet-100 hover:bg-violet-900/35 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="!canTakeDiscrete"
						@click="move('useCardAction')"
					>
						B - Use card (stub)
					</button>
					<button
						v-for="idx in prospectMapRerollIndices"
						:key="'map-reroll-' + idx"
						type="button"
						class="rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-900/35 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="!canTakeDiscrete || !(me?.ownedMiscItemIds?.includes('map') ?? false)"
						@click="move('minerMapRerollProspect', idx)"
					>
						B - Miner's Map: reroll die {{ idx + 1 }}
					</button>
					<button
						type="button"
						class="rounded-lg border border-emerald-800/50 bg-emerald-950/40 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-900/35 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="!canUseProvisions"
						@click="move('useProvisions')"
					>
						B - Provisions (discard: draw 1, −1 wound)
					</button>
					<template v-if="canUseWhiskeyReaction">
						<span class="w-full basis-full text-[11px] text-amber-200/90">B — Whiskey (after move, same space)</span>
						<button
							v-for="pid in othersHere"
							:key="'whiskey-' + pid"
							type="button"
							class="rounded-lg border border-amber-900/55 bg-amber-950/45 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-900/40"
							@click="move('useWhiskeyReaction', pid)"
						>
							Discard Whiskey → +1 wound to {{ pid }}
						</button>
					</template>
					<button
						type="button"
						class="rounded-lg border border-emerald-800/50 bg-emerald-950/40 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-900/35 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="kind == null || !canTakeDiscrete"
						@click="move('workForPay')"
					>
						D - Work (+{{ WORK_PAY_GOLD }} gold)
					</button>
					<template v-if="kind === 'generalStore'">
						<div class="w-full basis-full rounded-md border border-slate-700/80 bg-slate-900/40 px-2 py-2">
							<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">General Store</p>
							<div class="flex flex-wrap gap-1.5">
								<button
									v-for="id in storeCatalogIds"
									:key="'store-' + id"
									type="button"
									class="rounded border border-slate-600 bg-slate-800/90 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
									:disabled="storeBuyDisabled(id)"
									@click="move('buyFromGeneralStore', id)"
								>
									{{ itemCardLabel(id) }} -{{ GENERAL_STORE_PRICES[id] }}g<span
										v-if="generalStoreStockLineId(id) != null"
										class="text-slate-500"
									>
										· ×{{ storeStockCount(id) }}</span>
								</button>
							</div>
						</div>
					</template>
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="kind !== 'playPoker' || me.gold < POKER_ANTE_GOLD || !canTakeDiscrete"
						@click="move('startSaloon')"
					>
						Saloon (-{{ POKER_ANTE_GOLD }}g ante, win {{ saloonPotGold }}g +1 LP)
					</button>
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="kind !== 'prospectGold' || !canTakeDiscrete"
						@click="move('prospectForGold')"
					>
						Mine (prospect, dice stub)
					</button>
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="kind !== 'bank' || me.nuggets < 1 || !canTakeDiscrete"
						@click="move('depositNuggets')"
					>
						Deposit nuggets (all)
					</button>
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="kind !== 'bank' || me.usedHeistThisTurn || !canTakeDiscrete"
						@click="move('heist')"
					>
						Heist (1/turn, 3-card vs clockwise guard)
					</button>
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="kind !== 'doctor' || me.wounds < 1 || me.gold < HEAL_COST_GOLD || !canTakeDiscrete"
						@click="move('heal')"
					>
						Doctor's Office (−{{ HEAL_COST_GOLD }}g, clear wounds)
					</button>
					<button
						v-for="t in revelTiers"
						:key="t"
						type="button"
						class="rounded-lg border border-amber-800/55 bg-amber-950/35 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-900/35 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="kind !== 'cabaret' || me.gold < t * REVEL_GOLD_PER_LP || !canTakeDiscrete"
						@click="move('revel', t)"
					>
						Cabaret - Revel (−{{ t * REVEL_GOLD_PER_LP }}g, +{{ t }} LP)
					</button>
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="kind !== 'ranch' || !canTakeDiscrete"
						@click="move('acquireCattle')"
					>
						Ranch (pick up / deliver)
					</button>
				</div>
				<div v-if="needSaloonTieBreakChoice && saloonRound?.tieBreakCandidateIds?.length" class="mt-3 rounded-md border border-amber-900/35 bg-amber-950/20 px-3 py-2">
					<p class="text-xs font-medium text-amber-200">Saloon tie-break</p>
					<p class="mt-1 text-xs text-slate-400">Pick the winner among tied best hands.</p>
					<div class="mt-2 flex flex-wrap gap-2">
						<button
							v-for="pid in saloonRound.tieBreakCandidateIds"
							:key="'tie-' + pid"
							type="button"
							class="rounded border border-amber-700/50 bg-amber-950/40 px-2.5 py-1.5 text-xs text-amber-100 hover:bg-amber-900/35"
							@click="move('chooseSaloonWinner', pid)"
						>
							{{ pid }}
						</button>
					</div>
				</div>
				<div v-if="othersHere.length" class="mt-3">
					<p class="mb-2 text-xs text-slate-500">C - Fight another player (duel stub)</p>
					<div class="flex flex-wrap gap-2">
						<button
							v-for="pid in othersHere"
							:key="pid"
							type="button"
							class="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-40"
							:disabled="!canTakeDiscrete"
							@click="move('duelAtLocation', pid)"
						>
							vs {{ pid }}
						</button>
					</div>
				</div>
			</section>

			<section v-else-if="showTurnWait" :class="panelClass + ' p-4 text-center text-sm text-slate-500'">
				<template v-if="beforePlay && me?.characterId != null"> Waiting for other players to finish choosing a character… </template>
				<template v-else>Waiting for your turn…</template>
			</section>

			<section v-if="G.gameLog?.length" :class="panelClass + ' p-4'">
				<h3 class="mb-2 text-sm font-medium text-slate-400">Trail</h3>
				<ul class="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-500">
					<li v-for="(e, i) in G.gameLog.slice(-14)" :key="i">{{ e.message }}</li>
				</ul>
			</section>
		</template>
	</div>
</template>
