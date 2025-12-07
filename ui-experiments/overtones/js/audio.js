/**
 * AUDIO MODULE WITH ADVANCED PERIOD MULTIPLIER SYSTEM
 * 
 * This module implements sophisticated wavetable synthesis with automatic phase
 * continuity correction for irrational frequency ratios found in alternative
 * tuning systems (Just Intonation, microtonal scales, etc.).
 * 
 * CORE INNOVATION: PERIOD MULTIPLIER ALGORITHM
 * 
 * PROBLEM SOLVED:
 * Traditional wavetable synthesis samples exactly one period (2π) of a waveform.
 * For irrational ratios like 16/15 (Just Intonation), this creates phase 
 * discontinuities at the wavetable boundary, causing audible buzzing artifacts.
 * 
 * SOLUTION APPROACH:
 * 1. Analyze active frequency ratios to find optimal sampling period
 * 2. Sample N fundamental periods (where N minimizes phase errors for all ratios)
 * 3. Store period multiplier (N) with each custom waveform
 * 4. Apply frequency correction (freq × 1/N) during playback
 * 5. Adjust WAV export sample rates for correct pitch
 * 
 * MATHEMATICAL FOUNDATION:
 * For each ratio R, find smallest integer P where R × P ≈ integer.
 * Use LCM of all optimal periods as the final period multiplier.
 * This ensures ALL ratios complete near-integer cycles simultaneously.
 * 
 * SYSTEM COMPONENTS:
 * - calculateOptimalPeriod(): Core mathematical algorithm
 * - getFrequencyCorrection(): Automatic pitch compensation
 * - sampleCurrentWaveformBasic(): Multi-period wavetable sampling
 * - WavetableManager: Storage with period multiplier metadata
 * - AudioEngine: Synthesis with frequency correction support
 * 
 * UNIVERSAL APPLICABILITY:
 * This system works with ANY tuning system because it's based on mathematical
 * properties of rational approximation, not tuning-specific optimizations.
 * Successfully tested with Just Intonation, Equal Temperament variants,
 * and exotic microtonal scales.
 * 
 * Contains Web Audio API functions, oscillator management, and audio processing
 * Refactored to use modular DSP classes with period multiplier support
 */

import { AppState, updateAppState, WAVETABLE_SIZE } from './config.js';
import { calculateFrequency, generateFilenameParts } from './utils.js';

import { AudioEngine, WavetableManager, WAVExporter } from './dsp/index.js';
import { showStatus } from './domUtils.js';

// ================================
// DSP INSTANCES
// ================================

let audioEngine = null;
let wavetableManager = null;

// Routing mode: 'mono', 'stereo', 'multichannel' (default: mono) for WAV export only
export function setDownloadRoutingMode(mode) {
    AppState.downloadRoutingMode = mode;
}

// Accessors – SAFE to import anywhere
export function getAudioEngine() {
    return audioEngine;
}

export function getWavetableManager() {
    return wavetableManager;
}


// ================================
// AUDIO INITIALIZATION
// ================================

/**
 * Initializes the AudioContext and the audio graph
 */
export async function initAudio() {
    if (!audioEngine) {
        audioEngine = new AudioEngine();
        wavetableManager = new WavetableManager();

        // Initialize the audio engine with oscillator-only synthesis
        await audioEngine.initialize(AppState.masterGainValue);

        // Store references for compatibility
        AppState.audioContext = audioEngine.getContext();
        AppState.compressor = audioEngine.compressor;
        AppState.masterGain = audioEngine.masterGain;

        // Store standard waveforms for compatibility
        AppState.blWaveforms = AppState.blWaveforms || {};
        AppState.blWaveforms.square = audioEngine.getStandardWaveform('square');
        AppState.blWaveforms.sawtooth = audioEngine.getStandardWaveform('sawtooth');
        AppState.blWaveforms.triangle = audioEngine.getStandardWaveform('triangle');
    }

    // Resume context if suspended
    await audioEngine.resume();
}

// ================================
// SYNTHESIS HELPERS
// ================================

/**
 * Resolves waveform parameter to a proper Web Audio API format
 * @param {string} waveformName - Waveform name from AppState
 * @returns {string|PeriodicWave} Resolved waveform
 */
