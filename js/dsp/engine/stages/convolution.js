/**
 * CONVOLUTION — per-voice convolution send with a feedback loop.
 *
 *   input ─→ dry ───────────────────────────────────────→ output
 *        └→ convolver → send → duck → sum → wet ────────↗
 *                                      ↑      (loop: sum → delay → feedback → sum)
 *
 * Off is passthrough: dry 1, wet 0, no IR (a bufferless convolver is
 * silent). Feedback (−0.99..0.99) recirculates the wet signal through a
 * delay line; negative feedback inverts every pass, moving the comb to odd
 * multiples of half the loop rate. The loop deliberately excludes the
 * convolver — Chrome does not process a signal that reaches a
 * ConvolverNode through a cycle.
 *
 * The wet and feedback gains are modulation targets (wetCV / feedbackCV).
 */

import { Stage, setParam } from '../Stage.js';

/** Longest feedback loop the stage supports, seconds. */
const MAX_LOOP = 10;

/** Minimum interval between IR assignments (ms) — see swapBuffer. */
const SWAP_MIN_MS = 120;

// Duck timing is tuned to be barely perceptible: ~1 ms out (−40 dB by
// 5 ms), the swap once two render quanta have passed, ~2 ms back — about
// a 12 ms dip in total.
const DUCK_DOWN_TAU = 0.001;
const DUCK_UP_TAU = 0.002;
const DUCK_MS = 6;

export class ConvolutionStage extends Stage {
    constructor(ctx) {
        super();
        this.ctx = ctx;
        const gain = (value) => {
            const node = this.own(ctx.createGain());
            node.gain.value = value;
            return node;
        };

        this.input = gain(1);
        this.output = gain(1);
        this.dry = gain(1);
        this.wet = gain(0);
        this.send = gain(1);
        this.sum = gain(1);
        this.feedback = gain(0);
        this.convolver = this.own(ctx.createConvolver());
        this.convolver.normalize = true;
        // Ramped out around IR swaps, ahead of the loop entry: a swap
        // restarts the convolver with a discontinuity that the feedback
        // loop would otherwise repeat
        this.duck = gain(1);
        // A cycle must contain a DelayNode or Web Audio silences it
        this.delay = this.own(ctx.createDelay(MAX_LOOP));
        this.delay.delayTime.value = this.loopDelayTime(0);
        // Modulating wet also drives dry by −1 so the mix stays complementary
        this.wetInverse = gain(-1);
        this.wetInverse.connect(this.dry.gain);

        this.input.connect(this.dry);
        this.dry.connect(this.output);
        this.input.connect(this.convolver);
        this.convolver.connect(this.send);
        this.send.connect(this.duck);
        this.duck.connect(this.sum);
        this.sum.connect(this.wet);
        this.wet.connect(this.output);
        this.sum.connect(this.delay);
        this.delay.connect(this.feedback);
        this.feedback.connect(this.sum);

        this.pendingBuffer = null;
        this.swapTimer = null;
        this.lastSwap = -Infinity;
    }

    get wetCV() { return [this.wet.gain, this.wetInverse]; }
    get feedbackCV() { return [this.feedback.gain]; }

    /**
     * @param {Object} conv
     * @param {number} [conv.wet] - Dry/wet mix, 0-1
     * @param {number} [conv.feedback] - Loop gain, −0.99..0.99
     * @param {number} [conv.gain] - Send level into the mix, 0-1
     * @param {AudioBuffer|null} [conv.buffer] - The IR (null = none)
     * @param {number} [conv.period] - Period the loop resonates on, seconds
     */
    set({ wet, feedback, gain, buffer, period }, time, ramp) {
        if (wet !== undefined) {
            setParam(this.dry.gain, 1 - wet, time, ramp);
            setParam(this.wet.gain, wet, time, ramp);
        }
        if (feedback !== undefined) setParam(this.feedback.gain, feedback, time, ramp);
        if (gain !== undefined) setParam(this.send.gain, gain, time, ramp);
        if (period !== undefined) setParam(this.delay.delayTime, this.loopDelayTime(period), time, ramp);
        if (buffer !== undefined && buffer !== (this.swapTimer ? this.pendingBuffer : this.convolver.buffer)) {
            // A step write is a voice being built: nothing sounding to protect
            if (ramp > 0) this.swapBuffer(buffer);
            else this.convolver.buffer = buffer;
        }
    }

    /**
     * DelayNode time that makes the loop resonate on `period` seconds. Both
     * constraints here are Web Audio's, which is why they live in this
     * stage and not with the caller: a DelayNode inside a cycle carries one
     * extra render quantum of latency (the feedback edge is read from the
     * previous quantum), so that quantum is subtracted; and the loop can
     * therefore not be shorter than two quanta, so a shorter period gets
     * the smallest whole number of periods that clears it — the comb still
     * resonates on that period (and below it).
     */
    loopDelayTime(period) {
        const quantum = 128 / this.ctx.sampleRate;
        if (!(period > 0)) return quantum;
        const loop = Math.ceil((2 * quantum) / period) * period;
        return Math.min(MAX_LOOP, loop - quantum);
    }

    /**
     * Swap the IR without a click: duck the wet output (and so the loop
     * entry) to silence, assign the buffer once the ramp has landed, then
     * ramp back. Swaps arriving meanwhile coalesce onto the latest buffer.
     * Rate-limited: assigning ConvolverNode.buffer allocates fresh FFT
     * state (large for long IRs), and a fundamental glide would otherwise
     * do it every 10 cents on every voice. The timers only postpone the
     * swap — if the main thread is throttled the duck just lasts longer;
     * nothing audible depends on them firing on time.
     */
    swapBuffer(buffer) {
        this.pendingBuffer = buffer;
        if (this.swapTimer) return;
        const wait = Math.max(0, this.lastSwap + SWAP_MIN_MS - performance.now());
        this.swapTimer = setTimeout(() => {
            const duck = this.duck.gain;
            const now = this.ctx.currentTime;
            duck.cancelScheduledValues(now);
            duck.setTargetAtTime(0, now, DUCK_DOWN_TAU);
            this.swapTimer = setTimeout(() => {
                this.swapTimer = null;
                this.convolver.buffer = this.pendingBuffer;
                this.pendingBuffer = null;
                this.lastSwap = performance.now();
                const t = this.ctx.currentTime;
                duck.cancelScheduledValues(t);
                duck.setTargetAtTime(1, t, DUCK_UP_TAU);
            }, DUCK_MS);
        }, wait);
    }

    /**
     * Teardown fade of the loop: cutting it abruptly is a click that the
     * feedback would repeat for as long as it decays.
     */
    fadeOut(time, timeConstant) {
        clearTimeout(this.swapTimer);
        this.swapTimer = null;
        this.sum.gain.cancelScheduledValues(time);
        this.sum.gain.setTargetAtTime(0, time, timeConstant);
    }
}
