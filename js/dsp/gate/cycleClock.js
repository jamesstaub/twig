/**
 * CYCLE CLOCK — a voice's own sense of time on the audio thread.
 *
 * It counts CYCLES (a whole turn of the voice: one period of its
 * oscillator, or one pass of its sample loop) and the PHASE within the
 * current one, advancing a sample at a time from the cycle rate. Every
 * other part of the gate reads this: the pattern asks which cycle it is,
 * the contour reads the phase, pulses fire at its boundaries.
 *
 * It can also be RESTARTED at an audio-clock time — a sampler's player
 * (re)started then, so the voice's cycle 0 is that instant and pattern,
 * contour and pulses all begin there. A restart already in the past is
 * caught up to rather than dropped: the clock lands where it would have
 * been had it restarted on time.
 */

/** `advance` returns these, or-ed together. */
export const WRAPPED = 1;       // a new cycle began on this sample
export const PAST_MIDPOINT = 2; // the phase reached 0.5 on this sample

export class CycleClock {
    constructor() {
        this.cycle = 0;
        this.phase = 0;
        /** Set once the phase has passed 0.5; cleared at every wrap. */
        this.pastMidpoint = false;
        this.restartTime = null;
    }

    /** Where the clock is, in cycles — the contour and the MIDI clock read it. */
    get position() {
        return this.cycle + this.phase;
    }

    /** Restart the cycle count at audio-clock time `at` (seconds). */
    scheduleRestart(at) {
        this.restartTime = Number(at) || 0;
    }

    restart() {
        this.cycle = 0;
        this.phase = 0;
        this.pastMidpoint = false;
    }

    /**
     * Resolve a pending restart against the block about to be rendered.
     * A restart inside the block is returned as the frame to restart on;
     * one already past is applied here, wound forward to now.
     *
     * @param {number} blockStart - Audio-clock time of the block's first frame
     * @param {number} frames - Frames in the block
     * @param {number} rate - Cycle rate (Hz)
     * @param {number} sampleRate
     * @returns {number} the frame to restart on, or -1
     */
    beginBlock(blockStart, frames, rate, sampleRate) {
        if (this.restartTime === null) return -1;
        const at = this.restartTime;
        if (at > blockStart) {
            // Later in this block: restart on its frame. Further ahead than
            // this block: leave it pending.
            if (at >= blockStart + frames / sampleRate) return -1;
            this.restartTime = null;
            return Math.round((at - blockStart) * sampleRate);
        }
        this.restartTime = null;
        const elapsed = Math.max(0, (blockStart - at) * rate); // cycles since the restart
        this.cycle = Math.floor(elapsed);
        this.phase = elapsed - this.cycle;
        this.pastMidpoint = this.phase >= 0.5;
        return -1;
    }

    /**
     * Advance one sample at `rate` Hz.
     * @returns {number} WRAPPED and/or PAST_MIDPOINT, or 0
     */
    advance(rate, sampleRate) {
        let events = 0;
        this.phase += rate / sampleRate;
        if (this.phase >= 1) {
            this.phase -= Math.floor(this.phase);
            this.cycle++;
            this.pastMidpoint = false;
            events |= WRAPPED;
        }
        if (!this.pastMidpoint && this.phase >= 0.5) {
            this.pastMidpoint = true;
            events |= PAST_MIDPOINT;
        }
        return events;
    }
}
