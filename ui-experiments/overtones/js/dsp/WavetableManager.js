/**
 * WAVETABLE MANAGER CLASS
 * 
 * Manages custom waveforms with advanced period multiplier support for phase continuity.
 * 
 * CORE FUNCTIONALITY:
 * - Creates Web Audio PeriodicWave objects from time-domain samples
 * - Stores associated period multipliers for frequency correction
 * - Maintains both frequency-domain coefficients and time-domain reconstruction
 * - Provides serialization/deserialization for waveform persistence
 * 
 * PERIOD MULTIPLIER SYSTEM:
 * This manager is central to the period multiplier algorithm that solves phase
 * discontinuity artifacts in irrational tuning systems. It stores the period
 * multiplier alongside each waveform, enabling automatic pitch correction.
 * 
 * STORAGE ARCHITECTURE:
 * - waveforms: Map<string, PeriodicWave> - Web Audio objects for synthesis
 * - coefficients: Map<string, {real, imag}> - Fourier coefficients for reconstruction
 * - periodMultipliers: Map<string, number> - Period multipliers for pitch correction
 * 
 * The three maps maintain synchronized data for each waveform key, ensuring
 * consistent behavior across different audio synthesis modes.
 */

import { DFT } from './DFT.js';
import { WaveformGenerator } from './WaveformGenerator.js';

export class WavetableManager {
    constructor() {
        this.waveforms = new Map();
        this.coefficients = new Map();
        this.periodMultipliers = new Map(); // Store period multipliers for pitch correction
        this.count = 0;
    }

    /**
     * Adds a new custom waveform from time-domain samples with period multiplier support.
     * 
     * WORKFLOW:
     * 1. Validates input samples for non-empty data
     * 2. Performs DFT to extract frequency-domain coefficients
     * 3. Creates Web Audio PeriodicWave object for synthesis
     * 4. Stores waveform, coefficients, and period multiplier with unique key
     * 
     * PERIOD MULTIPLIER INTEGRATION:
     * The period multiplier is crucial metadata that indicates how many fundamental
     * periods are packed into the wavetable buffer. This enables the frequency
     * correction system to compensate for the packed periods during playback.
     * 
     * UNIQUE KEY GENERATION:
     * Uses timestamp-based keys (custom_<timestamp>) to ensure uniqueness across
     * multiple waveform creation sessions without conflicts.
     * 
     * @param {Float32Array} samples - Time-domain samples (typically 2048 points)
     * @param {AudioContext} context - Web Audio context for PeriodicWave creation
     * @param {number} maxHarmonics - Maximum harmonics for DFT analysis (default: 128)
     * @param {number} periodMultiplier - Number of periods in the wavetable (default: 1)
     * @returns {string} Unique key for accessing the stored waveform
     */
    addFromSamples(samples, context, maxHarmonics = 128, periodMultiplier = 1) {
        if (samples.length === 0) {
            throw new Error("Cannot add empty waveform data.");
        }
        // Normalize samples to peak amplitude 1
        let max = 0;
        for (let i = 0; i < samples.length; i++) {
            if (Math.abs(samples[i]) > max) max = Math.abs(samples[i]);
        }
        let normSamples = samples;
        if (max > 0 && max !== 1) {
            normSamples = new Float32Array(samples.length);
            for (let i = 0; i < samples.length; i++) {
                normSamples[i] = samples[i] / max;
            }
        }
        // Perform DFT to extract frequency components
        const { real, imag } = DFT.transform(normSamples, maxHarmonics);

        // Create PeriodicWave for Web Audio synthesis
        const periodicWave = WaveformGenerator.createCustomWaveform(context, real, imag);

        // Generate unique key using timestamp for collision avoidance
        this.count++;
        const key = `custom_${Date.now()}_${this.count}`;

        // Store all associated data: waveform, coefficients, and period multiplier
        this.waveforms.set(key, periodicWave);
        this.coefficients.set(key, { real, imag });
        this.periodMultipliers.set(key, periodMultiplier);

        return key;
    }

