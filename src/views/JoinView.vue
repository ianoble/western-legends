<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { saveSession, loadSession } from '@engine/client';
import { gameDef, PLAYER_COLORS, type PlayerColor } from '../logic/index';
import { SERVER_URL } from '../config';
import { useAuth, syncSessionToServer, fetchServerSessions } from '../composables/useAuth';

const PLAYER_COLOR_TW: Record<PlayerColor, string> = {
	red: 'bg-red-600',
	blue: 'bg-blue-600',
	green: 'bg-green-600',
	yellow: 'bg-yellow-500',
	black: 'bg-zinc-900 ring-1 ring-zinc-500',
	orange: 'bg-orange-600',
};

const props = defineProps<{ matchID: string }>();
const router = useRouter();

const { playerName, isLoggedIn, loginError, loading: authLoading, register, login } = useAuth();
const authMode = ref<'login' | 'register'>('login');
const authName = ref('');
const authPin = ref('');
const status = ref<'auth' | 'ready' | 'joining' | 'error'>('auth');
const errorMsg = ref('');
const matchPlayers = ref<Array<{ id: number; name?: string; data?: { color?: string } }>>([]);
const selectedColor = ref<PlayerColor>('red');

onMounted(async () => {
	const existing = loadSession(gameDef.id, props.matchID);
	if (existing) {
		router.replace(`/game/${props.matchID}/${existing.playerID}`);
		return;
	}

	if (isLoggedIn.value) {
		const sessions = await fetchServerSessions();
		const match = sessions.find((s) => s.gameName === gameDef.id && s.matchID === props.matchID);
		if (match) {
			saveSession(gameDef.id, props.matchID, {
				playerID: match.playerSeatID,
				credentials: match.credentials,
				playerName: match.playerName,
			});
			router.replace(`/game/${props.matchID}/${match.playerSeatID}`);
			return;
		}
		status.value = 'ready';
	}
});

async function fetchMatchPlayers() {
	const res = await fetch(`${SERVER_URL}/games/${gameDef.id}/${props.matchID}`);
	if (!res.ok) return;
	const data = (await res.json()) as { players?: Array<{ id: number; name?: string; data?: { color?: string } }> };
	matchPlayers.value = data.players ?? [];
	const taken = new Set(
		(matchPlayers.value ?? []).map((p) => p.data?.color).filter(Boolean) as string[],
	);
	const available = PLAYER_COLORS.filter((c) => !taken.has(c));
	if (available.length && !available.includes(selectedColor.value)) {
		selectedColor.value = available[0] as PlayerColor;
	}
}
watch(status, (s) => {
	if (s === 'ready') fetchMatchPlayers();
});

const availableColors = computed(() => {
	const taken = new Set(
		matchPlayers.value.map((p) => p.data?.color).filter(Boolean) as string[],
	);
	return PLAYER_COLORS.filter((c) => !taken.has(c));
});

async function handleAuth() {
	const ok = authMode.value === 'register'
		? await register(authName.value, authPin.value)
		: await login(authName.value, authPin.value);
	if (ok) {
		authName.value = '';
		authPin.value = '';
		status.value = 'ready';
	}
}

async function joinMatch() {
	status.value = 'joining';
	errorMsg.value = '';

	try {
		const name = playerName.value.trim() || 'Player';

		const matchRes = await fetch(`${SERVER_URL}/games/${gameDef.id}/${props.matchID}`);
		if (!matchRes.ok) throw new Error('Match not found');
		const matchData = (await matchRes.json()) as {
			players: Array<{ id: number; name?: string; data?: { color?: string } }>;
		};

		const openSeat = matchData.players.find((p) => !p.name);
		if (!openSeat) throw new Error('No open seats — the match is full');
		const seatID = String(openSeat.id);

		const joinRes = await fetch(`${SERVER_URL}/games/${gameDef.id}/${props.matchID}/join`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				playerID: seatID,
				playerName: name,
				data: { color: selectedColor.value },
			}),
		});
		if (!joinRes.ok) throw new Error('Failed to claim seat');
		const { playerCredentials } = (await joinRes.json()) as { playerCredentials: string };

		saveSession(gameDef.id, props.matchID, {
			playerID: seatID,
			credentials: playerCredentials,
			playerName: name,
			playerColor: selectedColor.value,
		});
		await syncSessionToServer(gameDef.id, props.matchID, seatID, playerCredentials, name);

		router.replace(`/game/${props.matchID}/${seatID}`);
	} catch (e: unknown) {
		status.value = 'error';
		errorMsg.value = e instanceof Error ? e.message : 'Failed to join match';
	}
}
</script>

