import type { Game, Ctx, FnContext } from 'boardgame.io';
import {
  createStandardDeck,
  shuffle,
  defineGame,
  redactCards,
  INVALID_MOVE,
  isCardHidden,
  type BaseGameState,
  type VisibleCard,
  type StandardCard,
} from '@engine/client';
import {
  applyDefenderDowngradeChallengerOneCard,
  bestPokerScore,
  bestPokerScoreFromHandAndFlop,
  comparePokerHands,
  comparePokerScores,
  compareThreeCardFight,
} from './poker';
import {
  DEFAULT_MOVEMENT_POINTS,
  getReachableSpaceIds,
  getShortestPathLength,
} from '../map/boardGraph';
import { BOARD_SPACES_BY_ID, BOARD_STARTING_SPACE_ID, getBoardSpaceCity, spaceLabelForLog } from '../map/boardSpaces';
import {
  STARTER_CHARACTER_BY_ID,
  STARTER_CHARACTERS,
  characterHasStartSpaceChoices,
  type StarterCharacterDef,
} from './starterCharacters';
import {
  GENERAL_STORE_BASE_ITEM_IDS,
  GENERAL_STORE_COPIES_PER_BASE_ITEM,
} from '../data/itemCards';
import {
  ITEM_UPGRADE_BASE,
  MOUNT_ITEM_ID_SET,
  WEAPON_ITEM_ID_SET,
  generalStoreStockLineId,
  isMiscItemId,
  uniqueMountOptions,
  uniqueWeaponOptions,
} from './equipment';
import {
  DEPOSIT_GOLD_PER_NUGGET,
  DEPOSIT_LP_PER_NUGGET,
  HEAL_COST_GOLD,
  HEIST_LOSE_WANTED,
  HEIST_WIN_GOLD,
  HEIST_WIN_WANTED,
  GENERAL_STORE_MAX_MISC_ITEMS,
  GENERAL_STORE_PRICES,
  LEGEND_POINTS_TO_WIN,
  MAX_NUGGETS,
  MAX_PLAYER_GOLD,
  MAX_ROUNDS,
  PLAYER_COLORS,
  POKER_ANTE_GOLD,
  PROSPECT_TAILINGS_GOLD,
  REVEL_GOLD_PER_LP,
  RUSTLE_BONUS_GOLD,
  RUSTLE_WANTED_POINTS,
  SALOON_HOUSE_ADDS_TO_POT,
  SALOON_WIN_LEGEND_POINTS,
  SHORT_GAME_LEGEND_GOAL,
  STORY_DECK_SIZE,
  storyDiscsRequiredToResolve,
  TURN_ACTIONS_PER_TURN,
  WORK_PAY_GOLD,
  WRANGLE_BONUS_GOLD,
  WRANGLE_MARSHAL_POINTS,
  LEGENDARY_ACTION_MIN_LP,
  START_TURN_INCOME_DRAW,
  START_TURN_INCOME_GOLD_ONLY,
  START_TURN_INCOME_SPLIT_DRAW,
  START_TURN_INCOME_SPLIT_GOLD,
  type GameLogEntry,
  type StartTurnIncomeOption,
  type TurnActionKind,
  type WesternLegendsSetupData,
  type WesternLegendsPlayer,
  type WesternLegendsState,
} from './types';
import { maxPokerHandSize } from './player-hand';

const MAX_LOG = 120;

const GENERAL_STORE_BASE_ITEM_ID_SET = new Set<string>(GENERAL_STORE_BASE_ITEM_IDS);

/** LP gained when flipping to this upgrade at the General Store (printed on upgrade cards). */
const UPGRADE_FLIP_LEGEND_POINTS: Record<string, number> = {
  mule_upgrade: 1,
  mustang_upgrade: 2,
  revolver_upgrade: 1,
  rifle_upgrade: 1,
  shotgun_upgrade: 1,
};

type WLCtx = FnContext<WesternLegendsState>;

type ProspectFace = 'nugget' | 'tailings' | 'goldDust' | 'gravel';

type ProspectDieOutcome = {
  face: ProspectFace;
  nuggetAdded: boolean;
  goldAdded: number;
};

function appendLog(G: WesternLegendsState, actorPlayerId: string, message: string): void {
  const player = G.players[actorPlayerId];
  const entry: GameLogEntry = { message, playerColor: player?.color };
  G.gameLog.push(entry);
  if (G.gameLog.length > MAX_LOG) G.gameLog.shift();
}

function grantGold(p: WesternLegendsPlayer, delta: number): void {
  p.gold = Math.min(MAX_PLAYER_GOLD, p.gold + delta);
}

function drawFromPokerDeck(G: WesternLegendsState, n: number): StandardCard[] {
  const out: StandardCard[] = [];
  for (let i = 0; i < n; i++) {
    if (G.pokerDeck.length === 0) {
      if (G.pokerDiscard.length === 0) break;
      G.pokerDeck = shuffle([...G.pokerDiscard]);
      G.pokerDiscard = [];
    }
    const c = G.pokerDeck.pop();
    if (c) out.push(c);
  }
  return out;
}

export function performEndGameScoring(G: WesternLegendsState): void {
  if (G.endGameScored) return;
  G.endGameScored = true;
  G.endGameScoreBreakdown = {};
  for (const pid of Object.keys(G.players)) {
    const p = G.players[pid];
    const lp = p.legendaryPoints;
    const gold = p.gold;
    G.endGameScoreBreakdown[pid] = [
      { label: 'Legendary points', vp: lp },
      { label: 'Gold (tiebreak)', vp: gold },
      { label: 'Final score (LP)', vp: lp },
    ];
  }
}

export function getGameOverResult(
  G: WesternLegendsState,
): { winner: string } | { isDraw: true } | undefined {
  if (!G.endGameScored) return undefined;
  const pids = Object.keys(G.players);
  if (pids.length === 0) return undefined;
  const ranked = pids.map((pid) => ({
    pid,
    lp: G.players[pid].legendaryPoints,
    gold: G.players[pid].gold,
  }));
  ranked.sort((a, b) => b.lp - a.lp || b.gold - a.gold);
  const top = ranked[0];
  if (!top) return undefined;
  const tied = ranked.filter((r) => r.lp === top.lp && r.gold === top.gold);
  if (tied.length > 1) return { isDraw: true };
  return { winner: top.pid };
}

function buildStoryDeck(): string[] {
  const d: string[] = [];
  for (let i = 0; i < STORY_DECK_SIZE; i++) {
    d.push(`story-${i % 6}`);
  }
  return shuffle(d);
}

function currentSpace(G: WesternLegendsState, playerId: string) {
  const p = G.players[playerId];
  if (!p) return undefined;
  return BOARD_SPACES_BY_ID[p.locationId];
}

function migrateSaloonRoundIfMissing(G: WesternLegendsState): void {
  if (G.saloonRound === undefined) G.saloonRound = null;
}

function migrateGeneralStoreStockIfMissing(G: WesternLegendsState): void {
  if (!G.generalStoreStock || typeof G.generalStoreStock !== 'object') {
    G.generalStoreStock = Object.fromEntries(
      GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]),
    );
    return;
  }
  for (const id of GENERAL_STORE_BASE_ITEM_IDS) {
    const v = G.generalStoreStock[id];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      G.generalStoreStock[id] = GENERAL_STORE_COPIES_PER_BASE_ITEM;
    }
  }
}

/** One physical store copy removed for this weapon/mount line (base or upgrade). */
function consumeGeneralStoreLineForItem(G: WesternLegendsState, itemId: string): void {
  const line = generalStoreStockLineId(itemId);
  if (line == null) return;
  migrateGeneralStoreStockIfMissing(G);
  const cur = G.generalStoreStock[line] ?? 0;
  if (cur > 0) G.generalStoreStock[line] = cur - 1;
}

function saloonEligibleToRespond(G: WesternLegendsState, pid: string): boolean {
  const r = G.saloonRound;
  if (!r) return false;
  if (r.tieBreakCandidateIds != null) return false;
  return r.pendingPlayerIds.includes(pid);
}

