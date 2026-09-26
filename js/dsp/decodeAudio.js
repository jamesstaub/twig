import { decodeAiff, isAiff } from './aiff.js';

/**
 * Decode an audio file to an AudioBuffer. The browser handles WAV/MP3/
 * FLAC/OGG/M4A; AIFF (Logic's and Pro Tools' default) it cannot — Chromium
 * ships no AIFF demuxer — so that goes through js/dsp/aiff.js.
 *
 * `ctx` may be an OfflineAudioContext: decoding for a drawing costs no
 * audio device.
 */
export async function decodeAudioFile(ctx, arrayBuffer) {
    if (!isAiff(arrayBuffer)) return ctx.decodeAudioData(arrayBuffer);
    const { sampleRate, channels } = decodeAiff(arrayBuffer);
    const buffer = ctx.createBuffer(channels.length, channels[0].length, sampleRate);
    channels.forEach((data, c) => buffer.copyToChannel(data, c));
    return buffer;
}
