import { STARTER_CHARACTER_BY_ID } from './starterCharacters';
import { LEGENDARY_ACTION_MIN_LP, type FightStartEffectStep, type WesternLegendsPlayer } from './types';

/** Merge challenger-originated and defender-originated steps, alternating starting with the challenger. */
export function interleaveFightStartSteps(
	challengerSteps: FightStartEffectStep[],
	defenderSteps: FightStartEffectStep[],
): FightStartEffectStep[] {
	const out: FightStartEffectStep[] = [];
	const n = Math.max(challengerSteps.length, defenderSteps.length);
	for (let i = 0; i < n; i++) {
		if (i < challengerSteps.length) out.push(challengerSteps[i]!);
		if (i < defenderSteps.length) out.push(defenderSteps[i]!);
	}
	return out;
}

/**
 * Build start-of-fight effects (Annie Oakley wl-02: opponent discards 1 poker card or takes 1 wound).
 * Legendary gate matches {@link LEGENDARY_ACTION_MIN_LP}.
 */
export function buildFightStartEffectQueue(
	challenger: WesternLegendsPlayer,
	challengerId: string,
	defender: WesternLegendsPlayer,
	defenderId: string,
): FightStartEffectStep[] {
	const challengerSteps: FightStartEffectStep[] = [];
	const defenderSteps: FightStartEffectStep[] = [];

	const annie = (p: WesternLegendsPlayer) =>
		p.legendaryPoints >= LEGENDARY_ACTION_MIN_LP && p.characterId === 'wl-02';

	if (annie(challenger)) {
		defenderSteps.push({ actorId: defenderId, kind: 'annieOakleyOpponent' });
	}
	if (annie(defender)) {
		challengerSteps.push({ actorId: challengerId, kind: 'annieOakleyOpponent' });
	}

	return interleaveFightStartSteps(challengerSteps, defenderSteps);
}
