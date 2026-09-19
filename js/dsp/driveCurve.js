/**
 * Overdrive transfer curve — pure math, no Web Audio.
 *
 * Normalized tanh saturation for a drive amount (0-5, where 1 is full
 * saturation and higher amounts harden toward a clipper), sampled over
 * x = −1..1. Null for amount 0: no shaping at all, a clean passthrough.
 */

const CURVE_LENGTH = 1024;

export function driveCurve(amount) {
    if (!(amount > 0)) return null;
    const k = 1 + amount * 29; // gentle warmth → hard clipping
    const norm = Math.tanh(k);
    const curve = new Float32Array(CURVE_LENGTH);
    for (let i = 0; i < CURVE_LENGTH; i++) {
        const x = (i / (CURVE_LENGTH - 1)) * 2 - 1;
        curve[i] = Math.tanh(k * x) / norm;
    }
    return curve;
}
