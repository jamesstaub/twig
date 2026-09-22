// midiConfigActions.js
// Actions for updating midiConfig and propagating changes
import { AppState } from '../../config.js';
import { midiConfig, persistAppConfig, MIDI_RANGE_SPAN } from '../../appConfig.js';
import { midiInputRouter } from './midiInputRouter.js';
import { midiOutputRouter } from './midiOutputRouter.js';
import { OvertoneSignalActions } from '../overtoneSignal/overtoneSignalActions.js';
import { MIDI_OUTPUT_CHANGED } from '../../events.js';

const clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.round(value)));

// Highest start of a per-overtone note/CC range that still fits 0-127
const MIDI_RANGE_START_MAX = 128 - MIDI_RANGE_SPAN;

// Octave transpose limit for the fundamental note input
const TRANSPOSE_MAX = 5;

// What each numeric setting accepts; the settings panel reads the same
// table for its inputs' bounds
export const MIDI_SETTING_RANGES = {
    fundamentalChannel: [1, 16],
    fundamentalTranspose: [-TRANSPOSE_MAX, TRANSPOSE_MAX],
    triggerChannel: [1, 16],
    triggerNoteStart: [0, MIDI_RANGE_START_MAX],
    ccChannel: [1, 16],
    gainCCStart: [0, MIDI_RANGE_START_MAX],
    cutoffCCStart: [0, MIDI_RANGE_START_MAX],
    convWetCCStart: [0, MIDI_RANGE_START_MAX],
    crossfaderCC: [0, 127],
    pulseChannel: [1, 16],
    pulseNoteStart: [0, MIDI_RANGE_START_MAX],
};

/** Set one numeric MIDI setting (a MIDI_SETTING_RANGES key), clamped. */
export function updateMidiSetting(key, value) {
    const range = MIDI_SETTING_RANGES[key];
    if (!range || !Number.isFinite(value)) return;
    midiConfig[key] = clampInt(value, range[0], range[1]);
    persistAppConfig();
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

    persistAppConfig();
}

/**
 * Select the note-out port — by port id, 0-based index, or name (null/'' =
 * first available). The single write path shared by the settings panel and the
 * OSC bridge, so the choice syncs upstream and persists across reloads.
 * Safe before the router initializes — the selector is kept and resolved
 * when Web MIDI comes up.
 */
export function updateMidiOutputPort(selector) {
    midiOutputRouter.selectOutput(selector);
    persistAppConfig();
    document.dispatchEvent(new CustomEvent(MIDI_OUTPUT_CHANGED));
}

/** Select the clock/transport-out port (null/'' = same as note out). */
export function updateMidiClockOutputPort(selector) {
    midiOutputRouter.selectClockOutput(selector);
    persistAppConfig();
}

/** Select the note/CC input port (null/'' = all inputs). */
export function updateMidiInputPort(selector) {
    midiInputRouter.selectInput(selector);
    persistAppConfig();
}
