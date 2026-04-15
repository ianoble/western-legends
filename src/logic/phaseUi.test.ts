import { describe, expect, it } from 'vitest';
import { everyPlayerHasCharacter, uiGamePhase } from './phaseUi';
import type { WesternLegendsState } from './types';

function mockG(partial: Partial<WesternLegendsState['players']>): WesternLegendsState {
  return {
    players: partial as WesternLegendsState['players'],
  } as WesternLegendsState;
}

describe('phaseUi', () => {
  it('treats draft as finished when every player has characterId', () => {
    const G = mockG({
      '0': { characterId: 'a' } as WesternLegendsState['players'][string],
      '1': { characterId: 'b' } as WesternLegendsState['players'][string],
    });
    expect(everyPlayerHasCharacter(G)).toBe(true);
    expect(uiGamePhase(G, null)).toBe('play');
    expect(uiGamePhase(G, 'chooseCharacter')).toBe('play');
  });

  it('stays in chooseCharacter when ctx.phase missing but draft incomplete', () => {
    const G = mockG({
      '0': { characterId: 'a' } as WesternLegendsState['players'][string],
      '1': { characterId: null } as unknown as WesternLegendsState['players'][string],
    });
    expect(uiGamePhase(G, null)).toBe('chooseCharacter');
  });
});
