/**
 * OSC-over-WebSocket client.
 *
 * Web MIDI delivery is starved when the page is hidden (background browser
 * tab, occluded jweb view in a Max4Live device). WebSocket messages are
 * I/O-driven and keep flowing, so this is the primary remote-control path
 * for embedded use. The server (server.cjs — standalone or under Node for
 * Max) bridges UDP OSC and Max messages to all connected app instances.
 *
 * Address space (args in brackets; <n> is 1-based):
 *   /twig/drawbar/<n> [f 0-1]     one drawbar amplitude
 *   /twig/drawbars [f f f ...]    all amplitudes at once (preset restore)
 *   /twig/gain [f 0-1]            master gain
 *   /twig/slew [f seconds]        master slew
 *   /twig/note [i midinote]       fundamental via MIDI note number
 *   /twig/freq [f hz]             fundamental via frequency
 *   /twig/system [i index]        overtone system by index
 *   /twig/waveform [s name]       oscillator: square|sine|triangle|sawtooth|custom_*
 *   /twig/subharmonic [i 0|1]     overtone/subharmonic mode
 *   /twig/play [i 0|1]            playback on/off
 *   /twig/reset                   reset drawbars
 *   /twig/randomize               randomize drawbars
 *   /twig/gate/<n> [mode x y]     per-overtone cycle gate (n=0 → all):
 *                                 mode 0/off, 1/alternating (x on, y off),
 *                                 2/euclidean (x pulses in y), 3/probability
 *                                 (x percent), 4/sequence (args: one "10110"
 *                                 string or a list of 0/1 values). Runs in an
 *                                 AudioWorklet — sample-accurate even when
 *                                 the page is hidden.
 *   /twig/pan/<n> [-1..1]         per-overtone stereo pan (n=0 → all);
 *                                 defaults: fundamental centered, overtones
 *                                 alternating R/L at ±0.8
 *   /twig/filter/<n> [mult q?]    per-overtone lowpass (n=0 → all). mult is
 *                                 a 1-based partial index into the current
 *                                 overtone system applied to the voice's
 *                                 audible base (lowest multiple of its pitch
 *                                 clearing 20 Hz) — an overtone series
 *                                 within the overtone series. Tracks
 *                                 fundamental glides. mult <= 0 opens.
 *
 * Instance targeting (optional, shared-server setups only): insert an id
 * segment after /twig — /twig/<id>/drawbar/3 — matching this page's
 * ?instance=<id> query param. In the Max4Live topology each device runs
 * its own server on its own port, so no ids are needed and addresses are
 * plain /twig/<command>. Without an id segment, every instance responds.
 *
 * Upstream: user gestures in the app are emitted back through the socket
 * (prefixed with this instance's id) so the Max device can persist them in
 * Live-native parameters. Inbound applications are not re-emitted.
 */

import { AppState, updateAppState } from "../../config.js";
import { updateHarmonicGate, updateHarmonicFilter, updateHarmonicPan } from "../../audio.js";
import { getVoicePan } from "../../utils.js";
import { DrawbarsActions } from "../drawbars/drawbarsActions.js";
import { SpectralSystemActions } from "../spectralSystem/spectralSystemActions.js";
import { FundamentalActions } from "../fundamental/fundamentalActions.js";
import { PlayToggleActions } from "../playToggle/playToggleActions.js";
import { handleWaveformChange, CURRENT_WAVEFORM_CHANGED } from "../waveform/waveformActions.js";
import { smoothUpdateMasterGain } from "../../utils.js";
import {
    DRAWBAR_CHANGE,
    DRAWBARS_RESET,
    DRAWBARS_RANDOMIZED,
    SPECTRAL_SYSTEM_CHANGED,
    SUBHARMONIC_TOGGLED,
    FUNDAMENTAL_CHANGED,
    PLAY_STATE_CHANGED,
    MASTER_GAIN_CHANGED,
    MASTER_SLEW_CHANGED,
    OVERTONE_SIGNAL_CHANGED
} from "../../events.js";

const COMMANDS = new Set([
    'drawbar', 'drawbars', 'gain', 'slew', 'note', 'freq',
    'system', 'waveform', 'subharmonic', 'play', 'reset', 'randomize',
    'setdrawbarfundamental', 'gate', 'filter', 'pan'
]);

const GATE_MODES = {
    off: 0, 0: 0,
    alt: 1, alternating: 1, 1: 1,
    euclid: 2, euclidean: 2, 2: 2,
    prob: 3, probability: 3, 3: 3,
    seq: 4, sequence: 4, 4: 4,
};