function resolveSaloonRound(G: WesternLegendsState): void {
  const r = G.saloonRound;
  if (!r) return;
  if (r.pendingPlayerIds.length > 0) return;
  if (r.tieBreakCandidateIds != null) return;

  const flop = r.flop;
  const joined = r.joinedPlayerIds.filter((pid) => G.players[pid] != null);
  if (joined.length <= 0) {
    G.pokerDiscard.push(...flop);
    G.saloonRound = null;
    return;
  }

  const scores = joined.map((pid) => ({
    pid,
    score: bestPokerScoreFromHandAndFlop(G.players[pid].hand as StandardCard[], flop),
  }));
  let best = scores[0]!;
  for (const s of scores.slice(1)) {
    if (comparePokerScores(s.score, best.score) > 0) best = s;
  }
  const tied = scores.filter((s) => comparePokerScores(s.score, best.score) === 0).map((s) => s.pid);

  if (tied.length > 1 && !tied.includes(r.activePlayerId)) {
    r.tieBreakCandidateIds = tied;
    return;
  }

  const winner = tied.includes(r.activePlayerId) ? r.activePlayerId : tied[0]!;
  const pot = r.potGold;
  const wp = G.players[winner]!;
  grantGold(wp, pot);
  wp.legendaryPoints += SALOON_WIN_LEGEND_POINTS;
  migratePlayerItemsIfMissing(wp);
  if (wp.ownedMiscItemIds.includes('hat')) {
    wp.legendaryPoints += 1;
  }

  const losers = joined.filter((pid) => pid !== winner);
  for (const pid of losers) {
    const lp = G.players[pid];
    if (!lp) continue;
    const d = drawFromPokerDeck(G, 1);
    if (d[0]) lp.hand.push(d[0]);
    migratePlayerItemsIfMissing(lp);
    if (lp.ownedMiscItemIds.includes('hat')) {
      grantGold(lp, 10);
    }
  }

  appendLog(
    G,
    r.activePlayerId,
    `Saloon: ${winner} won ${pot} gold and +${SALOON_WIN_LEGEND_POINTS} LP (${joined.length} player(s))${
      wp.ownedMiscItemIds.includes('hat') ? '; Ten-Gallon Hat: winner +1 LP' : ''
    }`,
  );

  G.pokerDiscard.push(...flop);
  G.saloonRound = null;
}

const MAX_TRACK_POINTS = 9;

function clampTrackPoints(n: number): number {
  return Math.max(0, Math.min(MAX_TRACK_POINTS, n));
}

/** Clockwise “player to your right” = next seat in `ctx.playOrder`. */
function clockwiseNextPlayerId(ctx: Ctx, G: WesternLegendsState, fromId: string): string {
  const order =
    ctx.playOrder != null && ctx.playOrder.length > 0
      ? ctx.playOrder
      : Object.keys(G.players).sort((a, b) => Number(a) - Number(b));
  const i = order.indexOf(fromId);
  const idx = i >= 0 ? (i + 1) % order.length : 0;
  return order[idx] ?? fromId;
}

/** After a move ends at `destId`, resolve cattle wrangle (`rs-1`) or rustle (different ranch). */
function tryResolveCattleDelivery(
  G: WesternLegendsState,
  ctx: Ctx,
  p: WesternLegendsPlayer,
  destId: string,
): void {
  if (p.carriedCattle == null) return;
  const dest = BOARD_SPACES_BY_ID[destId];
  if (!dest) return;
  if (destId === 'rs-1') {
    p.carriedCattle = null;
    p.marshalPoints = clampTrackPoints(p.marshalPoints + WRANGLE_MARSHAL_POINTS);
    grantGold(p, WRANGLE_BONUS_GOLD);
    appendLog(
      G,
      ctx.currentPlayer,
      `wrangle: delivered cattle at Rail Station (+${WRANGLE_MARSHAL_POINTS} MP, +${WRANGLE_BONUS_GOLD} gold)`,
    );
  }
}

/** First map move this turn opens slot A; further moves reuse it. */
function ensureMoveSlotOrReject(p: WesternLegendsPlayer): boolean {
  if (!Array.isArray(p.turnActions)) p.turnActions = [];
  if (p.turnActions.includes('move')) return true;
  if (p.turnActions.length >= TURN_ACTIONS_PER_TURN) return false;
  p.turnActions.push('move');
  return true;
}

/** Location / card / fight each consume one of the 3 turn slots (rulebook B/C/D). */
function takeDiscreteTurnSlot(p: WesternLegendsPlayer, kind: Exclude<TurnActionKind, 'move'>): boolean {
  if (!Array.isArray(p.turnActions)) p.turnActions = [];
  if (p.turnActions.length >= TURN_ACTIONS_PER_TURN) return false;
  p.turnActions.push(kind);
  return true;
}

function rollProspectFace(): ProspectFace {
  const u = Math.random();
  if (u < 0.25) return 'nugget';
  if (u < 0.5) return 'tailings';
  if (u < 0.75) return 'goldDust';
  return 'gravel';
}

function maxNuggetsForPlayer(p: WesternLegendsPlayer): number {
  migratePlayerItemsIfMissing(p);
  const mounts = p.ownedMountItemIds;
  return mounts.includes('mule') || mounts.includes('mule_upgrade') ? MAX_NUGGETS + 2 : MAX_NUGGETS;
}

/** Movement points from the mount equipped this turn (after loadout / income). */
function movementPointsForEquippedMount(p: WesternLegendsPlayer): number {
  migratePlayerItemsIfMissing(p);
  const m = p.turnMountItemId;
  if (m === 'mustang_upgrade') return 5;
  if (m === 'mustang') return 4;
  if (m === 'mule_upgrade') return 4;
  return DEFAULT_MOVEMENT_POINTS;
}

function refreshMovementPointsForTurnMount(p: WesternLegendsPlayer): void {
  p.movementPointsLeft = movementPointsForEquippedMount(p);
}

/** Apply one prospecting die outcome (no nested gold-dust reroll). */
function applyProspectFaceWithOutcome(p: WesternLegendsPlayer, face: ProspectFace): ProspectDieOutcome {
  const cap = maxNuggetsForPlayer(p);
  let nuggetAdded = false;
  let goldAdded = 0;
  if (face === 'nugget') {
    if (p.nuggets < cap) {
      p.nuggets += 1;
      nuggetAdded = true;
    }
  } else if (face === 'tailings' || face === 'goldDust') {
    grantGold(p, PROSPECT_TAILINGS_GOLD);
    goldAdded = PROSPECT_TAILINGS_GOLD;
  }
  return { face, nuggetAdded, goldAdded };
}

function undoProspectOutcome(p: WesternLegendsPlayer, o: ProspectDieOutcome): void {
  if (o.nuggetAdded) p.nuggets = Math.max(0, p.nuggets - 1);
  if (o.goldAdded > 0) p.gold = Math.max(0, p.gold - o.goldAdded);
}

function describeProspectOutcome(o: ProspectDieOutcome, p: WesternLegendsPlayer): string {
  if (o.face === 'nugget') {
    return o.nuggetAdded ? 'gold nugget' : `nugget (at carry cap ${maxNuggetsForPlayer(p)})`;
  }
  if (o.face === 'tailings') return 'tailings +10 gold';
  if (o.face === 'goldDust') return 'gold dust +10 gold';
  return 'gravel';
}

function allPlayersChoseCharacter(G: WesternLegendsState): boolean {
  return Object.values(G.players).every((p) => p.characterId != null);
}

function characterSelectionIncomplete(G: WesternLegendsState): boolean {
  return Object.values(G.players).some((p) => p.characterId == null);
}

/** Older / persisted states may omit {@link WesternLegendsPlayer.marshalPoints}; backfill from starter def. */
function migrateMarshalPointsIfMissing(G: WesternLegendsState): void {
  for (const pl of Object.values(G.players)) {
    if (pl.marshalPoints != null && Number.isFinite(pl.marshalPoints)) continue;
    const def = pl.characterId ? STARTER_CHARACTER_BY_ID[pl.characterId] : undefined;
    pl.marshalPoints = def?.startingMarshal ?? 0;
  }
}

function migrateStoryInPlayIfMissing(G: WesternLegendsState): void {
  if (!Array.isArray(G.storyInPlay)) G.storyInPlay = [];
}

/** Wanted track rows1–3 (points 1–3 / 4–6 / 7–9): LP gained at end of turn while wanted. */
function wantedTrackRowLpGain(wantedPoints: number): number {
  if (wantedPoints <= 0) return 0;
  const slot = Math.min(9, wantedPoints);
  if (slot <= 3) return 1;
  if (slot <= 6) return 2;
  return 3;
}

function resolveStoriesAtEndOfTurn(G: WesternLegendsState, ctx: Ctx, actingPlayerId: string): void {
  const need = storyDiscsRequiredToResolve(ctx.numPlayers);
  const kept: { cardId: string; discs: number }[] = [];
  for (const row of G.storyInPlay) {
    if (row.discs >= need) {
      G.storyDiscard.push(row.cardId);
      appendLog(
        G,
        actingPlayerId,
        `story resolved: ${row.cardId} (${row.discs} discs, need ${need})`,
      );
    } else {
      kept.push(row);
    }
  }
  G.storyInPlay = kept;
}

