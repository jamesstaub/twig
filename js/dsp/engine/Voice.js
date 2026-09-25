/**
 * VOICE — one overtone's signal chain, composed from stages:
 *
 *   source → envelope → level → modulator → drive → filter → convolution → pan → master
 *                                                      └→ meter           └→ stem tap
 *
 * with the modulator's control signals summed into the filter's cutoff and
 * resonance and the convolution's wet and feedback gains.
 *
 * Every stage exists for every voice, built in its "off" (passthrough)
 * state, so any feature can be enabled mid-playback without rewiring. A
 * voice is built neutral and then given its parameters through set() — the
 * same path live updates take, so nothing is written in two places.
 *
 * @typedef {Object} VoiceParams - every key optional; set() applies those present
 * @property {Object} waveform - { a: WaveSlot, b?: WaveSlot, morph?: 0-1 } — see SourceStage.setWaveform
 * @property {Object} sample - { buffer, loop, baseFrequency, range } — a sampler head's file, see SourceStage.setSample
 * @property {Object} clock - { frequency, at } — an external head's cycle rate and the audio time
 *   its cycle started (the mono sample player); null frequency = the voice's pitch again
 * @property {number} frequency - Hz: the voice's pitch (each wave slot corrects for its
 *   own table period; the modulator's clock runs at the audible table's rate)
 * @property {number} gain - Drawbar level, 0-1
 * @property {boolean} envelopeOpen - true pins the envelope at unity (Drone)
 * @property {Object} gate - { mode, x, y, seq } — see ModulatorStage.setGate
 * @property {Object} sequencer - { shape, stretch, amounts, table, config }
 * @property {boolean} pulseOut - Emit pulse messages, one pulse per cycle
 * @property {boolean} pulseOffset - Pulses land at 50% of the cycle, not its start
 * @property {boolean} clockOut - Emit a clock message per (octave-folded) beat
 * @property {number} drive - Overdrive amount, 0-5
 * @property {Object} filter - { cutoff (Hz), q }
 * @property {Object} convolution - { wet, feedback, gain, buffer, period }
 * @property {number} pan - −1..1
 */

import { SourceStage } from './stages/source.js';
import { EnvelopeStage } from './stages/envelope.js';
import { LevelStage } from './stages/level.js';
import { ModulatorStage } from './stages/modulator.js';
import { DriveStage } from './stages/drive.js';
import { FilterStage } from './stages/filter.js';
import { ConvolutionStage } from './stages/convolution.js';
import { PanStage } from './stages/pan.js';
import { MeterStage } from './stages/meter.js';

/** Default smoothing of a live parameter change, seconds (no zipper noise). */
const DEFAULT_RAMP = 0.02;

/** Teardown: ~2 ms fade constant, nodes cut 15 ms later. */
const TEARDOWN_TAU = 0.002;
const TEARDOWN_MS = 15;

/**
 * Parameter → the stage setters it drives, in the order they apply (the
 * waveform decides the table periods the pitch and clock divide by). The
 * parameters that span stages are visible here and nowhere else: the
 * pitch — and the waveform's period — also set the modulator's clock,
 * and the modulator clamps its wet/feedback control signals against the
 * convolution's base values.
 */
const APPLY = {
    waveform(s, waveform, time, ramp) {
        s.source.setWaveform(waveform, time, ramp);
        s.modulator.setFrequency(s.source.clockFrequency, time, ramp);
    },
    sample(s, sample, time, ramp) {
        const restartedAt = s.source.setSample(sample, time, ramp);
        s.modulator.setFrequency(s.source.clockFrequency, time, ramp);
        if (restartedAt !== null) s.modulator.resetPhase(restartedAt);
    },
    clock(s, { frequency, at }, time, ramp) {
        s.source.setClock(frequency ?? null);
        s.modulator.setFrequency(s.source.clockFrequency, time, ramp);
        if (at != null) s.modulator.resetPhase(at);
    },
    frequency(s, hz, time, ramp) {
        s.source.setFrequency(hz, time, ramp);
        s.modulator.setFrequency(s.source.clockFrequency, time, ramp);
        s.modulator.setPitch(hz, time, ramp);
    },
    gain: (s, gain, time, ramp) => s.level.setGain(gain, time, ramp),
    envelopeOpen: (s, open, time, ramp) => s.envelope.setOpen(open, time, ramp),
    gate: (s, gate, time) => s.modulator.setGate(gate, time),
    sequencer: (s, sequencer, time) => s.modulator.setSequencer(sequencer, time),
    pulseOut: (s, enabled, time) => s.modulator.setPulseOut(enabled, time),
    pulseOffset: (s, offset, time) => s.modulator.setPulseOffset(offset, time),
    clockOut: (s, enabled, time) => s.modulator.setClockOut(enabled, time),
    drive: (s, amount) => s.drive.setAmount(amount),
    filter: (s, filter, time, ramp) => s.filter.set(filter, time, ramp),
    convolution(s, conv, time, ramp) {
        s.convolution.set(conv, time, ramp);
        if (conv.wet !== undefined) s.modulator.setBase('wet', conv.wet, time, ramp);
        if (conv.feedback !== undefined) s.modulator.setBase('feedback', conv.feedback, time, ramp);
    },
    pan: (s, pan, time, ramp) => s.pan.setPan(pan, time, ramp),
};

