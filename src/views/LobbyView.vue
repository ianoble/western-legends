<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { saveSession, loadSession, clearSession } from "@engine/client";
import { gameDef, PLAYER_COLORS, type PlayerColor } from "../logic/index";
import { SERVER_URL } from "../config";
import { useAuth, authHeaders, syncSessionToServer, deleteServerSession, fetchServerSessions } from "../composables/useAuth";

/** Tailwind background classes for {@link PLAYER_COLORS} (Western Legends). */
const PLAYER_COLOR_TW: Record<PlayerColor, string> = {
	red: "bg-red-600",
	blue: "bg-blue-600",
	green: "bg-green-600",
	yellow: "bg-yellow-500",
	black: "bg-zinc-900 ring-1 ring-zinc-500",
	orange: "bg-orange-600",
};

function playerColorDot(color: string | undefined): string {
	if (color && color in PLAYER_COLOR_TW) return PLAYER_COLOR_TW[color as PlayerColor];
	return "bg-slate-600";
}

const POLL_INTERVAL = 3000;

const router = useRouter();

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const { playerName, isLoggedIn, loginError, loading: authLoading, register, login, logout } = useAuth();
const authMode = ref<"login" | "register">("login");
const authName = ref("");
const authPin = ref("");

async function handleAuth() {
	const ok = authMode.value === "register"
		? await register(authName.value, authPin.value)
		: await login(authName.value, authPin.value);
	if (ok) {
		authName.value = "";
		authPin.value = "";
		await restoreServerSessions();
		await refreshData();
	}
}

function handleLogout() {
	logout();
	myGames.value = [];
	openGames.value = [];
}

async function restoreServerSessions() {
	const sessions = await fetchServerSessions();
	for (const s of sessions) {
		if (s.gameName !== gameDef.id) continue;
		const existing = loadSession(gameDef.id, s.matchID);
		if (!existing) {
			saveSession(gameDef.id, s.matchID, {
				playerID: s.playerSeatID,
				credentials: s.credentials,
				playerName: s.playerName,
			});
		}
	}
}

// ---------------------------------------------------------------------------
// Match types
// ---------------------------------------------------------------------------

interface MatchPlayer {
	id: number;
	name?: string;
	data?: { color?: string };
}

interface MatchInfo {
	matchID: string;
	players: MatchPlayer[];
	gameover: unknown;
	createdAt: number;
	updatedAt: number;
}

