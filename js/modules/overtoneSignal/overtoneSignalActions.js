import { AppState } from "../../config.js";
import { updateHarmonicGate, updateHarmonicFilter, updateHarmonicPan } from "../../audio.js";
import { getVoicePan } from "../../utils.js";
import { OVERTONE_SIGNAL_CHANGED } from "../../events.js";

/**
 * Per-overtone signal-chain state (cycle gate, lowpass, pan).
 * Single write path shared by the modal UI; the OSC client listens for
 * OVERTONE_SIGNAL_CHANGED to sync Live params upstream. (Inbound OSC writes
 * state directly and does not emit this event, so there is no echo.)
 */
export const OvertoneSignalActions = {

    getGate(index) {
        return { mode: 0, x: 1, y: 1, seq: [], ...AppState.oscillatorGates[index] };
    },

    getFilter(index) {
        return { multiplier: 0, q: 0.707, ...AppState.oscillatorFilters[index] };
    },

    getPan(index) {
        return getVoicePan(index);
    },

    setGate(index, gate) {
        AppState.oscillatorGates[index] = gate;
        updateHarmonicGate(index);
        this._changed(index, 'gate');
    },

    setFilter(index, filter) {
        AppState.oscillatorFilters[index] = filter;
        updateHarmonicFilter(index);
        this._changed(index, 'filter');
    },

    setPan(index, pan) {
        if (!Array.isArray(AppState.oscillatorPans)) AppState.oscillatorPans = [];
        AppState.oscillatorPans[index] = Math.max(-1, Math.min(1, pan));
        updateHarmonicPan(index);
        this._changed(index, 'pan');
    },

    _changed(index, kind) {
        document.dispatchEvent(new CustomEvent(OVERTONE_SIGNAL_CHANGED, {
            detail: { index, kind }
        }));
    }
};