export class Voice {
    /**
     * @param {AudioContext} ctx
     * @param {Object} head - What the voice is made of (fixed for its lifetime)
     * @param {AudioNode|null} head.external - Shared source to tap instead of oscillators
     * @param {boolean} [head.sampler] - A per-voice sample player instead of oscillators
     * @param {number|null} head.startAt - Audio-clock time to start at (null = now)
     * @param {function(Object)} head.onPulse - Receives the modulator's pulse messages
     * @param {VoiceParams} params - Initial parameters
     */
    constructor(ctx, { external, sampler = false, startAt, onPulse }, params) {
        this.ctx = ctx;
        const s = this.stages = {
            source: new SourceStage(ctx, { external, sampler }),
            envelope: new EnvelopeStage(ctx),
            level: new LevelStage(ctx),
            modulator: new ModulatorStage(ctx, onPulse),
            drive: new DriveStage(ctx),
            filter: new FilterStage(ctx),
            convolution: new ConvolutionStage(ctx),
            pan: new PanStage(ctx),
            meter: new MeterStage(ctx),
        };

        chain(s.source, s.envelope, s.level, s.modulator, s.drive, s.filter, s.convolution, s.pan);
        s.filter.output.connect(s.meter.input);
        s.modulator.route({
            cutoff: [s.filter.cutoff],
            q: [s.filter.q],
            wet: s.convolution.wetCV,
            feedback: s.convolution.feedbackCV,
        });

        this.set(params, 0);
        const at = s.source.start(startAt ?? 0);
        // A sampler's cycle is its loop: align the clock with the first play
        if (s.source.sample) s.modulator.resetPhase(at || ctx.currentTime);
    }

    /**
     * Join the master bus: the panned signal into `bus`, the finished mono
     * signal (before pan) into the voice's stem tap.
     */
    connect(bus, stemTap) {
        this.stages.pan.output.connect(bus);
        this.stages.convolution.output.connect(stemTap);
    }

    /**
     * Apply a (partial) set of parameters.
     * @param {VoiceParams} params
     * @param {number} [ramp] - Smoothing in seconds; 0 writes a step
     */
    set(params, ramp = DEFAULT_RAMP) {
        const time = this.ctx.currentTime;
        for (const name of Object.keys(APPLY)) {
            if (params[name] !== undefined) APPLY[name](this.stages, params[name], time, ramp);
        }
    }

    /** Gate the envelope on: { a, d, s } in seconds / level. */
    attack(envelope) {
        this.stages.envelope.attack(envelope, this.ctx.currentTime);
    }

    /** A sampler head: play the sample again from its start. */
    retrigger() {
        const at = this.stages.source.retrigger(this.ctx.currentTime);
        if (at !== null) this.stages.modulator.resetPhase(at);
    }

    /** Gate the envelope off: { r } in seconds. */
    release(envelope) {
        this.stages.envelope.release(envelope, this.ctx.currentTime);
    }

    /** Instantaneous envelope level, 0..1. */
    get envelopeLevel() {
        return this.stages.envelope.level;
    }

    /** Instantaneous peak level (0-1), post gate and filter. */
    level() {
        return this.stages.meter.level();
    }

    /**
     * Fade out, then unhook. An abrupt stop is a click — and the
     * convolution loop would repeat it. A throttled timer only delays the
     * cleanup of an already-silent voice.
     */
    stop() {
        const now = this.ctx.currentTime;
        this.stages.level.fadeOut(now, TEARDOWN_TAU);
        this.stages.convolution.fadeOut(now, TEARDOWN_TAU);
        this.stages.source.stop(now + TEARDOWN_MS / 1000);
        setTimeout(() => {
            for (const stage of Object.values(this.stages)) stage.dispose();
        }, TEARDOWN_MS);
    }
}

function chain(...stages) {
    for (let i = 1; i < stages.length; i++) stages[i - 1].output.connect(stages[i].input);
}
