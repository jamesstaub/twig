import { AppState, midiConfig } from "../../config.js";
import { pulseBus } from "../pulse/pulseBus.js";
import { audioTimeToPerformanceMs, pulseCycleBoundaryMs } from "../pulse/pulseTime.js";
import { resolvePortSelector } from "./portUtils.js";

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const CLOCK_TICK = 0xf8;
const CLOCK_START = 0xfa;
const CLOCK_STOP = 0xfc;

// Short blip: note-off follows note-on almost immediately. A small gap is
// scheduled (Web MIDI accepts future timestamps) so receivers that ignore
// zero-length notes still register it — nothing waits on a timer, so
// note-offs can't be dropped by page throttling.
const BLIP_MS = 50;

/**
 * MidiOutputRouter — turns voice pulses into Web MIDI events.
 *
 *  - Note blips: voices with pulse-MIDI enabled send a note-on/note-off
 *    pair per audible (gate-open) cycle, scheduled onto the cycle BOUNDARY
 *    (the audible click of a low-frequency square/saw) via Web MIDI future
 *    timestamps. All wall-clock scheduling maps through pulseTime.js so
 *    blips, clock, and transport agree with each other and the audio.
 *  - MIDI clock: the single voice assigned as clock source emits 24
 *    evenly-spaced 0xF8 ticks per cycle (cycle = quarter note), scheduled
 *    ahead across the coming period so timing survives throttling. Clock
 *    ticks fire on every cycle, gated or not — a clock must not stutter.
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
    }

    async init() {
        if (!navigator.requestMIDIAccess) return;
        try {
            this.midi = await navigator.requestMIDIAccess();
            this._pick();
            this.midi.onstatechange = () => this._pick();
        } catch {
            // Denied (expected in embedded webviews) — OSC pulses still work
            return;
        }
        pulseBus.addSink((index, pulse) => this.onPulse(index, pulse));
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

    /** Available system output ports, for the MIDI modal's selectors. */
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
        if (this._clockRunning && this.clockOutput) {
            this.clockOutput.send([CLOCK_STOP]);
            this._clockRunning = false;
        }
        const cleared = selector == null || selector === '';
        this._clockSelector = cleared ? null : selector;
        midiConfig.clockOutputId = cleared ? null : resolvePortSelector(this.outputPorts(), selector);
        this._pick();
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
        if (this.output) {
            const midiOn = AppState.oscillatorPulseOuts[index]?.midi ?? midiConfig.pulseMidiEnabled;
            if (midiOn && pulse.gateOn) {
                this.sendBlip(index, pulse);
            }
        }
        if (!this.clockOutput) return;
        if (AppState.midiClockVoice === index) {
            this.sendClockTicks(pulse);
        } else if (this._clockRunning && AppState.midiClockVoice === null) {
            this.clockOutput.send([CLOCK_STOP]);
            this._clockRunning = false;
        }
    }

    sendBlip(index, pulse) {
        const note = MidiOutputRouter.noteForVoice(index);
        if (note === null) return;
        // Velocity tracks the overtone's drawbar gain; silent drawbars
        // (which you can't hear) send no note at all
        const velocity = MidiOutputRouter.velocityForVoice(index);
        if (velocity === 0) return;
        const status = (midiConfig.outputChannel || 1) - 1;
        // Scheduled onto the cycle boundary (the audible click) — Web MIDI
        // future timestamps keep main-thread jitter away from the receiver
        const at = pulseCycleBoundaryMs(AppState.audioContext, pulse);
        this.output.send([NOTE_ON | status, note, velocity], at);
        this.output.send([NOTE_OFF | status, note, 0], at + BLIP_MS);
    }

    /** 1-127 from the overtone's drawbar amplitude; 0 = drawbar silent. */
    static velocityForVoice(index) {
        const amp = AppState.harmonicAmplitudes[index] || 0;
        return amp <= 0.001 ? 0 : Math.max(1, Math.round(amp * 127));
    }

    sendClockTicks(pulse) {
        const freq = pulse.frequency;
        if (!(freq > 0)) return;
        const periodMs = 1000 / freq;
        // Anchor the tick grid on the cycle boundary so the downbeat lands
        // with the audible click; each pulse schedules the NEXT cycle's 24
        // ticks, so consecutive batches tile without gap or overlap
        const boundary = pulseCycleBoundaryMs(AppState.audioContext, pulse);
        if (!this._clockRunning) {
            this.clockOutput.send([CLOCK_START], boundary);
            this._clockRunning = true;
        }
        // 24 PPQN: one voice cycle = one quarter note
        for (let k = 0; k < 24; k++) {
            this.clockOutput.send([CLOCK_TICK], boundary + (k * periodMs) / 24);
        }
    }

    stopClock() {
        if (this.clockOutput && this._clockRunning) {
            this.clockOutput.send([CLOCK_STOP]);
            this._clockRunning = false;
        }
    }

    /**
     * Transport start on the clock port. Pass the audio-clock time the
     * voices started at and the message is scheduled to their audible
     * onset, through the same clock mapping as blips and ticks; omitted,
     * it fires immediately.
     */
    sendTransportStart(atAudioTime = null) {
        if (!this.clockOutput) return;
        const at = atAudioTime != null
            ? audioTimeToPerformanceMs(AppState.audioContext, atAudioTime)
            : window.performance.now();
        this.clockOutput.send([CLOCK_START], at);
        this._clockRunning = true;
    }

    /** Transport stop on the clock port. */
    sendTransportStop() {
        if (!this.clockOutput) return;
        this.clockOutput.send([CLOCK_STOP]);
        this._clockRunning = false;
    }
}

export const midiOutputRouter = new MidiOutputRouter();
