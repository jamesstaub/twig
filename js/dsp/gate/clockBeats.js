/**
 * MIDI CLOCK BEATS — a voice's cycles as a tempo.
 *
 * The clock voice's cycle IS the beat while its rate sits in the tempo
 * window; outside it the rate is folded by octaves until it lands back in
 * (clockFold), so any voice — a 30 Hz buzz or a half-minute drone — can
 * drive a usable clock. Pure math, shared by the gate worklet (which
 * counts the beats on the audio thread) and modules/midi/clockTicks.js
 * (which schedules each beat's 24 ticks).
 */

// The window the clock is kept in — what slaved hardware follows
// (Elektron boxes: 30-300 BPM).
export const CLOCK_MIN_HZ = 0.5;
export const CLOCK_MAX_HZ = 5;

/**
 * Octaves the clock is shifted from its voice: 0 while the voice is inside
 * the window — the clock IS the voice, so an octave jump there is an
 * octave jump in tempo — else the fewest halvings (negative) or doublings
 * that bring it back in. One clock beat = 2^-fold voice cycles. A pure
 * function of the rate: the same voice always gives the same tempo.
 */
export function clockFold(hz) {
    if (!(hz > 0)) return 0;
    let fold = 0;
    while (hz * 2 ** fold > CLOCK_MAX_HZ) fold--;
    while (hz * 2 ** fold < CLOCK_MIN_HZ) fold++;
    return fold;
}

/**
 * Counts a voice's clock beats, announcing each as it is reached.
 *
 * Beats are counted in folded cycles and land half a beat AFTER they are
 * announced: consumers schedule against `audioTime + ½ beat`, which gives
 * the main thread its lead. A fold change (or a restarted cycle) adopts
 * the new count silently — the boundaries stay on the voice's own grid.
 */
export class ClockBeats {
    constructor() {
        this.fold = null;
        this.ratio = 0; // beats per voice cycle
        this.beat = 0;
    }

    /** Follow a cycle rate; re-baselines silently when the fold changes. */
    follow(hz, position) {
        const fold = clockFold(hz);
        this.ratio = 2 ** fold;
        if (fold !== this.fold) {
            this.fold = fold;
            this.rebaseline(position);
        }
        return this.ratio;
    }

    /** Stop following (the voice is no longer the clock). */
    release() {
        this.fold = null;
    }

    /** Adopt the beat count at `position` without announcing it. */
    rebaseline(position) {
        this.beat = beatAt(position, this.ratio);
    }

    /**
     * The beat reached at `position`, or null when it is still the one
     * already announced.
     */
    reached(position) {
        const beat = beatAt(position, this.ratio);
        if (beat === this.beat) return null;
        this.beat = beat;
        return beat;
    }
}

/** Beat number at a position in cycles — the +0.5 is the half-beat lead. */
function beatAt(position, ratio) {
    return Math.floor(position * ratio + 0.5);
}