/** Parse a gate sequence: one "10110" string or a list of 0/1 numbers. */
function parseGateSeq(parts) {
    if (parts.length === 1 && typeof parts[0] === 'string') {
        return parts[0].split('').filter((c) => c === '0' || c === '1').map(Number);
    }
    return parts.map((v) => (Number(v) > 0.5 ? 1 : 0));
}

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 15000;

export class OscClient {

    constructor() {
        // Optional filter for shared-server setups; unused (null) in the
        // per-device-server Max4Live topology
        this.instance = new URLSearchParams(window.location.search).get('instance');
        this.ws = null;
        this.retryDelay = RETRY_MIN_MS;
        this._applyingInbound = false;
        this._pendingInboundPlay = null;
        this._closed = false;
    }

    /**
     * Fetch the bridge's cached state (pushed by the Max patch, possibly
     * long before this page existed) and apply it to AppState. Called
     * BEFORE the UI initializes, so the first render already shows Live's
     * parameter values — no flash of defaults. No-op without a bridge.
     */
    async bootstrap() {
        let entries;
        try {
            const res = await fetch('/state', { cache: 'no-store' });
            if (!res.ok) return;
            entries = await res.json();
        } catch {
            return; // static hosting / no bridge — defaults apply
        }
        for (const msg of entries) {
            try {
                this.route(msg);
            } catch (err) {
                console.error('[osc] bootstrap failed to apply', msg.address, err);
            }
        }
    }

    init() {
        this.connect();
        this.bindUpstreamEvents();
    }

    connect() {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
        try {
            this.ws = new WebSocket(`${proto}://${window.location.host}/osc`);
        } catch {
            this.scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            this.retryDelay = RETRY_MIN_MS;
            console.log(`[osc] connected${this.instance ? ` as instance ${this.instance}` : ''}`);
        };
        this.ws.onmessage = (e) => {
            let msg;
            try {
                msg = JSON.parse(e.data);
            } catch {
                return;
            }
            this.route(msg);
        };
        this.ws.onclose = () => this.scheduleReconnect();
        this.ws.onerror = () => { /* onclose follows; avoid console spam */ };
    }

    scheduleReconnect() {
        if (this._closed) return;
        setTimeout(() => this.connect(), this.retryDelay);
        this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
    }

    close() {
        this._closed = true;
        this.ws?.close();
    }

    // ---------------------------------------------------------------
    // Inbound: OSC → app state
    // ---------------------------------------------------------------

    route({ address, args = [] }) {
        if (typeof address !== 'string') return;
        const parts = address.split('/').filter(Boolean);
        if (parts[0] !== 'twig') return;

        let rest = parts.slice(1);

        // Optional instance segment (anything that isn't a known command)
        if (rest.length && !COMMANDS.has(rest[0])) {
            const target = rest[0];
            rest = rest.slice(1);
            if (target !== String(this.instance ?? '')) return;
        }

        const [command, sub] = rest;
        if (!COMMANDS.has(command)) return;

        this._applyingInbound = true;
        try {
            this.apply(command, sub, args);
        } catch (err) {
            console.error(`[osc] failed to apply ${address}:`, err);
        } finally {
            this._applyingInbound = false;
        }
    }

