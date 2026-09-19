/**
 * FILTER — per-voice lowpass. Off is fully open. The cutoff and resonance
 * AudioParams are modulation targets: control signals sum into them while
 * the params keep holding the base values.
 */

import { Stage, setParam } from '../Stage.js';

const OPEN_CUTOFF = 20000;
const FLAT_Q = 0.707;

export class FilterStage extends Stage {
    constructor(ctx) {
        super();
        this.biquad = this.own(ctx.createBiquadFilter());
        this.biquad.type = 'lowpass';
        this.biquad.frequency.value = OPEN_CUTOFF;
        this.biquad.Q.value = FLAT_Q;
        this.input = this.output = this.biquad;
    }

    get cutoff() { return this.biquad.frequency; }
    get q() { return this.biquad.Q; }

    /** @param {{cutoff?: number, q?: number}} filter - cutoff in Hz; ≤ 0 opens the filter */
    set({ cutoff, q }, time, ramp) {
        if (cutoff !== undefined) setParam(this.cutoff, cutoff > 0 ? cutoff : OPEN_CUTOFF, time, ramp);
        if (q !== undefined) setParam(this.q, q, time, ramp);
    }
}
