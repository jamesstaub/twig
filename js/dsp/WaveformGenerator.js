/**
 * WAVEFORM GENERATOR CLASS
 * Generates band-limited waveforms using Fourier series
 */

export class WaveformGenerator {
    /**
     * Creates a band-limited PeriodicWave for use with Web Audio API
     * @param {AudioContext} context - Web Audio context
     * @param {string} type - Waveform type ('square', 'sawtooth', 'triangle')
     * @param {number} maxHarmonics - Maximum number of harmonics to include
     * @returns {PeriodicWave} Generated periodic wave
     */
    static createBandLimitedWaveform(context, type, maxHarmonics = 1024) {
        const real = new Float32Array(maxHarmonics + 1);
        const imag = new Float32Array(maxHarmonics + 1);
        
        const coefficients = WaveformGenerator.getFourierCoefficients(type, maxHarmonics);
        
        for (let n = 1; n <= maxHarmonics; n++) {
            imag[n] = coefficients[n] || 0;
        }
        
        return context.createPeriodicWave(real, imag, { disableNormalization: false });
    }
    
    /**
     * Calculates Fourier coefficients for standard waveforms
     * @param {string} type - Waveform type
     * @param {number} maxHarmonics - Maximum harmonics to calculate
     * @returns {Array} Array of Fourier coefficients
     */
    static getFourierCoefficients(type, maxHarmonics) {
        const coefficients = new Array(maxHarmonics + 1).fill(0);
        
        for (let n = 1; n <= maxHarmonics; n++) {
            let amplitude = 0;
            let sign = 1;

            switch (type) {
                case 'square':
                    if (n % 2 !== 0) {
                        amplitude = 4 / (Math.PI * n);
                    }
                    break;
                    
                case 'sawtooth':
                    amplitude = 2 / (Math.PI * n);
                    sign = (n % 2 === 0) ? -1 : 1;
                    break;
                    
                case 'triangle':
                    if (n % 2 !== 0) {
                        amplitude = 8 / (Math.PI * Math.PI * n * n);
                        const k = (n - 1) / 2;
                        sign = (k % 2 === 0) ? 1 : -1;
                    }
                    break;
                    
                default:
                    throw new Error(`Unsupported waveform type: ${type}`);
            }
            
            coefficients[n] = amplitude * sign;
        }
        
        return coefficients;
    }
    
    /**
     * Generates time-domain samples for standard waveforms
     * @param {string} type - Waveform type
     * @param {number} sampleCount - Number of samples to generate
     * @param {number} harmonics - Number of harmonics to include
     * @returns {Float32Array} Time-domain samples
     */
    static generateTimeDomainSamples(type, sampleCount = 1024, harmonics = 64) {
        const samples = new Float32Array(sampleCount);
        const coefficients = WaveformGenerator.getFourierCoefficients(type, harmonics);
        
        for (let i = 0; i < sampleCount; i++) {
            const theta = (i / sampleCount) * 2 * Math.PI;
            let sum = 0;
            
            for (let n = 1; n <= harmonics; n++) {
                if (coefficients[n] !== 0) {
                    sum += coefficients[n] * Math.sin(n * theta);
                }
            }
            
            samples[i] = sum * 0.7; // Scale to prevent clipping
        }
        
        return samples;
    }
    
    /**
     * Creates a custom waveform from Fourier coefficients
     * @param {AudioContext} context - Web Audio context
     * @param {Float32Array} real - Real Fourier coefficients
     * @param {Float32Array} imag - Imaginary Fourier coefficients
     * @returns {PeriodicWave} Custom periodic wave
     */
    static createCustomWaveform(context, real, imag) {
        return context.createPeriodicWave(real, imag, { disableNormalization: false });
    }
}