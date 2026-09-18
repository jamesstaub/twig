import { AppState } from '../../config.js';
import { getVoicePan } from '../../utils.js';
import { MAX_FILTER_PARTIALS } from '../../audio.js';
import { DrawbarsActions } from './drawbarsActions.js';
import {
    OvertoneSignalActions, Q_MAX, DRIVE_MAX, CONV_FEEDBACK_MAX, ENV_TIME_MAX,
} from '../overtoneSignal/overtoneSignalActions.js';

/**
 * The drawbar strip's parameter families — one per parameter surface
 * (Gain, Filter, Convolution, ADSR). Pure descriptors, no DOM: what each
 * per-overtone parameter is called, its range, how it reads and writes
 * (through the actions layer), and how a value is shown.
 *
 * The strip shows a family's FIRST parameter on the bars and the rest as
 * dials under each bar — or, when the strip is too short for dials, as
 * tabs that put the chosen parameter on the bars instead. Every
 * parameter is bar-able, so the same descriptor serves both.
 *
 * `format(index, value)` may depend on the voice (the cutoff shows the
 * series partial it sits on). `set` writes the STORED parameter, never a
 * derived output, so linked and shaped writes copy positions across
 * voices correctly (see linkAll.js).
 */

const pct = (v) => `${Math.round(v * 100)}%`;
const seconds = (v) => (v >= 1 ? `${v.toFixed(2)} s` : `${Math.round(v * 1000)} ms`);

/** The current system's label for 1-based series step `n` (past the table: +1, +2 …). */
function partialLabel(n) {
    const labels = AppState.currentSystem.labels;
    return n <= labels.length ? labels[n - 1] : `+${n - labels.length}`;
}

const gain = {
    key: 'gain', label: 'gain', min: 0, max: 1, step: 0.01,
    get: (i) => AppState.harmonicAmplitudes?.[i] ?? 0,
    set: (i, v) => DrawbarsActions.setDrawbar(i, v),
    format: (i, v) => pct(v),
};

const pan = {
    key: 'pan', label: 'pan', min: -1, max: 1, step: 0.01,
    get: (i) => getVoicePan(i),
    set: (i, v) => OvertoneSignalActions.setPan(i, v),
    format: (i, v) => (Math.abs(v) < 0.005 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`),
};

// The cutoff is an overtone-series selector: a partial (of the current
// system) of the voice's audible base; 0 = open
const cutoff = {
    key: 'cutoff', label: 'cutoff', min: 0, max: MAX_FILTER_PARTIALS, step: 1,
    get: (i) => OvertoneSignalActions.getFilter(i).multiplier,
    set: (i, v) => OvertoneSignalActions.setFilter(i, { ...OvertoneSignalActions.getFilter(i), multiplier: Math.round(v) }),
    format: (i, v) => (Math.round(v) === 0 ? 'open' : partialLabel(Math.round(v))),
};

const resonance = {
    key: 'resonance', label: 'res', min: 0.1, max: Q_MAX, step: 0.05, color: '--accent-negative',
    get: (i) => OvertoneSignalActions.getFilter(i).q,
    set: (i, v) => OvertoneSignalActions.setFilter(i, { ...OvertoneSignalActions.getFilter(i), q: v }),
    format: (i, v) => `Q ${v.toFixed(2)}`,
};

const overdrive = {
    key: 'overdrive', label: 'drive', min: 0, max: DRIVE_MAX, step: 0.05, color: '--accent-positive',
    get: (i) => OvertoneSignalActions.getDrive(i),
    set: (i, v) => OvertoneSignalActions.setDrive(i, v),
    format: (i, v) => (v > 0 ? pct(v) : 'clean'),
};

const wet = {
    key: 'wet', label: 'wet', min: 0, max: 1, step: 0.01,
    get: (i) => OvertoneSignalActions.getConvolution(i).wet,
    set: (i, v) => OvertoneSignalActions.setConvolution(i, { wet: v }),
    format: (i, v) => pct(v),
};

const feedback = {
    key: 'feedback', label: 'feedback', min: -CONV_FEEDBACK_MAX, max: CONV_FEEDBACK_MAX, step: 0.01, color: '--accent-negative',
    get: (i) => OvertoneSignalActions.getConvolution(i).feedback,
    set: (i, v) => OvertoneSignalActions.setConvolution(i, { feedback: v }),
    format: (i, v) => `fb ${v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 100)}`,
};

const convGain = {
    key: 'convGain', label: 'gain', min: 0, max: 1, step: 0.01, color: '--accent-positive',
    get: (i) => OvertoneSignalActions.getConvolution(i).gain,
    set: (i, v) => OvertoneSignalActions.setConvolution(i, { gain: v }),
    format: (i, v) => pct(v),
};

// Feedback comb tuning: 0 = the IR's own period, else a series partial
// of the voice (the cutoff's convention)
const tune = {
    key: 'tune', label: 'tune', min: 0, max: MAX_FILTER_PARTIALS, step: 1,
    get: (i) => OvertoneSignalActions.getConvolution(i).tune,
    set: (i, v) => OvertoneSignalActions.setConvolution(i, { tune: Math.round(v) }),
    format: (i, v) => (Math.round(v) === 0 ? 'period' : partialLabel(Math.round(v))),
};

const envTime = (key, label, max) => ({
    key, label, min: 0.001, max, step: 0.001,
    get: (i) => OvertoneSignalActions.getEnvelope(i)[key],
    set: (i, v) => OvertoneSignalActions.setEnvelope(i, { [key]: v }),
    format: (i, v) => seconds(v),
});

const sustain = {
    key: 's', label: 'sustain', min: 0, max: 1, step: 0.01, color: '--accent-primary',
    get: (i) => OvertoneSignalActions.getEnvelope(i).s,
    set: (i, v) => OvertoneSignalActions.setEnvelope(i, { s: v }),
    format: (i, v) => pct(v),
};

export const FAMILIES = {
    gain: {
        label: 'Gain',
        params: [gain, pan],
        reset: () => DrawbarsActions.reset(),
        randomize: () => DrawbarsActions.randomize(),
    },
    filter: {
        label: 'Filter',
        params: [cutoff, resonance, overdrive],
        reset: () => OvertoneSignalActions.resetFilters(),
        randomize: () => OvertoneSignalActions.randomizeFilters(),
    },
    convolution: {
        label: 'Convolution',
        params: [wet, feedback, convGain, tune],
        // Per-column IR picker in the aux row; a column without an IR is
        // bypassed by the engine, so its controls read as inert
        irStepper: true,
        enabled: (i) => Boolean(OvertoneSignalActions.getConvolution(i).ir),
        reset: () => OvertoneSignalActions.resetConvolutions(),
        randomize: () => OvertoneSignalActions.randomizeConvolutions(),
    },
    adsr: {
        label: 'ADSR',
        params: [sustain, envTime('a', 'attack', ENV_TIME_MAX.a), envTime('d', 'decay', ENV_TIME_MAX.d), envTime('r', 'release', ENV_TIME_MAX.r)],
        reset: () => OvertoneSignalActions.resetEnvelopes(),
        randomize: () => OvertoneSignalActions.randomizeEnvelopes(),
    },
};

export const FAMILY_ORDER = ['gain', 'filter', 'convolution', 'adsr'];

/** Snap `v` to the parameter's step (and range), avoiding float dust. */
export function quantize(param, v) {
    const clamped = Math.max(param.min, Math.min(param.max, v));
    return Number((Math.round(clamped / param.step) * param.step).toFixed(6));
}
