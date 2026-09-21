import { AppState } from "../../config.js";
import { midiConfig } from "../../appConfig.js";
import { audioEngine } from "../../dsp/engine/AudioEngine.js";
import { pulseBus } from "../pulse/pulseBus.js";
import { audioTimeToPerformanceMs, pulseLandingMs } from "../pulse/pulseTime.js";
import { resolvePortSelector } from "./portUtils.js";
import { blipForPulse, isClockVoice } from "./pulseMidi.js";
import { planCycleTicks, isClockDropout, CLOCK_PPQN } from "./clockTicks.js";
import { MIDI_PORTS_CHANGED } from "../../events.js";

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const CLOCK_TICK = 0xf8;
const CLOCK_START = 0xfa;
const CLOCK_CONTINUE = 0xfb;
const CLOCK_STOP = 0xfc;

// Margin between the last scheduled tick and a transport message; planned
// ticks are never closer together than ~0.4 ms (half a tick at 50 Hz)
const TRANSPORT_AFTER_TICK_MS = 0.1;

/**
 * MidiOutputRouter — turns voice pulses into Web MIDI events.
 *
 *  - Note blips: voices with pulse-MIDI enabled send a note-on/note-off
 *    pair per audible (gate-open) cycle, scheduled onto the cycle's START
 *    (the audible click of a low-frequency square/saw; its midpoint for a
 *    voice with "offset pulse 50%") via Web MIDI future timestamps. All wall-clock scheduling maps through pulseTime.js so
 *    blips, clock, and transport agree with each other and the audio.
 *  - MIDI clock: the single voice assigned as clock source emits 24
 *    evenly-spaced 0xF8 ticks per clock BEAT (= quarter note), scheduled
 *    ahead across the coming beat so timing survives throttling. A beat
 *    is the voice's cycle while that is a followable tempo (30-300 BPM)
 *    and otherwise the cycle folded by octaves into that window — done in
 *    the gate worklet (see clockFold), so a clock voice at audio rate
 *    still clocks. Ticks fire on every beat, gated or not — a clock must
 *    not stutter.
 *    Scheduled ticks can't be recalled, so the router tracks what it has
 *    handed to the port (the tick cursor) and plans each cycle around it
 *    (clockTicks.js): a rate change never interleaves two tick grids, a
 *    hole long enough to read as a lost clock — a big rate drop, or the
 *    voice spending time above the 50 Hz pulse cap — is followed by
 *    CONTINUE so the receiver picks the clock back up, and a START never
 *    lands among the previous run's still-scheduled ticks.
 *  - Transport: play start/stop sends 0xFA/0xFC, scheduled to the voices'
 *    audible onset (see sendTransportStart).
 *
 * Note blips route to the note-out port; clock and transport route to the
 * clock-out port (which defaults to the note-out port until a distinct one
 * is chosen). Clock/transport messages are system-realtime — channel-less.
 *
 * Degrades to a no-op where Web MIDI is unavailable (e.g. inside jweb —
 * use the OSC pulse output there instead).
 */
export class MidiOutputRouter {

    constructor() {
        this.midi = null;
        this.output = null;
        this.clockOutput = null;
        this.available = false;
        this._clockRunning = false;
        // Clock tick stream bookkeeping (see clockTicks.js)
        this._tickCursor = -Infinity; // time of the last tick handed to the port
        this._streamTicks = [];       // the running stream's ticks still ahead
        this._tickSpacing = null;     // interval the receiver last heard; null = none yet
    }

    async init() {
        if (!navigator.requestMIDIAccess) return;
        try {
            this.midi = await navigator.requestMIDIAccess();
            const portsChanged = () => {
                this._pick();
                document.dispatchEvent(new CustomEvent(MIDI_PORTS_CHANGED));
            };
            portsChanged();
            this.midi.onstatechange = portsChanged;
        } catch {
            // Denied (expected in embedded webviews) — OSC pulses still work
            return;
        }
        pulseBus.addLeadSink((index, pulse) => this.onPulse(index, pulse));
        pulseBus.addClockSink((index, beat) => {
            if (this.clockOutput && isClockVoice(index)) this.sendClockTicks(beat);
        });
    }

    /** Resolve the active outputs: configured ports if present, else first. */
    _pick() {
        // A selector that arrived before Web MIDI was up (bridge bootstrap
        // replays ~2s before init) resolves now that ports exist
        if (this._selector != null && !this.outputPorts().some((o) => o.id === midiConfig.outputId)) {
            const id = resolvePortSelector(this.outputPorts(), this._selector);
            if (id) midiConfig.outputId = id;
        }
        if (this._clockSelector != null && !this.outputPorts().some((o) => o.id === midiConfig.clockOutputId)) {
            const id = resolvePortSelector(this.outputPorts(), this._clockSelector);
            if (id) midiConfig.clockOutputId = id;
        }
        const outs = this.midi ? [...this.midi.outputs.values()] : [];
        this.output = outs.find((o) => o.id === midiConfig.outputId) || outs[0] || null;
        // Clock/transport follow the note-out port until a distinct one is set
        this.clockOutput = outs.find((o) => o.id === midiConfig.clockOutputId) || this.output;
        this.available = Boolean(this.output);
    }

    /** Available system output ports, for the settings panel's selectors. */
    outputPorts() {
        return this.midi ? [...this.midi.outputs.values()].map((o) => ({ id: o.id, name: o.name })) : [];
    }