function parsePassDiscardIds(discardIds: unknown): string[] | null {
  if (discardIds === undefined || discardIds === null) return [];
  if (!Array.isArray(discardIds)) return null;
  const out: string[] = [];
  for (const x of discardIds) {
    if (typeof x !== 'string' || x.length === 0) return null;
    out.push(x);
  }
  return out;
}

function validatePassDiscards(
  p: WesternLegendsPlayer,
  maxH: number,
  discardIds: string[],
): boolean {
  const over = Math.max(0, p.hand.length - maxH);
  if (discardIds.length !== over) return false;
  if (over === 0) return true;
  const need = new Map<string, number>();
  for (const id of discardIds) {
    need.set(id, (need.get(id) ?? 0) + 1);
  }
  const have = new Map<string, number>();
  for (const c of p.hand) {
    if (!isCardHidden(c)) {
      const id = (c as VisibleCard).id;
      have.set(id, (have.get(id) ?? 0) + 1);
    }
  }
  for (const [id, n] of need) {
    if ((have.get(id) ?? 0) < n) return false;
  }
  return true;
}

function discardVisibleCardsFromHand(
  G: WesternLegendsState,
  p: WesternLegendsPlayer,
  discardIds: string[],
): void {
  const need = new Map<string, number>();
  for (const id of discardIds) {
    need.set(id, (need.get(id) ?? 0) + 1);
  }
  const next: typeof p.hand = [];
  for (const c of p.hand) {
    if (!isCardHidden(c)) {
      const id = (c as VisibleCard).id;
      const n = need.get(id) ?? 0;
      if (n > 0) {
        need.set(id, n - 1);
        G.pokerDiscard.push(c as StandardCard);
        continue;
      }
    }
    next.push(c);
  }
  p.hand = next;
}

/** Older / persisted states may omit item arrays; backfill from starter def. */
function migratePlayerItemsIfMissing(p: WesternLegendsPlayer): void {
  if (!Array.isArray(p.ownedWeaponItemIds)) {
    const def = p.characterId ? STARTER_CHARACTER_BY_ID[p.characterId] : undefined;
    p.ownedWeaponItemIds = [...(def?.startingWeaponItemIds ?? [])];
  }
  if (!Array.isArray(p.ownedMountItemIds)) {
    const def = p.characterId ? STARTER_CHARACTER_BY_ID[p.characterId] : undefined;
    p.ownedMountItemIds = [...(def?.startingMountItemIds ?? [])];
  }
  if (p.turnWeaponItemId === undefined) p.turnWeaponItemId = null;
  if (p.turnMountItemId === undefined) p.turnMountItemId = null;
  if (!Array.isArray(p.ownedMiscItemIds)) p.ownedMiscItemIds = [];
  if (p.carriedCattle === undefined) p.carriedCattle = null;
  if (p.usedHeistThisTurn !== true && p.usedHeistThisTurn !== false) p.usedHeistThisTurn = false;

  // Migration for older states: (hasCattle + cattleSourceRanchId) → carriedCattle.
  const anyP = p as unknown as { hasCattle?: boolean; cattleSourceRanchId?: unknown };
  if (anyP.hasCattle === true && p.carriedCattle == null) {
    if (anyP.cattleSourceRanchId === 'mp-2') p.carriedCattle = 'green';
    else if (anyP.cattleSourceRanchId === 'sh-3') p.carriedCattle = 'blue';
    else p.carriedCattle = null;
  }
  if (p.prospectMapRerollDice === undefined) p.prospectMapRerollDice = null;
  if (p.whiskeyReactionAvailable !== true && p.whiskeyReactionAvailable !== false) {
    p.whiskeyReactionAvailable = false;
  }
}

/** Rifle: log up to two random face-up cards from the defender's poker hand (before the duel draw). */
function logRiflePeekAtDefenderHand(
  G: WesternLegendsState,
  challengerId: string,
  target: WesternLegendsPlayer,
): void {
  migratePlayerItemsIfMissing(target);
  const visible: StandardCard[] = [];
  for (const c of target.hand) {
    if (!isCardHidden(c)) visible.push(c as StandardCard);
  }
  if (visible.length === 0) {
    appendLog(G, challengerId, 'Rifle: defender has no face-up cards in hand to peek');
    return;
  }
  const k = Math.min(2, visible.length);
  const picked = shuffle([...visible]).slice(0, k);
  const labels = picked.map((c) => (c as VisibleCard).id);
  appendLog(
    G,
    challengerId,
    `Rifle: peeked ${picked.length} random card(s) from defender's hand: ${labels.join(', ')}`,
  );
}

/** After draft pick: rulebook starting cash, poker hand size, wounds, nuggets, wanted, marshal. */
function applyCharacterStartingKit(
  G: WesternLegendsState,
  p: WesternLegendsPlayer,
  def: StarterCharacterDef,
): void {
  p.gold = Math.min(MAX_PLAYER_GOLD, def.startingGold ?? 40);
  p.wounds = def.startingWounds ?? 0;
  p.wantedPoints = def.startingWanted ?? 0;
  p.marshalPoints = def.startingMarshal ?? 0;
  p.ownedWeaponItemIds = [...(def.startingWeaponItemIds ?? [])];
  p.ownedMountItemIds = [...(def.startingMountItemIds ?? [])];
  p.nuggets = Math.min(maxNuggetsForPlayer(p), def.startingNuggets ?? 0);
  p.ownedMiscItemIds = [];
  p.carriedCattle = null;
  p.usedHeistThisTurn = false;
  p.turnWeaponItemId = null;
  p.turnMountItemId = null;
  p.needsTurnWeaponMountChoice = false;
  const n = def.startingPokerCards ?? 2;
  for (const c of p.hand) {
    G.pokerDiscard.push(c as StandardCard);
  }
  p.hand = drawFromPokerDeck(G, n);

  const linesSeen = new Set<string>();
  for (const id of [...p.ownedWeaponItemIds, ...p.ownedMountItemIds]) {
    const line = generalStoreStockLineId(id);
    if (line == null || linesSeen.has(line)) continue;
    linesSeen.add(line);
    consumeGeneralStoreLineForItem(G, id);
  }
}

function moveChooseCharacter({ G, ctx, events }: WLCtx, pickArg: unknown, startSpaceArg?: unknown) {
  if (ctx.phase !== 'chooseCharacter') return INVALID_MOVE;
  const pick = pickArg === 0 || pickArg === 1 ? pickArg : Number(pickArg);
  if (pick !== 0 && pick !== 1) return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  if (!p?.characterOffers || p.characterId != null) return INVALID_MOVE;
  const chosenId = p.characterOffers[pick];
  const def = STARTER_CHARACTER_BY_ID[chosenId];
  if (!def) return INVALID_MOVE;

  const choices = characterHasStartSpaceChoices(def) ? def.startSpaceChoices! : null;
  let locationId: string;
  if (choices) {
    if (typeof startSpaceArg !== 'string' || !choices.includes(startSpaceArg)) return INVALID_MOVE;
    if (!BOARD_SPACES_BY_ID[startSpaceArg]) return INVALID_MOVE;
    locationId = startSpaceArg;
  } else {
    if (startSpaceArg != null && startSpaceArg !== '') return INVALID_MOVE;
    if (!BOARD_SPACES_BY_ID[def.startSpaceId]) return INVALID_MOVE;
    locationId = def.startSpaceId;
  }

  p.characterId = chosenId;
  p.locationId = locationId;
  p.characterOffers = null;
  applyCharacterStartingKit(G, p, def);
  const startSpace = BOARD_SPACES_BY_ID[locationId]!;
  appendLog(G, ctx.currentPlayer, `chose ${def.name} (starts ${spaceLabelForLog(startSpace)})`);
  if (allPlayersChoseCharacter(G)) {
    events.endPhase();
  }
}

