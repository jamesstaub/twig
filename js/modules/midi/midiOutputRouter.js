import { AppState, midiConfig } from "../../config.js";
import { pulseBus } from "../pulse/pulseBus.js";

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const CLOCK_TICK = 0xf8;
const CLOCK_START = 0xfa;
const CLOCK_STOP = 0xfc;

// Short blip: note-off follows note-on almost immediately. A small gap is
// scheduled (Web MIDI accepts future timestamps) so receivers that ignore
// zero-length notes still register it — nothing waits on a timer, so
// note-offs can't be dropped by page throttling.
const BLIP_MS = 10;
const VELOCITY = 100;
const MIDI_CHANNEL = 1; // fixed for now; per-voice channels are a later knob

/**
 * MidiOutputRouter — turns voice pulses into Web MIDI events.
 *
 *  - Note blips: voices with pulse-MIDI enabled send a note-on/note-off
 *    pair per audible (gate-open) cycle; the note number is the voice's
 *    nearest MIDI pitch.
 *  - MIDI clock: the single voice assigned as clock source emits 24
 *    evenly-spaced 0xF8 ticks per cycle (cycle = quarter note), scheduled
 *    ahead across the coming period so timing survives throttling. Clock
 *    ticks fire on every cycle, gated or not — a clock must not stutter.
 *
 * Degrades to a no-op where Web MIDI is unavailable (e.g. inside jweb —
 * use the OSC pulse output there instead).
 */
export class MidiOutputRouter {

    constructor() {
        this.output = null;
        this.available = false;
        this._clockRunning = false;
    }

    async init() {
        if (!navigator.requestMIDIAccess) return;
        try {
            const midi = await navigator.requestMIDIAccess();
            const pick = () => {
                this.output = midi.outputs.values().next().value || null;
                this.available = Boolean(this.output);
            };
            pick();
            midi.onstatechange = pick;
        } catch {
            // Denied (expected in embedded webviews) — OSC pulses still work
            return;
        }
        pulseBus.addSink((index, pulse) => this.onPulse(index, pulse));
    }

    /**
     * MIDI note for a voice: linear — overtone 1 sends note 1, overtone 12
     * sends note 12 — reassignable per overtone in the MIDI modal. Pulses
     * are triggers, not pitches, so identity beats frequency-matching.
     */
    static noteForVoice(index) {
        const note = midiConfig.pulseNotes[index] ?? index + 1;
        return Math.max(0, Math.min(127, Math.round(note)));
    }

    onPulse(index, pulse) {
        if (!this.available) return;

        const midiOn = AppState.oscillatorPulseOuts[index]?.midi ?? midiConfig.pulseMidiEnabled;
        if (midiOn && pulse.gateOn) {
            this.sendBlip(index);
        }
        if (AppState.midiClockVoice === index) {
            this.sendClockTicks(pulse);
        } else if (this._clockRunning && AppState.midiClockVoice === null) {
            this.output.send([CLOCK_STOP]);
            this._clockRunning = false;
        }
    }

    sendBlip(index) {
        const note = MidiOutputRouter.noteForVoice(index);
        if (note === null) return;
        const status = MIDI_CHANNEL - 1;
        const now = window.performance.now();
        this.output.send([NOTE_ON | status, note, VELOCITY], now);
        this.output.send([NOTE_OFF | status, note, 0], now + BLIP_MS);
    }

    sendClockTicks(pulse) {
        const freq = pulse.frequency;
        if (!(freq > 0)) return;
        const periodMs = 1000 / freq;
        const now = window.performance.now();
        if (!this._clockRunning) {
            this.output.send([CLOCK_START], now);
            this._clockRunning = true;
        }
        // 24 PPQN: one voice cycle = one quarter note
        for (let k = 0; k < 24; k++) {
            this.output.send([CLOCK_TICK], now + (k * periodMs) / 24);
        }
    }

    stopClock() {
        if (this.available && this._clockRunning) {
            this.output.send([CLOCK_STOP]);
            this._clockRunning = false;
        }
    }
}

export const midiOutputRouter = new MidiOutputRouter();