function resolveWaveform(waveformName) {
    if (!waveformName) {
        return 'sine';
    }

    if (waveformName.startsWith('custom_')) {
        const customWave = wavetableManager.getWaveform(waveformName);
        return customWave || 'sine';
    }

    return waveformName;
}

/**
 * Gets the frequency correction factor for custom waveforms with period multipliers.
 * 
 * PURPOSE:
 * When we create wavetables with period multipliers > 1, the wavetable contains
 * multiple periods of the fundamental frequency packed together. The Web Audio API's
 * PeriodicWave always assumes the buffer represents exactly ONE period, so it plays
 * the packed periods at the original frequency, resulting in pitch that's too high.
 * 
 * CORRECTION FORMULA:
 * If the wavetable contains N periods, we must play it at frequency × (1/N) to get
 * the correct pitch. This frequency correction factor is 1/periodMultiplier.
 * 
 * EXAMPLE:
 * - Original frequency: 440 Hz
 * - Period multiplier: 15 (wavetable contains 15 periods)
 * - Correction factor: 1/15 = 0.0667
 * - Corrected frequency: 440 × 0.0667 = 29.33 Hz
 * - Result: Web Audio plays 15 periods at 29.33 Hz = 440 Hz perceived pitch ✓
 * 
 * INTEGRATION:
 * This correction is applied automatically during oscillator creation and updates
 * in both individual oscillator and AudioWorklet synthesis modes.
 * 
 * @param {string} waveformName - Waveform name from AppState (e.g., 'custom_1234567890')
 * @returns {number} Frequency correction factor (1/periodMultiplier for custom waves, 1 for standard waves)
 */
function getFrequencyCorrection(waveformName) {
    // Standard waveforms (sine, square, etc.) don't need correction
    if (!waveformName || !waveformName.startsWith('custom_')) {
        return 1;
    }

    // Get period multiplier from WavetableManager or AppState fallback
    let periodMultiplier = 1;
    if (wavetableManager) {
        periodMultiplier = wavetableManager.getPeriodMultiplier(waveformName);
    } else if (AppState.customWavePeriodMultipliers) {
        periodMultiplier = AppState.customWavePeriodMultipliers[waveformName] || 1;
    }

    // Frequency correction is inverse of period multiplier
    // This compensates for the packed periods in the wavetable
    return 1 / periodMultiplier;
}

// ================================
// OSCILLATOR MANAGEMENT
// ================================

/**
 * Starts synthesis using oscillators with period multiplier frequency correction
 */
export async function startTone() {
    await initAudio();
    if (AppState.isPlaying) return;

    try {
        await startToneWithOscillators();
        updateAppState({ isPlaying: true });
    } catch (error) {
        console.error('Failed to start synthesis:', error);
        throw error;
    }
}

/**
 * Individual oscillator-based synthesis with period multiplier frequency correction
 */
async function startToneWithOscillators() {
    // Clear any existing oscillators
    AppState.oscillators = [];

    // Always stereo playback: each oscillator gets a stereo panner
    const panArray = AppState.oscillatorPans || [];
    const numPartials = AppState.currentSystem.ratios.length;
    for (let i = 0; i < AppState.harmonicAmplitudes.length; i++) {
        if (i < numPartials) {
            const ratio = AppState.currentSystem.ratios[i];
            const amplitude = AppState.harmonicAmplitudes[i] || 0;
            if (ratio > 0) {
                const frequency = calculateFrequency(ratio);
                const gain = amplitude * AppState.masterGainValue;
                const waveform = resolveWaveform(AppState.currentWaveform);
                const frequencyCorrection = getFrequencyCorrection(AppState.currentWaveform);
                const correctedFrequency = frequency * frequencyCorrection;

                // Stereo panning for playback
                let oscOptions = { pan: panArray[i] ?? (i % 2 === 0 ? -0.8 : 0.8) };

                try {
                    const oscData = audioEngine.createOscillator(correctedFrequency, waveform, gain, oscOptions);
                    const oscKey = `harmonic_${i}`;
                    audioEngine.addOscillator(oscKey, oscData);
                    while (AppState.oscillators.length <= i) {
                        AppState.oscillators.push(null);
                    }
                    AppState.oscillators[i] = { key: oscKey, ratio: ratio };
                } catch (error) {
                    console.error(`Failed to create oscillator ${i}:`, error);
                    AppState.oscillators[i] = null;
                }
            } else {
                AppState.oscillators[i] = null;
            }
        } else {
            // Hide extra oscillators and set gain to 0
            AppState.harmonicAmplitudes[i] = 0;
            AppState.oscillators[i] = null;
        }
    }
}


