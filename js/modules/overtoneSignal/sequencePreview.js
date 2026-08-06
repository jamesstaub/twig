import { AppState } from '../../config.js';
import { themeColor } from '../../theme.js';
import { getWaveValue } from '../tonewheel/tonewheelActions.js';
import { OvertoneSignalActions } from './overtoneSignalActions.js';

/**
 * Shared sequence-preview rendering: the pattern × shape × stretch control
 * signal a voice's sequencer produces, drawn in the app's viz style.
 * Used by the Overtone Settings modal and the drawbar sequence view's
 * floating value tip, plus PNG icon generation for waveform selectors.
 */

/**
 * Unipolar (0-1) cycle contour for a shape name — mirrors shapeValue() in
 * gate-processor.js. Custom waveforms are min-max normalized like the
 * table the worklet receives.
 */
export function shapeContour(shapeName, phase) {
    switch (shapeName) {
        case 'sine': return (1 - Math.cos(2 * Math.PI * phase)) / 2;
        case 'triangle': return 1 - Math.abs(2 * phase - 1);
        case 'sawtooth': return 1 - phase;
        case 'square': return 1;
        default: return null; // custom — sampled separately
    }
}

/** Sampler covering built-ins and custom waves (0-1, min-max normalized). */
export function shapeSampler(shapeName, resolution = 256) {
    if (shapeContour(shapeName, 0) !== null) {
        return (phase) => shapeContour(shapeName, phase);
    }
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

/** Pattern activity for one cycle — mirrors gateForCycle in the worklet
 *  (probability is depicted as all-active; randomness can't be drawn). */
export function previewPattern(gate, cycles) {
    switch (gate.mode) {
        case 1: {
            const period = Math.max(1, Math.round(gate.x) + Math.round(gate.y));
            return Array.from({ length: cycles }, (_, c) => (c % period) < Math.round(gate.x));
        }
        case 2: {
            const steps = Math.max(1, Math.round(gate.y));
            const pulses = Math.min(Math.round(gate.x), steps);
            const pat = [];
            let bucket = 0;
            for (let i = 0; i < steps; i++) {
                bucket += pulses;
                if (bucket >= steps) { bucket -= steps; pat.push(true); } else pat.push(false);
            }
            return Array.from({ length: cycles }, (_, c) => pat[c % steps]);
        }
        case 4: {
            const seq = gate.seq || [];
            if (!seq.length) return Array.from({ length: cycles }, () => true);
            return Array.from({ length: cycles }, (_, c) => seq[c % seq.length] > 0.5);
        }
        default: // off and probability
            return Array.from({ length: cycles }, () => true);
    }
}

/** Cycles the preview spans: the full pattern period and the full shape period. */
export function previewCycleCount(gate, stretch) {
    let period = 1;
    if (gate.mode === 1) period = Math.max(1, Math.round(gate.x) + Math.round(gate.y));
    else if (gate.mode === 2) period = Math.max(1, Math.round(gate.y));
    else if (gate.mode === 4) period = Math.max(1, (gate.seq || []).length || 1);
    return Math.min(32, Math.max(period, Math.ceil(stretch), 1));
}

/**
 * Draw the full sequence — pattern × shape × stretch — for a voice, exactly
 * the control signal the worklet produces (sans declick).
 */
export function drawSequencePreview(canvas, index) {
    const gate = OvertoneSignalActions.getGate(index);
    const seq = OvertoneSignalActions.getSequencer(index);
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
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

    ctx.strokeStyle = themeColor('--viz-trace');
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= w; i++) {
        const t = (i / w) * cycles;
        const c = Math.min(cycles - 1, Math.floor(t));
        const phase = t - c;
        const s = gate.mode === 0
            ? 1
            : (active[c] ? shapeAt(((c + phase) / seq.stretch) % 1) : 0);
        const y = pad + (1 - s) * (h - 2 * pad);
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
    }
    ctx.stroke();
}

// ---------------------------------------------------------------
// Waveform icons (PNG, canvas-exported) for compact selectors
// ---------------------------------------------------------------

const iconCache = new Map();

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
