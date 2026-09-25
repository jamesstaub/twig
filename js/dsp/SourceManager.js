/**
 * SOURCE MANAGER
 *
 * Builds and owns the shared external source node for non-oscillator
 * source modes. Every voice chain taps the same node — with the per-voice
 * lowpass tuned to the voice's pitch at high resonance, the twelve chains
 * become a resonant filter bank over the external signal.
 *
 *   adc        — microphone/line input via getUserMedia, one channel picked
 *   soundfile  — the decoded file, looped or one-shot (MONO sample mode —
 *                one player for the bank; POLY mode gives each voice its
 *                own player, see stages/source.js, and only reads
 *                `fileBuffer` / `fileFundamental` from here)
 *   pink/white — generated noise loops
 *
 * DSP only: no app state, no DOM. Callers pass the context and mode
 * options; `prepare` returns the node to tap (null for 'oscillators').
 */

import { detectFundamental, monoMix } from './pitchDetect.js';

/** Bins of the file's waveform overview (min/max per bin, for drawing). */
const OVERVIEW_BINS = 1024;

function overviewOf(buffer) {
    const data = monoMix(buffer);
    const bins = Math.min(OVERVIEW_BINS, data.length);
    const min = new Float32Array(bins);
    const max = new Float32Array(bins);
    for (let b = 0; b < bins; b++) {
        const from = Math.floor((b * data.length) / bins);
        const to = Math.max(from + 1, Math.floor(((b + 1) * data.length) / bins));
        let lo = Infinity, hi = -Infinity;
        for (let i = from; i < to; i++) { if (data[i] < lo) lo = data[i]; if (data[i] > hi) hi = data[i]; }
        min[b] = lo;
        max[b] = hi;
    }
    return { min, max, duration: buffer.duration };
}

const NOISE_SECONDS = 4;

