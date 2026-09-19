/**
 * ENVELOPE — per-voice ADSR gain, ahead of the level stage so meters and
 * the drive stage follow the envelope. Open (Drone) pins it at unity;
 * closed (Trigger) rests it at silence until attack() ramps it.
 */

import { Stage, setParam } from '../Stage.js';

/** Shortest envelope segment, seconds — a zero-length ramp is a click. */
const MIN_SEGMENT = 0.001;

export class EnvelopeStage extends Stage {
    constructor(ctx) {
        super();
        this.input = this.output = this.own(ctx.createGain());
        this.gain = this.input.gain;
    }

    setOpen(open, time, ramp) {
        this.gain.cancelScheduledValues(time);
        setParam(this.gain, open ? 1 : 0, time, ramp);
    }

    /**
     * Gate on: ramp to full over the attack, then down to the sustain
     * level over the decay. Holds at sustain until release().
     */
    attack({ a, d, s }, time) {
        this.holdAt(time);
        const attackEnd = time + Math.max(MIN_SEGMENT, a);
        this.gain.linearRampToValueAtTime(1, attackEnd);
        this.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, s)), attackEnd + Math.max(MIN_SEGMENT, d));
    }

    /** Gate off: ramp to silence over the release. */
    release({ r }, time) {
        this.holdAt(time);
        this.gain.linearRampToValueAtTime(0, time + Math.max(MIN_SEGMENT, r));
    }

    /** Instantaneous envelope level (0..1) — follows the scheduled ramps. */
    get level() {
        return this.gain.value;
    }

    /** Drop whatever was scheduled and continue from the current level. */
    holdAt(time) {
        this.gain.cancelScheduledValues(time);
        this.gain.setValueAtTime(this.gain.value, time);
    }
}