interface MyGameInfo extends MatchInfo {
	myPlayerID: string;
	myName: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type ViewMode = "browse" | "hosting";
const viewMode = ref<ViewMode>("browse");

const myGames = ref<MyGameInfo[]>([]);
const openGames = ref<MatchInfo[]>([]);
const loading = ref(true);
const errorMsg = ref("");

const showCreateForm = ref(false);
const numPlayers = ref(gameDef.minPlayers);
const creating = ref(false);
const selectedColor = ref<PlayerColor>("red");

function buildDefaultSetupData(): Record<string, unknown> {
	const data: Record<string, unknown> = {};
	for (const opt of gameDef.setupOptions ?? []) {
		data[opt.id] = opt.default;
	}
	data.hostFaction = "outlaw";
	data.manInBlack = gameDef.minPlayers === 2;
	return data;
}
const setupData = ref<Record<string, unknown>>(buildDefaultSetupData());

watch(numPlayers, (n, prev) => {
	if (n !== 2) {
		setupData.value.manInBlack = false;
	} else if (prev !== 2) {
		setupData.value.manInBlack = true;
	}
});

const hostedMatchID = ref<string | null>(null);
const hostedPlayers = ref<MatchPlayer[]>([]);
const linkCopied = ref(false);

const joinModalMatchID = ref<string | null>(null);
const joinModalColor = ref<PlayerColor>("red");
function openJoinModal(game: MatchInfo) {
	joinModalMatchID.value = game.matchID;
	const taken = new Set(
		game.players.map((p) => p.data?.color).filter(Boolean) as string[],
	);
	const available = PLAYER_COLORS.filter((c) => !taken.has(c));
	joinModalColor.value = (available[0] as PlayerColor) ?? "red";
}
function closeJoinModal() {
	joinModalMatchID.value = null;
}
const joinModalAvailableColors = computed(() => {
	if (!joinModalMatchID.value) return [];
	const game = openGames.value.find((g) => g.matchID === joinModalMatchID.value);
	const taken = new Set(
		(game?.players ?? []).map((p) => p.data?.color).filter(Boolean) as string[],
	);
	return PLAYER_COLORS.filter((c) => !taken.has(c));
});

let pollTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchMatchList(): Promise<MatchInfo[]> {
	const res = await fetch(`${SERVER_URL}/games/${gameDef.id}`);
	if (!res.ok) return [];
	const data = await res.json();
	return (data.matches ?? []) as MatchInfo[];
}

async function fetchMatch(matchID: string): Promise<MatchInfo | null> {
	const res = await fetch(`${SERVER_URL}/games/${gameDef.id}/${matchID}`);
	if (!res.ok) return null;
	const data = (await res.json()) as MatchInfo;
	data.matchID = matchID;
	return data;
}

function getStoredSessions(): { matchID: string; playerID: string; playerName: string }[] {
	const sessions: { matchID: string; playerID: string; playerName: string }[] = [];
	const prefix = `bgf:session:${gameDef.id}:`;
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key?.startsWith(prefix)) {
			const matchID = key.slice(prefix.length);
			const session = loadSession(gameDef.id, matchID);
			if (session) {
				sessions.push({
					matchID,
					playerID: session.playerID,
					playerName: session.playerName,
				});
			}
		}
	}
	return sessions;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function refreshData() {
	try {
		const allMatches = await fetchMatchList();
		const sessions = getStoredSessions();

		const myMatchIDs = new Set(sessions.map((s) => s.matchID));

		const myGamesList: MyGameInfo[] = [];
		for (const session of sessions) {
			const match = allMatches.find((m) => m.matchID === session.matchID);
			if (match) {
				myGamesList.push({
					...match,
					myPlayerID: session.playerID,
					myName: session.playerName,
				});
			}
		}
		myGames.value = myGamesList.sort((a, b) => b.updatedAt - a.updatedAt);

		openGames.value = allMatches
			.filter((m) => {
				if (myMatchIDs.has(m.matchID)) return false;
				if (m.gameover) return false;
				return m.players.some((p) => !p.name);
			})
			.sort((a, b) => b.createdAt - a.createdAt);
	} catch {
		errorMsg.value = "Could not connect to game server";
	} finally {
		loading.value = false;
	}
}

// ---------------------------------------------------------------------------
// Game creation
// ---------------------------------------------------------------------------

async function createMatch() {
	creating.value = true;
	errorMsg.value = "";

	try {
		const name = playerName.value.trim() || "Player";

		const createRes = await fetch(`${SERVER_URL}/games/${gameDef.id}/create`, {
			method: "POST",
			headers: { "Content-Type": "application/json", ...authHeaders() },
			body: JSON.stringify({
				numPlayers: numPlayers.value,
				setupData: setupData.value,
			}),
		});
		if (createRes.status === 403) throw new Error("Authentication required to create games");
		if (!createRes.ok) {
			const body = await createRes.text();
			let msg = "Server rejected match creation";
			try {
				const err = body ? JSON.parse(body) : null;
				if (err?.error) msg = err.error;
				else if (err?.message) msg = err.message;
			} catch {
				if (body) msg = body;
			}
			throw new Error(msg);
		}
		const { matchID } = (await createRes.json()) as { matchID: string };

		const joinRes = await fetch(`${SERVER_URL}/games/${gameDef.id}/${matchID}/join`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				playerID: "0",
				playerName: name,
				data: { color: selectedColor.value },
			}),
		});
		if (!joinRes.ok) throw new Error("Failed to claim host seat");
		const { playerCredentials } = (await joinRes.json()) as { playerCredentials: string };

		saveSession(gameDef.id, matchID, {
			playerID: "0",
			credentials: playerCredentials,
			playerName: name,
			playerColor: selectedColor.value,
		});
		await syncSessionToServer(gameDef.id, matchID, "0", playerCredentials, name);

		hostedMatchID.value = matchID;
		showCreateForm.value = false;
		setupData.value = buildDefaultSetupData();
		viewMode.value = "hosting";
		startHostPolling(matchID);
	} catch (e: unknown) {
		errorMsg.value = e instanceof Error ? e.message : "Failed to create match";
	} finally {
		creating.value = false;
	}
}

// ---------------------------------------------------------------------------
// Join an open game
// ---------------------------------------------------------------------------

