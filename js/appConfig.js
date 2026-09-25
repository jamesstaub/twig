/**
 * APP CONFIG — the user's local application configuration, kept apart
 * from the synthesizer state:
 *
 *   - AppState (config.js) is the SOUND: audio params, overtone settings,
 *     waveforms, sources, convolution, play state. It is bridged over
 *     OSC/WebSocket so the Max patch can persist it in Live params, and
 *     restored from the bridge cache (GET /state) at boot.
 *   - appConfig (this file) is how THIS browser is set up: MIDI routing
 *     and mappings, recorder modes, the preset crossfader's A/B
 *     assignment, how sound files play. It is not part of the patch — it
 *     lives in localStorage and survives reloads without the bridge.
 *
 * loadAppConfig() applies the stored blob at boot BEFORE the bridge
 * bootstrap, so the few values that are also bridged (e.g. the note-out
 * port, /twig/midiout) get overridden by the bridge when it has them.
 * Every config action funnels through persistAppConfig() (debounced;
 * flushed on unload). Only keys present in the defaults are restored, so
 * stale blobs can't inject unknown fields.
 */

/** Per-overtone MIDI ranges (trigger notes, CCs, pulse notes) span this many. */
export const MIDI_RANGE_SPAN = 12;

export const midiConfig = {
    // --- Ports ---
    // One input port for everything inbound; null = listen on every input
    inputId: null,
    // One output port for note out; null = first available
    outputId: null,
    // Port for MIDI clock ticks and transport start/stop; null = same port
    // as note out. Clock messages are system-realtime — no channel exists.
    clockOutputId: null,

    // Every inbound concern has its own channel (1-16). The defaults keep an
    // in/out loop on one port (e.g. IAC) from feeding back: pulses leave on
    // channel 2 from note 13, above the trigger range, and the fundamental
    // listens on channel 1.

    // --- Fundamental note in: the whole note range sets the fundamental ---
    fundamentalChannel: 1,
    fundamentalTranspose: 0, // octaves added to the incoming note

    // --- ADSR trigger note in: start..start+11 gate overtones 1..12 ---
    triggerChannel: 2,
    triggerNoteStart: 1,

    // --- CC in: each start..start+11 drives overtones 1..12 ---
    ccChannel: 1,
    gainCCStart: 20,
    cutoffCCStart: 40,
    convWetCCStart: 102,
    // One CC sweeps the preset crossfader (A → B over its 128 values)
    crossfaderCC: 1,

    // --- Note out (overtone LF pulse blips): start..start+11 ---
    pulseChannel: 2,
    pulseNoteStart: 13,
    // Global master switches for the two pulse paths
    pulseMidiEnabled: true,
    pulseOscEnabled: true,
};

/**
 * Recorder configuration (the runtime status/selection/transport live in
 * AppState.recorder). audioMode: mono | stereo | multitrack (one mono
 * channel per overtone); midiMode: single (one track/channel) | multi
 * (a track + channel per overtone); tempoMode: fixed | map (see
 * midiFile.js); lengthMode: manual | loop (see recordingActions).
 */
export const recorderConfig = {
    audioMode: 'stereo',
    midiMode: 'single',
    tempoMode: 'fixed',
    lengthMode: 'manual',
};

/**
 * Preset interpolation: the two banks (0-31, or null) the crossfader runs
 * between and where it stands (0-127). The banks themselves are in
 * presetStore.js.
 */
export const presetConfig = {
    slotA: null,
    slotB: null,
    position: 0,
};

/**
 * Sound-file playback: 'poly' gives each voice its own player (tuned to
 * its overtone when `tune` is on), 'mono' plays the file once for the
 * whole bank (every voice filtering the same signal, like the ADC).
 */
export const soundfileConfig = {
    mode: 'poly',
    tune: true,
};

const STORAGE_KEY = 'twig.appConfig';

function write() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            midi: { ...midiConfig },
            recorder: { ...recorderConfig },
            presets: { ...presetConfig },
            soundfile: { ...soundfileConfig },
        }));
    } catch {
        // Storage unavailable (blocked webview, private mode) — config
        // simply stays session-only
    }
}

let pending = null;

/** Debounced save; call after any config mutation. */
export function persistAppConfig() {
    if (pending) return;
    pending = setTimeout(() => {
        pending = null;
        write();
    }, 250);
}

/** Restore the stored config onto the live objects. Call once at boot. */
export function loadAppConfig() {
    let saved;
    try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
        return;
    }
    if (!saved || typeof saved !== 'object') return;
    applyKnown(midiConfig, saved.midi);
    applyKnown(recorderConfig, saved.recorder);
    applyKnown(presetConfig, saved.presets);
    applyKnown(soundfileConfig, saved.soundfile);
}

function applyKnown(target, source) {
    if (!source || typeof source !== 'object') return;
    for (const key of Object.keys(target)) {
        if (!(key in source)) continue;
        const value = source[key];
        if (Array.isArray(target[key]) && !Array.isArray(value)) continue;
        target[key] = value;
    }
}

// A change made just before a reload would sit in the debounce window
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        if (pending) {
            clearTimeout(pending);
            pending = null;
            write();
        }
    });
}
