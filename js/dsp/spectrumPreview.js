/**
 * SPECTRUM PREVIEW — pure helpers for the wavetable panel's spectral view.
 *
 * Models what "Create IR" will bake: every active partial carries its
 * primitive's harmonic stack, and the ring time turns each line into a
 * resonance. A sinusoid decaying with time constant τ has a Lorentzian
 * magnitude spectrum with half-width 1/(2πτ), so longer ring = narrower,
 * taller peaks (a modal resonator); ring 0 (one loop) is broad. No Web
 * Audio, no app state — callers pass plain data.
 */

/** Harmonic stacks of the standard primitives, |coefficient| per harmonic. */
function primitiveHarmonics(primitive, count = 32) {
    const out = [];
    for (let n = 1; n <= count; n++) {
        let a = 0;
        switch (primitive) {
            case 'square': a = n % 2 ? 4 / (Math.PI * n) : 0; break;
            case 'sawtooth': a = 2 / (Math.PI * n); break;
            case 'triangle': a = n % 2 ? 8 / (Math.PI * Math.PI * n * n) : 0; break;
            default: a = n === 1 ? 1 : 0; // sine
        }
        if (a > 0) out.push({ k: n, amp: a });
    }
    return out;
}

/**
 * Spectral lines of the current timbre: one per (partial × primitive
 * harmonic) up to `maxFreq`.
 *
 * @param {Object} o
 * @param {number[]} o.ratios - Current system ratios
 * @param {number[]} o.amplitudes - Drawbar amplitudes (0-1)
 * @param {boolean} o.isSubharmonic
 * @param {number} o.f0 - Fundamental (Hz)
 * @param {string} o.primitive - 'sine' | 'square' | … | custom key
 * @param {{real: Float32Array, imag: Float32Array, period: number}|null} o.custom
 *   Coefficients of a custom primitive (bins over `period` fundamental periods)
 * @returns {Array<{freq: number, amp: number}>}
 */
export function timbreLines({ ratios, amplitudes, isSubharmonic, f0, primitive, custom, maxFreq = 20000 }) {
    const lines = [];
    const stack = custom
        ? Array.from({ length: Math.min(custom.real.length, custom.imag.length) }, (_, k) => ({
            k: k / custom.period,
            amp: Math.hypot(custom.real[k] || 0, custom.imag[k] || 0),
        })).filter((h) => h.k > 0 && h.amp > 1e-4)
        : primitiveHarmonics(primitive);
    const peak = stack.reduce((m, h) => Math.max(m, h.amp), 0) || 1;

    for (let i = 0; i < ratios.length; i++) {
        const amp = amplitudes[i] || 0;
        const r = ratios[i];
        if (amp <= 0.001 || !(r > 0)) continue;
        const voiceFreq = f0 * (isSubharmonic ? 1 / r : r);
        for (const h of stack) {
            const freq = voiceFreq * h.k;
            if (freq > maxFreq) break;
            lines.push({ freq, amp: amp * (h.amp / peak) });
        }
    }
    return lines;
}

/**
 * Time constant (s) of the IR's decay: the ring's −60 dB envelope, or one
 * loop's duration when ring is 0.
 */
export function irTimeConstant(ringSeconds, loopSeconds) {
    return ringSeconds > 0 ? ringSeconds / Math.log(1000) : loopSeconds;
}

/**
 * Magnitude of the resonator spectrum at each frequency in `freqs`:
 * Σ amp_k / sqrt(1 + ((f − f_k)·2πτ)²). Normalized to its own peak.
 *
 * @returns {Float32Array}
 */
export function resonanceCurve(lines, tau, freqs) {
    const out = new Float32Array(freqs.length);
    const w = 2 * Math.PI * tau;
    let peak = 0;
    for (let i = 0; i < freqs.length; i++) {
        let sum = 0;
        for (const line of lines) {
            const d = (freqs[i] - line.freq) * w;
            sum += line.amp / Math.sqrt(1 + d * d);
        }
        out[i] = sum;
        if (sum > peak) peak = sum;
    }
    if (peak > 0) for (let i = 0; i < out.length; i++) out[i] /= peak;
    return out;
}

/** Log-spaced frequency grid from fmin to fmax. */
export function logFrequencies(fmin, fmax, count) {
    const out = new Float32Array(count);
    const ratio = Math.log(fmax / fmin);
    for (let i = 0; i < count; i++) out[i] = fmin * Math.exp((ratio * i) / (count - 1));
    return out;
}
