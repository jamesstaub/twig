/**
 * DISCRETE FOURIER TRANSFORM CLASS
 * Provides efficient DFT operations for signal analysis
 */

export class DFT {
    /**
     * Performs a Discrete Fourier Transform on time-domain samples
     * @param {Float32Array} timeDomainSamples - Input time-domain samples
     * @param {number} maxHarmonics - Maximum number of harmonics to analyze
     * @returns {Object} Object with real and imaginary coefficient arrays
     */
    static transform(timeDomainSamples, maxHarmonics = 128) {
        const N = timeDomainSamples.length;
        const numHarmonics = Math.min(maxHarmonics, Math.floor(N / 2));
        
        const real = new Float32Array(numHarmonics + 1).fill(0);
        const imag = new Float32Array(numHarmonics + 1).fill(0);
        
        // DC component (should be near zero for audio)
        real[0] = 0;
        
        // Calculate Fourier coefficients for each harmonic
        for (let k = 1; k <= numHarmonics; k++) {
            let realSum = 0;
            let imagSum = 0;
            
            for (let n = 0; n < N; n++) {
                const angle = (2 * Math.PI * k * n) / N;
                realSum += timeDomainSamples[n] * Math.cos(angle);
                imagSum -= timeDomainSamples[n] * Math.sin(angle); // Negative for DFT convention
            }
            
            // Normalize by sample count and scale for audio
            real[k] = (2 * realSum) / N;
            imag[k] = (2 * imagSum) / N;
        }
        
        return { real, imag };
    }
    
    /**
     * Performs an Inverse Discrete Fourier Transform to reconstruct time-domain samples
     * @param {Float32Array} real - Real coefficients
     * @param {Float32Array} imag - Imaginary coefficients  
     * @param {number} sampleCount - Number of output samples
     * @returns {Float32Array} Reconstructed time-domain samples
     */
    static inverseTransform(real, imag, sampleCount = 512) {
        const samples = new Float32Array(sampleCount);
        
        for (let n = 0; n < sampleCount; n++) {
            const theta = (n / sampleCount) * 2 * Math.PI;
            let sum = 0;
            
            // Reconstruct waveform from Fourier series: sum of real*cos + imag*sin
            for (let k = 1; k < real.length && k < imag.length; k++) {
                sum += real[k] * Math.cos(k * theta) + imag[k] * Math.sin(k * theta);
            }
            samples[n] = sum;
        }
        
        return samples;
    }
    
    /**
     * Extracts magnitude spectrum from DFT coefficients
     * @param {Float32Array} real - Real coefficients
     * @param {Float32Array} imag - Imaginary coefficients
     * @returns {Float32Array} Magnitude spectrum
     */
    static getMagnitudeSpectrum(real, imag) {
        const magnitude = new Float32Array(Math.min(real.length, imag.length));
        
        for (let k = 0; k < magnitude.length; k++) {
            magnitude[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
        }
        
        return magnitude;
    }
    
    /**
     * Extracts phase spectrum from DFT coefficients
     * @param {Float32Array} real - Real coefficients
     * @param {Float32Array} imag - Imaginary coefficients
     * @returns {Float32Array} Phase spectrum in radians
     */
    static getPhaseSpectrum(real, imag) {
        const phase = new Float32Array(Math.min(real.length, imag.length));
        
        for (let k = 0; k < phase.length; k++) {
            phase[k] = Math.atan2(imag[k], real[k]);
        }
        
        return phase;
    }
}