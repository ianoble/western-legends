import type { BaseGameState, Card } from '@engine/client';
import type { StandardCard } from '@engine/client';
import type { BoardCityId } from '../map/boardSpaces';
import type { ProspectMapDieOutcome, ProspectSlotFaces } from './prospect';
import type { PokerScore } from './poker';
import type { FightCardFaceId } from './fightCards';

// ---------------------------------------------------------------------------
// Colours & board spaces (map icon locations — see rulebook “location actions”)
// ---------------------------------------------------------------------------

export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow' | 'black' | 'orange';

export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue', 'green', 'yellow', 'black', 'orange'];

/**
 * **Action phase** — after start-of-turn (legendary, turn income, weapon/mount), each player spends
 * up to this many actions per turn on:
 *
 * 1. **Move** — map movement (one `move` slot per **leg**: spend mount MP across one or more `moveToLocation` calls
 *    until MP hits 0; then the next map move starts a new leg and consumes another slot. A **non-move** slot refreshes MP to a new leg budget.)
 * 2. **Use an action on a card** — `card`.
 * 3. **Fight a player** — `fight` (arrest / duel / rob sub-flow in `G.fight`).
 * 4. **Take a location action** — `location` (work, saloon, mine, bank, doctor, cabaret, ranch, store, …).
 *
 * Tracked in {@link WesternLegendsPlayer.turnActions} and enforced in `game.ts` via
 * `ensureMoveSlotOrReject` / `takeDiscreteTurnSlot`.
 */
export const TURN_ACTIONS_PER_TURN = 3;

/** Base {@link TURN_ACTIONS_PER_TURN} + bonuses (Determination, cattle, …). Matches `maxDiscreteTurnSlots` in `game.ts`. */
export function maxDiscreteTurnSlotsForPlayer(p: { bonusTurnSlots?: number } | null | undefined): number {
	const b = p?.bonusTurnSlots ?? 0;
	return TURN_ACTIONS_PER_TURN + Math.max(0, Math.floor(b));
}

/**
 * One slot consumed on the current turn during the action phase (rulebook A–D).
 * Each `move` entry is one **move leg** (you may spend that leg’s MP over several `moveToLocation` calls until MP reaches 0).
 */
export type TurnActionKind = 'move' | 'card' | 'fight' | 'location';

export const TURN_ACTION_LETTER: Record<TurnActionKind, string> = {
  move: 'A',
  card: 'B',
  fight: 'C',
  location: 'D',
};

export const TURN_ACTION_RULEBOOK_LABEL: Record<TurnActionKind, string> = {
  move: 'Move',
  card: 'Card',
  fight: 'Fight',
  location: 'Location',
};

/**
 * Space kinds matching the rulebook “Take a location action” list.
 * **Work** only on a location hex ({@link BoardSpaceKind}); see {@link WORK_PAY_GOLD}.
 *
 * Rulebook location names: General Store, Saloon (poker), Mine, Bank, Doctor's Office,
 * Cabaret, Ranch — match {@link BoardSpaceKind} (`playPoker` = Saloon, etc.).
 *
 * Note: General Store and Saloon are sometimes taken from a **neighboring** space on the
 * physical board; here each graph node is “at” that action for the digital map.
 */
export type BoardSpaceKind =
  | 'generalStore'
  | 'playPoker'
  | 'prospectGold'
  | 'bank'
  | 'doctor'
  | 'cabaret'
  | 'ranch';

/** English base rulebook (opens in Google Drive). */
export const RULEBOOK_URL =
  'https://drive.google.com/file/d/1uZ-wa4uRlnLda8YAqkmVKET1k7hH-84q/view?usp=sharing';

/** Work — gain $10 (gold stands in for dollars in this prototype). */
export const WORK_PAY_GOLD = 10;

/** Saloon — $10 ante; full flop rules simplified here. */
export const POKER_ANTE_GOLD = 10;

