/**
 * PRESET SCHEMA — what a preset holds, and the pure math on it.
 *
 * A snapshot is a plain JSON tree of the SOUND: everything that shapes the
 * synthesis (see AppState's taxonomy in config.js) and nothing about how
 * this browser is set up — MIDI routing, recorder modes, pulse/clock
 * outputs, export modes and play state stay out. The same tree is what
 * the JSON view shows and accepts.
 *
 * SPEC describes every leaf: its range, default, and how it interpolates
 * between two presets:
 *   linear     a plain slider level
 *   geometric  a frequency or period (equal steps are equal intervals)
 *   integer    a stepped index (rounded linear)
 *   snap       a choice — takes A below the midpoint, B from it
 *   morph      the waveform: a name, or { a, b, t } — the two names and
 *              how far between them the voices' wave pair is faded
 *
 * Overtone SYSTEMS are not interpolated by their menu index: each voice's
 * resulting FREQUENCY is interpolated (geometrically) and the frame carries
 * the resulting ratio table as a synthetic system — see interpolate().
 *
 * capture() reads AppState; everything else here is pure.
 */

import {
    AppState,
    COMPRESS_A_MAX, COMPRESS_A_MIN, DEFAULT_COMPRESS_A, DEFAULT_FUNDAMENTAL, DEFAULT_MASTER_GAIN,
    DEFAULT_MASTER_SLEW, DEFAULT_STIFFNESS_B, DEFAULT_STRETCH_A, DEFAULT_TUBE_CLOSEDNESS, ENVELOPE_DEFAULTS,
    IR_RING_MAX_SECONDS, spectralSystems, START_HARMONIC_MAX, STIFFNESS_B_MAX,
    STRETCH_A_MAX, STRETCH_A_MIN,
} from '../../config.js';
import { MAX_FILTER_PARTIALS } from '../../audio.js';
import { CONV_FEEDBACK_MAX, DRIVE_MAX, ENV_TIME_MAX, Q_MAX } from '../overtoneSignal/overtoneSignalActions.js';

export const PRESET_VERSION = 1;

/** Index a snapshot's system carries when its ratios are interpolated, not chosen. */
export const INTERPOLATED_SYSTEM = -1;

const num = (min, max, kind = 'linear', def = 0) => ({ min, max, kind, def });
const snap = (def) => ({ kind: 'snap', def });
const morph = (def) => ({ kind: 'morph', def });

const VOICE_SPEC = {
    amplitude: num(0, 1),
    pan: num(-1, 1),
    drive: num(0, DRIVE_MAX),
    filter: {
        multiplier: num(0, MAX_FILTER_PARTIALS, 'integer'),
        q: num(0.0001, Q_MAX, 'linear', 0.707),
    },
    convolution: {
        wet: num(0, 1),
        feedback: num(-CONV_FEEDBACK_MAX, CONV_FEEDBACK_MAX),
        gain: num(0, 1, 'linear', 1),
        tune: num(0, MAX_FILTER_PARTIALS, 'integer'),
        ir: snap(null), // IRManager key (session-only; unresolvable keys apply as none)
    },
    envelope: {
        a: num(0.001, ENV_TIME_MAX.a, 'linear', ENVELOPE_DEFAULTS.a),
        d: num(0.001, ENV_TIME_MAX.d, 'linear', ENVELOPE_DEFAULTS.d),
        s: num(0, 1, 'linear', ENVELOPE_DEFAULTS.s),
        r: num(0.001, ENV_TIME_MAX.r, 'linear', ENVELOPE_DEFAULTS.r),
    },
    gate: {
        mode: num(0, 4, 'snap', 0),
        x: num(0, 1024, 'integer', 1),
        y: num(0, 1024, 'integer', 1),
        seq: snap([]),
    },
    sequencer: {
        shape: snap('square'),
        stretch: num(1 / 64, 64, 'geometric', 1),
        amounts: {
            gain: num(0, 1, 'linear', 1),
            freq: num(-1, 1),
            res: num(0, 1),
            wet: num(0, 1),
            fb: num(0, 1),
        },
    },
};

const SPEC = {
    fundamental: num(0.001, 10000, 'geometric', DEFAULT_FUNDAMENTAL),
    subharmonic: snap(false),
    system: {
        index: num(INTERPOLATED_SYSTEM, spectralSystems.length - 1, 'snap', 0),
        startHarmonic: num(1, START_HARMONIC_MAX, 'snap', 1),
        stiffnessB: num(0, STIFFNESS_B_MAX, 'snap', DEFAULT_STIFFNESS_B),
        tubeClosedness: num(0, 1, 'snap', DEFAULT_TUBE_CLOSEDNESS),
        stretchA: num(STRETCH_A_MIN, STRETCH_A_MAX, 'snap', DEFAULT_STRETCH_A),
        compressA: num(COMPRESS_A_MIN, COMPRESS_A_MAX, 'snap', DEFAULT_COMPRESS_A),
        ratios: snap(null), // only with index INTERPOLATED_SYSTEM
    },
    masterGain: num(0, 1, 'linear', DEFAULT_MASTER_GAIN),
    masterSlew: num(0, 10, 'linear', DEFAULT_MASTER_SLEW),
    waveform: morph('square'),
    source: {
        mode: snap('oscillators'),
        adcDeviceId: snap(null),
        adcChannel: num(0, 63, 'snap', 0),
        // The file itself is session-only; mono/poly and tuning are app config
        soundfile: {
            loop: snap(true),
            fundamental: snap(null), // Hz as a number, or null = detected
            range: snap(null),       // [start, end] fractions, or null = the whole file
        },
    },
    envelopeMode: snap('open'),
    irRingSeconds: num(0, IR_RING_MAX_SECONDS),
    voices: [VOICE_SPEC],
};

