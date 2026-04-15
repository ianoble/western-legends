<script setup lang="ts">
import { computed, onMounted, onUnmounted, toRef } from 'vue';
import { useGame, useTurnNotifications, loadSession, GameLog } from '@engine/client';
import { gameDef } from '../logic/index';
import { SERVER_URL } from '../config';
import type { WesternLegendsState } from '../logic/types';
import { uiGamePhase } from '../logic/phaseUi';
import GameBoard from '../components/GameBoard.vue';
import BoardMap from '../components/BoardMap.vue';
import { BOARD_IMAGE_PATH } from '../map/locationMarkers';
import { useBotPlayers } from '../composables/useBotPlayers';

const props = defineProps<{ matchID: string; playerID: string }>();

useBotPlayers(toRef(props, 'matchID'), toRef(props, 'playerID'));

const game = useGame<WesternLegendsState>();
const {
	isConnected,
	isMyTurn,
	gameover,
	reconnecting,
	connect,
	disconnect,
	state,
	playerID: clientPlayerId,
	ctx,
} = game;

const G = computed(() => state.value);

/** Draft vs play for UI (uses `G` when `ctx.phase` is missing on the client). */
const gamePhase = computed(() => uiGamePhase(G.value as WesternLegendsState, ctx.value?.phase));

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

/**
 * Match has started (setup ran) and not ended.
 * boardgame.io’s `isActive` means *this seat* may move right now — it goes false when it’s someone else’s turn,
 * so we must not use it for “lobby vs in-game” UI.
 */
const matchRunning = computed(() => gameLoaded.value && gameover.value == null);

const needsTurnIncomeChoice = computed(() => {
	const pid = clientPlayerId.value;
	const g = G.value;
	if (pid == null || !g?.players?.[pid]) return false;
	return g.players[pid].needsStartTurnIncomeChoice === true;
});

const needsTurnLoadoutChoice = computed(() => {
	const pid = clientPlayerId.value;
	const g = G.value;
	if (pid == null || !g?.players?.[pid]) return false;
	return g.players[pid].needsTurnWeaponMountChoice === true;
});

const statusMessage = computed(() => {
	if (reconnecting.value && !isConnected.value) {
		return 'Restoring your saved session — waiting for the game server. If this lasts more than a few seconds, start the boardgame.io server or check VITE_SERVER_URL matches its URL.';
	}
	if (reconnecting.value) return 'Finishing session restore with the server…';
	if (!isConnected.value) return 'Connecting to the game server…';
	if (!gameLoaded.value) return 'Receiving game state from the server…';
	if (!matchRunning.value) {
		return 'This match has ended, or state is still updating.';
	}
	if (gamePhase.value !== 'play') {
		return isMyTurn.value
			? 'Choose your character in the panel. The map unlocks after everyone has picked.'
			: 'Character selection — wait for your turn to choose, or for others to finish.';
	}
	if (isMyTurn.value && needsTurnIncomeChoice.value) {
		return 'Your turn — choose turn income in the side panel (+$20, two cards, or $10 and one card), then you can move and act.';
	}
	if (isMyTurn.value && needsTurnLoadoutChoice.value) {
		return 'Your turn — choose weapon and mount for this turn in the side panel (skipped if you only have one or none).';
	}
	if (isMyTurn.value) return 'Your turn — use the map or the side panel.';
	return 'Waiting for another player`s turn.';
});

/** Full map + moves only after the character draft phase. */
const showInteractiveMap = computed(
	() => isConnected.value && matchRunning.value && gamePhase.value === 'play',
);

/**
 * Match running but map not unlocked yet (character draft, or phase not synced).
 * Anything other than explicit `play` keeps the interactive map hidden.
 */
const showCharacterSetupBoard = computed(
	() => isConnected.value && matchRunning.value && gamePhase.value !== 'play',
);

/** Connected, waiting for first full `G` (e.g. lobby seat before host starts). */
const showBoardPreview = computed(() => isConnected.value && !gameLoaded.value);

/** Plain object for template / TS (avoids Ref in v-if / prop slots). */
const gameOver = computed(() => gameover.value);

const boardPanel = computed(() => ({
	connectionOk: isConnected.value,
	reconnecting: reconnecting.value,
	gameLoaded: gameLoaded.value,
	matchRunning: matchRunning.value,
}));

const showTurnNotifyRow = computed(
	() =>
		notificationsSupported.value &&
		isConnected.value &&
		matchRunning.value &&
		gamePhase.value === 'play',
);

