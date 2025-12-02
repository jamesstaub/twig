// FFTManager.js
import { DFT } from './DFT.js';

export class FFTManager {
    constructor() {
        // Store spectra by name / ID
        this.spectra = new Map();

        // Cache wavetables reconstructed from FFT
        this.timeDomainCache = new Map();
    }

    /**
     * Add a spectrum directly (e.g., initial primitives or imported)
     */
    addSpectrum(name, real, imag) {
        this.spectra.set(name, { real, imag });
        this.timeDomainCache.delete(name);
        return name;
    }

    /**
     * Compute a new FFT spectrum from additive harmonic amplitudes.
     * This is what gets called when your user blends drawbars.
     */
    buildSpectrumFromHarmonics(name, amplitudes, ratios) {
        const N = amplitudes.length;
        const real = new Float32Array(N);
        const imag = new Float32Array(N);

        for (let h = 1; h < N; h++) {
            const amp = amplitudes[h];
            if (amp === 0) continue;

            // harmonic frequency = h, but ratios allow non-harmonic systems
            const ratio = ratios[h];

            // The "phase" or "angle" for a harmonic in a pure additive model
            // is always 0 for cosine and 90deg offset for sine unless
            // you want to support per-harmonic phase settings later.
            real[ratio] += amp; // Cosine term
            // imag[ratio] += 0;  // Sine term (if needed)
        }

        this.spectra.set(name, { real, imag });
        this.timeDomainCache.delete(name);

        return name;
    }

    /**
     * Create a wavetable (Float32Array) from stored FFT coefficients.
     * This powers sampling, p5 visualization, and WebAudio wavetable generation.
     */
    getTimeDomainWavetable(name, tableSize = 512) {
        if (this.timeDomainCache.has(name)) {
            return this.timeDomainCache.get(name);
        }

        const spec = this.spectra.get(name);
        if (!spec) throw new Error(`Spectrum "${name}" not found`);

        const { real, imag } = spec;
        const table = new Float32Array(tableSize);

        // Reconstruct via inverse Fourier series
        for (let i = 0; i < tableSize; i++) {
            const theta = (i / tableSize) * 2 * Math.PI;
            let sum = 0;

            for (let k = 1; k < real.length; k++) {
                sum += real[k] * Math.cos(k * theta) + imag[k] * Math.sin(k * theta);
            }

            table[i] = sum;
        }

        // Normalize (optional)
        let max = 0;
        for (let n = 0; n < table.length; n++) {
            if (Math.abs(table[n]) > max) max = Math.abs(table[n]);
        }
        if (max > 0.00001) {
            for (let n = 0; n < table.length; n++) table[n] /= max;
        }

        this.timeDomainCache.set(name, table);
        return table;
    }

    /**
     * Construct a WebAudio PeriodicWave from a spectrum.
     */
    getPeriodicWave(name, audioContext) {
        const spec = this.spectra.get(name);
        if (!spec) throw new Error(`Spectrum "${name}" not found`);

        return audioContext.createPeriodicWave(
            spec.real,
            spec.imag,
            { disableNormalization: true }
        );
    }

    /**
     * Utility: transform time-domain samples to FFT
     */
    computeFFTFromSamples(name, samples) {
        const { real, imag } = DFT.transform(samples);
        this.addSpectrum(name, real, imag);
        return { real, imag };
    }
}