const isLeaf = (spec) => 'kind' in spec;

// ---------------------------------------------------------------------
// capture
// ---------------------------------------------------------------------

/** The live sound as a snapshot. */
export function capture() {
    const s = AppState;
    const count = s.harmonicAmplitudes.length;
    const voices = [];
    for (let i = 0; i < count; i++) {
        const gate = s.oscillatorGates[i] || {};
        const seq = s.oscillatorSequencers[i] || {};
        voices.push({
            amplitude: s.harmonicAmplitudes[i] || 0,
            pan: s.oscillatorPans?.[i] || 0,
            drive: s.oscillatorDrives[i] || 0,
            filter: { multiplier: s.oscillatorFilters[i]?.multiplier || 0, q: s.oscillatorFilters[i]?.q ?? 0.707 },
            convolution: { wet: 0, feedback: 0, gain: 1, tune: 0, ir: null, ...s.oscillatorConvolutions[i] },
            envelope: { ...ENVELOPE_DEFAULTS, ...s.oscillatorEnvelopes[i] },
            gate: { mode: gate.mode ?? 0, x: gate.x ?? 1, y: gate.y ?? 1, seq: [...(gate.seq || [])] },
            sequencer: {
                shape: seq.shape || 'square',
                stretch: seq.stretch || 1,
                amounts: { gain: 1, freq: 0, res: 0, wet: 0, fb: 0, ...seq.amounts },
            },
        });
    }
    return {
        fundamental: s.fundamentalFrequency,
        subharmonic: Boolean(s.isSubharmonic),
        system: {
            index: s.currentSystemIndex,
            startHarmonic: s.startHarmonic,
            stiffnessB: s.stiffnessB,
            tubeClosedness: s.tubeClosedness,
            stretchA: s.stretchA,
            compressA: s.compressA,
            ratios: s.currentSystemIndex === INTERPOLATED_SYSTEM ? [...s.currentSystem.ratios] : null,
        },
        masterGain: s.masterGainValue,
        masterSlew: s.masterSlewValue,
        waveform: s.waveformMorph ? { ...s.waveformMorph } : s.currentWaveform || 'sine',
        source: {
            mode: s.sourceMode,
            adcDeviceId: s.adcDeviceId ?? null,
            adcChannel: s.adcChannel || 0,
            soundfile: { loop: s.soundfileLoop, fundamental: s.soundfileFundamental ?? null, range: s.soundfileRange ? [...s.soundfileRange] : null },
        },
        envelopeMode: s.envelopeMode,
        irRingSeconds: s.irRingSeconds || 0,
        voices,
    };
}

// ---------------------------------------------------------------------
// sanitize
// ---------------------------------------------------------------------

/**
 * Coerce anything (a pasted blob, an old preset) into a valid snapshot:
 * unknown keys dropped, missing leaves defaulted, numbers clamped. Never
 * throws; a hopeless input yields the default sound.
 */
export function sanitize(input) {
    const src = input && typeof input === 'object' ? input : {};
    const out = walkSanitize(SPEC, src);
    if (out.system.index !== INTERPOLATED_SYSTEM || !Array.isArray(out.system.ratios)) {
        out.system.ratios = null;
        if (out.system.index < 0) out.system.index = 0;
    } else {
        out.system.ratios = out.system.ratios.map((r) => (Number.isFinite(r) && r > 0 ? r : 1));
    }
    return out;
}

function walkSanitize(spec, value) {
    if (Array.isArray(spec)) {
        const list = Array.isArray(value) ? value : [];
        return list.map((item) => walkSanitize(spec[0], item));
    }
    if (isLeaf(spec)) return sanitizeLeaf(spec, value);
    const src = value && typeof value === 'object' ? value : {};
    const out = {};
    for (const key of Object.keys(spec)) out[key] = walkSanitize(spec[key], src[key]);
    return out;
}

