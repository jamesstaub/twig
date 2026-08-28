/**
 * MIDI DOCUMENT — pure assembly of a captured MIDI log into the portable
 * document the file encoder and the playback scheduler both consume.
 *
 * Times are rebased so 0 = the audio take's sample 0. The tempo map comes
 * from the clock voice's beats (see tempoMapFromBeats); with no clock
 * voice the file carries a plain 120 BPM so absolute timing still holds.
 */

import { tempoMapFromBeats, normalizeTempoMap } from '../../dsp/midiFile.js';

export const PPQ = 960;
export const DEFAULT_US_PER_BEAT = 500000; // 120 BPM
const START_SLACK_S = 0.0005;

/**
 * @param {Object} log - { notes, beats } from MidiCapture (absolute audio seconds)
 * @param {Object} take - { startTime, duration } of the audio
 * @param {Object} opts - { midiMode: 'single' | 'multi', name }
 */
export function buildMidiDocument(log, take, { midiMode = 'single', name = 'twig' } = {}) {
    const { startTime, duration } = take;
    // Half a millisecond of slack at the front: the take starts on a whole
    // frame while boundary times are sub-sample estimates, so the beat the
    // take was aligned to can sit a few microseconds before sample 0
    const inTake = (t) => t >= startTime - START_SLACK_S && t <= startTime + duration;

    const notes = log.notes
        .filter((n) => inTake(n.time))
        .map((n) => ({ ...n, time: Math.max(0, n.time - startTime) }))
        .sort((a, b) => a.time - b.time);

    const beats = log.beats.filter(inTake).map((t) => Math.max(0, t - startTime));
    const tempoMap = normalizeTempoMap(tempoMapFromBeats(beats));
    const hasClock = beats.length >= 2;

    const tracks = midiMode === 'multi'
        ? tracksPerVoice(notes)
        : [{ name: 'twig', channel: notes[0]?.channel ?? 1, notes }];

    return {
        name,
        ppq: PPQ,
        duration,
        hasClock,
        tempoMap: hasClock ? tempoMap : [{ time: 0, usPerBeat: DEFAULT_US_PER_BEAT }],
        tracks,
    };
}

/** One track per voice, each on its own channel (voice 0 → channel 1 …). */
function tracksPerVoice(notes) {
    const byVoice = new Map();
    for (const n of notes) {
        if (!byVoice.has(n.voice)) byVoice.set(n.voice, []);
        byVoice.get(n.voice).push(n);
    }
    return [...byVoice.keys()].sort((a, b) => a - b).map((voice) => ({
        name: `overtone ${voice + 1}`,
        channel: (voice % 16) + 1,
        notes: byVoice.get(voice).map((n) => ({ ...n, channel: (voice % 16) + 1 })),
    }));
}
