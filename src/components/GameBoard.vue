<script setup lang="ts">
import { computed } from 'vue';
import { useGame, isCardHidden } from '@engine/client';
import type { Card } from '@engine/client';
import type { WesternLegendsState } from '../logic/types';
import { LOCATION_DEFS, PLAYER_COLORS } from '../logic/types';

const props = defineProps<{
  connectionOk: boolean;
  reconnecting: boolean;
  gameLoaded: boolean;
  matchActive: boolean;
}>();

const { state, playerID, isMyTurn, move } = useGame<WesternLegendsState>();

const G = computed(() => state.value);
const me = computed(() => (playerID.value ? G.value.players[playerID.value] : undefined));
const here = computed(() => (me.value ? LOCATION_DEFS[me.value.locationId] : undefined));
const neighbors = computed(() => here.value?.neighbors ?? []);

const othersHere = computed(() => {
  if (!playerID.value || !me.value) return [];
  return Object.keys(G.value.players).filter(
    (pid) => pid !== playerID.value && G.value.players[pid].locationId === me.value!.locationId,
  );
});

function cardLabel(c: unknown): string {
  if (isCardHidden(c as Card)) return '?';
  const card = c as { rank?: string; suit?: string };
  return `${card.rank ?? ''}${card.suit ? card.suit[0] : ''}`;
}

const panelClass = 'rounded-lg border border-slate-800 bg-slate-900/85 shadow backdrop-blur-sm';
</script>

<template>
  <div class="space-y-4">
    <section v-if="!props.connectionOk" :class="panelClass + ' p-4'">
      <h2 class="mb-2 text-sm font-medium text-slate-300">Connection</h2>
      <p class="text-sm text-slate-400">
        {{
          props.reconnecting
            ? 'Restoring your session with the game server…'
            : 'Not connected yet. Check that the dev server is running and that VITE_SERVER_URL matches your boardgame.io server (including port).'
        }}
      </p>
    </section>

    <section v-else-if="!props.gameLoaded" :class="panelClass + ' p-4'">
      <h2 class="mb-2 text-sm font-medium text-slate-300">Loading</h2>
      <p class="text-sm text-slate-400">Waiting for a full player state from the server…</p>
    </section>

    <section v-else-if="!props.matchActive" :class="panelClass + ' p-4'">
      <h2 class="mb-2 text-sm font-medium text-slate-300">Match not active</h2>
      <p class="text-sm text-slate-400">
        The room exists, but the match has not started. Finish joining in the lobby, or wait for the host to begin.
      </p>
    </section>

    <template v-else>
      <section v-if="G.legendGoal != null" :class="panelClass + ' p-4'">
        <h2 class="mb-2 text-sm font-medium text-slate-300">Frontier</h2>
        <p class="text-sm text-slate-400">
          Legend goal: <strong class="text-amber-200">{{ G.legendGoal }}</strong>
        </p>
        <p v-if="here && me" class="mt-2 text-sm">
          At <strong class="text-slate-200">{{ here.name }}</strong>
          <span v-if="here.hasMine" class="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-xs">Mine</span>
          <span v-if="here.isSaloon" class="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-xs">Saloon</span>
        </p>
      </section>

      <section v-if="me" :class="panelClass + ' p-4'">
        <h3 class="mb-2 text-sm font-medium text-slate-300">Your hand</h3>
        <ul class="flex flex-wrap gap-2">
          <li
            v-for="(c, i) in me.hand"
            :key="i"
            class="rounded-md bg-slate-800 px-2 py-1 font-mono text-xs text-slate-200"
          >
            {{ cardLabel(c) }}
          </li>
        </ul>
        <p class="mt-3 text-sm text-slate-400">
          Gold <strong class="text-amber-200">{{ me.gold }}</strong>
          · Legend <strong class="text-amber-200">{{ me.legendaryPoints }}</strong>
          · Grit <strong>{{ me.grit }}</strong>
        </p>
      </section>

      <section v-if="isMyTurn && me" :class="panelClass + ' p-4'">
        <h3 class="mb-3 text-sm font-medium text-slate-300">Actions</h3>
        <div class="mb-3 border-b border-slate-800 pb-3">
          <p class="mb-2 text-xs text-slate-500">Seat color (optional)</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="col in PLAYER_COLORS"
              :key="col"
              type="button"
              class="rounded-lg border border-slate-600 px-2 py-1 text-xs capitalize hover:bg-slate-800"
              :class="me.color === col ? 'ring-2 ring-amber-400' : ''"
              @click="move('setPlayerColor', col)"
            >
              {{ col }}
            </button>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            @click="move('pass')"
          >
            Pass
          </button>
          <button
            type="button"
            class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!here?.hasMine"
            @click="move('workMine')"
          >
            Work mine
          </button>
          <button
            type="button"
            class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!here?.isSaloon"
            @click="move('visitSaloon')"
          >
            Saloon
          </button>
          <button
            type="button"
            class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            @click="move('drawStoryCard')"
          >
            Story
          </button>
          <button
            type="button"
            class="rounded-lg border border-amber-800/60 bg-amber-900/50 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-800/50 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!here?.isSaloon || me.gold < 5"
            @click="move('buyLegendPoint')"
          >
            Buy legend (5g)
          </button>
        </div>
        <div v-if="neighbors.length" class="mt-3">
          <p class="mb-2 text-xs text-slate-500">Ride to</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="nid in neighbors"
              :key="nid"
              type="button"
              class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
              @click="move('moveToLocation', nid)"
            >
              {{ LOCATION_DEFS[nid]?.name ?? nid }}
            </button>
          </div>
        </div>
        <div v-if="othersHere.length" class="mt-3">
          <p class="mb-2 text-xs text-slate-500">Duel</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="pid in othersHere"
              :key="pid"
              type="button"
              class="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/40"
              @click="move('duelAtLocation', pid)"
            >
              vs {{ pid }}
            </button>
          </div>
        </div>
      </section>

      <section v-else :class="panelClass + ' p-4 text-center text-sm text-slate-500'">
        Waiting for your turn…
      </section>

      <section v-if="G.gameLog?.length" :class="panelClass + ' p-4'">
        <h3 class="mb-2 text-sm font-medium text-slate-400">Trail</h3>
        <ul class="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-500">
          <li v-for="(e, i) in G.gameLog.slice(-14)" :key="i">{{ e.message }}</li>
        </ul>
      </section>
    </template>
  </div>
</template>
