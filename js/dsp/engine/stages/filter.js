/**
 * FILTER — one per-voice biquad: lowpass, bandpass or highpass. Off is
 * fully open. The cutoff and resonance AudioParams are modulation targets:
 * control signals sum into them while the params keep holding the base
 * values.
 *
 * "Open" is a BYPASS, not a wide-open filter of the chosen type: a highpass
 * parked at 20 kHz would be silence and a bandpass has no open state at
 * all. So while the cutoff is off the biquad is a 20 kHz lowpass whatever
 * type is selected, and the selection takes effect as soon as a cutoff
 * does. The type is remembered either way, so it can be chosen before the
 * cutoff is raised.
 */

import { Stage, setParam } from '../Stage.js';

const OPEN_CUTOFF = 20000;
const FLAT_Q = 0.707;

/** Biquad types this stage offers (config.js FILTER_TYPES is the app's list). */
const TYPES = new Set(['lowpass', 'bandpass', 'highpass']);

export class FilterStage extends Stage {
    constructor(ctx) {
        super();
        this.biquad = this.own(ctx.createBiquadFilter());
        this.biquad.type = 'lowpass';
        this.biquad.frequency.value = OPEN_CUTOFF;
        this.biquad.Q.value = FLAT_Q;
        this.input = this.output = this.biquad;
        /** The type asked for; what the biquad runs is this or the bypass. */
        this._type = 'lowpass';
        this._open = true;
    }

    get cutoff() { return this.biquad.frequency; }
    get q() { return this.biquad.Q; }

    /**
     * @param {Object} filter
     * @param {number} [filter.cutoff] - Hz; ≤ 0 opens (bypasses) the filter
     * @param {number} [filter.q]
     * @param {string} [filter.type] - 'lowpass' | 'bandpass' | 'highpass'
     */
    set({ cutoff, q, type }, time, ramp) {
        if (type !== undefined && TYPES.has(type)) this._type = type;
        if (cutoff !== undefined) {
            // OPEN is 20 kHz app-wide — `harmonicFilterCutoff` has already
            // turned "no cutoff" into that by the time it arrives here, and
            // clamps real cutoffs to it too. Either way there is nothing
            // above it to pass or reject, so it is the bypass.
            this._open = !(cutoff > 0) || cutoff >= OPEN_CUTOFF;
            setParam(this.cutoff, this._open ? OPEN_CUTOFF : cutoff, time, ramp);
        }
        if (q !== undefined) setParam(this.q, q, time, ramp);
        // Switching a biquad's type keeps its coefficients' history, so it
        // is click-free and needs no ramp
        const wanted = this._open ? 'lowpass' : this._type;
        if (this.biquad.type !== wanted) this.biquad.type = wanted;
    }
}
