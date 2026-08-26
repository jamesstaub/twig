/**
 * overtone-gate — per-voice cycle sequencer AudioWorkletProcessor.
 *
 * The processor tracks its own phase from the `frequency` parameter (kept in
 * sync with the voice's oscillator by the AudioEngine) and builds a unipolar
 * control signal per sample:
 *
 *     s = pattern(cycle) × shape(phase)
 *
 * PATTERN (sequence mode) decides which cycles are active:
 *   mode 0  off          no modulation at all — audio passes through
 *                        untouched and the CVs stay at 0; pulses still
 *                        fire every cycle, at each cycle's midpoint
 *                        (use alternating 1/0 for a shape-LFO on every
 *                        cycle)
 *   mode 1  alternating  x cycles on, then y cycles off
 *   mode 2  euclidean    x pulses distributed over y cycles (Bjorklund)
 *   mode 3  probability  each cycle is on with x percent probability
 *   mode 4  sequence     arbitrary 0/1 step pattern, sent over the port as
 *                        { type: 'sequence', steps: [1,0,1,…] }
 * Pattern edges are shaped with a ~1 ms one-pole ramp to avoid clicks.
 *
 * SHAPE is the amplitude contour within each active cycle (`shape` param):
 *   0 square (constant 1 — the classic hard gate), 1 sine (boundary-zero
 *   raised cosine, click-free by construction), 2 triangle (tent),
 *   3 saw decay, 4 saw rise, 5 custom (0-1 table via
 *   { type: 'shapetable', table: Float32Array }).
 *
 * TARGETS: s modulates up to three destinations, scaled by amount params:
 *   output 0  audio     gain = 1 − amtGain × (1 − s)
 *   output 1  freq CV   Hz delta along the overtone-series cutoff curve —
 *             connect to BiquadFilter.frequency (base value stays owned by
 *             the main thread; CV carries only the modulation term). Needs
 *             { type: 'seqconfig', ratios, baseStep } from the port.
 *   output 2  Q CV      amtRes × s × 24 — connect to BiquadFilter.Q
 *
 * Everything runs on the audio thread: no main-thread timers, so sequencing
 * stays sample-accurate even when the page (jweb) is throttled or hidden.
 *
 * NOTE: this file is loaded via audioWorklet.addModule() and must remain
 * dependency-free (it is served as-is, not bundled).
 */

const Q_SPAN = 24;
// Convolution feedback ceiling (mirrors CONV_FEEDBACK_MAX in the actions)
const FB_MAX = 0.99;
const TWO_PI = Math.PI * 2;

// Pulses only make sense in the LFO/rhythm regime; cap protects the port
const PULSE_MAX_HZ = 50;

/** Bjorklund/euclidean rhythm: distribute `pulses` as evenly as possible over `steps`. */
function euclideanPattern(pulses, steps) {
    const pattern = new Array(steps).fill(false);
    if (pulses <= 0) return pattern;
    if (pulses >= steps) return pattern.fill(true);
    // Bresenham formulation — equivalent to Bjorklund up to rotation
    let bucket = 0;
    for (let i = 0; i < steps; i++) {
        bucket += pulses;
        if (bucket >= steps) {
            bucket -= steps;
            pattern[i] = true;
        }
    }
    return pattern;
}

/**
 * Amplitude contour within a cycle, unipolar 0-1.
 * Sine is the boundary-zero raised cosine: active cycles start and end at
 * silence, so pattern transitions are click-free without the declick ramp.
 */
function shapeValue(shape, phase, table) {
    switch (shape) {
        case 1: // sine (raised cosine window)
            return (1 - Math.cos(TWO_PI * phase)) / 2;
        case 2: // triangle (tent)
            return 1 - Math.abs(2 * phase - 1);
        case 3: // saw decay
            return 1 - phase;
        case 4: // saw rise
            return phase;
        case 5: { // custom 0-1 table from the port
            if (!table || table.length === 0) return 1;
            const pos = phase * table.length;
            const i0 = Math.floor(pos) % table.length;
            const i1 = (i0 + 1) % table.length;
            return table[i0] + (table[i1] - table[i0]) * (pos - i0);
        }
        default: // square — constant, the classic hard gate
            return 1;
    }
}

