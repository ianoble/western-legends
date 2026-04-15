<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useGame } from '@engine/client';
import type { WesternLegendsPlayer, WesternLegendsState } from '../logic/types';
import { uiGamePhase } from '../logic/phaseUi';
import { BOARD_IMAGE_PATH, POKER_ZONE, STORY_DECK_ZONE, STORY_DISCARD_ZONE } from '../map/locationMarkers';
import { MARSHAL_TRACK_CENTERS, WANTED_TRACK_CENTERS, trackSlotIndex } from '../map/boardTracks';
import { DEFAULT_MOVEMENT_POINTS, getReachableSpaceIds, polygonCentroid } from '../map/boardGraph';
import { BOARD_SPACES, BOARD_SPACES_BY_ID, BOARD_VIEWBOX_SIZE } from '../map/boardSpaces';
import type { PlayerColor } from '../logic/types';
import { IconMeeple } from '@tabler/icons-vue';

const auditMap = ref(false);

const TRACK_DISK_FILL: Record<PlayerColor, string> = {
	red: '#f87171',
	blue: '#60a5fa',
	green: '#4ade80',
	yellow: '#facc15',
	black: '#d4d4d8',
	orange: '#fb923c',
};

const { state, playerID, isMyTurn, move, ctx } = useGame<WesternLegendsState>();

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
	return Number.isFinite(mp) && mp >= 0 ? mp : DEFAULT_MOVEMENT_POINTS;
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
	// Smaller `ring` avoids huge viewBox radii on narrow widths (neighbor rings looked like they sat on your meeple).
	return { hit: px(12), current: px(4), ring: px(2.5), idle: px(2) };
});

function spaceDotRx(id: string): number {
	if (standingOnSpace(id)) return dotRadii.value.idle.rx;
	if (mapPlayActive.value && isMyTurn.value && reachableMoveTargets.value.has(id)) return dotRadii.value.ring.rx;
	return dotRadii.value.idle.rx;
}
function spaceDotRy(id: string): number {
	if (standingOnSpace(id)) return dotRadii.value.idle.ry;
	if (mapPlayActive.value && isMyTurn.value && reachableMoveTargets.value.has(id)) return dotRadii.value.ring.ry;
	return dotRadii.value.idle.ry;
}

/** Class for the invisible hit-area ellipse */
function spaceDotClickClass(id: string): string {
	if (standingOnSpace(id)) return 'pointer-events-none';
	if (mapPlayActive.value && isMyTurn.value && reachableMoveTargets.value.has(id)) return 'cursor-pointer pointer-events-auto';
	return 'pointer-events-none';
}

/** Class for the visible dot / ring */
function spaceDotClass(id: string): string {
	if (standingOnSpace(id)) return 'fill-none stroke-none';

	if (mapPlayActive.value && isMyTurn.value && reachableMoveTargets.value.has(id)) {
		// Spaces you can move to (not your current hex — meeple marks that).
		return 'fill-none stroke-emerald-400/80 stroke-[1.5] hover:fill-emerald-400/20';
	}

	return 'fill-none stroke-none';
}

function onSpacePolygonClick(id: string) {
	if (!mapPlayActive.value || !isMyTurn.value || !reachableMoveTargets.value.has(id)) return;
	move('moveToLocation', id);
}

const meeplePos = computed((): [number, number] | null => {
	if (!me.value) return null;
	const s = BOARD_SPACES_BY_ID[me.value.locationId];
	if (!s) return null;
	return polygonCentroid(s.polygon);
});

/** Same box as the SVG overlay — HTML meeple sits here (avoids nested SVG). */
const meepleOverlayStyle = computed(() => svgOverlayStyle.value);

const meepleIconStyle = computed(() => {
	const p = meeplePos.value;
	if (!p) return { display: 'none' as const };
	const [cx, cy] = p;
	return {
		left: `${cx}%`,
		top: `${cy}%`,
		transform: 'translate(-50%, -50%)',
	};
});

const storyDeckN = computed(() => G.value.storyDeck?.length ?? 0);
const storyDiscardN = computed(() => G.value.storyDiscard?.length ?? 0);

type TrackMarker = { cx: number; cy: number; fill: string; pid: string };

