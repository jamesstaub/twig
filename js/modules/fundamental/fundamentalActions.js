import { AppState, updateAppState } from "../../config";
import { showStatus, updateText, updateValue } from "../../domUtils";
import { FUNDAMENTAL_CHANGED } from "../../events";

export const FundamentalActions = {
    updateFundamentalDisplay() {
        updateValue('fundamental-input', AppState.fundamentalFrequency.toFixed(2));
        updateText('current-octave-display', `Octave ${AppState.currentOctave}`);
    },

    changeOctave(direction) {
        const newMidiNote = AppState.currentMidiNote + (direction * 12);
        this.setFundamentalByMidi(newMidiNote);
    },

    setFundamentalByFrequency(freq) {
        const midi = Math.round(freqToMidi(freq));
        this.setFundamentalByMidi(midi);
    },

    setFundamentalByNoteIndex(noteIndex) {
        const baseMidi = (AppState.currentOctave + 1) * 12;
        const newMidi = baseMidi + noteIndex;
        this.setFundamentalByMidi(newMidi);
    },

    handleFundamentalChange(val) {
        // Allow very low frequencies (down to 0.01 Hz)
        if (isNaN(val) || val < 0.001 || val > 10000) {
            showStatus("Frequency must be between 0.01 Hz and 10000 Hz.", 'error');
            val = AppState.fundamentalFrequency; // Revert to current value
        }

        FundamentalActions.setFundamentalByFrequency(val);

    },

    // TODO: move to component
    updateKeyboardUI() {
        const keys = document.querySelectorAll('.key');
        keys.forEach(key => key.classList.remove('active'));

        // Calculate the index (0-11) of the selected note within the current octave
        let noteIndex = AppState.currentMidiNote % 12;
        if (noteIndex < 0) noteIndex += 12;
        const selectedKey = document.querySelector(`.key[data-note-index="${noteIndex}"]`);

        if (selectedKey) {
            selectedKey.classList.add('active');
        }
    },

    /**
     * Set the fundamental to an exact frequency without quantizing to the
     * nearest MIDI note — used by "set as fundamental" on a drawbar, where
     * microtonal partials must land exactly. The nearest MIDI note is still
     * stored for keyboard/octave display.
     */
    setFundamentalExact(freq) {
        if (!isFinite(freq) || freq < 0.001 || freq > 10000) return;
        const midi = Math.min(127, Math.round(freqToMidi(freq)));

        updateAppState({
            currentMidiNote: midi,
            fundamentalFrequency: freq,
            currentOctave: Math.floor(midi / 12) - 1
        });

        document.dispatchEvent(new CustomEvent(FUNDAMENTAL_CHANGED));
    },

    setFundamentalByMidi(midiNote) {
        const midi = Math.min(127, midiNote); // Clamp upper bound
        const frequency = midiToFreq(midi);
        const octave = Math.floor(midi / 12) - 1;

        updateAppState({
            currentMidiNote: midi,
            fundamentalFrequency: frequency,
            currentOctave: octave
        });

        document.dispatchEvent(
            new CustomEvent(FUNDAMENTAL_CHANGED)
        );

    }
}

// Utility: MIDI <-> Frequency
function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

function freqToMidi(freq) {
    return 69 + 12 * Math.log2(freq / 440);
}