/** Decide whether cycle number `cycle` is audible for the given gate config. */
function gateForCycle(state, cycle, mode, x, y) {
    switch (mode) {
        case 1: { // alternating: x on, y off
            const period = Math.max(1, Math.round(x) + Math.round(y));
            return (cycle % period) < Math.round(x);
        }
        case 2: { // euclidean: x pulses in y slots
            const steps = Math.max(1, Math.round(y));
            const pulses = Math.min(Math.round(x), steps);
            const key = `${pulses}/${steps}`;
            if (state.patternKey !== key) {
                state.pattern = euclideanPattern(pulses, steps);
                state.patternKey = key;
            }
            return state.pattern[cycle % steps];
        }
        case 3: // probability: x percent per cycle
            return Math.random() * 100 < x;
        case 4: { // sequence: explicit 0/1 steps from the port
            const seq = state.customSeq;
            if (!seq || seq.length === 0) return true;
            return seq[cycle % seq.length] > 0.5;
        }
        default: // off / unknown: always open
            return true;
    }
}

class OvertoneGateProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'frequency', defaultValue: 440, minValue: 0, maxValue: 24000, automationRate: 'a-rate' },
            { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 4, automationRate: 'k-rate' },
            { name: 'x', defaultValue: 1, minValue: 0, maxValue: 1024, automationRate: 'k-rate' },
            { name: 'y', defaultValue: 1, minValue: 0, maxValue: 1024, automationRate: 'k-rate' },
            // When 1, each cycle wrap posts a {type:'pulse'} message so the
            // main thread can drive MIDI/OSC/sequencer consumers
            { name: 'pulseOut', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            // Cycle amplitude contour (see shapeValue) and modulation depths
            { name: 'shape', defaultValue: 0, minValue: 0, maxValue: 5, automationRate: 'k-rate' },
            // Shape period in oscillator cycles: 2 = contour spans two
            // cycles (slower LFO), 1/64 = 64 times per cycle. Cycle-locked.
            { name: 'stretch', defaultValue: 1, minValue: 1 / 64, maxValue: 64, automationRate: 'k-rate' },
            { name: 'amtGain', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'amtFreq', defaultValue: 0, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
            { name: 'amtRes', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            // Convolution send modulation. The CVs are deltas summed into
            // the wet/feedback gains, so the bases are passed in to clamp
            // the modulated values (feedback ≥ 1 would run away).
            { name: 'amtWet', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'amtFb', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'baseWet', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'baseFb', defaultValue: 0, minValue: -0.99, maxValue: 0.99, automationRate: 'k-rate' },
        ];
    }

    constructor() {
        super();
        this.phase = 0;
        this.cycle = 0;
        // Pulses fire at each cycle's MIDPOINT (phase 0.5), not the wrap:
        // external MIDI gear adds latency downstream, and the half-cycle
        // lead keeps triggered instruments in step with the audible gate
        this.pulsedThisCycle = false;
        this.gateTarget = null; // decided on first process() once params exist
        this.gain = 1;
        this.patternState = { pattern: null, patternKey: '' };
        this.smooth = 1 - Math.exp(-1 / (0.001 * sampleRate));
        // Worklet processors returning true are kept alive indefinitely;
        // the engine posts 'stop' when the voice is torn down
        this.shapeTable = null;   // custom 0-1 contour
        this.seqRatios = null;    // extended overtone-series ratio table
        this.seqBaseStep = 0;     // filter's base partial index (0 = open)
        this.stopped = false;
        this.port.onmessage = (e) => {
            if (e.data === 'stop') {
                this.stopped = true;
            } else if (e.data && e.data.type === 'sequence') {
                this.patternState.customSeq = Array.isArray(e.data.steps) ? e.data.steps : null;
            } else if (e.data && e.data.type === 'shapetable') {
                this.shapeTable = e.data.table || null;
            } else if (e.data && e.data.type === 'seqconfig') {
                this.seqRatios = e.data.ratios || null;
                this.seqBaseStep = e.data.baseStep || 0;
            }
        };
    }

    /**
     * Declick ramp scaled to the cycle: 1 ms for slow (subaudible) cycles,
     * but never slower than 1/8 of a period, so fast cycles still gate
     * cleanly instead of smearing into a half-open average.
     */
    updateSmoothing(freq) {
        const tau = freq > 0 ? Math.min(0.001, 1 / (freq * 8)) : 0.001;
        this.smooth = 1 - Math.exp(-1 / (tau * sampleRate));
    }

    /**
     * Hz delta between the modulated and base cutoff along the overtone-
     * series curve, for a continuous (interpolated) partial index.
     */
    freqDelta(f, s, amtFreq) {
        const ratios = this.seqRatios;
        const baseStep = this.seqBaseStep;
        if (!ratios || ratios.length === 0 || baseStep < 1 || amtFreq === 0 || !(f > 0)) return 0;

        const n = ratios.length;
        const span = amtFreq > 0 ? n - baseStep : baseStep - 1;
        const idx = Math.min(n, Math.max(1, baseStep + amtFreq * s * span));
        const i0 = Math.floor(idx);
        const frac = idx - i0;
        const r0 = ratios[Math.min(n, i0) - 1];
        const r1 = ratios[Math.min(n, i0 + 1) - 1];
        const ratio = r0 + (r1 - r0) * frac;

        // Audible base: lowest integer multiple of the voice clearing 20 Hz
        const base = f * Math.max(1, Math.ceil(20 / f));
        return base * (ratio - ratios[baseStep - 1]);
    }

    process(inputs, outputs, parameters) {
        if (this.stopped) return false;
        const input = inputs[0];
        const output = outputs[0];
        if (!input || input.length === 0 || !output || output.length === 0) return true;
        const freqCV = outputs[1] && outputs[1][0];
        const qCV = outputs[2] && outputs[2][0];
        const wetCV = outputs[3] && outputs[3][0];
        const fbCV = outputs[4] && outputs[4][0];

        const freq = parameters.frequency;
        const mode = parameters.mode[0] | 0;
        const x = parameters.x[0];
        const y = parameters.y[0];
        // Pulse emission is for the LFO/rhythm regime — above the cap a
        // voice would flood the message port with thousands of events/sec
        const pulseOut = parameters.pulseOut[0] >= 0.5;
        const shape = parameters.shape[0] | 0;
        const stretch = parameters.stretch[0] || 1;
        const amtGain = parameters.amtGain[0];
        const amtFreq = parameters.amtFreq[0];
        const amtRes = parameters.amtRes[0];
        const amtWet = parameters.amtWet[0];
        const amtFb = parameters.amtFb[0];
        const baseWet = parameters.baseWet[0];
        const baseFb = parameters.baseFb[0];

        if (this.gateTarget === null) {
            this.gateTarget = gateForCycle(this.patternState, 0, mode, x, y) ? 1 : 0;
            this.gain = this.gateTarget;
            this.updateSmoothing(freq[0]);
        }

        const frames = output[0].length;
        for (let i = 0; i < frames; i++) {
            const f = freq.length > 1 ? freq[i] : freq[0];
            this.phase += f / sampleRate;
            if (this.phase >= 1) {
                this.phase -= Math.floor(this.phase);
                this.cycle++;
                this.gateTarget = gateForCycle(this.patternState, this.cycle, mode, x, y) ? 1 : 0;
                this.updateSmoothing(f);
                this.pulsedThisCycle = false;
            }
            // Half-cycle pulse: fire once per cycle at phase 0.5 — the
            // opposite end from the gate transition, so externally
            // triggered instruments (which add their own latency) land
            // with the audible cycle instead of trailing it
            if (!this.pulsedThisCycle && this.phase >= 0.5) {
                this.pulsedThisCycle = true;
                if (pulseOut && f <= PULSE_MAX_HZ) {
                    this.port.postMessage({
                        type: 'pulse',
                        cycle: this.cycle,
                        gateOn: this.gateTarget === 1,
                        frequency: f,
                        // Audio-clock time of this exact emission point, so
                        // consumers can schedule against it even when this
                        // message arrives late (throttled main thread)
                        audioTime: currentFrame / sampleRate + i / sampleRate,
                    });
                }
            }
            // Pattern gate (declick-smoothed) × cycle contour = control signal.
            // Mode 0 = sequencer off: pure passthrough, zero modulation.
            this.gain += (this.gateTarget - this.gain) * this.smooth;
            const off = mode === 0;
            // Shape phase spans `stretch` oscillator cycles, staying locked
            // to the cycle counter so patterns and stretch stay in step
            const shapePhase = ((this.cycle + this.phase) / stretch) % 1;
            const s = off ? 1 : this.gain * shapeValue(shape, shapePhase, this.shapeTable);

            // Target: audio gain
            const g = off ? 1 : 1 - amtGain * (1 - s);
            for (let ch = 0; ch < output.length; ch++) {
                const inCh = input[ch] || input[0];
                output[ch][i] = inCh[i] * g;
            }
            // Targets: filter cutoff (Hz delta CV) and resonance (Q CV)
            if (freqCV) freqCV[i] = off ? 0 : this.freqDelta(f, s, amtFreq);
            if (qCV) qCV[i] = off ? 0 : amtRes * s * Q_SPAN;
            // Convolution: contour adds to the base send, clamped to range
            if (wetCV) wetCV[i] = off ? 0 : Math.min(1, baseWet + amtWet * s) - baseWet;
            // Feedback may be negative (inverting loop): modulation pushes
            // its magnitude toward the ceiling, keeping the sign
            if (fbCV) fbCV[i] = off ? 0 : Math.max(-FB_MAX, Math.min(FB_MAX, baseFb + Math.sign(baseFb || 1) * amtFb * s)) - baseFb;
        }
        return true;
    }
}

registerProcessor('overtone-gate', OvertoneGateProcessor);
