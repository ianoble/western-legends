<script setup lang="ts">
import { ref } from 'vue';

type StepTag = 'Table' | 'Automated' | 'Not in app yet';

interface SetupStep {
  id: string;
  text: string;
  tag: StepTag;
}

/**
 * Reference only: physical table vs what the app automates when the match goes active.
 */
const STEPS: SetupStep[] = [
  { id: 'board', text: 'Lay out the board, tracks, and general areas so everyone can reach them.', tag: 'Table' },
  { id: 'money-decks', text: 'Prepare starting money, poker deck and discard, dice, and nugget tokens as usual.', tag: 'Table' },
  { id: 'store-items', text: 'Stock the General Store with item tiles and other market pieces per the rulebook.', tag: 'Table' },
  { id: 'player-bits', text: 'Give each player a mat, cubes, discs, and a color ring matching their seat.', tag: 'Table' },
  { id: 'cattle', text: 'Place cattle facedown on ranches following the printed setup.', tag: 'Table' },
  { id: 'characters', text: 'Run character draft (draw two, keep one) and take starting money, items, and poker per the chosen card.', tag: 'Table' },
  { id: 'marshal-wanted', text: 'Place Marshal / Wanted tokens and any scoring cubes those tracks need.', tag: 'Table' },
  { id: 'starting-spots', text: 'Put figures and rings on printed starting locations (e.g. town and story board positions).', tag: 'Table' },
  { id: 'decks-board', text: 'Shuffle and place story decks, fight deck, and other board decks where the map shows.', tag: 'Table' },
  { id: 'npc-tokens', text: 'Add Sheriff, bandits at empty hideouts, wound marker, and other neutral pieces the scenario needs.', tag: 'Not in app yet' },
  { id: 'first-player', text: 'Choose first player (rulebook: most Wanted, with tie-break) at the table.', tag: 'Not in app yet' },
  {
    id: 'digital-decks',
    text: 'When this match goes active, the server runs setup for every seat: poker hands, story deck stub, legend goal, starting gold — automatically.',
    tag: 'Automated',
  },
  { id: 'digital-map', text: 'Riding between locations in the app uses the prototype graph, not a pixel-perfect map of the board.', tag: 'Automated' },
  { id: 'player-aids', text: 'Hand out physical player aids; use your printed rulebook for exact counts and diagrams.', tag: 'Table' },
];

const open = ref(false);

function tagClass(tag: StepTag): string {
  if (tag === 'Table') return 'bg-amber-900/50 text-amber-100';
  if (tag === 'Automated') return 'bg-emerald-900/50 text-emerald-200';
  return 'bg-slate-700 text-slate-300';
}
</script>

<template>
  <section class="mb-4 rounded-lg border border-slate-700/80 bg-slate-950/80 shadow-lg backdrop-blur-sm">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-slate-200 hover:bg-slate-800/50"
      @click="open = !open"
    >
      <span>Physical setup reference</span>
      <span class="text-xs text-slate-500">{{ open ? 'Hide' : 'Show' }}</span>
    </button>
    <div v-show="open" class="border-t border-slate-800 px-4 py-3">
      <p class="mb-3 text-xs text-slate-400">
        This list is only a reminder for the real table. It does not control the game. As soon as your lobby
        fills and the match becomes active, the server runs
        <strong class="text-slate-300">setup()</strong>
        for the whole table: every joined seat gets cards, gold, location, and the shared legend goal — no host
        action required in the app for that.
      </p>
      <p class="mb-3 text-xs text-slate-500">
        Paraphrased from your rulebook’s setup section; use your printed rules for full wording.
      </p>
      <ol class="list-decimal space-y-2 pl-4 text-sm text-slate-200">
        <li v-for="s in STEPS" :key="s.id" class="leading-snug">
          <span class="mr-2">{{ s.text }}</span>
          <span
            class="mt-1 inline-block rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
            :class="tagClass(s.tag)"
          >
            {{ s.tag }}
          </span>
        </li>
      </ol>
    </div>
  </section>
</template>
