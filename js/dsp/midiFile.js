/**
 * MIDI FILE (SMF) ENCODER — pure. No Web Audio, no Web MIDI, no app state.
 *
 * Input is a "MIDI document": absolute times in SECONDS on one timeline,
 * plus a tempo map on that same timeline. The encoder converts seconds to
 * ticks through the tempo map, so a DAW that adopts the file's tempo
 * events reconstructs every event at its recorded second — which is what
 * keeps the .mid in sync with the .wav recorded alongside it.
 *
 *   document = {
 *     ppq: 960,
 *     duration: seconds,
 *     tempoMap: [{ time: seconds, usPerBeat: number }, ...]  // time 0 first
 *     tracks: [{ name, channel (1-16), notes: [{ time, note, velocity, durationMs }] }]
 *   }
 */

const DEFAULT_US_PER_BEAT = 500000; // 120 BPM

/**
 * Seconds → ticks through a tempo map. Each tempo segment contributes
 * ticks at its own rate; no rounding until the final value, so clock beats
 * that define the map land on exact tick multiples.
 */
export function secondsToTicks(tempoMap, ppq, seconds) {
    const map = normalizeTempoMap(tempoMap);
    let ticks = 0;
    for (let i = 0; i < map.length; i++) {
        const seg = map[i];
        const end = i + 1 < map.length ? map[i + 1].time : Infinity;
        if (seconds <= seg.time) break;
        const span = Math.min(seconds, end) - seg.time;
        ticks += (span * 1e6 / seg.usPerBeat) * ppq;
        if (seconds <= end) break;
    }
    return Math.max(0, Math.round(ticks));
}

/** Sorted, starting at time 0 (extrapolating the first tempo back to 0). */
export function normalizeTempoMap(tempoMap) {
    // Clamp rather than drop: a beat stamped a few microseconds before the
    // take's start is still the first beat, not a missing tempo
    const map = (tempoMap || [])
        .filter((t) => t && t.usPerBeat > 0 && Number.isFinite(t.time))
        .map((t) => ({ time: Math.max(0, t.time), usPerBeat: t.usPerBeat }))
        .sort((a, b) => a.time - b.time);
    if (map.length === 0) return [{ time: 0, usPerBeat: DEFAULT_US_PER_BEAT }];
    if (map[0].time > 0) map.unshift({ time: 0, usPerBeat: map[0].usPerBeat });
    return map;
}

/**
 * Tempo map from a list of beat times (seconds). Consecutive beats whose
 * interval stays within `tolerance` (relative) of the run's mean are one
 * tempo, set from the run's total span ÷ count so the per-beat jitter of
 * the source (sub-sample stamping) averages out instead of accumulating.
 * A run's tempo is placed at its first beat.
 */
export function tempoMapFromBeats(beats, { tolerance = 1e-3 } = {}) {
    const times = (beats || []).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
    if (times.length < 2) return [];
    const map = [];
    let runStart = 0;
    let runMean = times[1] - times[0];
    for (let i = 1; i < times.length; i++) {
        const interval = times[i] - times[i - 1];
        const n = i - runStart;
        if (n > 0 && Math.abs(interval - runMean) > tolerance * runMean) {
            map.push({ time: times[runStart], usPerBeat: runMean * 1e6 });
            runStart = i - 1;
            runMean = interval;
        } else {
            runMean = (times[i] - times[runStart]) / n;
        }
    }
    map.push({ time: times[runStart], usPerBeat: runMean * 1e6 });
    return map;
}

export function bpmFromUsPerBeat(usPerBeat) {
    return 6e7 / usPerBeat;
}

// ---- Standard MIDI File writing --------------------------------------------

function vlq(value) {
    const bytes = [value & 0x7f];
    let v = value >> 7;
    while (v > 0) {
        bytes.unshift((v & 0x7f) | 0x80);
        v >>= 7;
    }
    return bytes;
}

function textBytes(str) {
    return [...str].map((c) => c.charCodeAt(0) & 0x7f);
}

function u32(value) {
    return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u16(value) {
    return [(value >>> 8) & 0xff, value & 0xff];
}

/** Events {tick, bytes} → one MTrk chunk with delta times and end-of-track. */
function trackChunk(events, endTick) {
    // Stable sort: by tick, note-offs before note-ons at the same tick so a
    // retriggered note never gets its off swallowed by its own on
    const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
    const body = [];
    let last = 0;
    for (const ev of sorted) {
        body.push(...vlq(Math.max(0, ev.tick - last)), ...ev.bytes);
        last = Math.max(last, ev.tick);
    }
    body.push(...vlq(Math.max(0, endTick - last)), 0xff, 0x2f, 0x00);
    return [...textBytes('MTrk'), ...u32(body.length), ...body];
}

function metaEvent(tick, type, data, order = 0) {
    return { tick, order, bytes: [0xff, type, ...vlq(data.length), ...data] };
}

/**
 * Encode a MIDI document as a format-1 Standard MIDI File.
 *
 * `fixedTempo`: write only the document's initial tempo and place every
 * event by absolute time under it. A DAW that flattens imported files to
 * one tempo (Ableton Live outside an Arrangement-view import) then plays
 * the notes at their recorded seconds; the price is that beats after a
 * tempo change no longer sit on the DAW's grid. Without it the full tempo
 * map is written, which tempo-aware imports reproduce exactly.
 * @returns {Uint8Array}
 */
export function encodeMidiFile(doc, { fixedTempo = false } = {}) {
    const ppq = doc.ppq || 960;
    const fullMap = normalizeTempoMap(doc.tempoMap);
    const tempoMap = fixedTempo ? [fullMap[0]] : fullMap;
    const toTicks = (seconds) => secondsToTicks(tempoMap, ppq, seconds);
    const endTick = toTicks(doc.duration || 0);

    // Track 0: tempo/meta
    const tempoTrack = [
        metaEvent(0, 0x03, textBytes(doc.name || 'twig')),
        metaEvent(0, 0x58, [4, 2, 24, 8]), // 4/4
    ];
    for (const t of tempoMap) {
        const us = Math.max(1, Math.min(0xffffff, Math.round(t.usPerBeat)));
        tempoTrack.push(metaEvent(toTicks(t.time), 0x51, [(us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff], 1));
    }

    const chunks = [trackChunk(tempoTrack, endTick)];
    for (const track of doc.tracks || []) {
        const status = Math.max(0, Math.min(15, (track.channel || 1) - 1));
        const events = [metaEvent(0, 0x03, textBytes(track.name || ''))];
        for (const n of track.notes || []) {
            const on = toTicks(n.time);
            const off = Math.max(on + 1, toTicks(n.time + (n.durationMs || 0) / 1000));
            const note = Math.max(0, Math.min(127, Math.round(n.note)));
            const velocity = Math.max(1, Math.min(127, Math.round(n.velocity)));
            events.push({ tick: on, order: 2, bytes: [0x90 | status, note, velocity] });
            events.push({ tick: off, order: 1, bytes: [0x80 | status, note, 0] });
        }
        chunks.push(trackChunk(events, endTick));
    }

    const header = [...textBytes('MThd'), ...u32(6), ...u16(1), ...u16(chunks.length), ...u16(ppq)];
    return Uint8Array.from([...header, ...chunks.flat()]);
}