function moveMoveToLocation({ G, ctx }: WLCtx, locationId: string) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  if (!p || !BOARD_SPACES_BY_ID[locationId]) return INVALID_MOVE;
  if (locationId === p.locationId) return INVALID_MOVE;
  if (!Number.isFinite(p.movementPointsLeft) || p.movementPointsLeft < 0) {
    p.movementPointsLeft = movementPointsForEquippedMount(p);
  }
  const cost = getShortestPathLength(BOARD_SPACES_BY_ID, p.locationId, locationId);
  if (cost == null || cost < 1) return INVALID_MOVE;
  if (cost > p.movementPointsLeft) return INVALID_MOVE;
  const reachable = getReachableSpaceIds(BOARD_SPACES_BY_ID, p.locationId, p.movementPointsLeft);
  if (!reachable.has(locationId)) return INVALID_MOVE;
  const dest = BOARD_SPACES_BY_ID[locationId];
  if (!ensureMoveSlotOrReject(p)) return INVALID_MOVE;
  migratePlayerItemsIfMissing(p);
  p.whiskeyReactionAvailable = false;
  p.movementPointsLeft -= cost;
  p.locationId = locationId;
  appendLog(G, ctx.currentPlayer, `moved to ${spaceLabelForLog(dest)}`);
  tryResolveCattleDelivery(G, ctx, p, locationId);

  const othersHere = Object.keys(G.players).filter(
    (oid) => oid !== ctx.currentPlayer && G.players[oid]?.locationId === locationId,
  );
  if (p.ownedMiscItemIds.includes('whiskey') && othersHere.length > 0) {
    p.whiskeyReactionAvailable = true;
  }
}

/** Work — only on a location-action hex (same rule as other location actions). Counts as D. */
function moveWorkForPay({ G, ctx }: WLCtx) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  const loc = currentSpace(G, ctx.currentPlayer);
  if (!p || !loc?.actionKind) return INVALID_MOVE;
  if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;
  grantGold(p, WORK_PAY_GOLD);
  appendLog(G, ctx.currentPlayer, `worked (+${WORK_PAY_GOLD} gold)`);
}

/** B — use an action on a card (rules not simulated yet). */
function moveUseCardAction({ G, ctx }: WLCtx) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  if (!p) return INVALID_MOVE;
  if (!takeDiscreteTurnSlot(p, 'card')) return INVALID_MOVE;
  appendLog(G, ctx.currentPlayer, 'used a card action (stub — card text not simulated)');
}

/** Prospect for gold — Mine space; dice simplified to rulebook-style results. */
function moveProspectForGold({ G, ctx }: WLCtx) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  const loc = currentSpace(G, ctx.currentPlayer);
  if (!p || loc?.actionKind !== 'prospectGold') return INVALID_MOVE;
  if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;
  migratePlayerItemsIfMissing(p);
  const outcomes: ProspectDieOutcome[] = [];
  const first = rollProspectFace();
  outcomes.push(applyProspectFaceWithOutcome(p, first));
  if (first === 'goldDust') {
    const second = rollProspectFace();
    outcomes.push(applyProspectFaceWithOutcome(p, second));
  }
  p.prospectMapRerollDice = p.ownedMiscItemIds.includes('map') ? outcomes : null;
  const parts = outcomes.map((o) => describeProspectOutcome(o, p));
  appendLog(G, ctx.currentPlayer, `prospected: ${parts.join('; ')}`);
}

/** B — Miner's Map: reroll one prospecting die from the last mine action this turn. */
function moveMinerMapRerollProspect({ G, ctx }: WLCtx, dieIndexArg: unknown) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  if (!p) return INVALID_MOVE;
  migratePlayerItemsIfMissing(p);
  if (!p.ownedMiscItemIds.includes('map')) return INVALID_MOVE;
  const dice = p.prospectMapRerollDice;
  const idx = typeof dieIndexArg === 'number' ? dieIndexArg : Number(dieIndexArg);
  if (!Number.isInteger(idx) || idx < 0 || dice == null || idx >= dice.length) return INVALID_MOVE;
  if (!takeDiscreteTurnSlot(p, 'card')) return INVALID_MOVE;
  const prev = dice[idx]!;
  undoProspectOutcome(p, prev);
  const newFace = rollProspectFace();
  const next = applyProspectFaceWithOutcome(p, newFace);
  p.prospectMapRerollDice = null;
  appendLog(
    G,
    ctx.currentPlayer,
    `Miner's Map: rerolled die ${idx + 1} → ${describeProspectOutcome(next, p)} (was ${describeProspectOutcome(prev, p)})`,
  );
}

/** B — Whiskey reaction: discard Whiskey to give another player in your space 1 wound. */
function moveUseWhiskeyReaction({ G, ctx }: WLCtx, targetIdArg: unknown) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  if (typeof targetIdArg !== 'string' || targetIdArg.length === 0) return INVALID_MOVE;
  const targetId = targetIdArg;
  const p = G.players[ctx.currentPlayer];
  if (!p) return INVALID_MOVE;
  migratePlayerItemsIfMissing(p);
  if (p.whiskeyReactionAvailable !== true) return INVALID_MOVE;
  const ix = p.ownedMiscItemIds.indexOf('whiskey');
  if (ix < 0) return INVALID_MOVE;
  const target = G.players[targetId];
  if (!target || targetId === ctx.currentPlayer) return INVALID_MOVE;
  if (target.locationId !== p.locationId) return INVALID_MOVE;
  if (!takeDiscreteTurnSlot(p, 'card')) return INVALID_MOVE;
  p.ownedMiscItemIds.splice(ix, 1);
  target.wounds += 1;
  p.whiskeyReactionAvailable = false;
  appendLog(
    G,
    ctx.currentPlayer,
    `Whiskey: discarded — gave 1 wound to player ${targetId} (same space)`,
  );
}

/** B — Provisions: discard to draw 1 poker card and heal 1 wound. */
function moveUseProvisions({ G, ctx }: WLCtx) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  if (!p) return INVALID_MOVE;
  migratePlayerItemsIfMissing(p);
  const ix = p.ownedMiscItemIds.indexOf('provisions');
  if (ix < 0) return INVALID_MOVE;
  if (!takeDiscreteTurnSlot(p, 'card')) return INVALID_MOVE;
  p.ownedMiscItemIds.splice(ix, 1);
  p.wounds = Math.max(0, p.wounds - 1);
  const d = drawFromPokerDeck(G, 1);
  if (d[0]) p.hand.push(d[0]);
  appendLog(G, ctx.currentPlayer, 'Provisions: discarded — drew 1 poker card, -1 wound');
}

/** Saloon — start a multiplayer poker round in the current town (join/skip prompt for others). */
function moveStartSaloon({ G, ctx }: WLCtx) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  migrateSaloonRoundIfMissing(G);
  if (G.saloonRound != null) return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  const loc = currentSpace(G, ctx.currentPlayer);
  if (!p || loc?.actionKind !== 'playPoker') return INVALID_MOVE;
  const cityId = getBoardSpaceCity(p.locationId);
  if (cityId == null) return INVALID_MOVE;
  if (p.gold < POKER_ANTE_GOLD) return INVALID_MOVE;
  if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;

  // Active player antes + draws 1 immediately.
  p.gold -= POKER_ANTE_GOLD;
  const anteCard = drawFromPokerDeck(G, 1)[0];
  if (!anteCard) {
    p.gold += POKER_ANTE_GOLD;
    p.turnActions.pop();
    return INVALID_MOVE;
  }
  p.hand.push(anteCard);

  const flop = drawFromPokerDeck(G, 3);
  if (flop.length < 3) {
    // Roll back ante card.
    p.hand.pop();
    G.pokerDiscard.push(anteCard);
    p.gold += POKER_ANTE_GOLD;
    p.turnActions.pop();
    return INVALID_MOVE;
  }

  const eligible = Object.keys(G.players).filter((pid) => {
    if (pid === ctx.currentPlayer) return false;
    const pl = G.players[pid];
    if (!pl) return false;
    if (getBoardSpaceCity(pl.locationId) !== cityId) return false;
    return true;
  });

  G.saloonRound = {
    activePlayerId: ctx.currentPlayer,
    cityId,
    flop,
    potGold: SALOON_HOUSE_ADDS_TO_POT + POKER_ANTE_GOLD,
    pendingPlayerIds: eligible,
    joinedPlayerIds: [ctx.currentPlayer],
    tieBreakCandidateIds: null,
  };

  appendLog(G, ctx.currentPlayer, `Saloon started in ${cityId} (waiting on ${eligible.length} player(s))`);

  if (eligible.length === 0) resolveSaloonRound(G);
}

function moveJoinSaloon({ G, ctx, playerID }: WLCtx) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  migrateSaloonRoundIfMissing(G);
  const pid = typeof playerID === 'string' ? playerID : null;
  if (pid == null) return INVALID_MOVE;
  if (!saloonEligibleToRespond(G, pid)) return INVALID_MOVE;
  const r = G.saloonRound!;
  const p = G.players[pid];
  if (!p) return INVALID_MOVE;
  if (getBoardSpaceCity(p.locationId) !== r.cityId) return INVALID_MOVE;
  if (p.gold < POKER_ANTE_GOLD) return INVALID_MOVE;

  p.gold -= POKER_ANTE_GOLD;
  const c = drawFromPokerDeck(G, 1)[0];
  if (!c) {
    p.gold += POKER_ANTE_GOLD;
    return INVALID_MOVE;
  }
  p.hand.push(c);

  r.potGold += POKER_ANTE_GOLD;
  r.joinedPlayerIds.push(pid);
  r.pendingPlayerIds = r.pendingPlayerIds.filter((id) => id !== pid);
  appendLog(G, pid, 'joined Saloon poker');
  resolveSaloonRound(G);
}

