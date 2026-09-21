
import { smoothUpdateMasterGain } from "../../utils.js";
import { triggerHarmonicAttack, triggerHarmonicRelease } from "../../audio.js";
import { findParam, quantize } from "../drawbars/drawbarParams.js";
import { FundamentalActions } from "../fundamental/fundamentalActions.js";
import { midiConfig, MIDI_RANGE_SPAN } from "../../appConfig.js";
import { resolvePortSelector } from "./portUtils.js";
import { showStatus } from "../../domUtils.js";
import { MIDI_PORTS_CHANGED } from "../../events.js";

// A CC event older than this sat in a suspended task queue (hidden browser
// tab / occluded jweb view) rather than arriving live.
const STALE_EVENT_MS = 250;
const THROTTLE_WARN_INTERVAL_MS = 30000;

// CC in: each range (midiConfig[startKey] .. +11) sweeps one per-overtone
// parameter over its full range, exactly as its drawbar would
const CC_TARGETS = [
    { startKey: 'gainCCStart', param: findParam('gain', 'gain') },
    { startKey: 'cutoffCCStart', param: findParam('filter', 'cutoff') },
    { startKey: 'convWetCCStart', param: findParam('convolution', 'wet') },
];

/** 0-based overtone index of `number` within the range at `start`, or -1. */
function rangeIndex(number, start) {
    const index = number - start;
    return index >= 0 && index < MIDI_RANGE_SPAN ? index : -1;
}

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
        const portsChanged = () => {
            this._bind();
            document.dispatchEvent(new CustomEvent(MIDI_PORTS_CHANGED));
        };
        portsChanged();
        this.midi.onstatechange = portsChanged;
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

    /** Available system input ports, for the settings panel's selector. */
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


    /**
     * Each inbound concern listens on its own channel: CCs on the CC
     * channel, trigger notes on the trigger channel, every other note on
     * the fundamental channel. Where the trigger and fundamental channels
     * coincide, the trigger range wins — a pad hit must not also retune.
     */
    route(msg) {
        const [status, data1, data2] = msg.data;
        const kind = status & 0xF0;
        const channel = (status & 0x0F) + 1; // MIDI channels are 1-16

        if (kind === 0xB0) {
            if (channel !== midiConfig.ccChannel) return;
            // msg.timeStamp is when the browser's MIDI service received the
            // message; a large gap to now means the page was suspended meanwhile.
            return this.handleCC(data1, data2, performance.now() - msg.timeStamp);
        }

        if (kind !== 0x90 && kind !== 0x80) return;
        const isNoteOn = kind === 0x90 && data2 > 0;

        if (channel === midiConfig.triggerChannel) {
            const index = rangeIndex(data1, midiConfig.triggerNoteStart);
            if (index !== -1) {
                return isNoteOn ? triggerHarmonicAttack(index) : triggerHarmonicRelease(index);
            }
        }
        if (isNoteOn && channel === midiConfig.fundamentalChannel) {
            const note = data1 + 12 * midiConfig.fundamentalTranspose;
            FundamentalActions.setFundamentalByMidi(Math.max(0, Math.min(127, note)));
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

        for (const { startKey, param } of CC_TARGETS) {
            const index = rangeIndex(cc, midiConfig[startKey]);
            if (index === -1) continue;
            param.set(index, quantize(param, param.min + norm * (param.max - param.min)));
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
}

export const midiInputRouter = new MidiInputRouter();
