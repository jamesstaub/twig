/**
 * overtone-gate — AudioWorkletProcessor that gates a voice per oscillator
 * cycle, for rhythmic/polyrhythmic use at subaudible frequencies (and
 * granular AM effects at audible ones).
 *
 * The processor tracks its own phase from the `frequency` parameter (kept in
 * sync with the voice's oscillator by the AudioEngine). Every time the phase
 * wraps — one full cycle — it decides whether the next cycle is audible:
 *
 *   mode 0  off          always open (bypass)
 *   mode 1  alternating  x cycles on, then y cycles off
 *   mode 2  euclidean    x pulses distributed over y cycles (Bjorklund)
 *   mode 3  probability  each cycle is on with x percent probability
 *   mode 4  sequence     arbitrary 0/1 step pattern, sent over the port as
 *                        { type: 'sequence', steps: [1,0,1,…] }
 *
 * Gate edges are shaped with a ~1 ms one-pole ramp to avoid clicks beyond
 * the ones the waveform itself provides.
 *
 * This runs entirely on the audio thread: no main-thread timers, so gating
 * stays sample-accurate even when the page (jweb) is throttled or hidden.
 *
 * NOTE: this file is loaded via audioWorklet.addModule() and must remain
 * dependency-free (it is served as-is, not bundled).
 */

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
        ];
    }

    constructor() {
        super();
        this.phase = 0;
        this.cycle = 0;
        this.gateTarget = null; // decided on first process() once params exist
        this.gain = 1;
        this.patternState = { pattern: null, patternKey: '' };
        this.smooth = 1 - Math.exp(-1 / (0.001 * sampleRate));
        // Worklet processors returning true are kept alive indefinitely;
        // the engine posts 'stop' when the voice is torn down
        this.stopped = false;
        this.port.onmessage = (e) => {
            if (e.data === 'stop') {
                this.stopped = true;
            } else if (e.data && e.data.type === 'sequence') {
                this.patternState.customSeq = Array.isArray(e.data.steps) ? e.data.steps : null;
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

    process(inputs, outputs, parameters) {
        if (this.stopped) return false;
        const input = inputs[0];
        const output = outputs[0];
        if (!input || input.length === 0 || !output || output.length === 0) return true;

        const freq = parameters.frequency;
        const mode = parameters.mode[0] | 0;
        const x = parameters.x[0];
        const y = parameters.y[0];

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
            }
            this.gain += (this.gateTarget - this.gain) * this.smooth;
            for (let ch = 0; ch < output.length; ch++) {
                const inCh = input[ch] || input[0];
                output[ch][i] = inCh[i] * this.gain;
            }
        }
        return true;
    }
}

registerProcessor('overtone-gate', OvertoneGateProcessor);
