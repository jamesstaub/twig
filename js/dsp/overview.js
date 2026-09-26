/**
 * WAVEFORM OVERVIEW — samples reduced to what a few hundred pixels can show.
 *
 * A min/max pair per bin: the envelope a DAW draws for a clip, and all the
 * waveform previews need (the Source panel's loaded file, the library's
 * preview of an IR, a sound file or a take). Pure — no Web Audio, no DOM.
 */

/** Bins of a waveform overview (min/max per bin, for drawing). */
export const OVERVIEW_BINS = 1024;

/**
 * @param {Float32Array} data - Mono samples
 * @param {number} duration - Seconds the samples span
 * @returns {{min: Float32Array, max: Float32Array, duration: number}}
 */
export function overviewOfData(data, duration) {
    const bins = Math.max(1, Math.min(OVERVIEW_BINS, data.length));
    const min = new Float32Array(bins);
    const max = new Float32Array(bins);
    for (let b = 0; b < bins; b++) {
        const from = Math.floor((b * data.length) / bins);
        const to = Math.max(from + 1, Math.floor(((b + 1) * data.length) / bins));
        let lo = Infinity, hi = -Infinity;
        for (let i = from; i < to; i++) { if (data[i] < lo) lo = data[i]; if (data[i] > hi) hi = data[i]; }
        min[b] = lo;
        max[b] = hi;
    }
    return { min, max, duration };
}