    apply(command, sub, args) {
        switch (command) {
            case 'drawbar': {
                // /twig/drawbar/<n> [v]  or  /twig/drawbar [n, v]
                const n = sub !== undefined ? parseInt(sub, 10) : Math.round(args[0]);
                const value = sub !== undefined ? args[0] : args[1];
                if (n >= 1 && typeof value === 'number') {
                    DrawbarsActions.setDrawbar(n - 1, clamp01(value));
                }
                break;
            }
            case 'drawbars':
                args.forEach((v, i) => {
                    if (typeof v === 'number') DrawbarsActions.setDrawbar(i, clamp01(v));
                });
                break;
            case 'gain':
                // Drive the navbar slider so the UI reflects the change;
                // its input handler applies the value to state and audio
                this.setSlider('#master-gain-slider-root', clamp01(args[0]),
                    () => smoothUpdateMasterGain(clamp01(args[0])));
                break;
            case 'slew':
                this.setSlider('#master-slew-slider-root', Math.max(0, args[0] || 0),
                    () => updateAppState({ masterSlewValue: Math.max(0, args[0] || 0) }));
                break;
            case 'note':
                FundamentalActions.setFundamentalByMidi(Math.round(args[0]));
                break;
            case 'freq':
                // Exact — no MIDI quantization, so microtonal fundamentals
                // (e.g. a partial promoted via "set as fundamental") restore
                FundamentalActions.setFundamentalExact(args[0]);
                break;
            case 'system':
                SpectralSystemActions.setSystem(Math.round(args[0]));
                break;
            case 'waveform': {
                // By name ("sine") or by index into the oscillator menu
                // (0-3 built-ins, then custom waveforms in creation order).
                // Max/Live can't know how many custom waveforms exist, so
                // anything unknown or out of range is a silent no-op.
                const select = document.getElementById('waveform-select');
                if (!select) break;
                const options = Array.from(select.options).map(o => o.value);
                let name = null;
                if (typeof args[0] === 'string' && options.includes(args[0])) {
                    name = args[0];
                } else if (typeof args[0] === 'number') {
                    name = options[Math.round(args[0])] ?? null;
                }
                if (name !== null && name !== AppState.currentWaveform) {
                    handleWaveformChange({ target: { value: name } });
                }
                break;
            }
            case 'subharmonic':
                if (Boolean(args[0]) !== AppState.isSubharmonic) {
                    SpectralSystemActions.toggleSubharmonic();
                }
                break;
            case 'play':
                if (Boolean(args[0]) !== AppState.isPlaying) {
                    // toggle() is async — PLAY_STATE_CHANGED fires after the
                    // inbound-suppression flag clears, so remember the value
                    // we're applying and skip echoing exactly that one
                    this._pendingInboundPlay = Boolean(args[0]);
                    PlayToggleActions.toggle();
                }
                break;
            case 'gate': {
                // /twig/gate/<n> [mode, x, y] or /twig/gate [n, mode, x, y]
                // n 1-based; n = 0 applies to all partials. mode accepts
                // 0-3 or off|alternating|euclidean|probability. For
                // probability, x = percent 0-100, y unused.
                const [n, rest] = perVoiceArgs(sub, args);
                const mode = GATE_MODES[rest[0]];
                if (n === null || mode === undefined) break;
                const config = mode === 4
                    ? { mode, seq: parseGateSeq(rest.slice(1)) }
                    : {
                        mode,
                        x: Math.max(0, Number(rest[1]) || 0),
                        y: Math.max(0, Number(rest[2]) || 0),
                    };
                this.forVoices(n, (i) => {
                    AppState.oscillatorGates[i] = { ...config };
                    updateHarmonicGate(i);
                });
                break;
            }
            case 'filter': {
                // /twig/filter/<n> [multiplier, q?] or /twig/filter [n, multiplier, q?]
                // n 1-based; n = 0 applies to all. The multiplier is a
                // 1-based partial index into the current overtone system,
                // applied to the voice's audible base — indexes past the
                // system's partial count clamp to its last ratio.
                // multiplier <= 0 opens the filter.
                const [n, rest] = perVoiceArgs(sub, args);
                if (n === null || rest[0] === undefined) break;
                const multiplier = Math.round(Number(rest[0]));
                const q = rest[1] !== undefined ? Math.min(48, Math.max(0.0001, Number(rest[1]))) : undefined;
                this.forVoices(n, (i) => {
                    AppState.oscillatorFilters[i] = {
                        multiplier: multiplier > 0 ? multiplier : 0,
                        ...(q !== undefined ? { q } : {}),
                    };
                    updateHarmonicFilter(i);
                });
                break;
            }
            case 'pan': {
                // /twig/pan/<n> [-1..1] or /twig/pan [n, v]; n = 0 → all
                const [n, rest] = perVoiceArgs(sub, args);
                if (n === null || rest[0] === undefined) break;
                const v = Math.max(-1, Math.min(1, Number(rest[0]) || 0));
                this.forVoices(n, (i) => {
                    if (!Array.isArray(AppState.oscillatorPans)) AppState.oscillatorPans = [];
                    AppState.oscillatorPans[i] = v;
                    updateHarmonicPan(i);
                });
                break;
            }
            case 'setdrawbarfundamental': {
                // 1-based like the drawbar messages; out of range is a no-op
                const n = Math.round(args[0]);
                if (n >= 1) DrawbarsActions.setDrawbarAsFundamental(n - 1);
                break;
            }
            case 'reset':
                DrawbarsActions.reset();
                break;
            case 'randomize':
                DrawbarsActions.randomize();
                break;
        }
    }

    /**
     * Run `fn` for the voice(s) a 1-based selector addresses: n = 0 → every
     * partial of the current system; otherwise the one partial, silently
     * ignored when out of range.
     */
    forVoices(n, fn) {
        const count = AppState.currentSystem.ratios.length;
        if (n === 0) {
            for (let i = 0; i < count; i++) fn(i);
        } else if (n >= 1 && n <= count) {
            fn(n - 1);
        }
    }

