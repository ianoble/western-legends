<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useGame, useToast } from '@engine/client';
import {
	maxDiscreteTurnSlotsForPlayer,
	type BoardNpc,
	type PlayerColor,
	type StoryInPlayEntry,
	type WesternLegendsPlayer,
	type WesternLegendsState,
} from '../logic/types';
import { movementPointsForEquippedMount } from '../logic/movementCap';
import { uiGamePhase } from '../logic/phaseUi';
import { getStoryCardBackImageUrl, STORY_BACK_IMAGE_PATHS } from '../data/storyCards';
import {
	BOARD_IMAGE_PATH,
	STORY_DISC_SPOTS_LEFT,
	STORY_DISC_SPOTS_RIGHT,
	STORY_PILE_LEFT_ZONE,
	STORY_PILE_RIGHT_ZONE,
} from '../map/locationMarkers';
import { LEGEND_TRACK_CENTERS, MARSHAL_TRACK_CENTERS, WANTED_TRACK_CENTERS, trackSlotIndex } from '../map/boardTracks';
import { DEFAULT_MOVEMENT_POINTS, getReachableSpaceIds, polygonCentroid } from '../map/boardGraph';
import { BOARD_SPACES, BOARD_SPACES_BY_ID, BOARD_VIEWBOX_SIZE, SADDLE_UP_TOWN_SPACE_ID_SET } from '../map/boardSpaces';
import { clearSaddleUpPick, useSaddleUpMapPick } from '../composables/useSaddleUpMapPick';
import { IconMask, IconMeeple, IconUserShield } from '@tabler/icons-vue';

/** NPC map tokens — high contrast on the board scan. */
const NPC_SHERIFF_ICON_FILL = '#0a0a0a';
const NPC_BANDIT_ICON_FILL = '#64748b';

const auditMap = ref(false);

const TRACK_DISK_FILL: Record<PlayerColor, string> = {
	red: '#dc2626',
	blue: '#60a5fa',
	green: '#4ade80',
	yellow: '#facc15',
	black: '#d4d4d8',
	orange: '#fb923c',
};

function hexWithAlpha(hex: string, alpha: number): string {
	const m = hex.replace('#', '');
	const r = Number.parseInt(m.slice(0, 2), 16);
	const g = Number.parseInt(m.slice(2, 4), 16);
	const b = Number.parseInt(m.slice(4, 6), 16);
	return `rgba(${r},${g},${b},${alpha})`;
}

const { state, playerID, isMyTurn, move, ctx } = useGame<WesternLegendsState>();
const { showToast } = useToast();
const { saddleUpPickActive, saddleUpPickCardId, pokerBSlotCtxOk: mapPokerBSlotOk } = useSaddleUpMapPick();

const G = computed(() => state.value);
const me = computed(() => {
	const pid = playerID.value;
	if (!pid) return undefined;
	return G.value.players?.[pid];
});

const gamePhase = computed(() => uiGamePhase(G.value as WesternLegendsState, ctx.value?.phase));
const mapPlayActive = computed(
	() =>
		gamePhase.value === 'play' &&
		me.value != null &&
		me.value.characterId != null &&
		me.value.needsStartTurnIncomeChoice !== true &&
		me.value.needsTurnWeaponMountChoice !== true,
);

const imgRef = ref<HTMLImageElement | null>(null);
/** Pixel box where the bitmap is painted inside the img (object-contain letterboxing). */
const contentRect = ref({ left: 0, top: 0, width: 0, height: 0, ready: false });

function updateBoardOverlay() {
	const el = imgRef.value;
	if (!el?.naturalWidth || !el.naturalHeight) return;
	const cw = el.clientWidth;
	const ch = el.clientHeight;
	if (cw <= 0 || ch <= 0) return;
	const nw = el.naturalWidth;
	const nh = el.naturalHeight;
	const scale = Math.min(cw / nw, ch / nh);
	const rw = nw * scale;
	const rh = nh * scale;
	contentRect.value = {
		left: (cw - rw) / 2,
		top: (ch - rh) / 2,
		width: rw,
		height: rh,
		ready: true,
	};
}

let overlayResizeObserver: ResizeObserver | null = null;