async function joinGame(matchID: string, color?: PlayerColor) {
	errorMsg.value = "";
	closeJoinModal();

	try {
		const name = playerName.value.trim() || "Player";
		const colorToUse = color ?? joinModalColor.value;

		const match = await fetchMatch(matchID);
		if (!match) throw new Error("Match not found");

		const openSeat = match.players.find((p) => !p.name);
		if (!openSeat) throw new Error("No open seats");
		const seatID = String(openSeat.id);

		const joinRes = await fetch(`${SERVER_URL}/games/${gameDef.id}/${matchID}/join`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				playerID: seatID,
				playerName: name,
				data: { color: colorToUse },
			}),
		});
		if (!joinRes.ok) throw new Error("Failed to claim seat");
		const { playerCredentials } = (await joinRes.json()) as { playerCredentials: string };

		saveSession(gameDef.id, matchID, {
			playerID: seatID,
			credentials: playerCredentials,
			playerName: name,
			playerColor: colorToUse,
		});
		await syncSessionToServer(gameDef.id, matchID, seatID, playerCredentials, name);

		router.push(`/game/${matchID}/${seatID}`);
	} catch (e: unknown) {
		errorMsg.value = e instanceof Error ? e.message : "Failed to join game";
	}
}

// ---------------------------------------------------------------------------
// Abandon a game (only when not all seats are filled)
// ---------------------------------------------------------------------------

async function abandonGame(matchID: string) {
	errorMsg.value = "";
	const session = loadSession(gameDef.id, matchID);
	if (!session) return;

	try {
		const res = await fetch(`${SERVER_URL}/games/${gameDef.id}/${matchID}/leave`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				playerID: session.playerID,
				credentials: session.credentials,
			}),
		});
		if (!res.ok) throw new Error("Server rejected leave request");

		const botCredsKey = `bgf:bots:${gameDef.id}:${matchID}`;
		const botCreds = JSON.parse(localStorage.getItem(botCredsKey) || "{}");
		const botPlayerIDs = Object.keys(botCreds);
		if (botPlayerIDs.length > 0) {
			for (const botPid of botPlayerIDs) {
				try {
					await fetch(`${SERVER_URL}/games/${gameDef.id}/${matchID}/leave`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ playerID: botPid, credentials: botCreds[botPid] }),
					});
				} catch { /* best effort */ }
			}
			localStorage.removeItem(botCredsKey);
		}
	} catch {
		// Even if the server call fails, clean up locally
	}

	clearSession(gameDef.id, matchID);
	await deleteServerSession(gameDef.id, matchID);
	await refreshData();
}

async function abandonHostedGame() {
	if (!hostedMatchID.value) return;
	await abandonGame(hostedMatchID.value);
	backToBrowse();
}

// ---------------------------------------------------------------------------
// Hosting / waiting room
// ---------------------------------------------------------------------------

function startHostPolling(matchID: string) {
	stopPolling();
	pollHostedMatch(matchID);
	pollTimer = setInterval(() => pollHostedMatch(matchID), 2000);
}

async function pollHostedMatch(matchID: string) {
	const match = await fetchMatch(matchID);
	if (!match) return;
	hostedPlayers.value = match.players;
}

const allSeatsFilled = computed(() => hostedPlayers.value.length > 0 && hostedPlayers.value.every((p) => p.name));

const filledCount = computed(() => hostedPlayers.value.filter((p) => p.name).length);

const fillingBots = ref(false);

function saveBotCredentials(mID: string, playerID: string, credentials: string) {
	const key = `bgf:bots:${gameDef.id}:${mID}`;
	const existing = JSON.parse(localStorage.getItem(key) || "{}");
	existing[playerID] = credentials;
	localStorage.setItem(key, JSON.stringify(existing));
}

async function fillWithBots() {
	if (!hostedMatchID.value) return;
	fillingBots.value = true;
	errorMsg.value = "";

	try {
		const emptySeats = hostedPlayers.value.filter((p) => !p.name);
		for (let i = 0; i < emptySeats.length; i++) {
			const seatID = String(emptySeats[i].id);
			const botName = `Bot ${emptySeats[i].id}`;
			const res = await fetch(`${SERVER_URL}/games/${gameDef.id}/${hostedMatchID.value}/join`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ playerID: seatID, playerName: botName }),
			});
			if (!res.ok) throw new Error(`Failed to seat ${botName}`);
			const { playerCredentials } = (await res.json()) as { playerCredentials: string };
			saveBotCredentials(hostedMatchID.value, seatID, playerCredentials);
		}
		await pollHostedMatch(hostedMatchID.value);
	} catch (e: unknown) {
		errorMsg.value = e instanceof Error ? e.message : "Failed to fill bots";
	} finally {
		fillingBots.value = false;
	}
}