function moveSkipSaloon({ G, ctx, playerID }: WLCtx) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  migrateSaloonRoundIfMissing(G);
  const pid = typeof playerID === 'string' ? playerID : null;
  if (pid == null) return INVALID_MOVE;
  if (!saloonEligibleToRespond(G, pid)) return INVALID_MOVE;
  const r = G.saloonRound!;
  r.pendingPlayerIds = r.pendingPlayerIds.filter((id) => id !== pid);
  appendLog(G, pid, 'skipped Saloon poker');
  resolveSaloonRound(G);
}

function moveChooseSaloonWinner({ G, ctx }: WLCtx, winnerIdArg: unknown) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  migrateSaloonRoundIfMissing(G);
  const r = G.saloonRound;
  if (!r || r.tieBreakCandidateIds == null) return INVALID_MOVE;
  if (ctx.currentPlayer !== r.activePlayerId) return INVALID_MOVE;
  if (typeof winnerIdArg !== 'string' || winnerIdArg.length === 0) return INVALID_MOVE;
  const winner = winnerIdArg;
  if (!r.tieBreakCandidateIds.includes(winner)) return INVALID_MOVE;

  const pot = r.potGold;
  const wp = G.players[winner];
  if (!wp) return INVALID_MOVE;
  grantGold(wp, pot);
  wp.legendaryPoints += SALOON_WIN_LEGEND_POINTS;

  const losers = r.joinedPlayerIds.filter((pid) => pid !== winner);
  for (const pid of losers) {
    const lp = G.players[pid];
    if (!lp) continue;
    const d = drawFromPokerDeck(G, 1);
    if (d[0]) lp.hand.push(d[0]);
  }

  appendLog(G, r.activePlayerId, `Saloon: tie broken, ${winner} wins ${pot} gold and +${SALOON_WIN_LEGEND_POINTS} LP`);
  G.pokerDiscard.push(...r.flop);
  G.saloonRound = null;
}


/** Revel — Cabaret; $30 × tiers → tiers LP (tiers 1–4). */
function moveRevel({ G, ctx }: WLCtx, tiersArg: unknown) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const tiers = typeof tiersArg === 'number' ? tiersArg : Number(tiersArg);
  const p = G.players[ctx.currentPlayer];
  const loc = currentSpace(G, ctx.currentPlayer);
  if (!p || loc?.actionKind !== 'cabaret') return INVALID_MOVE;
  if (!Number.isInteger(tiers) || tiers < 1 || tiers > 4) return INVALID_MOVE;
  const cost = tiers * REVEL_GOLD_PER_LP;
  if (p.gold < cost) return INVALID_MOVE;
  if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;
  p.gold -= cost;
  p.legendaryPoints += tiers;
  appendLog(G, ctx.currentPlayer, `revel (−${cost} gold, +${tiers} LP)`);
}

/** Deposit nuggets — Bank; sell all carried nuggets. */
function moveDepositNuggets({ G, ctx }: WLCtx) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  const loc = currentSpace(G, ctx.currentPlayer);
  if (!p || loc?.actionKind !== 'bank') return INVALID_MOVE;
  if (p.nuggets <= 0) return INVALID_MOVE;
  if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;
  const n = p.nuggets;
  p.nuggets = 0;
  grantGold(p, n * DEPOSIT_GOLD_PER_NUGGET);
  p.legendaryPoints += n * DEPOSIT_LP_PER_NUGGET;
  migratePlayerItemsIfMissing(p);
  let extra = '';
  if (p.ownedMountItemIds.includes('mule_upgrade') && n >= 4) {
    p.legendaryPoints += 1;
    extra = '; Rosinane: +1 LP (deposited 4+ nuggets)';
  }
  appendLog(
    G,
    ctx.currentPlayer,
    `deposited ${n} nugget(s) (+${n * DEPOSIT_GOLD_PER_NUGGET} gold, +${n * DEPOSIT_LP_PER_NUGGET} LP)${extra}`,
  );
}

/**
 * Heist — Bank; once per turn. Clockwise neighbor is guard; both draw 3 poker cards as fight stubs.
 * Robber wins ties. Win: $80 + 3 wanted. Lose: +1 wanted, +1 wound, draw 1 poker.
 */
function moveHeist({ G, ctx }: WLCtx) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  const loc = currentSpace(G, ctx.currentPlayer);
  if (!p || loc?.actionKind !== 'bank') return INVALID_MOVE;
  migratePlayerItemsIfMissing(p);
  if (p.usedHeistThisTurn) return INVALID_MOVE;
  if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;

  const drawRobber = drawFromPokerDeck(G, 3);
  const drawGuard = drawFromPokerDeck(G, 3);
  if (drawRobber.length < 3 || drawGuard.length < 3) {
    p.turnActions.pop();
    return INVALID_MOVE;
  }

  p.usedHeistThisTurn = true;
  const cmp = compareThreeCardFight(drawRobber, drawGuard);
  G.pokerDiscard.push(...drawRobber, ...drawGuard);

  const guardId = clockwiseNextPlayerId(ctx, G, ctx.currentPlayer);
  const guardPl = G.players[guardId];
  const guardLabel =
    guardPl?.characterId != null
      ? (STARTER_CHARACTER_BY_ID[guardPl.characterId]?.name ?? `seat ${guardId}`)
      : `seat ${guardId}`;

  if (cmp >= 0) {
    grantGold(p, HEIST_WIN_GOLD);
    p.wantedPoints = clampTrackPoints(p.wantedPoints + HEIST_WIN_WANTED);
    appendLog(
      G,
      ctx.currentPlayer,
      `heist succeeded vs ${guardLabel} (+${HEIST_WIN_GOLD} gold, +${HEIST_WIN_WANTED} wanted)`,
    );
  } else {
    p.wantedPoints = clampTrackPoints(p.wantedPoints + HEIST_LOSE_WANTED);
    p.wounds += 1;
    const drawn = drawFromPokerDeck(G, 1);
    if (drawn[0]) p.hand.push(drawn[0]);
    appendLog(
      G,
      ctx.currentPlayer,
      `heist failed vs ${guardLabel} (+${HEIST_LOSE_WANTED} wanted, +1 wound, drew 1 card)`,
    );
  }
}

/** Heal — Doctor's Office; $10, lose all wounds, draw 1 poker per wound healed. */
function moveHeal({ G, ctx }: WLCtx) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  const loc = currentSpace(G, ctx.currentPlayer);
  if (!p || loc?.actionKind !== 'doctor') return INVALID_MOVE;
  if (p.wounds <= 0) return INVALID_MOVE;
  if (p.gold < HEAL_COST_GOLD) return INVALID_MOVE;
  if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;
  p.gold -= HEAL_COST_GOLD;
  const healed = p.wounds;
  p.wounds = 0;
  const drawn = drawFromPokerDeck(G, healed);
  p.hand.push(...drawn);
  appendLog(
    G,
    ctx.currentPlayer,
    `healed (−${HEAL_COST_GOLD} gold, −${healed} wound(s), drew ${drawn.length} card(s))`,
  );
}

