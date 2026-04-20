<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useGame, isCardHidden, type Card, type StandardCard, type VisibleCard } from '@engine/client';
import PokerCard from './PokerCard.vue';
import type { WesternLegendsPlayer, WesternLegendsState } from '../logic/types';
import { MAN_IN_BLACK_FIGHT_DEFENDER_ID } from '../logic/types';
import {
	GENERAL_STORE_MAX_MISC_ITEMS,
	HEAL_COST_GOLD,
	MAX_PLAYER_GOLD,
	POKER_ANTE_GOLD,
	REVEL_GOLD_PER_LP,
	SALOON_HOUSE_ADDS_TO_POT,
	TURN_ACTION_RULEBOOK_LABEL,
	maxDiscreteTurnSlotsForPlayer,
	CATTLE_TOKEN_FACE_LABELS,
	isLivingLegendCardId,
	WORK_PAY_GOLD,
	START_TURN_INCOME_DRAW,
	START_TURN_INCOME_GOLD_ONLY,
	START_TURN_INCOME_SPLIT_DRAW,
	START_TURN_INCOME_SPLIT_GOLD,
} from '../logic/types';
import { STARTER_CHARACTER_BY_ID, characterCardBioUrl, characterCardFaceUrl, characterHasStartSpaceChoices } from '../logic/starterCharacters';
import { DEFAULT_MOVEMENT_POINTS } from '../map/boardGraph';
import { movementPointsForEquippedMount } from '../logic/movementCap';
import { BOARD_SPACES_BY_ID, moveTargetLabel } from '../map/boardSpaces';
import { getShortestPathLength } from '../map/boardGraph';
import { rankOrder } from '../logic/poker';
import { actionBEffectKindForCardId } from '../logic/pokerCardEffects';
import { uiGamePhase } from '../logic/phaseUi';
import { uniqueMountOptions, uniqueWeaponOptions } from '../logic/equipment';
import { maxPokerHandSize } from '../logic/player-hand';
import { ITEM_CARD_BY_ID } from '../data/itemCards';
import { getPokerCardAbilityLines } from '../data/pokerCardAbilities';
import { IconCards, IconCheck, IconCoin, IconMapPin, IconSortAscending, IconSparkles, IconStar, IconTrash, IconUser } from '@tabler/icons-vue';
import { generalStoreStripOpen, requestGeneralStoreStripOpen } from '../composables/generalStoreStrip';
import { useHandTrayPeek } from '../composables/useHandTrayPeek';
import { useSaddleUpMapPick } from '../composables/useSaddleUpMapPick';

const props = defineProps<{
	connectionOk: boolean;
	reconnecting: boolean;
	gameLoaded: boolean;
	/** True once setup() has run and the match is not over (not BGIO “isActive” / your turn). */
	matchRunning: boolean;
}>();

const { state, playerID, isMyTurn, move, ctx, currentPlayer, canUndo, undo } = useGame<WesternLegendsState>();
const { handTrayRetracted, toggleHandTrayPeek } = useHandTrayPeek();

/** Client-only: show hand in rank order 2→A (does not change server order or card ids). */
const handTraySortLowToHigh = ref(false);

function isStdPokerHandCard(c: Card): c is StandardCard {
	return !isCardHidden(c) && typeof (c as VisibleCard).rank === 'string' && typeof (c as VisibleCard).suit === 'string';
}

function sortHandDisplayLowToHigh(hand: readonly Card[]): Card[] {
	const suitOrder: Record<string, number> = { clubs: 1, diamonds: 2, hearts: 3, spades: 4 };
	const tagged = hand.map((c, origIdx) => ({ c, origIdx }));
	tagged.sort((a, b) => {
		const ha = isCardHidden(a.c);
		const hb = isCardHidden(b.c);
		if (ha && hb) return a.origIdx - b.origIdx;
		if (ha) return 1;
		if (hb) return -1;
		const sa = isStdPokerHandCard(a.c);
		const sb = isStdPokerHandCard(b.c);
		if (!sa && !sb) return a.origIdx - b.origIdx;
		if (!sa) return 1;
		if (!sb) return -1;
		const ac = a.c as StandardCard;
		const bc = b.c as StandardCard;
		const ra = rankOrder(ac.rank) - rankOrder(bc.rank);
		if (ra !== 0) return ra;
		return (suitOrder[ac.suit] ?? 0) - (suitOrder[bc.suit] ?? 0);
	});
	return tagged.map((t) => t.c);
}

const handForTrayDisplay = computed((): Card[] => {
	const h = me.value?.hand;
	if (!h?.length) return [];
	if (!handTraySortLowToHigh.value) return h;
	return sortHandDisplayLowToHigh(h);
});

function toggleHandTraySort(): void {
	handTraySortLowToHigh.value = !handTraySortLowToHigh.value;
}
const { saddleUpPickActive, startSaddleUpPick, cancelSaddleUpPick } = useSaddleUpMapPick();

const seatPlayerId = computed(() => playerID.value ?? null);

const G = computed(() => state.value);
const activeFight = computed(() => (G.value as WesternLegendsState | undefined)?.fight ?? null);
const activeSheriffEncounter = computed(() => (G.value as WesternLegendsState | undefined)?.sheriffEncounter ?? null);
const activeSaloonRound = computed(() => (G.value as WesternLegendsState | undefined)?.saloonRound ?? null);
const me = computed(() => {
	const pid = playerID.value;
	if (!pid) return undefined;
	return G.value.players?.[pid];
});

/** Turn movement budget from equipped mount (matches server / BoardMap), not foot-only default. */
const movementBudgetMax = computed(() => (me.value != null ? movementPointsForEquippedMount(me.value) : DEFAULT_MOVEMENT_POINTS));
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

/** Rulebook: each A/B/C/D action consumes one slot (3 base; Determination / cattle can add more). */
const turnSlotsUsed = computed(() => me.value?.turnActions?.length ?? 0);
const turnSlotsMax = computed(() => maxDiscreteTurnSlotsForPlayer(me.value));
const canTakeDiscrete = computed(() => turnSlotsUsed.value < turnSlotsMax.value);
/** At most one PvP fight (arrest / duel / rob) per turn; matches server `startFight` + `turnActions`. */
const hasUsedFightThisTurn = computed(() => me.value?.turnActions?.includes('fight') ?? false);
/** After a location action (mine, saloon, work, store, …), undo is not offered for this turn. */
const hasUsedLocationActionThisTurn = computed(() => me.value?.turnActions?.includes('location') ?? false);
/**
 * Server rejects B-slot card moves (and similar) during fights, Saloon rounds, sheriff encounters, etc.
 * Align sidebar + hand-tray affordances with {@link validateMove} so players do not hit INVALID_MOVE.
 */
const pokerBSlotCtxOk = computed(() => {
	const p = me.value;
	if (!isMyTurn.value || p == null || gamePhase.value !== 'play') return false;
	if (p.needsStartTurnIncomeChoice === true) return false;
	if (p.needsTurnWeaponMountChoice === true) return false;
	if (turnSlotsUsed.value >= turnSlotsMax.value) return false;
	if (activeFight.value != null) return false;
	if (activeSaloonRound.value != null) return false;
	if (activeSheriffEncounter.value != null) return false;
	if ((G.value as WesternLegendsState)?.manInBlackPending != null) return false;
	if (p.pendingCattleMarshalOrWanted) return false;
	if (p.pendingBanditBountyChoice) return false;
	if ((G.value as WesternLegendsState)?.saloonReveal != null) return false;
	const pr = (G.value as WesternLegendsState)?.prospectReveal;
	const pid = playerID.value;
	if (pr != null && pid != null && pr.playerId === pid) return false;
	return true;
});
const turnActionsSummary = computed(() => {
	const list = me.value?.turnActions;
	if (!list?.length) return '';
	return list.map((a) => TURN_ACTION_RULEBOOK_LABEL[a]).join(' · ');
});