/** Saloon adds this much gold to the pot (winner takes ante + house). */
export const SALOON_HOUSE_ADDS_TO_POT = 50;

/** Saloon — winner gains this many LP in addition to the pot. */
export const SALOON_WIN_LEGEND_POINTS = 1;

/**
 * Stick Em Up (6): each play reduces the opponent’s fight card by this many rank steps (rulebook: by 2).
 * Stored cumulatively on {@link FightState.challengerFightRankPenalty} / {@link FightState.defenderFightRankPenalty}.
 */
export const STICK_EM_UP_RANK_STEPS_PER_PLAY = 2;

/** Cattle wrangle — end move at rail station (`rs-1`). */
export const WRANGLE_MARSHAL_POINTS = 1;
export const WRANGLE_BONUS_GOLD = 20;

/** Cattle rustle — end move at a different ranch than acquisition. */
export const RUSTLE_WANTED_POINTS = 1;
export const RUSTLE_BONUS_GOLD = 20;

/** General Store — max miscellaneous items (hat, map, …). */
export const GENERAL_STORE_MAX_MISC_ITEMS = 3;

export type CattleTokenColor = 'green' | 'blue';

/** Eight cattle token faces (same multiset for green and blue piles; shuffled separately at setup). Rustle resolution only. */
export const CATTLE_TOKEN_FACE_IDS = [
	'cattle-prospect-die',
	'cattle-nugget',
	'cattle-gold10-extra-action',
	'cattle-gold40',
	'cattle-lp1',
	'cattle-gold30-heal-wound',
	'cattle-marshal-or-wanted',
	'cattle-gold30-draw',
] as const;

export type CattleTokenFaceId = (typeof CATTLE_TOKEN_FACE_IDS)[number];

export const CATTLE_TOKEN_FACE_LABELS: Record<CattleTokenFaceId, string> = {
	'cattle-prospect-die': 'Roll 1 prospect die (+1 card if gravel)',
	'cattle-nugget': 'Gain 1 gold nugget',
	'cattle-gold10-extra-action': 'Gain $10 and 1 extra action',
	'cattle-gold40': 'Gain $40',
	'cattle-lp1': 'Gain 1 LP',
	'cattle-gold30-heal-wound': 'Gain $30 and heal 1 wound',
	'cattle-marshal-or-wanted': 'Gain 1 Marshal or 1 Wanted',
	'cattle-gold30-draw': 'Gain $30 and draw 1 poker card',
};

/** Carried token: face is assigned from the matching pile at pickup. */
export interface CarriedCattle {
	color: CattleTokenColor;
	face: CattleTokenFaceId;
}

export interface CattlePiles {
	green: CattleTokenFaceId[];
	blue: CattleTokenFaceId[];
}

/** Migrated saves that only stored color — arbitrary stable default face until rustle. */
export const CATTLE_LEGACY_DEFAULT_FACE: CattleTokenFaceId = 'cattle-gold40';

/**
 * Purchase / upgrade price in gold (dollars).
 * Base items match the English rulebook / CSV; upgrades are expansion pay-again-to-upgrade placeholders.
 */
export const GENERAL_STORE_PRICES: Record<string, number> = {
  map: 10,
  mule: 20,
  mustang: 50,
  provisions: 20,
  revolver: 20,
  rifle: 40,
  shotgun: 30,
  hat: 20,
  whiskey: 10,
  /** Upgrades: pay the same dollar cost again to flip (rulebook). */
  revolver_upgrade: 20,
  rifle_upgrade: 40,
  shotgun_upgrade: 30,
  mule_upgrade: 20,
  mustang_upgrade: 50,
};

/** Doctor's Office (heal) — pay $10, clear wounds, draw 1 poker card per wound removed. */
export const HEAL_COST_GOLD = 10;

/** Cabaret (revel) — $30 per 1 LP (up to $120 / 4 LP in the rulebook). */
export const REVEL_GOLD_PER_LP = 30;