onMounted(() => {
	const search = new URLSearchParams(window.location.search);
	const urlFlag =
		search.get('auditMap') ??
		search.get('auditmap') ??
		(() => {
			for (const [k, v] of search.entries()) {
				if (k.toLowerCase() === 'auditmap') return v;
			}
			return null;
		})();
	auditMap.value = import.meta.env.VITE_AUDIT_MAP === 'true' || urlFlag === '1' || urlFlag === 'true' || urlFlag === 'yes' || urlFlag === 'on';

	const el = imgRef.value;
	if (!el) return;
	overlayResizeObserver = new ResizeObserver(() => updateBoardOverlay());
	overlayResizeObserver.observe(el);
	if (el.complete) updateBoardOverlay();
});

onBeforeUnmount(() => {
	overlayResizeObserver?.disconnect();
	overlayResizeObserver = null;
});

const viewBoxAttr = `0 0 ${BOARD_VIEWBOX_SIZE} ${BOARD_VIEWBOX_SIZE}`;

const svgOverlayStyle = computed(() => {
	const r = contentRect.value;
	if (!r.ready) return { visibility: 'hidden' as const };
	return {
		left: `${r.left}px`,
		top: `${r.top}px`,
		width: `${r.width}px`,
		height: `${r.height}px`,
		visibility: 'visible' as const,
	};
});

const movementBudget = computed(() => {
	if (!me.value) return 0;
	const mp = me.value.movementPointsLeft;
	const base = Number.isFinite(mp) && mp >= 0 ? mp : DEFAULT_MOVEMENT_POINTS;
	const slotsLeft = (me.value.turnActions?.length ?? 0) < maxDiscreteTurnSlotsForPlayer(me.value);
	if (
		base === 0 &&
		isMyTurn.value &&
		mapPlayActive.value &&
		slotsLeft
	) {
		return movementPointsForEquippedMount(me.value);
	}
	return base;
});

const reachable = computed(() => {
	if (!me.value) return new Set<string>();
	return getReachableSpaceIds(BOARD_SPACES_BY_ID, me.value.locationId, movementBudget.value);
});

/** Reachable hexes you can move into — excludes your current space (no ring / click on the meeple). */
function standingOnSpace(spaceId: string): boolean {
	return String(me.value?.locationId ?? '') === String(spaceId);
}

const reachableMoveTargets = computed(() => {
	const r = reachable.value;
	const here = me.value?.locationId;
	if (here == null || here === '') return r;
	const hereKey = String(here);
	return new Set([...r].filter((id) => String(id) !== hereKey));
});

/** Saddle Up: armed from sidebar — pick a city hex; invalid clicks toast. */
const inSaddleMapPickMode = computed(
	() =>
		saddleUpPickActive.value &&
		mapPlayActive.value &&
		isMyTurn.value &&
		mapPokerBSlotOk.value,
);

function isSaddleTownHighlight(id: string): boolean {
	return inSaddleMapPickMode.value && SADDLE_UP_TOWN_SPACE_ID_SET.has(id);
}

// Pre-computed centroids so we don't call polygonCentroid in every render.
const spaceCentroids = computed(() => Object.fromEntries(BOARD_SPACES.map((s) => [s.id, polygonCentroid(s.polygon)])));

type AuditCollision = { keepId: string; otherId: string; keepAt: [number, number]; otherAt: [number, number]; dist: number };

const auditBanditCollisions = computed((): AuditCollision[] => {
	if (!auditMap.value) return [];
	const centroids = spaceCentroids.value as Record<string, [number, number]>;
	const spaces = BOARD_SPACES;

	const isBandit = (id: string) => id.startsWith('bh-a-') || id.startsWith('bh-b-') || id.startsWith('bh-c-');
	const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

	// In viewBox units (0-100). This is intentionally small: “on or very close”.
	const EPS = 0.9;

	const out: AuditCollision[] = [];
	for (const s of spaces) {
		if (!isBandit(s.id)) continue;
		const a = centroids[s.id];
		if (!a) continue;
		for (const t of spaces) {
			if (t.id === s.id) continue;
			if (isBandit(t.id)) continue; // never suggest removing the bandit nodes
			const b = centroids[t.id];
			if (!b) continue;
			const d = dist(a, b);
			if (d <= EPS) out.push({ keepId: s.id, otherId: t.id, keepAt: a, otherAt: b, dist: d });
		}
	}

	return out.sort((x, y) => x.dist - y.dist || x.otherId.localeCompare(y.otherId));
});

