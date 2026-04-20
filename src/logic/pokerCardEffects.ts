/**
 * Machine-readable poker powers: when a card can be used and which handler bucket it belongs to.
 * Game moves in `game.ts` should branch on {@link PokerEffectKind} after validating {@link PokerEffectTiming}.
 */

export type PokerEffectTiming =
	| 'action_b'
	| 'fight_reaction'
	| 'fight_bonus'
	| 'after_move'
	| 'after_marshal_wanted_on_your_turn'
	| 'saloon_play'
	| 'discard_trigger'
	| 'passive_hand';

export type PokerEffectKind =
	| 'cheat'
	| 'saddle_up'
	| 'sprint'
	| 'manhunt'
	| 'payday'
	| 'stick_em_up'
	| 'reputation_seven'
	| 'shootout'
	| 'wallop'
	| 'instincts_draw_three'
	| 'instincts_discard_draw_one'
	| 'fools_gold'
	| 'poker_bonus_red_ten'
	| 'bulletproof'
	| 'quickdraw'
	| 'determination'
	| 'living_legend';

export type PokerCardEffectHook = {
	timing: PokerEffectTiming;
	kind: PokerEffectKind;
};

export type PokerCardEffectMeta = {
	hooks: PokerCardEffectHook[];
};

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

const ALL_SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RED: Suit[] = ['hearts', 'diamonds'];
const BLACK: Suit[] = ['clubs', 'spades'];

function cardIds(rank: string, suits: readonly Suit[]): string[] {
	return suits.map((s) => `${rank}-${s}`);
}

function addEffect(
	map: Record<string, PokerCardEffectMeta>,
	ids: string[],
	...hooks: PokerCardEffectHook[]
): void {
	const meta: PokerCardEffectMeta = { hooks };
	for (const id of ids) {
		map[id] = meta;
	}
}

/** Full 52-card map aligned with `src/data/pokerCardAbilities.ts`. */
export const POKER_CARD_EFFECT_BY_ID: Record<string, PokerCardEffectMeta> = (() => {
	const M = {} as Record<string, PokerCardEffectMeta>;

	addEffect(M, cardIds('2', RED), { timing: 'saloon_play', kind: 'cheat' });
	addEffect(M, cardIds('2', BLACK), { timing: 'action_b', kind: 'saddle_up' });
	addEffect(M, cardIds('3', ALL_SUITS), { timing: 'after_move', kind: 'sprint' });
	addEffect(M, cardIds('4', ALL_SUITS), { timing: 'action_b', kind: 'manhunt' });
	addEffect(M, cardIds('5', ALL_SUITS), { timing: 'action_b', kind: 'payday' });
	addEffect(M, cardIds('6', ALL_SUITS), { timing: 'fight_reaction', kind: 'stick_em_up' });
	addEffect(M, cardIds('7', ALL_SUITS), {
		timing: 'after_marshal_wanted_on_your_turn',
		kind: 'reputation_seven',
	});
	addEffect(M, cardIds('8', RED), { timing: 'fight_bonus', kind: 'shootout' });
	addEffect(M, cardIds('8', BLACK), { timing: 'after_move', kind: 'wallop' });
	addEffect(
		M,
		cardIds('9', ALL_SUITS),
		{ timing: 'action_b', kind: 'instincts_draw_three' },
		{ timing: 'discard_trigger', kind: 'instincts_discard_draw_one' },
	);
	addEffect(M, cardIds('10', BLACK), { timing: 'passive_hand', kind: 'fools_gold' });
	addEffect(M, cardIds('10', RED), { timing: 'saloon_play', kind: 'poker_bonus_red_ten' });
	addEffect(M, cardIds('J', ALL_SUITS), { timing: 'fight_bonus', kind: 'bulletproof' });
	addEffect(M, cardIds('Q', ALL_SUITS), { timing: 'fight_bonus', kind: 'quickdraw' });
	addEffect(M, cardIds('K', ALL_SUITS), { timing: 'action_b', kind: 'determination' });
	addEffect(M, cardIds('A', ALL_SUITS), { timing: 'action_b', kind: 'living_legend' });

	return M;
})();

export function pokerCardEffectHooks(cardId: string): readonly PokerCardEffectHook[] {
	return POKER_CARD_EFFECT_BY_ID[cardId]?.hooks ?? [];
}

export function pokerCardHasTiming(cardId: string, timing: PokerEffectTiming): boolean {
	return pokerCardEffectHooks(cardId).some((h) => h.timing === timing);
}

/** B-slot router: first `action_b` hook for this card, if any. */
export function actionBEffectKindForCardId(cardId: string): PokerEffectKind | null {
	const h = pokerCardEffectHooks(cardId).find((x) => x.timing === 'action_b');
	return h?.kind ?? null;
}

/**
 * Matches server {@link moveFightReactionPlay}: poker powers playable in the post-reveal reaction phase.
 * J/Q fight bonuses apply when those cards are committed as fight cards, not here.
 */
export type FightReactionPlayKind = 'stick_em_up' | 'shootout';

export function fightReactionPlayKind(cardId: string): FightReactionPlayKind | null {
	if (pokerCardHasTiming(cardId, 'fight_reaction') && cardId.startsWith('6-')) {
		return 'stick_em_up';
	}
	if (pokerCardHasTiming(cardId, 'fight_bonus')) {
		if (cardId === '8-hearts' || cardId === '8-diamonds') return 'shootout';
	}
	return null;
}
