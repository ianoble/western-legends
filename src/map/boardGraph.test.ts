import { describe, expect, it } from 'vitest';
import { DEFAULT_MOVEMENT_POINTS, getReachableSpaceIds, getShortestPathLength } from './boardGraph';
import { BOARD_SPACES, BOARD_SPACES_BY_ID } from './boardSpaces';

describe('getShortestPathLength', () => {
  it('returns edge count along a shortest path', () => {
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-3', 'dk-3')).toBe(0);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-3', 'ad-1')).toBe(1);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-3', 'dk-9')).toBe(2);
    expect(getShortestPathLength(BOARD_SPACES_BY_ID, 'dk-3', 'mp-8')).toBe(3);
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
    expect(r.has('sv-4')).toBe(true);
    // Distance 3 — outside default budget of 2
    expect(r.has('mp-8')).toBe(false);
    expect(r.has('dk-10')).toBe(false);
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

  it('adjacency is symmetric', () => {
    for (const space of BOARD_SPACES) {
      for (const nid of space.neighbors) {
        const neighbour = BOARD_SPACES_BY_ID[nid];
        expect(
          neighbour.neighbors.includes(space.id),
          space.id + ' lists ' + nid + ' as neighbour but ' + nid + ' does not list ' + space.id + ' back',
        ).toBe(true);
      }
    }
  });
});
