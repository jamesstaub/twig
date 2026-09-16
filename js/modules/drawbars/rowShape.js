import { shapeSampler } from '../overtoneSignal/sequencePreview.js';

/**
 * Row sculpting — pure. Given the voice count, the dragged column and its
 * normalized position `t`, every voice's normalized position when the
 * row follows a waveform contour: the dragged column tracks `t` exactly
 * (the contour's peak is anchored there); every other voice blends
 * between the contour and its inverse. Dragging to the top draws the
 * shape itself, to the bottom its negative; mid positions flatten toward
 * an even row. `cycles` tiles the contour across the row that many
 * times (fractions stretch it past the row).
 *
 * Works on 0-1 POSITIONS, never on parameter values: the caller maps
 * each position back into its own parameter range, so a shaped filter
 * row sets series steps (each voice's own Hz follows), not absolute Hz.
 */
export function shapedRow({ count, index, t, cycles = 1, shapeName }) {
    const sample = shapeSampler(shapeName);

    // Anchor the contour's maximum on the dragged column
    let maxPhase = 0;
    let maxVal = -Infinity;
    for (let i = 0; i < 128; i++) {
        const s = sample(i / 128);
        if (s > maxVal) {
            maxVal = s;
            maxPhase = i / 128;
        }
    }

    const out = new Array(count);
    for (let i = 0; i < count; i++) {
        const phase = ((maxPhase + ((i - index) / count) * cycles) % 1 + 1) % 1;
        const s = sample(phase);
        out[i] = s * t + (1 - s) * (1 - t);
    }
    return out;
}

/** Cycle-count steps for the ÷2/×2 buttons, clamped to a useful range. */
export function stepShapeCycles(cycles, factor) {
    return Math.max(0.25, Math.min(8, cycles * factor));
}
