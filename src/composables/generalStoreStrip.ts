import { nextTick, ref } from 'vue';

export const GENERAL_STORE_STRIP_ANCHOR_ID = 'wl-general-store-strip-anchor';

/** Shared with {@link GeneralStoreStripPanel.vue} and {@link GameBoard.vue} (browse button). */
export const generalStoreStripOpen = ref(false);

export function requestGeneralStoreStripOpen(): void {
	generalStoreStripOpen.value = true;
	void nextTick(() => {
		document.getElementById(GENERAL_STORE_STRIP_ANCHOR_ID)?.scrollIntoView({
			behavior: 'smooth',
			block: 'nearest',
		});
	});
}

export function closeGeneralStoreStrip(): void {
	generalStoreStripOpen.value = false;
}
