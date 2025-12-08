// FundamentalControls.js
// Manages fundamental frequency UI, octave, and note selection
import { UIStateManager } from './UIStateManager.js';

export class FundamentalControls {
    static setFundamentalFromInput(freq) {
        UIStateManager.setFundamentalByFrequency(freq);
    }
    static changeOctave(direction) {
        const newMidi = window.AppState.currentMidiNote + (direction * 12);
        UIStateManager.setFundamentalByMidi(newMidi);
    }
    static selectNoteInOctave(noteIndex) {
        const baseMidi = (window.AppState.currentOctave + 1) * 12;
        UIStateManager.setFundamentalByMidi(baseMidi + noteIndex);
    }
}