/** Deposit nuggets — per nugget sold: $20 + 1 LP. */
export const DEPOSIT_GOLD_PER_NUGGET = 20;
export const DEPOSIT_LP_PER_NUGGET = 1;

/** Heist — defeat guard: $80 + 3 Wanted (stub); lose: 1 Wanted, 1 wound, draw 1 poker. */
/** @deprecated Use {@link isLivingLegendCardId} — all four Aces are Living Legend. */
export const LIVING_LEGEND_POKER_CARD_ID = 'A-hearts';

export function isLivingLegendCardId(cardId: string): boolean {
	return cardId.startsWith('A-');
}

export const HEIST_WIN_GOLD = 80;
export const HEIST_WIN_WANTED = 3;
export const HEIST_LOSE_WANTED = 1;

/** Prospect dice — max nuggets carried (rulebook). */
export const MAX_NUGGETS = 4;

/** Rulebook money cap (prototype uses gold as dollars). */
export const MAX_PLAYER_GOLD = 120;

/** Prospecting — tailings / gold dust money result (+$10 each). */
export const PROSPECT_TAILINGS_GOLD = 10;

export const LEGEND_POINTS_TO_WIN = 25;
export const SHORT_GAME_LEGEND_GOAL = 15;

/**
 * Legendary actions only apply after the player has at least this many LP (legend / victory points).
 * Automated start-of-turn effects in {@link ./game.ts} use the same gate.
 */
export const LEGENDARY_ACTION_MIN_LP = 1;

/** Rulebook turn income — pick one after start-of-turn / legendary effects. */
export const START_TURN_INCOME_GOLD_ONLY = 20;
export const START_TURN_INCOME_DRAW = 2;
export const START_TURN_INCOME_SPLIT_GOLD = 10;
export const START_TURN_INCOME_SPLIT_DRAW = 1;

export type StartTurnIncomeOption = 'gold20' | 'draw2' | 'gold10draw1';
export const MAX_ROUNDS = 24;
/** Base game story deck: 40 unique cards (four backs × 10); see `src/data/storyCards.ts`. */
export const STORY_DECK_SIZE = 40;

/** End of turn: story cards resolve when they have at least this many discs (by player count). */
export function storyDiscsRequiredToResolve(numPlayers: number, manInBlackActive?: boolean): number {
  if (manInBlackActive && numPlayers === 2) return 3;
  return numPlayers <= 4 ? 2 : 3;
}

// ---------------------------------------------------------------------------
// Setup & state
// ---------------------------------------------------------------------------

export interface WesternLegendsSetupData {
  legendGoal?: number;
  shortGame?: boolean;
  /** Goals variant: at end scoring, +1 LP per legendary goal token earned (see `legendaryGoalTokens`). */
  goalsVariant?: boolean;
  /** 2P Man in Black variant (ignored unless `numPlayers === 2`). */
  manInBlack?: boolean;
  /** Seat 0 (host) plays this faction; seat 1 drafts from the opposite pool (Jesse/Billy vs Wyatt/Bass). */
  hostFaction?: 'outlaw' | 'marshal';
}

/** Payload stored in `ctx.gameover` after final scoring. */
export type WesternLegendsGameOver =
  | { winner: string }
  | { sharedWinners: string[] }
  | { manInBlackWins: true };

/** Sentinel defender id for Man in Black fights (not a boardgame.io seat). */
export const MAN_IN_BLACK_FIGHT_DEFENDER_ID = '__mib__';

/** MIB deck card ids (`mib-01`…`mib-10` or legacy stubs). */
export type ManInBlackDeckCardId = string;

