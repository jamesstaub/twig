/**
 * VIDEO RECORDER — MediaRecorder capture of a canvas plus a graph tap.
 *
 * Films one canvas and muxes the master audio into the SAME file, so the
 * result is in sync by construction: the browser stamps both tracks off
 * one capture clock, and no client-side muxing or trimming is needed.
 * Knows nothing about voices, takes or app state — the caller hands it a
 * canvas and an AudioNode.
 *
 * Frame rate: `captureStream()` is called WITHOUT an fps, so the stream
 * takes a frame whenever the canvas is drawn. The visualizations animate
 * by FRAME COUNT (a rotation per frame, see tonewheelActions), so a fixed
 * capture rate below the draw rate would play their motion back slowed
 * down; capturing what is actually drawn keeps the video's motion equal
 * to the screen's.
 *
 * Container: MP4 where the runtime can write it (Chrome 126+, Safari),
 * WebM otherwise — `extension` says which arrived.
 */

/** Preferred first; each entry is [mimeType, extension]. */
const CANDIDATES = [
    ['video/mp4;codecs="avc1.4d002a,mp4a.40.2"', 'mp4'],
    ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm'],
];

/** Bits per pixel per frame — line art on a flat field compresses hard. */
const BITS_PER_PIXEL = 0.1;
const MAX_BITRATE = 24e6;

export class VideoRecorder {

    /** @returns {{mimeType: string, extension: string}|null} */
    static format() {
        if (typeof MediaRecorder === 'undefined') return null;
        if (typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
        for (const [mimeType, extension] of CANDIDATES) {
            if (MediaRecorder.isTypeSupported?.(mimeType)) return { mimeType, extension };
        }
        return null;
    }

    static supported() {
        return VideoRecorder.format() !== null;
    }

    /**
     * @param {HTMLCanvasElement} canvas - Filmed as it is drawn
     * @param {Object} opts
     * @param {AudioNode} opts.audioSource - Tapped for the video's audio track
     * @param {number} [opts.frameRate=60] - Only used to size the bitrate
     */
    constructor(canvas, { audioSource, frameRate = 60 }) {
        this.canvas = canvas;
        this.audioSource = audioSource;
        this.frameRate = frameRate;
        this.recorder = null;
        this.audioTap = null;
        this.chunks = [];
        this.format = VideoRecorder.format();
    }

    /** Begin filming now. Throws if the runtime can't record video. */
    start() {
        if (this.recorder) throw new Error('VideoRecorder already recording');
        if (!this.format) throw new Error('video recording unsupported');
        const stream = this.canvas.captureStream();
        // The audio track comes off the live graph through a stream
        // destination — the same signal the speakers get
        this.audioTap = this.audioSource.context.createMediaStreamDestination();
        this.audioSource.connect(this.audioTap);
        for (const track of this.audioTap.stream.getAudioTracks()) stream.addTrack(track);

        const pixels = this.canvas.width * this.canvas.height;
        this.chunks = [];
        this.recorder = new MediaRecorder(stream, {
            mimeType: this.format.mimeType,
            videoBitsPerSecond: Math.min(MAX_BITRATE, Math.round(pixels * this.frameRate * BITS_PER_PIXEL)),
        });
        this.recorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.chunks.push(e.data);
        };
        this.recorder.start();
    }

    /**
     * Stop and assemble the film. Null when nothing was encoded — filming
     * never started, or the window was too short for a single frame (a sync
     * loop can be a few milliseconds long).
     * @returns {Promise<{blob: Blob, mimeType: string, extension: string}|null>}
     */
    stop() {
        const recorder = this.recorder;
        if (!recorder) return Promise.resolve(null);
        this.recorder = null;
        return new Promise((resolve) => {
            recorder.onstop = () => {
                this._release();
                const blob = new Blob(this.chunks, { type: this.format.mimeType });
                this.chunks = [];
                resolve(blob.size > 0
                    ? { blob, mimeType: this.format.mimeType, extension: this.format.extension }
                    : null);
            };
            recorder.stop();
        });
    }

    _release() {
        if (!this.audioTap) return;
        try { this.audioSource.disconnect(this.audioTap); } catch { /* already gone */ }
        for (const track of this.audioTap.stream.getAudioTracks()) track.stop();
        this.audioTap = null;
    }
}
