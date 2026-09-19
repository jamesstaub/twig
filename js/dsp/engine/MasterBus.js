/**
 * MASTER BUS — everything downstream of the voices:
 *
 *   input (compressor) → master gain → limiter → destination
 *                                          └→ analyser (oscilloscope tap)
 *
 * plus the recording tap points: the limiter output (what reaches the
 * speakers) and one persistent mono stem tap per voice index.
 */

import { setParam } from './Stage.js';

export class MasterBus {
    constructor(ctx, gain) {
        this.ctx = ctx;
        const { compressor, limiter } = MasterBus.createDynamics(ctx);
        this.limiter = limiter;

        /** Where voices — and anything that should sound like them — connect. */
        this.input = compressor;

        this.gain = ctx.createGain();
        this.gain.gain.value = gain;

        compressor.connect(this.gain);
        this.gain.connect(limiter);
        limiter.connect(ctx.destination);

        // Output tap for the oscilloscope: what actually leaves the chain.
        // An AnalyserNode is a sink; nothing downstream, no rendering cost
        // until something reads it.
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0;
        limiter.connect(this.analyser);

        // Stable per-voice-index tap points for stem recording; voices come
        // and go (system switches, restarts) but these persist
        this.stemTaps = new Map();

        // Frames the dynamics delay everything they pass — see measureLatency
        this.latencyFrames = 0;
    }

    setGain(gain, ramp) {
        setParam(this.gain.gain, gain, this.ctx.currentTime, ramp);
    }

    /**
     * Persistent mono tap carrying voice `index`'s finished signal (after
     * drive/filter/convolution, before pan and the master chain).
     */
    stemTap(index) {
        let tap = this.stemTaps.get(index);
        if (!tap) {
            tap = this.ctx.createGain();
            this.stemTaps.set(index, tap);
        }
        return tap;
    }

    /**
     * Graph nodes a recorder should capture for a mode: the limiter output
     * (what reaches the speakers — lagging by latencyFrames) or one stem
     * tap per voice index.
     * @returns {{taps: AudioNode[], channelsPerTap: number, latencyFrames: number}}
     */
    recordingTaps(mode, voiceCount = 0) {
        if (mode === 'multitrack') {
            const taps = Array.from({ length: voiceCount }, (_, i) => this.stemTap(i));
            return { taps, channelsPerTap: 1, latencyFrames: 0 };
        }
        return { taps: [this.limiter], channelsPerTap: mode === 'mono' ? 1 : 2, latencyFrames: this.latencyFrames };
    }

    /**
     * The master dynamics: a gentle compressor feeding a fast limiter. One
     * factory for the live graph and the latency probe so their settings
     * can't drift apart.
     */
    static createDynamics(ctx) {
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.01;
        compressor.release.value = 0.20;

        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -6; // headroom
        limiter.ratio.value = 12;
        limiter.attack.value = 0.005;
        limiter.release.value = 0.15;
        return { compressor, limiter };
    }

    /**
     * Frames of delay the compressor → limiter chain adds (each
     * DynamicsCompressor has a fixed look-ahead pre-delay), so recordings
     * tapped after them can be re-aligned to the voices' own timeline.
     * Rendered offline with an impulse: the output's peak position is the
     * latency.
     */
    static async measureLatency(sampleRate) {
        try {
            const length = 4096;
            const offline = new OfflineAudioContext(1, length, sampleRate);
            const impulse = offline.createBuffer(1, length, sampleRate);
            impulse.getChannelData(0)[0] = 0.1; // well under threshold: no gain reduction
            const source = offline.createBufferSource();
            source.buffer = impulse;
            const { compressor, limiter } = MasterBus.createDynamics(offline);
            source.connect(compressor);
            compressor.connect(limiter);
            limiter.connect(offline.destination);
            source.start(0);
            const rendered = await offline.startRendering();
            const data = rendered.getChannelData(0);
            let peak = 0, at = 0;
            for (let i = 0; i < data.length; i++) {
                const v = Math.abs(data[i]);
                if (v > peak) { peak = v; at = i; }
            }
            return peak > 0 ? at : 0;
        } catch (err) {
            console.warn('[audio] master latency probe failed — assuming 0:', err);
            return 0;
        }
    }
}