onMounted(() => {
	// If audit is on, print likely collisions near bandit hideouts for easy copy/paste.
	if (auditMap.value && typeof window !== 'undefined') {
		// Defer one tick so computed values have a chance to settle.
		queueMicrotask(() => {
			const rows = auditBanditCollisions.value.map((c) => ({
				keep: c.keepId,
				other: c.otherId,
				dist: Number(c.dist.toFixed(3)),
			}));
			// eslint-disable-next-line no-console
			console.table(rows);
		});
	}
});

/**
 * Ellipse radii (viewBox units) that compensate for the non-square viewBox so
 * dots render as visually round circles regardless of board aspect ratio.
 * With preserveAspectRatio="none": 1 vb unit = width/100 px in x, height/100 px in y.
 * To get a dot of R screen-pixels we need rx = R*100/width, ry = R*100/height.
 */
const dotRadii = computed(() => {
	const { width, height, ready } = contentRect.value;
	const px = (r: number) => ({
		rx: ready ? (r * 100) / width : r * 0.12,
		ry: ready ? (r * 100) / height : r * 0.2,
	});
	// `ring` = reachable-move highlights (filled discs on the map).
	return { hit: px(12), current: px(4), ring: px(5.25), idle: px(2) };
});

function spaceDotRx(id: string): number {
	if (standingOnSpace(id)) return dotRadii.value.idle.rx;
	if (isSaddleTownHighlight(id)) return dotRadii.value.ring.rx;
	if (mapPlayActive.value && isMyTurn.value && reachableMoveTargets.value.has(id)) return dotRadii.value.ring.rx;
	return dotRadii.value.idle.rx;
}
function spaceDotRy(id: string): number {
	if (standingOnSpace(id)) return dotRadii.value.idle.ry;
	if (isSaddleTownHighlight(id)) return dotRadii.value.ring.ry;
	if (mapPlayActive.value && isMyTurn.value && reachableMoveTargets.value.has(id)) return dotRadii.value.ring.ry;
	return dotRadii.value.idle.ry;
}

/** Class for the invisible hit-area ellipse */
function spaceDotClickClass(id: string): string {
	if (standingOnSpace(id)) return 'pointer-events-none';
	if (inSaddleMapPickMode.value) return 'cursor-pointer pointer-events-auto';
	if (mapPlayActive.value && isMyTurn.value && reachableMoveTargets.value.has(id)) return 'cursor-pointer pointer-events-auto';
	return 'pointer-events-none';
}

/** Class for the visible dot / ring */
function spaceDotClass(id: string): string {
	if (standingOnSpace(id)) return 'fill-none stroke-none';

	if (isSaddleTownHighlight(id)) {
		return 'stroke-none pointer-events-none transition-[filter] duration-150 hover:brightness-110';
	}

	if (mapPlayActive.value && isMyTurn.value && reachableMoveTargets.value.has(id)) {
		return 'stroke-none pointer-events-none transition-[filter] duration-150 hover:brightness-110';
	}

	return 'fill-none stroke-none';
}

function spaceDotFillStyle(id: string): Record<string, string> | undefined {
	if (standingOnSpace(id)) return undefined;
	if (isSaddleTownHighlight(id)) {
		return { fill: 'rgba(45, 212, 191, 0.72)' };
	}
	if (
		mapPlayActive.value &&
		isMyTurn.value &&
		reachableMoveTargets.value.has(id) &&
		me.value &&
		TRACK_DISK_FILL[me.value.color]
	) {
		return { fill: hexWithAlpha(TRACK_DISK_FILL[me.value.color], 0.92) };
	}
	return undefined;
}

function onSpacePolygonClick(id: string) {
	if (!mapPlayActive.value || !isMyTurn.value) return;

	if (inSaddleMapPickMode.value) {
		const cid = saddleUpPickCardId.value;
		if (cid != null && SADDLE_UP_TOWN_SPACE_ID_SET.has(id)) {
			move('useCardAction', cid, id);
			clearSaddleUpPick();
			return;
		}
		showToast('Choose a town space', 'info');
		return;
	}

	if (!reachableMoveTargets.value.has(id)) return;
	move('moveToLocation', id);
}

