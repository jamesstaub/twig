// midiConfigActions.js
// Actions for updating midiConfig and propagating changes
import { AppState, midiConfig } from '../../config.js';
import { midiInputRouter } from './midiInputRouter.js';
import { midiOutputRouter } from './midiOutputRouter.js';
import { OvertoneSignalActions } from '../overtoneSignal/overtoneSignalActions.js';
import { MIDI_OUTPUT_CHANGED } from '../../events.js';

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

    // Per voice through the actions layer, so the change syncs upstream
    // to the bridge (and each running voice's worklet is re-evaluated)
    const count = AppState.currentSystem.ratios.length;
    for (let i = 0; i < count; i++) {
        OvertoneSignalActions.setPulseOut(i, { [flag]: on });
    }

    notifyListeners();
}

/**
 * Select the note-out port — by port id, 0-based index, or name (null/'' =
 * first available). The single write path shared by the MIDI modal and the
 * OSC bridge, so the choice syncs upstream and persists across reloads.
 * Safe before the router initializes — the selector is kept and resolved
 * when Web MIDI comes up.
 */
export function updateMidiOutputPort(selector) {
    midiOutputRouter.selectOutput(selector);
    notifyListeners();
    document.dispatchEvent(new CustomEvent(MIDI_OUTPUT_CHANGED));
}

/** Select the clock/transport-out port (null/'' = same as note out). */
export function updateMidiClockOutputPort(selector) {
    midiOutputRouter.selectClockOutput(selector);
    notifyListeners();
}

/** Select the note/CC input port (null/'' = all inputs). */
export function updateMidiInputPort(selector) {
    midiInputRouter.selectInput(selector);
    notifyListeners();
}

export function onMidiConfigChange(listener) {
    listeners.push(listener);
}

function notifyListeners() {
    listeners.forEach(fn => fn(midiConfig));
}
