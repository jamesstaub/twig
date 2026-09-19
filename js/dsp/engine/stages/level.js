/** LEVEL — the voice's drawbar gain. */

import { Stage, setParam } from '../Stage.js';

export class LevelStage extends Stage {
    constructor(ctx) {
        super();
        this.input = this.output = this.own(ctx.createGain());
        this.gain = this.input.gain;
    }

    setGain(gain, time, ramp) {
        setParam(this.gain, gain, time, ramp);
    }

    /** Teardown fade: drop everything scheduled and decay to silence. */
    fadeOut(time, timeConstant) {
        this.gain.cancelScheduledValues(time);
        this.gain.setTargetAtTime(0, time, timeConstant);
    }
}
