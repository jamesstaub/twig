/**
 * GATE SIGNAL — the voice's modulation SOURCE: one unipolar 0-1 signal,
 *
 *     s = pattern(cycle) × contour(phase)
 *
 * the pattern saying which cycles sound (patterns.js) and the contour
 * shaping each one (contours.js). Everything the signal drives is a
 * destination (modTargets.js) — keeping the two apart is what will let a
 * voice's sequence modulate another voice later: the source is already
 * independent of where it goes.
 *
 * Pattern edges are ramped (a one-pole, ~1 ms) so a gate can't click. The
 * ramp is scaled to the cycle — never slower than an eighth of a period —
 * so fast cycles still gate cleanly instead of smearing into a half-open
 * average.
 */

import { contourValue } from './contours.js';
import { patternActive, patternById } from './patterns.js';

const DECLICK_SECONDS = 0.001;

export class GateSignal {
    constructor() {
        /** Scratch the patterns memoize in (euclidean's table). */
        this.cache = {};
        /** The explicit 0/1 steps of the `sequence` pattern. */
        this.steps = null;
        /** The custom contour's table, when the contour is `custom`. */
        this.table = null;
        /** null until the first block decides it — the pattern isn't known before. */
        this.open = null;
        this.level = 1;
        this.smooth = 1;
        /**
         * The next cycle's gate, decided early when a lead pulse announces
         * it: the announcement and the audible gate must agree, and a
         * random pattern must roll only once.
         */
        this.prerolled = null;
    }

    /** Pattern inputs for this block (`x`, `y` and the steps/cache it may use). */
    context(x, y) {
        this.ctx = this.ctx || { x: 0, y: 0, steps: null, cache: this.cache };
        this.ctx.x = x;
        this.ctx.y = y;
        this.ctx.steps = this.steps;
        return this.ctx;
    }

    /** Does cycle `cycle` sound? Uses the pre-rolled answer when there is one. */
    gateFor(pattern, cycle, ctx) {
        const open = this.prerolled !== null ? this.prerolled : patternActive(pattern, cycle, ctx);
        this.prerolled = null;
        return open;
    }

    /** Decide a coming cycle's gate now (a lead pulse announces it). */
    preroll(pattern, cycle, ctx) {
        this.prerolled = patternActive(pattern, cycle, ctx);
        return this.prerolled;
    }

    /** The cycle count restarted: nothing decided for the old numbering holds. */
    restart() {
        this.prerolled = null;
    }

    /** Open or close the gate; the ramp carries the level there. */
    setOpen(open) {
        this.open = open;
        this.prerolled = null;
    }

    /** Land the gate where it is asked, with no ramp (the first block). */
    snap(open) {
        this.open = open;
        this.level = open ? 1 : 0;
    }

    /** Re-scale the declick ramp to a cycle rate. */
    retune(rate, sampleRate) {
        const tau = rate > 0 ? Math.min(DECLICK_SECONDS, 1 / (rate * 8)) : DECLICK_SECONDS;
        this.smooth = 1 - Math.exp(-1 / (tau * sampleRate));
    }

    /**
     * The signal for one sample: the ramped gate times the contour.
     * @param {number} contour - Contour id
     * @param {number} position - The clock's position in cycles (cycle + phase)
     * @param {number} stretch - Cycles one turn of the contour spans
     */
    next(contour, position, stretch) {
        this.level += ((this.open ? 1 : 0) - this.level) * this.smooth;
        // Locked to the cycle counter, so pattern and contour stay in step
        const phase = (position / stretch) % 1;
        return this.level * contourValue(contour, phase, this.table);
    }

    /** The sequencer is off for this pattern: the voice passes through untouched. */
    static bypasses(pattern) {
        return Boolean(patternById(pattern).bypass);
    }
}
