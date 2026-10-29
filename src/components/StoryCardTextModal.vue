<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import type { StoryCardContent } from '../data/storyCardContent';

const props = defineProps<{
	open: boolean;
	content: StoryCardContent | null;
}>();

const emit = defineEmits<{
	close: [];
}>();

function onBackdrop() {
	emit('close');
}

function onKeydown(e: KeyboardEvent) {
	if (e.key === 'Escape') {
		e.preventDefault();
		emit('close');
	}
}

watch(
	() => props.open,
	(open) => {
		if (open) {
			window.addEventListener('keydown', onKeydown);
		} else {
			window.removeEventListener('keydown', onKeydown);
		}
	},
	{ immediate: true },
);

onBeforeUnmount(() => {
	window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
	<Teleport to="body">
		<div
			v-if="open"
			class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-[1px]"
			role="dialog"
			aria-modal="true"
			aria-labelledby="story-card-text-title"
			@click.self="onBackdrop"
		>
			<div
				class="max-h-[min(85vh,720px)] w-full max-w-lg overflow-y-auto rounded-xl border border-amber-900/50 bg-slate-950/98 p-4 shadow-2xl ring-1 ring-amber-900/30"
				@click.stop
			>
				<div class="mb-3 flex items-start justify-between gap-2">
					<h2
						id="story-card-text-title"
						class="pr-2 text-lg font-semibold text-amber-50"
					>
						{{ content?.title ?? 'Story card' }}
					</h2>
					<button
						type="button"
						class="shrink-0 rounded-md border border-amber-800/50 bg-amber-950/40 px-2 py-1 text-sm text-amber-100/90 hover:bg-amber-900/50"
						@click="emit('close')"
					>
						Close
					</button>
				</div>
				<template v-if="content">
					<p v-if="content.flavor" class="mb-3 text-sm italic text-amber-200/80">{{ content.flavor }}</p>
					<p class="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-amber-100/95">{{ content.event }}</p>
					<p class="text-sm text-slate-300">Spawn bandits: {{ content.spawn_bandits }}</p>
					<p v-if="content.sheriff_move" class="mt-2 text-sm text-slate-300">
						<span class="font-medium text-amber-200/90">Sheriff:</span>
						{{ content.sheriff_move }}
					</p>
				</template>
				<p v-else class="text-sm text-slate-400">Card text not available.</p>
			</div>
		</div>
	</Teleport>
</template>
