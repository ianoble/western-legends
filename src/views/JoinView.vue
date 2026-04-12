<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { saveSession, loadSession } from '@engine/client';
import { gameDef } from '../logic/index';
import { SERVER_URL } from '../config';

const props = defineProps<{ matchID: string }>();
const router = useRouter();

const playerName = ref(localStorage.getItem('bgf:playerName') ?? '');
const joining = ref(false);
const errorMsg = ref('');

onMounted(() => {
  const existing = loadSession(gameDef.id, props.matchID);
  if (existing) {
    router.replace(`/game/${props.matchID}/${existing.playerID}`);
  }
});

function persistName() {
  const name = playerName.value.trim() || 'Player';
  localStorage.setItem('bgf:playerName', name);
  return name;
}

async function joinMatch() {
  joining.value = true;
  errorMsg.value = '';
  try {
    const name = persistName();
    const matchRes = await fetch(`${SERVER_URL}/games/${gameDef.id}/${props.matchID}`);
    if (!matchRes.ok) throw new Error('Match not found');
    const matchData = (await matchRes.json()) as {
      players: Array<{ id: number; name?: string }>;
    };

    const openSeat = matchData.players.find((p) => !p.name);
    if (!openSeat) throw new Error('No open seats');
    const seatID = String(openSeat.id);

    const joinRes = await fetch(`${SERVER_URL}/games/${gameDef.id}/${props.matchID}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerID: seatID, playerName: name }),
    });
    if (!joinRes.ok) throw new Error('Failed to join');
    const { playerCredentials } = (await joinRes.json()) as { playerCredentials: string };

    saveSession(gameDef.id, props.matchID, {
      playerID: seatID,
      credentials: playerCredentials,
      playerName: name,
    });

    router.replace(`/game/${props.matchID}/${seatID}`);
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Join failed';
  } finally {
    joining.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-md px-4 py-12 text-center text-slate-100">
    <h1 class="mb-2 text-xl font-semibold">Join {{ gameDef.displayName }}</h1>
    <p class="mb-6 font-mono text-sm text-slate-400">Match {{ matchID }}</p>

    <label class="mb-4 block text-left text-sm">
      <span class="text-slate-400">Your name</span>
      <input
        v-model="playerName"
        type="text"
        class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2"
      />
    </label>

    <button
      type="button"
      class="w-full rounded-lg bg-amber-700 px-4 py-2.5 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
      :disabled="joining"
      @click="joinMatch"
    >
      {{ joining ? 'Joining…' : 'Join match' }}
    </button>

    <p v-if="errorMsg" class="mt-4 text-sm text-red-400">{{ errorMsg }}</p>
    <router-link to="/" class="mt-8 inline-block text-sm text-slate-500 hover:text-slate-300">← Lobby</router-link>
  </div>
</template>