async function fillBotsForGame(matchID: string) {
	errorMsg.value = "";
	try {
		const match = await fetchMatch(matchID);
		if (!match) throw new Error("Match not found");

		const emptySeats = match.players.filter((p) => !p.name);
		for (const seat of emptySeats) {
			const seatID = String(seat.id);
			const res = await fetch(`${SERVER_URL}/games/${gameDef.id}/${matchID}/join`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ playerID: seatID, playerName: `Bot ${seatID}` }),
			});
			if (!res.ok) throw new Error(`Failed to seat Bot ${seatID}`);
			const { playerCredentials } = (await res.json()) as { playerCredentials: string };
			saveBotCredentials(matchID, seatID, playerCredentials);
		}
		await refreshData();
	} catch (e: unknown) {
		errorMsg.value = e instanceof Error ? e.message : "Failed to add bots";
	}
}

function inviteLink(): string {
	if (!hostedMatchID.value) return "";
	return `${window.location.origin}/join/${hostedMatchID.value}`;
}

async function copyLink() {
	try {
		await navigator.clipboard.writeText(inviteLink());
		linkCopied.value = true;
		setTimeout(() => {
			linkCopied.value = false;
		}, 2000);
	} catch {
		errorMsg.value = "Clipboard access denied";
	}
}

function startGame() {
	if (!hostedMatchID.value) return;
	stopPolling();
	router.push(`/game/${hostedMatchID.value}/0`);
}

function backToBrowse() {
	stopPolling();
	viewMode.value = "browse";
	hostedMatchID.value = null;
	hostedPlayers.value = [];
	refreshData();
}

// ---------------------------------------------------------------------------
// Computed helpers
// ---------------------------------------------------------------------------

function seatSummary(players: MatchPlayer[]): string {
	const filled = players.filter((p) => p.name).length;
	return `${filled}/${players.length}`;
}

function matchStatus(match: MatchInfo): "waiting" | "playing" | "finished" {
	if (match.gameover) return "finished";
	if (match.players.every((p) => p.name)) return "playing";
	return "waiting";
}

// ---------------------------------------------------------------------------
// Polling & lifecycle
// ---------------------------------------------------------------------------

function stopPolling() {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
}

function startBrowsePolling() {
	stopPolling();
	pollTimer = setInterval(refreshData, POLL_INTERVAL);
}

onMounted(async () => {
	if (isLoggedIn.value) {
		await restoreServerSessions();
	}
	await refreshData();
	startBrowsePolling();
});

onUnmounted(stopPolling);
</script>

