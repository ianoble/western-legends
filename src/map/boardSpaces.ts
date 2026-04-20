/**
 * Physical board spaces in normalized coordinates (0-100 x 0-100) over the full board scan.
 * Polygon centres were captured with /board-space-author.html (one click per space icon).
 *
 * POI centres aligned with board-space authoring (see project POI table).
 * **Cities (only two):** Darkrock and Red Falls. Use {@link getBoardSpaceCity} (and related helpers)
 * from story/goal code so “in Red Falls / Darkrock” is one source of truth — not display names alone.
 * Darkrock in-city: `dk-3`..`dk-10` only (every `dk-*` id). `ad-*` = approach hexes outside the city wall.
 * Red Falls **city** in-city: `rf-*` only (`ar-*` =
 * approach / wilderness near Red Falls, **not** in city — avoids confusing `rf-` ids outside town).
 * Everything else is outside both cities.
 * Red Falls Saloon: rf-5a/b/c (`playPoker`). Red Falls General Store: rf-6a/b/c. Darkrock General Store: dk-6/7/8.
 * Doctor's Office (`doctor`): rf-3 only — Red Falls (not Spike's View).
 *
 * Space id prefixes:
 *   mp-* = Mesito's area (outside Darkrock city)    tr-* = upper trail connectors
 *   dk-* = Darkrock city (dk-3..dk-10)    ad-* = approach to Darkrock (outside city)
 *   sv-* = Spike's View      rf-* = Red Falls city    ar-* = approach to Red Falls (outside city)
 *   sh-* = Sunny Hills       cj-* = Cliff Junction
 *
 * Adjacency is undirected: every edge appears in BOTH neighbors arrays.
 *
 * Where a path node was authored on the same cell as a bandit hideout, that node was dropped
 * and its edges attach directly to the `bh-*` space (single hit target per physical camp).
 */
import type { BoardSpaceKind } from '../logic/types';

export interface MapBoardSpace {
	id: string;
	/**
	 * Display name when set (POIs, named trails like the sheriff space). May be empty for anonymous path nodes.
	 */
	name: string;
	polygon: [number, number][];
	neighbors: string[];
	actionKind?: BoardSpaceKind;
}

const NBSP = '\u00a0';

/** UI label: any non-empty {@link MapBoardSpace.name}; otherwise blank. */
export function spaceLabel(s: MapBoardSpace | undefined): string {
	if (!s) return NBSP;
	const t = s.name.trim();
	if (t.length > 0) return s.name;
	return NBSP;
}

/** Log / debug: use name when set, else space id. */
export function spaceLabelForLog(s: MapBoardSpace): string {
	const t = s.name.trim();
	if (t.length > 0) return s.name;
	return s.id;
}

/** Unlabeled graph nodes: short region hint for draft / pickers (not the raw id). */
function trailOrHideoutHint(id: string): string {
	if (id.startsWith('bh-a-')) return 'Bandit Hideout A';
	if (id.startsWith('bh-b-')) return 'Bandit Hideout B';
	if (id.startsWith('bh-c-')) return 'Bandit Hideout C';
	const prefix = id.split('-')[0];
	const byPrefix: Record<string, string> = {
		mp: "Mesito's Point area (outside city)",
		ad: 'Near Darkrock (outside city)',
		dk: 'Darkrock city (path)',
		sv: "Spike's View (outside city)",
		ar: 'Near Red Falls (outside city)',
		rf: 'Red Falls city (path)',
		sh: 'Sunny Hills (outside city)',
		cj: 'Cliff Junction (outside city)',
		tr: 'Trail (outside city)',
		rs: 'Rail station (outside city)',
	};
	return byPrefix[prefix] ?? id;
}

/**
 * Move / character-draft pickers: POI name when present; otherwise a region hint (trail /
 * bandit hideout), not a bare middle dot.
 */
export function moveTargetLabel(s: MapBoardSpace | undefined): string {
	if (!s) return '·';
	const t = s.name.trim();
	if (t.length > 0) return s.name;
	return trailOrHideoutHint(s.id);
}

