<script setup lang="ts">
import { useWlDiagnostics } from '../composables/useWlDiagnostics';

const { verboseMoves, copyStatus, canCopy, copyBugReport } = useWlDiagnostics();
</script>

<template>
	<div
		class="mt-3 rounded-lg border border-slate-700/80 bg-slate-900/40 px-3 py-2 text-xs text-slate-400"
	>
		<p class="mb-2 font-medium text-slate-300">Testing & bug reports</p>
		<p class="mb-2 leading-snug text-slate-500">
			The <strong class="font-medium text-slate-400">Game Log</strong> below lists every synced move (name, args,
			time). Use this panel to mirror moves to the browser console or copy a JSON bundle for an issue.
		</p>
		<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
			<label class="flex cursor-pointer items-center gap-2">
				<input v-model="verboseMoves" type="checkbox" class="rounded border-slate-600 bg-slate-900" />
				<span>Log each move to the console as <code class="text-[10px] text-slate-300">[WL move]</code></span>
			</label>
			<button
				type="button"
				class="rounded-lg border border-amber-800/50 bg-amber-950/35 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-900/30 disabled:cursor-not-allowed disabled:opacity-40"
				:disabled="!canCopy"
				@click="copyBugReport"
			>
				Copy bug report
			</button>
		</div>
		<p v-if="copyStatus === 'ok'" class="mt-1.5 text-emerald-400/90">Copied — paste into GitHub or a note.</p>
		<p v-else-if="copyStatus === 'err'" class="mt-1.5 text-rose-300/90">
			Could not copy (browser blocked clipboard). In dev, try
			<code class="text-[10px]">await __wlCopyBugReport()</code> from this window.
		</p>
		<p class="mt-2 text-[10px] leading-snug text-slate-600">
			The boardgame.io debug panel is enabled in this app (<code class="text-slate-500">App.vue</code> →
			<code class="text-slate-500">NobleProvider :debug="true"</code>). Set to
			<code class="text-slate-500">false</code> for a cleaner UI when you do not need it.
		</p>
	</div>
</template>
