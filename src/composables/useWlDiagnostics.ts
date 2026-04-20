import { computed, onUnmounted, ref, watch } from 'vue';
import { useGameStore } from '@engine/client';
import type { WesternLegendsState } from '../logic/types';
import { formatBugReportMarkdown, summarizeWesternLegendsForBugReport } from '../utils/wlBugReport';

const VERBOSE_KEY = 'wlDiagnostics.verboseMoves';

export function isWlMoveVerboseEnabled(): boolean {
	try {
		return localStorage.getItem(VERBOSE_KEY) === '1';
	} catch {
		return false;
	}
}

export function setWlMoveVerboseEnabled(on: boolean): void {
	try {
		if (on) localStorage.setItem(VERBOSE_KEY, '1');
		else localStorage.removeItem(VERBOSE_KEY);
	} catch {
		/* ignore */
	}
}

/**
 * Testing helpers: optional console logging of each new {@link WesternLegendsState.history} entry,
 * and “copy bug report” for structured issue filing.
 */
export function useWlDiagnostics() {
	const store = useGameStore();
	const verboseMoves = ref(isWlMoveVerboseEnabled());
	const copyStatus = ref<'idle' | 'ok' | 'err'>('idle');

	let stopHistoryWatch: (() => void) | null = null;

	function attachHistoryConsoleWatch() {
		stopHistoryWatch?.();
		let prevLen = (store.G as WesternLegendsState | undefined)?.history?.length ?? 0;
		stopHistoryWatch = watch(
			() => (store.G as WesternLegendsState | undefined)?.history?.length ?? 0,
			(len) => {
				if (!verboseMoves.value) {
					prevLen = len;
					return;
				}
				if (len <= prevLen) {
					prevLen = len;
					return;
				}
				const G = store.G as WesternLegendsState;
				const last = G.history[len - 1];
				if (last) {
					console.info('[WL move]', `#${last.seq}`, last.timestamp, `P${last.playerID}`, last.moveName, last.args);
				}
				prevLen = len;
			},
			{ flush: 'post' },
		);
	}

	watch(
		verboseMoves,
		(v) => {
			setWlMoveVerboseEnabled(v);
			if (v) attachHistoryConsoleWatch();
			else {
				stopHistoryWatch?.();
				stopHistoryWatch = null;
			}
		},
		{ immediate: true },
	);

	onUnmounted(() => {
		stopHistoryWatch?.();
	});

	const canCopy = computed(() => {
		const G = store.G as WesternLegendsState | undefined;
		return G != null && typeof G.legendGoal === 'number';
	});

	async function copyBugReport(): Promise<void> {
		copyStatus.value = 'idle';
		const G = store.G as WesternLegendsState | undefined;
		if (!G) {
			copyStatus.value = 'err';
			return;
		}
		const md = formatBugReportMarkdown({
			generatedAt: new Date().toISOString(),
			pageUrl: typeof window !== 'undefined' ? window.location.href : '',
			gameId: store.gameId,
			matchID: store.matchID,
			playerID: store.playerID,
			userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
			ctx: { ...store.ctx },
			summary: summarizeWesternLegendsForBugReport(G, store.playerID),
		});
		try {
			await navigator.clipboard.writeText(md);
			copyStatus.value = 'ok';
		} catch {
			copyStatus.value = 'err';
		}
		setTimeout(() => {
			if (copyStatus.value !== 'idle') copyStatus.value = 'idle';
		}, 2500);
	}

	if (import.meta.env.DEV && typeof window !== 'undefined') {
		const w = window as unknown as { __wlCopyBugReport?: () => Promise<void> };
		w.__wlCopyBugReport = () => copyBugReport();
	}

	return {
		verboseMoves,
		copyStatus,
		canCopy,
		copyBugReport,
	};
}