function rect(cx: number, cy: number, hw = 2.6, hh = 2.1): [number, number][] {
	return [
		[cx - hw, cy - hh],
		[cx + hw, cy - hh],
		[cx + hw, cy + hh],
		[cx - hw, cy + hh],
	];
}

export const BOARD_SPACES: MapBoardSpace[] = [
	// MESITO'S POINT (outside Darkrock city)
	{ id: 'mp-1', name: '', polygon: rect(40.92, 18.74), neighbors: ['mp-2', 'mp-3', 'mp-4', 'dk-6'] },
	{
		id: 'mp-2',
		name: "Mesito's Point - Ranch (outside city)",
		polygon: rect(35.64, 22.2),
		neighbors: ['bh-a-2', 'mp-1', 'mp-3'],
		actionKind: 'ranch',
	},
	{
		id: 'mp-3',
		name: "Mesito's Point - Cabaret (outside city)",
		polygon: rect(37.01, 26.56),
		neighbors: ['mp-1', 'mp-2', 'mp-8', 'dk-6', 'dk-8', 'dk-9'],
		actionKind: 'cabaret',
	},
	{ id: 'mp-4', name: '', polygon: rect(47.07, 16.94), neighbors: ['mp-1', 'dk-6', 'mp-5', 'tr-1', 'bh-b-1'] },
	{ id: 'mp-5', name: '', polygon: rect(49.02, 28.82), neighbors: ['tr-1', 'mp-3', 'mp-4', 'dk-6', 'dk-7'] },
	{ id: 'mp-8', name: '', polygon: rect(32.13, 34.23), neighbors: ['bh-a-2', 'mp-3', 'dk-9', 'mp-9', 'ad-1'] },
	{ id: 'mp-9', name: '', polygon: rect(27.64, 35.43), neighbors: ['mp-8', 'ad-1', 'bh-b-2'] },

	// UPPER TRAIL CONNECTORS
	{ id: 'tr-1', name: 'Sunny Hills - Mine', polygon: rect(53.79, 22.33), neighbors: ['mp-4', 'mp-5', 'bh-b-1'], actionKind: 'prospectGold' },

	// APPROACH DARKROCK (`ad-*` — not in Darkrock city; do not use `dk-` prefix here)
	{ id: 'ad-1', name: '', polygon: rect(29.59, 45.81), neighbors: ['dk-9', 'mp-9', 'ad-2', 'dk-3', 'mp-8'] },
	{ id: 'ad-2', name: '', polygon: rect(28.32, 54.08), neighbors: ['ad-1', 'dk-3', 'sv-1'] },

	// DARKROCK CITY (`dk-3`..`dk-10`)
	{ id: 'dk-1', name: '', polygon: rect(44.24, 45.66), neighbors: ['dk-3', 'dk-4', 'dk-5', 'dk-7', 'dk-8', 'dk-10'] },
	{
		id: 'dk-3',
		name: 'Darkrock - Saloon',
		polygon: rect(36.39, 50.74),
		neighbors: ['ad-1', 'ad-2', 'dk-4', 'dk-1', 'dk-9'],
		actionKind: 'playPoker',
	},
	{
		id: 'dk-4',
		name: 'Darkrock - Cabaret',
		polygon: rect(41.7, 54.68),
		neighbors: ['dk-1', 'dk-3', 'dk-5', 'sv-2', 'sv-6'],
		actionKind: 'cabaret',
	},
	{
		id: 'dk-5',
		name: 'Darkrock - Bank',
		polygon: rect(47.09, 53.43),
		neighbors: ['dk-1', 'dk-4', 'dk-10', 'sv-6', 'sv-8'],
		actionKind: 'bank',
	},
	{
		id: 'dk-6',
		name: 'Darkrock - General Store',
		polygon: rect(44.63, 27.91),
		neighbors: ['mp-5', 'dk-7', 'dk-8'],
		actionKind: 'generalStore',
	},
	{
		id: 'dk-7',
		name: 'Darkrock - General Store',
		polygon: rect(47.56, 36.64),
		neighbors: ['dk-6', 'dk-8'],
		actionKind: 'generalStore',
	},
	{
		id: 'dk-8',
		name: 'Darkrock - General Store',
		polygon: rect(41.7, 37.09),
		neighbors: ['dk-1', 'dk-6', 'dk-7', 'dk-9'],
		actionKind: 'generalStore',
	},
	{
		id: 'dk-9',
		name: 'Darkrock - Sheriff',
		polygon: rect(37.69, 37.6),
		neighbors: ['ad-1', 'dk-3', 'dk-8', 'mp-3', 'mp-8'],
	},
	{ id: 'dk-10', name: '', polygon: rect(51.07, 45.36), neighbors: ['dk-1', 'dk-5', 'ar-1', 'cj-1', 'bh-b-2'] },

	// SPIKE'S VIEW
	{ id: 'sv-1', name: '', polygon: rect(31.25, 63.85), neighbors: ['ad-2', 'dk-3', 'sv-5', 'bh-c-1', 'sv-2'] },
	{ id: 'sv-2', name: '', polygon: rect(38.28, 64.45), neighbors: ['sv-1', 'dk-3', 'dk-4', 'sv-6', 'sv-7', 'sv-5'] },
	{ id: 'sv-3', name: "Spike's View - Mine", polygon: rect(32.29, 81.5), neighbors: ['bh-c-1', 'sv-5'], actionKind: 'prospectGold' },
	{ id: 'sv-5', name: '', polygon: rect(35.64, 71.67), neighbors: ['bh-c-1', 'sv-3', 'sv-7', 'sv-1', 'sv-2'] },
	{ id: 'sv-6', name: '', polygon: rect(45.12, 63.55), neighbors: ['sv-2', 'sv-7', 'sv-8', 'sv-9', 'dk-4', 'dk-5'] },
	{ id: 'sv-7', name: '', polygon: rect(42.09, 71.67), neighbors: ['sv-2', 'sv-5', 'sv-6', 'sv-9'] },
	{ id: 'sv-8', name: '', polygon: rect(51.27, 63.55), neighbors: ['dk-5', 'sv-6', 'sv-9', 'sv-11', 'rs-1'] },
	{ id: 'sv-9', name: '', polygon: rect(48.24, 71.07), neighbors: ['sv-6', 'sv-7', 'sv-8', 'rs-1'] },
	{ id: 'sv-11', name: '', polygon: rect(56.64, 64.3), neighbors: ['sv-8', 'sv-13', 'rs-1', 'cj-2'] },
	{ id: 'sv-13', name: '', polygon: rect(61.13, 72.73), neighbors: ['sv-11', 'cj-11', 'rs-1', 'cj-2'] },

	// APPROACH RED FALLS (`ar-*` — not in Red Falls city; do not use `rf-` prefix here)
	{
		id: 'ar-1',
		name: 'Red Falls approach (outside city)',
		polygon: rect(65.43, 44.45),
		neighbors: ['bh-b-2', 'cj-1', 'rf-4', 'rf-5b'],
	},
	// RED FALLS CITY (`rf-*`)
	{
		id: 'rf-3',
		name: "Red Falls - Doctor's Office",
		polygon: rect(71.9, 27.07),
		neighbors: ['rf-4', 'rf-5a', 'sh-2', 'sh-1', 'rf-5b'],
		actionKind: 'doctor',
	},
	{
		id: 'rf-4',
		name: 'Red Falls - Sheriff & Cabaret',
		polygon: rect(70.8, 34.38),
		neighbors: ['ar-1', 'rf-3', 'rf-5a', 'rf-5b'],
		actionKind: 'cabaret',
	},
	{
		id: 'rf-5a',
		name: 'Red Falls - Saloon',
		polygon: rect(77.05, 27.61),
		neighbors: ['rf-3', 'rf-4', 'rf-5b', 'rf-5c', 'sh-3', 'sh-2'],
		actionKind: 'playPoker',
	},
	{
		id: 'rf-5b',
		name: 'Red Falls - Saloon',
		polygon: rect(72.17, 41.3),
		neighbors: ['ar-1', 'rf-4', 'rf-5a', 'rf-5c', 'cj-1', 'rf-6b', 'rf-6a', 'rf-3', 'cj-1', 'cj-3'],
		actionKind: 'playPoker',
	},
	{
		id: 'rf-5c',
		name: 'Red Falls - Saloon',
		polygon: rect(79.2, 34.98),
		neighbors: ['rf-5a', 'rf-5b', 'cj-8', 'rf-6a'],
		actionKind: 'playPoker',
	},
	{
		id: 'rf-6a',
		name: 'Red Falls - General Store',
		polygon: rect(79.39, 39.49),
		neighbors: ['cj-7', 'rf-6b', 'rf-6c', 'rf-5c', 'rf-5b'],
		actionKind: 'generalStore',
	},
	{
		id: 'rf-6b',
		name: 'Red Falls - General Store',
		polygon: rect(77.15, 47.01),
		neighbors: ['rf-6a', 'rf-6c', 'cj-3', 'cj-5'],
		actionKind: 'generalStore',
	},
	{
		id: 'rf-6c',
		name: 'Red Falls - General Store',
		polygon: rect(83.59, 46.11),
		neighbors: ['rf-6a', 'rf-6b', 'cj-5', 'cj-6', 'cj-7'],
		actionKind: 'generalStore',
	},

	// SUNNY HILLS
	{ id: 'sh-1', name: '', polygon: rect(66.31, 16.64), neighbors: ['bh-b-1', 'sh-2', 'rf-3'] },
	{ id: 'sh-2', name: '', polygon: rect(71.19, 16.94), neighbors: ['sh-1', 'sh-3', 'rf-3', 'rf-5a'] },
	{
		id: 'sh-3',
		name: 'Sunny Hills - Ranch',
		polygon: rect(81.34, 20.47),
		neighbors: ['sh-2', 'bh-a-1', 'cj-8', 'rf-5a'],
		actionKind: 'ranch',
	},

	// CLIFF JUNCTION
	{ id: 'cj-1', name: '', polygon: rect(67.77, 54.23), neighbors: ['dk-10', 'bh-b-2', 'ar-1', 'cj-2', 'cj-3'] },
	{
		id: 'cj-2',
		name: '',
		polygon: rect(70.61, 61.9),
		neighbors: ['cj-1', 'cj-3', 'cj-4', 'cj-10', 'cj-11', 'sv-11', 'sv-13'],
	},
	{ id: 'cj-3', name: '', polygon: rect(74.41, 54.98), neighbors: ['cj-1', 'cj-2', 'cj-4', 'cj-5'] },
	{ id: 'cj-4', name: '', polygon: rect(76.86, 62.5), neighbors: ['cj-2', 'cj-3', 'cj-10'] },
	{ id: 'cj-5', name: '', polygon: rect(81.35, 55.58), neighbors: ['cj-3', 'cj-6', 'cj-9', 'bh-c-2'] },
	{ id: 'cj-6', name: '', polygon: rect(86.91, 52.73), neighbors: ['cj-5', 'cj-7', 'cj-9', 'bh-c-2'] },
	{ id: 'cj-7', name: '', polygon: rect(86.82, 39.34), neighbors: ['cj-6', 'rf-6c'] },
	{ id: 'cj-8', name: '', polygon: rect(82.71, 29.12), neighbors: ['rf-5c', 'sh-3'] },
	{ id: 'cj-9', name: '', polygon: rect(79.88, 70.02), neighbors: ['cj-5', 'cj-6', 'bh-c-2', 'cj-10'] },
	{ id: 'cj-10', name: '', polygon: rect(74.8, 73.03), neighbors: ['cj-2', 'cj-4', 'cj-9', 'cj-11'] },
	{
		id: 'cj-11',
		name: 'Cliff Junction - Mine',
		polygon: rect(68.17, 72.2),
		neighbors: ['cj-2', 'cj-10', 'sv-13'],
		actionKind: 'prospectGold',
	},

	// BANDIT HIDEOUTS
	{ id: 'bh-a-1', name: '', polygon: rect(89.02, 19.63), neighbors: ['cj-8', 'sh-3'] },
	{ id: 'bh-a-2', name: '', polygon: rect(28.08, 23.97), neighbors: ['mp-9', 'mp-2', 'mp-8'] },
	{ id: 'bh-b-1', name: '', polygon: rect(57.3, 13.21), neighbors: ['mp-4', 'tr-1', 'sh-1'] },
	{ id: 'bh-b-2', name: '', polygon: rect(58.73, 48.36), neighbors: ['dk-10', 'ar-1', 'cj-1'] },
	{ id: 'bh-c-1', name: '', polygon: rect(29.27, 72.52), neighbors: ['sv-1', 'sv-5', 'sv-3'] },
	{ id: 'bh-c-2', name: '', polygon: rect(84.96, 65.77), neighbors: ['cj-6', 'cj-5', 'cj-4', 'cj-9'] },

	// RAIL STATION (only graph node for the physical station — use rs-1, not adjacent trail hexes)
	{ id: 'rs-1', name: '', polygon: rect(55.86, 73.78), neighbors: ['sv-8', 'sv-9', 'sv-11', 'sv-13'] },
];

