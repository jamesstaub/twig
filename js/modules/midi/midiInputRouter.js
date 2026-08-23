
import { smoothUpdateMasterGain } from "../../utils.js";
import { DrawbarsActions } from "../drawbars/drawbarsActions.js";
import { FundamentalActions } from "../fundamental/fundamentalActions.js";
import { midiConfig } from "../../config.js";
import { resolvePortSelector } from "./portUtils.js";
import { showStatus } from "../../domUtils.js";

// A CC event older than this sat in a suspended task queue (hidden browser
// tab / occluded jweb view) rather than arriving live.
const STALE_EVENT_MS = 250;
const THROTTLE_WARN_INTERVAL_MS = 30000;

export class MidiInputRouter {

    constructor() {
        this.lastCC = {};
        this._staleCC = new Map(); // cc -> newest value seen in a stale backlog
        this._staleFlushScheduled = false;
        this._lastThrottleWarning = -Infinity;
    }


    async init() {
        try {
            this.midi = await navigator.requestMIDIAccess();
        } catch (err) {
            // Expected inside jweb/embedded webviews, which deny Web MIDI —
            // control flows over the OSC WebSocket bridge there instead
            console.info(`[midi] Web MIDI unavailable (${err.name}) — OSC/WebSocket control unaffected`);
            return;
        }
        this._bind();
        this.midi.onstatechange = () => this._bind();
    }

    /** Attach the handler to the selected input port, or all when unset. */
    _bind() {
        if (!this.midi) return;
        // A selector set before Web MIDI was up resolves now that ports exist
        if (this._selector != null && !this.inputPorts().some((i) => i.id === midiConfig.inputId)) {
            const id = resolvePortSelector(this.inputPorts(), this._selector);
            if (id) midiConfig.inputId = id;
        }
        for (const input of this.midi.inputs.values()) {
            const active = midiConfig.inputId == null || input.id === midiConfig.inputId;
            input.onmidimessage = active ? (msg) => this.route(msg) : null;
        }
    }

    /** Available system input ports, for the MIDI modal's selector. */
    inputPorts() {
        return this.midi ? [...this.midi.inputs.values()].map((i) => ({ id: i.id, name: i.name })) : [];
    }

    /**
     * Listen on a specific input port — by id, 0-based index, or name
     * (see resolvePortSelector). null/'' clears to all inputs.
     */
    selectInput(selector) {
        const cleared = selector == null || selector === '';
        this._selector = cleared ? null : selector;
        midiConfig.inputId = cleared ? null : resolvePortSelector(this.inputPorts(), selector);
        this._bind();
    }


    route(msg) {
        const [status, data1, data2] = msg.data;
        const channel = (status & 0x0F) + 1; // MIDI channels are 1-16

        // Only respond to configured input channel (midiConfig is the live
        // singleton — no snapshot needed)
        if (channel !== midiConfig.inputChannel) return;

        // msg.timeStamp is when the browser's MIDI service received the
        // message; a large gap to now means the page was suspended meanwhile.
        const age = performance.now() - msg.timeStamp;

        const isCC = (status & 0xF0) === 0xB0;
        if (isCC) return this.handleCC(data1, data2, age);

        const isNoteOn = (status & 0xF0) === 0x90 && data2 > 0;
        const isNoteOff = (status & 0xF0) === 0x80 || data2 === 0;
        if (isNoteOn || isNoteOff) {
            // Feedback-loop guard: our own pulse outputs send low note
            // numbers (1..12 by default) — ignore them on the way back in
            // so an IAC in/out loop can't retrigger the fundamental.
            if (data1 < midiConfig.inputNoteMin) return;
            return isNoteOn ? this.handleNoteOn(data1, data2) : this.handleNoteOff(data1);
        }
    }

    handleCC(cc, val, age = 0) {
        // Stale backlog (the embedder suspended this page, then flushed the
        // queue): replaying every buffered value would perform the whole
        // long-finished gesture. Coalesce to the newest value per CC and
        // apply once the backlog has drained.
        if (age > STALE_EVENT_MS) {
            this._staleCC.set(cc, val);
            this.warnThrottled(age);
            if (!this._staleFlushScheduled) {
                this._staleFlushScheduled = true;
                // A macrotask lands after the already-queued MIDI events
                setTimeout(() => {
                    this._staleFlushScheduled = false;
                    const pending = this._staleCC;
                    this._staleCC = new Map();
                    for (const [pendingCC, pendingVal] of pending) {
                        this.applyCC(pendingCC, pendingVal);
                    }
                }, 0);
            }
            return;
        }

        this.applyCC(cc, val);
    }

    applyCC(cc, val) {
        const norm = val / 127;
        // Master Gain (CC7)
        if (cc === 7) {
            smoothUpdateMasterGain(norm);
        }

        // throttle flood of CC changes
        if (this.lastCC[cc] === val) return;
        this.lastCC[cc] = val;

        // Drawbar CCs from current config
        const drawbarIdx = midiConfig.drawbarsCC.indexOf(cc);
        if (drawbarIdx !== -1) {
            DrawbarsActions.setDrawbar(drawbarIdx, norm);
        }
    }

    warnThrottled(age) {
        const now = performance.now();
        if (now - this._lastThrottleWarning < THROTTLE_WARN_INTERVAL_MS) return;
        this._lastThrottleWarning = now;
        const seconds = (age / 1000).toFixed(1);
        console.warn(
            `[MIDI] Events arriving ${seconds}s late — the browser/jweb suspends this page while it is hidden. ` +
            `Keep the window visible, or launch the browser with --disable-backgrounding-occluded-windows --disable-renderer-backgrounding.`
        );
        showStatus(`MIDI arriving ${seconds}s late — window is throttled while hidden`, 'warning');
    }

    handleNoteOn(note) {
        FundamentalActions.setFundamentalByMidi(note);
    }

    handleNoteOff(note) {
        // AudioActions.noteOff(note);
    }
}

export const midiInputRouter = new MidiInputRouter();