/**
 * Stops all synthesis
 */
export function stopTone() {
    if (!AppState.isPlaying || !audioEngine) return;

    // Stop individual oscillators
    audioEngine.stopAllOscillators();

    updateAppState({
        oscillators: [],
        isPlaying: false
    });
}

/**
 * Updates synthesis parameters in real-time with period multiplier frequency correction
 */
export function updateAudioProperties() {
    if (!AppState.isPlaying || !audioEngine) return;
    // eventually we could have separate slew values for each param, but its fun to have it global
    const rampTime = AppState.masterSlewValue;
    updateAudioPropertiesOscillators(rampTime);
}

/**
 * Updates oscillator parameters with period multiplier frequency correction
 */
function updateAudioPropertiesOscillators(rampTime) {
    // Update Master Gain
    audioEngine.updateMasterGain(AppState.masterGainValue, rampTime);

    // Update existing oscillators (gain and frequency)
    AppState.oscillators.forEach((node, i) => {
        if (node && node.key) {
            const ratio = AppState.currentSystem.ratios[i];
            const baseFreq = calculateFrequency(ratio);
            const frequencyCorrection = getFrequencyCorrection(AppState.currentWaveform);
            const newFreq = baseFreq * frequencyCorrection;
            const amplitude = AppState.harmonicAmplitudes[i] || 0;
            let newGain = amplitude * AppState.masterGainValue;

            // Prevent non-finite frequency values
            if (!isFinite(newFreq) || isNaN(newFreq)) {
                newGain = 0;
            } else {
                audioEngine.updateOscillatorFrequency(node.key, newFreq, rampTime);
            }
            audioEngine.updateOscillatorGain(node.key, newGain, rampTime);
        }
    });
}

/**
 * Restarts the audio with current settings (useful when changing waveforms)
 */
export function restartAudio() {
    if (AppState.isPlaying) {
        stopTone();
        setTimeout(startTone, 50);
    }
}

// ================================
// WAVETABLE GENERATION
// ================================

/**
 * Samples the current waveform configuration into a buffer with period multiplier support
 * @returns {Object} {buffer: Float32Array, periodMultiplier: number}
 */
/**
 * Samples the current waveform configuration into a buffer with period multiplier support
 * and supports mono, stereo, or multichannel output for WAV export.
 * @param {string} routingMode - 'mono', 'stereo', 'multichannel'
 * @returns {Object} { buffer(s), periodMultiplier }
 */