/** When MIB resolution needs a player action before the round’s pass can finish endgame bookkeeping. */
export type ManInBlackPendingState =
	| {
			kind: 'interaction';
			mibCardId: string;
			interaction: 'duel' | 'rob';
			targetPlayerId: string;
			leadersTied: boolean;
	  }
	| {
			kind: 'discardBoth';
			mibCardId: string;
			/** Player who still must discard (the other already did). */
			awaitingPlayerId: string;
	  }
	| {
			kind: 'cabaretProxyPick';
			inRfPlayerId: string;
			proxyPlayerId: string;
			/** Two card ids dealt to the in–Red-Falls player for this showdown. */
			inRfCardIds: [string, string];
			/** Four card ids drawn for the MIB proxy (must pick 2 for showdown). */
			mibPoolCardIds: [string, string, string, string];
	  };

/** Why {@link mibDeferredPass} was stored — drives {@link finishMibDeferredProgressEndgame} completion path. */
export type MibDeferredPassPurpose = 'resumeRoundPass' | 'completeEpilogue';

/** Snapshot so {@link progressEndgameAfterPass} runs with the passer who completed the round after MIB chain ends. */
export interface MibDeferredPassContext {
	passerPlayerId: string;
	purpose: MibDeferredPassPurpose;
}

export interface ManInBlackState {
  locationId: string;
  legendaryPoints: number;
  /** Scoring cube color (distinct from both players when possible). */
  color: PlayerColor;
  deck: string[];
  discard: string[];
}

export interface GameLogEntry {
  message: string;
  playerColor?: PlayerColor;
}

