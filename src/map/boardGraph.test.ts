import { describe, expect, it } from 'vitest';
import { DEFAULT_MOVEMENT_POINTS, getReachableSpaceIds, getShortestPathLength } from './boardGraph';
import { BOARD_SPACES, BOARD_SPACES_BY_ID } from './boardSpaces';

describe('getShortestPathLength', () => {
  it('returns edge count along a shortest path', () => {
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-3', 'dk-3')).toBe(0);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-3', 'ad-1')).toBe(1);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-3', 'dk-9')).toBe(1);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-3', 'mp-8')).toBe(2);
  });

  it('returns null when unreachable', () => {
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'no-a', 'dk-3')).toBe(null);
  });
});

describe('getReachableSpaceIds', () => {
  it('includes start and immediate neighbours from dk-3 (Darkrock Saloon)', () => {
    const r = getReachableSpaceIds(BOARD_SPACES_BY_ID, 'dk-3', DEFAULT_MOVEMENT_POINTS);
    // Distance 0
    expect(r.has('dk-3')).toBe(true);
    // Distance 1 (direct neighbours of dk-3)
    expect(r.has('ad-1')).toBe(true);
    expect(r.has('ad-2')).toBe(true);
    expect(r.has('dk-4')).toBe(true);
    // Distance 2 via ad-1
    expect(r.has('dk-9')).toBe(true);
    expect(r.has('mp-9')).toBe(true);
    // Distance 2 via ad-2
    expect(r.has('sv-1')).toBe(true);
    // Distance 2 via dk-4
    expect(r.has('dk-5')).toBe(true);
    expect(r.has('sv-2')).toBe(true);
    // Still within budget of 2 (tighter Darkrock paths after reciprocal edges)
    expect(r.has('mp-8')).toBe(true);
    expect(r.has('dk-10')).toBe(true);
    // Distance 3 — outside default budget of 2
    expect(r.has('bh-c-1')).toBe(false);
  });

  it('rejects unknown start', () => {
    const r = getReachableSpaceIds(BOARD_SPACES_BY_ID, 'no-such-space', 2);
    expect(r.size).toBe(0);
  });

  it('budget 0 returns only the start space', () => {
    const r = getReachableSpaceIds(BOARD_SPACES_BY_ID, 'ar-1', 0);
    expect(r.size).toBe(1);
    expect(r.has('ar-1')).toBe(true);
  });

  it('all spaces reachable from dk-3 with a large budget', () => {
    const r = getReachableSpaceIds(BOARD_SPACES_BY_ID, 'dk-3', 30);
    expect(r.has('bh-a-2')).toBe(true);
    expect(r.has('bh-b-1')).toBe(true);
    expect(r.has('sv-3')).toBe(true);
    expect(r.has('dk-10')).toBe(true);
    expect(r.has('rf-3')).toBe(true);
    expect(r.has('sh-3')).toBe(true);
    expect(r.has('cj-11')).toBe(true);
  });

  it('graph has no dangling neighbour references', () => {
    for (const space of BOARD_SPACES) {
      for (const nid of space.neighbors) {
        expect(
          BOARD_SPACES_BY_ID[nid],
          space.id + ' references missing neighbour "' + nid + '"',
        ).toBeDefined();
      }
    }
  });

  it('dk-9 reaches dk-1 in 2 MP but bank (dk-5) and dk-10 need 3 (no direct dk-9–dk-1 edge)', () => {
    const r = getReachableSpaceIds(BOARD_SPACES_BY_ID, 'dk-9', DEFAULT_MOVEMENT_POINTS);
    expect(r.has('dk-1')).toBe(true);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-9', 'dk-1')).toBe(2);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-9', 'dk-5')).toBe(3);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-9', 'dk-10')).toBe(3);
    expect(r.has('dk-5')).toBe(false);
    expect(r.has('dk-10')).toBe(false);
  });

  it('from Darkrock Bank (dk-5), dk-7, dk-8, and rail (rs-1) are 2 MP', () => {
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-5', 'dk-7')).toBe(2);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-5', 'dk-8')).toBe(2);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-5', 'rs-1')).toBe(2);
    const r = getReachableSpaceIds(BOARD_SPACES_BY_ID, 'dk-5', DEFAULT_MOVEMENT_POINTS);
    expect(r.has('dk-7')).toBe(true);
    expect(r.has('dk-8')).toBe(true);
    expect(r.has('rs-1')).toBe(true);
  });

  it('dk-9 reaches Mesito mp-1 and mp-2 in 2 MP via mp-3 (cabaret)', () => {
    const r = getReachableSpaceIds(BOARD_SPACES_BY_ID, 'dk-9', DEFAULT_MOVEMENT_POINTS);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-9', 'mp-3')).toBe(1);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-9', 'mp-1')).toBe(2);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-9', 'mp-2')).toBe(2);
    expect(r.has('mp-1')).toBe(true);
    expect(r.has('mp-2')).toBe(true);
  });

  it('cj-2 reaches cj-3, cj-10, sv-11, sv-13 in 1 MP (reciprocal edges)', () => {
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'cj-2', 'cj-3')).toBe(1);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'cj-2', 'cj-10')).toBe(1);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'cj-2', 'sv-11')).toBe(1);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'cj-2', 'sv-13')).toBe(1);
    const r = getReachableSpaceIds(BOARD_SPACES_BY_ID, 'cj-2', DEFAULT_MOVEMENT_POINTS);
    expect(r.has('cj-3')).toBe(true);
    expect(r.has('cj-10')).toBe(true);
    expect(r.has('sv-11')).toBe(true);
    expect(r.has('sv-13')).toBe(true);
  });
});
