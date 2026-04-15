import { describe, expect, it } from 'vitest';
import { generalStoreStockLineId, ITEM_UPGRADE_BASE } from './equipment';

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
