import type { BaseGameState, Card } from '@engine/client';
import type { StandardCard } from '@engine/client';
import type { BoardCityId } from '../map/boardSpaces';

// ---------------------------------------------------------------------------
// Colours & board spaces (map icon locations — see rulebook “location actions”)
// ---------------------------------------------------------------------------

export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow' | 'black' | 'orange';

export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue', 'green', 'yellow', 'black', 'orange'];

/**
 * **Action phase** — after start-of-turn (legendary, turn income, weapon/mount), each player spends
 * up to this many actions per turn on:
 *
 * 1. **Move** — map movement (one `move` slot; further hex moves reuse it).
 * 2. **Use an action on a card** — `card`.
 * 3. **Fight a player** — `fight` (rulebook: arrest, duel, rob, etc.; prototype uses a single duel-style move).
 * 4. **Take a location action** — `location` (work, saloon, mine, bank, doctor, cabaret, ranch, store, …).
 *
 * Tracked in {@link WesternLegendsPlayer.turnActions} and enforced in `game.ts` via
 * `ensureMoveSlotOrReject` / `takeDiscreteTurnSlot`.
 */
export const TURN_ACTIONS_PER_TURN = 3;

/**
 * One slot consumed on the current turn during the action phase (rulebook A–D).
 * `move` is consumed once per turn; additional `moveToLocation` calls do not consume extra slots.
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

/** Cattle wrangle — end move at rail station (`rs-1`). */
export const WRANGLE_MARSHAL_POINTS = 1;
export const WRANGLE_BONUS_GOLD = 20;

/** Cattle rustle — end move at a different ranch than acquisition. */
export const RUSTLE_WANTED_POINTS = 1;
export const RUSTLE_BONUS_GOLD = 20;

/** General Store — max miscellaneous items (hat, map, …). */
export const GENERAL_STORE_MAX_MISC_ITEMS = 3;

export type CattleTokenColor = 'green' | 'blue';

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
/** Stub story deck size — CSV lists no “Story, Base Game” rows; size TBD from rulebook. */
export const STORY_DECK_SIZE = 18;

/** End of turn: story cards resolve when they have at least this many discs (by player count). */
export function storyDiscsRequiredToResolve(numPlayers: number): number {
  return numPlayers <= 4 ? 2 : 3;
}

// ---------------------------------------------------------------------------
// Setup & state
// ---------------------------------------------------------------------------

export interface WesternLegendsSetupData {
  legendGoal?: number;
  shortGame?: boolean;
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
  /** Movement points left this turn (reset at turn start; each graph edge costs 1). */
  movementPointsLeft: number;
  /** Dollars in the rulebook; one “gold” unit = $1 for the prototype UI. */
  gold: number;
  legendaryPoints: number;
  /** Rulebook wounds (hand size / effects). */
  wounds: number;
  /** Gold nuggets (max {@link MAX_NUGGETS}). */
  nuggets: number;
  /** Carrying at most one cattle token at a time. */
  carriedCattle: CattleTokenColor | null;
  /** Wanted track (Heist and other effects). */
  wantedPoints: number;
  /** Marshal track (law / alignment; starter kit and future rules). */
  marshalPoints: number;
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
  /** Equipped weapon this turn (`null` = none). Set after turn income or via `chooseTurnWeaponMount`. */
  turnWeaponItemId: string | null;
  turnMountItemId: string | null;
  /**
   * True when the player must pick among multiple owned weapons and/or mounts (after turn income).
   * If at most one weapon and at most one mount, loadout is auto-filled and this stays false.
   */
  needsTurnWeaponMountChoice?: boolean;
  /**
   * After prospecting, optional Miner's Map reroll: per-die outcomes so one die can be replaced (card action).
   * Cleared after reroll or at turn start.
   */
  prospectMapRerollDice?: Array<{
    face: 'nugget' | 'tailings' | 'goldDust' | 'gravel';
    nuggetAdded: boolean;
    goldAdded: number;
  }> | null;
  /**
   * After a `moveToLocation` that ended sharing your hex with another player, you may spend **B** to
   * discard Whiskey and give one of them 1 wound. Cleared on the next move, after use, or turn start.
   */
  whiskeyReactionAvailable?: boolean;
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
   * Copies remaining for each base General Store item (nine types × 6 in the box).
   * Upgrades do not use this stock.
   */
  generalStoreStock: Record<string, number>;
  storyDeck: string[];
  storyDiscard: string[];
  /**
   * Story cards in play with contribution discs. End of turn: when {@link storyDiscsRequiredToResolve}
   * is met, the card is discarded (rewards stub — log only).
   */
  storyInPlay: { cardId: string; discs: number }[];
  endGameScored: boolean;
  endGameScoreBreakdown: Record<string, { label: string; vp: number }[]>;
  gameLog: GameLogEntry[];
  legendGoal: number;
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
}
