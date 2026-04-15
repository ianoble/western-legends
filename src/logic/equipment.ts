/**
 * Item ids for turn loadout (weapons & mounts). Matches {@link ../data/itemCards} slugs.
 */

import { GENERAL_STORE_BASE_ITEM_IDS } from '../data/itemCards';

const GENERAL_STORE_LINE_IDS = new Set<string>(GENERAL_STORE_BASE_ITEM_IDS);

/**
 * General Store stock is tracked per **physical item line** (base id): owning base or upgrade
 * consumes the same pool (flip the card). Misc items use their own base id keys.
 */
export function generalStoreStockLineId(itemId: string): string | null {
  const upgradeBase = ITEM_UPGRADE_BASE[itemId];
  if (upgradeBase != null) return upgradeBase;
  if (GENERAL_STORE_LINE_IDS.has(itemId)) return itemId;
  return null;
}

export const WEAPON_ITEM_IDS = [
  'revolver',
  'rifle',
  'shotgun',
  'revolver_upgrade',
  'rifle_upgrade',
  'shotgun_upgrade',
] as const;

export const MOUNT_ITEM_IDS = ['mule', 'mustang', 'mule_upgrade', 'mustang_upgrade'] as const;

/** General Store “miscellaneous” items (max 3 combined). */
export const MISC_ITEM_IDS = ['map', 'provisions', 'hat', 'whiskey'] as const;

export const WEAPON_ITEM_ID_SET = new Set<string>(WEAPON_ITEM_IDS);
export const MOUNT_ITEM_ID_SET = new Set<string>(MOUNT_ITEM_IDS);
export const MISC_ITEM_ID_SET = new Set<string>(MISC_ITEM_IDS);

/** Upgrade id → base item id (must own base to buy upgrade). */
export const ITEM_UPGRADE_BASE: Record<string, string> = {
  revolver_upgrade: 'revolver',
  rifle_upgrade: 'rifle',
  shotgun_upgrade: 'shotgun',
  mule_upgrade: 'mule',
  mustang_upgrade: 'mustang',
};

export function isMiscItemId(id: string): boolean {
  return MISC_ITEM_ID_SET.has(id);
}

export function uniqueWeaponOptions(owned: string[] | undefined): string[] {
  if (!owned?.length) return [];
  return [...new Set(owned.filter((id) => WEAPON_ITEM_ID_SET.has(id)))].sort();
}

export function uniqueMountOptions(owned: string[] | undefined): string[] {
  if (!owned?.length) return [];
  return [...new Set(owned.filter((id) => MOUNT_ITEM_ID_SET.has(id)))].sort();
}