const turnNotifyNeedsOptIn = computed(() => notificationPermission.value !== 'granted');

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
	<div class="relative min-h-screen bg-[#0f0c09] text-slate-100">
		<div class="mx-auto flex w-full max-w-[1920px] flex-col gap-4 px-2 py-3 sm:px-4 md:flex-row md:items-start md:gap-5 lg:gap-6 lg:px-6">
			<!-- Board column: grows to fill width; side panel stays narrow on md+ -->
			<aside class="order-2 w-full min-w-0 md:order-1 md:flex-1 md:pt-0">
				<BoardMap v-if="showInteractiveMap" />

				<div
					v-else-if="showCharacterSetupBoard"
					class="relative overflow-hidden rounded-xl border border-amber-900/40 bg-slate-950 shadow-lg ring-1 ring-amber-900/20"
				>
					<img
						:src="BOARD_IMAGE_PATH"
						alt=""
						class="block max-h-[min(92vh,1400px)] w-full object-contain opacity-35"
						loading="lazy"
					/>
					<div class="absolute inset-0 flex items-center justify-center bg-slate-950/55 px-4 text-center">
						<p
							class="max-w-md rounded-lg border border-amber-800/50 bg-slate-950/92 px-4 py-3 text-sm text-amber-100/95 shadow-lg backdrop-blur-sm"
						>
							<strong class="font-semibold text-amber-50">Character selection</strong>
							<span class="mt-1 block text-amber-200/80"
								>Pick one of two characters in the side panel. The board unlocks when every player has chosen.</span
							>
						</p>
					</div>
				</div>

				<div v-else-if="showBoardPreview" class="relative overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950 shadow-lg">
					<img :src="BOARD_IMAGE_PATH" alt="" class="block w-full object-contain opacity-45 max-h-[min(70vh,900px)]" loading="lazy" />
					<div class="absolute inset-0 flex items-center justify-center bg-slate-950/35 px-4 text-center text-sm text-slate-300">
						<p class="rounded-lg border border-slate-600/60 bg-slate-950/80 px-3 py-2 backdrop-blur-sm">
							Table preview — markers and piles unlock when the match starts.
						</p>
					</div>
				</div>

				<div
					v-else
					class="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-700/80 bg-slate-950/50 px-4 text-center text-sm text-slate-500"
				>
					Connect and load your seat to see the board.
				</div>
			</aside>

			<!-- Main panel -->
			<div
				class="order-1 flex w-full min-w-0 flex-col rounded-xl border border-slate-800/60 bg-slate-950/75 p-3 shadow-xl shadow-black/20 backdrop-blur-md md:order-2 md:w-[min(100%,20rem)] md:max-w-[22rem] md:shrink-0 lg:w-[min(100%,24rem)] lg:max-w-sm"
			>
				<header
					class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-900/60 px-3 py-3"
				>
					<h1 class="text-lg font-semibold">{{ gameDef.displayName }}</h1>
					<span
						class="rounded-full px-2 py-0.5 text-xs"
						:class="
							!isConnected
								? reconnecting
									? 'bg-sky-900/50 text-sky-200'
									: 'bg-slate-800 text-slate-400'
								: !gameLoaded
									? 'bg-slate-800 text-slate-400'
									: !matchRunning
										? 'bg-slate-700 text-slate-300'
										: gamePhase === 'play'
											? 'bg-emerald-900/60 text-emerald-200'
											: 'bg-amber-900/50 text-amber-200'
						"
					>
						{{
							!isConnected
								? reconnecting
									? 'Restoring session…'
									: 'Connecting…'
								: !gameLoaded
									? 'Syncing…'
									: !matchRunning
										? 'Ended'
										: gamePhase === 'play'
											? 'Playing'
											: 'Draft'
						}}
					</span>
				</header>

				<p class="mb-2 rounded-lg border border-slate-800/80 bg-slate-900/50 px-3 py-2 text-center text-sm text-slate-200" role="status">
					{{ statusMessage }}
				</p>

				<div v-if="showTurnNotifyRow" class="mb-2 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-slate-400">
					<template v-if="turnNotifyNeedsOptIn">
						<button
							type="button"
							class="rounded-lg border border-slate-600 bg-slate-900/90 px-3 py-1.5 text-slate-200 hover:bg-slate-800"
							@click="onEnableTurnNotifications"
						>
							Notify me when it's my turn
						</button>
						<span class="text-slate-500">(works when this tab is in the background)</span>
					</template>
				</div>

				<p v-if="isConnected && matchRunning" class="mb-2 text-center text-xs text-slate-400">
					Match <code class="rounded bg-slate-900 px-1 py-0.5 text-slate-300">{{ matchID }}</code> · You are seat
					<code class="rounded bg-slate-900 px-1 py-0.5 text-slate-300">{{ playerID }}</code>
				</p>

				<GameBoard
					:connection-ok="boardPanel.connectionOk"
					:reconnecting="boardPanel.reconnecting"
					:game-loaded="boardPanel.gameLoaded"
					:match-running="boardPanel.matchRunning"
				/>

				<div v-if="gameOver" class="mt-4 rounded-lg border border-amber-800/50 bg-slate-900/90 p-4 text-center text-sm">
					<template v-if="gameOver.winner !== undefined">
						<span v-if="gameOver.winner === playerID" class="text-emerald-400">You win!</span>
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

				<div class="mt-4 min-h-0">
					<GameLog />
				</div>
			</div>
		</div>
	</div>
</template>
