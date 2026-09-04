/**
 * APP CONFIG — the user's local application configuration, kept apart
 * from the synthesizer state:
 *
 *   - AppState (config.js) is the SOUND: audio params, overtone settings,
 *     waveforms, sources, convolution, play state. It is bridged over
 *     OSC/WebSocket so the Max patch can persist it in Live params, and
 *     restored from the bridge cache (GET /state) at boot.
 *   - appConfig (this file) is how THIS browser is set up: MIDI routing
 *     and mappings, recorder modes. It is not part of the patch — it
 *     lives in localStorage and survives reloads without the bridge.
 *
 * loadAppConfig() applies the stored blob at boot BEFORE the bridge
 * bootstrap, so the few values that are also bridged (e.g. the note-out
 * port, /twig/midiout) get overridden by the bridge when it has them.
 * Every config action funnels through persistAppConfig() (debounced;
 * flushed on unload). Only keys present in the defaults are restored, so
 * stale blobs can't inject unknown fields.
 */

export const midiConfig = {
    // --- Note/CC in ---
    inputChannel: 1, // MIDI channel 1 by default (1-16)
    // Input port id; null = listen on every input
    inputId: null,
    // Incoming notes below this are ignored. Default 13 keeps the pulse
    // outputs' own notes (1..12) from feeding back into the fundamental
    // when in and out share a port (e.g. an IAC loop).
    inputNoteMin: 13,
    drawbarsCC: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], // Default CCs for 12 drawbars

    // --- Note out (pulse blips) ---
    outputChannel: 1, // channel for pulse note blips (1-16)
    // Web MIDI output port id; null = first available
    outputId: null,

    // --- Clock/transport out ---
    // Port for MIDI clock ticks and transport start/stop; null = same port
    // as note out. Clock messages are system-realtime — no channel exists.
    clockOutputId: null,

    // Pulse outputs: note per overtone (linear 1..N by default, reassignable
    // in the MIDI modal) and global master switches for the two pulse paths
    pulseNotes: Array.from({ length: 16 }, (_, i) => i + 1),
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

const STORAGE_KEY = 'twig.appConfig';

function write() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            midi: { ...midiConfig },
            recorder: { ...recorderConfig },
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
