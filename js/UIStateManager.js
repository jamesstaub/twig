// UIStateManager.js
// Centralizes state update logic for fundamental, drawbars, etc. Used by keyboard, MIDI, and UI modules.

import { AppState, updateAppState } from './config.js';
import { updateFundamentalDisplay, updateKeyboardUI } from './ui.js';
import { updateAudioProperties } from './audio.js';


/**
 * DEPRECATED:
 * use actions in modules diretories and call updateAppState directly from them
 */

export class UIStateManager {
    // Get current AppState
    static getState() {
        return AppState;
    }
    // Set fundamental by MIDI note
    static setFundamentalByMidi(midiNote) {
        const midi = Math.min(127, midiNote); // Clamp upper bound
        const frequency = UIStateManager.midiToFreq(midi);
        const octave = Math.floor(midi / 12) - 1;
        updateAppState({
            currentMidiNote: midi,
            fundamentalFrequency: frequency,
            currentOctave: octave
        });
        updateFundamentalDisplay();
        updateKeyboardUI();
        updateAudioProperties();
    }

    // Set fundamental by frequency
    static setFundamentalByFrequency(freq) {
        const midi = Math.round(UIStateManager.freqToMidi(freq));
        UIStateManager.setFundamentalByMidi(midi);
    }



    // Utility: MIDI <-> Frequency
    static midiToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }
    static freqToMidi(freq) {
        return 69 + 12 * Math.log2(freq / 440);
    }
}