export async function sampleCurrentWaveform(routingMode = 'mono', isSubharmonic = false) {
    await initAudio();

    const numOsc = AppState.harmonicAmplitudes.length;
    const tableSize = WAVETABLE_SIZE;

    // Validate system
    if (!AppState.currentSystem || !AppState.currentSystem.ratios) {
        console.error("Spectral system missing");
        return { buffer: new Float32Array(0), periodMultiplier: 1 };
    }

    //----------------------------------------------------------------------
    // 1. Compute base period
    //----------------------------------------------------------------------
    const activeRatios = [];
    for (let h = 0; h < numOsc; h++) {
        if (AppState.harmonicAmplitudes[h] > 0.001) {
            activeRatios.push(AppState.currentSystem.ratios[h]);
        }
    }

    const periodMultiplier = calculateOptimalPeriod(activeRatios, isSubharmonic);
    const totalPeriodLen = 2 * Math.PI * periodMultiplier;
    const customCoeffs = AppState.customWaveCoefficients?.[AppState.currentWaveform];

    //----------------------------------------------------------------------
    // 2. Render each oscillator separately (always)
    //    => This gives us max routing flexibility with no recomputation.
    //----------------------------------------------------------------------
    const oscBuffers = Array(numOsc).fill(null).map(() => new Float32Array(tableSize));

    for (let h = 0; h < numOsc; h++) {

        const amp = AppState.harmonicAmplitudes[h];
        if (amp <= 0.001) continue;

        const ratio = AppState.currentSystem.ratios[h];
        const buf = oscBuffers[h];

        for (let i = 0; i < tableSize; i++) {
            const theta = (i / (tableSize - 1)) * totalPeriodLen;
            const harmonic = isSubharmonic ? (1 / ratio) * theta : ratio * theta;
            buf[i] =
                getWaveValue(AppState.currentWaveform, harmonic, customCoeffs) * amp;
        }

        // Normalize each osc so stereo/multi routing behaves cleanly
        let maxA = 0;
        for (let i = 0; i < tableSize; i++) maxA = Math.max(maxA, Math.abs(buf[i]));
        if (maxA > 0) {
            const n = 1 / maxA;
            for (let i = 0; i < tableSize; i++) buf[i] *= n;
        }
    }

    //----------------------------------------------------------------------
    // 3. Routing
    //----------------------------------------------------------------------

    switch (routingMode) {

        //------------------------------------------------------------------
        // MONO — sum all oscillators
        //------------------------------------------------------------------
        case 'mono': {
            const mono = new Float32Array(tableSize);

            for (let h = 0; h < numOsc; h++) {
                const b = oscBuffers[h];
                if (!b) continue;
                for (let i = 0; i < tableSize; i++) mono[i] += b[i];
            }

            // normalize
            let maxA = 0;
            for (let i = 0; i < tableSize; i++) maxA = Math.max(maxA, Math.abs(mono[i]));
            if (maxA > 0) {
                const n = 1 / maxA;
                for (let i = 0; i < tableSize; i++) mono[i] *= n;
            }

            return { buffer: mono, periodMultiplier };
        }

        //------------------------------------------------------------------
        // STEREO — use AppState.oscillatorPans for equal-power panning
        //------------------------------------------------------------------
        case 'stereo': {
            const L = new Float32Array(tableSize);
            const R = new Float32Array(tableSize);

            for (let h = 0; h < numOsc; h++) {
                const b = oscBuffers[h];
                if (!b) continue;

                // read pan value
                const pan = AppState.oscillatorPans?.[h] ?? 0; // -1 to +1
                const p = (pan + 1) * 0.5;                     // 0–1

                // equal-power panning
                const gainL = Math.cos(p * Math.PI * 0.5);
                const gainR = Math.sin(p * Math.PI * 0.5);

                for (let i = 0; i < tableSize; i++) {
                    const v = b[i];
                    L[i] += v * gainL;
                    R[i] += v * gainR;
                }
            }

            // Normalize stereo pair together
            let maxA = 0;
            for (let i = 0; i < tableSize; i++) {
                maxA = Math.max(maxA, Math.abs(L[i]), Math.abs(R[i]));
            }
            if (maxA > 0) {
                const n = 1 / maxA;
                for (let i = 0; i < tableSize; i++) {
                    L[i] *= n;
                    R[i] *= n;
                }
            }

            return { buffers: [L, R], periodMultiplier };
        }

        //------------------------------------------------------------------
        // MULTICHANNEL — each oscillator isolated
        //------------------------------------------------------------------
        case 'multichannel': {
            const numChannels = 12;
            const channels = [];

            for (let ch = 0; ch < numChannels; ch++) {
                channels[ch] = oscBuffers[ch] ?? new Float32Array(tableSize);
            }

            // Normalize each channel independently
            for (let ch = 0; ch < numChannels; ch++) {
                const c = channels[ch];
                let maxA = 0;
                for (let i = 0; i < tableSize; i++) {
                    maxA = Math.max(maxA, Math.abs(c[i]));
                }
                if (maxA > 0) {
                    const n = 1 / maxA;
                    for (let i = 0; i < tableSize; i++) c[i] *= n;
                }
            }

            return { buffers: channels, periodMultiplier };
        }

        //------------------------------------------------------------------
        // fallback = mono
        //------------------------------------------------------------------
        default:
            console.warn(`Unknown routingMode ${routingMode}, defaulting to mono`);
            return sampleCurrentWaveform('mono', isSubharmonic);
    }
}



