// midiConfigActions.js
// Actions for updating midiConfig and propagating changes
import { AppState, midiConfig } from '../../config.js';
import { updateAllHarmonicPulses } from '../../audio.js';

const listeners = [];

export function updateMidiInputChannel(channel) {
    midiConfig.inputChannel = channel;
    notifyListeners();
}

export function updateMidiOutputChannel(channel) {
    midiConfig.outputChannel = Math.max(1, Math.min(16, Math.round(channel)));
    notifyListeners();
}

/** Notes below this number are ignored on input (feedback-loop guard). */
export function updateMidiInputNoteMin(note) {
    midiConfig.inputNoteMin = Math.max(0, Math.min(127, Math.round(note)));
    notifyListeners();
}

export function updateMidiDrawbarCC(index, cc) {
    midiConfig.drawbarsCC[index] = cc;
    notifyListeners();
}

/** Reassign the MIDI note sent for one overtone's pulses (0-based index). */
export function updatePulseNote(index, note) {
    midiConfig.pulseNotes[index] = Math.max(0, Math.min(127, Math.round(note)));
    notifyListeners();
}

/**
 * Global switches for the pulse outputs ('midi' | 'osc'): set the default
 * AND overwrite every overtone's per-voice flag so global and per-voice
 * toggles stay in sync. Worklet pulse emission is re-evaluated per voice.
 */
export function setPulseOutputEnabled(kind, enabled) {
    const on = Boolean(enabled);
    const flag = kind === 'midi' ? 'midi' : 'osc';
    if (kind === 'midi') midiConfig.pulseMidiEnabled = on;
    if (kind === 'osc') midiConfig.pulseOscEnabled = on;

    const count = AppState.currentSystem.ratios.length;
    for (let i = 0; i < count; i++) {
        AppState.oscillatorPulseOuts[i] = {
            midi: midiConfig.pulseMidiEnabled,
            osc: midiConfig.pulseOscEnabled,
            ...AppState.oscillatorPulseOuts[i],
            [flag]: on,
        };
    }

    updateAllHarmonicPulses();
    notifyListeners();
}

export function onMidiConfigChange(listener) {
    listeners.push(listener);
}

function notifyListeners() {
    listeners.forEach(fn => fn(midiConfig));
}
