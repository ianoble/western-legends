<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useGame, useTurnNotifications, loadSession, GameLog } from '@engine/client';
import { gameDef } from '../logic/index';
import { SERVER_URL } from '../config';
import type { WesternLegendsState } from '../logic/types';
import GameBoard from '../components/GameBoard.vue';
import SetupGuide from '../components/SetupGuide.vue';

const props = defineProps<{ matchID: string; playerID: string }>();

const game = useGame<WesternLegendsState>();
const {
  isConnected,
  isMyTurn,
  gameover,
  reconnecting,
  connect,
  disconnect,
  state,
  isActive,
  playerID: clientPlayerId,
} = game;

const G = computed(() => state.value);

const {
  requestPermission: requestTurnNotifications,
  permission: notificationPermission,
  supported: notificationsSupported,
} = useTurnNotifications({
  displayName: gameDef.displayName,
  body: "It's your turn in Western Legends.",
});

async function onEnableTurnNotifications() {
  await requestTurnNotifications();
}

const gameLoaded = computed(() => {
  const pid = clientPlayerId.value;
  const g = G.value;
  if (pid == null || !g || typeof g.legendGoal !== 'number') return false;
  const players = g.players;
  return players != null && typeof players === 'object' && pid in players;
});

const statusMessage = computed(() => {
  if (reconnecting.value) return 'Reconnecting to the game server…';
  if (!isConnected.value) return 'Connecting to the game server…';
  if (!gameLoaded.value) return 'Receiving game state from the server…';
  if (!isActive.value) {
    return 'This match is not active yet. Wait for the lobby to finish or share the join link so the table fills.';
  }
  if (isMyTurn.value) return 'Your turn — take an action on the frontier panel.';
  return 'Waiting for another player’s turn.';
});

onMounted(() => {
  const session = loadSession(gameDef.id, props.matchID);
  const creds = session?.playerID === props.playerID ? session.credentials : undefined;
  connect(gameDef.id, props.matchID, props.playerID, creds);
});

onUnmounted(() => {
  disconnect();
});
</script>

<template>
  <div class="relative flex min-h-screen flex-col gap-4 overflow-hidden text-slate-100 md:flex-row md:justify-center">
    <div
      class="pointer-events-none absolute inset-0 z-0 bg-[#1a120b]"
      aria-hidden="true"
      style="
        background-image: linear-gradient(to bottom, rgba(15, 23, 42, 0.72), rgba(15, 23, 42, 0.88)),
          url(/board/western-legends-board.jpg);
        background-size: cover, contain;
        background-position: center, center;
        background-repeat: no-repeat, no-repeat;
      "
    />

    <div class="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-4">
      <SetupGuide />

      <header class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/85 px-3 py-3 shadow backdrop-blur-sm">
        <h1 class="text-lg font-semibold">{{ gameDef.displayName }}</h1>
        <span
          class="rounded-full px-2 py-0.5 text-xs"
          :class="
            isConnected
              ? isActive
                ? 'bg-emerald-900/60 text-emerald-200'
                : 'bg-amber-900/50 text-amber-200'
              : reconnecting
                ? 'bg-sky-900/50 text-sky-200'
                : 'bg-slate-800 text-slate-400'
          "
        >
          {{
            !isConnected
              ? reconnecting
                ? 'Reconnecting…'
                : 'Offline'
              : !gameLoaded
                ? 'Syncing…'
                : !isActive
                  ? 'Lobby'
                  : 'Playing'
          }}
        </span>
      </header>

      <p
        class="mb-2 rounded-lg border border-slate-800/80 bg-slate-950/85 px-3 py-2 text-center text-sm text-slate-200 shadow backdrop-blur-sm"
        role="status"
      >
        {{ statusMessage }}
      </p>

      <div
        v-if="notificationsSupported && isConnected && gameLoaded && isActive"
        class="mb-2 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-slate-400"
      >
        <template v-if="notificationPermission !== 'granted'">
          <button
            type="button"
            class="rounded-lg border border-slate-600 bg-slate-900/90 px-3 py-1.5 text-slate-200 hover:bg-slate-800"
            @click="onEnableTurnNotifications"
          >
            Notify me when it’s my turn
          </button>
          <span class="text-slate-500">(works when this tab is in the background)</span>
        </template>
        <span v-else class="text-slate-500">Desktop notifications on — we’ll ping you on your turn if the tab isn’t focused.</span>
      </div>

      <p v-if="isConnected && !isActive && gameLoaded" class="mb-2 text-center text-xs text-slate-400">
        Match <code class="rounded bg-slate-900 px-1 py-0.5 text-slate-300">{{ matchID }}</code>
 · You are seat <code class="rounded bg-slate-900 px-1 py-0.5 text-slate-300">{{ playerID }}</code>
      </p>

      <GameBoard
        :connection-ok="isConnected"
        :reconnecting="reconnecting"
        :game-loaded="gameLoaded"
        :match-active="isActive"
      />

      <div
        v-if="gameover"
        class="mt-4 rounded-lg border border-amber-800/50 bg-slate-950/90 p-4 text-center text-sm shadow backdrop-blur-sm"
      >
        <template v-if="gameover.winner !== undefined">
          <span v-if="gameover.winner === playerID" class="text-emerald-400">You win!</span>
          <span v-else class="text-slate-300">You lose.</span>
        </template>
        <span v-else class="text-slate-300">Draw.</span>
      </div>

      <div class="mt-6 space-y-1 text-center text-xs text-slate-500">
        <p>
          Server
          <code class="rounded bg-slate-900/80 px-1 py-0.5 text-slate-400">{{ SERVER_URL }}</code>
          — set <code class="rounded bg-slate-900/80 px-1">VITE_SERVER_URL</code> if the client cannot connect.
        </p>
        <router-link to="/" class="inline-block text-sm text-slate-500 hover:text-slate-300">← Lobby</router-link>
      </div>
    </div>
    <GameLog />
  </div>
</template>
