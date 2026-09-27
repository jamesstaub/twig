import { AppState } from '../../config.js';
import { contourFn } from '../../dsp/gate/contours.js';
import { patternById, patternPeriod } from '../../dsp/gate/patterns.js';
import { themeColor } from '../../theme.js';
import { getWaveValue } from '../tonewheel/tonewheelActions.js';
import { audioGain } from '../../dsp/gate/modTargets.js';
import { OvertoneSignalActions } from './overtoneSignalActions.js';

/**
 * Shared sequence-preview rendering: the pattern × shape × stretch control
 * signal a voice's sequencer produces, drawn in the app's viz style.
 * Used by the inspector, the drawbar strip's shape panel, plus PNG icon
 * generation for waveform steppers.
 */

/**
 * Unipolar (0-1) cycle contour for a shape name — the same definition the
 * worklet plays (js/dsp/gate/contours.js); null for a custom waveform,
 * which is sampled separately and min-max normalized like the table the
 * worklet receives.
 */
export function shapeContour(shapeName, phase) {
    const fn = contourFn(shapeName);
    return fn ? fn(phase) : null;
}

/** Sampler covering built-ins and custom waves (0-1, min-max normalized). */
export function shapeSampler(shapeName, resolution = 256) {
    const builtIn = contourFn(shapeName);
    if (builtIn) return builtIn;
    const coeffs = AppState.customWaveCoefficients?.[shapeName];
    if (!coeffs) return () => 1;
    const raw = [];
    for (let i = 0; i < resolution; i++) {
        raw.push(getWaveValue(shapeName, (i / resolution) * 2 * Math.PI, coeffs));
    }
    const min = Math.min(...raw);
    const span = (Math.max(...raw) - min) || 1;
    const table = raw.map((v) => (v - min) / span);
    return (phase) => {
        const pos = phase * table.length;
        const i0 = Math.floor(pos) % table.length;
        const i1 = (i0 + 1) % table.length;
        return table[i0] + (table[i1] - table[i0]) * (pos - i0);
    };
}

/** What the patterns decide from (js/dsp/gate/patterns.js). */
function patternContext(gate) {
    return { x: gate.x, y: gate.y, steps: gate.seq || null, cache: {} };
}

/**
 * Pattern activity per cycle — the worklet's own `active`, so the drawing
 * and the sound can't disagree. A random pattern is drawn all-active:
 * randomness can't be depicted.
 */
export function previewPattern(gate, cycles) {
    const pattern = patternById(gate.mode);
    if (pattern.bypass || pattern.random) return Array.from({ length: cycles }, () => true);
    const ctx = patternContext(gate);
    return Array.from({ length: cycles }, (_, c) => Boolean(pattern.active(c, ctx)));
}

/** Cycles the preview spans: the full pattern period and the full shape period. */
export function previewCycleCount(gate, stretch) {
    const period = patternPeriod(gate.mode, patternContext(gate));
    return Math.min(32, Math.max(period, Math.ceil(stretch), 1));
}

/**
 * The modulation layers over the sequence: each target's depth turns the
 * 0-1 signal into the curve the worklet sends it (modTargets.js, in
 * normalized units — a fraction of the target's span; the filter's depth
 * is bipolar, so its curve sits around the middle). Drawn only while the
 * depth is non-zero, each in its --mod-* color, which the Modulation
 * section's rows share.
 */
export const MOD_LAYERS = [
    { target: 'gain', color: '--mod-gain', curve: (s, a) => audioGain(s, a) },
    { target: 'freq', color: '--mod-freq', curve: (s, a) => 0.5 + 0.5 * a * s },
    { target: 'res', color: '--mod-res', curve: (s, a) => a * s },
    { target: 'wet', color: '--mod-wet', curve: (s, a) => a * s },
    { target: 'fb', color: '--mod-fb', curve: (s, a) => a * s },
];

/**
 * Draw the full sequence — pattern × shape × stretch — for a voice, exactly
 * the control signal the worklet produces (sans declick), with its
 * modulation layers over it, into a `w` × `h` box of `ctx`'s current
 * coordinate space (the caller owns the canvas and its DPR transform).
 */
export function drawSequencePreview(ctx, index, w, h) {
    const gate = OvertoneSignalActions.getGate(index);
    const seq = OvertoneSignalActions.getSequencer(index);
    const pad = 4;

    ctx.fillStyle = themeColor('--viz-bg');
    ctx.fillRect(0, 0, w, h);

    const cycles = previewCycleCount(gate, seq.stretch);
    const active = previewPattern(gate, cycles);

    // Cycle boundaries as faint gridlines
    ctx.strokeStyle = themeColor('--viz-grid');
    ctx.lineWidth = 1;
    for (let c = 1; c < cycles; c++) {
        const x = Math.round((c / cycles) * w) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    const shapeAt = shapeSampler(seq.shape);
    const signal = new Float32Array(w + 1);
    for (let i = 0; i <= w; i++) {
        const t = (i / w) * cycles;
        const c = Math.min(cycles - 1, Math.floor(t));
        const phase = t - c;
        signal[i] = gate.mode === 0
            ? 1
            : (active[c] ? shapeAt(((c + phase) / seq.stretch) % 1) : 0);
    }

    const plot = (valueAt, color, width) => {
        ctx.strokeStyle = themeColor(color);
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let i = 0; i <= w; i++) {
            const y = pad + (1 - Math.max(0, Math.min(1, valueAt(i)))) * (h - 2 * pad);
            if (i === 0) ctx.moveTo(i, y);
            else ctx.lineTo(i, y);
        }
        ctx.stroke();
    };

    plot((i) => signal[i], '--viz-trace', 2);
    for (const { target, color, curve } of MOD_LAYERS) {
        const amount = seq.amounts[target] || 0;
        if (amount === 0) continue;
        plot((i) => curve(signal[i], amount), color, 1.25);
    }
}

// ---------------------------------------------------------------
// Waveform icons (PNG, canvas-exported) for compact selectors
// ---------------------------------------------------------------

const iconCache = new Map();

/** A waveform's 0-1 contour tiled `cycles` times across the canvas. */
export function drawShapeContour(canvas, shapeName, cycles = 1) {
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    ctx.fillStyle = themeColor('--viz-bg');
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = themeColor('--viz-grid');
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    const sample = shapeSampler(shapeName);
    ctx.strokeStyle = themeColor('--viz-trace');
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= w; i++) {
        const s = sample(((i / w) * cycles) % 1);
        const y = 3 + (1 - s) * (h - 6);
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
    }
    ctx.stroke();
}

/**
 * Small PNG icon (data URL) of a waveform's cycle contour, rendered from
 * a canvas at 2× and cached per shape/size/color.
 */
export function shapeIconDataURL(shapeName, { width = 16, height = 10, color = '--text-secondary' } = {}) {
    const key = `${shapeName}|${width}x${height}|${color}`;
    if (iconCache.has(key)) return iconCache.get(key);

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const shapeAt = shapeSampler(shapeName, 128);
    ctx.strokeStyle = themeColor(color);
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= width; i++) {
        const s = shapeAt(i / width);
        const y = 1 + (1 - s) * (height - 2);
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
    }
    ctx.stroke();

    const url = canvas.toDataURL('image/png');
    iconCache.set(key, url);
    return url;
}

/** Custom waves change; drop cached icons so they re-render. */
export function clearShapeIconCache() {
    iconCache.clear();
}
