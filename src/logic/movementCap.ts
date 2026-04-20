import { DEFAULT_MOVEMENT_POINTS } from '../map/boardGraph';
import type { WesternLegendsPlayer } from './types';

/** Mount MP budget for this turn from {@link WesternLegendsPlayer.turnMountItemId} only (pure; no migration). */
export function movementPointsForEquippedMount(
	player: Pick<WesternLegendsPlayer, 'turnMountItemId'>,
): number {
	const m = player.turnMountItemId;
	if (m === 'mustang_upgrade') return 5;
	if (m === 'mustang') return 4;
	if (m === 'mule_upgrade') return 4;
	return DEFAULT_MOVEMENT_POINTS;
}
