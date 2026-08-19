/**
 * PARTIAL SPECTRUM — pure coefficient-domain wavetable construction.
 *
 * A looping wavetable can only contain frequencies at integer multiples of
 * its loop rate. Sampling irrational partials into a time buffer and DFT-ing
 * it therefore smears each partial across neighboring bins (spectral leakage
 * — audible as buzz/beating). This module builds the Fourier coefficients
 * directly instead: choose a period multiplier P so the table spans P
 * fundamental periods, then place each partial of ratio r on integer bin
 * round(r × P). Every component occupies exactly one bin, so the table is
 * perfectly loop-continuous by construction. The only error is a fixed
 * detune of at most half a bin (exact when a rational system's LCM period
 * is within reach; a few cents worst-case otherwise).
 *
 * Band-limiting under transposition is intentionally NOT handled here:
 * native PeriodicWave implementations keep a mipmap of band-limited tables
 * internally (~3 per octave) and select by the oscillator's actual playback
 * frequency. Because bins map to true output frequencies (k × f / P), that
 * native culling is exactly correct for these tables.
 *
 * All functions are pure: no Web Audio, no app state.
 */

/**
 * A partial to bake into a spectrum.
 * @typedef {Object} Partial
 * @property {number} ratio - Frequency ratio to the fundamental (already
 *   inverted by the caller for subharmonic mode)
 * @property {number} amplitude - Linear gain (caller pre-divides by the
 *   source's time-domain peak so relative loudness matches live playback,
 *   where each PeriodicWave is peak-normalized)
 * @property {Spectrum & {period: number}} source - The primitive's own
 *   spectrum: bin k is a component at frequency (k / period) × the
 *   primitive's pitch. Standard shapes have period 1; a previously baked
 *   wave carries its own period multiplier.
 * @property {number} [maxSourceBin] - Ignore source bins above this (used to
 *   band-limit the bake at the creation-time Nyquist)
 */

/**
 * @typedef {Object} Spectrum
 * @property {Float32Array} real
 * @property {Float32Array} imag
 */

/**
 * Finds the smallest period multiplier P whose bin grid can represent every
 * ratio within `centsTolerance`, searching P = 1..maxPeriod. Rational systems
 * hit zero error at their denominator LCM; irrational ones get the P with
 * the smallest worst-case detune if none meets the tolerance.
 *
 * @param {number[]} ratios - Effective frequency ratios of the active partials
 * @param {number} maxPeriod - Largest P allowed (bin budget / bandwidth)
 * @param {number} centsTolerance - Stop early once worst-case detune is below this
 * @returns {number} Period multiplier
 */
export function choosePeriodMultiplier(ratios, maxPeriod, centsTolerance = 0.5) {
    if (ratios.length === 0) return 1;

    let bestPeriod = 1;
    let bestWorst = Infinity;

    for (let period = 1; period <= maxPeriod; period++) {
        let worst = 0;
        for (const ratio of ratios) {
            const bin = Math.round(ratio * period);
            if (bin < 1) {
                // Ratio too low to land on this grid at all
                worst = Infinity;
                break;
            }
            const cents = Math.abs(1200 * Math.log2(bin / period / ratio));
            if (cents > worst) worst = cents;
        }
        if (worst < bestWorst) {
            bestWorst = worst;
            bestPeriod = period;
        }
        if (worst <= centsTolerance) break;
    }

    return bestPeriod;
}

/**
 * Builds the composite spectrum for a set of partials on a P-period bin grid.
 *
 * Harmonic sources (period 1) snap their base once — bin n × round(r × P) —
 * so a primitive's overtone stack stays exactly harmonic, matching what a
 * live oscillator voice sounds like. Multi-period sources (nested custom
 * waves) have no single fundamental, so each component snaps individually.
 *
 * @param {Partial[]} partials
 * @param {number} periodMultiplier
 * @param {number} maxBin - Highest coefficient index to emit
 * @returns {Spectrum} Trimmed to the highest occupied bin (length ≥ 2)
 */
export function buildSpectrum(partials, periodMultiplier, maxBin) {
    const real = new Float32Array(maxBin + 1);
    const imag = new Float32Array(maxBin + 1);
    let top = 1;

    for (const { ratio, amplitude, source, maxSourceBin } of partials) {
        const lastBin = Math.min(
            Math.min(source.real.length, source.imag.length) - 1,
            maxSourceBin ?? Infinity
        );

        for (let k = 1; k <= lastBin; k++) {
            const bin = source.period === 1
                ? k * Math.round(ratio * periodMultiplier)
                : Math.round((k / source.period) * ratio * periodMultiplier);
            if (bin < 1) continue;
            if (bin > maxBin) break;
            real[bin] += amplitude * source.real[k];
            imag[bin] += amplitude * source.imag[k];
            if (bin > top) top = bin;
        }
    }

    return {
        real: real.slice(0, top + 1),
        imag: imag.slice(0, top + 1),
    };
}

/**
 * Renders one loop of a spectrum to time-domain samples. The grid is
 * i / sampleCount — the last sample sits one step before the wrap point, so
 * the buffer loops without duplicating sample 0.
 *
 * @param {Spectrum} spectrum
 * @param {number} sampleCount
 * @returns {Float32Array}
 */
export function renderSpectrum(spectrum, sampleCount) {
    const { real, imag } = spectrum;
    const bins = Math.min(real.length, imag.length);
    const samples = new Float32Array(sampleCount);

    for (let i = 0; i < sampleCount; i++) {
        const theta = (i / sampleCount) * 2 * Math.PI;
        let sum = 0;
        for (let k = 1; k < bins; k++) {
            sum += real[k] * Math.cos(k * theta) + imag[k] * Math.sin(k * theta);
        }
        samples[i] = sum;
    }

    return samples;
}

/**
 * Time-domain peak of a spectrum, for matching the loudness Web Audio's
 * PeriodicWave normalization gives each primitive during live playback.
 *
 * @param {Spectrum} spectrum
 * @param {number} resolution - Should be ≥ 2× the highest occupied bin
 * @returns {number} Peak absolute amplitude (1 for an empty spectrum)
 */
export function spectrumPeak(spectrum, resolution = 2048) {
    const samples = renderSpectrum(spectrum, resolution);
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const a = Math.abs(samples[i]);
        if (a > peak) peak = a;
    }
    return peak || 1;
}

/**
 * Normalizes a buffer (or several, jointly) to peak 1 in place.
 * @param {Float32Array[]} buffers
 */
export function normalizeBuffers(buffers) {
    let peak = 0;
    for (const buf of buffers) {
        for (let i = 0; i < buf.length; i++) {
            const a = Math.abs(buf[i]);
            if (a > peak) peak = a;
        }
    }
    if (peak > 0) {
        const scale = 1 / peak;
        for (const buf of buffers) {
            for (let i = 0; i < buf.length; i++) buf[i] *= scale;
        }
    }
}
