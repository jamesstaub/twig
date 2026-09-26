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
        this.names = new Map();
        this.count = 0;
        this.ctx = null;
    }

    /**
     * The context PeriodicWaves are built on. Set when the engine starts;
     * anything adopted before then is built on first use.
     */
    useContext(ctx) {
        this.ctx = ctx;
    }

    /**
     * Take a stored waveform (assetLibrary) without building it yet: at
     * boot there is no AudioContext, and the menus only need to know it
     * exists. The PeriodicWave is made when something first plays it.
     */
    adopt(key, { real, imag, periodMultiplier = 1, name = '' }) {
        this.coefficients.set(key, { real, imag });
        this.periodMultipliers.set(key, periodMultiplier);
        this.names.set(key, name);
        this.count++;
    }

    /** Stored waveforms, oldest first: { key, name }. */
    list() {
        return [...this.coefficients.keys()].map((key) => ({ key, name: this.names.get(key) || '' }));
    }

    /**
     * Stores a baked spectrum as a PeriodicWave.
     * @param {Float32Array} real - Real Fourier coefficients
     * @param {Float32Array} imag - Imaginary Fourier coefficients
     * @param {AudioContext} context
     * @param {number} periodMultiplier - Fundamental periods the table spans
     * @returns {string} Unique key for the stored waveform
     */
    addFromSpectrum(real, imag, context, periodMultiplier = 1, key = null) {
        this.ctx = this.ctx || context;
        this.count++;
        // The caller passes the content id (assetLibrary.saveWave); without
        // one — a bake that is not being stored — fall back to a serial key
        const id = key || `custom_${Date.now()}_${this.count}`;

        this.waveforms.set(id, context.createPeriodicWave(real, imag, { disableNormalization: false }));
        this.coefficients.set(id, { real, imag });
        this.periodMultipliers.set(id, periodMultiplier);
        return id;
    }

    /**
     * Is this waveform in the session's library? True for a stored bake
     * whose PeriodicWave has not been built yet (that needs a context).
     */
    has(key) {
        return Boolean(key) && this.coefficients.has(key);
    }

    /**
     * @param {string} key
     * @returns {PeriodicWave|null} built on first use for adopted waveforms
     */
    getWaveform(key) {
        const built = this.waveforms.get(key);
        if (built) return built;
        const coeffs = this.coefficients.get(key);
        if (!coeffs || !this.ctx) return null;
        const wave = this.ctx.createPeriodicWave(coeffs.real, coeffs.imag, { disableNormalization: false });
        this.waveforms.set(key, wave);
        return wave;
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