/** Target half-side in screen px; converted to viewBox using {@link contentRect} so squares stay square (see `dotRadii`). */
const TRACK_WANTED_HALF_PX = 3.2;
const TRACK_MARSHAL_HALF_PX = 3.55;
/** Radius in screen px when multiple players share a track cell. */
const TRACK_MARKER_SPREAD_PX = 2.5;
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

const wantedTrackRectHalfVB = computed(() => trackRectHalfVB(TRACK_WANTED_HALF_PX));
const marshalTrackRectHalfVB = computed(() => trackRectHalfVB(TRACK_MARSHAL_HALF_PX));

function buildTrackMarkers(centers: readonly [number, number][], pointsFn: (p: WesternLegendsPlayer) => number): TrackMarker[] {
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
		const sPx = TRACK_MARKER_SPREAD_PX;
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
					<defs>
						<!--
	Cut out a disk at the meeple so an adjacent hex’s movement ring (centered next door)
							can’t paint over your pawn when ring radii are large in viewBox space on small widths.
						-->
						<mask id="wl-move-rings-meeple-cutout" maskContentUnits="userSpaceOnUse">
							<rect width="100" height="100" fill="white" />
							<circle v-if="meeplePos" :cx="meeplePos[0]" :cy="meeplePos[1]" r="3.4" fill="black" />
						</mask>
					</defs>
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
					<g mask="url(#wl-move-rings-meeple-cutout)">
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
								class="pointer-events-none transition-[fill] duration-150"
								vector-effect="non-scaling-stroke"
							/>
						</g>
					</g>
					<!-- Wanted / Marshal tracks (not masked — corner of board) -->
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
							:key="'marshal-k-' + m.pid"
							:x="m.cx - marshalTrackRectHalfVB.hw"
							:y="m.cy - marshalTrackRectHalfVB.hh"
							:width="marshalTrackRectHalfVB.hw * 2"
							:height="marshalTrackRectHalfVB.hh * 2"
							fill="none"
							stroke="#000"
							stroke-width="0.55"
							vector-effect="non-scaling-stroke"
						/>
						<rect
							v-for="m in marshalTrackMarkers"
							:key="'marshal-' + m.pid"
							:x="m.cx - marshalTrackRectHalfVB.hw"
							:y="m.cy - marshalTrackRectHalfVB.hh"
							:width="marshalTrackRectHalfVB.hw * 2"
							:height="marshalTrackRectHalfVB.hh * 2"
							fill="none"
							:stroke="m.fill"
							stroke-width="0.34"
							vector-effect="non-scaling-stroke"
						/>
					</g>
				</svg>
				<!-- current player: board-game meeple (Tabler), same coordinate box as SVG -->
				<div
					v-if="meeplePos && contentRect.ready"
					class="pointer-events-none absolute left-0 top-0 text-amber-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
					:style="meepleOverlayStyle"
					aria-hidden="true"
				>
					<div class="absolute" :style="meepleIconStyle">
						<IconMeeple :size="26" stroke="2" class="text-amber-400" />
					</div>
				</div>
			</div>

			<div class="pointer-events-none absolute inset-0">
				<div
					class="pointer-events-none absolute max-w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-md border border-amber-900/50 bg-slate-950/90 px-2 py-1 text-center shadow backdrop-blur-sm"
					:style="{ left: `${STORY_DECK_ZONE.xPct}%`, top: `${STORY_DECK_ZONE.yPct}%` }"
				>
					<p class="text-[10px] font-medium uppercase tracking-wide text-amber-200/90">Story deck</p>
					<p class="font-mono text-sm text-slate-100">{{ storyDeckN }}</p>
				</div>
				<div
					class="pointer-events-none absolute max-w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-md border border-slate-600/70 bg-slate-950/90 px-2 py-1 text-center shadow backdrop-blur-sm"
					:style="{ left: `${STORY_DISCARD_ZONE.xPct}%`, top: `${STORY_DISCARD_ZONE.yPct}%` }"
				>
					<p class="text-[10px] font-medium uppercase tracking-wide text-slate-400">Story discard</p>
					<p class="font-mono text-sm text-slate-100">{{ storyDiscardN }}</p>
				</div>
			</div>
		</div>
		<p class="border-t border-slate-800/80 bg-slate-950/95 px-2 py-1.5 text-center text-[10px] text-slate-500">
			Amber meeple: your space · Green: reachable ({{ movementBudget }} MP) · Filled squares: Wanted track (1–9) · Outline squares: Marshal track (1–9)
		</p>
	</div>
</template>
