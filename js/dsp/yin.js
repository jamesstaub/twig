/**
 * YIN pitch estimator (de Cheveigné & Kawahara, 2002) — pure, dependency-
 * free, and loaded RAW by the pitch worker (no extensionless imports here).
 *
 *   1. difference function      d(τ)  = Σ (x[i] − x[i+τ])²
 *   2. cumulative mean normalize d'(τ) = d(τ) / ((1/τ) Σ_{j≤τ} d(j)),  d'(0) = 1
 *   3. absolute threshold: the first τ where d' dips under THRESHOLD, followed
 *      to its local minimum — the smallest period that explains the signal,
 *      which is what keeps YIN from picking a harmonic or a multiple
 *   4. parabolic interpolation of that minimum for sub-sample precision
 *
 * The estimate's clarity is 1 − d'(τ): 1 for a perfect period, ~0 for noise.
 */

const THRESHOLD = 0.1;

/**
 * Pitch of one window: the difference is summed over W samples for every
 * lag up to W, so `x` must hold at least 2W samples (every lag sees the
 * same amount of signal). Periods up to W are detectable.
 * @param {Float32Array} x - Samples, ≥ 2W of them
 * @param {number} sampleRate
 * @param {number} W - Integration window / longest period
 * @returns {{hz: number, clarity: number}|null} null when nothing periodic
 */
export function yin(x, sampleRate, W) {
    const lagMax = Math.min(W, x.length - W);
    if (lagMax < 2) return null;

    // 1 + 2: difference function and its cumulative-mean normalization in one pass
    const d = new Float32Array(lagMax + 1);
    d[0] = 1;
    let running = 0;
    for (let lag = 1; lag <= lagMax; lag++) {
        let sum = 0;
        for (let i = 0; i < W; i++) {
            const diff = x[i] - x[i + lag];
            sum += diff * diff;
        }
        running += sum;
        d[lag] = running > 0 ? (sum * lag) / running : 1;
    }

    // 3: first dip under the threshold, followed down to its minimum
    let tau = -1;
    for (let lag = 2; lag <= lagMax; lag++) {
        if (d[lag] < THRESHOLD) {
            while (lag + 1 <= lagMax && d[lag + 1] < d[lag]) lag++;
            tau = lag;
            break;
        }
    }
    if (tau === -1) {
        // No dip under the threshold: the deepest minimum, if it is at all convincing
        let best = 2;
        for (let lag = 3; lag <= lagMax; lag++) if (d[lag] < d[best]) best = lag;
        if (d[best] > 0.5) return null;
        tau = best;
    }

    // 4: parabolic interpolation around the minimum
    let period = tau;
    if (tau > 1 && tau < lagMax) {
        const y0 = d[tau - 1], y1 = d[tau], y2 = d[tau + 1];
        const denom = y0 - 2 * y1 + y2;
        if (denom !== 0) period = tau + (0.5 * (y0 - y2)) / denom;
    }
    return { hz: sampleRate / period, clarity: 1 - d[tau] };
}

/**
 * Pitch of a stretch of signal: YIN over overlapping windows of W (each
 * reading 2W samples), the clear estimates averaged. This is what the
 * pitch worker runs over a file's first 4096 samples: W = 1024 hopped by
 * 512 gives five estimates there (periods down to ~45 Hz at 48 kHz); when
 * none is clear, one W = 2048 pass over the whole buffer reaches ~23 Hz.
 * @param {Float32Array} data - Samples (mono)
 * @param {number} sampleRate
 * @param {Object} [opts]
 * @param {number} [opts.window=1024]
 * @param {number} [opts.hop=512]
 * @param {number} [opts.minClarity=0.5]
 * @returns {{hz: number, clarity: number, windows: number}|null}
 */
export function yinAverage(data, sampleRate, { window = 1024, hop = 512, minClarity = 0.5 } = {}) {
    if (data.length < 128) return null;
    const W = Math.min(window, Math.floor(data.length / 2));
    let estimates = [];
    for (let start = 0; start + 2 * W <= data.length; start += hop) {
        const r = yin(data.subarray(start, start + 2 * W), sampleRate, W);
        if (r && r.clarity >= minClarity) estimates.push(r);
    }
    if (estimates.length === 0) {
        const r = yin(data, sampleRate, Math.floor(data.length / 2));
        if (r && r.clarity >= minClarity) estimates = [r];
    }
    if (estimates.length === 0) return null;
    // Average in the log domain: an octave up and an octave down are the same distance
    let logSum = 0, claritySum = 0;
    for (const { hz, clarity } of estimates) { logSum += Math.log(hz); claritySum += clarity; }
    return { hz: Math.exp(logSum / estimates.length), clarity: claritySum / estimates.length, windows: estimates.length };
}