export interface WesternLegendsPlayer {
  color: PlayerColor;
  /** Two draft offers (starter character ids); cleared after the player chooses one. */
  characterOffers: [string, string] | null;
  /** Filled when the player commits to a starter character. */
  characterId: string | null;
  locationId: string;
  /**
   * Mount MP **remaining in the current move leg** (0 = leg exhausted; next `moveToLocation` starts a new leg and
   * consumes another `move` slot). Set to the equipped mount’s budget at turn start and after each non-move slot.
   */
  movementPointsLeft: number;
  /**
   * Snapshot of {@link movementPointsLeft} before the last `takeDiscreteTurnSlot` call, so failed moves can
   * restore it after `turnActions.pop()`. Cleared on the next map move and turn start.
   */
  movementPointsLeftBeforeDiscreteAction?: number;
  /** Dollars in the rulebook; one “gold” unit = $1 for the prototype UI. */
  gold: number;
  legendaryPoints: number;
  /** Rulebook wounds (hand size / effects). */
  wounds: number;
  /** Gold nuggets (max {@link MAX_NUGGETS}). */
  nuggets: number;
  /** Carrying at most one cattle token at a time (face from pile at pickup). */
  carriedCattle: CarriedCattle | null;
  /**
   * Extra A/B/C/D slots this turn from cattle token face (cleared each `turn.onBegin`).
   */
  bonusTurnSlots?: number;
  /**
   * After a rustle resolves a “Marshal or Wanted” cattle face — must `chooseCattleTrackReward` before other moves.
   */
  pendingCattleMarshalOrWanted?: boolean;
  /** Wanted track (Heist and other effects). */
  wantedPoints: number;
  /** Marshal track (law / alignment; starter kit and future rules). */
  marshalPoints: number;
  /**
   * Goals variant only: count of legendary goal tokens earned (end scoring adds this many LP when enabled).
   * Omitted in older saves — treated as 0.
   */
  legendaryGoalTokens?: number;
  hand: Card[];
  /** Rulebook: up to {@link TURN_ACTIONS_PER_TURN} actions this turn; cleared on your next turn start. */
  turnActions: TurnActionKind[];
  /**
   * True until the player resolves {@link StartTurnIncomeOption} for this turn (after legendary start effects).
   * Omitted on older persisted states — treated as resolved until the next `turn.onBegin` sets it.
   */
  needsStartTurnIncomeChoice?: boolean;
  /** Item ids ({@link ./equipment}) the player owns — weapons for fights / gear. */
  ownedWeaponItemIds: string[];
  /** Owned mounts (mule, mustang, upgrades). */
  ownedMountItemIds: string[];
  /** General Store miscellaneous items (max {@link GENERAL_STORE_MAX_MISC_ITEMS}). */
  ownedMiscItemIds: string[];
  /** Bank heist: at most once per turn. */
  usedHeistThisTurn: boolean;
  /**
   * Player ids you may not start another arrest / duel / rob against this turn (you and that opponent each get the pairing when a fight begins).
   * Cleared on your `turn.onBegin` with `turnActions`. Omitted in older states — backfilled in `migratePlayerItemsIfMissing`.
   */
  pvpFightTargetsThisTurn?: string[];
  /**
   * Living Legend (Ace): at most one per turn. Cleared on turn begin.
   * @deprecated Legacy key — migrated from `usedReputationCardThisTurn`.
   */
  usedReputationCardThisTurn?: boolean;
  /** Living Legend (any Ace) B-slot play; at most once per turn. */
  usedLivingLegendThisTurn?: boolean;
  /** Reputation (7) reaction; at most once per turn (does not consume an A/B/C/D slot). */
  usedReputationSevenThisTurn?: boolean;
  /** You gained Marshal or Wanted this turn — may react with a 7 for +1 LP. */
  pendingReputationSevenReaction?: boolean;
  /** After your last map move this turn — may play Sprint (3) for +2 MP this leg. */
  pendingSprintAfterMove?: boolean;
  /** After your last map move with others in your space — may play Wallop (8♣/8♠). */
  pendingWallopAfterMove?: boolean;
  /** Equipped weapon this turn (`null` = none). Set after turn income or via `chooseTurnWeaponMount`. */
  turnWeaponItemId: string | null;
  turnMountItemId: string | null;
  /**
   * True when the player must pick among multiple owned weapons and/or mounts (after turn income).
   * If at most one weapon and at most one mount, loadout is auto-filled and this stays false.
   */
  needsTurnWeaponMountChoice?: boolean;
  /**
   * After prospecting with Miner's Map: applied outcomes per die slot (0 and 1), for undo + one free reroll of a slot
   * (same prospect action — does not consume an extra A/B/C/D slot). Cleared after reroll, when the mining summary is
   * dismissed (forfeit), or at turn start.
   */
  prospectMapRerollDice?: ProspectMapDieOutcome[] | null;
  /**
   * After a `moveToLocation` that ended sharing your hex with another player, you may spend **B** to
   * discard Whiskey and give one of them 1 wound. Cleared on the next move, after use, or turn start.
   */
  whiskeyReactionAvailable?: boolean;
  /**
   * When this equals {@link locationId}, further General Store purchases on this visit do not consume
   * another location turn slot (first buy on this hex after a move pays one `location` action).
   * Cleared on `moveToLocation` and each turn `onBegin`.
   */
  generalStoreVisitPaidLocationId?: string | null;
  /**
   * After winning vs a bandit — choose +1 LP or +1 MP (wanted players auto-get LP only).
   */
  pendingBanditBountyChoice?: boolean;
  /**
   * During bandit fight card resolution — fighter must resolve fc-7 / fc-9 / fc-A choice.
   */
  pendingBanditFightFighterChoice?: 'fc-7' | 'fc-9' | 'fc-A';
}

/**
 * After the sheriff NPC moves onto wanted player(s): forced discards and, if multiple wanted, who is arrested.
 * Cleared when the sheriff arrest fight starts or is aborted.
 */
export type SheriffEncounterPhase = 'chooseTarget' | 'discard';

export interface SheriffEncounterState {
  phase: SheriffEncounterPhase;
  /** Hex the sheriff just entered. */
  spaceId: string;
  /** All wanted players (≥1 WP) sharing that hex when the sheriff arrived. */
  wantedPlayerIds: string[];
  /** Seat that moved the sheriff (story / Manhunt / debug move) — picks arrest target when multiple wanted. */
  moverId: string;
  /** Set after {@link SheriffEncounterPhase chooseTarget} or immediately when only one wanted. */
  arrestTargetId: string | null;
  /** Wanted players who still owe 1 poker discard to the sheriff arrival. */
  pendingDiscardPlayerIds: string[];
}

