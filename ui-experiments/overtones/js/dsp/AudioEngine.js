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
    }

    /**
     * Initializes the audio engine for oscillator-based synthesis
     * @param {number} masterGainValue - Initial master gain value
     * @param {Object} options - Configuration options (for compatibility)
     */
    async initialize(masterGainValue = 0.5, options = {}) {
        if (this.isInitialized) return;

        // Create audio context
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
        // Create dynamics compressor
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-6, this.context.currentTime);
        this.compressor.ratio.setValueAtTime(12, this.context.currentTime);

        // Create master gain node
        this.masterGain = this.context.createGain();
        this.masterGain.gain.setValueAtTime(masterGainValue, this.context.currentTime);
        this.masterGain.maxGain = 1.0;

        // Connect the audio graph
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.context.destination);
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
     * Start oscillator-based synthesis
     */
    startSynthesis(harmonicAmplitudes, harmonicRatios, fundamentalFreq, waveform) {
        return this.startOscillatorSynthesis(harmonicAmplitudes, harmonicRatios, fundamentalFreq, waveform);
    }

    /**
     * Stop all synthesis
     */
    stopSynthesis() {
        // Stop individual oscillators
        this.stopAllOscillators();
    }

    /**
     * Update synthesis parameters
     */
    updateSynthesis(harmonicAmplitudes, harmonicRatios, fundamentalFreq, masterGain) {
        this.updateOscillatorParameters(harmonicAmplitudes, harmonicRatios, fundamentalFreq, masterGain);
    }

    /**
     * Always returns false since we removed AudioWorklet support
     */
    isUsingAudioWorklet() {
        return false;
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
     * Start oscillator-based synthesis (main implementation)
     */
    startOscillatorSynthesis(harmonicAmplitudes, harmonicRatios, fundamentalFreq, waveform) {
        // Clear any existing oscillators
        this.stopAllOscillators();

        // Create oscillators for each harmonic - handled by calling code
        // This method mainly serves to clear existing oscillators
        return true;
    }

    /**
     * Update oscillator parameters
     */
    updateOscillatorParameters(harmonicAmplitudes, harmonicRatios, fundamentalFreq, masterGain) {
        // Update master gain
        this.updateMasterGain(masterGain, 0.02);

        // Individual oscillator updates are handled by calling code
        // This method mainly handles master gain updates
    }

    /**
     * Create an oscillator with the specified parameters
     * @param {number} frequency - Oscillator frequency
     * @param {string|PeriodicWave} waveform - Waveform type or PeriodicWave
     * @param {number} gain - Oscillator gain (0-1)
     * @returns {Object} Object containing oscillator and gain nodes
     */
    createOscillator(frequency, waveform, gain = 1.0) {
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

        // Connect oscillator -> gainNode -> compressor
        oscillator.connect(gainNode);
        gainNode.connect(this.compressor);

        return { oscillator, gainNode };
    }

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

        for (const [key, oscData] of this.oscillators) {
            if (oscData.oscillator) {
                try {
                    oscData.oscillator.stop(now + 0.01); // Small delay to avoid clicks
                } catch (e) {
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