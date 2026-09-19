import { AppState } from '../../config.js';
import { INSPECTOR_CHANGED } from '../../events.js';

/**
 * Inspector state — which overtone the Sequence panel (and its side
 * visualization) is editing. UI-only: never bridged, never persisted.
 * Presentation lives in the inspector controller/component — this module
 * only holds the state.
 */

const state = { index: 0 };

function voiceCount() {
    return AppState.currentSystem.ratios.length;
}

export const inspectorState = {
    get index() {
        // A system switch can shrink the voice count under a stale selection
        return Math.min(state.index, Math.max(0, voiceCount() - 1));
    },

    select(index) {
        if (index === state.index) return;
        state.index = index;
        document.dispatchEvent(new CustomEvent(INSPECTOR_CHANGED, { detail: { index } }));
    },

    /** Move the selection by `delta` voices, wrapping. */
    step(delta) {
        const n = voiceCount();
        if (n === 0) return;
        this.select((this.index + delta + n) % n);
    },
};