/** Player vs player: arrest / duel / rob. `bandit` / `sheriffArrest` / `manInBlack` = NPC fights (special ordering). */
export type FightKind = 'arrest' | 'duel' | 'rob' | 'bandit' | 'sheriffArrest' | 'manInBlack';

export type FightOutcome = 'challengerWins' | 'defenderWins';

/** On identical fight cards, this side is treated as the winner. */
export const FIGHT_TIE_WINS: 'challenger' | 'defender' = 'defender';

export type FightPhase =
  | 'startEffects'
  | 'challengerCard'
  | 'defenderChoice'
  | 'reaction'
  | 'banditFightCard'
  | 'sheriffFightCard'
  | 'rewardRob'
  | 'outcome';

export type FightStartEffectKind = 'annieOakleyOpponent';

/** One start-of-fight effect waiting for {@link actorId} to resolve (alternating order). */
export interface FightStartEffectStep {
  actorId: string;
  kind: FightStartEffectKind;
}

/** Board NPCs for story cards and map display (not player seats). */
export type BoardNpcKind = 'sheriff' | 'bandit';

export interface BoardNpc {
  id: string;
  kind: BoardNpcKind;
  spaceId: string;
}

export interface FightState {
  challengerId: string;
  defenderId: string;
  kind: FightKind;
  phase: FightPhase;
  startEffectQueue: FightStartEffectStep[];
  startEffectQueueIndex: number;
  /** Removed from hand when committed; hidden from opponent until reaction phase (see `stripSecretInfo`). */
  challengerCommittedCard: StandardCard | null;
  defenderCommittedCard: StandardCard | null;
  defenderDeclined: boolean;
  /** Set after reveal (or on decline). Drives reward phase. */
  outcome: FightOutcome | null;
  /** Set when entering reaction (after compare / downgrade). */
  revealCompareSummary: string | null;
  /**
   * Snapshot of committed poker cards for the result screen (set before discard).
   * Visible to both duelists in `phase === 'outcome'` (see `stripSecretInfo`).
   */
  outcomeReveal?: { challenger: StandardCard | null; defender: StandardCard | null } | null;
  reactionTurn: 'challenger' | 'defender';
  /** Two consecutive passes end the reaction phase and clear the fight. */
  reactionConsecutivePasses: number;
  /** Bandit NPC being fought (`kind === 'bandit'`). */
  banditNpcId?: string;
  /** Two fight cards drawn for this bandit fight; controller picks one to apply. */
  npcFightCardOptions?: readonly [FightCardFaceId, FightCardFaceId];
  /** Which option was applied (the other is returned under the deck without effect). */
  npcFightCardApplied?: FightCardFaceId | null;
  /** fc-5 / fc-9: fighter cannot choose Marshal for bandit bounty. */
  banditBountyMarshalBlocked?: boolean;
  /** Four fight cards drawn for `sheriffArrest`; sheriff controller picks one to apply before poker compare. */
  sheriffFightCardOptions?: readonly [FightCardFaceId, FightCardFaceId, FightCardFaceId, FightCardFaceId];
  sheriffFightCardApplied?: FightCardFaceId | null;
  /** Stick Em Up: total rank steps removed from challenger’s committed card ({@link STICK_EM_UP_RANK_STEPS_PER_PLAY} per 6 played). */
  challengerFightRankPenalty?: number;
  /** Stick Em Up: total rank steps removed from defender’s committed card ({@link STICK_EM_UP_RANK_STEPS_PER_PLAY} per 6 played). */
  defenderFightRankPenalty?: number;
  /** Quickdraw (Q committed as fight card): next bandit/sheriff fight card effect on fighter is canceled. */
  quickdrawNegatesFightCard?: boolean;
  /** Man in Black: three fight cards drawn; highest used as MIB’s effective card. */
  mibFightCardTriplet?: readonly [FightCardFaceId, FightCardFaceId, FightCardFaceId];
  /** Face used for poker compare after picking highest of triplet. */
  mibFightCardResolved?: FightCardFaceId | null;
  /** When {@link kind} is `manInBlack`, whether this was declared as duel or rob. */
  manInBlackFightKind?: 'duel' | 'rob';
}