/** Acquire cattle — Ranch; one token at a time. */
function moveAcquireCattle({ G, ctx }: WLCtx) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  const loc = currentSpace(G, ctx.currentPlayer);
  if (!p || loc?.actionKind !== 'ranch') return INVALID_MOVE;
  migratePlayerItemsIfMissing(p);
  if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;

  // Green herd: pick up at mp-2, deliver at sh-3.
  if (loc.id === 'mp-2') {
    if (p.carriedCattle === null) {
      p.carriedCattle = 'green';
      appendLog(G, ctx.currentPlayer, `picked up Green cattle at ${spaceLabelForLog(loc)}`);
      return;
    }
    if (p.carriedCattle === 'blue') {
      p.carriedCattle = null;
      p.wantedPoints = clampTrackPoints(p.wantedPoints + RUSTLE_WANTED_POINTS);
      grantGold(p, RUSTLE_BONUS_GOLD);
      appendLog(
        G,
        ctx.currentPlayer,
        `rustle: delivered Blue cattle at ${spaceLabelForLog(loc)} (+${RUSTLE_WANTED_POINTS} wanted, +${RUSTLE_BONUS_GOLD} gold)`,
      );
      return;
    }
    // carrying green already
    p.turnActions.pop();
    return INVALID_MOVE;
  }

  // Blue herd: pick up at sh-3, deliver at mp-2.
  if (loc.id === 'sh-3') {
    if (p.carriedCattle === null) {
      p.carriedCattle = 'blue';
      appendLog(G, ctx.currentPlayer, `picked up Blue cattle at ${spaceLabelForLog(loc)}`);
      return;
    }
    if (p.carriedCattle === 'green') {
      p.carriedCattle = null;
      p.wantedPoints = clampTrackPoints(p.wantedPoints + RUSTLE_WANTED_POINTS);
      grantGold(p, RUSTLE_BONUS_GOLD);
      appendLog(
        G,
        ctx.currentPlayer,
        `rustle: delivered Green cattle at ${spaceLabelForLog(loc)} (+${RUSTLE_WANTED_POINTS} wanted, +${RUSTLE_BONUS_GOLD} gold)`,
      );
      return;
    }
    // carrying blue already
    p.turnActions.pop();
    return INVALID_MOVE;
  }

  // Any other (unexpected) ranch-flagged space
  p.turnActions.pop();
  return INVALID_MOVE;
}

/** General Store — buy or upgrade one item (one location action). */
function moveBuyFromGeneralStore({ G, ctx }: WLCtx, itemIdArg: unknown) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  if (typeof itemIdArg !== 'string' || itemIdArg.length === 0) return INVALID_MOVE;
  const itemId = itemIdArg;
  const price = GENERAL_STORE_PRICES[itemId];
  if (price == null) return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  const loc = currentSpace(G, ctx.currentPlayer);
  if (!p || loc?.actionKind !== 'generalStore') return INVALID_MOVE;
  migratePlayerItemsIfMissing(p);
  if (p.gold < price) return INVALID_MOVE;

  const baseForUpgrade = ITEM_UPGRADE_BASE[itemId];
  if (baseForUpgrade != null) {
    if (WEAPON_ITEM_ID_SET.has(itemId)) {
      if (!p.ownedWeaponItemIds.includes(baseForUpgrade)) return INVALID_MOVE;
      if (p.ownedWeaponItemIds.includes(itemId)) return INVALID_MOVE;
    } else if (MOUNT_ITEM_ID_SET.has(itemId)) {
      if (!p.ownedMountItemIds.includes(baseForUpgrade)) return INVALID_MOVE;
      if (p.ownedMountItemIds.includes(itemId)) return INVALID_MOVE;
    } else {
      return INVALID_MOVE;
    }
  } else if (WEAPON_ITEM_ID_SET.has(itemId)) {
    if (p.ownedWeaponItemIds.includes(itemId)) return INVALID_MOVE;
  } else if (MOUNT_ITEM_ID_SET.has(itemId)) {
    if (p.ownedMountItemIds.includes(itemId)) return INVALID_MOVE;
  } else if (isMiscItemId(itemId)) {
    if (p.ownedMiscItemIds.includes(itemId)) return INVALID_MOVE;
    if (p.ownedMiscItemIds.length >= GENERAL_STORE_MAX_MISC_ITEMS) return INVALID_MOVE;
  } else {
    return INVALID_MOVE;
  }

  migrateGeneralStoreStockIfMissing(G);
  if (baseForUpgrade == null && GENERAL_STORE_BASE_ITEM_ID_SET.has(itemId)) {
    const left = G.generalStoreStock[itemId] ?? 0;
    if (left <= 0) return INVALID_MOVE;
  }

  if (!takeDiscreteTurnSlot(p, 'location')) return INVALID_MOVE;
  p.gold -= price;

  if (baseForUpgrade != null) {
    if (WEAPON_ITEM_ID_SET.has(itemId)) {
      p.ownedWeaponItemIds = p.ownedWeaponItemIds.filter((id) => id !== baseForUpgrade);
      p.ownedWeaponItemIds.push(itemId);
    } else {
      p.ownedMountItemIds = p.ownedMountItemIds.filter((id) => id !== baseForUpgrade);
      p.ownedMountItemIds.push(itemId);
    }
    const lp = UPGRADE_FLIP_LEGEND_POINTS[itemId] ?? 0;
    if (lp > 0) p.legendaryPoints += lp;
    appendLog(
      G,
      ctx.currentPlayer,
      lp > 0
        ? `General Store: flipped to ${itemId} (−${price} gold, +${lp} LP)`
        : `General Store: flipped to ${itemId} (−${price} gold)`,
    );
    return;
  }

  if (GENERAL_STORE_BASE_ITEM_ID_SET.has(itemId)) {
    G.generalStoreStock[itemId] = (G.generalStoreStock[itemId] ?? 0) - 1;
  }

  if (WEAPON_ITEM_ID_SET.has(itemId)) {
    p.ownedWeaponItemIds.push(itemId);
  } else if (MOUNT_ITEM_ID_SET.has(itemId)) {
    p.ownedMountItemIds.push(itemId);
  } else {
    p.ownedMiscItemIds.push(itemId);
  }

  if (itemId === 'provisions') {
    const d = drawFromPokerDeck(G, 1);
    if (d[0]) p.hand.push(d[0]);
    appendLog(
      G,
      ctx.currentPlayer,
      `General Store: bought ${itemId} (-${price} gold); Provisions: drew 1 poker card`,
    );
    return;
  }
  if (itemId === 'whiskey') {
    p.wounds = Math.max(0, p.wounds - 1);
    appendLog(
      G,
      ctx.currentPlayer,
      `General Store: bought ${itemId} (-${price} gold); Whiskey: -1 wound`,
    );
    return;
  }

  appendLog(G, ctx.currentPlayer, `General Store: bought ${itemId} (-${price} gold)`);
}

/** Simplified duel: not the full fight rules — loser takes 1 wound and draws 1 card; winner +2 LP (rulebook Duel). */
function moveDuelAtLocation({ G, ctx }: WLCtx, targetId: string) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const challengerId = ctx.currentPlayer;
  if (targetId === challengerId || !G.players[targetId]) return INVALID_MOVE;
  const challenger = G.players[challengerId];
  const target = G.players[targetId];
  if (challenger.locationId !== target.locationId) return INVALID_MOVE;
  if (!takeDiscreteTurnSlot(challenger, 'fight')) return INVALID_MOVE;
  migratePlayerItemsIfMissing(challenger);
  migratePlayerItemsIfMissing(target);
  if (challenger.turnWeaponItemId === 'rifle' || challenger.turnWeaponItemId === 'rifle_upgrade') {
    logRiflePeekAtDefenderHand(G, challengerId, target);
  }

  const handA = drawFromPokerDeck(G, 5);
  const handB = drawFromPokerDeck(G, 5);
  if (handA.length < 5 || handB.length < 5) {
    challenger.turnActions.pop();
    return INVALID_MOVE;
  }

  const defWeapon = target.turnWeaponItemId;
  const defenderDowngradesChallengerCard =
    defWeapon === 'revolver_upgrade' ||
    defWeapon === 'rifle_upgrade' ||
    defWeapon === 'shotgun_upgrade';
  const downgraded = defenderDowngradesChallengerCard
    ? applyDefenderDowngradeChallengerOneCard(handA, handB)
    : { challenger: handA, summary: null as string | null };
  const handAResolved = downgraded.challenger;
  if (downgraded.summary != null) {
    appendLog(G, targetId, `${defWeapon}: ${downgraded.summary}`);
  }

  const cmp = comparePokerHands(handAResolved, handB);
  if (cmp > 0) {
    challenger.legendaryPoints += 2;
    target.wounds += 1;
    const d = drawFromPokerDeck(G, 1);
    if (d[0]) target.hand.push(d[0]);
    let winMsg = 'won the duel (+2 LP)';
    if (challenger.turnWeaponItemId === 'shotgun' || challenger.turnWeaponItemId === 'shotgun_upgrade') {
      const sd = drawFromPokerDeck(G, 1);
      if (sd[0]) {
        challenger.hand.push(sd[0]);
        winMsg +=
          challenger.turnWeaponItemId === 'shotgun_upgrade'
            ? '; Long Tom: drew 1 poker card'
            : '; Shotgun: drew 1 poker card';
      } else {
        winMsg += '; Shotgun: deck empty (no card)';
      }
    }
    appendLog(G, challengerId, winMsg);
  } else if (cmp < 0) {
    target.legendaryPoints += 2;
    challenger.wounds += 1;
    const d = drawFromPokerDeck(G, 1);
    if (d[0]) challenger.hand.push(d[0]);
    appendLog(G, challengerId, 'lost the duel (+2 LP to defender)');
  } else {
    appendLog(G, challengerId, 'duel tied');
  }
  G.pokerDiscard.push(...handAResolved, ...handB);
}

