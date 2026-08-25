/**
 * AUDIO MODULE
 *
 * Web Audio graph management, oscillator voice control, and wavetable baking.
 *
 * Baked wavetables span `periodMultiplier` fundamental periods so that every
 * active partial — including irrational ratios from alternative tuning
 * systems — lands on an integer Fourier bin (see js/dsp/PartialSpectrum.js).
 * Playback compensates by running the oscillator at freq / periodMultiplier;
 * WAV export compensates via the file's sample-rate header.
 */

import { AppState, ENVELOPE_DEFAULTS, midiConfig, updateAppState, WAVETABLE_SIZE } from './config.js';
import { calculateFrequency, generateFilenameParts, getVoicePan } from './utils.js';

import { AudioEngine, WavetableManager, WAVExporter, WaveformGenerator } from './dsp/index.js';
import { sourceManager } from './dsp/SourceManager.js';
import { midiOutputRouter } from './modules/midi/midiOutputRouter.js';
import {
    buildSpectrum,
    chooseBeatPreservingPeriod,
    normalizeBuffers,
    renderSpectrum,
    spectrumPeak,
} from './dsp/PartialSpectrum.js';
import { showStatus } from './domUtils.js';

// Highest Fourier bin a bake may occupy. Browser PeriodicWave tables are
// 4096 samples at standard rates (2048 partials); this also keeps renders
// below Nyquist of the WAVETABLE_SIZE export buffers.
const MAX_SPECTRUM_BIN = 2047;

// ================================
// DSP INSTANCES
// ================================

let audioEngine = null;
let wavetableManager = null;

// Pulse consumer (the pulse bus) — registered before the engine exists,
// attached when initAudio constructs it
let pulseHandler = null;
export function setPulseHandler(fn) {
    pulseHandler = fn;
    if (audioEngine) audioEngine.onPulse = fn;
}

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
 * Initializes the AudioContext and the audio graph.
 * Concurrent callers share one in-flight initialization — a second caller
 * must never see a constructed-but-uninitialized engine (voices created
 * against one throw and are silently lost).
 */
let audioInitPromise = null;

