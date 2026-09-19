/**
 * DRIVE — per-voice overdrive between the gate and the filter. Off is a
 * null curve: the WaveShaper passes the signal through untouched.
 */

import { Stage } from '../Stage.js';
import { driveCurve } from '../../driveCurve.js';

export class DriveStage extends Stage {
    constructor(ctx) {
        super();
        this.shaper = this.own(ctx.createWaveShaper());
        this.shaper.oversample = '4x';
        this.input = this.output = this.shaper;
    }

    setAmount(amount) {
        this.shaper.curve = driveCurve(amount);
    }
}