/** One in-play story card (face down on the table until it resolves; slot 0 = left, slot 1 = right; see {@link WesternLegendsState.storyInPlay}). */
export interface StoryInPlayEntry {
  cardId: string;
  discs: number;
  /**
   * Player id per printed disc slot (left→right). Use `null` or omit trailing slots for empty circles.
   * When omitted entirely, the UI may show legacy neutral discs for the first `discs` slots only.
   */
  discSlotPlayerIds?: (string | null)[];
}

export interface WesternLegendsState extends BaseGameState {
  round: number;
  turnOrderIndex: number;
  players: Record<string, WesternLegendsPlayer>;
  pokerDeck: StandardCard[];
  pokerDiscard: StandardCard[];
  /**
   * Saloon (poker) round state. When non-null, eligible players in the same town must
   * `joinSaloon` or `skipSaloon` before the round resolves. Active player breaks ties.
   */
  saloonRound: SaloonRoundState | null;
  /**
   * After a Saloon round ends, public showdown summary until the `dismissSaloonReveal` move.
   * Hole cards and scores are visible to all seats (post-reveal).
   */
  saloonReveal: SaloonRevealState | null;
  /**
   * After Mine — prospect for gold: die sequences and outcome lines until `dismissProspectReveal`.
   * Only the mining seat should see the overlay; dismiss is restricted to that seat on the server.
   */
  prospectReveal: ProspectRevealState | null;
  /**
   * In-progress player fight (declaration → reveal → reactions). When non-null, most other moves are blocked.
   */
  fight: FightState | null;
  /**
   * Sheriff arrival resolution (discards + arrest target) before `sheriffArrest` fight state is created.
   */
  sheriffEncounter: SheriffEncounterState | null;
  /**
   * Copies remaining for each base General Store item (nine types × 6 in the box).
   * Upgrades do not use this stock.
   */
  generalStoreStock: Record<string, number>;
  /** Two face-down piles (half of the shuffled 40-card story deck each). */
  storyDeckLeft: string[];
  storyDeckRight: string[];
  /** Resolved stories (bookkeeping; the two map piles are `storyDeckLeft` / `storyDeckRight`). */
  storyDiscard: string[];
  /**
   * Two board slots: left pile / right pile. `null` = empty slot (refill next deal).
   * After a story resolves on `pass`, the card is discarded and the next id is drawn from that side’s deck only.
   */
  storyInPlay: [StoryInPlayEntry | null, StoryInPlayEntry | null];
  /**
   * After `pass` when one or more stories met the disc threshold: show printed **front** at that slot until next turn.
   * Cleared in `turn.onBegin`. Omitted when none resolved this pass.
   */
  storyResolvedReveal?: { reveals: { slotIndex: 0 | 1; cardId: string }[] } | null;
  /** Sheriff (Darkrock office), bandits on hideouts — authoritative for story / future moves. */
  boardNpcs: BoardNpc[];
  /** Remaining cattle tokens by herd color (next pickup pops from front). */
  cattlePiles: CattlePiles;
  /** Fight card deck (NPC encounters). Next draw pops from front; order is secret to clients. */
  fightDeck: FightCardFaceId[];
  fightDiscard: FightCardFaceId[];
  endGameScored: boolean;
  endGameScoreBreakdown: Record<string, { label: string; vp: number }[]>;
  gameLog: GameLogEntry[];
  legendGoal: number;
  /** Copied from setup; when true, {@link performEndGameScoring} adds LP from {@link WesternLegendsPlayer.legendaryGoalTokens}. */
  goalsVariant?: boolean;
  /**
   * `none` until someone reaches `legendGoal` at end of pass; then `finish_round` / `final_round`; `done` triggers `endIf`.
   * Omitted in older saves — treated as `none`.
   */
  endgamePhase?: WesternLegendsEndgamePhase;
  /** Seat that first reached `legendGoal` when epilogue started (log / UI). */
  endgameTriggeredByPlayerId?: string | null;
  /** Passes remaining (excluding trigger pass) to complete the interrupted round. */
  endgamePartialPassesRemaining?: number;
  /** Passes remaining in the rulebook “one last turn each” round. */
  endgameFinalPassesRemaining?: number;
  /**
   * 2P Man in Black variant: NPC state. Omitted when variant off or player count ≠ 2.
   */
  manInBlack?: ManInBlackState | null;
  /** Copied from setup when MIB is active. */
  manInBlackVariant?: boolean;
  /** MIB reached legend goal first (drives epilogue). */
  endgameTriggeredByManInBlack?: boolean;
  /** After final human passes in epilogue, resolve one MIB stub turn before `endIf`. */
  endgamePendingMibFinalTurn?: boolean;
  /** Set after MIB epilogue stub runs in final round (MIB variant). */
  endgameMibEpilogueResolved?: boolean;
  /**
   * Man in Black card mid-resolution (interaction fight/rob, discards, cabaret proxy pick).
   * When set, {@link progressEndgameAfterPass} is deferred until cleared.
   */
  manInBlackPending?: ManInBlackPendingState | null;
  /** Passer to use when running deferred {@link progressEndgameAfterPass} after MIB pending clears. */
  mibDeferredPass?: MibDeferredPassContext | null;
}

