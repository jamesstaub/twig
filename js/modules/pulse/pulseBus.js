import { AppState } from "../../config.js";
import { PULSE } from "../../events.js";

/**
 * PulseBus — fan-out hub for per-cycle pulses from the gate worklets.
 *
 * A voice pulses once per cycle, when enabled and only while it is
 * <= 50 Hz: at the cycle's START (with its gate transition), or at its
 * midpoint for a voice with "offset pulse 50%". Its overtone-gate
 * processor posts {type:'pulse', lead, cycle, gateOn, frequency,
 * audioTime} for it TWICE — a LEAD half a period before the pulse lands,
 * then the LANDING — and the bus routes each to the consumers it suits:
 *
 *   lead → consumers that SCHEDULE (addLeadSink): the MIDI output router
 *     (note blips with Web MIDI future timestamps — sample-accurate
 *     through main-thread jitter) and the recorder's MIDI capture. The
 *     pulse lands half a period after the lead's audioTime (pulseTime.js).
 *   landing → consumers that REACT (addSink):
 *     - registered handlers (window.TWIG.pulses.subscribe) — arbitrary
 *       JS, the future virtual patch-bay
 *     - the OSC bridge (upstream /twig/pulse/<n> → Max patch outlet)
 *     - a DOM CustomEvent for UI (e.g. flashing a drawbar on each pulse)
 *
 * The clock voice additionally posts {type:'clock', frequency, fold,
 * audioTime} once per clock BEAT — its cycle folded by octaves into the
 * MIDI tempo window, at any voice frequency (no 50 Hz cap) — at the beat's
 * midpoint. Those go to the clock sinks only (MIDI clock ticks, the
 * recorder's beat log): a beat is tempo, not a rhythm event.
 *
 * Timing note: delivery rides the main thread, so it inherits page
 * throttling; msg.audioTime is the exact audio-clock time the message was
 * posted at.
 */
class PulseBus {
    constructor() {
        this._subscribers = new Map(); // voiceIndex | '*' → Set<fn>
        this._sinks = new Set();       // landing consumers (osc)
        this._leadSinks = new Set();   // scheduling consumers (midi, recorder)
        this._clockSinks = new Set();  // clock-beat consumers (midi clock, recorder)
    }

    /** Clock-beat consumers: fn(index, beat). */
    addClockSink(fn) {
        this._clockSinks.add(fn);
        return () => this._clockSinks.delete(fn);
    }

    /** Scheduling consumers — called half a period before a pulse lands. */
    addLeadSink(fn) {
        this._leadSinks.add(fn);
        return () => this._leadSinks.delete(fn);
    }

    /** Reacting consumers — called as a pulse lands: fn(index, pulse). */
    addSink(fn) {
        this._sinks.add(fn);
        return () => this._sinks.delete(fn);
    }

    /**
     * Public API: subscribe to one voice's pulses (0-based index) or all
     * voices with '*'. Returns an unsubscribe function.
     */
    subscribe(voice, fn) {
        const key = voice === '*' ? '*' : Number(voice);
        if (!this._subscribers.has(key)) this._subscribers.set(key, new Set());
        this._subscribers.get(key).add(fn);
        return () => this._subscribers.get(key)?.delete(fn);
    }

    /** Entry point — wired to AudioEngine.onPulse (voiceIndex, pulse). */
    dispatch(index, pulse) {
        if (pulse.type === 'clock') {
            for (const sink of this._clockSinks) sink(index, pulse);
            return;
        }
        if (pulse.lead) {
            for (const sink of this._leadSinks) sink(index, pulse);
            return;
        }
        for (const sink of this._sinks) sink(index, pulse);

        for (const fn of this._subscribers.get(index) || []) safeCall(fn, index, pulse);
        for (const fn of this._subscribers.get('*') || []) safeCall(fn, index, pulse);

        document.dispatchEvent(new CustomEvent(PULSE, {
            detail: { index, ...pulse }
        }));
    }

    /** Voice frequency carried by the last pulse — handy for consumers. */
    voiceFrequency(index, pulse) {
        return pulse.frequency || AppState.fundamentalFrequency;
    }
}

function safeCall(fn, index, pulse) {
    try {
        fn(index, pulse);
    } catch (err) {
        console.error('[pulse] subscriber threw:', err);
    }
}

export const pulseBus = new PulseBus();