export const BOARD_SPACES_BY_ID: Record<string, MapBoardSpace> = Object.fromEntries(BOARD_SPACES.map((s) => [s.id, s]));

/** Six bandit hideout graph nodes — one bandit NPC on each at setup. */
export const BANDIT_HIDEOUT_SPACE_IDS = ['bh-a-1', 'bh-a-2', 'bh-b-1', 'bh-b-2', 'bh-c-1', 'bh-c-2'] as const;

export const NPC_SHERIFF_ID = 'sheriff';

export function banditNpcId(hideoutSpaceId: string): string {
	return `bandit-${hideoutSpaceId}`;
}

/** Story / goal hooks: only these two ids represent “a city” on the board. */
export type BoardCityId = 'darkrock' | 'redFalls';

/**
 * `rf-*` spaces that are **not** inside Red Falls city (rare; prefer `ar-*` for approaches).
 * All other `rf-*` ids count as in Red Falls city for goals and story text.
 */
export const RED_FALLS_OUTSIDE_CITY_IDS = new Set<string>();

/**
 * Which city contains this board space, or `null` if outside both cities (trails, other regions, etc.).
 * Darkrock = every `dk-*` id on the board (`dk-3`..`dk-10`; approach hexes use `ad-*`).
 */
export function getBoardSpaceCity(spaceId: string): BoardCityId | null {
	if (spaceId.startsWith('dk-')) return 'darkrock';
	if (spaceId.startsWith('rf-') && !RED_FALLS_OUTSIDE_CITY_IDS.has(spaceId)) return 'redFalls';
	return null;
}

