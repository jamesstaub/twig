/**
 * SOURCE — the head of a voice: its own OscillatorNode, or a per-voice tap
 * on a shared external node (ADC, sound file, noise — see SourceManager).
 * An external-source voice keeps its frequency identity: the modulator's
 * clock and the pitch-tracked lowpass still follow it, so the external
 * signal plays through a filter bank tuned to the overtone series.
 */

import { Stage, setParam } from '../Stage.js';

export class SourceStage extends Stage {
    /**
     * @param {AudioContext} ctx
     * @param {Object} opts
     * @param {PeriodicWave|null} opts.wave - Oscillator wave (null = sine)
     * @param {AudioNode|null} opts.external - Shared node to tap instead of an oscillator
     */
    constructor(ctx, { wave = null, external = null }) {
        super();
        this.external = external;
        this.oscillator = null;
        if (external) {
            this.output = this.own(ctx.createGain());
            external.connect(this.output);
        } else {
            this.oscillator = this.own(ctx.createOscillator());
            if (wave) this.oscillator.setPeriodicWave(wave);
            this.output = this.oscillator;
        }
    }

    setFrequency(frequency, time, ramp) {
        if (this.oscillator) setParam(this.oscillator.frequency, frequency, time, ramp);
    }

    /**
     * Start sounding (an external source already is). A shared future `at`
     * puts every voice of a bank at phase 0 on the same frame; a time in
     * the past — the default — means "now".
     */
    start(at = 0) {
        this.oscillator?.start(at);
    }

    stop(at) {
        this.oscillator?.stop(at);
    }

    dispose() {
        // The shared external source outlives voices — unhook this voice's
        // tap from it so the tap subgraph can be collected
        if (this.external) {
            try { this.external.disconnect(this.output); } catch { /* source already disposed */ }
        }
        super.dispose();
    }
}
