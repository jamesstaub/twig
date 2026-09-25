/**
 * MODULATOR — the per-voice sequencer worklet (worklets/gate-processor.js,
 * bundled to dist/). Audio passes through output 0, gated; the other
 * outputs are control signals that route() sums into other stages'
 * AudioParams. This file is the only place that knows the worklet's
 * protocol: parameter names, output indices and port messages — the app's
 * own names for these things are translated here.
 *
 * The "off" pattern is a passthrough with every control signal at 0.
 * Pulses — one message per cycle, the app's rhythm taps — still fire when
 * enabled, as do the clock voice's beat messages ({type:'clock'}); both
 * reach the host through onPulse, told apart by `type`.
 */

import { Stage, setParam } from '../Stage.js';

/** The BUILT worklet: its sources are js/dsp/worklets/ + js/dsp/gate/. */
const WORKLET_URL = 'dist/gate-processor.js';
const PROCESSOR_NAME = 'overtone-gate';

/** Worklet output index of each control signal (output 0 is the audio). */
const CV_OUTPUTS = { cutoff: 1, q: 2, wet: 3, feedback: 4 };

/**
 * Control signals that are deltas on a bounded gain: the worklet is told
 * the base value so it can clamp the modulated sum (feedback ≥ 1 would
 * run away).
 */
const CV_BASES = { wet: 'baseWet', feedback: 'baseFeedback' };

/**
 * The app's modulation-depth names → the worklet's, with the value that
 * means "this destination is not driven".
 */
const DEPTHS = {
    gain: ['depthGain', 1],
    freq: ['depthCutoff', 0],
    res: ['depthRes', 0],
    wet: ['depthWet', 0],
    fb: ['depthFeedback', 0],
};

export class ModulatorStage extends Stage {
    /** Load the worklet module — served unbundled, once per context. */
    static load(ctx) {
        return ctx.audioWorklet.addModule(WORKLET_URL);
    }

    /**
     * @param {AudioContext} ctx
     * @param {function(Object)} onPulse - Receives each pulse and clock message
     */
    constructor(ctx, onPulse) {
        super();
        // The audio output plus one mono output per control signal
        const outputs = 1 + Object.keys(CV_OUTPUTS).length;
        this.node = this.own(new AudioWorkletNode(ctx, PROCESSOR_NAME, {
            numberOfOutputs: outputs,
            outputChannelCount: new Array(outputs).fill(1),
        }));
        this.input = this.output = this.node;
        this.node.port.onmessage = (e) => {
            if (e.data?.type === 'pulse' || e.data?.type === 'clock') onPulse(e.data);
        };
    }

    /**
     * Sum control signals into their destinations.
     * @param {Object<string, Array<AudioParam|AudioNode>>} targets - keyed by CV_OUTPUTS name
     */
    route(targets) {
        for (const [name, destinations] of Object.entries(targets)) {
            for (const destination of destinations) this.node.connect(destination, CV_OUTPUTS[name]);
        }
    }

    /** The voice's cycle rate — its pitch, or a sampler's loop rate. */
    setCycleRate(hz, time, ramp) {
        setParam(this.param('cycleRate'), hz, time, ramp);
    }

    /** The voice's pitch, when the clock isn't it (the cutoff-CV curve reads it). */
    setPitch(hz, time, ramp) {
        setParam(this.param('pitch'), hz, time, ramp);
    }

    /** Restart the cycle at audio-clock time `at` (a sampler's player just did). */
    resetPhase(at) {
        this.node.port.postMessage({ type: 'phase', at });
    }

    /** Base value of a clamped control signal's target (see CV_BASES). */
    setBase(name, value, time, ramp) {
        setParam(this.param(CV_BASES[name]), value, time, ramp);
    }

    /**
     * The cycle gate: which cycles sound (a pattern id and its two values —
     * see js/dsp/gate/patterns.js).
     * @param {{mode?: number, x?: number, y?: number, seq?: number[]}} gate
     */
    setGate({ mode = 0, x = 1, y = 1, seq } = {}, time) {
        this.param('pattern').setValueAtTime(mode, time);
        this.param('patternX').setValueAtTime(x, time);
        this.param('patternY').setValueAtTime(y, time);
        // An explicit 0/1 sequence can't travel as an AudioParam
        if (seq !== undefined) this.node.port.postMessage({ type: 'sequence', steps: seq });
    }

    /**
     * The contour within each active cycle and how far it drives each
     * destination. Partial updates: only the fields present are written.
     * @param {Object} seq - { shape (0-6), stretch, amounts: {gain, freq, res, wet, fb},
     *   table (custom 0-1 contour), config: { ratios, baseStep } (the cutoff CV curve) }
     */
    setSequencer({ shape, stretch, amounts, table, config }, time) {
        if (shape !== undefined) this.param('contour').setValueAtTime(shape, time);
        if (stretch !== undefined) this.param('contourStretch').setValueAtTime(stretch, time);
        if (amounts) {
            for (const [name, [param, neutral]] of Object.entries(DEPTHS)) {
                // Only the depths actually passed: the rest keep their value
                // (the app sends the whole set, but a partial one must not
                // silently undrive the others)
                if (name in amounts) this.param(param).setValueAtTime(amounts[name] ?? neutral, time);
            }
        }
        if (table !== undefined) this.node.port.postMessage({ type: 'contourTable', table });
        if (config) this.node.port.postMessage({ type: 'seriesConfig', ratios: config.ratios, baseStep: config.baseStep });
    }

    /** Enable/disable the per-cycle pulse messages. */
    setPulseOut(enabled, time) {
        this.param('pulseOut').setValueAtTime(enabled ? 1 : 0, time);
    }

    /** Where in its cycle a pulse lands: false = the start, true = 50%. */
    setPulseOffset(offset, time) {
        this.param('pulseOffset').setValueAtTime(offset ? 0.5 : 0, time);
    }

    /** Make this voice the MIDI clock source (beat messages) or not. */
    setClockOut(enabled, time) {
        this.param('clockOut').setValueAtTime(enabled ? 1 : 0, time);
    }

    param(name) {
        return this.node.parameters.get(name);
    }

    dispose() {
        // Worklet processors are kept alive while process() returns true —
        // tell this one to die before unhooking it
        this.node.port.postMessage('stop');
        super.dispose();
    }
}
