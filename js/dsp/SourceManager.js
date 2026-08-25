/**
 * SOURCE MANAGER
 *
 * Builds and owns the shared external source node for non-oscillator
 * source modes. Every voice chain taps the same node — with the per-voice
 * lowpass tuned to the voice's pitch at high resonance, the twelve chains
 * become a resonant filter bank over the external signal.
 *
 *   adc        — microphone/line input via getUserMedia, one channel picked
 *   soundfile  — a decoded AudioBuffer, looped
 *   pink/white — generated noise loops
 *
 * DSP only: no app state, no DOM. Callers pass the context and mode
 * options; `prepare` returns the node to tap (null for 'oscillators').
 */

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
    }

    /**
     * Build (or rebuild) the shared source for a mode. Disposes whatever
     * was active first. Returns the tap node, or null for 'oscillators'.
     *
     * @param {AudioContext} ctx
     * @param {string} mode - 'oscillators'|'adc'|'soundfile'|'pink'|'white'
     * @param {Object} opts - { deviceId, channel } for adc
     */
    async prepare(ctx, mode, { deviceId = null, channel = 0 } = {}) {
        this.dispose();
        if (mode === 'oscillators') return null;

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
        } else {
            let buffer;
            if (mode === 'soundfile') {
                if (!this._fileBuffer) throw new Error('No sound file loaded');
                buffer = this._fileBuffer;
            } else {
                buffer = mode === 'pink' ? pinkNoiseBuffer(ctx) : whiteNoiseBuffer(ctx);
            }
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.loop = true;
            src.connect(out);
            src.start();
            this._bufferSource = src;
        }

        this.node = out;
        return out;
    }

    /** Keep a decoded sound file for 'soundfile' mode. */
    setFileBuffer(audioBuffer, name) {
        this._fileBuffer = audioBuffer;
        this.fileName = name;
    }

    get hasFile() {
        return Boolean(this._fileBuffer);
    }

    /** Stop and release the active source (keeps the loaded file). */
    dispose() {
        if (this._bufferSource) {
            try { this._bufferSource.stop(); } catch { /* already stopped */ }
            this._bufferSource = null;
        }
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