function sanitizeLeaf(spec, value) {
    if ('min' in spec) {
        const v = Number(value);
        if (!Number.isFinite(v)) return spec.def;
        const clamped = Math.min(spec.max, Math.max(spec.min, v));
        return spec.kind === 'integer' ? Math.round(clamped) : clamped;
    }
    const def = spec.def;
    if (spec.kind === 'morph') {
        if (typeof value === 'string') return value;
        if (typeof value?.a === 'string' && typeof value?.b === 'string') {
            const t = Math.min(1, Math.max(0, Number(value.t) || 0));
            return t <= 0 ? value.a : t >= 1 ? value.b : { a: value.a, b: value.b, t };
        }
        return def;
    }
    // Nullable leaves: a key (string), a ratio table (array), a frequency (number), or nothing
    if (def === null) return typeof value === 'string' || Array.isArray(value) || (Number.isFinite(value) && value > 0) ? value : null;
    if (Array.isArray(def)) return Array.isArray(value) ? value.map((v) => (v > 0.5 ? 1 : 0)) : [...def];
    return typeof value === typeof def ? value : def;
}

// ---------------------------------------------------------------------
// interpolate
// ---------------------------------------------------------------------

/**
 * The sound `t` (0-1) of the way from snapshot `a` to snapshot `b`. The
 * endpoints are exact copies. Between them every leaf follows its SPEC
 * kind, and the overtone system is rebuilt from interpolated voice
 * FREQUENCIES: a voice that exists on one side only keeps that side's
 * pitch and fades in or out.
 */
export function interpolate(a, b, t) {
    if (t <= 0) return structuredClone(a);
    if (t >= 1) return structuredClone(b);
    const out = walkLerp(SPEC, a, b, t);

    const ratiosA = systemRatios(a);
    const ratiosB = systemRatios(b);
    const sameSystem = a.subharmonic === b.subharmonic && sameRatios(ratiosA, ratiosB);
    const count = Math.max(ratiosA.length, ratiosB.length);

    // Amplitude: a partial the system doesn't have is silent on that side
    for (let i = 0; i < out.voices.length; i++) {
        const ampA = i < ratiosA.length ? a.voices[i]?.amplitude || 0 : 0;
        const ampB = i < ratiosB.length ? b.voices[i]?.amplitude || 0 : 0;
        out.voices[i].amplitude = lerp(ampA, ampB, t);
    }

    if (!sameSystem) {
        const ratios = [];
        for (let i = 0; i < count; i++) {
            const fa = i < ratiosA.length ? voiceFrequency(a.fundamental, a.subharmonic, ratiosA[i]) : null;
            const fb = i < ratiosB.length ? voiceFrequency(b.fundamental, b.subharmonic, ratiosB[i]) : null;
            const f = fa === null ? fb : fb === null ? fa : geometric(fa, fb, t);
            ratios.push(out.subharmonic ? out.fundamental / f : f / out.fundamental);
        }
        out.system.index = INTERPOLATED_SYSTEM;
        out.system.ratios = ratios;
    }
    return out;
}

function walkLerp(spec, a, b, t) {
    if (Array.isArray(spec)) {
        const n = Math.max(a?.length || 0, b?.length || 0);
        const out = [];
        for (let i = 0; i < n; i++) out.push(walkLerp(spec[0], a?.[i], b?.[i], t));
        return out;
    }
    if (isLeaf(spec)) return lerpLeaf(spec, a, b, t);
    const out = {};
    for (const key of Object.keys(spec)) out[key] = walkLerp(spec[key], a?.[key], b?.[key], t);
    return out;
}

function lerpLeaf(spec, a, b, t) {
    const va = a === undefined ? spec.def : a;
    const vb = b === undefined ? spec.def : b;
    switch (spec.kind) {
        case 'linear': return lerp(va, vb, t);
        case 'geometric': return geometric(va, vb, t);
        case 'integer': return Math.round(lerp(va, vb, t));
        case 'morph': {
            const a = waveformName(va);
            const b = waveformName(vb);
            return a === b ? a : { a, b, t };
        }
        default: return structuredClone(t < 0.5 ? va : vb);
    }
}

/** A waveform leaf's single name: itself, or the nearer end of a morph. */
export function waveformName(waveform) {
    if (typeof waveform === 'string') return waveform;
    return waveform.t < 0.5 ? waveform.a : waveform.b;
}

const lerp = (a, b, t) => a + (b - a) * t;

function geometric(a, b, t) {
    if (!(a > 0) || !(b > 0)) return lerp(a, b, t);
    return a * Math.pow(b / a, t);
}

function voiceFrequency(fundamental, subharmonic, ratio) {
    return subharmonic ? fundamental / ratio : fundamental * ratio;
}

/** A snapshot's ratio table: its own when interpolated, else the chosen system's. */
export function systemRatios(snapshot) {
    const { index, ratios, startHarmonic, ...options } = snapshot.system;
    if (index === INTERPOLATED_SYSTEM && ratios) return ratios;
    const base = spectralSystems[index] || spectralSystems[0];
    const system = base.generate ? { ...base, ...base.generate(startHarmonic, options) } : base;
    return system.ratios;
}

function sameRatios(a, b) {
    return a.length === b.length && a.every((r, i) => Math.abs(r - b[i]) < 1e-9);
}

/** Structural equality of two snapshots. */
export function snapshotsEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