/** Same box as the SVG overlay — HTML meeples sit here (avoids nested SVG). */
const meepleOverlayStyle = computed(() => svgOverlayStyle.value);

/** Screen-px spread when multiple seated players share a hex (see track markers). */
const MEEPLE_SPREAD_PX = 7;

type BoardFigureMarker = {
	key: string;
	cx: number;
	cy: number;
	zIndex: number;
	tag: 'player' | 'npc' | 'manInBlack';
	/** Player seat color (players only). */
	fill?: string;
	playerId?: string;
	npcKind?: BoardNpc['kind'];
};

function sortNpcsForHex(a: BoardNpc, b: BoardNpc): number {
	if (a.kind !== b.kind) return a.kind === 'sheriff' ? -1 : 1;
	return a.id.localeCompare(b.id);
}

const boardFigureMarkers = computed((): BoardFigureMarker[] => {
	const players = G.value.players;
	const centroids = spaceCentroids.value as Record<string, [number, number]>;

	const seated =
		players != null
			? Object.entries(players)
					.filter(([, pl]) => pl.characterId != null && BOARD_SPACES_BY_ID[pl.locationId])
					.map(([pid, pl]) => ({ pid, pl, loc: pl.locationId }))
			: [];

	const npcs = Array.isArray(G.value.boardNpcs) ? G.value.boardNpcs.filter((n) => BOARD_SPACES_BY_ID[n.spaceId]) : [];
	const mib = G.value.manInBlack;

	const byLoc = new Map<
		string,
		{ npcs: BoardNpc[]; players: typeof seated }
	>();

	for (const row of seated) {
		const bucket = byLoc.get(row.loc) ?? { npcs: [], players: [] };
		bucket.players.push(row);
		byLoc.set(row.loc, bucket);
	}
	for (const n of npcs) {
		const bucket = byLoc.get(n.spaceId) ?? { npcs: [], players: [] };
		bucket.npcs.push(n);
		byLoc.set(n.spaceId, bucket);
	}
	if (mib && BOARD_SPACES_BY_ID[mib.locationId]) {
		const bucket = byLoc.get(mib.locationId) ?? { npcs: [], players: [] };
		(bucket as { npcs: BoardNpc[]; players: typeof seated; manInBlack?: true }).manInBlack = true;
		byLoc.set(mib.locationId, bucket);
	}

	const { width, height, ready } = contentRect.value;
	const spreadOk = ready && width > 0 && height > 0;
	const sPx = MEEPLE_SPREAD_PX;
	const sOx = spreadOk ? (sPx * 100) / width : 1.2;
	const sOy = spreadOk ? (sPx * 100) / height : 1.2;

	const out: BoardFigureMarker[] = [];
	for (const [loc, bucket] of byLoc) {
		const orderedNpcs = [...bucket.npcs].sort(sortNpcsForHex);
		const orderedPlayers = [...bucket.players].sort((a, b) => a.pid.localeCompare(b.pid));
		const hasMib = (bucket as { manInBlack?: true }).manInBlack === true && mib;
		const occupants: (
			| { t: 'npc'; npc: BoardNpc }
			| { t: 'player'; pid: string; pl: WesternLegendsPlayer }
			| { t: 'manInBlack'; color: WesternLegendsPlayer['color'] }
		)[] = [
			...orderedNpcs.map((npc) => ({ t: 'npc' as const, npc })),
			...orderedPlayers.map((row) => ({ t: 'player' as const, pid: row.pid, pl: row.pl })),
			...(hasMib ? [{ t: 'manInBlack' as const, color: mib!.color }] : []),
		];
		const n = occupants.length;
		const base = centroids[loc];
		if (!base) continue;

		occupants.forEach((occ, j) => {
			let ox = 0;
			let oy = 0;
			if (n > 1) {
				const angle = (j * 2 * Math.PI) / n;
				ox = Math.cos(angle) * sOx;
				oy = Math.sin(angle) * sOy;
			}
			if (occ.t === 'npc') {
				out.push({
					key: `npc-${occ.npc.id}`,
					tag: 'npc',
					npcKind: occ.npc.kind,
					cx: base[0] + ox,
					cy: base[1] + oy,
					zIndex: 0,
				});
				return;
			}
			if (occ.t === 'manInBlack') {
				out.push({
					key: 'man-in-black',
					tag: 'manInBlack',
					fill: TRACK_DISK_FILL[occ.color],
					cx: base[0] + ox,
					cy: base[1] + oy,
					zIndex: 1,
				});
				return;
			}
			const isLocal = playerID.value != null && occ.pid === playerID.value;
			out.push({
				key: `player-${occ.pid}`,
				tag: 'player',
				playerId: occ.pid,
				fill: TRACK_DISK_FILL[occ.pl.color],
				cx: base[0] + ox,
				cy: base[1] + oy,
				zIndex: isLocal ? 2 : 1,
			});
		});
	}
	out.sort((a, b) => a.zIndex - b.zIndex || a.key.localeCompare(b.key));
	return out;
});