function resolveTurnLoadoutAfterIncome(G: WesternLegendsState, playerId: string): void {
  const p = G.players[playerId];
  if (!p) return;
  migratePlayerItemsIfMissing(p);
  const weapons = uniqueWeaponOptions(p.ownedWeaponItemIds);
  const mounts = uniqueMountOptions(p.ownedMountItemIds);
  if (weapons.length <= 1 && mounts.length <= 1) {
    p.turnWeaponItemId = weapons[0] ?? null;
    p.turnMountItemId = mounts[0] ?? null;
    p.needsTurnWeaponMountChoice = false;
    const w = p.turnWeaponItemId ?? 'no weapon';
    const m = p.turnMountItemId ?? 'no mount';
    appendLog(G, playerId, `turn loadout: ${w}, ${m} (auto)`);
    refreshMovementPointsForTurnMount(p);
  } else {
    p.turnWeaponItemId = null;
    p.turnMountItemId = null;
    p.needsTurnWeaponMountChoice = true;
    refreshMovementPointsForTurnMount(p);
  }
}

function normalizeLoadoutArg(a: unknown): string | null {
  if (a == null || a === '') return null;
  if (typeof a !== 'string') return null;
  return a;
}

function moveChooseTurnWeaponMount({ G, ctx }: WLCtx, weaponArg: unknown, mountArg: unknown) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  if (!p?.needsTurnWeaponMountChoice) return INVALID_MOVE;
  migratePlayerItemsIfMissing(p);
  const weapons = uniqueWeaponOptions(p.ownedWeaponItemIds);
  const mounts = uniqueMountOptions(p.ownedMountItemIds);
  const weaponId = normalizeLoadoutArg(weaponArg);
  const mountId = normalizeLoadoutArg(mountArg);
  if (weapons.length === 0) {
    if (weaponId != null) return INVALID_MOVE;
  } else if (weaponId == null || !weapons.includes(weaponId)) return INVALID_MOVE;
  if (mounts.length === 0) {
    if (mountId != null) return INVALID_MOVE;
  } else if (mountId == null || !mounts.includes(mountId)) return INVALID_MOVE;
  p.turnWeaponItemId = weaponId;
  p.turnMountItemId = mountId;
  p.needsTurnWeaponMountChoice = false;
  appendLog(
    G,
    ctx.currentPlayer,
    `turn loadout: ${weaponId ?? 'no weapon'}, ${mountId ?? 'no mount'}`,
  );
  refreshMovementPointsForTurnMount(p);
}

function moveChooseStartTurnIncome({ G, ctx }: WLCtx, option: unknown) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  if (!p?.needsStartTurnIncomeChoice) return INVALID_MOVE;
  const o = option as StartTurnIncomeOption;
  if (o !== 'gold20' && o !== 'draw2' && o !== 'gold10draw1') return INVALID_MOVE;
  p.needsStartTurnIncomeChoice = false;
  if (o === 'gold20') {
    grantGold(p, START_TURN_INCOME_GOLD_ONLY);
    appendLog(G, ctx.currentPlayer, `turn income: +$${START_TURN_INCOME_GOLD_ONLY}`);
  } else if (o === 'draw2') {
    const drawn = drawFromPokerDeck(G, START_TURN_INCOME_DRAW);
    if (drawn.length) p.hand.push(...drawn);
    appendLog(
      G,
      ctx.currentPlayer,
      drawn.length >= START_TURN_INCOME_DRAW
        ? `turn income: drew ${START_TURN_INCOME_DRAW} poker cards`
        : `turn income: drew ${drawn.length} poker card(s) (deck thin)`,
    );
  } else {
    grantGold(p, START_TURN_INCOME_SPLIT_GOLD);
    const drawn = drawFromPokerDeck(G, START_TURN_INCOME_SPLIT_DRAW);
    if (drawn.length) p.hand.push(...drawn);
    appendLog(
      G,
      ctx.currentPlayer,
      drawn.length
        ? `turn income: +$${START_TURN_INCOME_SPLIT_GOLD}, drew ${START_TURN_INCOME_SPLIT_DRAW} poker card`
        : `turn income: +$${START_TURN_INCOME_SPLIT_GOLD} (could not draw card)`,
    );
  }
  resolveTurnLoadoutAfterIncome(G, ctx.currentPlayer);
}

function movePass({ G, ctx, events }: WLCtx, discardIdsArg?: unknown) {
  if (ctx.phase !== 'play') return INVALID_MOVE;
  const p = G.players[ctx.currentPlayer];
  if (p?.needsStartTurnIncomeChoice) return INVALID_MOVE;
  if (p?.needsTurnWeaponMountChoice) return INVALID_MOVE;
  migrateStoryInPlayIfMissing(G);
  resolveStoriesAtEndOfTurn(G, ctx, ctx.currentPlayer);

  const maxH = maxPokerHandSize(p);
  const parsed = parsePassDiscardIds(discardIdsArg);
  if (parsed === null) return INVALID_MOVE;
  if (!validatePassDiscards(p, maxH, parsed)) return INVALID_MOVE;
  if (parsed.length > 0) discardVisibleCardsFromHand(G, p, parsed);

  const lpGain = wantedTrackRowLpGain(p.wantedPoints);
  if (lpGain > 0) {
    p.legendaryPoints += lpGain;
    appendLog(G, ctx.currentPlayer, `end of turn: +${lpGain} LP (wanted track row)`);
  }

  appendLog(G, ctx.currentPlayer, 'passed');
  events.endTurn();
}

