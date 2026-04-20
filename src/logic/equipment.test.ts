import { describe, expect, it } from 'vitest';
import { generalStoreStockLineId, ITEM_UPGRADE_BASE, upgradeItemIdForBase } from './equipment';

describe('generalStoreStockLineId', () => {
  it('maps upgrades to their base store line', () => {
    for (const [up, base] of Object.entries(ITEM_UPGRADE_BASE)) {
      expect(generalStoreStockLineId(up)).toBe(base);
    }
  });

  it('maps base weapon/mount and misc ids to themselves when in the store catalog', () => {
    expect(generalStoreStockLineId('revolver')).toBe('revolver');
    expect(generalStoreStockLineId('mule')).toBe('mule');
    expect(generalStoreStockLineId('map')).toBe('map');
  });
});

describe('upgradeItemIdForBase', () => {
  it('returns the upgrade id for each base line that has one', () => {
    expect(upgradeItemIdForBase('revolver')).toBe('revolver_upgrade');
    expect(upgradeItemIdForBase('mustang')).toBe('mustang_upgrade');
  });

  it('returns null for misc lines without an upgrade', () => {
    expect(upgradeItemIdForBase('map')).toBeNull();
    expect(upgradeItemIdForBase('hat')).toBeNull();
  });
});