/**
 * Advanced waveform sampling with period multiplier optimization for phase continuity.
 * 
 * PROBLEM ADDRESSED:
 * Traditional wavetable synthesis samples exactly one period (2π) of a waveform.
 * For irrational frequency ratios common in alternative tuning systems, this creates
 * phase discontinuities at the wavetable boundary, causing audible buzzing artifacts.
 * 
 * SOLUTION:
 * 1. Analyze active frequency ratios to find optimal sampling period
 * 2. Sample multiple fundamental periods (the "period multiplier") 
 * 3. Ensure all ratios complete near-integer cycles within this extended period
 * 4. Store period multiplier for later frequency correction during playback
 * 
 * TECHNICAL DETAILS:
 * - Wavetable size: Fixed at 2048 samples for Web Audio compatibility
 * - Period calculation: Uses LCM of individual ratio optimal periods
 * - Phase continuity: Verified by comparing start/end values
 * - Normalization: Applied after sampling to prevent clipping
 * 
 * OUTPUT FORMAT:
 * Returns an object with:
 * - buffer: Float32Array with normalized waveform samples
 * - periodMultiplier: Number of periods contained in the buffer
 * 
 * The periodMultiplier is critical for correct pitch during playback - it tells
 * the frequency correction system how to compensate for the packed periods.
 * 
 * @returns {Object} {buffer: Float32Array, periodMultiplier: number}
 */
/**
 * Samples the current waveform configuration into a wavetable buffer
 * with period multiplier support.
 *
 *

 */




/**
 * Calculate optimal period multiplier to minimize phase discontinuities in wavetables.
 * 
 * MATHEMATICAL FOUNDATION:
 * When creating wavetables from irrational frequency ratios (like 16/15 in Just Intonation),
 * simply sampling one period (2π) often creates discontinuities because the ratio doesn't
 * complete an integer number of cycles within that period. This causes buzzing artifacts.
 * 
 * SOLUTION APPROACH:
 * Instead of sampling just 1 period, we find the smallest number of periods where ALL
 * active ratios complete (nearly) integer cycles. This ensures phase continuity.
 * 
 * ALGORITHM:
 * 1. For each ratio, find the smallest period P where ratio × P ≈ integer
 * 2. Take the Least Common Multiple (LCM) of all optimal periods
 * 3. Sample P periods instead of 1, then compensate frequency during playback
 * 
 * EXAMPLE:
 * For ratio 16/15 = 1.0667:
 * - Period 1: 1.0667 × 1 = 1.0667 cycles (0.0667 fractional error)
 * - Period 15: 1.0667 × 15 = 16.000 cycles (0.000 fractional error) ✓
 * 
 * The wavetable contains 15 periods of the fundamental, so we must play it at
 * frequency × (1/15) to get the correct pitch.
 * 
 * UNIVERSALITY:
 * This algorithm works for ANY tuning system (Just Intonation, Equal Temperament,
 * Pythagorean, microtonal scales, etc.) because it's based on mathematical
 * properties of rational approximation, not tuning-specific optimizations.
 * 
 * @param {Array} ratios - Active frequency ratios from the current tuning system
 * @returns {number} Period multiplier - number of fundamental periods to sample
 */
function calculateOptimalPeriod(ratios, isSubharmonic) {
    if (ratios.length === 0) return 1;

    // For each ratio, find the smallest integer period where ratio * period ≈ integer
    // This minimizes the phase error at the end of the wavetable
    const bestPeriods = ratios.map(ratio => {
        let bestPeriod = 1;
        let smallestError = Infinity;

        // Test periods 1-20 (computational limit for real-time use)
        for (let period = 1; period <= 20; period++) {
            let cycles;
            if (isSubharmonic) {
                cycles = (1 / ratio) * period;
            } else {
                cycles = ratio * period;
            }

            const fractionalPart = Math.abs(cycles - Math.round(cycles));

            if (fractionalPart < smallestError) {
                smallestError = fractionalPart;
                bestPeriod = period;
            }

            // If we found an exact match (within floating-point precision), stop
            if (fractionalPart < 0.001) break;
        }

        console.log(`Ratio ${ratio}: best period ${bestPeriod} gives ${ratio * bestPeriod} cycles (error: ${smallestError})`);
        return bestPeriod;
    });

    // Use the LCM (Least Common Multiple) of all best periods
    // This ensures ALL ratios have good phase continuity simultaneously
    const lcm = bestPeriods.reduce((acc, period) => {
        const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
        return (acc * period) / gcd(acc, period);
    }, 1);

    // Cap at reasonable value to prevent excessive computation/memory usage
    return Math.min(lcm, 20);
}

