/**
 * RECORDING PLAYER — Web Audio playback of a captured take.
 *
 * Plays Float32 channel data through an AudioBufferSourceNode into the
 * destination node it was given, starting at an exact audio-clock time so
 * other schedulers (MIDI) can line up with sample 0. Pause is stop +
 * remembered position: buffer sources are one-shot, so resume creates a
 * fresh source at the saved offset. No app state, no MIDI.
 */

export class RecordingPlayer {

    /**
     * @param {AudioContext} ctx
     * @param {AudioNode} destination - Where playback is routed
     * @param {{sampleRate:number, channels:Float32Array[]}} take - 1 or 2 channels
     */
    constructor(ctx, destination, take) {
        this.ctx = ctx;
        this.destination = destination;
        this.buffer = ctx.createBuffer(take.channels.length, take.channels[0].length, take.sampleRate);
        take.channels.forEach((data, ch) => this.buffer.copyToChannel(data, ch));
        this.source = null;
        this.startedAt = 0;   // audio time the current source started
        this.offset = 0;      // position (seconds) the current source started from
        this.onEnded = null;  // fires when playback runs off the end (not on stop())
    }

    get duration() {
        return this.buffer.duration;
    }

    get playing() {
        return this.source !== null;
    }

    /**
     * Start from `offset` seconds at audio time `atTime` (default: now).
     * @returns {number} the audio time playback begins
     */
    play(offset = 0, atTime = null) {
        this.stop();
        const at = atTime ?? this.ctx.currentTime;
        const source = this.ctx.createBufferSource();
        source.buffer = this.buffer;
        source.connect(this.destination);
        source.onended = () => {
            if (this.source !== source) return; // superseded or stopped
            this.source = null;
            this.offset = 0;
            this.onEnded?.();
        };
        source.start(at, Math.max(0, Math.min(offset, this.buffer.duration)));
        this.source = source;
        this.startedAt = at;
        this.offset = offset;
        return at;
    }

    /** Current position in seconds. */
    position() {
        if (!this.source) return this.offset;
        return Math.min(this.buffer.duration, this.offset + Math.max(0, this.ctx.currentTime - this.startedAt));
    }

    /** Stop playback, keeping the position for a later play(). @returns {number} position */
    stop() {
        if (!this.source) return this.offset;
        const position = this.position();
        const source = this.source;
        this.source = null;
        try { source.stop(); } catch { /* not started yet */ }
        try { source.disconnect(); } catch { /* fine */ }
        this.offset = position;
        return position;
    }

    /** Mix any number of mono stems to one channel (center-pan equivalent). */
    static mixdown(channels) {
        const length = channels[0]?.length ?? 0;
        const out = new Float32Array(length);
        const scale = Math.SQRT1_2;
        for (const data of channels) {
            for (let i = 0; i < length; i++) out[i] += data[i] * scale;
        }
        return out;
    }
}
