/**
 * Starter characters for the draft — **Western Legends base box only** (12 figures).
 * Roster matches `Western_Legends_Complete_Card_List.csv` rows: Character + "Base Game".
 *
 * Start spaces match {@link ../map/boardSpaces}. Optional {@link StarterCharacterDef.cardArtKey} maps to
 * `public/images/character_{key}a.png` (face) and `…b.png` (back).
 */
export interface StarterCharacterDef {
	id: string;
	name: string;
	startSpaceId: string;
	/**
	 * When set (2+ spaces), the player must pass that space id as the second argument to
	 * `chooseCharacter` (bandit hideouts, multi-hex POIs, etc.).
	 */
	startSpaceChoices?: string[];
	/** Rulebook starting cash; prototype UI treats 1 gold as $1. Default 40 when omitted. */
	startingGold?: number;
	/** Poker hand size after draft (setup deals a placeholder hand, then this replaces it). Default 2. */
	startingPokerCards?: number;
	startingWounds?: number;
	startingNuggets?: number;
	startingWanted?: number;
	startingMarshal?: number;
	/** Rulebook gear line (items not simulated in the prototype beyond this reference). */
	startingEquipment: string;
	/** Full legendary action text (powers not automated unless noted elsewhere). */
	legendaryAction: string;
	cardArtKey?: string;
	/**
	 * Automated at play `turn.onBegin` only if the player has at least `LEGENDARY_ACTION_MIN_LP` LP
	 * (`types.ts`; legendary action activated).
	 */
	startOfTurnGold?: number;
	startOfTurnDrawPoker?: number;
	/** {@link ./equipment} item ids (revolver, rifle, …). */
	startingWeaponItemIds?: string[];
	startingMountItemIds?: string[];
	/** Max hand = 5 − wounds + this (e.g. Calamity Jane +1). */
	handSizeBonus?: number;
	/** If true, wounds do not reduce max poker hand (e.g. Doc Holliday). */
	handSizeIgnoresWounds?: boolean;
}

/** Face side — served from Vite `public/`. */
export function characterCardFaceUrl(cardArtKey: string): string {
	const k = cardArtKey.padStart(2, '0');
	return `/images/character_${k}a.png`;
}

/** Back side — served from Vite `public/`. */
export function characterCardBioUrl(cardArtKey: string): string {
	const k = cardArtKey.padStart(2, '0');
	return `/images/character_${k}b.png`;
}