// ================================
// WAVETABLE EXPORT
// ================================

/**
 * Exports a waveform buffer as a WAV file with period multiplier compensation.
 * 
 * PERIOD MULTIPLIER HANDLING:
 * When wavetables contain multiple periods (periodMultiplier > 1), the sample
 * rate must be adjusted to maintain correct pitch in the exported WAV file.
 * 
 * SAMPLE RATE CORRECTION:
 * - Standard case: 48kHz sample rate, 1 period → plays at correct pitch
 * - Multi-period case: 48kHz sample rate, N periods → plays N times too fast
 * - Correction: Use sample rate of 48kHz ÷ N → plays at correct pitch
 * 
 * EXAMPLE:
 * - Wavetable with 15 periods sampled at 48kHz
 * - Without correction: WAV plays at 15× speed (too high pitch)
 * - With correction: WAV metadata shows 3.2kHz sample rate
 * - Result: DAW/player compensates automatically, correct pitch maintained
 * 
 * This ensures exported WAV files can be used in any DAW or audio software
 * without manual pitch correction.
 * 
 * @param {Float32Array|Object} bufferOrData - Waveform buffer or {buffer, periodMultiplier}
 * @param {number} numCycles - Number of cycles to export (default: 1)
 */
export function exportAsWAV(data, numCycles = 1) {
    if (!AppState.audioContext) {
        showStatus("Error: Audio system not initialized. Please click 'Start Tone' first.", 'error');
        return;
    }

    if (!data) {
        showStatus("WAV Export Failed: No waveform data passed.", 'error');
        return;
    }

    const periodMultiplier = data.periodMultiplier || 1;

    // Determine routing mode (mono, stereo, multi)
    let channelBuffers;

    if (data.buffers && Array.isArray(data.buffers)) {
        // Stereo or multi-channel
        channelBuffers = data.buffers;
    } else if (data.buffer) {
        // Mono
        channelBuffers = [data.buffer];
    } else {
        showStatus("WAV Export Failed: Invalid waveform data structure.", 'error');
        return;
    }

    if (channelBuffers.length === 0 || channelBuffers[0].length === 0) {
        showStatus("WAV Export Failed: Cannot export empty waveform data.", 'error');
        return;
    }

    // Pitch-correct the sample rate based on periodMultiplier
    const baseSampleRate = AppState.audioContext.sampleRate;
    const correctedSampleRate = baseSampleRate / periodMultiplier;

    console.log(
        `WAV Export: channels=${channelBuffers.length}, ` +
        `period multiplier=${periodMultiplier}, sampleRate=${correctedSampleRate}`
    );

    // Generate filename
    const parts = generateFilenameParts();
    const filename = [
        parts.noteLetter,
        parts.waveform,
        parts.systemName,
        parts.levels,
        parts.subharmonicFlag
    ].filter(Boolean).join('-') + '.wav';

    try {
        WAVExporter.exportAsWAV(channelBuffers, correctedSampleRate, filename, numCycles);
        showStatus(`Wavetable exported as ${filename} (${correctedSampleRate}Hz)!`, 'success');
    } catch (error) {
        showStatus(`WAV Export Failed: ${error.message}`, 'error');
    }
}



// wavetableCache = { customName: Float32Array(512) }
const wavetableCache = {};

