import { describe, expect, it } from 'vitest';
import { DEFAULT_MOVEMENT_POINTS } from '../map/boardGraph';
import { movementPointsForEquippedMount } from './movementCap';

describe('movementPointsForEquippedMount', () => {
	it('foot or mule uses default MP', () => {
		expect(movementPointsForEquippedMount({ turnMountItemId: null })).toBe(DEFAULT_MOVEMENT_POINTS);
		expect(movementPointsForEquippedMount({ turnMountItemId: 'mule' })).toBe(DEFAULT_MOVEMENT_POINTS);
	});

	it('mustang and upgrades', () => {
		expect(movementPointsForEquippedMount({ turnMountItemId: 'mustang' })).toBe(4);
		expect(movementPointsForEquippedMount({ turnMountItemId: 'mule_upgrade' })).toBe(4);
		expect(movementPointsForEquippedMount({ turnMountItemId: 'mustang_upgrade' })).toBe(5);
	});
});