    /**
     * Route note blips to a specific output port — by id, 0-based index, or
     * name (see resolvePortSelector). null/'' clears to first available.
     * The raw selector is remembered so it can resolve after late MIDI init.
     */
    selectOutput(selector) {
        const cleared = selector == null || selector === '';
        this._selector = cleared ? null : selector;
        midiConfig.outputId = cleared ? null : resolvePortSelector(this.outputPorts(), selector);
        this._pick();
    }

    /**
     * Route clock + transport to a specific output port. null/'' clears
     * back to "same as note out". A running clock is stopped on the old
     * port first so downstream gear doesn't free-run.
     */
    selectClockOutput(selector) {
        this.stopClock();
        const cleared = selector == null || selector === '';
        this._clockSelector = cleared ? null : selector;
        midiConfig.clockOutputId = cleared ? null : resolvePortSelector(this.outputPorts(), selector);
        this._pick();
    }

    onPulse(index, pulse) {
        if (this.output) {
            const blip = blipForPulse(index, pulse);
            // Scheduled onto the pulse's landing — the cycle's start (the
            // audible click), or its midpoint for an offset voice — Web
            // MIDI future timestamps keep main-thread jitter away from
            // the receiver
            if (blip) this.sendNoteAt(blip, pulseLandingMs(audioEngine.context, pulse));
        }
        if (AppState.midiClockVoice === null) this.stopClock();
    }

    /**
     * A note on/off pair on the note-out port at wall-clock `atMs`
     * (performance.now() timeline). The off is scheduled `durationMs`
     * later — nothing waits on a timer, so page throttling can't drop it.
     */
    sendNoteAt({ note, velocity, channel, durationMs }, atMs) {
        if (!this.output) return;
        const status = Math.max(0, Math.min(15, (channel || 1) - 1));
        this.output.send([NOTE_ON | status, note, velocity], atMs);
        this.output.send([NOTE_OFF | status, note, 0], atMs + durationMs);
    }

    /** One clock tick on the clock port at wall-clock `atMs`. */
    sendClockTickAt(atMs) {
        if (!this.clockOutput) return;
        this.clockOutput.send([CLOCK_TICK], atMs);
        this._tickCursor = Math.max(this._tickCursor, atMs);
    }

    /** Schedule one clock beat's ticks from its {frequency, audioTime} message. */
    sendClockTicks(beat) {
        const freq = beat.frequency;
        if (!(freq > 0)) return;
        const periodMs = 1000 / freq;
        // Anchor the tick grid on the beat boundary — always one of the
        // voice's cycle boundaries, so the downbeat lands with an audible
        // click; each message schedules the NEXT beat's 24 ticks, so
        // consecutive batches tile without gap or overlap — and when the
        // rate changed, around the ticks already scheduled
        const boundary = pulseLandingMs(audioEngine.context, beat);
        const ahead = this._streamTicks.filter((t) => t >= boundary);
        const ticks = planCycleTicks({ boundary, periodMs, cursor: this._tickCursor, carried: ahead.length });
        if (ticks.length === 0) return;

        if (!this._clockRunning) {
            this.clockOutput.send([CLOCK_START], ticks[0]);
            this._clockRunning = true;
        } else if (this._tickSpacing !== null && isClockDropout(this._tickCursor, ticks[0], this._tickSpacing)) {
            // The receiver may have given the clock up over the silence;
            // CONTINUE resumes it in place (START would rewind it)
            this.clockOutput.send([CLOCK_CONTINUE], ticks[0]);
        }
        for (const t of ticks) this.clockOutput.send([CLOCK_TICK], t);
        this._streamTicks = [...ahead, ...ticks];
        this._tickCursor = ticks[ticks.length - 1];
        this._tickSpacing = periodMs / CLOCK_PPQN;
    }

    /**
     * End the tick stream's bookkeeping. The cursor stays: ticks already
     * scheduled still fire, and the next START must come after them.
     */
    _endStream() {
        this._clockRunning = false;
        this._streamTicks = [];
        this._tickSpacing = null;
    }

    stopClock() {
        if (this.clockOutput && this._clockRunning) this.clockOutput.send([CLOCK_STOP]);
        this._endStream();
    }

    /**
     * Wall-clock send time for a transport message at audio-clock
     * `atAudioTime` (null = now) — never before the last scheduled tick: a
     * previous run's ticks landing after START would start the receiver
     * early and then leave it without a clock until the first real cycle.
     */
    _transportMs(atAudioTime) {
        const at = atAudioTime != null
            ? audioTimeToPerformanceMs(audioEngine.context, atAudioTime)
            : window.performance.now();
        // Strictly after — equal timestamps would lean on the port's send order
        return Math.max(at, this._tickCursor + TRANSPORT_AFTER_TICK_MS);
    }

    /**
     * Transport start on the clock port. Pass the audio-clock time the
     * voices started at and the message is scheduled to their audible
     * onset, through the same clock mapping as blips and ticks; omitted,
     * it fires immediately.
     */
    sendTransportStart(atAudioTime = null) {
        if (!this.clockOutput) return;
        this._endStream();
        this.clockOutput.send([CLOCK_START], this._transportMs(atAudioTime));
        this._clockRunning = true;
    }

    /** Transport continue (resume from a paused position) on the clock port. */
    sendTransportContinue(atAudioTime = null) {
        if (!this.clockOutput) return;
        this._endStream();
        this.clockOutput.send([CLOCK_CONTINUE], this._transportMs(atAudioTime));
        this._clockRunning = true;
    }

    /** Transport stop on the clock port. */
    sendTransportStop() {
        if (!this.clockOutput) return;
        this.clockOutput.send([CLOCK_STOP]);
        this._endStream();
    }
}

export const midiOutputRouter = new MidiOutputRouter();