/** Pool size must be ≥ 2 × max players (12 for 6 players). */
export const STARTER_CHARACTERS: StarterCharacterDef[] = [
	{
		id: 'wl-02',
		name: 'Annie Oakley',
		startSpaceId: 'dk-6',
		startSpaceChoices: ['dk-6', 'dk-7', 'dk-8'],
		startingGold: 0,
		startingPokerCards: 1,
		startingEquipment: '1 poker card, rifle',
		legendaryAction: 'At the start of a fight with another player, that player must discard 1 poker card or gain 1 wound.',
		startingWeaponItemIds: ['rifle'],
		startingMountItemIds: [],
		cardArtKey: '01',
	},
	{
		id: 'wl-12',
		name: 'Bass Reeves',
		startSpaceId: 'dk-9',
		startingGold: 10,
		startingMarshal: 1,
		startingPokerCards: 1,
		startingEquipment: '$10, 1 poker card, 1 upgraded revolver, 1 Marshal point',
		legendaryAction: 'At the start of your turn, draw 1 poker card.',
		startOfTurnDrawPoker: 1,
		startingWeaponItemIds: ['revolver_upgrade'],
		startingMountItemIds: [],
		cardArtKey: '07',
	},
	{
		id: 'wl-17',
		name: 'Billy the Kid',
		startSpaceId: 'bh-a-1',
		startSpaceChoices: ['bh-a-1', 'bh-a-2'],
		startingGold: 0,
		startingPokerCards: 2,
		startingWanted: 2,
		startingEquipment: '2 poker cards, 1 revolver, 2 Wanted points',
		legendaryAction:
			'After you end your move in a space with one or more players, a player of your choice in that space must give you 1 poker card or $10.',
		startingWeaponItemIds: ['revolver'],
		startingMountItemIds: [],
		cardArtKey: '02',
	},
	{
		id: 'wl-05',
		name: 'Bloody Knife',
		startSpaceId: 'sv-3',
		startingGold: 20,
		startingPokerCards: 2,
		startingEquipment: '$20, 2 poker cards, revolver',
		legendaryAction:
			'You may move through a mesa as though it is a single space. You may not end your movement in a mesa. After you move through a mesa, lose 1 wound.',
		startingWeaponItemIds: ['revolver'],
		startingMountItemIds: [],
		cardArtKey: '03',
	},
	{
		id: 'wl-06',
		name: 'Calamity Jane',
		startSpaceId: 'rf-6a',
		startSpaceChoices: ['rf-6a', 'rf-6b', 'rf-6c'],
		startingGold: 20,
		startingPokerCards: 0,
		startingEquipment: '$20, revolver, provisions',
		legendaryAction: 'Your hand size is increased by 1. After you contribute to a story card, draw 1 poker card.',
		handSizeBonus: 1,
		startingWeaponItemIds: ['revolver'],
		startingMountItemIds: [],
		cardArtKey: '08',
	},
	{
		id: 'wl-07',
		name: 'Doc Holliday',
		startSpaceId: 'rf-3',
		startingGold: 40,
		startingPokerCards: 2,
		startingWounds: 1,
		startingEquipment: '$40, 2 poker cards, revolver, 1 wound',
		legendaryAction: 'After you gain any amount of wounds, draw 1 poker card. Wounds do not reduce your hand size.',
		handSizeIgnoresWounds: true,
		startingWeaponItemIds: ['revolver'],
		startingMountItemIds: [],
		cardArtKey: '09',
	},
	{
		id: 'wl-20',
		name: 'Jesse James',
		startSpaceId: 'bh-b-1',
		startSpaceChoices: ['bh-b-1', 'bh-b-2'],
		startingGold: 10,
		startingPokerCards: 1,
		startingWanted: 1,
		startingEquipment: '$10, poker card, upgraded revolver, 1 wanted point',
		legendaryAction:
			'While in a fight outside of town, decrease the value of a card played against you by 1. In fights against other players, you win all ties.',
		startingWeaponItemIds: ['revolver_upgrade'],
		startingMountItemIds: [],
		cardArtKey: '12',
	},
	{
		id: 'wl-15',
		name: 'Kit Carson',
		startSpaceId: 'tr-1',
		startingGold: 0,
		startingPokerCards: 2,
		startingEquipment: "2 poker cards, upgraded revolver, miner's map",
		legendaryAction:
			'After you move, you may move 1 additional space. While in a fight outside of town, decrease the value of a card played against you by 1.',
		startingWeaponItemIds: ['revolver_upgrade'],
		startingMountItemIds: [],
		cardArtKey: '06',
	},
	{
		id: 'wl-10',
		name: 'Stagecoach Mary Fields',
		startSpaceId: 'rf-5a',
		startSpaceChoices: ['rf-5a', 'rf-5b', 'rf-5c'],
		startingGold: 10,
		startingPokerCards: 1,
		startingEquipment: '$10, 1 poker card, shotgun',
		legendaryAction: 'At the start of your turn, gain $10. After you contribute to a story card, gain $10.',
		startOfTurnGold: 10,
		startingWeaponItemIds: ['shotgun'],
		startingMountItemIds: [],
		cardArtKey: '11',
	},
	{
		id: 'wl-16',
		name: 'Wild Bill Hickok',
		startSpaceId: 'rf-2',
		startingGold: 10,
		startingPokerCards: 3,
		startingEquipment: '$10, 3 poker cards, revolver',
		legendaryAction: 'After you win a game of poker, gain $20. After you lose a game of poker, you may keep 1 random card you played.',
		startingWeaponItemIds: ['revolver'],
		startingMountItemIds: [],
		cardArtKey: '05',
	},
	{
		id: 'wl-21',
		name: 'Wyatt Earp',
		startSpaceId: 'bh-a-1',
		startSpaceChoices: ['bh-a-1', 'bh-a-2', 'bh-b-1', 'bh-b-2', 'bh-c-1', 'bh-c-2'],
		startingGold: 10,
		startingMarshal: 1,
		startingPokerCards: 2,
		startingEquipment: '$10, 2 poker cards, revolver, 1 Marshal point',
		legendaryAction: 'The first time you win a fight against a bandit each turn, gain 1 additional action.',
		startingWeaponItemIds: ['revolver'],
		startingMountItemIds: [],
		cardArtKey: '04',
	},
	{
		id: 'wl-11',
		name: 'Y.B. Rowdy',
		startSpaceId: 'cj-11',
		startingGold: 0,
		startingPokerCards: 3,
		startingEquipment: '3 poker cards, upgraded revolver',
		legendaryAction: 'After you start your turn outside of a town, you may discard 1 poker card to move up to 3 spaces.',
		startingWeaponItemIds: ['revolver_upgrade'],
		startingMountItemIds: [],
		cardArtKey: '10',
	},
];

export const STARTER_CHARACTER_BY_ID: Record<string, StarterCharacterDef> = Object.fromEntries(STARTER_CHARACTERS.map((c) => [c.id, c]));

/** True when draft must send a space id as the second `chooseCharacter` argument. */
export function characterHasStartSpaceChoices(def: StarterCharacterDef | undefined): boolean {
	return Array.isArray(def?.startSpaceChoices) && def.startSpaceChoices.length >= 2;
}