    /**
     * Set a navbar slider by dispatching a real input event, so its display
     * text, state, and audio all update through the one existing handler.
     * Falls back to direct state mutation if the slider isn't rendered yet.
     */
    setSlider(rootSelector, value, fallback) {
        const input = document.querySelector(`${rootSelector} input[type="range"]`);
        if (input) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            fallback();
        }
    }

    // ---------------------------------------------------------------
    // Upstream: app state → Max (Live preset params)
    // ---------------------------------------------------------------

    bindUpstreamEvents() {
        document.addEventListener(DRAWBAR_CHANGE, (e) => {
            const { index, value } = e.detail || {};
            if (index !== undefined) this.emit(`drawbar/${index + 1}`, [value]);
        });
        document.addEventListener(SPECTRAL_SYSTEM_CHANGED, (e) => {
            const { index } = e.detail || {};
            if (index !== undefined) this.emit('system', [index]);
            // Partial count/values can change with the system — resync all
            this.emit('drawbars', [...AppState.harmonicAmplitudes]);
        });
        // Bulk amplitude changes: emit the full set so Max multisliders track
        document.addEventListener(DRAWBARS_RESET, () => {
            this.emit('drawbars', [...AppState.harmonicAmplitudes]);
        });
        document.addEventListener(DRAWBARS_RANDOMIZED, () => {
            this.emit('drawbars', [...AppState.harmonicAmplitudes]);
        });
        document.addEventListener(MASTER_GAIN_CHANGED, () => {
            this.emit('gain', [AppState.masterGainValue]);
        });
        document.addEventListener(MASTER_SLEW_CHANGED, () => {
            this.emit('slew', [AppState.masterSlewValue]);
        });
        // Per-overtone signal chain edited in the app (modal UI) → Live params
        document.addEventListener(OVERTONE_SIGNAL_CHANGED, (e) => {
            const { index, kind } = e.detail || {};
            if (index === undefined) return;
            const n = index + 1;
            if (kind === 'gate') {
                const g = AppState.oscillatorGates[index] || { mode: 0 };
                this.emit(`gate/${n}`, g.mode === 4
                    ? [4, (g.seq || []).join('')]
                    : [g.mode ?? 0, g.x ?? 1, g.y ?? 1]);
            } else if (kind === 'filter') {
                const f = AppState.oscillatorFilters[index] || {};
                this.emit(`filter/${n}`, [f.multiplier ?? 0, f.q ?? 0.707]);
            } else if (kind === 'pan') {
                this.emit(`pan/${n}`, [getVoicePan(index)]);
            }
        });
        document.addEventListener(PLAY_STATE_CHANGED, () => {
            if (this._pendingInboundPlay === AppState.isPlaying) {
                this._pendingInboundPlay = null; // inbound application — no echo
                return;
            }
            this.emit('play', [AppState.isPlaying ? 1 : 0]);
        });
        document.addEventListener(SUBHARMONIC_TOGGLED, () => {
            this.emit('subharmonic', [AppState.isSubharmonic ? 1 : 0]);
        });
        document.addEventListener(FUNDAMENTAL_CHANGED, () => {
            // note (quantized) for note-based params, then freq (exact) so
            // microtonal fundamentals — e.g. "set as fundamental" on a
            // partial — survive a preset roundtrip. The bridge caches
            // whichever arrived last, so freq wins for bootstrap.
            this.emit('note', [AppState.currentMidiNote]);
            this.emit('freq', [AppState.fundamentalFrequency]);
        });
        document.addEventListener(CURRENT_WAVEFORM_CHANGED, () => {
            // Index first so a Live int param can store it directly; name
            // second for readability ([unpack i s] and use what you need)
            const select = document.getElementById('waveform-select');
            const index = select
                ? Array.from(select.options).findIndex(o => o.value === AppState.currentWaveform)
                : -1;
            this.emit('waveform', index >= 0
                ? [index, AppState.currentWaveform]
                : [AppState.currentWaveform]);
        });
    }

    emit(command, args) {
        if (this._applyingInbound) return; // inbound application — no echo
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const prefix = this.instance ? `/twig/${this.instance}` : '/twig';
        this.ws.send(JSON.stringify({ address: `${prefix}/${command}`, args }));
    }
}

function clamp01(v) {
    return Math.min(1, Math.max(0, Number(v) || 0));
}

/** Split "/twig/<cmd>/<n> [args]" vs "/twig/<cmd> [n, ...args]" forms. */
function perVoiceArgs(sub, args) {
    if (sub !== undefined) {
        const n = parseInt(sub, 10);
        return [Number.isFinite(n) ? n : null, args];
    }
    const n = Math.round(args[0]);
    return [Number.isFinite(n) ? n : null, args.slice(1)];
}

/** Shared instance: app.js bootstraps it, ui.js connects it. */
export const oscClient = new OscClient();

/** OSC control is on unless the page opts out with ?osc=0. */
export function oscEnabled() {
    return new URLSearchParams(window.location.search).get('osc') !== '0';
}
