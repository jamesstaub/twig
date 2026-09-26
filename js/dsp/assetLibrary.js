/**
 * ASSET LIBRARY — what the session's material means, over the raw store.
 *
 * The store (assetStore.js) holds bytes under a content hash. This turns
 * those bytes back into the things the app uses — a PeriodicWave, an
 * impulse response, a decoded sound file — and hands them to the managers
 * that own them at runtime (WavetableManager, IRManager, SourceManager).
 *
 * LAZY BY DESIGN: `restore()` runs at boot and only reads the small parts
 * — coefficients, PCM, names — so menus are populated and presets that
 * reference an asset resolve. Nothing touches an AudioContext, because at
 * boot there isn't one: building it costs worklet loading and a latency
 * probe, and the page should not pay that before a note is asked for. The
 * managers create their PeriodicWave / AudioBuffer the first time the
 * asset is actually used (`useContext`).
 *
 * Because ids are content hashes, a preset's `custom_9f86d0…` or
 * `ir_a3f1…` means one exact payload — the same reference works after a
 * reload, on another machine once assets sync, and never silently points
 * at a different bake.
 */

import { ASSET, assetStore } from './assetStore.js';
import { irManager } from './IRManager.js';
import { sourceManager } from './SourceManager.js';

/**
 * Save a baked waveform. Its identity is the spectrum itself, so baking
 * the same drawbar setting twice is one asset.
 * @returns {Promise<string>} the `custom_…` id
 */
export function saveWave({ real, imag, periodMultiplier, name }) {
    return assetStore.put({
        kind: ASSET.wave.kind,
        identity: [real, imag, periodMultiplier],
        payload: { real, imag },
        meta: { periodMultiplier, name },
    });
}

/**
 * Save an impulse response: its samples, the rate they were made at, and
 * the fundamental it was baked at (voices are given a pitched copy).
 * @returns {Promise<string>} the `ir_…` id
 */
export function saveIR({ buffer, name, bakeFrequency }) {
    const pcm = buffer.getChannelData(0).slice();
    return assetStore.put({
        kind: ASSET.ir.kind,
        identity: [pcm, buffer.sampleRate, bakeFrequency],
        payload: { pcm },
        meta: { sampleRate: buffer.sampleRate, bakeFrequency, name },
    });
}

/**
 * Save a sound file as the user gave it: the original encoded bytes, not
 * the decoded samples. A 3 MB mp3 stays 3 MB instead of becoming 30 MB of
 * float, and it re-decodes at whatever rate the context runs at.
 * @returns {Promise<string>} the `sf_…` id
 */
export function saveSoundFile({ bytes, name }) {
    return assetStore.put({
        kind: ASSET.soundfile.kind,
        identity: [bytes],
        payload: { bytes },
        meta: { name },
    });
}

/**
 * A kind's assets as the library view lists them — id, name, size, date,
 * and the meta the kind carries — without their payloads.
 */
export function listAssets(kind) {
    return assetStore.summaries(kind);
}

/** One asset with its payload: what a preview draws or a download writes. */
export function assetRecord(id) {
    return assetStore.get(id);
}

/** The encoded bytes of a stored sound file, or null. */
export async function soundFileBytes(id) {
    return (await assetStore.get(id))?.bytes ?? null;
}

/** A new display name. The id is the content hash and does not change. */
export function renameAsset(id, name) {
    return assetStore.setName(id, name);
}

export function forgetAsset(id) {
    return assetStore.remove(id);
}

/**
 * Put the machine's library back into the managers. Call once at boot,
 * before the UI renders its menus; resolves when they know what exists.
 *
 * @param {WavetableManager} wavetableManager - The live wavetable store
 */
export async function restore(wavetableManager) {
    const [waves, irs] = await Promise.all([
        assetStore.list(ASSET.wave.kind),
        assetStore.list(ASSET.ir.kind),
    ]);
    for (const record of waves) {
        wavetableManager.adopt(record.id, {
            real: record.real,
            imag: record.imag,
            periodMultiplier: record.meta?.periodMultiplier || 1,
            name: record.meta?.name || '',
        });
    }
    for (const record of irs) {
        irManager.adopt(record.id, {
            pcm: record.pcm,
            sampleRate: record.meta?.sampleRate || 48000,
            bakeFrequency: record.meta?.bakeFrequency || 0,
            name: record.meta?.name || '',
        });
    }
    return { waves: waves.length, irs: irs.length };
}

/**
 * Hand the managers a context once the engine has one, so they can
 * materialize what the session asks for.
 */
export function useContext(ctx, wavetableManager) {
    wavetableManager?.useContext(ctx);
    irManager.useContext(ctx);
    sourceManager.useContext?.(ctx);
}
