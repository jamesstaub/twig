/**
 * WAVETABLE MANAGER
 *
 * Store for baked custom waveforms. Each entry keeps three synchronized
 * pieces keyed by a unique name:
 * - the PeriodicWave used for synthesis,
 * - the Fourier coefficients it was built from (for visuals and for nesting
 *   a baked wave as the primitive of a later bake),
 * - the period multiplier: how many fundamental periods the table spans.
 *   Playback must run the oscillator at frequency / periodMultiplier; see
 *   getFrequencyCorrection() in audio.js.
 */

export class WavetableManager {
    constructor() {
        this.waveforms = new Map();
        this.coefficients = new Map();
        this.periodMultipliers = new Map();
        this.count = 0;
    }

    /**
     * Stores a baked spectrum as a PeriodicWave.
     * @param {Float32Array} real - Real Fourier coefficients
     * @param {Float32Array} imag - Imaginary Fourier coefficients
     * @param {AudioContext} context
     * @param {number} periodMultiplier - Fundamental periods the table spans
     * @returns {string} Unique key for the stored waveform
     */
    addFromSpectrum(real, imag, context, periodMultiplier = 1) {
        const periodicWave = context.createPeriodicWave(real, imag, {
            disableNormalization: false,
        });

        this.count++;
        const key = `custom_${Date.now()}_${this.count}`;

        this.waveforms.set(key, periodicWave);
        this.coefficients.set(key, { real, imag });
        this.periodMultipliers.set(key, periodMultiplier);

        return key;
    }

    /**
     * @param {string} key
     * @returns {PeriodicWave|null}
     */
    getWaveform(key) {
        return this.waveforms.get(key) || null;
    }

    /**
     * @param {string} key
     * @returns {{real: Float32Array, imag: Float32Array}|null}
     */
    getCoefficients(key) {
        return this.coefficients.get(key) || null;
    }

    /**
     * @param {string} key
     * @returns {number} Period multiplier (1 for unknown keys)
     */
    getPeriodMultiplier(key) {
        return this.periodMultipliers.get(key) || 1;
    }
}
