/**
 * Western Legends — **Base Game** component counts (reference).
 *
 * Sourced from `Western_Legends_Complete_Card_List.csv` (rows where
 * `Expansion / Set` = `Base Game`). Expansion-only rows are omitted here.
 *
 * The digital prototype uses a generic 52-card poker deck ({@link createStandardDeck})
 * with blackjack-style values; physical Base poker cards use the printed ability names
 * on each rank/suit (see CSV “Card Name” / “Card #” columns).
 */
export const WESTERN_LEGENDS_BASE_SET = {
  characters: 12,
  /** Standard poker deck with WL-themed faces — one per rank/suit. */
  pokerCards: 52,
  /** Man in Black mini deck:1 rules + 10 numbered cards in the CSV. */
  manInBlack: 11,
  /** Item tokens (each type appears ×6 in the CSV). */
  itemTypes: 9,
  itemTokensEach: 6,
  /** Per-base-character goal cards ×4 each. */
  goalCards: 12 * 4,
  fightDeckRanks: 13,
  money10: 36,
  money20: 18,
} as const;

/** Sum of item mini cards in the box (9 types × 6). */
export const BASE_SET_ITEM_MINI_COUNT =
  WESTERN_LEGENDS_BASE_SET.itemTypes * WESTERN_LEGENDS_BASE_SET.itemTokensEach;
