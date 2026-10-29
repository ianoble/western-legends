import { computed, onUnmounted, ref, toValue, watch } from 'vue';
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

	async function copyTextToClipboard(text: string): Promise<boolean> {
		if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(text);
				return true;
			} catch {
				/* fall through to legacy path (HTTP, permissions) */
			}
		}
		try {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.setAttribute('readonly', '');
			ta.style.position = 'fixed';
			ta.style.left = '-9999px';
			ta.style.top = '0';
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			const ok = document.execCommand('copy');
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
	}

	async function copyBugReport(): Promise<void> {
		copyStatus.value = 'idle';
		try {
			const G = store.G as WesternLegendsState | undefined;
			if (!G) {
				copyStatus.value = 'err';
				return;
			}
			const ctxRaw = toValue(store.ctx) as Record<string, unknown> | undefined;
			const md = formatBugReportMarkdown({
				generatedAt: new Date().toISOString(),
				pageUrl: typeof window !== 'undefined' ? window.location.href : '',
				gameId: store.gameId,
				matchID: store.matchID,
				playerID: store.playerID,
				userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
				ctx: ctxRaw != null && typeof ctxRaw === 'object' ? { ...ctxRaw } : {},
				summary: summarizeWesternLegendsForBugReport(G, store.playerID),
			});
			const ok = await copyTextToClipboard(md);
			copyStatus.value = ok ? 'ok' : 'err';
			if (!ok) {
				console.error(
					'[WL] copyBugReport: clipboard unavailable (try HTTPS/localhost, or paste from console: await __wlCopyBugReport())',
				);
			}
		} catch (e) {
			console.error('[WL] copyBugReport failed', e);
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