    /**
     * Adds a new custom waveform from Fourier coefficients
     * @param {Float32Array} real - Real coefficients
     * @param {Float32Array} imag - Imaginary coefficients
     * @param {AudioContext} context - Web Audio context
     * @returns {string} Unique key for the new waveform
     */
    addFromCoefficients(real, imag, context) {
        const periodicWave = WaveformGenerator.createCustomWaveform(context, real, imag);

        this.count++;
        const key = `custom_${this.count}`;

        this.waveforms.set(key, periodicWave);
        this.coefficients.set(key, {
            real: new Float32Array(real),
            imag: new Float32Array(imag)
        });

        return key;
    }

    /**
     * Gets a stored PeriodicWave
     * @param {string} key - Waveform key
     * @returns {PeriodicWave|null} The PeriodicWave or null if not found
     */
    getWaveform(key) {
        return this.waveforms.get(key) || null;
    }

    /**
     * Gets stored Fourier coefficients
     * @param {string} key - Waveform key
     * @returns {Object|null} Object with real and imag arrays, or null if not found
     */
    getCoefficients(key) {
        return this.coefficients.get(key) || null;
    }

    /**
     * Retrieves the period multiplier for a stored waveform.
     * 
     * CRITICAL FUNCTION:
     * This method enables the frequency correction system by providing the period
     * multiplier value needed to calculate the correct playback frequency.
     * 
     * USAGE CONTEXT:
     * Called by getFrequencyCorrection() in audio.js to determine how much to
     * scale the frequency when using custom waveforms with multiple periods.
     * 
     * FALLBACK BEHAVIOR:
     * Returns 1 for unknown keys, ensuring that missing or standard waveforms
     * don't cause frequency correction issues.
     * 
     * @param {string} key - Waveform key (e.g., 'custom_1732189423456_1')
     * @returns {number} Period multiplier (1 if not found or for standard waveforms)
     */
    getPeriodMultiplier(key) {
        return this.periodMultipliers.get(key) || 1;
    }

    /**
     * Reconstructs time-domain samples from stored coefficients
     * @param {string} key - Waveform key
     * @param {number} sampleCount - Number of samples to generate
     * @returns {Float32Array|null} Time-domain samples or null if not found
     */
    reconstructSamples(key, sampleCount = 512) {
        const coeffs = this.coefficients.get(key);
        if (!coeffs) return null;

        return DFT.inverseTransform(coeffs.real, coeffs.imag, sampleCount);
    }

    /**
     * Gets all stored waveform keys
     * @returns {Array<string>} Array of waveform keys
     */
    getAllKeys() {
        return Array.from(this.waveforms.keys());
    }

    /**
     * Removes a stored waveform
     * @param {string} key - Waveform key to remove
     * @returns {boolean} True if removed, false if not found
     */
    remove(key) {
        const hadWaveform = this.waveforms.delete(key);
        const hadCoefficients = this.coefficients.delete(key);
        return hadWaveform && hadCoefficients;
    }

    /**
     * Clears all stored waveforms
     */
    clear() {
        this.waveforms.clear();
        this.coefficients.clear();
        this.count = 0;
    }

    /**
     * Gets the current count of stored waveforms
     * @returns {number} Number of stored waveforms
     */
    getCount() {
        return this.waveforms.size;
    }

    /**
     * Exports waveform data for serialization
     * @param {string} key - Waveform key
     * @returns {Object|null} Serializable waveform data or null if not found
     */
    exportData(key) {
        const coeffs = this.coefficients.get(key);
        if (!coeffs) return null;

        return {
            key,
            real: Array.from(coeffs.real),
            imag: Array.from(coeffs.imag),
            timestamp: Date.now()
        };
    }

    /**
     * Imports waveform data from serialization
     * @param {Object} data - Serialized waveform data
     * @param {AudioContext} context - Web Audio context
     * @returns {string} The imported waveform key
     */
    importData(data, context) {
        const real = new Float32Array(data.real);
        const imag = new Float32Array(data.imag);

        return this.addFromCoefficients(real, imag, context);
    }
}