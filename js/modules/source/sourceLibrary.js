/**
 * WHAT THE SAMPLER CAN PLAY FROM THE LIBRARY.
 *
 * Not only imported sound files: a baked waveform is a single loop, an
 * impulse response is a short recording of a timbre, and a take is audio
 * like any other. All four are things the user made, all four are audio,
 * so all four belong in the sampler's menu — grouped by where they came
 * from, because that is how the user remembers them.
 *
 * Turning one into an AudioBuffer is per kind and lives only here; from
 * there sourceActions treats it exactly like a dropped file.
 */

import { AppState } from '../../config.js';
import { ASSET, assetStore } from '../../dsp/assetStore.js';
import { assetRecord } from '../../dsp/assetLibrary.js';
import { decodeAudioFile } from '../../dsp/decodeAudio.js';
import { recordingStore } from '../recording/RecordingStore.js';

/** The menu's sections, in order. */
export const SAMPLER_SECTIONS = [
    { kind: ASSET.soundfile.kind, label: 'Uploaded files' },
    { kind: ASSET.wave.kind, label: 'Exported waves' },
    { kind: ASSET.ir.kind, label: 'Impulse responses' },
    { kind: 'recording', label: 'Recordings' },
];

/** A rendered loop of a baked wave is capped here (a very low f0 × a long period). */
const MAX_RENDER_SECONDS = 10;

/**
 * Everything playable, by section.
 * @returns {Promise<Array<{kind: string, label: string, items: Array<{id: string, name: string}>}>>}
 */
export async function samplerLibrary() {
    return Promise.all(SAMPLER_SECTIONS.map(async (section) => ({
        ...section,
        items: section.kind === 'recording'
            ? recordingStore.list().map(({ key, name }) => ({ id: key, name }))
            : (await assetStore.summaries(section.kind))
                .map((asset, i) => ({ id: asset.id, name: asset.name || `${section.label} ${i + 1}` })),
    })));
}

/**
 * One library entry as a sample.
 *
 * A baked wave has no samples — it is coefficients — so it is RENDERED:
 * one loop of the actual PeriodicWave at the table's loop rate (the
 * current fundamental ÷ its period multiplier), offline. That way it is
 * band-limited and loop-continuous exactly as the oscillator would play
 * it, and for the usual single-period table it lands at the fundamental
 * the bank is already tuned to, so loading it changes no pitch.
 *
 * @returns {Promise<AudioBuffer|null>}
 */
export async function samplerBuffer(ctx, kind, id) {
    if (kind === 'recording') {
        const take = recordingStore.get(id);
        return take ? bufferOf(ctx, take.audio.channels, take.audio.sampleRate) : null;
    }
    const record = await assetRecord(id);
    if (!record) return null;
    if (kind === ASSET.soundfile.kind) return decodeAudioFile(ctx, record.bytes.slice(0));
    if (kind === ASSET.ir.kind) return bufferOf(ctx, [record.pcm], record.meta?.sampleRate || 48000);
    return renderWave(ctx, record);
}

async function renderWave(ctx, record) {
    const period = record.meta?.periodMultiplier || 1;
    const loopHz = Math.max(0.1, AppState.fundamentalFrequency / period);
    const length = Math.min(
        Math.round(ctx.sampleRate * MAX_RENDER_SECONDS),
        Math.max(2, Math.round(ctx.sampleRate / loopHz)));
    const offline = new OfflineAudioContext(1, length, ctx.sampleRate);
    const oscillator = offline.createOscillator();
    oscillator.setPeriodicWave(offline.createPeriodicWave(record.real, record.imag));
    oscillator.frequency.value = loopHz;
    oscillator.connect(offline.destination);
    oscillator.start();
    return offline.startRendering();
}

/**
 * A multitrack take is one channel per overtone; a sampler plays a sound,
 * not a session, so anything past stereo is mixed down.
 */
function bufferOf(ctx, channels, sampleRate) {
    const data = channels.length > 2 ? [mixdown(channels)] : channels;
    const buffer = ctx.createBuffer(data.length, data[0].length, sampleRate);
    data.forEach((channel, i) => buffer.copyToChannel(channel, i));
    return buffer;
}

function mixdown(channels) {
    const out = new Float32Array(channels[0].length);
    for (const channel of channels) {
        for (let i = 0; i < out.length; i++) out[i] += channel[i] / channels.length;
    }
    return out;
}
