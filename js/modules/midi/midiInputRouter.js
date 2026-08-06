
import { smoothUpdateMasterGain } from "../../utils.js";
import { DrawbarsActions } from "../drawbars/drawbarsActions.js";
import { FundamentalActions } from "../fundamental/fundamentalActions.js";
import { midiConfig } from "../../config.js";
import { onMidiConfigChange } from "./midiConfigActions.js";
import { showStatus } from "../../domUtils.js";

// A CC event older than this sat in a suspended task queue (hidden browser
// tab / occluded jweb view) rather than arriving live.
const STALE_EVENT_MS = 250;
const THROTTLE_WARN_INTERVAL_MS = 30000;

export class MidiInputRouter {

    constructor() {
        this.lastCC = {};
        this._currentConfig = { ...midiConfig };
        this._staleCC = new Map(); // cc -> newest value seen in a stale backlog
        this._staleFlushScheduled = false;
        this._lastThrottleWarning = -Infinity;
        onMidiConfigChange((newConfig) => {
            this._currentConfig = { ...newConfig };
        });
    }


    async init() {
        let midi;
        try {
            midi = await navigator.requestMIDIAccess();
        } catch (err) {
            // Expected inside jweb/embedded webviews, which deny Web MIDI —
            // control flows over the OSC WebSocket bridge there instead
            console.info(`[midi] Web MIDI unavailable (${err.name}) — OSC/WebSocket control unaffected`);
            return;
        }
        for (let input of midi.inputs.values()) {
            input.onmidimessage = (msg) => this.route(msg);
        }
    }


    route(msg) {
        const [status, data1, data2] = msg.data;
        const channel = (status & 0x0F) + 1; // MIDI channels are 1-16

        // Only respond to configured input channel
        if (channel !== this._currentConfig.inputChannel) return;

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
            if (data1 < this._currentConfig.inputNoteMin) return;
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
        const drawbarIdx = this._currentConfig.drawbarsCC.indexOf(cc);
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