const revelTiers = [1, 2, 3, 4] as const;

const saloonPotGold = POKER_ANTE_GOLD + SALOON_HOUSE_ADDS_TO_POT;

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

const livingLegendCardId = computed(() => {
	const h = me.value?.hand;
	if (!h) return null;
	const c = h.find((x) => !isCardHidden(x as Card) && isLivingLegendCardId((x as VisibleCard).id)) as VisibleCard | undefined;
	return c?.id ?? null;
});

/** B slot: Living Legend (any Ace) — server enforces once per turn. */
const canPlayLivingLegendCard = computed(
	() => pokerBSlotCtxOk.value && me.value!.usedLivingLegendThisTurn !== true && livingLegendCardId.value != null,
);

const reputationSevenCardId = computed(() => {
	const h = me.value?.hand;
	if (!h) return null;
	const c = h.find((x) => !isCardHidden(x as Card) && (x as VisibleCard).id.startsWith('7-')) as VisibleCard | undefined;
	return c?.id ?? null;
});

const canPlayReputationSeven = computed(
	() =>
		pokerBSlotCtxOk.value &&
		me.value!.pendingReputationSevenReaction === true &&
		me.value!.usedReputationSevenThisTurn !== true &&
		reputationSevenCardId.value != null,
);

const sprintCardId = computed(() => {
	const h = me.value?.hand;
	if (!h) return null;
	const c = h.find((x) => !isCardHidden(x as Card) && (x as VisibleCard).id.startsWith('3-')) as VisibleCard | undefined;
	return c?.id ?? null;
});

const canPlaySprint = computed(() => pokerBSlotCtxOk.value && me.value!.pendingSprintAfterMove === true && sprintCardId.value != null);

const wallopCardId = computed(() => {
	const h = me.value?.hand;
	if (!h) return null;
	const c = h.find((x) => !isCardHidden(x as Card) && ((x as VisibleCard).id === '8-clubs' || (x as VisibleCard).id === '8-spades')) as
		| VisibleCard
		| undefined;
	return c?.id ?? null;
});

const canPlayWallop = computed(
	() => pokerBSlotCtxOk.value && me.value!.pendingWallopAfterMove === true && wallopCardId.value != null && othersHere.value.length > 0,
);

function firstHandCardIdForActionKind(kind: ReturnType<typeof actionBEffectKindForCardId>): string | null {
	const h = me.value?.hand;
	if (!h) return null;
	for (const x of h) {
		if (isCardHidden(x as Card)) continue;
		const id = (x as VisibleCard).id;
		if (actionBEffectKindForCardId(id) === kind) return id;
	}
	return null;
}

const paydayCardId = computed(() => firstHandCardIdForActionKind('payday'));
const determinationCardId = computed(() => firstHandCardIdForActionKind('determination'));
const instinctsCardId = computed(() => firstHandCardIdForActionKind('instincts_draw_three'));
const saddleUpCardId = computed(() => firstHandCardIdForActionKind('saddle_up'));
const manhuntCardId = computed(() => firstHandCardIdForActionKind('manhunt'));

const manhuntDestinationIds = computed(() => {
	const sh = G.value.boardNpcs?.find((n) => n.kind === 'sheriff')?.spaceId;
	if (sh == null) return [];
	return Object.keys(BOARD_SPACES_BY_ID).filter((id) => {
		const d = getShortestPathLength(BOARD_SPACES_BY_ID, sh, id);
		return d != null && d >= 1 && d <= 3;
	});
});

const canUseWhiskeyReaction = computed(
	() =>
		pokerBSlotCtxOk.value &&
		me.value!.whiskeyReactionAvailable === true &&
		(me.value!.ownedMiscItemIds?.includes('whiskey') ?? false) &&
		othersHere.value.length > 0,
);

const othersHere = computed(() => {
	const players = G.value.players;
	if (!playerID.value || !me.value || !players) return [];
	return Object.keys(players).filter((pid) => pid !== playerID.value && players[pid].locationId === me.value!.locationId);
});

/** Man in Black (2P variant): same map space as your posse member figure. */
const manInBlackSharesSpace = computed(() => {
	const g = G.value as WesternLegendsState;
	if (!g.manInBlackVariant || g.manInBlack == null || me.value == null) return false;
	return me.value.locationId === g.manInBlack.locationId;
});

const manInBlackPendingState = computed(() => (G.value as WesternLegendsState)?.manInBlackPending ?? null);

/** Shown at top of MIB panel — the deck card that was drawn (`mib-01`…`mib-10`; cabaret flow has no single id here). */
const mibPendingCardIdDisplay = computed(() => {
	const p = manInBlackPendingState.value;
	if (!p || p.kind === 'cabaretProxyPick') return null;
	return p.mibCardId;
});

function characterShortNameForPlayerId(pid: string): string {
	const pl = G.value.players?.[pid];
	const cid = pl?.characterId;
	if (cid) return STARTER_CHARACTER_BY_ID[cid]?.name?.trim() || cid;
	return `Seat ${pid}`;
}

/** Discard-both cards (mib-08 / mib-09): first player in play order discards, then the other — explains “waiting” for the second seat. */
const mibDiscardBothStatusLine = computed((): string | null => {
	const p = manInBlackPendingState.value;
	const sid = seatPlayerId.value;
	if (!p || p.kind !== 'discardBoth' || sid == null) return null;
	if (p.awaitingPlayerId === sid) return null;
	const who = characterShortNameForPlayerId(p.awaitingPlayerId);
	return `Drawn MIB card: ${p.mibCardId}. Both players discard one visible poker card, in turn order. ${who} is up now — you’ll be prompted when it’s your turn.`;
});

/** You’re the seat that must resolve MIB (pending state — does not rely on activePlayers stage sync). */
const mibIsDiscardActor = computed(() => {
	const p = manInBlackPendingState.value;
	const sid = seatPlayerId.value;
	if (!p || p.kind !== 'discardBoth' || sid == null) return false;
	return p.awaitingPlayerId === sid;
});
const mibIsInteractionActor = computed(() => {
	const p = manInBlackPendingState.value;
	const sid = seatPlayerId.value;
	if (!p || p.kind !== 'interaction' || sid == null) return false;
	return p.targetPlayerId === sid;
});
const mibIsCabaretProxy = computed(() => {
	const p = manInBlackPendingState.value;
	const sid = seatPlayerId.value;
	if (!p || p.kind !== 'cabaretProxyPick' || sid == null) return false;
	return p.proxyPlayerId === sid;
});

const mibCabaretPickIds = ref<string[]>([]);
watch(manInBlackPendingState, (p) => {
	if (p?.kind !== 'cabaretProxyPick') mibCabaretPickIds.value = [];
});

function toggleMibCabaretPick(cardId: string) {
	const p = manInBlackPendingState.value;
	if (p?.kind !== 'cabaretProxyPick') return;
	if (!p.mibPoolCardIds.includes(cardId)) return;
	const i = mibCabaretPickIds.value.indexOf(cardId);
	if (i >= 0) mibCabaretPickIds.value = mibCabaretPickIds.value.filter((_, j) => j !== i);
	else if (mibCabaretPickIds.value.length < 2) mibCabaretPickIds.value = [...mibCabaretPickIds.value, cardId];
}

function submitMibCabaretPicks() {
	const ids = mibCabaretPickIds.value;
	if (ids.length !== 2) return;
	move('manInBlackCabaretProxyPick', ids[0], ids[1]);
}

function canArrestVs(pid: string): boolean {
	if (!me.value) return false;
	const t = G.value.players?.[pid];
	return me.value.marshalPoints >= 1 && (t?.wantedPoints ?? 0) >= 1;
}

/** Rulebook C: at most one arrest / duel / rob vs the same opponent per turn (both duelists track the pairing). */
function foughtPvpThisTurn(oppId: string): boolean {
	const list = me.value?.pvpFightTargetsThisTurn;
	if (!Array.isArray(list)) return false;
	const want = String(oppId);
	return list.some((x) => String(x) === want);
}

