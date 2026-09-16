import { AppState } from '../../config.js';
import { INSPECTOR_CHANGED } from '../../events.js';

/**
 * Inspector state — which overtone is selected for editing and whether
 * the inspector sheet is open. UI-only: never bridged, never persisted.
 *
 * The Voice surface always shows the selected overtone; the sheet shows
 * it beside any other surface while `open`. Presentation lives in the
 * inspector controller/component — this module only holds the state.
 */

const state = { index: 0, open: false };

function voiceCount() {
    return AppState.currentSystem.ratios.length;
}

function emit() {
    document.dispatchEvent(new CustomEvent(INSPECTOR_CHANGED, {
        detail: { index: state.index, open: state.open },
    }));
}

export const inspectorState = {
    get index() {
        // A system switch can shrink the voice count under a stale selection
        return Math.min(state.index, Math.max(0, voiceCount() - 1));
    },
    get isOpen() {
        return state.open;
    },

    /** Select `index` (when given) and open the sheet. */
    open(index) {
        if (index !== undefined) state.index = index;
        state.open = true;
        emit();
    },

    select(index) {
        if (index === state.index) return;
        state.index = index;
        emit();
    },

    /** Move the selection by `delta` voices, wrapping. */
    step(delta) {
        const n = voiceCount();
        if (n === 0) return;
        this.select((this.index + delta + n) % n);
    },

    close() {
        if (!state.open) return;
        state.open = false;
        emit();
    },
};
