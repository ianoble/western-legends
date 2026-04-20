import { shuffle } from '@engine/client';
import { CATTLE_TOKEN_FACE_IDS, type CattlePiles } from './types';

export function buildInitialCattlePiles(): CattlePiles {
	return {
		green: shuffle([...CATTLE_TOKEN_FACE_IDS]),
		blue: shuffle([...CATTLE_TOKEN_FACE_IDS]),
	};
}