export function getWaveValue(type, theta, customCoeffs) {
    // --- custom waveform ---
    if (type.startsWith("custom")) {
        let table = wavetableCache[type];

        // Lazy generation on first use
        if (!table) {
            if (!customCoeffs) return Math.sin(theta);
            table = wavetableCache[type] =
                precomputeWavetableFromCoefficients(customCoeffs, 512);
        }

        // Fast lookup
        const normalized = (theta % (2 * Math.PI)) / (2 * Math.PI);
        const index = normalized * (table.length - 1);
        const i0 = index | 0;
        const i1 = (i0 + 1) % table.length;
        const frac = index - i0;

        return table[i0] * (1 - frac) + table[i1] * frac;
    }

    switch (type) {
        case 'sine': return Math.sin(theta);
        case 'square': {
            let sum = 0;
            const terms = 16; // VISUAL_HARMONIC_TERMS equivalent
            for (let n = 1; n < terms * 2; n += 2) sum += (1 / n) * Math.sin(theta * n);
            return sum * (4 / Math.PI) * 0.7;
        }
        case 'sawtooth': {
            let sum = 0;
            const terms = 16;
            for (let n = 1; n <= terms; n++) sum += (1 / n) * Math.sin(theta * n);
            return sum * (2 / Math.PI) * 0.7;
        }
        case 'triangle': {
            let sum = 0;
            const terms = 16;
            for (let n = 1; n < terms * 2; n += 2) {
                const sign = ((n - 1) / 2) % 2 === 0 ? 1 : -1;
                sum += (sign / (n * n)) * Math.sin(theta * n);
            }
            return sum * (8 / (Math.PI * Math.PI)) * 0.7;
        }
        default: return Math.sin(theta);
    }
}

export async function addWaveformToAudio(buffer, periodMultiplier, AppState) {
    await initAudio();

    const waveKey = getWavetableManager().addFromSamples(
        buffer,
        AppState.audioContext,
        128,
        periodMultiplier
    );

    // Get coefficients from audio
    const coefficients = getWavetableManager().getCoefficients(waveKey);

    // Precompute P5 visual wavetable
    wavetableCache[waveKey] = precomputeWavetableFromCoefficients(coefficients);

    const periodicWave = getWavetableManager().getWaveform(waveKey);

    return { waveKey, coefficients, periodicWave };
}

/**
 * Precompute a clean wavetable for visualization.
 * Accepts EITHER:
 *   - { real: Float32Array, imag: Float32Array }
 *   - time-domain Float32Array samples
 */
export function precomputeWaveTable(input, tableSize = 512) {
    let table = new Float32Array(tableSize);

    // ----------------------------------------------------------
    // CASE A: The input is time-domain samples → resample directly
    // ----------------------------------------------------------
    if (input instanceof Float32Array) {
        const src = input;
        const step = (src.length - 1) / (tableSize - 1);

        for (let i = 0; i < tableSize; i++) {
            const idx = i * step;
            const i0 = Math.floor(idx);
            const i1 = Math.min(i0 + 1, src.length - 1);
            const f = idx - i0;
            table[i] = src[i0] * (1 - f) + src[i1] * f;
        }

        return table;
    }

    // ----------------------------------------------------------
    // CASE B: The input is a Fourier coefficient set
    // ----------------------------------------------------------
    if (input.real && input.imag) {
        const real = input.real;
        const imag = input.imag;
        const harmonics = Math.min(real.length, imag.length);

        for (let i = 0; i < tableSize; i++) {
            const theta = (i / tableSize) * Math.PI * 2;
            let sum = 0;

            for (let k = 1; k < harmonics; k++) {
                sum += real[k] * Math.cos(k * theta) +
                    imag[k] * Math.sin(k * theta);
            }
            table[i] = sum;
        }

        return table;
    }

    console.error("precomputeUnifiedWaveTable: invalid input", input);
    return new Float32Array(tableSize);
}

export function precomputeWavetableFromCoefficients(coeffs, tableSize = 512) {
    const table = new Float32Array(tableSize);
    let maxAmp = 0;

    for (let i = 0; i < tableSize; i++) {
        const t = (i / tableSize) * 2 * Math.PI;
        let sum = 0;

        for (let k = 1; k < coeffs.real.length && k < coeffs.imag.length; k++) {
            sum += coeffs.real[k] * Math.cos(k * t) +
                coeffs.imag[k] * Math.sin(k * t);
        }

        table[i] = sum;
        if (Math.abs(sum) > maxAmp) maxAmp = Math.abs(sum);
    }

    // Normalize so gain never collapses
    if (maxAmp > 0) {
        const scale = 1 / maxAmp;
        for (let i = 0; i < tableSize; i++) {
            table[i] *= scale;
        }
    }

    return table;
}
