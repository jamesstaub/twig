/**
 * MIDI clock tick planning — pure math, no Web MIDI, no app state.
 *
 * The clock voice announces each clock BEAT — its cycle, folded by octaves
 * into the tempo window (clockFold) — half a beat ahead of the boundary,
 * and each announcement schedules the coming beat's ticks with Web MIDI
 * future timestamps — which cannot be recalled. So when the voice's rate
 * changes, ticks already handed to the port (the `cursor` is the last of
 * them) no longer tile with the new cycle:
 *
 *   - rate up: the committed ticks reach INTO the new cycle. Laying the
 *     new grid over them interleaves two grids (millisecond intervals — a
 *     receiver reads a four-digit tempo and drops sync). Instead the
 *     committed ticks count toward the cycle (`carried`) and only the
 *     remainder is scheduled, spread evenly from the cursor to the cycle's
 *     end: every interval is sane and the cycle still totals one quarter
 *     note, so the receiver's beat stays on the voice's boundary.
 *   - rate down: the committed ticks end before the new boundary. The
 *     hole is left as is — filling it would add ticks the cycle doesn't
 *     own and push the receiver off the beat. The router re-syncs the
 *     receiver when a hole is long enough to look like a lost clock
 *     (isClockDropout).
 */

/** MIDI clock resolution: one clock beat = one quarter note = 24 ticks. */
export const CLOCK_PPQN = 24;

// The tempo window and the folding itself live in the dsp layer, with the
// worklet that counts the beats on the audio thread — one definition, so
// what this schedules and what the voice announces can't drift apart.
export { CLOCK_MAX_HZ, CLOCK_MIN_HZ, clockFold } from '../../dsp/gate/clockBeats.js';

// A hole longer than this many tick intervals — and this many ms — may
// have read as a lost clock downstream. The floor: a receiver that can
// follow a 30 BPM clock already tolerates 83 ms between ticks, so none
// gives up much under a quarter second; below it a CONTINUE would only
// chatter through every downward glide, whose cycles each run a little
// longer than the rate they were planned at.
const DROPOUT_TICKS = 4;
const DROPOUT_MIN_MS = 250;

/**
 * Wall-clock times of the ticks to schedule for the cycle starting at
 * `boundary` (ms) and lasting `periodMs`.
 * @param {number} cursor  - time of the last tick already scheduled
 * @param {number} carried - how many scheduled ticks fall at/after `boundary`
 */
export function planCycleTicks({ boundary, periodMs, cursor = -Infinity, carried = 0 }) {
    const spacing = periodMs / CLOCK_PPQN;
    if (cursor < boundary) {
        return Array.from({ length: CLOCK_PPQN }, (_, k) => boundary + k * spacing);
    }
    // Spread what the cycle still owes between the cursor and its end —
    // fewer when that would squeeze intervals under half the new spacing
    const room = boundary + periodMs - cursor;
    const fits = Math.floor(room / (spacing / 2)) - 1;
    const count = Math.max(0, Math.min(CLOCK_PPQN - carried, fits));
    const step = room / (count + 1);
    return Array.from({ length: count }, (_, j) => cursor + (j + 1) * step);
}

/**
 * True when the silence between the last scheduled tick (`cursor`) and
 * the next one is long enough that a receiver may have given the clock up.
 * `spacing` is the tick interval the receiver was last hearing.
 */
export function isClockDropout(cursor, nextTick, spacing) {
    return nextTick - cursor > Math.max(DROPOUT_TICKS * spacing, DROPOUT_MIN_MS);
}
