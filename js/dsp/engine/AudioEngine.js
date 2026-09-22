/**
 * AUDIO ENGINE — the Web Audio backend's front door: the AudioContext's
 * lifecycle, the master bus, and the registry of running voices (keyed by
 * overtone index). The signal chain itself is composed in Voice.js from
 * the stages in stages/; everything downstream of the voices is
 * MasterBus.js.
 *
 * Callers above js/dsp/ drive it with plain data — addVoice(index, spec),
 * voice(index).set(params, ramp) — and never touch a voice's nodes.
 */

import { AudioRecorder } from '../AudioRecorder.js';
import { WaveformGenerator } from '../WaveformGenerator.js';
import { MasterBus } from './MasterBus.js';
import { ModulatorStage } from './stages/modulator.js';
import { Voice } from './Voice.js';

/** Band-limited PeriodicWaves built once per context. */
const STANDARD_WAVEFORMS = ['square', 'sawtooth', 'triangle'];
const STANDARD_WAVEFORM_HARMONICS = 128;

export class AudioEngine {
    constructor() {
        this.context = null;
        this.master = null;
        this.voices = new Map();
        this.standardWaves = new Map();
        this.recorderReady = false;
        /** Receives (voiceIndex, pulse) for every cycle pulse a voice emits. */
        this.onPulse = null;
        this.ready = null;
    }

    /**
     * Create the context and the master bus. Concurrent callers share one
     * in-flight initialization — nobody may see a half-built engine.
     */
    initialize(masterGain = 0.5) {
        this.ready ??= this.build(masterGain);
        return this.ready;
    }

    async build(masterGain) {
        const ctx = new AudioContext();
        // The voice chain is built around the modulator worklet: without it
        // there is no engine, so a failure here fails initialization
        await ModulatorStage.load(ctx);
        // Performance capture (see AudioRecorder)
        try {
            await AudioRecorder.load(ctx);
            this.recorderReady = true;
        } catch (err) {
            console.warn('[audio] recorder worklet unavailable — recording disabled:', err);
        }

        const master = new MasterBus(ctx, masterGain);
        master.latencyFrames = await MasterBus.measureLatency(ctx.sampleRate);

        for (const type of STANDARD_WAVEFORMS) {
            this.standardWaves.set(type, WaveformGenerator.createBandLimitedWaveform(ctx, type, STANDARD_WAVEFORM_HARMONICS));
        }
        // Sine as a table too, so it can sit in a wave slot like any other
        this.standardWaves.set('sine', ctx.createPeriodicWave(new Float32Array([0, 0]), new Float32Array([0, 1])));

        this.context = ctx;
        this.master = master;
    }

    /** Resume the context if the browser suspended it (autoplay policy). */
    async resume() {
        if (this.context?.state === 'suspended') await this.context.resume();
    }

    /** The audio clock, seconds. */
    now() {
        return this.context.currentTime;
    }

    get sampleRate() {
        return this.context.sampleRate;
    }

    /**
     * Build, start and register the voice for overtone `index`.
     * @param {number} index
     * @param {Object} spec - VoiceParams (see Voice.js), plus what the voice is made of:
     * @param {AudioNode|null} [spec.source] - Shared external node to tap instead of oscillators
     * @param {number|null} [spec.startAt] - Audio-clock start time, shared by a
     *   bank to put every voice at phase 0 on the same frame (null = now)
     * @returns {Voice}
     */
    addVoice(index, { source = null, startAt = null, ...params }) {
        if (!this.master) throw new Error('AudioEngine must be initialized before adding voices');
        // A voice already at this index would be orphaned by the overwrite —
        // still connected and sounding, but unreachable. Stop it first.
        this.voices.get(index)?.stop();

        const voice = new Voice(this.context, {
            external: source,
            startAt,
            onPulse: (pulse) => this.onPulse?.(index, pulse),
        }, params);
        voice.connect(this.master.input, this.master.stemTap(index));
        this.voices.set(index, voice);
        return voice;
    }

    /** The running voice of overtone `index`, if any. */
    voice(index) {
        return this.voices.get(index);
    }

    stopAllVoices() {
        for (const voice of this.voices.values()) voice.stop();
        this.voices.clear();
    }

    /** The table of a standard waveform ('sine', 'square', 'sawtooth', 'triangle'). */
    standardWave(name) {
        const wave = this.standardWaves.get(name);
        if (!wave) throw new Error(`Unknown waveform: ${name}`);
        return wave;
    }
}

export const audioEngine = new AudioEngine();
