import { describe, expect, it } from 'vitest';
import {
  PROSPECT_DIE_FACE_POOL,
  resolveProspectRoll,
  rollProspectDieSlot,
  rollProspectingFace,
} from './prospect';

function countFaces(pool: readonly string[], face: string): number {
  return pool.filter((f) => f === face).length;
}

describe('PROSPECT_DIE_FACE_POOL', () => {
  it('has six faces: 2 nugget, 2 tailings, 1 gold dust, 1 gravel', () => {
    expect(PROSPECT_DIE_FACE_POOL).toHaveLength(6);
    expect(countFaces(PROSPECT_DIE_FACE_POOL, 'nugget')).toBe(2);
    expect(countFaces(PROSPECT_DIE_FACE_POOL, 'tailings')).toBe(2);
    expect(countFaces(PROSPECT_DIE_FACE_POOL, 'goldDust')).toBe(1);
    expect(countFaces(PROSPECT_DIE_FACE_POOL, 'gravel')).toBe(1);
  });
});

describe('rollProspectingFace', () => {
  it('indexes pool from rng in [0,1)', () => {
    expect(rollProspectingFace(() => 0)).toBe(PROSPECT_DIE_FACE_POOL[0]);
    expect(rollProspectingFace(() => (4 + 1e-9) / 6)).toBe('goldDust');
    expect(rollProspectingFace(() => 1 - 1e-12)).toBe(PROSPECT_DIE_FACE_POOL[5]);
  });
});

describe('rollProspectDieSlot', () => {
  it('adds one follow-up roll when first face is gold dust', () => {
    let i = 0;
    const seq = [(4 + 1e-9) / 6, 0.01];
    const rng = () => {
      const v = seq[i]!;
      i += 1;
      return v;
    };
    const slot = rollProspectDieSlot(rng, 0);
    expect(slot.slotIndex).toBe(0);
    expect(slot.faces[0]).toBe('goldDust');
    expect(slot.faces[1]).toBe(PROSPECT_DIE_FACE_POOL[0]);
    expect(slot.faces).toHaveLength(2);
  });

  it('does not reroll when first face is not gold dust', () => {
    const slot = rollProspectDieSlot(() => 0.01, 1);
    expect(slot.faces).toHaveLength(1);
    expect(slot.slotIndex).toBe(1);
  });
});

describe('resolveProspectRoll', () => {
  it('always returns two independent slots', () => {
    const rng = () => 0.01;
    const slots = resolveProspectRoll(rng);
    expect(slots).toHaveLength(2);
    expect(slots[0]!.slotIndex).toBe(0);
    expect(slots[1]!.slotIndex).toBe(1);
    expect(slots[0]!.faces.length).toBeGreaterThanOrEqual(1);
    expect(slots[1]!.faces.length).toBeGreaterThanOrEqual(1);
  });
});
