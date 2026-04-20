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

/**
 * Short summaries for store buy buttons — aligned with this prototype’s rules, not a full rulebook.
 * Keys match {@link ../logic/types#GENERAL_STORE_PRICES}.
 */
export const GENERAL_STORE_ITEM_TOOLTIPS: Record<string, string> = {
	map: 'After prospecting, reroll one prospect die once as part of that same prospect action (Miners Map).',
	mule: 'Mount: 2 movement points per move; carry up to 6 nuggets (base cap is 4).',
	mustang: 'Mount: 4 movement points per move.',
	provisions:
		'B action (once per turn): discard Provisions to draw 1 poker card and remove 1 wound.',
	revolver: 'Weapon: choose each turn for location duels (5-card poker hands).',
	rifle:
		'Weapon: duels — defender must discard 1 poker card or take 1 wound at fight start; in saloon poker you may peek the defender’s hole cards.',
	shotgun: 'Weapon: duels — if you win, draw 1 poker card.',
	hat: 'Misc: saloon winner +1 LP; +$10 gold when your hat triggers on some post-showdown card draws.',
	whiskey:
		'Buy: remove 1 wound. After you move onto another player’s hex, B action — discard Whiskey to give them 1 wound.',
	revolver_upgrade:
		'Upgrade (own Revolver): flip — in duels the defender may force you to downgrade one card; +1 LP when flipped.',
	rifle_upgrade:
		'Upgrade (own Rifle): flip — defender may downgrade one of your duel cards; +1 LP when flipped.',
	shotgun_upgrade:
		'Upgrade (own Shotgun): flip — win a duel to draw 1 poker card; +1 LP when flipped.',
	mule_upgrade: 'Upgrade (own Mule): 4 MP per move; same raised nugget cap; +1 LP when flipped.',
	mustang_upgrade: 'Upgrade (own Mustang): 5 MP per move; +2 LP when flipped.',
};

export function itemCardImageUrl(itemId: string): string {
  return `/images/item_${itemId}.png`;
}

export function itemCardBackUrl(): string {
  return ITEM_CARD_BACK_URL;
}