export async function initAudio() {
    if (!audioInitPromise) {
        audioInitPromise = (async () => {
            audioEngine = new AudioEngine();
            wavetableManager = new WavetableManager();

            // Initialize the audio engine with oscillator-only synthesis
            await audioEngine.initialize(AppState.masterGainValue);

            // Voice cycle pulses → pulse bus
            audioEngine.onPulse = pulseHandler;

            // Store references for compatibility
            AppState.audioContext = audioEngine.getContext();
            AppState.compressor = audioEngine.compressor;
            AppState.masterGain = audioEngine.masterGain;
        })();
    }
    await audioInitPromise;

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
 * Starts synthesis using oscillators with period multiplier frequency correction.
 * Re-entrancy guard: startTone yields between its isPlaying check and set,
 * so overlapping calls (double space, local + bridged play) would otherwise
 * each build a voice bank — the extras orphaned as ungated, unstoppable
 * drones. One start at a time; the rest are no-ops.
 */
let startPending = false;

export async function startTone() {
    if (startPending) return;
    startPending = true;
    try {
        await initAudio();
        if (AppState.isPlaying) return;
        await startToneWithOscillators();
        updateAppState({ isPlaying: true });
        // MIDI transport start on the clock port, scheduled to the voices'
        // audible onset (they started at the current audio-clock time)
        midiOutputRouter.sendTransportStart(AppState.audioContext.currentTime);
    } catch (error) {
        console.error('Failed to start synthesis:', error);
        throw error;
    } finally {
        startPending = false;
    }
}

/**
 * Create, start, and register the voice for partial `i` at `gain` — an
 * oscillator, or a tap on the shared external source when one is passed.
 * Used at tone start and when a system switch adds partials mid-playback.
 */
function createHarmonicOscillator(i, ratio, gain) {
    // In an external source mode, every voice taps the shared source node
    // (also covers voices created mid-playback by a system switch)
    const source = AppState.sourceMode !== 'oscillators' ? sourceManager.node : null;
    const frequency = calculateFrequency(ratio);
    const waveform = resolveWaveform(AppState.currentWaveform);
    // External-source voices skip period correction — there is no packed
    // wavetable playing; frequency only tunes the filter and gate clock
    const frequencyCorrection = source ? 1 : getFrequencyCorrection(AppState.currentWaveform);
    const correctedFrequency = frequency * frequencyCorrection;

    const oscData = audioEngine.createOscillator(correctedFrequency, waveform, gain, {
        source,
        pan: getVoicePan(i),
        gate: AppState.oscillatorGates[i],
        drive: AppState.oscillatorDrives[i] || 0,
        filter: {
            cutoff: harmonicFilterCutoff(i, frequency),
            q: AppState.oscillatorFilters[i]?.q,
        },
        pulseOut: harmonicPulseEnabled(i),
        sequencer: harmonicSequencerPayload(i),
        envelopeOpen: AppState.envelopeMode !== 'adsr',
    });
    const oscKey = `harmonic_${i}`;
    audioEngine.addOscillator(oscKey, oscData);
    while (AppState.oscillators.length <= i) {
        AppState.oscillators.push(null);
    }
    AppState.oscillators[i] = { key: oscKey, ratio: ratio };
    return AppState.oscillators[i];
}

/**
 * Individual oscillator-based synthesis with period multiplier frequency correction
 */
async function startToneWithOscillators() {
    // Clear any existing oscillators
    AppState.oscillators = [];

    // External source modes: one shared node feeds every voice chain in
    // place of its oscillator (see SourceManager). Voices keep their
    // frequency identity for the pitch-tracked filters and gate clocks.
    if (AppState.sourceMode !== 'oscillators') {
        try {
            await sourceManager.prepare(AppState.audioContext, AppState.sourceMode, {
                deviceId: AppState.adcDeviceId,
                channel: AppState.adcChannel,
            });
        } catch (error) {
            console.error(`Source '${AppState.sourceMode}' unavailable:`, error);
            showStatus(`Source unavailable (${error.message}) — using oscillators`, 'warning');
        }
    }

    const numPartials = AppState.currentSystem.ratios.length;
    for (let i = 0; i < AppState.harmonicAmplitudes.length; i++) {
        if (i < numPartials) {
            const ratio = AppState.currentSystem.ratios[i];
            const amplitude = AppState.harmonicAmplitudes[i] || 0;
            if (ratio > 0) {
                try {
                    createHarmonicOscillator(i, ratio, amplitude * AppState.masterGainValue);
                } catch (error) {
                    console.error(`Failed to create oscillator ${i}:`, error);
                    AppState.oscillators[i] = null;
                }
            } else {
                AppState.oscillators[i] = null;
            }
        } else {
            // Partial beyond this system's count: no voice, but KEEP its
            // stored amplitude — the store is grow-only so a return to a
            // larger system restores the drawbars
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
    sourceManager.dispose();

    midiOutputRouter.sendTransportStop();

    updateAppState({
        oscillators: [],
        isPlaying: false
    });
}

/**
 * Update a single harmonic's gain node directly — the low-latency path for
 * drawbar moves (UI or MIDI CC). Smoothing happens on the audio thread via
 * setTargetAtTime, so this has no dependency on requestAnimationFrame.
 */
export function updateHarmonicAmplitude(index, rampTime = AppState.masterSlewValue) {
    if (!AppState.isPlaying || !audioEngine) return;

    const node = AppState.oscillators[index];
    if (node && node.key) {
        const amplitude = AppState.harmonicAmplitudes[index] || 0;
        audioEngine.updateOscillatorGain(node.key, amplitude * AppState.masterGainValue, rampTime);
    } else {
        // No oscillator behind this index (system switched mid-playback) —
        // fall back to a full sync, which creates it
        updateAudioProperties();
    }
}

const MIN_AUDIBLE_HZ = 20;

/**
 * Cutoff for a voice's lowpass — an overtone series within the overtone
 * series: the multiplier is a 1-based partial index into the CURRENT
 * system's ratio table, applied to the voice's audible base frequency
 * (the lowest integer multiple of the voice's own pitch that clears 20 Hz;
 * an already-audible voice is its own base).
 *
 * So on the Harmonic Series a 12 Hz voice gives 24, 48, 72 … Hz for
 * partials 1, 2, 3 — but on a stretched or inharmonic system the cutoffs
 * land on THAT system's partials instead. Indexes beyond the system's
 * partial count clamp to its last ratio. The series always multiplies
 * upward, regardless of the subharmonic toggle — a lowpass below the
 * voice would just mute it. No multiplier set (or <= 0) → filter open.
 */
export const MAX_FILTER_PARTIALS = 24;

/**
 * Ratio of the `step`-th filter partial (1-based) under the current system.
 * Steps beyond the system's ratio table continue the series geometrically
 * from its last interval — exact for equal-division systems (BP), and a
 * musically consistent extrapolation for tabulated ones.
 */
export function filterPartialRatio(step) {
    const ratios = AppState.currentSystem.ratios;
    const count = ratios.length;
    const clamped = Math.min(MAX_FILTER_PARTIALS, Math.max(1, Math.round(step)));
    if (clamped <= count) return Math.abs(ratios[clamped - 1]) || 1;
    const last = Math.abs(ratios[count - 1]) || 1;
    const prev = count > 1 ? Math.abs(ratios[count - 2]) || 1 : 1;
    const interval = last > prev && prev > 0 ? last / prev : 2;
    return last * Math.pow(interval, clamped - count);
}

export function harmonicFilterCutoff(index, frequency) {
    const multiplier = AppState.oscillatorFilters[index]?.multiplier;
    if (!(multiplier > 0) || !(frequency > 0)) return 20000;
    const base = frequency * Math.max(1, Math.ceil(MIN_AUDIBLE_HZ / frequency));
    return Math.min(20000, Math.max(10, base * filterPartialRatio(multiplier)));
}

// Shape names → worklet shape indices (5 = custom table)
const SHAPE_INDICES = { square: 0, sine: 1, triangle: 2, sawtooth: 3 };

/**
 * Resolve a sequencer config into the engine payload: shape index, amounts,
 * custom 0-1 contour table when the shape is a custom waveform, and the
 * cutoff-CV curve (extended ratio table + the filter's base partial index).
 */
function harmonicSequencerPayload(index) {
    const seq = AppState.oscillatorSequencers[index] || {};
    const shapeName = seq.shape || 'square';
    let shape = SHAPE_INDICES[shapeName];
    let table;
    if (shape === undefined) {
        // Custom waveform: bake its cycle into a min-max-normalized 0-1 table
        shape = 5;
        const coeffs = AppState.customWaveCoefficients?.[shapeName];
        if (coeffs) {
            const raw = precomputeWavetableFromCoefficients(coeffs, 512);
            let min = Infinity, max = -Infinity;
            for (const v of raw) { if (v < min) min = v; if (v > max) max = v; }
            const span = max - min || 1;
            table = Float32Array.from(raw, (v) => (v - min) / span);
        } else {
            shape = 0; // unknown custom name — fall back to the hard gate
        }
    }
    return {
        shape,
        stretch: seq.stretch || 1,
        amounts: { gain: 1, freq: 0, res: 0, ...seq.amounts },
        ...(table !== undefined ? { table } : {}),
        config: {
            ratios: Array.from({ length: MAX_FILTER_PARTIALS }, (_, k) => filterPartialRatio(k + 1)),
            baseStep: AppState.oscillatorFilters[index]?.multiplier || 0,
        },
    };
}

/**
 * Apply the sequencer config for one harmonic to its running voice.
 */
export function updateHarmonicSequencer(index) {
    if (!AppState.isPlaying || !audioEngine) return;
    const node = AppState.oscillators[index];
    if (node && node.key) {
        audioEngine.updateOscillatorSequencer(node.key, harmonicSequencerPayload(index));
    }
}

/**
 * Live peak level (0-1) of one harmonic's voice, post gate/filter — for UI
 * amplitude indicators. Cheap enough to poll per animation frame.
 */
export function getVoiceLevel(index) {
    if (!AppState.isPlaying || !audioEngine) return 0;
    const node = AppState.oscillators[index];
    return node && node.key ? audioEngine.getVoiceLevel(node.key) : 0;
}

/** True when any pulse consumer (MIDI, OSC, clock) wants this voice's cycles. */
export function harmonicPulseEnabled(index) {
    const out = AppState.oscillatorPulseOuts[index];
    return Boolean(
        (out?.midi ?? midiConfig.pulseMidiEnabled) ||
        (out?.osc ?? midiConfig.pulseOscEnabled) ||
        AppState.midiClockVoice === index
    );
}

/** Re-evaluate pulse emission for every voice (after a global toggle). */
export function updateAllHarmonicPulses() {
    for (let i = 0; i < AppState.currentSystem.ratios.length; i++) {
        updateHarmonicPulse(i);
    }
}

/**
 * Apply the pulse-output enable for one harmonic to its running voice.
 */
export function updateHarmonicPulse(index) {
    if (!AppState.isPlaying || !audioEngine) return;
    const node = AppState.oscillators[index];
    if (node && node.key) {
        audioEngine.updateOscillatorPulse(node.key, harmonicPulseEnabled(index));
    }
}

/** ADSR of one harmonic, with unset fields falling back to the defaults. */
function harmonicEnvelope(index) {
    return { ...ENVELOPE_DEFAULTS, ...AppState.oscillatorEnvelopes[index] };
}

/**
 * Gate one harmonic's ADSR on (attack → decay → sustain). Only meaningful
 * in ADSR mode — in Open mode the envelope is pinned at unity.
 */
export function triggerHarmonicAttack(index) {
    if (AppState.envelopeMode !== 'adsr' || !AppState.isPlaying || !audioEngine) return;
    const node = AppState.oscillators[index];
    if (node && node.key) {
        audioEngine.triggerOscillatorAttack(node.key, harmonicEnvelope(index));
    }
}

/** Gate one harmonic's ADSR off (release to silence). */
export function triggerHarmonicRelease(index) {
    if (AppState.envelopeMode !== 'adsr' || !AppState.isPlaying || !audioEngine) return;
    const node = AppState.oscillators[index];
    if (node && node.key) {
        audioEngine.triggerOscillatorRelease(node.key, harmonicEnvelope(index));
    }
}

/**
 * Live envelope level (0..1) of one harmonic, for visualizations. Unity in
 * Open mode (the envelope is pinned); in ADSR mode the instantaneous
 * envelope gain of the running voice — 0 when closed, silent, or stopped.
 */
export function harmonicEnvelopeLevel(index) {
    if (AppState.envelopeMode !== 'adsr') return 1;
    if (!AppState.isPlaying || !audioEngine) return 0;
    const node = AppState.oscillators[index];
    if (!node?.key) return 0;
    return audioEngine.getOscillatorEnvelopeLevel(node.key);
}

/**
 * Apply the current envelope mode to every running voice: Open pins the
 * envelopes at unity, ADSR rests them silent until triggered.
 */
export function updateAllHarmonicEnvelopeModes() {
    if (!AppState.isPlaying || !audioEngine) return;
    const open = AppState.envelopeMode !== 'adsr';
    for (const node of AppState.oscillators) {
        if (node && node.key) {
            audioEngine.setOscillatorEnvelopeOpen(node.key, open);
        }
    }
}

/**
 * Apply the cycle-gate config for one harmonic to its running voice.
 * State-only when not playing — configs land at the next tone start.
 */
export function updateHarmonicGate(index) {
    if (!AppState.isPlaying || !audioEngine) return;
    const node = AppState.oscillators[index];
    if (node && node.key) {
        audioEngine.updateOscillatorGate(node.key, AppState.oscillatorGates[index] || { mode: 0 });
    }
}

/**
 * Apply the stereo pan for one harmonic to its running voice.
 */
export function updateHarmonicPan(index) {
    if (!AppState.isPlaying || !audioEngine) return;
    const node = AppState.oscillators[index];
    if (node && node.key) {
        audioEngine.updateOscillatorPan(node.key, getVoicePan(index), AppState.masterSlewValue);
    }
}

/**
 * Apply the overdrive amount for one harmonic to its running voice.
 */
export function updateHarmonicDrive(index) {
    if (!AppState.isPlaying || !audioEngine) return;
    const node = AppState.oscillators[index];
    if (node && node.key) {
        audioEngine.updateOscillatorDrive(node.key, AppState.oscillatorDrives[index] || 0);
    }
}

/**
 * Apply the lowpass config for one harmonic to its running voice.
 */
export function updateHarmonicFilter(index) {
    if (!AppState.isPlaying || !audioEngine) return;
    const node = AppState.oscillators[index];
    if (node && node.key) {
        const frequency = calculateFrequency(AppState.currentSystem.ratios[index]);
        audioEngine.updateOscillatorFilter(
            node.key,
            {
                cutoff: harmonicFilterCutoff(index, frequency),
                q: AppState.oscillatorFilters[index]?.q,
            },
            AppState.masterSlewValue
        );
        // The cutoff-CV curve is anchored on the filter's base step
        updateHarmonicSequencer(index);
    }
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
let lastSeqConfigSystem = null;

function updateAudioPropertiesOscillators(rampTime) {
    // Update Master Gain
    audioEngine.updateMasterGain(AppState.masterGainValue, rampTime);

    // A system switch changes the sequencer's cutoff-CV ratio curve —
    // push it to every voice once per switch (not per parameter tweak)
    const seqCurveStale = AppState.currentSystem !== lastSeqConfigSystem;
    lastSeqConfigSystem = AppState.currentSystem;

    // Sync the oscillator bank with the current system: systems can have
    // different partial counts, so a switch mid-playback may add partials
    // (create their oscillators) or drop them (mute, keep for reuse).
    const numPartials = AppState.currentSystem.ratios.length;
    const count = Math.max(numPartials, AppState.oscillators.length);

    for (let i = 0; i < count; i++) {
        let node = AppState.oscillators[i];

        if (i >= numPartials) {
            // Partial absent from the current system
            if (node && node.key) {
                audioEngine.updateOscillatorGain(node.key, 0, rampTime);
            }
            continue;
        }

        const ratio = AppState.currentSystem.ratios[i];
        const amplitude = AppState.harmonicAmplitudes[i] || 0;
        let newGain = amplitude * AppState.masterGainValue;

        if (!node || !node.key) {
            if (!(ratio > 0)) continue;
            try {
                // Create silent; the gain ramp below fades it in
                node = createHarmonicOscillator(i, ratio, 0);
            } catch (error) {
                console.error(`Failed to create oscillator ${i}:`, error);
                continue;
            }
        }

        if (seqCurveStale) updateHarmonicSequencer(i);

        node.ratio = ratio;
        const baseFreq = calculateFrequency(ratio);
        const frequencyCorrection = getFrequencyCorrection(AppState.currentWaveform);
        const newFreq = baseFreq * frequencyCorrection;

        // Prevent non-finite frequency values
        if (!isFinite(newFreq) || isNaN(newFreq)) {
            newGain = 0;
        } else {
            audioEngine.updateOscillatorFrequency(node.key, newFreq, rampTime);
            // The lowpass cutoff is relative to the voice's pitch — retarget
            // it so filters track fundamental glides and system changes
            audioEngine.updateOscillatorFilter(
                node.key,
                { cutoff: harmonicFilterCutoff(i, baseFreq) },
                rampTime
            );
        }
        audioEngine.updateOscillatorGain(node.key, newGain, rampTime);
    }
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
// WAVETABLE BAKING
// ================================

// Standard primitives as spectra over their own fundamental. Peaks are
// cached so a baked partial's loudness matches live playback, where
// PeriodicWave normalization gives every primitive a time-domain peak of 1.
const primitiveSources = {};

function resolvePrimitiveSource(waveformName) {
    if (waveformName?.startsWith('custom_')) {
        const coeffs = AppState.customWaveCoefficients?.[waveformName];
        if (coeffs) {
            const source = {
                real: coeffs.real,
                imag: coeffs.imag,
                period: AppState.customWavePeriodMultipliers?.[waveformName] || 1,
            };
            return {
                source,
                peak: spectrumPeak(source, 2 * Math.max(2048, coeffs.real.length)),
            };
        }
        // Unknown custom key — fall through to sine
        waveformName = 'sine';
    }

    const type = ['square', 'sawtooth', 'triangle'].includes(waveformName)
        ? waveformName
        : 'sine';
    if (!primitiveSources[type]) {
        let source;
        if (type === 'sine') {
            source = { real: new Float32Array(2), imag: Float32Array.from([0, 1]), period: 1 };
        } else {
            const imag = Float32Array.from(WaveformGenerator.getFourierCoefficients(type, 128));
            source = { real: new Float32Array(imag.length), imag, period: 1 };
        }
        primitiveSources[type] = { source, peak: spectrumPeak(source) };
    }
    return primitiveSources[type];
}

/**
 * Gathers the active drawbar partials as bake inputs: effective ratio,
 * peak-matched amplitude, pan (for stereo export), and a creation-Nyquist
 * cap on the primitive's overtone stack so the bake carries the same
 * bandwidth the live voices have at the current fundamental.
 */
function collectBakePartials(isSubharmonic) {
    const { source, peak } = resolvePrimitiveSource(AppState.currentWaveform);
    const nyquist = AppState.audioContext.sampleRate / 2;
    const f0 = AppState.fundamentalFrequency;
    const partials = [];

    for (let h = 0; h < AppState.harmonicAmplitudes.length; h++) {
        const amp = AppState.harmonicAmplitudes[h] || 0;
        const r = AppState.currentSystem.ratios[h];
        // Amplitude store is grow-only and can outlive the system's table
        if (amp <= 0.001 || !(r > 0)) continue;

        const ratio = isSubharmonic ? 1 / r : r;
        partials.push({
            index: h,
            ratio,
            amplitude: amp / peak,
            pan: AppState.oscillatorPans?.[h] ?? 0,
            source,
            maxSourceBin: Math.floor((nyquist * source.period) / (ratio * f0)),
        });
    }
    return partials;
}

/**
 * Bakes the current drawbar timbre into a Fourier spectrum on a bin grid
 * spanning `periodMultiplier` fundamental periods. Every partial occupies
 * exactly one bin (and its primitive overtone stack stays harmonic), so the
 * resulting wavetable is loop-continuous with no spectral leakage — the
 * source of the buzzing the old sample-then-DFT path produced on irrational
 * tuning systems.
 *
 * @returns {Promise<Object|null>} { real, imag, periodMultiplier, partials },
 *   or null when no partial is active
 */
export async function buildCurrentSpectrum(isSubharmonic = false) {
    await initAudio();

    if (!AppState.currentSystem?.ratios) {
        console.error('Spectral system missing');
        return null;
    }

    const partials = collectBakePartials(isSubharmonic);
    if (partials.length === 0) return null;

    // The period multiplier trades pitch accuracy against bin budget: a
    // finer grid (higher P) snaps ratios more precisely, but the highest
    // baked component must stay within MAX_SPECTRUM_BIN.
    let maxComponentRatio = 0;
    for (const p of partials) {
        const lastBin = Math.min(
            Math.min(p.source.real.length, p.source.imag.length) - 1,
            p.maxSourceBin
        );
        maxComponentRatio = Math.max(
            maxComponentRatio,
            p.ratio,
            (lastBin / p.source.period) * p.ratio
        );
    }
    const maxPeriod = Math.max(1, Math.floor(MAX_SPECTRUM_BIN / maxComponentRatio));
    // Beat-preserving: among pitch-accurate grids, prefer the smallest one
    // where no two components share a bin, so slow beating between
    // near-coincident components ("shimmer") survives the bake instead of
    // freezing into a static partial.
    const periodMultiplier = chooseBeatPreservingPeriod(partials, maxPeriod, MAX_SPECTRUM_BIN);

    const { real, imag } = buildSpectrum(partials, periodMultiplier, MAX_SPECTRUM_BIN);
    return { real, imag, periodMultiplier, partials };
}

/**
 * Renders the current timbre to time-domain buffers for WAV export.
 * All routing modes render from the same snapped bin grid, so every buffer
 * loops cleanly. Mono and stereo preserve the drawbar mix (normalized once,
 * jointly); multichannel keeps one full-scale stem per oscillator.
 *
 * @param {string} routingMode - 'mono', 'stereo', 'multichannel'
 * @returns {Promise<Object>} { buffer|buffers, periodMultiplier }
 */
export async function sampleCurrentWaveform(routingMode = 'mono', isSubharmonic = false) {
    const spectrum = await buildCurrentSpectrum(isSubharmonic);
    if (!spectrum) return { buffer: new Float32Array(0), periodMultiplier: 1 };

    const { periodMultiplier, partials } = spectrum;
    const tableSize = WAVETABLE_SIZE;

    const renderPartial = (partial) =>
        renderSpectrum(buildSpectrum([partial], periodMultiplier, MAX_SPECTRUM_BIN), tableSize);

    switch (routingMode) {
        case 'stereo': {
            const left = new Float32Array(tableSize);
            const right = new Float32Array(tableSize);

            for (const partial of partials) {
                const buf = renderPartial(partial);
                const p = (partial.pan + 1) * 0.5;
                const gainL = Math.cos(p * Math.PI * 0.5);
                const gainR = Math.sin(p * Math.PI * 0.5);
                for (let i = 0; i < tableSize; i++) {
                    left[i] += buf[i] * gainL;
                    right[i] += buf[i] * gainR;
                }
            }

            normalizeBuffers([left, right]);
            return { buffers: [left, right], periodMultiplier };
        }

        case 'multichannel': {
            const numChannels = 12;
            const channels = Array.from(
                { length: numChannels },
                () => new Float32Array(tableSize)
            );

            for (const partial of partials) {
                if (partial.index >= numChannels) continue;
                const buf = renderPartial(partial);
                normalizeBuffers([buf]);
                channels[partial.index] = buf;
            }

            return { buffers: channels, periodMultiplier };
        }

        default: {
            const mono = renderSpectrum(spectrum, tableSize);
            normalizeBuffers([mono]);
            return { buffer: mono, periodMultiplier };
        }
    }
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



// Visual lookup tables for custom waves. Baked spectra occupy bins up to
// MAX_SPECTRUM_BIN, so tables need 2× that many samples to draw cleanly.
const VISUAL_TABLE_SIZE = 4096;
const wavetableCache = {};

export function getWaveValue(type, theta, customCoeffs) {
    // --- custom waveform ---
    if (type.startsWith("custom")) {
        let table = wavetableCache[type];

        // Lazy generation on first use
        if (!table) {
            if (!customCoeffs) return Math.sin(theta);
            table = wavetableCache[type] =
                precomputeWavetableFromCoefficients(customCoeffs, VISUAL_TABLE_SIZE);
        }

        // Fast lookup: the table holds one loop sampled at i / length, so
        // interpolation wraps modulo the length
        const normalized = (theta % (2 * Math.PI)) / (2 * Math.PI);
        const index = normalized * table.length;
        const i0 = Math.floor(index) % table.length;
        const i1 = (i0 + 1) % table.length;
        const frac = index - Math.floor(index);

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

/**
 * Registers a baked spectrum with the wavetable manager and precomputes its
 * visual lookup table.
 * @param {Object} spectrum - { real, imag, periodMultiplier } from buildCurrentSpectrum
 */
export async function addWaveformToAudio(spectrum) {
    await initAudio();

    const waveKey = getWavetableManager().addFromSpectrum(
        spectrum.real,
        spectrum.imag,
        AppState.audioContext,
        spectrum.periodMultiplier
    );

    const coefficients = getWavetableManager().getCoefficients(waveKey);

    // Precompute P5 visual wavetable
    wavetableCache[waveKey] = precomputeWavetableFromCoefficients(coefficients, VISUAL_TABLE_SIZE);

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
