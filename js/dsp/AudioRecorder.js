/**
 * AUDIO RECORDER — Web Audio capture of arbitrary graph taps.
 *
 * Wraps the recorder worklet: connects the given tap nodes to one
 * AudioWorkletNode input each, starts capture at an exact audio-clock
 * time, and collects the streamed Float32 chunks. Knows nothing about
 * voices, MIDI, or app state — the caller decides what to tap.
 *
 * Latency: a tap downstream of look-ahead dynamics (the master chain's
 * compressors) hears the signal `latencyFrames` late. Those frames are
 * trimmed from the front of the take so sample 0 corresponds exactly to
 * `startTime` on the graph's source timeline — the same clock the gate
 * worklets stamp their pulses with.
 */

const WORKLET_URL = 'js/dsp/worklets/recorder-processor.js';

export class AudioRecorder {

    /** Load the worklet module once per context. */
    static async load(ctx) {
        await ctx.audioWorklet.addModule(WORKLET_URL);
    }

    constructor(ctx) {
        this.ctx = ctx;
        this.node = null;
        this.taps = [];
        this.chunks = [];
        this.frames = 0;
        this.startTime = null;
        this.latencyFrames = 0;
        this.channelsPerTap = 1;
        this.recording = false;
    }

    /**
     * Begin capturing.
     * @param {Object} opts
     * @param {AudioNode[]} opts.taps - One node per input; each contributes `channelsPerTap` channels
     * @param {number} [opts.channelsPerTap=1] - Channels kept per tap (explicit up/down-mix)
     * @param {number} [opts.latencyFrames=0] - Frames the taps lag the source timeline by
     * @param {number|null} [opts.atTime=null] - Audio-clock time to start at (null = next block)
     * @param {number|null} [opts.endTime=null] - Audio-clock time to stop at, enforced
     *   sample-exactly on the audio thread; the take then arrives via `onEnded`
     * @returns {Promise<number>} the actual start time (audio clock, seconds)
     */
    start({ taps, channelsPerTap = 1, latencyFrames = 0, atTime = null, endTime = null }) {
        if (this.recording) throw new Error('AudioRecorder already recording');
        const ctx = this.ctx;
        this.chunks = [];
        this.frames = 0;
        this.latencyFrames = Math.max(0, Math.round(latencyFrames));
        this.channelsPerTap = channelsPerTap;
        this.recording = true;

        this.node = new AudioWorkletNode(ctx, 'recorder-processor', {
            numberOfInputs: taps.length,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            channelCount: channelsPerTap,
            channelCountMode: 'explicit',
            channelInterpretation: 'speakers',
            processorOptions: { inputs: taps.length, channelsPerInput: channelsPerTap },
        });
        this.taps = taps;
        taps.forEach((tap, i) => tap.connect(this.node, 0, i));
        // A silent output keeps the node in the rendering graph
        this.node.connect(ctx.destination);

        return new Promise((resolve) => {
            this.node.port.onmessage = (e) => {
                const msg = e.data;
                if (msg.type === 'started') {
                    this.startTime = msg.frame / ctx.sampleRate;
                    resolve(this.startTime);
                } else if (msg.type === 'data') {
                    this.chunks.push(msg.channels.map((b) => new Float32Array(b)));
                    this.frames += msg.frames;
                } else if (msg.type === 'stopped') {
                    this._onStopped();
                }
            };
            const frame = atTime == null ? null : Math.round(atTime * ctx.sampleRate);
            // The head trim (look-ahead latency) shortens the take; capture
            // that many extra frames so a fixed-length take stays exact
            const endFrame = endTime == null ? null : Math.round(endTime * ctx.sampleRate) + this.latencyFrames;
            this.node.port.postMessage({ type: 'start', frame, endFrame });
        });
    }

    /**
     * Stop and assemble the take.
     * @returns {Promise<{sampleRate:number, channels:Float32Array[], startTime:number, duration:number}>}
     */
    stop() {
        if (!this.recording || !this.node) return Promise.resolve(null);
        return new Promise((resolve) => {
            this._stopped = resolve;
            this.node.port.postMessage({ type: 'stop' });
        });
    }

    /**
     * The worklet finished — by 'stop' or by reaching its end frame.
     * Resolves a pending stop(); an unprompted end goes to `onEnded`.
     */
    _onStopped() {
        const node = this.node;
        // Unhook both ends: node.disconnect() only drops its own output;
        // the taps' connections INTO it would otherwise keep every
        // finished recorder node attached to the graph
        for (const tap of this.taps) {
            try { tap.disconnect(node); } catch { /* already gone */ }
        }
        this.taps = [];
        try { node.disconnect(); } catch { /* already gone */ }
        this.node = null;
        this.recording = false;
        const take = this._assemble();
        const resolve = this._stopped;
        this._stopped = null;
        if (resolve) resolve(take);
        else this.onEnded?.(take);
    }

    _assemble() {
        const sampleRate = this.ctx.sampleRate;
        const channelCount = this.chunks[0]?.length ?? 0;
        const trim = Math.min(this.latencyFrames, this.frames);
        const length = this.frames - trim;
        const channels = [];
        for (let ch = 0; ch < channelCount; ch++) {
            const out = new Float32Array(length);
            let pos = -trim;
            for (const chunk of this.chunks) {
                const data = chunk[ch];
                if (pos + data.length <= 0) { pos += data.length; continue; }
                const from = pos < 0 ? -pos : 0;
                out.set(data.subarray(from), pos + from);
                pos += data.length;
            }
            channels.push(out);
        }
        this.chunks = [];
        return { sampleRate, channels, startTime: this.startTime, duration: length / sampleRate };
    }
}
