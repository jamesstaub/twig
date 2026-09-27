/**
 * AMP DOT — a voice's live level as one glowing dot.
 *
 * The drawbar strip puts one under every column; the Sequence panel puts
 * one beside the voice it is editing, where the bars are not on screen to
 * say whether the thing you are sequencing is making any sound at all.
 *
 * The DECAY is the point: a voice gated to a few milliseconds a cycle
 * peaks and is gone before the next frame, so a dot reading the
 * instantaneous level would flicker or miss it entirely. Each frame takes
 * the higher of the new reading and the last one faded, which turns a
 * click into something the eye can follow.
 *
 * The host owns the frame loop — the strip runs one for twelve dots, the
 * inspector one for its own — and calls `tick` with a fresh reading.
 */

/** Resting opacity: visible as an off dot, not a hole in the layout. */
const FLOOR = 0.12;
/** How much of the previous frame's level survives into this one. */
const DECAY = 0.88;
/** Level that reads as fully lit — voices rarely sit near 1. */
const FULL_AT = 2.5;

export class AmpDot {

    /** @param {string} [className] - Extra class for the host's own sizing */
    constructor(className = '') {
        this.el = document.createElement('span');
        this.el.className = `amp-dot ${className}`.trim();
        this.level = 0;
    }

    /**
     * One frame.
     * @param {number} level - The voice's peak level now (0-1)
     */
    tick(level) {
        this.level = Math.max(level || 0, this.level * DECAY);
        this.el.style.opacity = FLOOR + (1 - FLOOR) * Math.min(1, this.level * FULL_AT);
    }
}
