/**
 * SOURCE — the head of a voice: a PAIR of oscillators mixed by a morph
 * position, or a per-voice tap on a shared external node (ADC, sound
 * file, noise — see SourceManager).
 *
 * Two oscillators started on the same frame at the same frequency are
 * sample-exactly phase-locked, and PeriodicWave synthesis is linear, so a
 * gain crossfade between them IS the interpolation of their tables —
 * click-free, with no tables built. That is how a waveform change
 * sounds (a short morph onto the idle slot; a table swap on a sounding
 * oscillator is a click) and how presets crossfade between waveforms.
 * A packed wavetable spanning `period` fundamental periods plays at
 * frequency / period; the two slots correct independently, so a morph
 * between different periods is a plain crossfade of two sounds and uses
 * an equal-power curve (coherent slots use a linear one, which is exact).
 *
 * An external-source voice keeps its frequency identity: the modulator's
 * clock and the pitch-tracked lowpass still follow it, so the external
 * signal plays through a filter bank tuned to the overtone series.
 */

import { Stage, setParam } from '../Stage.js';

/**
 * @typedef {Object} WaveSlot
 * @property {PeriodicWave} wave
 * @property {number} period - Fundamental periods the table spans (1 for primitives)
 */

export class SourceStage extends Stage {
    /**
     * @param {AudioContext} ctx
     * @param {Object} opts
     * @param {AudioNode|null} opts.external - Shared node to tap instead of oscillators
     */
    constructor(ctx, { external = null }) {
        super();
        this.external = external;
        this.frequency = 0;
        if (external) {
            this.output = this.own(ctx.createGain());
            external.connect(this.output);
            this.slots = null;
            return;
        }
        this.output = this.own(ctx.createGain());
        // Slot 0 sounds alone until a morph brings slot 1 in
        this.slots = [0, 1].map((i) => {
            const oscillator = this.own(ctx.createOscillator());
            const gain = this.own(ctx.createGain());
            gain.gain.value = i === 0 ? 1 : 0;
            oscillator.connect(gain);
            gain.connect(this.output);
            return { oscillator, gain, wave: null, period: 1 };
        });
        this.position = 0; // 0 = slot 0 alone … 1 = slot 1 alone
    }

    /** The slots' pitch (Hz), each corrected for its own table period. */
    setFrequency(frequency, time, ramp) {
        this.frequency = frequency;
        if (!this.slots) return;
        for (const slot of this.slots) setParam(slot.oscillator.frequency, frequency / slot.period, time, ramp);
    }

    /**
     * The rate the voice's cycle clock should run at: the audible table's
     * full period (a packed wavetable's cycle is all its periods).
     */
    get clockFrequency() {
        if (!this.slots) return this.frequency;
        return this.frequency / this.slots[this.position < 0.5 ? 0 : 1].period;
    }

    /**
     * What sounds: wave `a`, or `morph` (0-1) of the way from `a` to `b`.
     * Endpoints already in a slot keep it; a new one loads into the slot
     * that is silent, so a plain change of wave (b = null) becomes a
     * morph onto the idle slot over `ramp`.
     * @param {{a: WaveSlot, b?: WaveSlot|null, morph?: number}} waveform
     */
    setWaveform({ a, b = null, morph = 0 }, time, ramp) {
        if (!this.slots) return;
        if (!b || b.wave === a.wave) { b = a; morph = 0; }
        const [s0, s1] = this.slots;
        let target;
        if (s0.wave === a.wave && s1.wave === b.wave) {
            target = morph;
        } else if (s0.wave === b.wave && s1.wave === a.wave) {
            target = 1 - morph;
        } else {
            // Load into the silent slot; the sounding one keeps its table.
            // Mid-morph (neither silent) the quieter slot takes the swap.
            const idle = this.position < 0.5 ? 1 : 0;
            const live = 1 - idle;
            if (a === b) {
                this.load(idle, a, time);
                target = idle;
            } else if (this.slots[live].wave === a.wave) {
                this.load(idle, b, time);
                target = idle === 1 ? morph : 1 - morph;
            } else if (this.slots[live].wave === b.wave) {
                this.load(idle, a, time);
                target = idle === 1 ? 1 - morph : morph;
            } else {
                // Neither endpoint is sounding: both slots reload (the one
                // audible swap this stage makes — entering a crossfade from
                // an unrelated sound)
                this.load(0, a, time);
                this.load(1, b, time);
                target = morph;
            }
        }
        this.morphTo(target, time, ramp);
    }

    load(index, { wave, period }, time) {
        const slot = this.slots[index];
        slot.wave = wave;
        slot.period = period;
        slot.oscillator.setPeriodicWave(wave);
        setParam(slot.oscillator.frequency, this.frequency / period, time, 0);
    }

    morphTo(position, time, ramp) {
        this.position = position;
        const [s0, s1] = this.slots;
        // Phase-locked slots (same period) mix linearly — exact; unrelated
        // ones keep constant power across the fade
        const coherent = s0.period === s1.period;
        const g1 = coherent ? position : Math.sin(position * Math.PI / 2);
        const g0 = coherent ? 1 - position : Math.cos(position * Math.PI / 2);
        setParam(s0.gain.gain, g0, time, ramp);
        setParam(s1.gain.gain, g1, time, ramp);
    }

    /**
     * Start sounding (an external source already is). A shared future `at`
     * puts every voice of a bank at phase 0 on the same frame; a time in
     * the past — the default — means "now".
     */
    start(at = 0) {
        if (this.slots) for (const slot of this.slots) slot.oscillator.start(at);
    }

    stop(at) {
        if (this.slots) for (const slot of this.slots) slot.oscillator.stop(at);
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