function arrestFightTitle(pid: string): string | undefined {
	if (hasUsedFightThisTurn.value) return 'You already used your fight this turn';
	if (foughtPvpThisTurn(pid)) return 'You already fought this player this turn';
	if (!canArrestVs(pid)) return 'Requires 1+ Marshal on you and 1+ Wanted on them';
	return undefined;
}

function duelRobFightTitle(pid: string): string | undefined {
	if (hasUsedFightThisTurn.value) return 'You already used your fight this turn';
	return foughtPvpThisTurn(pid) ? 'You already fought this player this turn' : undefined;
}

function mibDuelRobTitle(): string | undefined {
	if (hasUsedFightThisTurn.value) return 'You already used your fight this turn';
	return undefined;
}

function handCardKey(c: Card, i: number): string {
	return isCardHidden(c) ? `h-${i}` : (c as VisibleCard).id;
}

const showPokerHandTray = computed(
	() => props.connectionOk && props.gameLoaded && props.matchRunning && !props.reconnecting && me.value != null && gamePhase.value === 'play',
);

const hoveredHandIndex = ref<number | null>(null);

const FAN_DEG_PER_CARD = 6;
const FAN_OVERLAP_PX = 36;

function fanStyle(idx: number, n: number): { transform: string; marginLeft: string; zIndex: number } {
	const center = (n - 1) / 2;
	const deg = (idx - center) * FAN_DEG_PER_CARD;
	const marginLeft = idx === 0 ? '0' : `-${FAN_OVERLAP_PX}px`;
	return {
		transform: `rotate(${deg}deg)`,
		marginLeft,
		zIndex: idx + 1,
	};
}

function fanStyleHover(idx: number, n: number): { transform: string; marginLeft: string; zIndex: number } {
	const base = fanStyle(idx, n);
	return {
		...base,
		transform: `translateY(-14px) scale(1.12) ${base.transform}`,
		zIndex: 50,
	};
}

const panelClass = 'rounded-lg border border-slate-800 bg-slate-900/85 shadow backdrop-blur-sm';

/** Must pick turn income (+$20 / 2 cards / $10+1) before other moves. */
const needsStartTurnIncomeChoice = computed(() => me.value?.needsStartTurnIncomeChoice === true);

const needsTurnWeaponMountChoice = computed(() => me.value?.needsTurnWeaponMountChoice === true);

/** First purchase on this store hex costs a turn slot; further purchases this visit do not. */
const canUseGeneralStoreLocationSlot = computed(
	() =>
		kind.value === 'generalStore' &&
		(canTakeDiscrete.value ||
			(me.value?.generalStoreVisitPaidLocationId != null && me.value.generalStoreVisitPaidLocationId === me.value.locationId)),
);

const canBrowseGeneralStore = computed(
	() =>
		canUseGeneralStoreLocationSlot.value &&
		isMyTurn.value &&
		gamePhase.value === 'play' &&
		!needsStartTurnIncomeChoice.value &&
		!needsTurnWeaponMountChoice.value,
);

watch(kind, (k) => {
	if (k !== 'generalStore') generalStoreStripOpen.value = false;
});

watch(isMyTurn, (mine) => {
	if (!mine) generalStoreStripOpen.value = false;
});

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

/** Two-tap confirm on hand fan only (sidebar MIB buttons stay one-click). */
const handTrayMibStageCardId = ref<string | null>(null);

function clearHandTrayMibStage(): void {
	handTrayMibStageCardId.value = null;
}

watch(manInBlackPendingState, () => {
	clearHandTrayMibStage();
});

watch(
	() => me.value?.hand,
	(hand) => {
		const id = handTrayMibStageCardId.value;
		if (id == null || !hand) return;
		const still = hand.some((c) => !isCardHidden(c) && (c as VisibleCard).id === id);
		if (!still) clearHandTrayMibStage();
	},
	{ deep: true },
);

function onHandTrayEscape(ev: KeyboardEvent): void {
	if (ev.key === 'Escape') clearHandTrayMibStage();
}

onMounted(() => {
	window.addEventListener('keydown', onHandTrayEscape);
});

onUnmounted(() => {
	window.removeEventListener('keydown', onHandTrayEscape);
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

/** Hand fan: MIB discard/interaction uses two-tap confirm; end-of-pass uses multi-select rings. */
function onHandCardClickTray(c: Card) {
	if (isCardHidden(c)) return;
	const vid = (c as VisibleCard).id;
	const p = manInBlackPendingState.value;
	const sid = seatPlayerId.value;
	if (sid != null && p?.kind === 'discardBoth' && p.awaitingPlayerId === sid) {
		if (handTrayMibStageCardId.value === vid) {
			move('manInBlackDiscardCommit', vid);
			clearHandTrayMibStage();
		} else {
			handTrayMibStageCardId.value = vid;
		}
		return;
	}
	if (sid != null && p?.kind === 'interaction' && p.targetPlayerId === sid) {
		if (handTrayMibStageCardId.value === vid) {
			move('manInBlackInteractionCommit', vid);
			clearHandTrayMibStage();
		} else {
			handTrayMibStageCardId.value = vid;
		}
		return;
	}
	clearHandTrayMibStage();
	togglePassDiscardForPass(vid);
}

function handTrayMibOverlayKind(c: Card): 'discard' | 'interaction' | null {
	if (isCardHidden(c)) return null;
	if (handTrayMibStageCardId.value !== (c as VisibleCard).id) return null;
	if (mibIsDiscardActor.value) return 'discard';
	if (mibIsInteractionActor.value) return 'interaction';
	return null;
}

function handCardClickableInTray(c: Card): boolean {
	if (isCardHidden(c)) return false;
	const p = manInBlackPendingState.value;
	const sid = seatPlayerId.value;
	if (sid != null && p?.kind === 'discardBoth' && p.awaitingPlayerId === sid) return true;
	if (sid != null && p?.kind === 'interaction' && p.targetPlayerId === sid) return true;
	return passDiscardSelectionMode.value;
}

/** Full-screen overlays must be cleared before ending the turn (server rejects pass otherwise). */
const passBlockedBySaloonReveal = computed(() => (G.value as WesternLegendsState)?.saloonReveal != null);
const passBlockedByProspectReveal = computed(() => {
	const r = (G.value as WesternLegendsState)?.prospectReveal;
	const pid = playerID.value;
	return r != null && pid != null && r.playerId === pid;
});
const passBlockedByFight = computed(() => activeFight.value != null);
const passBlockedByBanditBounty = computed(() => !!(me.value as WesternLegendsPlayer | undefined)?.pendingBanditBountyChoice);
const passBlockedByManInBlack = computed(() => (G.value as WesternLegendsState | undefined)?.manInBlackPending != null);

const passEndTurnReady = computed(() => {
	if (!isMyTurn.value || gamePhase.value !== 'play') return false;
	if (needsStartTurnIncomeChoice.value || needsTurnWeaponMountChoice.value) return false;
	if (
		passBlockedBySaloonReveal.value ||
		passBlockedByProspectReveal.value ||
		passBlockedByFight.value ||
		passBlockedByBanditBounty.value ||
		passBlockedByManInBlack.value
	)
		return false;
	if (passDiscardOver.value > 0) return passDiscardPickIds.value.length === passDiscardOver.value;
	return true;
});

/** Inline hint under Pass (skip when Saloon/mining banner already explains the block). */
const passEndTurnHint = computed((): string => {
	if (!isMyTurn.value || gamePhase.value !== 'play') return '';
	if (needsStartTurnIncomeChoice.value) return 'Choose turn income first';
	if (needsTurnWeaponMountChoice.value) return 'Confirm weapon and mount first';
	if (
		passBlockedBySaloonReveal.value ||
		passBlockedByProspectReveal.value ||
		passBlockedByFight.value ||
		passBlockedByBanditBounty.value ||
		passBlockedByManInBlack.value
	)
		return '';
	if (passDiscardOver.value > 0 && passDiscardPickIds.value.length !== passDiscardOver.value) {
		return `Select ${passDiscardOver.value} card(s) in the bottom hand to discard, then Pass and confirm`;
	}
	return '';
});

const passButtonTitle = computed((): string => {
	if (passEndTurnReady.value) return 'End your turn';
	if (!isMyTurn.value || gamePhase.value !== 'play') return '';
	if (needsStartTurnIncomeChoice.value) return 'Choose turn income first';
	if (needsTurnWeaponMountChoice.value) return 'Confirm weapon and mount first';
	if (passBlockedBySaloonReveal.value) return 'Dismiss the Saloon results first';
	if (passBlockedByProspectReveal.value) return 'Close the mining results summary first';
	if (passBlockedByFight.value) return 'Finish the fight first';
	if (passBlockedByBanditBounty.value) return 'Choose your bandit bounty first';
	if (passBlockedByManInBlack.value) return 'Resolve the Man in Black card first';
	if (passDiscardOver.value > 0 && passDiscardPickIds.value.length !== passDiscardOver.value) {
		return `Select ${passDiscardOver.value} card(s) in the bottom hand to discard`;
	}
	return '';
});

function submitPassEndTurn() {
	const over = passDiscardOver.value;
	if (over > 0) move('pass', [...passDiscardPickIds.value]);
	else move('pass');
}

/** Two-step confirm for Pass and Work so they are not fired by a single misclick. */
const pendingDestructiveAction = ref<'pass' | 'work' | null>(null);

const workActionAvailable = computed(() => kind.value != null && canTakeDiscrete.value);

function requestPassEndTurn() {
	if (!passEndTurnReady.value) return;
	// All turn slots used — no actions left to lose; pass without a second confirm step.
	if (!canTakeDiscrete.value) {
		submitPassEndTurn();
		return;
	}
	pendingDestructiveAction.value = 'pass';
}

function requestWorkForPay() {
	if (!workActionAvailable.value) return;
	pendingDestructiveAction.value = 'work';
}

function cancelDestructiveConfirm() {
	pendingDestructiveAction.value = null;
}

function confirmDestructivePending() {
	const p = pendingDestructiveAction.value;
	if (p === 'pass') {
		if (!passEndTurnReady.value) {
			pendingDestructiveAction.value = null;
			return;
		}
		submitPassEndTurn();
		pendingDestructiveAction.value = null;
		return;
	}
	if (p === 'work') {
		if (!workActionAvailable.value) {
			pendingDestructiveAction.value = null;
			return;
		}
		move('workForPay');
		pendingDestructiveAction.value = null;
	}
}

watch([isMyTurn, gamePhase, playerID, passEndTurnReady, kind, canTakeDiscrete], () => {
	if (!isMyTurn.value || gamePhase.value !== 'play') {
		pendingDestructiveAction.value = null;
		return;
	}
	if (pendingDestructiveAction.value === 'pass' && !passEndTurnReady.value) {
		pendingDestructiveAction.value = null;
	}
	if (pendingDestructiveAction.value === 'work' && !workActionAvailable.value) {
		pendingDestructiveAction.value = null;
	}
});

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
	const wOk = wo.length <= 1 || (loadoutWeaponPick.value != null && wo.includes(loadoutWeaponPick.value));
	const mOk = mo.length <= 1 || (loadoutMountPick.value != null && mo.includes(loadoutMountPick.value));
	return wOk && mOk;
});