const WesternLegendsGame: Game<WesternLegendsState> = {
  name: 'western-legends',

  events: {
    endPhase: true,
    endTurn: true,
  },

  setup: (
    firstArg: { ctx: Ctx; setupData?: WesternLegendsSetupData } | Ctx,
    secondArg?: WesternLegendsSetupData,
  ): WesternLegendsState => {
    const ctx =
      typeof (firstArg as { ctx?: Ctx }).ctx !== 'undefined'
        ? (firstArg as { ctx: Ctx }).ctx
        : (firstArg as Ctx);
    const setupData = (firstArg as { setupData?: WesternLegendsSetupData }).setupData ?? secondArg;
    const shortGame = setupData?.shortGame === true;
    const legendGoal = setupData?.legendGoal ?? (shortGame ? SHORT_GAME_LEGEND_GOAL : LEGEND_POINTS_TO_WIN);

    const pokerDeck = shuffle(createStandardDeck());
    const pokerDiscard: StandardCard[] = [];
    const players: WesternLegendsState['players'] = {};
    const n = ctx.numPlayers;
    // Starter roster — see starterCharacters.ts (pool must be ≥ 2 × players).
    const charIds = shuffle(
      STARTER_CHARACTERS.filter((c) => {
        const ids =
          c.startSpaceChoices && c.startSpaceChoices.length > 0 ? c.startSpaceChoices : [c.startSpaceId];
        return ids.every((id) => BOARD_SPACES_BY_ID[id] != null);
      }).map((c) => c.id),
    );
    if (charIds.length < n * 2) {
      throw new Error('starter character pool too small for player count');
    }

    for (let i = 0; i < n; i++) {
      const pid = String(i);
      const hand: StandardCard[] = [];
      for (let h = 0; h < 2; h++) {
        const c = pokerDeck.pop();
        if (c) hand.push(c);
      }
      const oa = charIds.pop()!;
      const ob = charIds.pop()!;
      players[pid] = {
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        characterOffers: [oa, ob],
        characterId: null,
        locationId: BOARD_STARTING_SPACE_ID,
        movementPointsLeft: DEFAULT_MOVEMENT_POINTS,
        gold: 40,
        legendaryPoints: 0,
        wounds: 0,
        nuggets: 0,
        carriedCattle: null,
        wantedPoints: 0,
        marshalPoints: 0,
        hand,
        turnActions: [],
        needsStartTurnIncomeChoice: false,
        ownedWeaponItemIds: [],
        ownedMountItemIds: [],
        ownedMiscItemIds: [],
        usedHeistThisTurn: false,
        turnWeaponItemId: null,
        turnMountItemId: null,
        needsTurnWeaponMountChoice: false,
        prospectMapRerollDice: null,
        whiskeyReactionAvailable: false,
      };
    }

    const initialStock = Object.fromEntries(
      GENERAL_STORE_BASE_ITEM_IDS.map((id) => [id, GENERAL_STORE_COPIES_PER_BASE_ITEM]),
    );

    return {
      round: 0,
      turnOrderIndex: 0,
      players,
      pokerDeck,
      pokerDiscard,
      saloonRound: null,
      generalStoreStock: initialStock,
      storyDeck: buildStoryDeck(),
      storyDiscard: [],
      storyInPlay: [],
      endGameScored: false,
      endGameScoreBreakdown: {},
      gameLog: [],
      legendGoal,
      history: [],
    };
  },

  phases: {
    chooseCharacter: {
      start: true,
      next: 'play',
      turn: {
        minMoves: 1,
        maxMoves: 1,
      },
    },
    play: {
      onBegin: ({ G }) => {
        migrateMarshalPointsIfMissing(G);
        migrateStoryInPlayIfMissing(G);
        migrateSaloonRoundIfMissing(G);
        migrateGeneralStoreStockIfMissing(G);
      },
      turn: {
        onBegin: ({ G, ctx }) => {
          migrateMarshalPointsIfMissing(G);
          migrateStoryInPlayIfMissing(G);
          migrateSaloonRoundIfMissing(G);
          const p = G.players[ctx.currentPlayer];
          if (!p) return;
          migratePlayerItemsIfMissing(p);
          p.usedHeistThisTurn = false;
          // carried cattle persists across turns; nothing to reset
          p.movementPointsLeft = DEFAULT_MOVEMENT_POINTS;
          p.prospectMapRerollDice = null;
          p.whiskeyReactionAvailable = false;
          p.turnActions = [];
          p.turnWeaponItemId = null;
          p.turnMountItemId = null;
          p.needsTurnWeaponMountChoice = false;
          const def = p.characterId ? STARTER_CHARACTER_BY_ID[p.characterId] : undefined;
          const legendaryActive = p.legendaryPoints >= LEGENDARY_ACTION_MIN_LP;
          if (legendaryActive && def?.startOfTurnGold) {
            grantGold(p, def.startOfTurnGold);
            appendLog(
              G,
              ctx.currentPlayer,
              `start of turn: +$${def.startOfTurnGold} (${def.name})`,
            );
          }
          if (legendaryActive && def?.startOfTurnDrawPoker) {
            const drawn = drawFromPokerDeck(G, def.startOfTurnDrawPoker);
            if (drawn.length) p.hand.push(...drawn);
            appendLog(
              G,
              ctx.currentPlayer,
              drawn.length
                ? `start of turn: drew ${drawn.length} poker card(s) (${def.name})`
                : `start of turn: could not draw poker (${def.name}; deck empty)`,
            );
          }
          p.needsStartTurnIncomeChoice = true;
        },
        minMoves: 1,
        /** Enough room for movement, location actions, then {@link movePass} to end the turn. */
        maxMoves: 64,
      },
    },
  },

  moves: {
    chooseCharacter: moveChooseCharacter,
    chooseStartTurnIncome: moveChooseStartTurnIncome,
    chooseTurnWeaponMount: moveChooseTurnWeaponMount,
    moveToLocation: moveMoveToLocation,
    workForPay: moveWorkForPay,
    prospectForGold: moveProspectForGold,
    startSaloon: moveStartSaloon,
    joinSaloon: moveJoinSaloon,
    skipSaloon: moveSkipSaloon,
    chooseSaloonWinner: moveChooseSaloonWinner,
    revel: moveRevel,
    depositNuggets: moveDepositNuggets,
    heist: moveHeist,
    heal: moveHeal,
    acquireCattle: moveAcquireCattle,
    buyFromGeneralStore: moveBuyFromGeneralStore,
    minerMapRerollProspect: moveMinerMapRerollProspect,
    useWhiskeyReaction: moveUseWhiskeyReaction,
    useProvisions: moveUseProvisions,
    duelAtLocation: moveDuelAtLocation,
    useCardAction: moveUseCardAction,
    pass: movePass,
  },

  endIf: ({ G, ctx }: WLCtx) => {
    const maxTurns = MAX_ROUNDS * ctx.numPlayers;
    if (ctx.turn >= maxTurns) {
      performEndGameScoring(G);
      return getGameOverResult(G) ?? { isDraw: true };
    }
    for (const pid of Object.keys(G.players)) {
      if (G.players[pid].legendaryPoints >= G.legendGoal) {
        performEndGameScoring(G);
        return getGameOverResult(G) ?? { winner: pid };
      }
    }
    return undefined;
  },

};

export const westernLegendsGameDef = defineGame<WesternLegendsState>({
  game: WesternLegendsGame,
  id: 'western-legends',
  displayName: 'Western Legends',
  description:
    'Digital helper for Western Legends: map icon spaces and location actions from the rulebook, simplified poker and fights.',
  minPlayers: 2,
  maxPlayers: 6,
  setupOptions: [
    {
      type: 'boolean',
      id: 'shortGame',
      label: 'Short game (15 legend points)',
      description: 'Matches the rulebook short-game LP target in this prototype.',
      default: false,
    },
  ],
  validateMove({ G, playerID, currentPlayer }, moveName, ...args) {
    if (characterSelectionIncomplete(G)) {
      if (moveName !== 'chooseCharacter') return 'Finish character selection first';
      if (playerID !== currentPlayer) return 'Not your turn';
      const pick = args[0];
      if (pick !== 0 && pick !== 1) return 'Pick card 0 or 1';
      const p = G.players[playerID];
      if (!p?.characterOffers || p.characterId != null) return 'No character offers to choose';
      const offeredId = p.characterOffers[pick];
      const def = STARTER_CHARACTER_BY_ID[offeredId];
      if (!def) return 'Invalid character offer';
      if (characterHasStartSpaceChoices(def)) {
        const sid = args[1];
        if (typeof sid !== 'string' || !def.startSpaceChoices!.includes(sid)) {
          return 'Choose a bandit hideout to start in';
        }
      }
      return true;
    }
    migrateSaloonRoundIfMissing(G);
    if (G.saloonRound != null) {
      const r = G.saloonRound;
      if (r.tieBreakCandidateIds != null) {
        if (playerID !== r.activePlayerId) return 'Waiting for active player to break Saloon tie';
        if (moveName !== 'chooseSaloonWinner') return 'Choose Saloon winner (tie-break) first';
        return true;
      }
      if (playerID != null && r.pendingPlayerIds.includes(playerID)) {
        if (moveName !== 'joinSaloon' && moveName !== 'skipSaloon') return 'Respond to Saloon (join or skip) first';
        return true;
      }
      if (playerID === r.activePlayerId) {
        return 'Waiting for other players to respond to Saloon';
      }
      return 'Waiting for Saloon to resolve';
    }

    if (playerID !== currentPlayer) return 'Not your turn';
    if (moveName === 'chooseCharacter') return 'Character already chosen';
    const p = G.players[playerID];
    if (p?.needsStartTurnIncomeChoice) {
      if (moveName !== 'chooseStartTurnIncome') return 'Choose turn income first (+$20, draw 2 cards, or +$10 and 1 card)';
      return true;
    }
    if (moveName === 'chooseStartTurnIncome') return 'Turn income already chosen';
    if (p?.needsTurnWeaponMountChoice) {
      if (moveName !== 'chooseTurnWeaponMount') return 'Choose weapon and mount for this turn first';
      return true;
    }
    if (moveName === 'chooseTurnWeaponMount') return 'Weapon and mount already set for this turn';
    if (moveName === 'pass') {
      const maxH = maxPokerHandSize(p);
      const over = Math.max(0, p.hand.length - maxH);
      const raw = args[0];
      if (over > 0) {
        if (!Array.isArray(raw) || raw.length !== over) {
          return `Discard exactly ${over} poker card(s) before ending your turn (max hand ${maxH})`;
        }
      } else if (raw != null && Array.isArray(raw) && raw.length > 0) {
        return 'Your hand is within the limit; do not pass discards';
      }
      return true;
    }
    return true;
  },
  stripSecretInfo: (G: WesternLegendsState, playerID: string | null): BaseGameState => {
    const clone = JSON.parse(JSON.stringify(G)) as WesternLegendsState;
    if (playerID === null) {
      for (const pid of Object.keys(clone.players)) {
        clone.players[pid].hand = redactCards(clone.players[pid].hand as VisibleCard[]);
        clone.players[pid].characterOffers = null;
      }
      clone.pokerDeck = [];
      return clone;
    }
    for (const pid of Object.keys(clone.players)) {
      if (pid !== playerID) {
        clone.players[pid].hand = redactCards(clone.players[pid].hand as VisibleCard[]);
        clone.players[pid].characterOffers = null;
      }
    }
    clone.pokerDeck = [];
    return clone;
  },
});
