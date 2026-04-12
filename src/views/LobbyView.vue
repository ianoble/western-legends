<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { saveSession } from '@engine/client';
import { gameDef } from '../logic/index';
import { SERVER_URL } from '../config';

const router = useRouter();

const playerName = ref(localStorage.getItem('bgf:playerName') ?? '');
const numPlayers = ref(gameDef.minPlayers);
const creating = ref(false);
const errorMsg = ref('');
const createdMatchID = ref<string | null>(null);
const linkCopied = ref(false);

function buildDefaultSetupData(): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const opt of gameDef.setupOptions ?? []) {
    data[opt.id] = opt.default;
  }
  return data;
}

const setupData = ref<Record<string, unknown>>(buildDefaultSetupData());

function persistName() {
  const name = playerName.value.trim() || 'Player';
  localStorage.setItem('bgf:playerName', name);
  return name;
}

async function createMatch() {
  creating.value = true;
  errorMsg.value = '';
  createdMatchID.value = null;
  try {
    const name = persistName();
    const createRes = await fetch(`${SERVER_URL}/games/${gameDef.id}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numPlayers: numPlayers.value,
        setupData: setupData.value,
      }),
    });
    if (!createRes.ok) throw new Error('Server rejected match creation');
    const { matchID } = (await createRes.json()) as { matchID: string };

    const joinRes = await fetch(`${SERVER_URL}/games/${gameDef.id}/${matchID}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerID: '0', playerName: name }),
    });
    if (!joinRes.ok) throw new Error('Failed to claim seat');
    const { playerCredentials } = (await joinRes.json()) as { playerCredentials: string };

    saveSession(gameDef.id, matchID, {
      playerID: '0',
      credentials: playerCredentials,
      playerName: name,
    });
    createdMatchID.value = matchID;
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed to create match';
  } finally {
    creating.value = false;
  }
}

function matchLink(matchID: string) {
  return `${window.location.origin}/join/${matchID}`;
}

async function copyLink() {
  if (!createdMatchID.value) return;
  try {
    await navigator.clipboard.writeText(matchLink(createdMatchID.value));
    linkCopied.value = true;
    setTimeout(() => {
      linkCopied.value = false;
    }, 2000);
  } catch {
    errorMsg.value = 'Clipboard access denied';
  }
}

function enterMatch(matchID: string, playerID: string) {
  router.push(`/game/${matchID}/${playerID}`);
}
</script>

<template>
  <div class="mx-auto max-w-lg px-4 py-8 text-slate-100">
    <h1 class="mb-1 text-2xl font-semibold tracking-tight">{{ gameDef.displayName }}</h1>
    <p class="mb-6 text-sm text-slate-400">{{ gameDef.description }}</p>

    <label class="mb-4 block text-sm">
      <span class="text-slate-400">Your name</span>
      <input
        v-model="playerName"
        type="text"
        class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100"
        placeholder="Player"
      />
    </label>

    <div v-if="gameDef.setupOptions?.length" class="mb-4 space-y-2">
      <label
        v-for="opt in gameDef.setupOptions"
        :key="opt.id"
        v-show="opt.type === 'boolean'"
        class="flex cursor-pointer items-center gap-2 text-sm"
      >
        <input v-model="setupData[opt.id] as boolean" type="checkbox" class="rounded border-slate-600" />
        <span>{{ opt.label }}</span>
      </label>
    </div>

    <label class="mb-4 block text-sm">
      <span class="text-slate-400">Players</span>
      <select
        v-model.number="numPlayers"
        class="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100"
      >
        <option v-for="n in gameDef.maxPlayers - gameDef.minPlayers + 1" :key="n" :value="gameDef.minPlayers + n - 1">
          {{ gameDef.minPlayers + n - 1 }}
        </option>
      </select>
    </label>

    <button
      type="button"
      class="mb-6 w-full rounded-lg bg-amber-700 px-4 py-2.5 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
      :disabled="creating"
      @click="createMatch"
    >
      {{ creating ? 'Creating…' : 'Create match' }}
    </button>

    <p v-if="errorMsg" class="mb-4 text-sm text-red-400">{{ errorMsg }}</p>

    <div v-if="createdMatchID" class="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
      <p class="mb-2 text-sm text-slate-400">Invite link</p>
      <code class="mb-3 block break-all text-xs text-amber-200/90">{{ matchLink(createdMatchID) }}</code>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800"
          @click="copyLink"
        >
          {{ linkCopied ? 'Copied' : 'Copy link' }}
        </button>
        <button
          type="button"
          class="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
          @click="enterMatch(createdMatchID, '0')"
        >
          Enter as host
        </button>
      </div>
    </div>

    <p class="mt-8 text-center text-sm text-slate-500">
      Server: <code class="text-slate-400">{{ SERVER_URL }}</code>
    </p>
  </div>
</template>
