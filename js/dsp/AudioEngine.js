/**
 * SIMPLIFIED AUDIO ENGINE CLASS
 * Manages Web Audio API context and oscillator-based synthesis only
 */

import { WaveformGenerator } from './WaveformGenerator.js';

export class AudioEngine {
    constructor() {
        this.context = null;
        this.masterGain = null;
        this.compressor = null;
        this.oscillators = new Map();
        this.isInitialized = false;

        // Standard waveforms
        this.standardWaveforms = new Map();

        // No routingMode needed; playback is always stereo
    }

    /**
     * Initializes the audio engine for oscillator-based synthesis
     * @param {number} masterGainValue - Initial master gain value
     * @param {Object} options - Configuration options (for compatibility)
     */
    async initialize(masterGainValue = 0.5) {
        if (this.isInitialized) return;
        this.context = new (window.AudioContext || window.webkitAudioContext)();

        // Create audio graph
        this.setupAudioGraph(masterGainValue);

        // Pre-generate standard waveforms
        this.generateStandardWaveforms();

        this.isInitialized = true;

        // Resume context if suspended
        if (this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    /**
     * Resume the audio context if suspended
     */
    async resume() {
        if (this.context && this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    /**
     * Sets up the main audio processing graph
     * @param {number} masterGainValue - Initial master gain value
     */
    setupAudioGraph(masterGainValue) {
        // Create dynamics compressor (gentle pre-limiter compression)
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-24, this.context.currentTime);
        this.compressor.ratio.setValueAtTime(6, this.context.currentTime); // more aggressive
        this.compressor.attack.setValueAtTime(0.01, this.context.currentTime);
        this.compressor.release.setValueAtTime(0.20, this.context.currentTime);

        // Create master gain node
        this.masterGain = this.context.createGain();
        this.masterGain.gain.setValueAtTime(masterGainValue, this.context.currentTime);
        this.masterGain.maxGain = 1.0;

        // Fast final limiter
        this.limiter = this.context.createDynamicsCompressor();
        this.limiter.threshold.setValueAtTime(-6, this.context.currentTime); // more headroom
        this.limiter.ratio.setValueAtTime(6, this.context.currentTime);
        this.limiter.attack.setValueAtTime(0.005, this.context.currentTime); // much faster
        this.limiter.release.setValueAtTime(0.15, this.context.currentTime); // less pumping

        // mono or stereo: compressor to masterGain
        this.compressor.connect(this.masterGain);

        this.masterGain.connect(this.limiter);
        this.limiter.connect(this.context.destination);
    }

    /**
     * Generates standard band-limited waveforms
     */
    generateStandardWaveforms() {
        const types = ['square', 'sawtooth', 'triangle'];

        for (const type of types) {
            const periodicWave = WaveformGenerator.createBandLimitedWaveform(this.context, type, 128);
            this.standardWaveforms.set(type, periodicWave);
        }
    }


    /**
     * Get a standard waveform PeriodicWave object
     * @param {string} waveformType - Type of waveform ('square', 'sawtooth', 'triangle')
     * @returns {PeriodicWave|null} The PeriodicWave object or null if not found
     */
    getStandardWaveform(waveformType) {
        return this.standardWaveforms.get(waveformType) || null;
    }


    /**
     * Create an oscillator with the specified parameters
     * @param {number} frequency - Oscillator frequency
     * @param {string|PeriodicWave} waveform - Waveform type or PeriodicWave
     * @param {number} gain - Oscillator gain (0-1)
     * @param {Object} options - { pan, channel } for stereo/multichannel
     * @returns {Object} Object containing oscillator, gain node, and (optional) panner
     */
    createOscillator(frequency, waveform, gain = 1.0, options = {}) {
        if (!this.isInitialized) {
            throw new Error("AudioEngine must be initialized before creating oscillators");
        }

        const oscillator = this.context.createOscillator();
        const gainNode = this.context.createGain();

        // Set frequency
        oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);

        // Set waveform
        if (typeof waveform === 'string') {
            if (waveform === 'sine') {
                oscillator.type = 'sine';
            } else if (this.standardWaveforms.has(waveform)) {
                oscillator.setPeriodicWave(this.standardWaveforms.get(waveform));
            } else {
                throw new Error(`Unknown waveform type: ${waveform}`);
            }
        } else if (waveform instanceof PeriodicWave) {
            oscillator.setPeriodicWave(waveform);
        } else {
            throw new Error("Waveform must be a string or PeriodicWave");
        }

        // Set gain
        gainNode.gain.setValueAtTime(gain, this.context.currentTime);

        // Always stereo: use StereoPannerNode per oscillator
        const panner = this.context.createStereoPanner();
        panner.pan.setValueAtTime(options.pan ?? 0, this.context.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(this.compressor);

        return { oscillator, gainNode, panner };
    }
    // No setRoutingMode needed

    /**
     * Add an oscillator to the managed oscillators map
     * @param {string} key - Unique key for the oscillator
     * @param {Object} oscData - Object containing oscillator and gain nodes
     */
    addOscillator(key, oscData) {
        // Start the oscillator
        oscData.oscillator.start(this.context.currentTime);

        // Store in oscillators map
        this.oscillators.set(key, oscData);
    }

    /**
     * Update oscillator frequency with smooth transitions
     * @param {string} key - Oscillator key
     * @param {number} frequency - New frequency
     * @param {number} rampTime - Ramp time in seconds
     */
    updateOscillatorFrequency(key, frequency, rampTime = 0.02) {
        const oscData = this.oscillators.get(key);
        if (oscData && oscData.oscillator) {
            const now = this.context.currentTime;
            oscData.oscillator.frequency.setTargetAtTime(frequency, now, rampTime / 3);
        }
    }

    /**
     * Update oscillator gain with smooth transitions
     * @param {string} key - Oscillator key
     * @param {number} gain - New gain value
     * @param {number} rampTime - Ramp time in seconds
     */
    updateOscillatorGain(key, gain, rampTime = 0.02) {
        const oscData = this.oscillators.get(key);
        if (oscData && oscData.gainNode) {
            const now = this.context.currentTime;
            // Apply gain directly with no minimum constraints for proper silence
            oscData.gainNode.gain.setTargetAtTime(gain, now, rampTime / 3);
        }
    }

    /**
     * Update master gain
     * @param {number} gain - New master gain value
     * @param {number} rampTime - Ramp time in seconds
     */
    updateMasterGain(gain, rampTime = 0.02) {
        if (this.masterGain) {
            const now = this.context.currentTime;
            // Apply gain directly with no minimum constraints for proper silence
            this.masterGain.gain.setTargetAtTime(gain, now, rampTime / 3);
        }
    }

    /**
     * Stop all oscillators
     */
    stopAllOscillators() {
        const now = this.context.currentTime;

        for (const oscData of this.oscillators.values()) {
            if (oscData.oscillator) {
                try {
                    oscData.oscillator.stop(now + 0.01); // Small delay to avoid clicks
                } catch {
                    // Oscillator may already be stopped
                }
            }
        }

        this.oscillators.clear();
    }

    /**
     * Get the audio context
     */
    getContext() {
        return this.context;
    }
}