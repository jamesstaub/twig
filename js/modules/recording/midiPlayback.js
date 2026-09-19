/**
 * MIDI PLAYBACK — replays a MIDI document in step with audio playback.
 *
 * Given the audio-clock time the take's position `offset` starts sounding
 * at, every note lands at `anchor + (note.time − offset)` and clock ticks
 * are regenerated from the tempo map. Events are handed to the output
 * router in a rolling look-ahead window (Web MIDI future timestamps do
 * the precise placement), so a throttled main thread only has to wake
 * once per window, not per event. Audio-clock → wall-clock goes through
 * pulseTime.js like every other MIDI send.
 */

import { midiOutputRouter } from '../midi/midiOutputRouter.js';
import { CLOCK_PPQN } from '../midi/pulseMidi.js';
import { audioTimeToPerformanceMs } from '../pulse/pulseTime.js';
import { audioEngine } from '../../dsp/engine/AudioEngine.js';
import { normalizeTempoMap } from '../../dsp/midiFile.js';

const LOOKAHEAD_S = 1.5;   // how far ahead events are handed to Web MIDI
const INTERVAL_MS = 250;   // refill cadence (hidden pages clamp timers to ~1 s)

export class MidiPlayback {

    constructor() {
        this._timer = null;
        this._notes = [];
        this._noteIndex = 0;
        this._ticks = null;
        this._anchor = 0;
        this._offset = 0;
        this._end = 0;
    }

    get running() {
        return this._timer !== null;
    }

    /**
     * @param {Object} doc - MIDI document (see midiDocument.js)
     * @param {number} offset - Position (seconds) within the take
     * @param {number} anchor - Audio-clock time that position starts sounding
     */
    start(doc, offset, anchor) {
        this.stop();
        this._notes = doc.tracks.flatMap((t) => t.notes).sort((a, b) => a.time - b.time);
        this._noteIndex = this._notes.findIndex((n) => n.time >= offset);
        if (this._noteIndex < 0) this._noteIndex = this._notes.length;
        this._ticks = doc.hasClock ? clockTicks(doc.tempoMap, offset) : null;
        this._anchor = anchor;
        this._offset = offset;
        this._end = anchor + (doc.duration - offset);
        if (doc.hasClock) {
            if (offset > 0) midiOutputRouter.sendTransportContinue(anchor);
            else midiOutputRouter.sendTransportStart(anchor);
        }
        this._fill();
        this._timer = setInterval(() => this._fill(), INTERVAL_MS);
    }

    /** Stop scheduling. Already-handed-off events (≤ LOOKAHEAD_S) still play. */
    stop() {
        if (!this.running) return;
        clearInterval(this._timer);
        this._timer = null;
        if (this._ticks) midiOutputRouter.sendTransportStop();
        this._ticks = null;
    }

    _fill() {
        const ctx = audioEngine.context;
        if (!ctx) return;
        const horizon = Math.min(this._end, ctx.currentTime + LOOKAHEAD_S);
        const toMs = (docTime) => audioTimeToPerformanceMs(ctx, this._anchor + (docTime - this._offset));

        while (this._noteIndex < this._notes.length) {
            const note = this._notes[this._noteIndex];
            if (this._anchor + (note.time - this._offset) > horizon) break;
            midiOutputRouter.sendNoteAt(note, toMs(note.time));
            this._noteIndex++;
        }
        if (this._ticks) {
            for (;;) {
                const t = this._ticks.peek();
                if (t === null || this._anchor + (t - this._offset) > horizon) break;
                midiOutputRouter.sendClockTickAt(toMs(t));
                this._ticks.next();
            }
        }
        if (ctx.currentTime >= this._end) this.stop();
    }
}

/**
 * Lazy generator of clock-tick times (document seconds) from a tempo map,
 * CLOCK_PPQN per beat, starting at the first tick at or after `from`.
 */
function clockTicks(tempoMap, from) {
    const map = normalizeTempoMap(tempoMap);
    const tickLen = (i) => map[i].usPerBeat / 1e6 / CLOCK_PPQN;
    let seg = 0;
    let t = 0;
    const advance = () => {
        t += tickLen(seg);
        while (seg + 1 < map.length && t >= map[seg + 1].time - 1e-9) {
            seg++;
            t = map[seg].time; // segments begin on a beat: tick grid restarts there
        }
    };
    while (t < from) advance();
    return {
        peek: () => t,
        next: () => { advance(); },
    };
}

export const midiPlayback = new MidiPlayback();
