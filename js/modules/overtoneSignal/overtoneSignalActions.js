import { AppState, midiConfig } from "../../config.js";
import { updateHarmonicGate, updateHarmonicFilter, updateHarmonicDrive, updateHarmonicPan, updateHarmonicPulse, updateHarmonicSequencer, MAX_FILTER_PARTIALS } from "../../audio.js";
import { getVoicePan } from "../../utils.js";
import { OVERTONE_SIGNAL_CHANGED } from "../../events.js";

/**
 * Per-overtone signal-chain state (cycle gate, lowpass, pan).
 * Single write path shared by the modal UI; the OSC client listens for
 * OVERTONE_SIGNAL_CHANGED to sync Live params upstream. (Inbound OSC writes
 * state directly and does not emit this event, so there is no echo.)
 */
// Resonance ceiling shared by the modal dial, the drawbar filter view,
// and the OSC clamp — one number, three surfaces.
export const Q_MAX = 40;

// Overdrive ceiling (500%), shared the same way. 1 = full tanh saturation,
// beyond that the curve hardens toward a clipper.
export const DRIVE_MAX = 5;

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

    /** Overdrive amount 0-DRIVE_MAX (0 = clean), applied before the lowpass. */
    getDrive(index) {
        return AppState.oscillatorDrives[index] || 0;
    },

    setDrive(index, amount) {
        AppState.oscillatorDrives[index] = Math.max(0, Math.min(DRIVE_MAX, Number(amount) || 0));
        updateHarmonicDrive(index);
        this._changed(index, 'drive');
    },

    getSequencer(index) {
        const stored = AppState.oscillatorSequencers[index] || {};
        return {
            shape: stored.shape || 'square',
            stretch: stored.stretch || 1,
            amounts: { gain: 1, freq: 0, res: 0, ...stored.amounts },
        };
    },

    /** Shape period in cycles (1/64 – 64, powers of two from the UI). */
    setSequencerStretch(index, stretch) {
        const seq = this.getSequencer(index);
        AppState.oscillatorSequencers[index] = {
            ...seq,
            stretch: Math.max(1 / 64, Math.min(64, stretch)),
        };
        updateHarmonicSequencer(index);
        this._changed(index, 'seq');
    },

    /** Set the cycle contour waveform (same names as the oscillator menu). */
    setSequencerShape(index, shape) {
        const seq = this.getSequencer(index);
        AppState.oscillatorSequencers[index] = { ...seq, shape };
        updateHarmonicSequencer(index);
        this._changed(index, 'seq');
    },

    /** Set a modulation amount: target 'gain' | 'freq' | 'res'. */
    setSequencerAmount(index, target, value) {
        const seq = this.getSequencer(index);
        const clamped = target === 'freq'
            ? Math.max(-1, Math.min(1, value))
            : Math.max(0, Math.min(1, value));
        AppState.oscillatorSequencers[index] = {
            ...seq,
            amounts: { ...seq.amounts, [target]: clamped },
        };
        updateHarmonicSequencer(index);
        this._changed(index, 'seq');
    },

    getPulseOut(index) {
        // Voices without an explicit setting inherit the global defaults
        // (both on); the global toggles bulk-overwrite per-voice values,
        // so the two stay in sync
        return {
            midi: midiConfig.pulseMidiEnabled,
            osc: midiConfig.pulseOscEnabled,
            ...AppState.oscillatorPulseOuts[index],
        };
    },

    /** Merge pulse-output flags for a voice: { midi?, osc? }. */
    setPulseOut(index, flags) {
        AppState.oscillatorPulseOuts[index] = { ...this.getPulseOut(index), ...flags };
        updateHarmonicPulse(index);
        this._changed(index, 'pulse');
    },

    /**
     * Assign a voice as the MIDI clock source (exclusive), or clear with
     * null. The previous clock voice's pulse enable is re-evaluated.
     */
    setMidiClockVoice(index) {
        const previous = AppState.midiClockVoice;
        AppState.midiClockVoice = index;
        if (previous !== null && previous !== index) updateHarmonicPulse(previous);
        if (index !== null) updateHarmonicPulse(index);
        this._changed(index ?? previous ?? 0, 'clock');
    },

    setPan(index, pan) {
        if (!Array.isArray(AppState.oscillatorPans)) AppState.oscillatorPans = [];
        AppState.oscillatorPans[index] = Math.max(-1, Math.min(1, pan));
        updateHarmonicPan(index);
        this._changed(index, 'pan');
    },

    // ---------------------------------------------------------------
    // Bulk operations (the drawbar section's view-scoped reset/randomize)
    // ---------------------------------------------------------------

    _voiceCount() {
        return AppState.currentSystem.ratios.length;
    },

    /** Filters to neutral: open (multiplier 0), default resonance, no drive. */
    resetFilters() {
        for (let i = 0; i < this._voiceCount(); i++) {
            this.setFilter(i, { multiplier: 0, q: 0.707 });
            this.setDrive(i, 0);
        }
    },

    /** Random cutoff partial per voice; resonance (the aux dial) untouched. */
    randomizeFilters() {
        for (let i = 0; i < this._voiceCount(); i++) {
            this.setFilter(i, {
                ...this.getFilter(i),
                multiplier: 1 + Math.floor(Math.random() * MAX_FILTER_PARTIALS),
            });
        }
    },

    /** Gates off, pattern params back to defaults. */
    resetGates() {
        for (let i = 0; i < this._voiceCount(); i++) {
            this.setGate(i, { mode: 0, x: 1, y: 1, seq: [] });
        }
    },

    /**
     * Random audible rhythm per voice: alternating or euclidean mode with
     * small musical x/y values (randomizing x/y under mode-off would be
     * inaudible, which reads as a broken button).
     */
    randomizeGates() {
        for (let i = 0; i < this._voiceCount(); i++) {
            this.setGate(i, {
                mode: 1 + Math.floor(Math.random() * 2),
                x: 1 + Math.floor(Math.random() * 8),
                y: 2 + Math.floor(Math.random() * 15),
                seq: [],
            });
        }
    },

    _changed(index, kind) {
        document.dispatchEvent(new CustomEvent(OVERTONE_SIGNAL_CHANGED, {
            detail: { index, kind }
        }));
    }
};
