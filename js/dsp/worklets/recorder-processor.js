/**
 * RECORDER PROCESSOR — sample-accurate multi-input capture.
 *
 * Served UNBUNDLED (no imports). Each input is one tap (a mono voice stem
 * or the stereo master); every channel of every input is captured as its
 * own Float32 stream. Capture starts on the audio thread at an exact frame
 * — `start` may name a future frame (e.g. a clock beat boundary) and the
 * first block is copied from that offset — and the actual start frame is
 * reported back, so the main thread can place other audio-clock events
 * (MIDI blips) relative to sample 0 without guessing.
 *
 * Messages in:  {type:'start', frame|null}   {type:'stop'}
 * Messages out: {type:'started', frame}
 *               {type:'data', channels: ArrayBuffer[], frames}   (transferred)
 *               {type:'stopped', frame}
 */

const DEFAULT_FLUSH_FRAMES = 16384;

class RecorderProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const opts = options.processorOptions || {};
        this.inputCount = opts.inputs || 1;
        this.channelsPerInput = opts.channelsPerInput || 1;
        this.flushFrames = opts.flushFrames || DEFAULT_FLUSH_FRAMES;
        this.channelCount = this.inputCount * this.channelsPerInput;
        this.state = 'idle'; // idle | armed | recording
        this.startAt = null;
        this.startFrame = 0;
        this.alive = true;
        this._newChunk();
        this.port.onmessage = (e) => this._onMessage(e.data);
    }

    _newChunk() {
        this.chunk = Array.from({ length: this.channelCount }, () => new Float32Array(this.flushFrames));
        this.fill = 0;
    }

    _onMessage(msg) {
        if (!msg) return;
        if (msg.type === 'start' && this.state === 'idle') {
            this.startAt = Number.isFinite(msg.frame) ? msg.frame : null;
            this.state = 'armed';
        } else if (msg.type === 'stop') {
            if (this.state === 'recording') this._flush();
            this.port.postMessage({ type: 'stopped', frame: currentFrame });
            this.state = 'idle';
            this.alive = false;
        }
    }

    _flush() {
        if (this.fill === 0) return;
        const channels = this.chunk.map((c) => c.slice(0, this.fill).buffer);
        this.port.postMessage({ type: 'data', channels, frames: this.fill }, channels);
        this._newChunk();
    }

    process(inputs) {
        if (!this.alive) return false;
        if (this.state === 'idle') return true;

        const blockFrames = 128;
        let offset = 0;
        if (this.state === 'armed') {
            if (this.startAt != null && this.startAt >= currentFrame + blockFrames) return true;
            offset = this.startAt == null ? 0 : Math.max(0, this.startAt - currentFrame);
            this.startFrame = currentFrame + offset;
            this.state = 'recording';
            this.port.postMessage({ type: 'started', frame: this.startFrame });
        }

        for (let i = offset; i < blockFrames; i++) {
            let ch = 0;
            for (let input = 0; input < this.inputCount; input++) {
                const data = inputs[input] || [];
                for (let c = 0; c < this.channelsPerInput; c++) {
                    // A disconnected input has no channels — record silence
                    this.chunk[ch++][this.fill] = data[c] ? data[c][i] : 0;
                }
            }
            this.fill++;
            if (this.fill >= this.flushFrames) this._flush();
        }
        return true;
    }
}

registerProcessor('recorder-processor', RecorderProcessor);
