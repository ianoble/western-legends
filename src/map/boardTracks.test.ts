import { describe, expect, it } from 'vitest';
import { MARSHAL_TRACK_CENTERS, WANTED_TRACK_CENTERS, trackSlotIndex } from './boardTracks';

describe('boardTracks', () => {
  it('has nine wanted and nine marshal cells', () => {
    expect(WANTED_TRACK_CENTERS).toHaveLength(9);
    expect(MARSHAL_TRACK_CENTERS).toHaveLength(9);
  });

  it('trackSlotIndex maps points to 0-based slot', () => {
    expect(trackSlotIndex(0, 9)).toBe(null);
    expect(trackSlotIndex(1, 9)).toBe(0);
    expect(trackSlotIndex(9, 9)).toBe(8);
    expect(trackSlotIndex(99, 9)).toBe(8);
  });
});