<template>
	<div class="min-h-screen bg-slate-900 text-white">
		<!-- Header -->
		<header class="border-b border-slate-800">
			<div class="max-w-5xl mx-auto px-6 py-8">
				<div class="flex items-start justify-between">
					<div>
						<h1 class="text-4xl font-bold tracking-tight">{{ gameDef.displayName }}</h1>
						<p class="mt-2 text-slate-400">{{ gameDef.description }}</p>
					</div>
					<div class="flex items-center gap-3 shrink-0">
					<template v-if="isLoggedIn">
						<span class="text-sm text-slate-400">Signed in as <strong class="text-white">{{ playerName }}</strong></span>
						<button
							class="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-600 rounded-lg transition-colors"
							@click="handleLogout"
						>
							Sign Out
						</button>
					</template>
					</div>
				</div>
			</div>
		</header>

		<!-- Main content -->
		<main class="max-w-5xl mx-auto px-6 py-8">

			<!-- Auth gate -->
			<template v-if="!isLoggedIn">
				<div class="max-w-sm mx-auto mt-8 space-y-6">
					<div class="text-center">
						<h2 class="text-xl font-semibold">{{ authMode === 'login' ? 'Sign In' : 'Create Account' }}</h2>
						<p class="mt-1 text-sm text-slate-400">
							{{ authMode === 'login' ? 'Sign in to create and rejoin games from any device.' : 'Pick a name and a PIN to get started.' }}
						</p>
					</div>

					<div class="space-y-3">
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

			<!-- Logged-in content -->
			<template v-else>
			<!-- Error banner -->
			<div
				v-if="errorMsg"
				class="mb-6 p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-400 flex items-center justify-between"
			>
				<span>{{ errorMsg }}</span>
				<button class="text-red-400 hover:text-red-300 ml-4" @click="errorMsg = ''">Dismiss</button>
			</div>

			<!-- Loading -->
			<div v-if="loading" class="text-center py-16">
				<p class="text-slate-400">Connecting to server...</p>
			</div>

			<!-- BROWSE MODE -->
			<template v-else-if="viewMode === 'browse'">
				<!-- Create game button -->
				<div class="mb-8">
					<button
						v-if="!showCreateForm"
						class="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition-colors"
						@click="showCreateForm = true"
					>
						Create New Game
					</button>

					<!-- Create form (inline) -->
					<div v-else class="p-5 bg-slate-800 border border-slate-700 rounded-xl max-w-md space-y-4">
						<h3 class="font-semibold">New Game</h3>

						<div class="space-y-2">
							<label class="block text-sm text-slate-400">Number of Players</label>
							<div class="flex items-center gap-3">
								<button
									class="w-9 h-9 rounded-lg bg-slate-700 border border-slate-600 text-lg font-bold hover:bg-slate-600 transition-colors disabled:opacity-40"
									:disabled="numPlayers <= gameDef.minPlayers"
									@click="numPlayers--"
								>
									-
								</button>
								<span class="text-xl font-bold w-6 text-center">{{ numPlayers }}</span>
								<button
									class="w-9 h-9 rounded-lg bg-slate-700 border border-slate-600 text-lg font-bold hover:bg-slate-600 transition-colors disabled:opacity-40"
								:disabled="numPlayers >= gameDef.maxPlayers"
								@click="numPlayers++"
							>
								+
							</button>
							<span class="text-sm text-slate-500 ml-1">({{ gameDef.minPlayers }}&ndash;{{ gameDef.maxPlayers }})</span>
							</div>
						</div>

						<!-- Setup options (driven by gameDef.setupOptions) -->
						<template v-if="gameDef.setupOptions?.length">
							<div v-for="opt in gameDef.setupOptions" :key="opt.id" class="space-y-1">
								<label v-if="opt.type === 'boolean'" class="flex items-center gap-3 cursor-pointer select-none">
									<button
										type="button"
										role="switch"
										:aria-checked="!!setupData[opt.id]"
										class="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800"
										:class="setupData[opt.id] ? 'bg-blue-600' : 'bg-slate-600'"
										@click="setupData[opt.id] = !setupData[opt.id]"
									>
										<span
											class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform"
											:class="setupData[opt.id] ? 'translate-x-5' : 'translate-x-0'"
										/>
									</button>
									<span class="text-sm font-medium">{{ opt.label }}</span>
								</label>
								<p v-if="opt.description" class="text-xs text-slate-500 ml-14">{{ opt.description }}</p>
							</div>
						</template>

						<!-- 2P Man in Black variant -->
						<div v-if="numPlayers === 2" class="space-y-3 rounded-lg border border-slate-700/80 bg-slate-800/50 p-3">
							<label class="flex items-center gap-3 cursor-pointer select-none">
								<button
									type="button"
									role="switch"
									:aria-checked="!!setupData.manInBlack"
									class="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800"
									:class="setupData.manInBlack ? 'bg-blue-600' : 'bg-slate-600'"
									@click="setupData.manInBlack = !setupData.manInBlack"
								>
									<span
										class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform"
										:class="setupData.manInBlack ? 'translate-x-5' : 'translate-x-0'"
									/>
								</button>
								<span class="text-sm font-medium">Man in Black (2P variant)</span>
							</label>
							<p class="text-xs text-slate-500 ml-14">MIB acts after both players pass; special duel/rob and endgame rules.</p>
							<div v-if="setupData.manInBlack" class="space-y-1 ml-1">
								<label class="block text-xs text-slate-500">You play as</label>
								<div class="flex flex-wrap gap-2">
									<button
										type="button"
										class="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
										:class="
											setupData.hostFaction === 'outlaw'
												? 'bg-amber-900/50 border-amber-600 text-amber-100'
												: 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
										"
										@click="setupData.hostFaction = 'outlaw'"
									>
										Outlaw (Jesse James / Billy the Kid)
									</button>
									<button
										type="button"
										class="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
										:class="
											setupData.hostFaction === 'marshal'
												? 'bg-sky-900/50 border-sky-600 text-sky-100'
												: 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
										"
										@click="setupData.hostFaction = 'marshal'"
									>
										Marshal (Wyatt Earp / Bass Reeves)
									</button>
								</div>
								<p class="text-xs text-slate-500">Guest drafts the other faction.</p>
							</div>
						</div>

						<!-- Your color (when creating) -->
						<div class="space-y-2">
							<label class="block text-sm text-slate-400">Your color</label>
							<div class="flex flex-wrap gap-2">
								<button
									v-for="c in PLAYER_COLORS"
									:key="c"
									type="button"
									class="w-9 h-9 rounded-full border-2 transition-all shrink-0"
									:class="[
										selectedColor === c ? 'border-white scale-110 ring-2 ring-white/50' : 'border-slate-600 hover:border-slate-500',
										PLAYER_COLOR_TW[c],
									]"
									:title="c"
									@click="selectedColor = c"
								/>
							</div>
						</div>

						<div class="flex gap-2">
							<button
								class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
								:disabled="creating"
								@click="createMatch"
							>
								{{ creating ? "Creating..." : "Create" }}
							</button>
							<button
								class="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
								@click="showCreateForm = false"
							>
								Cancel
							</button>
						</div>
					</div>
				</div>

				<!-- Two-column layout -->
				<div class="grid md:grid-cols-2 gap-8">
					<!-- Your Games -->
					<section>
						<h2 class="text-lg font-semibold mb-4 text-slate-300">Your Games</h2>

						<div v-if="myGames.length === 0" class="p-6 bg-slate-800/50 border border-slate-700/50 rounded-xl text-center">
							<p class="text-slate-500 text-sm">No active games yet. Create or join one!</p>
						</div>

						<div v-else class="space-y-3">
							<div v-for="game in myGames" :key="game.matchID" class="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
								<div class="p-4">
									<div class="flex items-center gap-2 mb-1">
										<span
											class="inline-block w-2 h-2 rounded-full"
											:class="{
												'bg-yellow-400': matchStatus(game) === 'waiting',
												'bg-green-400': matchStatus(game) === 'playing',
												'bg-slate-500': matchStatus(game) === 'finished',
											}"
										/>
										<span class="text-sm font-medium capitalize">{{ matchStatus(game) }}</span>
										<span class="text-xs text-slate-500 ml-auto">{{ seatSummary(game.players) }} players</span>
									</div>
									<p class="text-xs text-slate-500 mt-1">
										{{
											game.players
												.filter((p) => p.name)
												.map((p) => p.name)
												.join(", ")
										}}
									</p>
								</div>
								<div class="flex border-t border-slate-700 divide-x divide-slate-700">
									<button
										class="flex-1 px-3 py-2 text-xs font-medium text-blue-400 hover:bg-slate-700/50 transition-colors"
										@click="router.push(`/game/${game.matchID}/${game.myPlayerID}`)"
									>
										Resume
									</button>
									<button
										v-if="matchStatus(game) === 'waiting' && game.myPlayerID === '0'"
										class="flex-1 px-3 py-2 text-xs font-medium text-slate-400 hover:bg-slate-700/50 transition-colors"
										@click="fillBotsForGame(game.matchID)"
									>
										Add Bots
									</button>
									<button
										v-if="game.myPlayerID === '0'"
										class="flex-1 px-3 py-2 text-xs font-medium text-red-400/70 hover:bg-red-900/20 hover:text-red-400 transition-colors"
										@click="abandonGame(game.matchID)"
									>
										Abandon
									</button>
								</div>
							</div>
						</div>
					</section>

					<!-- Open Games -->
					<section>
						<h2 class="text-lg font-semibold mb-4 text-slate-300">Open Games</h2>

						<div v-if="openGames.length === 0" class="p-6 bg-slate-800/50 border border-slate-700/50 rounded-xl text-center">
							<p class="text-slate-500 text-sm">No open games right now.</p>
						</div>

						<div v-else class="space-y-3">
							<div v-for="game in openGames" :key="game.matchID" class="p-4 bg-slate-800 border border-slate-700 rounded-xl">
								<div class="flex items-center justify-between">
									<div>
										<p class="text-sm font-medium">{{ seatSummary(game.players) }} players</p>
										<p class="text-xs text-slate-500 mt-0.5">
											{{
												game.players
													.filter((p) => p.name)
													.map((p) => p.name)
													.join(", ") || "No players yet"
											}}
										</p>
									</div>
								<button
									class="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-semibold transition-colors"
									@click="openJoinModal(game)"
								>
									Join
								</button>
								</div>
							</div>
						</div>
					</section>
				</div>
			</template>

			<!-- HOSTING MODE (waiting room) -->
			<template v-else-if="viewMode === 'hosting'">
				<button class="mb-6 text-sm text-slate-500 hover:text-slate-300 transition-colors" @click="backToBrowse">&larr; Back to lobby</button>

				<div class="max-w-md mx-auto space-y-6">
					<div class="p-5 bg-slate-800 border border-slate-700 rounded-xl space-y-4">
						<div class="flex items-center gap-2">
							<span class="inline-block w-2 h-2 rounded-full bg-green-400" />
							<h3 class="font-semibold">Game Created</h3>
						</div>

						<div class="space-y-1">
							<label class="block text-xs text-slate-500">Invite Link</label>
							<div class="flex gap-2">
								<code class="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-blue-400 truncate">
									{{ inviteLink() }}
								</code>
								<button
									class="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors shrink-0"
									@click="copyLink"
								>
									{{ linkCopied ? "Copied!" : "Copy" }}
								</button>
							</div>
						</div>
					</div>

					<div class="p-5 bg-slate-800 border border-slate-700 rounded-xl space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium text-slate-400">Players</span>
							<span class="text-sm text-slate-500">{{ filledCount }} / {{ hostedPlayers.length }}</span>
						</div>
						<ul class="space-y-2">
							<li v-for="p in hostedPlayers" :key="p.id" class="flex items-center gap-3 px-3 py-2.5 bg-slate-900 rounded-lg">
								<span
									class="w-2 h-2 rounded-full shrink-0"
									:class="!p.name ? 'bg-slate-600' : playerColorDot(p.data?.color)"
								/>
								<span class="text-sm" :class="p.name ? 'text-white' : 'text-slate-600'">
									{{ p.name || "Waiting..." }}
								</span>
								<span v-if="p.id === 0" class="ml-auto text-xs text-slate-500">Host</span>
							</li>
						</ul>
					</div>

					<button
						class="w-full py-3 bg-green-600 hover:bg-green-500 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						:disabled="!allSeatsFilled"
						@click="startGame"
					>
						{{ allSeatsFilled ? "Start Game" : `Waiting for players (${filledCount}/${hostedPlayers.length})...` }}
					</button>

					<div v-if="!allSeatsFilled" class="flex gap-2">
						<button
							class="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-slate-400 hover:text-white font-medium transition-colors disabled:opacity-50"
							:disabled="fillingBots"
							@click="fillWithBots"
						>
							{{ fillingBots ? "Adding..." : "Fill with Bots" }}
						</button>
						<button
							class="flex-1 py-2.5 bg-slate-800 hover:bg-red-900/40 border border-slate-700 hover:border-red-800 rounded-lg text-sm text-slate-400 hover:text-red-400 font-medium transition-colors"
							@click="abandonHostedGame"
						>
							Abandon Game
						</button>
					</div>
				</div>
			</template>
			</template>
		</main>

		<!-- Join game: pick color -->
		<Teleport to="body">
			<div
				v-if="joinModalMatchID"
				class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
				@click.self="closeJoinModal"
			>
				<div class="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl max-w-sm w-full space-y-4">
					<h3 class="text-lg font-semibold text-white">Pick your color</h3>
					<div class="flex flex-wrap gap-2">
						<button
							v-for="c in joinModalAvailableColors"
							:key="c"
							type="button"
							class="w-10 h-10 rounded-full border-2 transition-all shrink-0"
							:class="[
								joinModalColor === c ? 'border-white scale-110 ring-2 ring-white/50' : 'border-slate-600 hover:border-slate-500',
								PLAYER_COLOR_TW[c],
							]"
							:title="c"
							@click="joinModalColor = c"
						/>
					</div>
					<div class="flex gap-2 pt-2">
						<button
							class="flex-1 py-2.5 bg-green-600 hover:bg-green-500 rounded-lg font-medium text-white transition-colors"
							@click="joinModalMatchID && joinGame(joinModalMatchID, joinModalColor)"
						>
							Join game
						</button>
						<button
							class="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium text-slate-300 transition-colors"
							@click="closeJoinModal"
						>
							Cancel
						</button>
					</div>
				</div>
			</div>
		</Teleport>
	</div>
</template>
