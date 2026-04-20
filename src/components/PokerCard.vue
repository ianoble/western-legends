<script setup lang="ts">
import { computed, ref, watch, withDefaults } from 'vue';
import { isCardHidden, type Card } from '@engine/client';
import type { StandardCard, VisibleCard } from '@engine/client';
import { pokerCardImagePath } from '../data/pokerCardAssets';

const props = withDefaults(
	defineProps<{
		card: Card;
		/** Larger footprint for the bottom hand fan (readability). */
		handTray?: boolean;
	}>(),
	{ handTray: false },
);

const hidden = computed(() => isCardHidden(props.card));

const face = computed(() => (hidden.value ? null : (props.card as StandardCard)));

const imageFailed = ref(false);

const imageSrc = computed(() => {
	if (hidden.value || !face.value) return '';
	return pokerCardImagePath((props.card as VisibleCard).id);
});

watch(
	() => (props.card as VisibleCard).id,
	() => {
		imageFailed.value = false;
	},
);

const GLYPH: Record<string, string> = {
	hearts: '\u2665',
	diamonds: '\u2666',
	clubs: '\u2663',
	spades: '\u2660',
};

const isRed = computed(() => {
	const s = face.value?.suit;
	return s === 'hearts' || s === 'diamonds';
});

const glyph = computed(() => (face.value ? GLYPH[face.value.suit] ?? '?' : ''));
const rank = computed(() => face.value?.rank ?? '');

const showPipFallback = computed(() => Boolean(face.value) && (!imageSrc.value || imageFailed.value));

const ariaLabel = computed(() => {
	if (hidden.value) return 'Hidden card';
	const f = face.value;
	if (!f) return 'Card';
	return `${f.rank} of ${f.suit}`;
});

const sizeClass = computed(() =>
	props.handTray
		? 'w-[min(7.5rem,calc((100vw-3rem)/6))] min-[480px]:w-28 sm:w-32 md:w-36'
		: 'w-[4rem] sm:w-[4.5rem] md:w-[4.75rem]',
);
</script>

<template>
	<div
		role="img"
		:aria-label="ariaLabel"
		:class="[
			'relative flex aspect-[5/7] shrink-0 flex-col overflow-hidden rounded-lg border-2 shadow-md select-none',
			sizeClass,
			hidden
				? 'border-slate-600 bg-slate-800 bg-[repeating-linear-gradient(135deg,#475569_0px,#475569_6px,#334155_6px,#334155_12px)]'
				: 'border-slate-600 bg-slate-950',
		]"
	>
		<template v-if="hidden">
			<div
				class="m-1 flex flex-1 items-center justify-center rounded-md border border-slate-500/40 bg-slate-900/40"
			>
				<span class="text-[10px] font-semibold tracking-widest text-slate-500">?</span>
			</div>
		</template>
		<template v-else>
			<img
				v-if="imageSrc && !imageFailed"
				:src="imageSrc"
				alt=""
				class="h-full w-full object-contain object-center"
				loading="lazy"
				draggable="false"
				@error="imageFailed = true"
			/>
			<template v-if="showPipFallback">
				<div
					class="pointer-events-none absolute inset-0 z-0 flex items-center justify-center text-3xl leading-none sm:text-4xl"
					:class="isRed ? 'text-red-600' : 'text-slate-100'"
					aria-hidden="true"
				>
					{{ glyph }}
				</div>
				<div
					class="pointer-events-none absolute left-1 top-1 z-10 flex flex-col items-start gap-0 p-0.5 leading-none sm:left-1.5 sm:top-1.5 sm:p-1"
					:class="isRed ? 'text-red-600' : 'text-slate-100'"
				>
					<span class="text-[13px] font-bold tabular-nums sm:text-sm">{{ rank }}</span>
					<span class="text-[11px] leading-none sm:text-xs" aria-hidden="true">{{ glyph }}</span>
				</div>
				<div
					class="pointer-events-none absolute right-1 bottom-1 z-10 flex rotate-180 flex-col items-start gap-0 p-0.5 leading-none sm:right-1.5 sm:bottom-1.5 sm:p-1"
					:class="isRed ? 'text-red-600' : 'text-slate-100'"
					aria-hidden="true"
				>
					<span class="text-[13px] font-bold tabular-nums sm:text-sm">{{ rank }}</span>
					<span class="text-[11px] leading-none sm:text-xs">{{ glyph }}</span>
				</div>
			</template>
		</template>
	</div>
</template>
