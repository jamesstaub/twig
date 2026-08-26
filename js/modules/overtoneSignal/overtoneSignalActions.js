import { AppState, ENVELOPE_DEFAULTS, midiConfig } from "../../config.js";
import { updateHarmonicGate, updateHarmonicFilter, updateHarmonicDrive, updateHarmonicConvolution, updateHarmonicPan, updateHarmonicPulse, updateHarmonicSequencer, updateAllHarmonicEnvelopeModes, MAX_FILTER_PARTIALS } from "../../audio.js";
import { getVoicePan } from "../../utils.js";
import { irManager } from "../../dsp/IRManager.js";
import { OVERTONE_SIGNAL_CHANGED, ENVELOPE_MODE_CHANGED } from "../../events.js";

/**
 * Per-overtone signal-chain state (cycle gate, lowpass, pan).
 * Single write path shared by the modal UI; the OSC client listens for
 * OVERTONE_SIGNAL_CHANGED to sync Live params upstream. (Inbound OSC writes
 * state directly and does not emit this event, so there is no echo.)
 */
// Resonance ceiling shared by the modal dial, the drawbar filter view,
// and the OSC clamp — one number, three surfaces.
export const Q_MAX = 40;

// Overdrive ceiling (250%), shared the same way. 1 = full tanh saturation,
// beyond that the curve hardens toward a clipper.
export const DRIVE_MAX = 2.5;

// ADSR time ceilings in seconds (sustain is 0-1), shared by the modal
// dials and the OSC clamp.
export const ENV_TIME_MAX = { a: 2, d: 2, r: 5 };

// Convolution feedback ceiling (a loop gain of 1 would run away), shared
// by the convolution view dial and the OSC clamp.
export const CONV_FEEDBACK_MAX = 0.99;

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

    /**
     * Convolution send: { wet 0-1, feedback 0-CONV_FEEDBACK_MAX, gain -1..1,
     * ir: IRManager key | null, tune: 0 (loop period = IR duration) or a
     * 1-based series partial the feedback comb is tuned to }. Each overtone
     * picks its own IR.
     */
    getConvolution(index) {
        return { wet: 0, feedback: 0, gain: 1, ir: null, tune: 0, ...AppState.oscillatorConvolutions[index] };
    },

    setConvolution(index, patch) {
        const merged = { ...this.getConvolution(index), ...patch };
        AppState.oscillatorConvolutions[index] = {
            wet: Math.max(0, Math.min(1, Number(merged.wet) || 0)),
            feedback: Math.max(0, Math.min(CONV_FEEDBACK_MAX, Number(merged.feedback) || 0)),
            gain: Math.max(-1, Math.min(1, isFinite(Number(merged.gain)) ? Number(merged.gain) : 1)),
            ir: merged.ir && irManager.get(merged.ir) ? merged.ir : null,
            tune: Math.max(0, Math.min(MAX_FILTER_PARTIALS, Math.round(Number(merged.tune) || 0))),
        };
        updateHarmonicConvolution(index);
        this._changed(index, 'conv');
    },

    /** Per-overtone ADSR: { a, d, r } seconds, { s } 0-1. */
    getEnvelope(index) {
        return { ...ENVELOPE_DEFAULTS, ...AppState.oscillatorEnvelopes[index] };
    },

    /**
     * Merge ADSR fields for a voice. No live-audio call — values are read
     * at the next attack/release trigger.
     */
    setEnvelope(index, env) {
        const merged = { ...this.getEnvelope(index), ...env };
        const time = (v, max) => Math.max(0.001, Math.min(max, Number(v) || 0));
        AppState.oscillatorEnvelopes[index] = {
            a: time(merged.a, ENV_TIME_MAX.a),
            d: time(merged.d, ENV_TIME_MAX.d),
            s: Math.max(0, Math.min(1, Number(merged.s) || 0)),
            r: time(merged.r, ENV_TIME_MAX.r),
        };
        this._changed(index, 'envelope');
    },

    /** Global envelope mode: 'open' (default) or 'adsr'. */
    getEnvelopeMode() {
        return AppState.envelopeMode;
    },

    setEnvelopeMode(mode) {
        const next = mode === 'adsr' ? 'adsr' : 'open';
        if (next === AppState.envelopeMode) return;
        AppState.envelopeMode = next;
        updateAllHarmonicEnvelopeModes();
        document.dispatchEvent(new CustomEvent(ENVELOPE_MODE_CHANGED));
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

    /** Convolution sends fully dry, feedback off, gain unity; IRs kept. */
    resetConvolutions() {
        for (let i = 0; i < this._voiceCount(); i++) {
            this.setConvolution(i, { wet: 0, feedback: 0, gain: 1, tune: 0 });
        }
    },

    /** Random wet/dry per voice; feedback, gain, and IR (the aux controls) untouched. */
    randomizeConvolutions() {
        for (let i = 0; i < this._voiceCount(); i++) {
            this.setConvolution(i, { wet: Math.round(Math.random() * 100) / 100 });
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
