/**
 * TONEWHEEL FILM — the take's animation, as one video file.
 *
 * App-logic layer between the recorder and the visualization: it builds a
 * second, off-screen tonewheel at the export resolution (the on-screen one
 * keeps animating at its own size), films it with the master audio muxed
 * in, and hands the recorder a blob to store beside the .wav and .mid.
 *
 * Synchronization. The video carries its OWN audio track, tapped from the
 * master limiter — the signal the speakers get — and the browser stamps
 * both tracks off one capture clock, so picture and sound inside the file
 * are in sync however the encoder buffers. Against the take's .wav the
 * video is aligned to the frame the capture window opens on: start and
 * stop are scheduled from the same audio-clock times the audio recorder
 * arms with, so a sync loop's film covers the same loop its .wav does,
 * within the main thread's timer accuracy (a video frame or two — a
 * MediaRecorder cannot be armed on an audio frame).
 *
 * Off screen and animated by frame count, the film advances only as fast
 * as requestAnimationFrame runs it: a hidden or occluded tab throttles the
 * animation, exactly as it throttles the visible wheel.
 */

import { audioEngine } from '../../dsp/engine/AudioEngine.js';
import { VideoRecorder } from '../../dsp/VideoRecorder.js';
import { TonewheelActions } from '../tonewheel/tonewheelActions.js';

/** Export resolutions (square, in pixels) — see recorderConfig.videoSize. */
export const VIDEO_SIZES = { small: 480, medium: 960, large: 1920 };

class TonewheelFilm {

    constructor() {
        this.film = null;       // { canvas, dispose }
        this.recorder = null;
        this.timers = [];
        this.stopping = null;
    }

    /** The runtime can record video at all. */
    static available() {
        return VideoRecorder.supported();
    }

    /** The container the next film will be written in ('mp4' | 'webm'). */
    static extension() {
        return VideoRecorder.format()?.extension ?? null;
    }

    /**
     * Film the tonewheel over a take's capture window.
     * @param {Object} opts
     * @param {number} opts.pixels - Square export resolution
     * @param {number|null} [opts.atTime] - Audio-clock start (null = now)
     * @param {number|null} [opts.endTime] - Audio-clock stop; the film then
     *   ends itself, and stop() returns what it captured
     */
    start({ pixels, atTime = null, endTime = null }) {
        if (this.recorder) return;
        // A previous take's film has been collected by now; drop its result
        this.stopping = null;
        this.film = TonewheelActions.createFilmSketch(pixels);
        this.recorder = new VideoRecorder(this.film.canvas, { audioSource: audioEngine.master.limiter });
        this._at(atTime, () => this.recorder?.start());
        if (endTime != null) this._at(endTime, () => this.stop());
    }

    /**
     * Stop and assemble. Idempotent, and the result KEEPS: a sync loop's
     * film ends itself at the scheduled end time, and the recorder's
     * finalize — which runs later, when the audio thread reports the take —
     * asks again and must get the same film. Null when nothing was filmed.
     * @returns {Promise<{blob: Blob, mimeType: string, extension: string}|null>}
     */
    stop() {
        if (this.stopping) return this.stopping;
        const recorder = this.recorder;
        if (!recorder) return Promise.resolve(null);
        // Held locally: the next take's film must not be disposed by this one
        const film = this.film;
        this._clearTimers();
        this.recorder = null;
        this.film = null;
        this.stopping = recorder.stop().then((video) => {
            film.dispose();
            return video;
        });
        return this.stopping;
    }

    /** Run `fn` at an audio-clock time (immediately when it has passed). */
    _at(time, fn) {
        const delay = time == null ? 0 : (time - audioEngine.now()) * 1000;
        if (delay <= 0) {
            fn();
            return;
        }
        this.timers.push(setTimeout(fn, delay));
    }

    _clearTimers() {
        for (const timer of this.timers) clearTimeout(timer);
        this.timers = [];
    }
}

export const tonewheelFilm = new TonewheelFilm();
export { TonewheelFilm };
