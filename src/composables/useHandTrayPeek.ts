import { ref } from 'vue';

/** Shared across GameView + GameBoard so the hand tray translate and layout padding stay in sync. */
const handTrayRetracted = ref(false);

export function useHandTrayPeek() {
	function toggleHandTrayPeek() {
		handTrayRetracted.value = !handTrayRetracted.value;
	}

	return {
		handTrayRetracted,
		toggleHandTrayPeek,
	};
}
