/**
 * METER — a parallel sink tapping the voice after the gate and filter, so
 * UI indicators show what the voice actually contributes (including
 * sequencer gating). Nothing downstream; cheap enough to poll per frame.
 */

import { Stage } from '../Stage.js';

export class MeterStage extends Stage {
    constructor(ctx) {
        super();
        this.analyser = this.own(ctx.createAnalyser());
        this.analyser.fftSize = 256;
        this.input = this.analyser;
        this.buffer = new Float32Array(this.analyser.fftSize);
    }

    /** Instantaneous peak level, 0-1. */
    level() {
        this.analyser.getFloatTimeDomainData(this.buffer);
        let peak = 0;
        for (let i = 0; i < this.buffer.length; i++) {
            const a = Math.abs(this.buffer[i]);
            if (a > peak) peak = a;
        }
        return Math.min(1, peak);
    }
}