function figureMarkerIconStyle(m: BoardFigureMarker) {
	return {
		left: `${m.cx}%`,
		top: `${m.cy}%`,
		transform: 'translate(-50%, -50%)',
	};
}

const FALLBACK_STORY_BACK = STORY_BACK_IMAGE_PATHS.spend_80_town_single_action;

/** Two piles (half the shuffled deck each). Percents are viewBox coords; rendered in {@link svgOverlayStyle} box. */
const storyPilesUi = computed(() => {
	const left = G.value.storyDeckLeft ?? [];
	const right = G.value.storyDeckRight ?? [];
	const topBack = (pile: string[]) => {
		if (!pile.length) return FALLBACK_STORY_BACK;
		const id = pile[pile.length - 1]!;
		return getStoryCardBackImageUrl(id) ?? FALLBACK_STORY_BACK;
	};
	return [
		{
			key: 'story-pile-left',
			xPct: STORY_PILE_LEFT_ZONE.xPct,
			yPct: STORY_PILE_LEFT_ZONE.yPct,
			backUrl: topBack(left),
		},
		{
			key: 'story-pile-right',
			xPct: STORY_PILE_RIGHT_ZONE.xPct,
			yPct: STORY_PILE_RIGHT_ZONE.yPct,
			backUrl: topBack(right),
		},
	];
});

type TrackMarker = { cx: number; cy: number; fill: string; pid: string };

/** Target half-side in screen px; converted to viewBox using {@link contentRect} so squares stay square (see `dotRadii`). */
const TRACK_WANTED_HALF_PX = 6;
const TRACK_LEGEND_HALF_PX = 12;
const TRACK_MARSHAL_HALF_PX = 6;
/** Radius in screen px when multiple players share a track cell. */
const TRACK_MARKER_SPREAD_PX = 4.2;
const TRACK_LEGEND_MARKER_SPREAD_PX = 8.2;
/** Applied to the whole track-marker group (fill + stroke). */
const TRACK_MARKER_GROUP_OPACITY = 0.62;

function trackRectHalfVB(halfPx: number): { hw: number; hh: number } {
	const { width, height, ready } = contentRect.value;
	if (!ready || width <= 0 || height <= 0) {
		const f = halfPx * 0.1;
		return { hw: f, hh: f };
	}
	return { hw: (halfPx * 100) / width, hh: (halfPx * 100) / height };
}

/** Neutral discs when only {@link StoryInPlayEntry.discs} is set (no per-slot player ids). */
const STORY_DISC_LEGACY_FILL = '#64748b';
const STORY_DISC_HALF_PX = 5;

const storyDiscRectHalfVB = computed(() => trackRectHalfVB(STORY_DISC_HALF_PX));

type StoryDiscMarker = { key: string; cx: number; cy: number; wPct: number; hPct: number; fill: string };

