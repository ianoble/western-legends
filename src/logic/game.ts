import type { Game, Ctx, FnContext } from 'boardgame.io';
import {
  createStandardDeck,
  shuffle,
  defineGame,
  redactCards,
  INVALID_MOVE,
  type BaseGameState,
  type VisibleCard,
  type StandardCard,
} from '@engine/client';
import { comparePokerHands } from './poker';
import {
  GOLD_COST_PER_LEGEND_POINT,
  LEGEND_POINTS_TO_WIN,
  LOCATION_DEFS,
  MAX_ROUNDS,
  MINE_GOLD_YIELD,
  PLAYER_COLORS,
  STARTING_LOCATION_ID,
  STORY_DECK_SIZE,
  type GameLogEntry,
  type PlayerColor,
  type WesternLegendsSetupData,
  type WesternLegendsState,
} from './types';

const MAX_LOG = 120;

type WLCtx = FnContext<WesternLegendsState>;

function appendLog(G: WesternLegendsState, actorPlayerId: string, message: string): void {
  const player = G.players[actorPlayerId];
  const entry: GameLogEntry = { message, playerColor: player?.color };
  G.gameLog.push(entry);
  if (G.gameLog.length > MAX_LOG) G.gameLog.shift();
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

function moveSetPlayerColor({ G, playerID }: WLCtx, color: PlayerColor) {
  if (!PLAYER_COLORS.includes(color)) return INVALID_MOVE;
  const pid = String(playerID);
  const player = G.players[pid];
  if (!player) return INVALID_MOVE;
  if (player.color === color) return;
  for (const oid of Object.keys(G.players)) {
    if (oid !== pid && G.players[oid].color === color) {
      G.players[oid].color = player.color;
      break;
    }
  }
  player.color = color;
}

function moveMoveToLocation({ G, ctx }: WLCtx, locationId: string) {
  const p = G.players[ctx.currentPlayer];
  if (!p || !LOCATION_DEFS[locationId]) return INVALID_MOVE;
  const here = LOCATION_DEFS[p.locationId];
  if (!here.neighbors.includes(locationId)) return INVALID_MOVE;
  p.locationId = locationId;
  appendLog(G, ctx.currentPlayer, `rode to ${LOCATION_DEFS[locationId].name}`);
}

function moveWorkMine({ G, ctx }: WLCtx) {
  const p = G.players[ctx.currentPlayer];
  const loc = LOCATION_DEFS[p.locationId];
  if (!loc?.hasMine) return INVALID_MOVE;
  p.gold += MINE_GOLD_YIELD;
  appendLog(G, ctx.currentPlayer, `worked the mine (+${MINE_GOLD_YIELD} gold)`);
}

function moveVisitSaloon({ G, ctx }: WLCtx) {
  const p = G.players[ctx.currentPlayer];
  const loc = LOCATION_DEFS[p.locationId];
  if (!loc?.isSaloon) return INVALID_MOVE;
  p.gold += 1;
  appendLog(G, ctx.currentPlayer, 'ordered a drink (+1 gold)');
}

function moveDrawStoryCard({ G, ctx }: WLCtx) {
  if (G.storyDeck.length === 0) {
    if (G.storyDiscard.length === 0) return INVALID_MOVE;
    G.storyDeck = shuffle([...G.storyDiscard]);
    G.storyDiscard = [];
  }
  const id = G.storyDeck.pop();
  if (!id) return INVALID_MOVE;
  G.storyDiscard.push(id);
  const p = G.players[ctx.currentPlayer];
  p.gold += 1;
  appendLog(G, ctx.currentPlayer, `drew a story card (${id}, +1 gold)`);
}

function moveBuyLegendPoint({ G, ctx }: WLCtx) {
  const p = G.players[ctx.currentPlayer];
  const loc = LOCATION_DEFS[p.locationId];
  if (!loc?.isSaloon) return INVALID_MOVE;
  if (p.gold < GOLD_COST_PER_LEGEND_POINT) return INVALID_MOVE;
  p.gold -= GOLD_COST_PER_LEGEND_POINT;
  p.legendaryPoints += 1;
  appendLog(G, ctx.currentPlayer, `bought renown (${GOLD_COST_PER_LEGEND_POINT} gold → 1 legend)`);
}

function moveDuelAtLocation({ G, ctx }: WLCtx, targetId: string) {
  const challengerId = ctx.currentPlayer;
  if (targetId === challengerId || !G.players[targetId]) return INVALID_MOVE;
  const challenger = G.players[challengerId];
  const target = G.players[targetId];
  if (challenger.locationId !== target.locationId) return INVALID_MOVE;
  const handA = drawFromPokerDeck(G, 5);
  const handB = drawFromPokerDeck(G, 5);
  if (handA.length < 5 || handB.length < 5) return INVALID_MOVE;
  const cmp = comparePokerHands(handA, handB);
  if (cmp > 0) {
    challenger.legendaryPoints += 1;
    if (target.grit > 0) target.grit -= 1;
    appendLog(G, challengerId, 'won the duel (challenger)');
  } else if (cmp < 0) {
    target.legendaryPoints += 1;
    if (challenger.grit > 0) challenger.grit -= 1;
    appendLog(G, challengerId, 'lost the duel (defender wins)');
  } else {
    appendLog(G, challengerId, 'duel tied — no legend');
  }
  G.pokerDiscard.push(...handA, ...handB);
}

function movePass({ G, ctx }: WLCtx) {
  appendLog(G, ctx.currentPlayer, 'passed');
}

const WesternLegendsGame: Game<WesternLegendsState> = {
  name: 'WesternLegends',

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
    const legendGoal = setupData?.legendGoal ?? (shortGame ? 6 : LEGEND_POINTS_TO_WIN);

    const pokerDeck = shuffle(createStandardDeck());
    const pokerDiscard: StandardCard[] = [];
    const players: WesternLegendsState['players'] = {};
    const n = ctx.numPlayers;

    for (let i = 0; i < n; i++) {
      const pid = String(i);
      const hand: StandardCard[] = [];
      for (let h = 0; h < 2; h++) {
        const c = pokerDeck.pop();
        if (c) hand.push(c);
      }
      players[pid] = {
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        locationId: STARTING_LOCATION_ID,
        gold: 3,
        legendaryPoints: 0,
        grit: 3,
        hand,
      };
    }

    return {
      round: 0,
      turnOrderIndex: 0,
      players,
      pokerDeck,
      pokerDiscard,
      storyDeck: buildStoryDeck(),
      storyDiscard: [],
      endGameScored: false,
      endGameScoreBreakdown: {},
      gameLog: [],
      legendGoal,
      history: [],
    };
  },

  moves: {
    setPlayerColor: moveSetPlayerColor,
    moveToLocation: moveMoveToLocation,
    workMine: moveWorkMine,
    visitSaloon: moveVisitSaloon,
    drawStoryCard: moveDrawStoryCard,
    buyLegendPoint: moveBuyLegendPoint,
    duelAtLocation: moveDuelAtLocation,
    pass: movePass,
  },

  endIf: ({ G, ctx }: { G: WesternLegendsState; ctx: Ctx }) => {
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

  turn: {
    minMoves: 1,
    maxMoves: 1,
  },
};

export const westernLegendsGameDef = defineGame<WesternLegendsState>({
  game: WesternLegendsGame,
  id: 'western-legends',
  displayName: 'Western Legends',
  description:
    'Sandbox frontier: ride between towns, mine and trade, draw stories, and settle scores at poker duels on the path to becoming a legend.',
  minPlayers: 2,
  maxPlayers: 6,
  setupOptions: [
    {
      type: 'boolean',
      id: 'shortGame',
      label: 'Short game (6 legend points)',
      description: 'Lower legend goal for a quicker session.',
      default: false,
    },
  ],
  validateMove({ playerID, currentPlayer }) {
    if (playerID !== currentPlayer) return 'Not your turn';
    return true;
  },
  stripSecretInfo: (G: WesternLegendsState, playerID: string | null): BaseGameState => {
    const clone = JSON.parse(JSON.stringify(G)) as WesternLegendsState;
    if (playerID === null) {
      for (const pid of Object.keys(clone.players)) {
        clone.players[pid].hand = redactCards(clone.players[pid].hand as VisibleCard[]);
      }
      clone.pokerDeck = [];
      return clone;
    }
    for (const pid of Object.keys(clone.players)) {
      if (pid !== playerID) {
        clone.players[pid].hand = redactCards(clone.players[pid].hand as VisibleCard[]);
      }
    }
    clone.pokerDeck = [];
    return clone;
  },
});
