/**
 * overtone-gate — the per-voice sequencer, on the audio thread.
 *
 * Each voice has one of these between its level and drive stages. It runs
 * the voice's own clock (cycleClock.js), builds ONE unipolar 0-1
 * modulation signal from a pattern and a contour (gateSignal.js), and
 * sends that signal to its destinations (modTargets.js) — the gated audio
 * on output 0, a control signal per target on the outputs after it. It
 * also reports the voice's rhythm to the main thread: a `pulse` per cycle
 * and, for the voice driving the MIDI clock, a `clock` per beat
 * (clockBeats.js).
 *
 * This file is the WIRING: the parameters, the port protocol and the
 * sample loop. What a pattern or a destination actually is lives in
 * js/dsp/gate/ — patterns and contours are shared with the app, so the
 * preview draws exactly what this plays.
 *
 * Everything here runs on the audio thread: no main-thread timers, so
 * sequencing stays sample-accurate even when the page (jweb) is throttled
 * or hidden.
 *
 * PORT — in:
 *   'stop'                                  tear down (the processor ends)
 *   { type: 'phase', at }                   restart the cycle at that audio-clock time
 *   { type: 'sequence', steps }             the `sequence` pattern's 0/1 steps
 *   { type: 'contourTable', table }         the `custom` contour's 0-1 table
 *   { type: 'seriesConfig', ratios, baseStep }  the cutoff target's series curve
 * PORT — out (a cross-thread contract; see modules/pulse/pulseBus.js):
 *   { type: 'pulse', lead, cycle, gateOn, frequency, audioTime }
 *   { type: 'clock', frequency, fold, audioTime }
 *
 * NOTE: bundled by build.js to dist/gate-processor.js, which is what
 * addModule() loads — edit the sources here, then `npm run build`.
 */

import { CycleClock, PAST_MIDPOINT, WRAPPED } from '../gate/cycleClock.js';
import { ClockBeats } from '../gate/clockBeats.js';
import { GateSignal } from '../gate/gateSignal.js';
import { audioGain, MOD_TARGETS } from '../gate/modTargets.js';

/** Pulses are the rhythm regime only: above this they would flood the port. */
const PULSE_MAX_HZ = 50;

/** Where in its cycle a pulse lands, and so where its lead is announced. */
const PULSE_AT_START = 0;
const PULSE_AT_MIDPOINT = 0.5;

class OvertoneGateProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            // The voice's CYCLE rate: its pitch for an oscillator, its loop
            // rate for a sampler. Everything here counts in these cycles.
            { name: 'cycleRate', defaultValue: 440, minValue: 0, maxValue: 24000, automationRate: 'a-rate' },
            // The voice's PITCH, when the cycle isn't it (a sampler's loop).
            // Only the cutoff target reads it. 0 = the cycle rate is the pitch.
            { name: 'pitch', defaultValue: 0, minValue: 0, maxValue: 24000, automationRate: 'k-rate' },

            // --- which cycles sound (js/dsp/gate/patterns.js) ---
            { name: 'pattern', defaultValue: 0, minValue: 0, maxValue: 64, automationRate: 'k-rate' },
            // The pattern's two values; what they mean is its own (cycles
            // on/off, pulses in steps, percent…)
            { name: 'patternX', defaultValue: 1, minValue: 0, maxValue: 1024, automationRate: 'k-rate' },
            { name: 'patternY', defaultValue: 1, minValue: 0, maxValue: 1024, automationRate: 'k-rate' },

            // --- the shape within a cycle (js/dsp/gate/contours.js) ---
            // Room for contours yet to be added: an id clamped by the param
            // would silently play a different shape
            { name: 'contour', defaultValue: 0, minValue: 0, maxValue: 64, automationRate: 'k-rate' },
            // Cycles one turn of the contour spans: 2 = half-speed LFO,
            // 1/64 = 64 turns per cycle. Cycle-locked either way.
            { name: 'contourStretch', defaultValue: 1, minValue: 1 / 64, maxValue: 64, automationRate: 'k-rate' },

            // --- how far the signal drives each destination ---
            { name: 'depthGain', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'depthCutoff', defaultValue: 0, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
            { name: 'depthRes', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'depthWet', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'depthFeedback', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            // The bases of the bounded destinations, so their modulated sum
            // can be clamped here (feedback ≥ 1 would run away)
            { name: 'baseWet', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'baseFeedback', defaultValue: 0, minValue: -0.99, maxValue: 0.99, automationRate: 'k-rate' },

            // --- what the voice reports ---
            { name: 'pulseOut', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            // Where in the cycle the pulse lands: 0 = its start (with the
            // gate transition), 0.5 = its midpoint ("offset pulse 50%")
            { name: 'pulseOffset', defaultValue: 0, minValue: 0, maxValue: 0.5, automationRate: 'k-rate' },
            // This voice drives the MIDI clock: a beat message per clock
            // beat, at any voice rate (folded), so no frequency cap
            { name: 'clockOut', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        ];
    }

    constructor() {
        super();
        this.clock = new CycleClock();
        this.signal = new GateSignal();
        this.beats = new ClockBeats();
        this.stopped = false;
        // The block's parameter snapshot, reused every block and handed to
        // the targets (no per-sample allocation on the audio thread)
        this.params = {
            depthGain: 1, depthCutoff: 0, depthRes: 0, depthWet: 0, depthFeedback: 0,
            baseWet: 0, baseFeedback: 0, ratios: null, baseStep: 0, tone: 0,
        };
        this.port.onmessage = (e) => this.receive(e.data);
    }

    receive(message) {
        if (message === 'stop') {
            // Processors live as long as process() returns true; the engine
            // says when a voice is gone
            this.stopped = true;
            return;
        }
        switch (message?.type) {
            case 'phase':
                this.clock.scheduleRestart(message.at);
                break;
            case 'sequence':
                this.signal.steps = Array.isArray(message.steps) ? message.steps : null;
                break;
            case 'contourTable':
                this.signal.table = message.table || null;
                break;
            case 'seriesConfig':
                this.params.ratios = message.ratios || null;
                this.params.baseStep = message.baseStep || 0;
                break;
        }
    }

    /**
     * Tell the main thread about a cycle's pulse, at one of the two
     * half-cycle points around it. At the pulse's own phase this is the
     * LANDING; at the other it is the LEAD for the pulse landing half a
     * cycle later — which, announced from the midpoint, belongs to the NEXT
     * cycle, so that cycle's gate is decided now and kept for the wrap.
     */
    postPulse(at, offset, rate, frame, pattern, ctx) {
        const lead = at !== offset;
        const announcesNext = lead && at === PULSE_AT_MIDPOINT;
        this.port.postMessage({
            type: 'pulse',
            lead,
            cycle: announcesNext ? this.clock.cycle + 1 : this.clock.cycle,
            gateOn: announcesNext
                ? this.signal.preroll(pattern, this.clock.cycle + 1, ctx)
                : this.signal.open,
            frequency: rate,
            // This exact emission point: a lead's pulse lands half a period
            // after it, however late the message arrives
            audioTime: currentFrame / sampleRate + frame / sampleRate,
        });
    }

    postClockBeat(beatRate, frame) {
        this.port.postMessage({
            type: 'clock',
            // The BEAT's rate — consumers place the boundary half a beat
            // after audioTime, as they do a pulse's
            frequency: beatRate,
            fold: this.beats.fold,
            audioTime: currentFrame / sampleRate + frame / sampleRate,
        });
    }

    process(inputs, outputs, parameters) {
        if (this.stopped) return false;
        const input = inputs[0];
        const output = outputs[0];
        if (!input || input.length === 0 || !output || output.length === 0) return true;

        // --- the block's parameters ---
        const rates = parameters.cycleRate;
        const pitch = parameters.pitch[0];
        const pattern = parameters.pattern[0] | 0;
        const contour = parameters.contour[0] | 0;
        const stretch = parameters.contourStretch[0] || 1;
        const pulseOut = parameters.pulseOut[0] >= 0.5;
        const pulseAt = parameters.pulseOffset[0] >= 0.25 ? PULSE_AT_MIDPOINT : PULSE_AT_START;
        const clockOut = parameters.clockOut[0] >= 0.5;
        const p = this.params;
        p.depthGain = parameters.depthGain[0];
        p.depthCutoff = parameters.depthCutoff[0];
        p.depthRes = parameters.depthRes[0];
        p.depthWet = parameters.depthWet[0];
        p.depthFeedback = parameters.depthFeedback[0];
        p.baseWet = parameters.baseWet[0];
        p.baseFeedback = parameters.baseFeedback[0];

        const ctx = this.signal.context(parameters.patternX[0], parameters.patternY[0]);
        // Off: the voice passes through untouched and every CV rests at 0
        const bypass = GateSignal.bypasses(pattern);

        const frames = output[0].length;
        let beatRatio = 0;
        if (clockOut) beatRatio = this.beats.follow(rates[0], this.clock.position);
        else this.beats.release();

        // The first block decides the gate outright — there is no previous
        // state to ramp from
        if (this.signal.open === null) {
            this.signal.snap(this.signal.gateFor(pattern, this.clock.cycle, ctx));
            this.signal.retune(rates[0], sampleRate);
        }

        // A sampler's player (re)started: its loop is cycle 0 from there
        const restartFrame = this.clock.beginBlock(currentFrame / sampleRate, frames, rates[0], sampleRate);
        // The destinations' buffers, in target order (a CV output the host
        // did not ask for is simply absent)
        const cvs = MOD_TARGETS.map((target) => outputs[target.output]?.[0] ?? null);

        for (let i = 0; i < frames; i++) {
            const rate = rates.length > 1 ? rates[i] : rates[0];
            if (i === restartFrame) {
                this.clock.restart();
                this.signal.restart();
                this.signal.setOpen(this.signal.gateFor(pattern, 0, ctx));
                if (clockOut) this.beats.rebaseline(this.clock.position);
            }

            const events = this.clock.advance(rate, sampleRate);
            if (events & WRAPPED) {
                this.signal.setOpen(this.signal.gateFor(pattern, this.clock.cycle, ctx));
                this.signal.retune(rate, sampleRate);
                if (pulseOut && rate <= PULSE_MAX_HZ) this.postPulse(PULSE_AT_START, pulseAt, rate, i, pattern, ctx);
            }
            if ((events & PAST_MIDPOINT) && pulseOut && rate <= PULSE_MAX_HZ) {
                this.postPulse(PULSE_AT_MIDPOINT, pulseAt, rate, i, pattern, ctx);
            }
            if (clockOut && this.beats.reached(this.clock.position) !== null) {
                this.postClockBeat(rate * beatRatio, i);
            }

            // --- the signal, and where it goes ---
            // Always advanced, bypassed or not: the ramp has to be where the
            // gate is by the time the sequencer is switched back on
            const signal = this.signal.next(contour, this.clock.position, stretch);
            const s = bypass ? 1 : signal;
            const gain = bypass ? 1 : audioGain(s, p.depthGain);
            for (let ch = 0; ch < output.length; ch++) {
                const inCh = input[ch] || input[0];
                output[ch][i] = inCh[i] * gain;
            }
            p.tone = pitch > 0 ? pitch : rate;
            for (let t = 0; t < MOD_TARGETS.length; t++) {
                const cv = cvs[t];
                if (cv) cv[i] = bypass ? 0 : MOD_TARGETS[t].value(s, p);
            }
        }
        return true;
    }
}

registerProcessor('overtone-gate', OvertoneGateProcessor);
