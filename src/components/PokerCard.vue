<script setup lang="ts">
import { computed } from 'vue';
import { isCardHidden, type Card } from '@engine/client';
import type { StandardCard } from '@engine/client';

const props = defineProps<{ card: Card }>();

const hidden = computed(() => isCardHidden(props.card));

const GLYPH: Record<string, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

const face = computed(() => (hidden.value ? null : (props.card as StandardCard)));

const isRed = computed(() => {
  const s = face.value?.suit;
  return s === 'hearts' || s === 'diamonds';
});

const glyph = computed(() => (face.value ? GLYPH[face.value.suit] ?? '?' : ''));
const rank = computed(() => face.value?.rank ?? '');

const ariaLabel = computed(() => {
  if (hidden.value) return 'Hidden card';
  const f = face.value;
  if (!f) return 'Card';
  return `${f.rank} of ${f.suit}`;
});
</script>

<template>
  <div
    role="img"
    :aria-label="ariaLabel"
    class="relative flex aspect-[5/7] w-[4rem] shrink-0 flex-col overflow-hidden rounded-lg border-2 shadow-md select-none sm:w-[4.5rem] md:w-[4.75rem]"
    :class="
      hidden
        ? 'border-slate-600 bg-slate-800 bg-[repeating-linear-gradient(135deg,#475569_0px,#475569_6px,#334155_6px,#334155_12px)]'
        : 'border-slate-600/90 bg-white'
    "
  >
    <template v-if="hidden">
      <div
        class="m-1 flex flex-1 items-center justify-center rounded-md border border-slate-500/40 bg-slate-900/40"
      >
        <span class="text-[10px] font-semibold tracking-widest text-slate-500">?</span>
      </div>
    </template>
    <template v-else>
      <!-- Full-card center so the pip isn’t offset by the top-left index block in a column flex -->
      <div
        class="pointer-events-none absolute inset-0 z-0 flex items-center justify-center text-3xl leading-none sm:text-4xl"
        :class="isRed ? 'text-red-600' : 'text-slate-900'"
        aria-hidden="true"
      >
        {{ glyph }}
      </div>
      <div
        class="pointer-events-none absolute left-1 top-1 z-10 flex flex-col items-start gap-0 p-0.5 leading-none sm:left-1.5 sm:top-1.5 sm:p-1"
        :class="isRed ? 'text-red-600' : 'text-slate-900'"
      >
        <span class="text-[13px] font-bold tabular-nums sm:text-sm">{{ rank }}</span>
        <span class="text-[11px] leading-none sm:text-xs" aria-hidden="true">{{ glyph }}</span>
      </div>
      <div
        class="pointer-events-none absolute right-1 bottom-1 z-10 flex rotate-180 flex-col items-start gap-0 p-0.5 leading-none sm:right-1.5 sm:bottom-1.5 sm:p-1"
        :class="isRed ? 'text-red-600' : 'text-slate-900'"
        aria-hidden="true"
      >
        <span class="text-[13px] font-bold tabular-nums sm:text-sm">{{ rank }}</span>
        <span class="text-[11px] leading-none sm:text-xs">{{ glyph }}</span>
      </div>
    </template>
  </div>
</template>