/** Heads-up Saloon: active vs clockwise dealer (ephemeral dealer hole cards). */
export interface SaloonDealerShowdownState {
  dealerId: string;
  /** Full cards on the server; redacted to hidden placeholders for non-dealer clients in `stripSecretInfo`. */
  dealerHoleCards: Card[];
  /** Best two hole cards for the dealer (ids in `dealerHoleCards`). */
  dealerPickCardIds: [string, string];
}

export interface SaloonRoundState {
  /** The player who initiated the Saloon location action. */
  activePlayerId: string;
  cityId: BoardCityId;
  flop: StandardCard[];
  potGold: number;
  /** Players who still need to respond (join / skip). */
  pendingPlayerIds: string[];
  /** Players participating in the showdown (includes active player). */
  joinedPlayerIds: string[];
  /** When tied top hands exist and the active player must pick a winner. */
  tieBreakCandidateIds: string[] | null;
  /**
   * When only the active player joined and the join phase is done: pick 2 hole cards vs dealer.
   * Null while waiting on joins or in multi-player immediate resolve path.
   */
  dealerShowdown: SaloonDealerShowdownState | null;
}

/** One row in the post-Saloon reveal (best two hole cards used with the flop, or full-hand pick in multi-player). */
export interface SaloonRevealEntry {
  playerId: string;
  /** Dealer uses `dealer` so the UI can label “Dealer (seat N)”. */
  role: 'player' | 'dealer';
  holeCards: StandardCard[];
  score: PokerScore;
}

export interface SaloonRevealState {
  cityId: BoardCityId;
  flop: StandardCard[];
  /** Best poker hand first. */
  ranked: SaloonRevealEntry[];
  winnerId: string | null;
  potGold: number;
  /** Gold actually gained by the winner this resolution (0 if dealer won or no payout). */
  winnerGold: number;
  winnerLegendPoints: number;
  notes?: string[];
}

/** Client animates dice using `slots`, then shows `summaries` (same strings as the game log). */
export interface ProspectRevealState {
  playerId: string;
  slots: ProspectSlotFaces[];
  summaries: string[];
}
