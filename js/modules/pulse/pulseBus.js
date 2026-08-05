import { AppState } from "../../config.js";
import { PULSE } from "../../events.js";

/**
 * PulseBus — fan-out hub for per-cycle pulses from the gate worklets.
 *
 * Each voice's overtone-gate processor posts {type:'pulse', cycle, gateOn,
 * frequency, audioTime} on every cycle wrap (when enabled, and only while
 * the voice is <= 50 Hz). The AudioEngine forwards them here; the bus
 * routes to consumers:
 *
 *   - registered handlers (window.TWIG.pulses.subscribe) — arbitrary JS,
 *     the future virtual patch-bay
 *   - the MIDI output router (note blips + MIDI clock)
 *   - the OSC bridge (upstream /twig/pulse/<n> → Max patch outlet)
 *   - a DOM CustomEvent for UI (e.g. flashing a drawbar on each pulse)
 *
 * Timing note: delivery rides the main thread, so it inherits page
 * throttling; msg.audioTime is the exact audio-clock time of the cycle
 * boundary for consumers that schedule rather than react.
 */
class PulseBus {
    constructor() {
        this._subscribers = new Map(); // voiceIndex | '*' → Set<fn>
        this._sinks = new Set();       // internal consumers (midi, osc)
    }

    /** Internal consumers: fn(index, pulse). */
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

    /** Entry point — wired to AudioEngine.onPulse ("harmonic_<i>", pulse). */
    dispatch(oscKey, pulse) {
        const index = Number(oscKey.split('_')[1]);
        if (!Number.isFinite(index)) return;

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
