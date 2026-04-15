import { onUnmounted, watch, type Ref } from 'vue';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { isCardHidden, shuffle, type VisibleCard } from '@engine/client';
import { gameDef } from '../logic';
import { maxPokerHandSize } from '../logic/player-hand';
import type { WesternLegendsState } from '../logic/types';
import { uiGamePhase } from '../logic/phaseUi';
import { SERVER_URL } from '../config';
import { uniqueMountOptions, uniqueWeaponOptions } from '../logic/equipment';
import { STARTER_CHARACTER_BY_ID, characterHasStartSpaceChoices } from '../logic/starterCharacters';

interface BotClient {
  playerID: string;
  client: ReturnType<typeof Client>;
  unsubscribe: () => void;
}

function loadBotCredentials(matchID: string): Record<string, string> {
  const key = `bgf:bots:${gameDef.id}:${matchID}`;
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

/**
 * Headless boardgame.io clients for seats created via “Fill with Bots” in the lobby.
 * Handles character draft and a minimal play phase so matches don’t stall.
 */
export function useBotPlayers(matchID: Ref<string>, humanPlayerID: Ref<string>) {
  const bots: BotClient[] = [];
  let started = false;

  function startBots() {
    if (started) return;
    started = true;

    const creds = loadBotCredentials(matchID.value);
    const botPlayerIDs = Object.keys(creds).filter((id) => id !== humanPlayerID.value);

    for (const pid of botPlayerIDs) {
      const client = Client({
        game: gameDef.game,
        debug: false,
        multiplayer: SocketIO({ server: SERVER_URL }),
        matchID: matchID.value,
        playerID: pid,
        credentials: creds[pid],
      } as Parameters<typeof Client>[0]);

      let acting = false;

      const unsubscribe = client.subscribe((state: unknown) => {
        if (state == null || acting) return;
        const s = state as {
          G: WesternLegendsState;
          ctx: { currentPlayer: string; phase?: string | null; gameover?: unknown };
        };
        if (s.ctx.gameover != null) return;
        const sr = s.G?.saloonRound ?? null;
        const saloonNeedsResponse = sr != null && Array.isArray(sr.pendingPlayerIds) && sr.pendingPlayerIds.includes(pid);
        const saloonTieBreak = sr != null && sr.tieBreakCandidateIds != null && sr.activePlayerId === pid;
        if (s.ctx.currentPlayer !== pid && !saloonNeedsResponse && !saloonTieBreak) return;

        if (!s.G?.players?.[pid]) return;

        acting = true;
        const delayMs = 450 + Math.floor(Math.random() * 400);

        window.setTimeout(() => {
          try {
            const fresh = client.getState() as {
              G: WesternLegendsState;
              ctx: { currentPlayer: string; phase?: string | null; gameover?: unknown };
            } | null;
            if (fresh == null || fresh.ctx.gameover != null) return;
            const srNow = fresh.G.saloonRound ?? null;
            const canActOutOfTurn =
              (srNow != null && Array.isArray(srNow.pendingPlayerIds) && srNow.pendingPlayerIds.includes(pid)) ||
              (srNow != null && srNow.tieBreakCandidateIds != null && srNow.activePlayerId === pid);
            if (fresh.ctx.currentPlayer !== pid && !canActOutOfTurn) return;

            const p = fresh.G?.players?.[pid];
            if (!p) return;

            const phase = uiGamePhase(fresh.G, fresh.ctx.phase);
            const stillNeedsCharacter =
              p.characterId == null && p.characterOffers != null && p.characterOffers.length === 2;

            if (stillNeedsCharacter && phase !== 'play') {
              const pick = Math.random() < 0.5 ? 0 : 1;
              const offeredId = p.characterOffers![pick];
              const def = STARTER_CHARACTER_BY_ID[offeredId];
              if (characterHasStartSpaceChoices(def)) {
                const opts = def.startSpaceChoices!;
                const space = opts[Math.floor(Math.random() * opts.length)]!;
                client.moves.chooseCharacter(pick, space);
              } else {
                client.moves.chooseCharacter(pick);
              }
              return;
            }

            if (phase === 'play' && p.characterId != null) {
              const sr2 = fresh.G.saloonRound ?? null;
              const needsSaloonResponse =
                sr2 != null &&
                Array.isArray(sr2.pendingPlayerIds) &&
                sr2.pendingPlayerIds.includes(pid) &&
                sr2.tieBreakCandidateIds == null;
              const needsSaloonTieBreak =
                sr2 != null && sr2.tieBreakCandidateIds != null && sr2.activePlayerId === pid;

              if (needsSaloonTieBreak) {
                const opts = sr2!.tieBreakCandidateIds!;
                const pick = opts[Math.floor(Math.random() * opts.length)]!;
                client.moves.chooseSaloonWinner(pick);
                return;
              }
              if (needsSaloonResponse) {
                const canPay = p.gold >= 10;
                if (canPay && Math.random() < 0.6) client.moves.joinSaloon();
                else client.moves.skipSaloon();
                return;
              }

              if (p.needsStartTurnIncomeChoice) {
                const opts = ['gold20', 'draw2', 'gold10draw1'] as const;
                client.moves.chooseStartTurnIncome(opts[Math.floor(Math.random() * 3)]!);
              } else if (p.needsTurnWeaponMountChoice) {
                const wo = uniqueWeaponOptions(p.ownedWeaponItemIds);
                const mo = uniqueMountOptions(p.ownedMountItemIds);
                const w = wo.length <= 1 ? wo[0] ?? null : wo[Math.floor(Math.random() * wo.length)]!;
                const m = mo.length <= 1 ? mo[0] ?? null : mo[Math.floor(Math.random() * mo.length)]!;
                client.moves.chooseTurnWeaponMount(w, m);
              } else {
                // Occasionally take a Saloon action if available and affordable.
                const here = p.locationId;
                const city = here.startsWith('dk-') ? 'darkrock' : here.startsWith('rf-') ? 'redFalls' : null;
                const canSaloon = city != null && p.gold >= 10 && fresh.G.saloonRound == null;
                if (canSaloon && Math.random() < 0.12) {
                  client.moves.startSaloon();
                  return;
                }

                const maxH = maxPokerHandSize(p);
                const over = Math.max(0, p.hand.length - maxH);
                if (over > 0) {
                  const visible = p.hand.filter((c) => !isCardHidden(c)) as VisibleCard[];
                  const pick = shuffle([...visible]).slice(0, over).map((c) => c.id);
                  client.moves.pass(pick);
                } else {
                  client.moves.pass();
                }
              }
            }
          } finally {
            acting = false;
          }
        }, delayMs);
      });

      client.start();
      bots.push({ playerID: pid, client, unsubscribe });
    }
  }

  watch(
    matchID,
    () => {
      if (matchID.value) startBots();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    for (const bot of bots) {
      bot.unsubscribe();
      bot.client.stop();
    }
    bots.length = 0;
    started = false;
  });
}