function whiteNoiseBuffer(ctx) {
    const buffer = ctx.createBuffer(1, NOISE_SECONDS * ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
}

/** Paul Kellet's economy pink-noise filter over white noise. */
function pinkNoiseBuffer(ctx) {
    const buffer = ctx.createBuffer(1, NOISE_SECONDS * ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.25;
    }
    return buffer;
}

export class SourceManager {

    constructor() {
        this.node = null;       // the node voices tap (null in oscillator mode)
        this._bufferSource = null;
        this._stream = null;
        this._fileBuffer = null;
        this.fileName = null;
        /** Detected fundamental of the loaded file (Hz), or null. */
        this.fileFundamental = null;
        /** The file's waveform as a min/max envelope, for the Source preview. */
        this.fileOverview = null;
        this._loop = true;
        this._range = null; // [start, end] fractions of the file, or null
        this._ctx = null;
        /** Audio-clock time the mono player last (re)started, for the voices' clocks. */
        this.playerStartedAt = null;
    }

    /**
     * Build (or rebuild) the shared source for a mode. Disposes whatever
     * was active first. Returns the tap node, or null for 'oscillators'.
     *
     * @param {AudioContext} ctx
     * @param {string} mode - 'oscillators'|'adc'|'soundfile'|'pink'|'white'
     * @param {Object} opts - { deviceId, channel } for adc; { loop, range } for soundfile
     */
    async prepare(ctx, mode, { deviceId = null, channel = 0, loop = true, range = null } = {}) {
        this.dispose();
        if (mode === 'oscillators') return null;
        this._ctx = ctx;
        this._loop = loop;
        this._range = range;

        const out = ctx.createGain();

        if (mode === 'adc') {
            const constraints = {
                audio: deviceId ? { deviceId: { exact: deviceId } } : true,
                video: false,
            };
            this._stream = await navigator.mediaDevices.getUserMedia(constraints);
            const mediaSource = ctx.createMediaStreamSource(this._stream);
            // Pick one channel of the input; a mono stream only has ch 0
            const channels = Math.max(1, mediaSource.channelCount || 1);
            const splitter = ctx.createChannelSplitter(channels);
            mediaSource.connect(splitter);
            splitter.connect(out, Math.min(channel, channels - 1), 0);
        } else if (mode === 'soundfile') {
            // No file yet: a silent source — the bank plays once one loads
            if (this._fileBuffer) this._startPlayer(this._fileBuffer, out, loop, range);
        } else {
            this._startPlayer(mode === 'pink' ? pinkNoiseBuffer(ctx) : whiteNoiseBuffer(ctx), out, true);
        }

        this.node = out;
        return out;
    }

    _startPlayer(buffer, out, loop, range = null) {
        const src = this._ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = loop;
        const start = (range?.[0] ?? 0) * buffer.duration;
        const end = (range?.[1] ?? 1) * buffer.duration;
        src.loopStart = start;
        src.loopEnd = end;
        src.connect(out);
        const at = this._ctx.currentTime;
        if (loop) src.start(at, start);
        else src.start(at, start, Math.max(0, end - start));
        this._bufferSource = src;
        this.playerStartedAt = at;
    }

    /** Seconds one pass of the file (or its range) takes, or null without a file. */
    get loopSeconds() {
        if (!this._fileBuffer) return null;
        return ((this._range?.[1] ?? 1) - (this._range?.[0] ?? 0)) * this._fileBuffer.duration;
    }

    _stopPlayer() {
        if (this._bufferSource) {
            try { this._bufferSource.stop(); } catch { /* already stopped */ }
            this._bufferSource.disconnect();
            this._bufferSource = null;
        }
    }

    /** Sound-file mode: play the file again from its start (a one-shot's trigger). */
    retrigger() {
        if (!this.node || !this._fileBuffer) return;
        this._stopPlayer();
        this._startPlayer(this._fileBuffer, this.node, this._loop, this._range);
    }

    /** Sound-file mode: loop or one-shot; the file restarts under the new setting. */
    setLoop(loop) {
        this._loop = loop;
        if (this.node && this._fileBuffer) this.retrigger();
    }

    /** Sound-file mode: the part of the file to play ([start, end] fractions, null = all). */
    setRange(range) {
        this._range = range;
        if (this.node && this._fileBuffer) this.retrigger();
    }

    /**
     * Keep a decoded sound file for 'soundfile' mode and detect its
     * fundamental (YIN, in a worker). Resolves once the fundamental is
     * known; a newer file loaded meanwhile wins.
     */
    async setFileBuffer(audioBuffer, name) {
        this._fileBuffer = audioBuffer;
        this.fileName = name;
        this.fileFundamental = null;
        this.fileOverview = overviewOf(audioBuffer);
        // A file swapped in while the mono player runs replaces it in place
        if (this.node) this.retrigger();
        return this.detectFundamental(null);
    }

    /**
     * Re-detect the fundamental for a part of the file ([start, end]
     * fractions; null = the whole file) — a selected region can have its
     * own pitch. Keeps the previous value when the region has none.
     */
    async detectFundamental(range) {
        const buffer = this._fileBuffer;
        if (!buffer) return null;
        const hz = await detectFundamental(buffer, range);
        if (this._fileBuffer !== buffer) return this.fileFundamental; // a newer file won
        if (hz !== null) this.fileFundamental = hz;
        return this.fileFundamental;
    }

    get hasFile() {
        return Boolean(this._fileBuffer);
    }

    /** The decoded file, for per-voice players (poly sample mode). */
    get fileBuffer() {
        return this._fileBuffer;
    }

    /** Stop and release the active source (keeps the loaded file). */
    dispose() {
        this._stopPlayer();
        if (this._stream) {
            for (const track of this._stream.getTracks()) track.stop();
            this._stream = null;
        }
        if (this.node) {
            try { this.node.disconnect(); } catch { /* already disconnected */ }
            this.node = null;
        }
    }

    /** Available audio-input devices for the ADC selector. */
    async inputDevices() {
        if (!navigator.mediaDevices?.enumerateDevices) return [];
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices
            .filter((d) => d.kind === 'audioinput')
            .map((d) => ({ id: d.deviceId, label: d.label || `Input ${d.deviceId.slice(0, 6)}` }));
    }
}

export const sourceManager = new SourceManager();
