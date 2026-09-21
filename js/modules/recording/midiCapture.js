/**
 * MIDI CAPTURE — logs the MIDI performance as it happens.
 *
 * A pulse-bus sink: every voice cycle that would reach external gear as a
 * note blip is logged (same mapping as the live router, via pulseMidi),
 * and every beat of the configured clock voice is logged as a beat — the
 * same octave-folded beats the live MIDI clock sends, so a take's tempo
 * is the tempo external gear ran at. All times are audio-clock seconds of
 * the cycle/beat BOUNDARY — the same timeline
 * the audio recorder's sample 0 is placed on — so no wall-clock hop is
 * involved anywhere in the alignment.
 *
 * Capturing starts as soon as the recorder is armed (before the audio has
 * necessarily started): pulses arrive half a cycle ahead of their
 * boundary, so the beat the take is aligned to has already been announced
 * by the time capture begins. The document builder trims to the take.
 */

import { pulseBus } from '../pulse/pulseBus.js';
import { pulseLandingAudioTime } from '../pulse/pulseTime.js';
import { blipForPulse, isClockVoice } from '../midi/pulseMidi.js';

export class MidiCapture {

    constructor() {
        this.notes = [];   // { time, voice, note, velocity, channel, durationMs }
        this.beats = [];   // clock-voice boundary times
        this._unsubscribe = null;
    }

    get active() {
        return this._unsubscribe !== null;
    }

    start() {
        if (this.active) return;
        this.notes = [];
        this.beats = [];
        const offPulse = pulseBus.addLeadSink((index, pulse) => this._onPulse(index, pulse));
        const offClock = pulseBus.addClockSink((index, beat) => {
            if (isClockVoice(index)) this.beats.push(pulseLandingAudioTime(beat));
        });
        this._unsubscribe = () => { offPulse(); offClock(); };
    }

    /** @returns {{notes: Array, beats: number[]}} */
    stop() {
        this._unsubscribe?.();
        this._unsubscribe = null;
        return { notes: this.notes, beats: this.beats };
    }

    _onPulse(index, pulse) {
        const time = pulseLandingAudioTime(pulse);
        const blip = blipForPulse(index, pulse);
        if (blip) this.notes.push({ time, voice: index, ...blip });
    }
}