/** `storyInPlay[0]` = left card, `[1]` = right; slots match {@link STORY_DISC_SPOTS_LEFT} / {@link STORY_DISC_SPOTS_RIGHT}. */
const storyDiscMarkers = computed((): StoryDiscMarker[] => {
	const rows = G.value.storyInPlay ?? [];
	const players = G.value.players;
	const { hw, hh } = storyDiscRectHalfVB.value;
	const wPct = hw * 2;
	const hPct = hh * 2;
	const out: StoryDiscMarker[] = [];

	function addForCard(row: StoryInPlayEntry | undefined, spots: typeof STORY_DISC_SPOTS_LEFT, keyPrefix: string) {
		if (!row) return;
		for (let i = 0; i < 3; i++) {
			let fill: string | undefined;
			if (row.discSlotPlayerIds !== undefined) {
				const pid = row.discSlotPlayerIds[i];
				if (pid != null && pid !== '') {
					const pl = players?.[pid];
					fill = pl ? TRACK_DISK_FILL[pl.color] : '#94a3b8';
				}
			} else if (i < row.discs) {
				fill = STORY_DISC_LEGACY_FILL;
			}
			if (fill == null) continue;
			const spot = spots[i];
			if (!spot) continue;
			const [cx, cy] = spot;
			out.push({
				key: `${keyPrefix}-${row.cardId}-${i}`,
				cx,
				cy,
				wPct,
				hPct,
				fill,
			});
		}
	}

	addForCard(rows[0], STORY_DISC_SPOTS_LEFT, 'sdL');
	addForCard(rows[1], STORY_DISC_SPOTS_RIGHT, 'sdR');
	return out;
});

const wantedTrackRectHalfVB = computed(() => trackRectHalfVB(TRACK_WANTED_HALF_PX));
const legendTrackRectHalfVB = computed(() => trackRectHalfVB(TRACK_LEGEND_HALF_PX));
const marshalTrackRectHalfVB = computed(() => trackRectHalfVB(TRACK_MARSHAL_HALF_PX));

function buildTrackMarkers(
	centers: readonly [number, number][],
	pointsFn: (p: WesternLegendsPlayer) => number,
	spreadPx: number = TRACK_MARKER_SPREAD_PX,
): TrackMarker[] {
	const players = G.value.players;
	if (!players || centers.length === 0) return [];
	const seated = Object.entries(players).filter(([, pl]) => pl.characterId != null);
	const maxSlot = centers.length;
	const bySlot = new Map<number, typeof seated>();
	for (const row of seated) {
		const [, pl] = row;
		const idx = trackSlotIndex(pointsFn(pl), maxSlot);
		if (idx == null) continue;
		const list = bySlot.get(idx) ?? [];
		list.push(row);
		bySlot.set(idx, list);
	}
	const out: TrackMarker[] = [];
	for (const [slotIdx, list] of bySlot) {
		const base = centers[slotIdx];
		if (!base) continue;
		const [baseX, baseY] = base;
		const n = list.length;
		const { width, height, ready } = contentRect.value;
		const spreadOk = ready && width > 0 && height > 0;
		const sPx = spreadPx;
		const sOx = spreadOk ? (sPx * 100) / width : 0.75;
		const sOy = spreadOk ? (sPx * 100) / height : 0.75;
		list.forEach(([pid, pl], j) => {
			let ox = 0;
			let oy = 0;
			if (n > 1) {
				const angle = (j * 2 * Math.PI) / n;
				ox = Math.cos(angle) * sOx;
				oy = Math.sin(angle) * sOy;
			}
			out.push({
				cx: baseX + ox,
				cy: baseY + oy,
				fill: TRACK_DISK_FILL[pl.color],
				pid,
			});
		});
	}
	return out;
}

const wantedTrackMarkers = computed(() => buildTrackMarkers(WANTED_TRACK_CENTERS, (p) => p.wantedPoints ?? 0));

const legendTrackMarkers = computed(() =>
	buildTrackMarkers(LEGEND_TRACK_CENTERS, (p) => p.legendaryPoints ?? 0, TRACK_LEGEND_MARKER_SPREAD_PX),
);

const marshalTrackMarkers = computed(() =>
	MARSHAL_TRACK_CENTERS.length === 9 ? buildTrackMarkers(MARSHAL_TRACK_CENTERS, (p) => p.marshalPoints ?? 0) : [],
);
</script>

