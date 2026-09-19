/** PAN — the voice's place in the stereo field; the last stage before the master bus. */

import { Stage, setParam } from '../Stage.js';

export class PanStage extends Stage {
    constructor(ctx) {
        super();
        this.panner = this.own(ctx.createStereoPanner());
        this.input = this.output = this.panner;
    }

    setPan(pan, time, ramp) {
        setParam(this.panner.pan, pan, time, ramp);
    }
}