export function isInsideDarkrockCity(spaceId: string): boolean {
	return getBoardSpaceCity(spaceId) === 'darkrock';
}

export function isInsideRedFallsCity(spaceId: string): boolean {
	return getBoardSpaceCity(spaceId) === 'redFalls';
}

export function isInsideAnyBoardCity(spaceId: string): boolean {
	return getBoardSpaceCity(spaceId) != null;
}

/** City hexes valid as Saddle Up (`useCardAction` destination) targets. */
export const SADDLE_UP_TOWN_SPACE_IDS: readonly string[] = Object.keys(BOARD_SPACES_BY_ID).filter((id) => isInsideAnyBoardCity(id));
export const SADDLE_UP_TOWN_SPACE_ID_SET = new Set(SADDLE_UP_TOWN_SPACE_IDS);

/** Hex where arrested players are placed (all towns use the Darkrock jail on the digital board). */
export const ARREST_JAIL_SPACE_ID = 'dk-9';

/** Sheriff office hex per city (NPC placement / return after failed arrest). */
export function getSheriffOfficeSpaceId(city: BoardCityId): string {
	return city === 'darkrock' ? 'dk-9' : 'rf-4';
}

export const BOARD_STARTING_SPACE_ID = 'dk-3';
export const BOARD_VIEWBOX_SIZE = 100;