<template>
	<div class="board-map relative w-full overflow-hidden rounded-xl border border-slate-700/90 bg-slate-950 shadow-lg ring-1 ring-slate-800/80">
		<div class="relative w-full">
			<!-- block w-full: inline-block was shrink-wrapping to intrinsic image width and made the board tiny -->
			<div class="relative w-full">
				<img
					ref="imgRef"
					:src="BOARD_IMAGE_PATH"
					alt="Western Legends board"
					class="block h-auto w-full max-h-[min(92vh,1400px)] object-contain"
					loading="lazy"
					decoding="async"
					@load="updateBoardOverlay"
				/>
				<svg class="absolute left-0 top-0" :style="svgOverlayStyle" :viewBox="viewBoxAttr" preserveAspectRatio="none" aria-hidden="true">
					<g v-if="auditMap" class="pointer-events-none">
						<ellipse
							v-for="s in BOARD_SPACES"
							:key="'audit-' + s.id"
							:cx="spaceCentroids[s.id][0]"
							:cy="spaceCentroids[s.id][1]"
							:rx="dotRadii.current.rx"
							:ry="dotRadii.current.ry"
							class="fill-emerald-400/20 stroke-emerald-400/85 stroke-[1]"
							vector-effect="non-scaling-stroke"
						/>
						<text
							v-for="s in BOARD_SPACES"
							:key="'audit-label-' + s.id"
							:x="spaceCentroids[s.id][0] + 0.9"
							:y="spaceCentroids[s.id][1] - 0.6"
							class="fill-emerald-200/90 text-[2.1px]"
							style="paint-order: stroke; stroke: rgba(2, 6, 23, 0.85); stroke-width: 0.55px"
						>
							{{ s.id }}
						</text>
						<g v-if="auditBanditCollisions.length > 0">
							<ellipse
								v-for="c in auditBanditCollisions"
								:key="'audit-collide-dot-' + c.otherId"
								:cx="c.otherAt[0]"
								:cy="c.otherAt[1]"
								:rx="dotRadii.current.rx * 1.35"
								:ry="dotRadii.current.ry * 1.35"
								class="fill-fuchsia-400/15 stroke-fuchsia-300/90 stroke-[1.25]"
								vector-effect="non-scaling-stroke"
							/>
							<text
								v-for="c in auditBanditCollisions"
								:key="'audit-collide-label-' + c.otherId"
								:x="c.otherAt[0] + 0.9"
								:y="c.otherAt[1] + 2.2"
								class="fill-fuchsia-200/95 text-[2.1px]"
								style="paint-order: stroke; stroke: rgba(2, 6, 23, 0.9); stroke-width: 0.6px"
							>
								{{ c.otherId }}
							</text>
						</g>
					</g>
					<!-- No SVG mask: filled move discs are large; a meeple cutout clipped neighbors into half-moons. Meeple is drawn in HTML above this SVG. -->
					<g>
						<g v-for="s in BOARD_SPACES" :key="s.id" @click="onSpacePolygonClick(s.id)">
							<!-- invisible hit area — larger for easier clicking -->
							<ellipse
								:cx="spaceCentroids[s.id][0]"
								:cy="spaceCentroids[s.id][1]"
								:rx="dotRadii.hit.rx"
								:ry="dotRadii.hit.ry"
								class="fill-transparent"
								:class="spaceDotClickClass(s.id)"
							/>
							<!-- visible dot / ring — omit entirely on your space so no stroke/halo under the meeple -->
							<ellipse
								v-if="!standingOnSpace(s.id)"
								:cx="spaceCentroids[s.id][0]"
								:cy="spaceCentroids[s.id][1]"
								:rx="spaceDotRx(s.id)"
								:ry="spaceDotRy(s.id)"
								:class="spaceDotClass(s.id)"
								:style="spaceDotFillStyle(s.id)"
								class="pointer-events-none"
								vector-effect="non-scaling-stroke"
							/>
						</g>
					</g>
					<!-- Wanted / Legend / Marshal tracks (not masked) -->
					<g class="pointer-events-none" :opacity="TRACK_MARKER_GROUP_OPACITY">
						<rect
							v-for="m in wantedTrackMarkers"
							:key="'wanted-' + m.pid"
							:x="m.cx - wantedTrackRectHalfVB.hw"
							:y="m.cy - wantedTrackRectHalfVB.hh"
							:width="wantedTrackRectHalfVB.hw * 2"
							:height="wantedTrackRectHalfVB.hh * 2"
							:fill="m.fill"
							stroke="#000"
							stroke-width="0.38"
							vector-effect="non-scaling-stroke"
						/>
						<rect
							v-for="m in marshalTrackMarkers"
							:key="'marshal-' + m.pid"
							:x="m.cx - marshalTrackRectHalfVB.hw"
							:y="m.cy - marshalTrackRectHalfVB.hh"
							:width="marshalTrackRectHalfVB.hw * 2"
							:height="marshalTrackRectHalfVB.hh * 2"
							:fill="m.fill"
							stroke="#000"
							stroke-width="0.38"
							vector-effect="non-scaling-stroke"
						/>
					</g>
					<g class="pointer-events-none">
						<rect
							v-for="m in legendTrackMarkers"
							:key="'legend-' + m.pid"
							:x="m.cx - legendTrackRectHalfVB.hw"
							:y="m.cy - legendTrackRectHalfVB.hh"
							:width="legendTrackRectHalfVB.hw * 2"
							:height="legendTrackRectHalfVB.hh * 2"
							:fill="m.fill"
							stroke="#0f766e"
							stroke-width="0.58"
							vector-effect="non-scaling-stroke"
						/>
					</g>
				</svg>
				<!-- Story deck: two piles (half the deck each). Same pixel box as SVG so %-coords match the board bitmap. -->
				<div
					v-if="contentRect.ready"
					class="pointer-events-none absolute z-[5]"
					:style="svgOverlayStyle"
					aria-hidden="true"
				>
					<div
						v-for="pile in storyPilesUi"
						:key="pile.key"
						class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
						:style="{ left: `${pile.xPct}%`, top: `${pile.yPct}%` }"
					>
						<img
							:src="pile.backUrl"
							alt=""
							class="block w-[min(7.5rem,16vw)] rounded-md object-cover shadow-lg ring-1 ring-black/35 aspect-[63/88]"
						/>
					</div>
					<div
						v-for="m in storyDiscMarkers"
						:key="m.key"
						class="pointer-events-none absolute z-[6] -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/55 shadow-[0_1px_2px_rgba(0,0,0,0.55)]"
						:style="{
							left: `${m.cx}%`,
							top: `${m.cy}%`,
							width: `${m.wPct}%`,
							height: `${m.hPct}%`,
							backgroundColor: m.fill,
						}"
					/>
				</div>
				<!-- Seated players + board NPCs; local player stacks above others when sharing a hex -->
				<template v-if="contentRect.ready">
					<div
						v-for="mm in boardFigureMarkers"
						:key="mm.key"
						class="pointer-events-none absolute left-0 top-0 z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
						:style="[meepleOverlayStyle, { zIndex: mm.zIndex }]"
						aria-hidden="true"
					>
						<div
							v-if="mm.tag === 'player'"
							class="absolute text-current"
							:style="{ ...figureMarkerIconStyle(mm), color: mm.fill }"
						>
							<IconMeeple :size="38" stroke="2.25" class="text-current" />
						</div>
						<div
							v-else-if="mm.npcKind === 'sheriff'"
							class="absolute text-current"
							:style="{ ...figureMarkerIconStyle(mm), color: NPC_SHERIFF_ICON_FILL }"
						>
							<IconUserShield :size="34" stroke="2.1" class="text-current" />
						</div>
						<div
							v-else-if="mm.tag === 'manInBlack'"
							class="absolute text-current"
							:title="'Man in Black'"
							:style="{ ...figureMarkerIconStyle(mm), color: mm.fill }"
						>
							<IconMeeple :size="34" stroke="2" class="text-current ring-1 ring-black/40 rounded-full" />
						</div>
						<div
							v-else
							class="absolute text-current"
							:style="{ ...figureMarkerIconStyle(mm), color: NPC_BANDIT_ICON_FILL }"
						>
							<IconMask :size="34" stroke="2.1" class="text-current" />
						</div>
					</div>
				</template>
			</div>
		</div>
		<p class="border-t border-slate-800/80 bg-slate-950/95 px-2 py-1.5 text-center text-[10px] text-slate-500">
			Meeples: seat colors · Reachable hexes (your turn): your color ({{ movementBudget }} MP) · Filled squares: Wanted (1–9) · Filled + teal stroke: Legend (1–30) · Filled squares: Marshal (1–9)
		</p>
	</div>
</template>
