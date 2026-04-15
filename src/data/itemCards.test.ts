import { describe, expect, it } from 'vitest';
import {
  BASE_GAME_ITEM_DEFS,
  GENERAL_STORE_BASE_ITEM_IDS,
  GENERAL_STORE_COPIES_PER_BASE_ITEM,
  ITEM_CARD_DEFS,
  itemCardBackUrl,
  itemCardImageUrl,
} from './itemCards';

describe('itemCards', () => {
  it('has nine base-game item defs', () => {
    expect(BASE_GAME_ITEM_DEFS).toHaveLength(9);
  });

  it('general store base ids match base defs (6 copies each in box)', () => {
    expect(GENERAL_STORE_BASE_ITEM_IDS).toEqual(BASE_GAME_ITEM_DEFS.map((d) => d.id));
    expect(GENERAL_STORE_COPIES_PER_BASE_ITEM).toBe(6);
  });

  it('builds predictable public URLs', () => {
    expect(itemCardImageUrl('revolver')).toBe('/images/item_revolver.png');
    expect(itemCardBackUrl()).toBe('/images/item_back.png');
  });

  it('has unique ids', () => {
    const ids = ITEM_CARD_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
