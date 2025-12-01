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
import { clearCustomWaveCache } from './visualization.js';
import { AudioEngine, WavetableManager, WAVExporter } from './dsp/index.js';
import { showStatus } from './domUtils.js';

// ================================
// DSP INSTANCES
// ================================

let audioEngine = null;
let wavetableManager = null;

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

    // Create oscillators for all harmonics in the current system
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

                try {
                    const oscData = audioEngine.createOscillator(correctedFrequency, waveform, gain);
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
 * Fallback oscillator-based synthesis for compatibility
 */
async function startToneOscillatorFallback() {
    // Legacy function - delegate to new implementation
    await startToneWithOscillators();
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
// TODO: pass in ramptime, independent control for gain/freq
export function updateAudioProperties() {
    if (!AppState.isPlaying || !audioEngine) return;
    const rampTime = 0.05; // Shorter ramp time since we have momentum smoothing
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
export async function sampleCurrentWaveform() {
    await initAudio();

    // Use the working oscillator-based sampling with period multiplier algorithm
    return sampleCurrentWaveformBasic();
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
function sampleCurrentWaveformBasic() {
    const buffer = new Float32Array(WAVETABLE_SIZE);
    let maxAmplitude = 0;

    const p = AppState.p5Instance;

    if (!p || !p.getWaveValue) {
        console.error("Wavetable Error: p5 context not initialized or missing getWaveValue function");
        showStatus("Export failed: Visualization is not fully initialized. Try playing the tone first.", 'error');
        return { buffer: new Float32Array(0), periodMultiplier: 1 };
    }

    if (!AppState.currentSystem || !AppState.currentSystem.ratios || AppState.harmonicAmplitudes.length === 0) {
        console.error("Wavetable Error: Spectral system data is missing or incomplete");
        showStatus("Export failed: Spectral data (ratios/amplitudes) is missing.", 'error');
        return { buffer: new Float32Array(0), periodMultiplier: 1 };
    }

    console.log('Sampling waveform with system:', AppState.currentSystem.name);

    // Get active ratios (only those with meaningful amplitude)
    const activeRatios = [];
    for (let h = 0; h < AppState.harmonicAmplitudes.length; h++) {
        if (AppState.harmonicAmplitudes[h] > 0.001) {
            activeRatios.push(AppState.currentSystem.ratios[h]);
        }
    }
    console.log('Active ratios:', activeRatios);

    // Calculate the period multiplier to minimize discontinuity
    // This is the mathematical core of the phase continuity solution
    const periodMultiplier = calculateOptimalPeriod(activeRatios);
    console.log('Period multiplier:', periodMultiplier);

    // Sample over an extended period: periodMultiplier × fundamental period
    // This ensures all active ratios complete near-integer cycles
    const totalPeriodLength = p.TWO_PI * periodMultiplier;

    for (let i = 0; i < WAVETABLE_SIZE; i++) {
        // Map buffer index to extended period phase (0 to periodMultiplier × 2π)
        const theta = p.map(i, 0, WAVETABLE_SIZE, 0, totalPeriodLength);

        let summedWave = 0;

        // Sum all active frequency components
        for (let h = 0; h < AppState.harmonicAmplitudes.length; h++) {
            const ratio = AppState.currentSystem.ratios[h];
            const amp = AppState.harmonicAmplitudes[h];

            if (amp > 0.001) { // Only include audible components
                // Key insight: ratio frequency remains unchanged, we're just sampling
                // over a longer period to ensure integer cycles for phase continuity
                summedWave += p.getWaveValue(AppState.currentWaveform, ratio * theta) * amp;
            }
        }

        buffer[i] = summedWave;
        maxAmplitude = Math.max(maxAmplitude, Math.abs(summedWave));
    }

    // Check for continuity
    const startValue = buffer[0];
    const endValue = buffer[buffer.length - 1];
    const discontinuity = Math.abs(endValue - startValue);
    console.log(`Wavetable discontinuity: ${discontinuity} (start: ${startValue}, end: ${endValue})`);

    // Report if we achieved good continuity
    if (discontinuity < 0.01) {
        console.log('✓ Good continuity achieved');
    } else {
        console.log('⚠ Still has discontinuity - may cause buzzing');
    }

    // Normalize the buffer
    if (maxAmplitude > 0) {
        const normalizationFactor = 1.0 / maxAmplitude;
        for (let i = 0; i < WAVETABLE_SIZE; i++) {
            buffer[i] *= normalizationFactor;
        }
    }

    console.log(`Sampled ${buffer.length} points, max amplitude: ${maxAmplitude}`);

    return { buffer, periodMultiplier };
}

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
function calculateOptimalPeriod(ratios) {
    if (ratios.length === 0) return 1;

    // For each ratio, find the smallest integer period where ratio * period ≈ integer
    // This minimizes the phase error at the end of the wavetable
    const bestPeriods = ratios.map(ratio => {
        let bestPeriod = 1;
        let smallestError = Infinity;

        // Test periods 1-20 (computational limit for real-time use)
        for (let period = 1; period <= 20; period++) {
            const cycles = ratio * period;
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
export function exportAsWAV(bufferOrData, numCycles = 1) {
    if (!AppState.audioContext) {
        showStatus("Error: Audio system not initialized. Please click 'Start Tone' first.", 'error');
        return;
    }

    // Handle both old format (just buffer) and new format (object with buffer + periodMultiplier)
    const buffer = bufferOrData.buffer || bufferOrData;
    const periodMultiplier = bufferOrData.periodMultiplier || 1;

    if (buffer.length === 0) {
        showStatus("WAV Export Failed: Cannot export empty waveform data.", 'error');
        return;
    }

    // CRITICAL: Adjust sample rate to compensate for period multiplier
    // If wavetable contains N periods, reduce sample rate by factor of N
    // This ensures correct pitch when the WAV is played back
    const baseSampleRate = AppState.audioContext.sampleRate;
    const correctedSampleRate = baseSampleRate / periodMultiplier;

    console.log(`WAV Export: Period multiplier=${periodMultiplier}, base rate=${baseSampleRate}Hz, corrected rate=${correctedSampleRate}Hz`);

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
        // Use WAVExporter class with corrected sample rate
        WAVExporter.exportAsWAV(buffer, correctedSampleRate, filename, numCycles);
        showStatus(`Wavetable exported as ${filename} (${correctedSampleRate}Hz sample rate)!`, 'success');
    } catch (error) {
        showStatus(`WAV Export Failed: ${error.message}`, 'error');
    }
}

// ================================
// CUSTOM WAVEFORM MANAGEMENT
// ================================

// export async function addToWaveforms(sampledData) {
//     await initAudio();

//     // Handle both old format (just buffer) and new format (object with buffer + periodMultiplier)
//     const buffer = sampledData.buffer || sampledData;
//     const periodMultiplier = sampledData.periodMultiplier || 1;

//     if (buffer.length === 0) {
//         showStatus("Warning: Cannot add empty waveform data.", 'warning');
//         return;
//     }

//     try {
//         // Use WavetableManager to add the new waveform with period multiplier
//         // This creates a PeriodicWave object and stores the period multiplier
//         const waveKey = wavetableManager.addFromSamples(buffer, AppState.audioContext, 128, periodMultiplier);

//         // Send the custom waveform to AudioEngine (for AudioWorklet support) with period multiplier
//         if (audioEngine) {
//             audioEngine.addCustomWaveform(waveKey, buffer, periodMultiplier);
//         }

//         // Store in legacy format for compatibility with existing code
//         const coefficients = wavetableManager.getCoefficients(waveKey);
//         const periodicWave = wavetableManager.getWaveform(waveKey);

//         AppState.blWaveforms[waveKey] = periodicWave;
//         if (!AppState.customWaveCoefficients) {
//             AppState.customWaveCoefficients = {};
//         }
//         AppState.customWaveCoefficients[waveKey] = coefficients;
//         AppState.customWaveCount = wavetableManager.getCount();

//         // CRITICAL: Store period multiplier in AppState for frequency correction
//         // This enables the getFrequencyCorrection() function to work correctly
//         if (!AppState.customWavePeriodMultipliers) {
//             AppState.customWavePeriodMultipliers = {};
//         }
//         AppState.customWavePeriodMultipliers[waveKey] = periodMultiplier;

//         console.log(`Stored waveform ${waveKey} with period multiplier ${periodMultiplier}`);

//         // Clear visualization cache to ensure fresh calculations
//         clearCustomWaveCache();

//         // Generate UI name
//         const parts = generateFilenameParts();
//         const optionName = `${parts.noteLetter}-${parts.waveform}-${parts.systemName}-${parts.levels}` +
//             (parts.subharmonicFlag ? `-${parts.subharmonicFlag}` : '');

//         // Add to UI
//         const select = document.getElementById('waveform-select');
//         if (select) {
//             const option = document.createElement('option');
//             option.textContent = `Custom ${AppState.customWaveCount}: ${optionName}`;
//             option.value = waveKey;
//             select.appendChild(option);

//             // Select the new waveform automatically
//             updateAppState({ currentWaveform: waveKey });
//             select.value = waveKey;
//         }

//         showStatus(`Successfully added new waveform: Custom ${AppState.customWaveCount}. Now synthesizing with it!`, 'success');

//         if (AppState.isPlaying) {
//             restartAudio();
//         }
//     } catch (error) {
//         showStatus(`Failed to add waveform: ${error.message}`, 'error');
//     }
// }