<template>
	<div class="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
		<div class="w-full max-w-sm space-y-6">
			<h1 class="text-2xl font-bold text-center">Join {{ gameDef.displayName }}</h1>
			<p class="text-sm text-slate-400 text-center">Match: <code class="text-blue-400">{{ matchID }}</code></p>

			<!-- Auth required -->
			<template v-if="!isLoggedIn">
				<div class="space-y-3">
					<div class="text-center">
						<p class="text-sm text-slate-400">Sign in to join this game.</p>
					</div>
					<div>
						<label class="block text-sm font-medium text-slate-400 mb-1">Name</label>
						<input
							v-model="authName"
							placeholder="Your display name"
							maxlength="24"
							class="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
							@keyup.enter="handleAuth"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-slate-400 mb-1">PIN</label>
						<input
							v-model="authPin"
							type="password"
							placeholder="4-8 characters"
							maxlength="8"
							class="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
							@keyup.enter="handleAuth"
						/>
					</div>

					<p v-if="loginError" class="text-sm text-red-400 text-center">{{ loginError }}</p>

					<button
						class="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition-colors disabled:opacity-50"
						:disabled="authLoading || !authName.trim() || authPin.length < 4"
						@click="handleAuth"
					>
						{{ authLoading ? 'Please wait...' : (authMode === 'login' ? 'Sign In' : 'Create Account') }}
					</button>

					<p class="text-center text-sm text-slate-500">
						<template v-if="authMode === 'login'">
							Don't have an account?
							<button class="text-blue-400 hover:text-blue-300 font-medium" @click="authMode = 'register'; loginError = ''">Create one</button>
						</template>
						<template v-else>
							Already have an account?
							<button class="text-blue-400 hover:text-blue-300 font-medium" @click="authMode = 'login'; loginError = ''">Sign in</button>
						</template>
					</p>
				</div>
			</template>

			<!-- Joining in progress -->
			<template v-else-if="status === 'joining'">
				<p class="text-center text-slate-400">Joining match...</p>
			</template>

			<!-- Ready to join -->
			<template v-else>
				<p class="text-sm text-slate-400 text-center">
					Joining as <strong class="text-white">{{ playerName }}</strong>
				</p>

				<div class="space-y-2">
					<label class="block text-sm font-medium text-slate-400">Your color</label>
					<div class="flex flex-wrap gap-2 justify-center">
						<button
							v-for="c in availableColors"
							:key="c"
							type="button"
							class="w-10 h-10 rounded-full border-2 transition-all shrink-0"
							:class="[
								selectedColor === c ? 'border-white scale-110 ring-2 ring-white/50' : 'border-slate-600 hover:border-slate-500',
								PLAYER_COLOR_TW[c],
							]"
							:title="c"
							@click="selectedColor = c"
						/>
					</div>
				</div>

				<button
					class="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition-colors"
					@click="joinMatch"
				>
					Join Game
				</button>
			</template>

			<p v-if="errorMsg" class="text-sm text-red-400 text-center">{{ errorMsg }}</p>

			<div class="text-center">
				<router-link to="/" class="text-sm text-slate-500 hover:text-slate-300 transition-colors">
					&larr; Back to lobby
				</router-link>
			</div>
		</div>
	</div>
</template>
