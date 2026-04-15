/**
 * Item mini card art under `public/images/` (`item_<slug>.png`), aligned with
 * `Western_Legends_Complete_Card_List.csv` where types match.
 *
 * Base game standard items (×6 each in the box): nine types, rows 269–277 in the CSV.
 * Upgrade / expansion arts use the same naming convention; display names note the CSV card when known.
 */

export const ITEM_CARD_BACK_URL = '/images/item_back.png' as const;

export type ItemCardKind = 'standard' | 'upgrade';

export interface ItemCardDef {
  /** Filename slug: `/images/item_${id}.png` */
  id: string;
  /** Rulebook / CSV-style name */
  name: string;
  /** `base` = one of the nine base-game item types */
  set: 'base' | 'fistful' | 'anteUp' | 'other';
  kind: ItemCardKind;
}

/** Every `item_*.png` face in `public/images/` (excluding `item_back.png`). */
export const ITEM_CARD_DEFS: ItemCardDef[] = [
  { id: 'map', name: "Miner's Map", set: 'base', kind: 'standard' },
  { id: 'mule', name: 'Mule', set: 'base', kind: 'standard' },
  { id: 'mustang', name: 'Mustang', set: 'base', kind: 'standard' },
  { id: 'provisions', name: 'Provisions', set: 'base', kind: 'standard' },
  { id: 'revolver', name: 'Revolver', set: 'base', kind: 'standard' },
  { id: 'rifle', name: 'Rifle', set: 'base', kind: 'standard' },
  { id: 'shotgun', name: 'Shotgun', set: 'base', kind: 'standard' },
  { id: 'hat', name: 'Ten-Gallon', set: 'base', kind: 'standard' },
  { id: 'whiskey', name: 'Whiskey', set: 'base', kind: 'standard' },
  // Upgraded faces (same physical mini as base; art filenames stay `*_upgrade`)
  { id: 'mule_upgrade', name: 'Rosinane', set: 'fistful', kind: 'upgrade' },
  { id: 'mustang_upgrade', name: 'Traveller', set: 'anteUp', kind: 'upgrade' },
  { id: 'revolver_upgrade', name: 'Six Iron', set: 'fistful', kind: 'upgrade' },
  { id: 'rifle_upgrade', name: 'Old Betsy', set: 'other', kind: 'upgrade' },
  { id: 'shotgun_upgrade', name: 'Long Tom', set: 'other', kind: 'upgrade' },
];

export const ITEM_CARD_BY_ID: Record<string, ItemCardDef> = Object.fromEntries(
  ITEM_CARD_DEFS.map((d) => [d.id, d]),
);

/** The nine base-game item types (matches {@link WESTERN_LEGENDS_BASE_SET.itemTypes}). */
export const BASE_GAME_ITEM_DEFS: ItemCardDef[] = ITEM_CARD_DEFS.filter((d) => d.set === 'base');

/** General Store: six copies of each base item in the box (CSV rows 269–277). */
export const GENERAL_STORE_COPIES_PER_BASE_ITEM = 6;

/** Base item ids sold at the General Store (same order as {@link BASE_GAME_ITEM_DEFS}). */
export const GENERAL_STORE_BASE_ITEM_IDS: readonly string[] = BASE_GAME_ITEM_DEFS.map((d) => d.id);

export function itemCardImageUrl(itemId: string): string {
  return `/images/item_${itemId}.png`;
}

export function itemCardBackUrl(): string {
  return ITEM_CARD_BACK_URL;
}
