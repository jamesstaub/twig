/**
 * MODULATOR — the per-voice cycle gate / sequencer worklet
 * (worklets/gate-processor.js). Audio passes through output 0, gated; the
 * other outputs are control signals that route() sums into other stages'
 * AudioParams. This file is the only place that knows the worklet's
 * protocol: parameter names, output indices and port messages.
 *
 * Off (mode 0) is a passthrough with every control signal at 0. Pulses —
 * one message per cycle, the app's clock taps — still fire when enabled.
 */

import { Stage, setParam } from '../Stage.js';

const WORKLET_URL = 'js/dsp/worklets/gate-processor.js';
const PROCESSOR_NAME = 'overtone-gate';

/** Worklet output index of each control signal (output 0 is the audio). */
const CV_OUTPUTS = { cutoff: 1, q: 2, wet: 3, feedback: 4 };

/**
 * Control signals that are deltas on a bounded gain: the worklet is told
 * the base value so it can clamp the modulated sum (feedback ≥ 1 would
 * run away).
 */
const CV_BASES = { wet: 'baseWet', feedback: 'baseFb' };

/** Sequencer modulation depths → worklet parameters, with their neutral values. */
const AMOUNTS = {
    gain: ['amtGain', 1],
    freq: ['amtFreq', 0],
    res: ['amtRes', 0],
    wet: ['amtWet', 0],
    fb: ['amtFb', 0],
};

export class ModulatorStage extends Stage {
    /** Load the worklet module — served unbundled, once per context. */
    static load(ctx) {
        return ctx.audioWorklet.addModule(WORKLET_URL);
    }

    /**
     * @param {AudioContext} ctx
     * @param {function(Object)} onPulse - Receives each cycle's pulse message
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
            if (e.data?.type === 'pulse') onPulse(e.data);
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

    /** The voice's frequency is the modulator's clock. */
    setFrequency(frequency, time, ramp) {
        setParam(this.param('frequency'), frequency, time, ramp);
    }

    /** Base value of a clamped control signal's target (see CV_BASES). */
    setBase(name, value, time, ramp) {
        setParam(this.param(CV_BASES[name]), value, time, ramp);
    }

    /**
     * The cycle gate: which cycles are on.
     * @param {{mode?: number, x?: number, y?: number, seq?: number[]}} gate
     */
    setGate({ mode = 0, x = 1, y = 1, seq } = {}, time) {
        this.param('mode').setValueAtTime(mode, time);
        this.param('x').setValueAtTime(x, time);
        this.param('y').setValueAtTime(y, time);
        // Arbitrary 0/1 patterns can't travel as AudioParams
        if (seq !== undefined) this.node.port.postMessage({ type: 'sequence', steps: seq });
    }

    /**
     * The contour within each active cycle and how far it drives each
     * destination. Partial updates: only the fields present are written.
     * @param {Object} seq - { shape (0-6), stretch, amounts: {gain, freq, res, wet, fb},
     *   table (custom 0-1 contour), config: { ratios, baseStep } (the cutoff CV curve) }
     */
    setSequencer({ shape, stretch, amounts, table, config }, time) {
        if (shape !== undefined) this.param('shape').setValueAtTime(shape, time);
        if (stretch !== undefined) this.param('stretch').setValueAtTime(stretch, time);
        if (amounts) {
            for (const [name, [param, neutral]] of Object.entries(AMOUNTS)) {
                this.param(param).setValueAtTime(amounts[name] ?? neutral, time);
            }
        }
        if (table !== undefined) this.node.port.postMessage({ type: 'shapetable', table });
        if (config) this.node.port.postMessage({ type: 'seqconfig', ratios: config.ratios, baseStep: config.baseStep });
    }

    /** Enable/disable the per-cycle pulse messages. */
    setPulseOut(enabled, time) {
        this.param('pulseOut').setValueAtTime(enabled ? 1 : 0, time);
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
