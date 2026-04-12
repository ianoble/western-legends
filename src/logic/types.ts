import type { BaseGameState, Card } from '@engine/client';
import type { StandardCard } from '@engine/client';

// ---------------------------------------------------------------------------
// Colours & locations
// ---------------------------------------------------------------------------

export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow' | 'black' | 'orange';

export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue', 'green', 'yellow', 'black', 'orange'];

/**
 * Physical board regions (Western Legends). The digital map still uses abstract
 * {@link LOCATION_DEFS} ids; this list is for UI copy and future %-position overlays.
 */
export const BOARD_REGIONS = [
  'Darkrock',
  'Red Falls',
  "Mesito's Point",
  'Sunny Hills',
  "Spike's View",
  'Cliff Junction',
  'Dixon Creek',
] as const;

export interface LocationDef {
  id: string;
  name: string;
  /** Adjacent location ids (undirected graph). */
  neighbors: string[];
  hasMine?: boolean;
  isSaloon?: boolean;
}

/**
 * Static map: frontier towns and trails (prototype graph).
 * See {@link BOARD_REGIONS} for physical board region names used in UI copy and future overlays.
 */
export const LOCATION_DEFS: Record<string, LocationDef> = {
  nexus: { id: 'nexus', name: 'Crossroads', neighbors: ['tombstone', 'dodge', 'deadwood'] },
  tombstone: { id: 'tombstone', name: 'Tombstone', neighbors: ['nexus', 'virginia', 'dodge'], hasMine: true },
  dodge: { id: 'dodge', name: 'Dodge City', neighbors: ['nexus', 'tombstone', 'abilene'], isSaloon: true },
  deadwood: { id: 'deadwood', name: 'Deadwood', neighbors: ['nexus', 'virginia'], hasMine: true },
  virginia: { id: 'virginia', name: 'Virginia City', neighbors: ['tombstone', 'deadwood', 'abilene'] },
  abilene: { id: 'abilene', name: 'Abilene', neighbors: ['dodge', 'virginia'], isSaloon: true },
};

export const STARTING_LOCATION_ID = 'nexus';

export const LEGEND_POINTS_TO_WIN = 10;
export const GOLD_COST_PER_LEGEND_POINT = 5;
export const MAX_ROUNDS = 24;
export const MINE_GOLD_YIELD = 2;
export const STORY_DECK_SIZE = 18;

// ---------------------------------------------------------------------------
// Setup & state
// ---------------------------------------------------------------------------

export interface WesternLegendsSetupData {
  /** Optional: use a shorter sprint for testing. */
  legendGoal?: number;
  /** Set from host lobby `setupOptions` (short game toggle). */
  shortGame?: boolean;
}

export interface GameLogEntry {
  message: string;
  playerColor?: PlayerColor;
}

export interface WesternLegendsPlayer {
  color: PlayerColor;
  locationId: string;
  gold: number;
  legendaryPoints: number;
  /** Stamina / grit for future combat rules. */
  grit: number;
  /** Hole / hold cards (redacted for opponents in playerView). */
  hand: Card[];
}

export interface WesternLegendsState extends BaseGameState {
  /** Completed full rounds (all players took a turn). */
  round: number;
  /** Next slot to act in round-robin within the round (0 .. numPlayers-1). */
  turnOrderIndex: number;
  players: Record<string, WesternLegendsPlayer>;
  /** Draw pile for poker / duels (order hidden from clients). */
  pokerDeck: StandardCard[];
  pokerDiscard: StandardCard[];
  /** Simple story deck: card type ids; effects stubbed in moves. */
  storyDeck: string[];
  storyDiscard: string[];
  endGameScored: boolean;
  endGameScoreBreakdown: Record<string, { label: string; vp: number }[]>;
  gameLog: GameLogEntry[];
  legendGoal: number;
}
