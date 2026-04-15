import { ref, computed } from 'vue';
import { SERVER_URL } from '../config';

const playerToken = ref<string | null>(localStorage.getItem('bgf:playerToken'));
const playerName = ref<string>(localStorage.getItem('bgf:playerName') ?? '');

export const isLoggedIn = computed(() => !!playerToken.value);
export const isDevSession = computed(() => playerToken.value?.startsWith('dev:') ?? false);

export function authHeaders(): Record<string, string> {
	if (!playerToken.value) return {};
	return { Authorization: `Bearer ${playerToken.value}` };
}

export function useAuth() {
	const loginError = ref('');
	const loading = ref(false);

	function setLocalDevSession(name: string) {
		const devToken = `dev:${name}`;
		playerToken.value = devToken;
		playerName.value = name;
		localStorage.setItem('bgf:playerToken', devToken);
		localStorage.setItem('bgf:playerName', name);
	}

	async function register(name: string, pin: string) {
		loginError.value = '';
		loading.value = true;
		try {
			const res = await fetch(`${SERVER_URL}/auth/register`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, pin }),
			});
			if (res.status === 501) {
				setLocalDevSession(name);
				return true;
			}
			if (res.status === 409) {
				loginError.value = 'That name is already taken';
				return false;
			}
			if (!res.ok) {
				loginError.value = 'Registration failed';
				return false;
			}
			const data = await res.json();
			playerToken.value = data.playerToken;
			playerName.value = data.playerName;
			localStorage.setItem('bgf:playerToken', data.playerToken);
			localStorage.setItem('bgf:playerName', data.playerName);
			return true;
		} catch {
			loginError.value = 'Could not connect to server';
			return false;
		} finally {
			loading.value = false;
		}
	}

	async function login(name: string, pin: string) {
		loginError.value = '';
		loading.value = true;
		try {
			const res = await fetch(`${SERVER_URL}/auth/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, pin }),
			});
			if (res.status === 501) {
				setLocalDevSession(name);
				return true;
			}
			if (res.status === 401) {
				loginError.value = 'Invalid name or PIN';
				return false;
			}
			if (!res.ok) {
				loginError.value = 'Login failed';
				return false;
			}
			const data = await res.json();
			playerToken.value = data.playerToken;
			playerName.value = data.playerName;
			localStorage.setItem('bgf:playerToken', data.playerToken);
			localStorage.setItem('bgf:playerName', data.playerName);
			return true;
		} catch {
			loginError.value = 'Could not connect to server';
			return false;
		} finally {
			loading.value = false;
		}
	}

	function logout() {
		playerToken.value = null;
		playerName.value = '';
		localStorage.removeItem('bgf:playerToken');
		localStorage.removeItem('bgf:playerName');
	}

	return {
		playerToken,
		playerName,
		isLoggedIn,
		loginError,
		loading,
		register,
		login,
		logout,
	};
}

export interface ServerSession {
	gameName: string;
	matchID: string;
	playerSeatID: string;
	credentials: string;
	playerName: string;
}

export async function fetchServerSessions(): Promise<ServerSession[]> {
	if (!playerToken.value || isDevSession.value) return [];
	try {
		const res = await fetch(`${SERVER_URL}/auth/sessions`, {
			headers: authHeaders(),
		});
		if (!res.ok) return [];
		const data = await res.json();
		return data.sessions ?? [];
	} catch {
		return [];
	}
}

export async function syncSessionToServer(
	gameName: string,
	matchID: string,
	playerSeatID: string,
	credentials: string,
	pName: string,
) {
	if (!playerToken.value || isDevSession.value) return;
	try {
		await fetch(`${SERVER_URL}/auth/sessions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeaders() },
			body: JSON.stringify({ gameName, matchID, playerSeatID, credentials, playerName: pName }),
		});
	} catch { /* best effort */ }
}

export async function deleteServerSession(gameName: string, matchID: string) {
	if (!playerToken.value || isDevSession.value) return;
	try {
		await fetch(`${SERVER_URL}/auth/sessions/${gameName}/${matchID}`, {
			method: 'DELETE',
			headers: authHeaders(),
		});
	} catch { /* best effort */ }
}

// ---------------------------------------------------------------------------
// Abandon voting
// ---------------------------------------------------------------------------

export interface AbandonVoteStatus {
	voters: string[];
	totalHumans: number;
	allAgreed: boolean;
}

export async function voteToAbandon(gameName: string, matchID: string): Promise<AbandonVoteStatus | null> {
	if (!playerToken.value || isDevSession.value) return null;
	try {
		const res = await fetch(`${SERVER_URL}/auth/vote-abandon`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeaders() },
			body: JSON.stringify({ gameName, matchID }),
		});
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

export async function cancelAbandonVote(gameName: string, matchID: string): Promise<void> {
	if (!playerToken.value || isDevSession.value) return;
	try {
		await fetch(`${SERVER_URL}/auth/vote-abandon/${gameName}/${matchID}`, {
			method: 'DELETE',
			headers: authHeaders(),
		});
	} catch { /* best effort */ }
}

export async function getAbandonVoteStatus(gameName: string, matchID: string): Promise<AbandonVoteStatus | null> {
	if (!playerToken.value || isDevSession.value) return null;
	try {
		const res = await fetch(`${SERVER_URL}/auth/vote-abandon/${gameName}/${matchID}`, {
			headers: authHeaders(),
		});
		if (!res.ok) return null;
		const data = await res.json();
		if (!data.voters || data.voters.length === 0) return null;
		return data;
	} catch {
		return null;
	}
}