function submitTurnLoadout() {
	const wo = loadoutWeaponOptions.value;
	const mo = loadoutMountOptions.value;
	const w = wo.length <= 1 ? (wo[0] ?? null) : loadoutWeaponPick.value;
	const m = mo.length <= 1 ? (mo[0] ?? null) : loadoutMountPick.value;
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
					<button
						v-if="props.matchRunning && gamePhase === 'play' && canUndo && !hasUsedLocationActionThisTurn"
						type="button"
						class="mt-2 w-full rounded-lg border border-sky-800/55 bg-sky-950/45 px-2.5 py-1.5 text-center text-xs font-medium text-sky-100 hover:bg-sky-900/40 sm:w-auto"
						title="Rewind your last undoable step (map move, early bandit approach, or Manhunt sheriff setup). Unavailable after a location action this turn."
						@click="undo()"
					>
						Undo last move
					</button>
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

			<section
				v-if="manInBlackPendingState && gamePhase === 'play' && me && seatPlayerId != null"
				:class="panelClass + ' p-4 border-2 border-orange-500/50 bg-orange-950/25 ring-2 ring-orange-400/40 shadow-lg shadow-orange-950/30'"
			>
				<h3 class="mb-2 text-base font-semibold text-orange-100">Man in Black card</h3>
				<p
					v-if="mibPendingCardIdDisplay"
					class="mb-3 rounded border border-orange-800/35 bg-slate-950/50 px-2.5 py-1.5 text-xs text-orange-100/95"
				>
					<span class="text-slate-500">Drawn card</span>
					<span class="ml-1.5 font-mono font-semibold tracking-tight text-orange-50">{{ mibPendingCardIdDisplay }}</span>
				</p>
				<template v-if="manInBlackPendingState.kind === 'interaction'">
					<p v-if="mibIsInteractionActor" class="mb-2 text-xs text-orange-100/95">
						The MIB challenges you to a <strong>{{ manInBlackPendingState.interaction }}</strong
						>. Play one poker card from your hand (sidebar buttons, or tap a card twice in the fan below to confirm).
					</p>
					<p v-else class="mb-2 text-xs text-slate-400">
						Waiting for the legendary leader to resolve the MIB {{ manInBlackPendingState.interaction }}…
					</p>
					<div v-if="mibIsInteractionActor" class="flex flex-wrap gap-2">
						<button
							v-for="(c, i) in me.hand"
							:key="'mib-int-' + i + '-' + (isCardHidden(c) ? 'h' : (c as VisibleCard).id)"
							type="button"
							class="rounded border border-orange-800/60 px-2 py-1 text-xs text-orange-100 hover:bg-orange-900/30 disabled:opacity-40"
							:disabled="isCardHidden(c)"
							@click="move('manInBlackInteractionCommit', (c as VisibleCard).id)"
						>
							Play {{ isCardHidden(c) ? '?' : (c as VisibleCard).id }}
						</button>
					</div>
				</template>
				<template v-else-if="manInBlackPendingState.kind === 'discardBoth'">
					<p v-if="mibIsDiscardActor" class="mb-2 text-xs text-orange-100/95">
						MIB effect — discard one visible poker card (both players must discard). Use the buttons here, or tap a card in the bottom fan
						twice (trash overlay, then confirm).
					</p>
					<p v-else-if="mibDiscardBothStatusLine" class="mb-2 text-xs leading-relaxed text-slate-400">{{ mibDiscardBothStatusLine }}</p>
					<div v-if="mibIsDiscardActor" class="flex flex-wrap gap-2">
						<button
							v-for="(c, i) in me.hand"
							:key="'mib-dis-' + i + '-' + (isCardHidden(c) ? 'h' : (c as VisibleCard).id)"
							type="button"
							class="rounded border border-orange-800/60 px-2 py-1 text-xs text-orange-100 hover:bg-orange-900/30 disabled:opacity-40"
							:disabled="isCardHidden(c)"
							@click="move('manInBlackDiscardCommit', (c as VisibleCard).id)"
						>
							Discard {{ isCardHidden(c) ? '?' : (c as VisibleCard).id }}
						</button>
					</div>
				</template>
				<template v-else-if="manInBlackPendingState.kind === 'cabaretProxyPick'">
					<p v-if="mibIsCabaretProxy" class="mb-2 text-xs text-orange-100/95">
						You are the MIB proxy — pick <strong>two</strong> of your four dealt cards for the two-card poker showdown vs the player in
						Red Falls (MIB wins ties).
					</p>
					<p v-else class="mb-2 text-xs text-slate-400">Waiting for the MIB proxy to choose two cabaret cards…</p>
					<div v-if="mibIsCabaretProxy" class="space-y-2">
						<p class="text-[11px] text-slate-500">Selected: {{ mibCabaretPickIds.length }}/2</p>
						<div class="flex flex-wrap gap-2">
							<button
								v-for="(c, i) in me.hand"
								:key="'mib-cab-' + i + '-' + (isCardHidden(c) ? 'h' : (c as VisibleCard).id)"
								type="button"
								class="rounded border px-2 py-1 text-xs disabled:opacity-40"
								:class="
									!isCardHidden(c) &&
									manInBlackPendingState.kind === 'cabaretProxyPick' &&
									manInBlackPendingState.mibPoolCardIds.includes((c as VisibleCard).id)
										? mibCabaretPickIds.includes((c as VisibleCard).id)
											? 'border-amber-400 bg-amber-950/40 text-amber-50'
											: 'border-orange-800/60 text-orange-100 hover:bg-orange-900/30'
										: 'border-slate-700 text-slate-500'
								"
								:disabled="
									isCardHidden(c) ||
									manInBlackPendingState.kind !== 'cabaretProxyPick' ||
									!manInBlackPendingState.mibPoolCardIds.includes((c as VisibleCard).id)
								"
								@click="toggleMibCabaretPick((c as VisibleCard).id)"
							>
								{{ isCardHidden(c) ? '?' : (c as VisibleCard).id }}
							</button>
						</div>
						<button
							type="button"
							class="rounded-lg border border-amber-600/70 bg-amber-900/50 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-800/45 disabled:cursor-not-allowed disabled:opacity-40"
							:disabled="mibCabaretPickIds.length !== 2"
							@click="submitMibCabaretPicks"
						>
							Confirm two cards
						</button>
					</div>
				</template>
			</section>

			<section v-if="me && gamePhase === 'play'" :class="panelClass + ' p-4'">
				<dl class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm leading-6 sm:grid-cols-3">
					<div class="flex items-baseline justify-between gap-2">
						<dt class="inline-flex items-baseline gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
							<IconStar :size="12" class="self-center text-amber-400/90" aria-hidden="true" />
							Goal
						</dt>
						<dd class="font-semibold tabular-nums text-amber-100">{{ G.legendGoal }}</dd>
					</div>
					<div class="flex items-baseline justify-between gap-2">
						<dt class="inline-flex items-baseline gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
							<IconStar :size="12" class="self-center text-teal-400/85" aria-hidden="true" />
							Your LP
						</dt>
						<dd class="font-semibold tabular-nums text-teal-100">{{ me.legendaryPoints }}</dd>
					</div>
					<div v-if="G.manInBlackVariant && G.manInBlack" class="flex items-baseline justify-between gap-2">
						<dt class="inline-flex items-baseline gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
							<IconStar :size="12" class="self-center text-orange-400/90" aria-hidden="true" />
							MIB LP
						</dt>
						<dd class="font-semibold tabular-nums text-orange-100">{{ G.manInBlack.legendaryPoints }}</dd>
					</div>
					<div v-else class="hidden sm:block" aria-hidden="true"></div>
					<div class="flex items-baseline justify-between gap-2">
						<dt class="inline-flex items-baseline gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
							<IconCoin :size="12" class="self-center text-amber-400/90" aria-hidden="true" />
							Gold
						</dt>
						<dd class="font-semibold tabular-nums text-amber-200">
							{{ me.gold }}<span class="text-slate-400">/{{ MAX_PLAYER_GOLD }}</span>
						</dd>
					</div>
					<div class="flex items-baseline justify-between gap-2">
						<dt class="text-[11px] uppercase tracking-wide text-slate-500">Move MP</dt>
						<dd class="font-semibold tabular-nums text-slate-100">
							{{ Number.isFinite(me.movementPointsLeft) ? me.movementPointsLeft : movementBudgetMax
							}}<span class="text-slate-400">/{{ movementBudgetMax }}</span>
						</dd>
					</div>
					<div class="flex items-baseline justify-between gap-2">
						<dt class="text-[11px] uppercase tracking-wide text-slate-500">Wounds</dt>
						<dd class="font-semibold tabular-nums text-slate-100">{{ me.wounds }}</dd>
					</div>
					<div class="flex items-baseline justify-between gap-2">
						<dt class="text-[11px] uppercase tracking-wide text-slate-500">Nuggets</dt>
						<dd class="font-semibold tabular-nums text-slate-100">{{ me.nuggets }}</dd>
					</div>
					<div class="flex items-baseline justify-between gap-2">
						<dt class="text-[11px] uppercase tracking-wide text-slate-500">Wanted</dt>
						<dd class="font-semibold tabular-nums text-slate-100">{{ me.wantedPoints }}</dd>
					</div>
					<div class="flex items-baseline justify-between gap-2">
						<dt class="text-[11px] uppercase tracking-wide text-slate-500">Marshal</dt>
						<dd class="font-semibold tabular-nums text-slate-100">{{ me.marshalPoints ?? 0 }}</dd>
					</div>
				</dl>
				<dl class="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm leading-6">
					<div class="flex items-baseline gap-2">
						<dt class="text-[11px] uppercase tracking-wide text-slate-500">Cattle</dt>
						<dd class="font-semibold text-slate-100">
							{{
								me.carriedCattle == null
									? 'None'
									: (me.carriedCattle.color === 'green' ? 'Green' : 'Blue') +
										' · ' +
										CATTLE_TOKEN_FACE_LABELS[me.carriedCattle.face]
							}}
						</dd>
					</div>
					<div v-if="turnLoadoutSummary" class="flex items-baseline gap-2">
						<dt class="text-[11px] uppercase tracking-wide text-slate-500">This turn</dt>
						<dd class="font-semibold text-slate-100">{{ turnLoadoutSummary }}</dd>
					</div>
				</dl>
				<dl v-if="(me.ownedMiscItemIds?.length ?? 0) > 0" class="mt-2 flex items-baseline gap-2 text-sm leading-6">
					<dt class="text-[11px] uppercase tracking-wide text-slate-500">
						Misc <span class="tabular-nums">({{ me.ownedMiscItemIds?.length ?? 0 }}/{{ GENERAL_STORE_MAX_MISC_ITEMS }})</span>
					</dt>
					<dd class="text-slate-300">{{ (me.ownedMiscItemIds ?? []).map((id) => itemCardLabel(id)).join(', ') }}</dd>
				</dl>
			</section>

			<section
				v-if="isMyTurn && me && gamePhase === 'play' && needsStartTurnIncomeChoice"
				:class="panelClass + ' border-teal-900/40 p-4 ring-1 ring-teal-900/25'"
			>
				<h3 class="mb-1 text-sm font-medium text-teal-200">Turn income</h3>
				<p class="mb-3 text-xs text-slate-500">After start-of-turn effects, choose one option for this turn.</p>
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
				v-if="isMyTurn && me && gamePhase === 'play' && me.pendingBanditBountyChoice"
				:class="panelClass + ' border-rose-900/40 p-4 ring-1 ring-rose-900/25'"
			>
				<h3 class="mb-1 text-sm font-medium text-rose-200">Bandit bounty</h3>
				<p class="mb-3 text-xs text-slate-500">You defeated the bandit — choose +1 Legend or +1 Marshal.</p>
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class="rounded-lg border border-rose-700/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-50 hover:bg-rose-900/40"
						@click="move('chooseBanditBountyReward', 'lp')"
					>
						+1 Legend
					</button>
					<button
						type="button"
						class="rounded-lg border border-rose-700/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-50 hover:bg-rose-900/40 disabled:opacity-40"
						:disabled="me.wantedPoints >= 1"
						@click="move('chooseBanditBountyReward', 'marshal')"
					>
						+1 Marshal
					</button>
				</div>
			</section>

			<section
				v-if="isMyTurn && me && gamePhase === 'play' && me.pendingCattleMarshalOrWanted"
				:class="panelClass + ' border-amber-900/40 p-4 ring-1 ring-amber-900/25'"
			>
				<h3 class="mb-1 text-sm font-medium text-amber-200">Cattle rustle reward</h3>
				<p class="mb-3 text-xs text-slate-500">Choose +1 Marshal or +1 Wanted from your token.</p>
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class="rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-50 hover:bg-amber-900/40"
						@click="move('chooseCattleTrackReward', 'marshal')"
					>
						+1 Marshal
					</button>
					<button
						type="button"
						class="rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-50 hover:bg-amber-900/40"
						@click="move('chooseCattleTrackReward', 'wanted')"
					>
						+1 Wanted
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
				<h3 class="mb-1 text-sm font-medium text-slate-300 mb-2">Actions</h3>
				<p v-if="passBlockedBySaloonReveal || passBlockedByProspectReveal" class="mb-2 text-xs text-amber-200/90">
					<span v-if="passBlockedBySaloonReveal">Dismiss the Saloon results (Done) before ending your turn.</span>
					<span v-else>Close the mining results summary before ending your turn.</span>
				</p>
				<p class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Poker card actions</p>
				<div class="flex flex-wrap gap-2">
					<template v-if="livingLegendCardId">
						<span class="w-full basis-full text-[11px] text-violet-200/90">Living Legend (Ace)</span>
						<button
							type="button"
							class="rounded-lg border border-violet-800/45 bg-violet-950/35 px-3 py-1.5 text-sm text-violet-100 hover:bg-violet-900/35 disabled:cursor-not-allowed disabled:opacity-40"
							:disabled="!canPlayLivingLegendCard"
							@click="move('useCardAction', livingLegendCardId, 'marshal')"
						>
							+1 Marshal
						</button>
						<button
							type="button"
							class="rounded-lg border border-violet-800/45 bg-violet-950/35 px-3 py-1.5 text-sm text-violet-100 hover:bg-violet-900/35 disabled:cursor-not-allowed disabled:opacity-40"
							:disabled="!canPlayLivingLegendCard"
							@click="move('useCardAction', livingLegendCardId, 'wanted')"
						>
							+1 Wanted
						</button>
					</template>
					<button
						v-if="reputationSevenCardId"
						type="button"
						class="rounded-lg border border-fuchsia-800/45 bg-fuchsia-950/35 px-3 py-1.5 text-sm text-fuchsia-100 hover:bg-fuchsia-900/35 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="!canPlayReputationSeven"
						@click="move('playReputationSeven', reputationSevenCardId)"
					>
						Reputation (7): +1 LP
					</button>
					<button
						v-if="sprintCardId"
						type="button"
						class="rounded-lg border border-sky-800/45 bg-sky-950/35 px-3 py-1.5 text-sm text-sky-100 hover:bg-sky-900/35 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="!canPlaySprint"
						@click="move('playPokerAfterMove', sprintCardId)"
					>
						Sprint (+2 move this leg)
					</button>
					<template v-if="wallopCardId && othersHere.length">
						<span class="w-full basis-full text-[11px] text-rose-200/90">Wallop (pick target)</span>
						<button
							v-for="pid in othersHere"
							:key="'wallop-' + pid"
							type="button"
							class="rounded-lg border border-rose-900/55 bg-rose-950/45 px-3 py-1.5 text-sm text-rose-100 hover:bg-rose-900/40 disabled:cursor-not-allowed disabled:opacity-40"
							:disabled="!canPlayWallop"
							@click="move('playPokerAfterMove', wallopCardId, pid)"
						>
							Wallop → {{ pid }}
						</button>
					</template>
					<button
						v-if="paydayCardId"
						type="button"
						class="rounded-lg border border-amber-800/45 bg-amber-950/35 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-900/35 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="!pokerBSlotCtxOk"
						@click="move('useCardAction', paydayCardId)"
					>
						Payday (+$30)
					</button>
					<button
						v-if="determinationCardId"
						type="button"
						class="rounded-lg border border-amber-800/45 bg-amber-950/35 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-900/35 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="!pokerBSlotCtxOk"
						@click="move('useCardAction', determinationCardId)"
					>
						Determination (+2 actions)
					</button>
					<button
						v-if="instinctsCardId"
						type="button"
						class="rounded-lg border border-amber-800/45 bg-amber-950/35 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-900/35 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="!pokerBSlotCtxOk"
						@click="move('useCardAction', instinctsCardId)"
					>
						Instincts (draw 3)
					</button>
					<template v-if="saddleUpCardId">
						<span class="w-full basis-full text-[11px] text-teal-200/90">Saddle Up — pick a town on the map</span>
						<button
							v-if="!saddleUpPickActive"
							type="button"
							class="rounded-lg border border-teal-900/55 bg-teal-950/45 px-3 py-1.5 text-sm text-teal-100 hover:bg-teal-900/40 disabled:cursor-not-allowed disabled:opacity-40"
							:disabled="!pokerBSlotCtxOk"
							@click="startSaddleUpPick(saddleUpCardId)"
						>
							Choose town on map
						</button>
						<template v-else>
							<p class="w-full basis-full text-[11px] text-teal-100/90">Click a highlighted town hex. Press Esc to cancel.</p>
							<button
								type="button"
								class="rounded-lg border border-slate-600 bg-slate-800/90 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
								@click="cancelSaddleUpPick"
							>
								Cancel
							</button>
						</template>
					</template>
					<template v-if="manhuntCardId && manhuntDestinationIds.length">
						<span class="w-full basis-full text-[11px] text-stone-200/90">Manhunt (sheriff ≤3 steps)</span>
						<button
							v-for="mid in manhuntDestinationIds"
							:key="'manhunt-' + mid"
							type="button"
							class="rounded-lg border border-stone-700/55 bg-stone-900/50 px-2 py-1 text-xs text-stone-100 hover:bg-stone-800/40 disabled:cursor-not-allowed disabled:opacity-40"
							:disabled="!pokerBSlotCtxOk"
							@click="move('useCardAction', manhuntCardId, mid)"
						>
							{{ moveTargetLabel(BOARD_SPACES_BY_ID[mid]!) }}
						</button>
					</template>
					<button
						type="button"
						class="rounded-lg border border-emerald-800/50 bg-emerald-950/40 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-900/35 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="!canUseProvisions"
						:class="!canUseProvisions ? 'hidden' : ''"
						@click="move('useProvisions')"
					>
						Provisions (discard: draw 1, −1 wound)
					</button>
					<template v-if="canUseWhiskeyReaction">
						<span class="w-full basis-full text-[11px] text-amber-200/90">Whiskey (after move, same space)</span>
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
				</div>
				<p class="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">This location</p>
				<div class="flex flex-wrap gap-2">
					<button
						v-if="kind === 'generalStore'"
						type="button"
						class="w-full basis-full rounded-lg border border-amber-800/55 bg-amber-950/40 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-900/35 disabled:cursor-not-allowed disabled:opacity-40"
						title="Opens item row above the board (no server round-trip until you buy)."
						:disabled="!canBrowseGeneralStore"
						:class="!canBrowseGeneralStore ? 'hidden' : ''"
						@click="requestGeneralStoreStripOpen"
					>
						General Store - browse items
					</button>
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="kind !== 'playPoker' || me.gold < POKER_ANTE_GOLD || !canTakeDiscrete"
						:class="kind !== 'playPoker' || me.gold < POKER_ANTE_GOLD || !canTakeDiscrete ? 'hidden' : ''"
						@click="move('startSaloon')"
					>
						Saloon (-{{ POKER_ANTE_GOLD }}g ante, win {{ saloonPotGold }}g +1 LP)
					</button>
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="kind !== 'prospectGold' || !canTakeDiscrete"
						:class="kind !== 'prospectGold' || !canTakeDiscrete ? 'hidden' : ''"
						@click="move('prospectForGold')"
					>
						Mine - prospect (2 dice)
					</button>
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="kind !== 'bank' || me.nuggets < 1 || !canTakeDiscrete"
						:class="kind !== 'bank' || me.nuggets < 1 || !canTakeDiscrete ? 'hidden' : ''"
						@click="move('depositNuggets')"
					>
						Deposit nuggets (all)
					</button>
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="kind !== 'bank' || me.usedHeistThisTurn || !canTakeDiscrete"
						:class="kind !== 'bank' || me.usedHeistThisTurn || !canTakeDiscrete ? 'hidden' : ''"
						@click="move('heist')"
					>
						Heist (1/turn, 3-card vs clockwise guard)
					</button>
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="kind !== 'doctor' || me.wounds < 1 || me.gold < HEAL_COST_GOLD || !canTakeDiscrete"
						:class="kind !== 'doctor' || me.wounds < 1 || me.gold < HEAL_COST_GOLD || !canTakeDiscrete ? 'hidden' : ''"
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
						:class="kind !== 'cabaret' || me.gold < t * REVEL_GOLD_PER_LP || !canTakeDiscrete ? 'hidden' : ''"
						@click="move('revel', t)"
					>
						Cabaret - Revel (−{{ t * REVEL_GOLD_PER_LP }}g, +{{ t }} LP)
					</button>
					<button
						type="button"
						class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
						:disabled="kind !== 'ranch' || !canTakeDiscrete"
						:class="kind !== 'ranch' || !canTakeDiscrete ? 'hidden' : ''"
						@click="move('acquireCattle')"
					>
						Ranch (pick up / deliver)
					</button>
				</div>
				<p class="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Work and end turn</p>
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class="rounded-lg border px-3 py-1.5 text-sm hover:bg-emerald-900/35 disabled:cursor-not-allowed disabled:opacity-40"
						:class="[
							kind == null || !canTakeDiscrete ? 'hidden' : '',
							pendingDestructiveAction === 'work'
								? 'border-emerald-400/70 bg-emerald-950/50 text-emerald-50'
								: 'border-emerald-800/50 bg-emerald-950/40 text-emerald-100',
						]"
						:disabled="kind == null || !canTakeDiscrete"
						@click="requestWorkForPay"
					>
						Work (+{{ WORK_PAY_GOLD }} gold)
					</button>
					<button
						type="button"
						class="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
						:class="
							pendingDestructiveAction === 'pass'
								? 'border-amber-500/70 bg-amber-950/35 text-amber-50'
								: 'border-slate-600 bg-slate-800 text-slate-200'
						"
						:disabled="!passEndTurnReady"
						:title="passButtonTitle || undefined"
						@click="requestPassEndTurn"
					>
						Pass (end turn)
					</button>
				</div>
				<p v-if="passEndTurnHint" class="mt-2 text-[11px] leading-snug text-amber-200/90">
					{{ passEndTurnHint }}
				</p>
				<div v-if="pendingDestructiveAction" class="mt-2 rounded-md border border-amber-800/45 bg-amber-950/25 px-3 py-2">
					<p v-if="pendingDestructiveAction === 'pass'" class="mb-2 text-xs text-amber-100/95">
						End your turn now? Any unused actions this turn are lost.
					</p>
					<p v-else class="mb-2 text-xs text-amber-100/95">Work for +{{ WORK_PAY_GOLD }} gold? Uses one location action.</p>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="rounded-lg border border-amber-600/60 bg-amber-900/40 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-800/45"
							@click="confirmDestructivePending"
						>
							Confirm
						</button>
						<button
							type="button"
							class="rounded-lg border border-slate-600 bg-slate-800/90 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
							@click="cancelDestructiveConfirm"
						>
							Cancel
						</button>
					</div>
				</div>
				<div v-if="manInBlackSharesSpace && activeFight == null" class="mt-3">
					<p class="mb-2 text-xs text-slate-500">Man in Black (same space)</p>
					<div class="flex flex-wrap items-center gap-2">
						<button
							type="button"
							class="rounded-lg border border-orange-900/60 bg-orange-950/40 px-2 py-1 text-xs text-orange-100 hover:bg-orange-900/40 disabled:cursor-not-allowed disabled:opacity-40"
							:title="mibDuelRobTitle()"
							:disabled="!canTakeDiscrete || hasUsedFightThisTurn"
							@click="move('startFight', 'duel', MAN_IN_BLACK_FIGHT_DEFENDER_ID)"
						>
							Duel MIB
						</button>
						<button
							type="button"
							class="rounded-lg border border-orange-900/60 bg-orange-950/40 px-2 py-1 text-xs text-orange-100 hover:bg-orange-900/40 disabled:cursor-not-allowed disabled:opacity-40"
							:title="mibDuelRobTitle()"
							:disabled="!canTakeDiscrete || hasUsedFightThisTurn"
							@click="move('startFight', 'rob', MAN_IN_BLACK_FIGHT_DEFENDER_ID)"
						>
							Rob MIB
						</button>
					</div>
				</div>
				<div v-if="othersHere.length && activeFight == null" class="mt-3">
					<p class="mb-2 text-xs text-slate-500">Fight another player (arrest / duel / rob)</p>
					<div v-for="pid in othersHere" :key="pid" class="mb-2 flex flex-wrap items-center gap-2">
						<span class="text-xs text-slate-400">vs {{ pid }}</span>
						<button
							type="button"
							class="rounded-lg border border-red-900/60 bg-red-950/40 px-2 py-1 text-xs text-red-200 hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-40"
							:title="arrestFightTitle(pid)"
							:disabled="!canTakeDiscrete || hasUsedFightThisTurn || foughtPvpThisTurn(pid) || !canArrestVs(pid)"
							@click="move('startFight', 'arrest', pid)"
						>
							Arrest
						</button>
						<button
							type="button"
							class="rounded-lg border border-red-900/60 bg-red-950/40 px-2 py-1 text-xs text-red-200 hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-40"
							:title="duelRobFightTitle(pid)"
							:disabled="!canTakeDiscrete || hasUsedFightThisTurn || foughtPvpThisTurn(pid)"
							@click="move('startFight', 'duel', pid)"
						>
							Duel
						</button>
						<button
							type="button"
							class="rounded-lg border border-red-900/60 bg-red-950/40 px-2 py-1 text-xs text-red-200 hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-40"
							:title="duelRobFightTitle(pid)"
							:disabled="!canTakeDiscrete || hasUsedFightThisTurn || foughtPvpThisTurn(pid)"
							@click="move('startFight', 'rob', pid)"
						>
							Rob
						</button>
					</div>
				</div>
				<div class="w-full border-t border-slate-700/80 mt-1 mb-2"></div>
				<div class="mb-3 rounded-md border border-slate-700/80 bg-slate-900/50 px-3 py-2 text-xs text-slate-400">
					<p class="font-medium text-slate-300">This turn - {{ turnSlotsUsed }}/{{ turnSlotsMax }} actions</p>
					<p class="mt-1 text-slate-500">
						Each turn you have up to three actions: movement, poker cards, fights, and location options (Work, stores, and other space
						abilities). The same kind of action can repeat unless a rule says otherwise.
					</p>
					<p v-if="turnActionsSummary" class="mt-1.5 text-slate-200">{{ turnActionsSummary }}</p>
					<p v-else class="mt-1.5 italic text-slate-500">None resolved yet.</p>
				</div>
				<p class="mb-3 text-xs text-slate-500">
					Movement is only on the board — click a green-highlighted space. The first move of your turn uses one action; you may then keep
					moving until movement points run out.
				</p>
			</section>

			<section v-else-if="showTurnWait" :class="panelClass + ' p-4 text-center text-sm text-slate-500'">
				<template v-if="beforePlay && me?.characterId != null"> Waiting for other players to finish choosing a character… </template>
				<template v-else>Waiting for your turn…</template>
			</section>

			<section
				v-if="activeSheriffEncounter && gamePhase === 'play' && me && seatPlayerId != null"
				:class="panelClass + ' p-4 border-amber-900/40 bg-amber-950/20'"
			>
				<h3 class="mb-2 text-sm font-medium text-amber-200">Sheriff encounter</h3>
				<template v-if="activeSheriffEncounter.phase === 'chooseTarget'">
					<p v-if="activeSheriffEncounter.moverId === seatPlayerId" class="mb-2 text-xs text-amber-100/90">
						Multiple wanted players here — choose who the sheriff arrests.
					</p>
					<p v-else class="mb-2 text-xs text-slate-400">Waiting for the sheriff mover to choose an arrest target…</p>
					<div v-if="activeSheriffEncounter.moverId === seatPlayerId" class="flex flex-wrap gap-2">
						<button
							v-for="wid in activeSheriffEncounter.wantedPlayerIds"
							:key="wid"
							type="button"
							class="rounded-lg border border-amber-700/50 bg-amber-950/50 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-900/40"
							@click="move('chooseSheriffArrestTarget', wid)"
						>
							Arrest {{ wid }}
						</button>
					</div>
				</template>
				<template v-else-if="activeSheriffEncounter.phase === 'discard'">
					<p v-if="activeSheriffEncounter.pendingDiscardPlayerIds.includes(seatPlayerId)" class="mb-2 text-xs text-amber-100/90">
						The sheriff arrived — discard 1 visible poker card.
					</p>
					<p v-else class="mb-2 text-xs text-slate-400">Waiting for wanted players to discard…</p>
					<div v-if="activeSheriffEncounter.pendingDiscardPlayerIds.includes(seatPlayerId)" class="flex flex-wrap gap-2">
						<button
							v-for="(c, i) in me.hand"
							:key="'sd-' + i + '-' + (isCardHidden(c) ? 'h' : (c as VisibleCard).id)"
							type="button"
							class="rounded border border-amber-800/60 px-2 py-1 text-xs text-amber-100 hover:bg-amber-900/30 disabled:opacity-40"
							:disabled="isCardHidden(c)"
							@click="move('sheriffEncounterDiscard', (c as VisibleCard).id)"
						>
							Discard {{ isCardHidden(c) ? '?' : (c as VisibleCard).id }}
						</button>
					</div>
				</template>
			</section>

			<section v-if="G.gameLog?.length" :class="panelClass + ' p-4'">
				<h3 class="mb-2 text-sm font-medium text-slate-400">Trail</h3>
				<ul class="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-500">
					<li v-for="(e, i) in G.gameLog.slice(-14)" :key="i">{{ e.message }}</li>
				</ul>
			</section>
		</template>

		<Teleport v-if="showPokerHandTray" to="#game-hand-tray">
			<div class="hand-tray pointer-events-none flex w-full justify-center px-4">
				<div
					class="relative flex w-full max-w-[88rem] flex-col items-center border-t border-amber-900/25 bg-gradient-to-t from-[#0f0c09] via-[#0f0c09]/96 to-transparent px-4 pb-3 pt-10 transition-transform duration-300 ease-out will-change-transform"
					:class="handTrayRetracted ? 'translate-y-[calc(100%-3.5rem)] pointer-events-none' : 'translate-y-0 pointer-events-auto'"
				>
					<div class="pointer-events-auto absolute left-3 top-3 z-50 flex gap-2">
						<button
							type="button"
							class="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-800/50 bg-slate-900/95 text-amber-100 shadow-md hover:bg-slate-800"
							:aria-expanded="!handTrayRetracted"
							:aria-label="handTrayRetracted ? 'Expand poker hand' : 'Collapse poker hand'"
							:title="handTrayRetracted ? 'Show hand' : 'Hide hand (more map)'"
							@click="toggleHandTrayPeek"
						>
							<IconCards :size="20" stroke="1.75" aria-hidden="true" />
						</button>
						<button
							type="button"
							class="flex h-9 w-9 items-center justify-center rounded-lg border bg-slate-900/95 text-amber-100 shadow-md hover:bg-slate-800"
							:class="handTraySortLowToHigh ? 'border-amber-400/70 ring-1 ring-amber-400/40' : 'border-amber-800/50'"
							:aria-pressed="handTraySortLowToHigh"
							aria-label="Sort hand by rank, 2 through ace"
							:title="handTraySortLowToHigh ? 'Show cards in deal order' : 'Sort cards 2–A (clubs → … → spades within rank)'"
							@click="toggleHandTraySort"
						>
							<IconSortAscending :size="20" stroke="1.75" aria-hidden="true" />
						</button>
					</div>
					<div v-if="!me?.hand?.length" class="hand-fan flex min-h-[8rem] flex-col items-center justify-center gap-2 text-slate-500">
						<p class="text-sm">No poker cards in hand</p>
					</div>
					<div v-else class="hand-fan flex items-end justify-center">
						<div
							v-for="(c, i) in handForTrayDisplay"
							:key="handCardKey(c as Card, i)"
							class="wl-hand-card relative shrink-0 select-none transition-transform duration-150 will-change-transform"
							:class="handCardClickableInTray(c as Card) ? 'cursor-pointer' : ''"
							:style="hoveredHandIndex === i ? fanStyleHover(i, handForTrayDisplay.length) : fanStyle(i, handForTrayDisplay.length)"
							@click="onHandCardClickTray(c as Card)"
							@mouseenter="hoveredHandIndex = i"
							@mouseleave="hoveredHandIndex = null"
						>
							<div v-if="hoveredHandIndex === i" class="hand-card-tooltip" aria-hidden="true">
								<p v-for="(line, li) in getPokerCardAbilityLines(c as Card)" :key="li" class="hand-card-tooltip-line">
									{{ line }}
								</p>
							</div>
							<div
								class="relative rounded-md transition-[box-shadow]"
								:class="
									!isCardHidden(c as Card) && passDiscardPickIds.includes((c as VisibleCard).id)
										? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-[#0f0c09]'
										: ''
								"
							>
								<PokerCard hand-tray :card="c as Card" />
								<div
									v-if="handTrayMibOverlayKind(c as Card)"
									class="absolute inset-0 z-[210] flex flex-col items-center justify-center gap-1 rounded-md bg-black/60 px-1"
									aria-hidden="true"
								>
									<IconTrash
										v-if="handTrayMibOverlayKind(c as Card) === 'discard'"
										:size="36"
										stroke="1.5"
										class="text-orange-200"
									/>
									<IconCheck v-else :size="36" stroke="1.75" class="text-emerald-300" />
									<p class="text-center text-[10px] font-medium leading-tight text-orange-50">Tap again to confirm</p>
								</div>
							</div>
						</div>
					</div>
					<p class="mt-1 text-center text-[10px] text-slate-500">Hover a card to see its printed ability text.</p>
				</div>
			</div>
		</Teleport>
	</div>
</template>

<style scoped>
.hand-fan {
	min-height: 13.5rem;
}

.wl-hand-card {
	overflow: visible;
}

.hand-card-tooltip {
	position: absolute;
	bottom: 100%;
	left: 50%;
	z-index: 200;
	margin-bottom: 0.35rem;
	min-width: 10rem;
	max-width: 18rem;
	transform: translateX(-50%);
	padding: 0.5rem 0.65rem;
	pointer-events: none;
	text-align: left;
	font-size: 0.65rem;
	line-height: 1.35;
	color: #e2e8f0;
	border-radius: 0.5rem;
	border: 1px solid #475569;
	background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.hand-card-tooltip-line {
	margin: 0 0 0.35rem 0;
}

.hand-card-tooltip-line:last-child {
	margin-bottom: 0;
}

.hand-card-tooltip-line:first-child {
	font-weight: 700;
	color: #fbbf24;
}
</style>
