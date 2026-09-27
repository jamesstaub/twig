/**
 * FILE LIBRARY ACTIONS — what the file manager can do to the user's own
 * material, one place per kind.
 *
 * The library itself (js/dsp/assetStore.js) only knows ids and bytes. This
 * layer knows what a kind MEANS to the synth: what "use it" does, what a
 * deletion leaves dangling, what a download should be called, and how to
 * turn a payload back into something drawable. Everything the UI needs is
 * a plain object — the component never touches a manager or AppState.
 *
 * Four kinds, three of them stored on the machine and one session-only:
 *
 *   wave       baked waveforms    → the oscillator menu
 *   ir         impulse responses  → the per-overtone convolution steppers
 *   soundfile  imported audio     → the sampler
 *   recording  captured takes     → the recorder strip (MEMORY ONLY: a
 *              3-minute 12-track float take is ~415 MB, so takes need a
 *              compressed format before they belong in storage)
 */

import { AppState } from '../../config.js';
import { assetStore, ASSET } from '../../dsp/assetStore.js';
import { assetRecord, forgetAsset, listAssets, renameAsset } from '../../dsp/assetLibrary.js';
import { decodeAudioFile } from '../../dsp/decodeAudio.js';
import { overviewOfData } from '../../dsp/overview.js';
import { irManager } from '../../dsp/IRManager.js';
import { sourceManager } from '../../dsp/SourceManager.js';
import { WAVExporter } from '../../dsp/WAVExporter.js';
import { forgetCustomWaveTable, getWavetableManager, initAudio, precomputeWavetableFromCoefficients } from '../../audio.js';
import { audition } from './audition.js';
import { LIBRARY_CHANGED, CONVOLUTION_IRS_CHANGED, RECORDINGS_CHANGED } from '../../events.js';
import { showStatus } from '../../domUtils.js';
import { setCurrentWaveform, syncWaveformOptions } from '../waveform/waveformActions.js';
import { OvertoneSignalActions } from '../overtoneSignal/overtoneSignalActions.js';
import { SourceActions } from '../source/sourceActions.js';
import { recordingStore } from '../recording/RecordingStore.js';
import { RecordingActions } from '../recording/recordingActions.js';
import { TonewheelActions } from '../tonewheel/tonewheelActions.js';

/** The tables the file manager shows, in order. */
export const LIBRARY_KINDS = [
    { kind: 'wave', title: 'Waveforms', use: 'Play this oscillator', empty: 'Bake one with Create Oscillator.' },
    { kind: 'ir', title: 'Impulse responses', use: 'Ring every overtone through it', empty: 'Bake one with Create IR.' },
    { kind: 'soundfile', title: 'Sound files', use: 'Load it into the sampler', empty: 'Choose a file in the Source panel.' },
    {
        kind: 'recording', title: 'Recordings', use: 'Select this take',
        empty: 'Record a performance with the ● button.',
        note: 'This session only — takes are not saved to the machine. The .mid and multitrack stems download from the recorder strip.',
    },
];

// A drawing of a baked waveform's single cycle, at the resolution the
// Source preview uses
const WAVE_TABLE_SIZE = 4096;

/**
 * Everything in the library, by kind. Payloads are not held: each entry is
 * a summary the table can render.
 *
 * @returns {Promise<Object<string, Array>>} kind → entries, each
 *   { id, kind, name, bytes, savedAt, detail, inUse }
 */
export async function libraryEntries() {
    const [waves, irs, soundfiles] = await Promise.all([
        listAssets(ASSET.wave.kind),
        listAssets(ASSET.ir.kind),
        listAssets(ASSET.soundfile.kind),
    ]);
    return {
        wave: waves.map((asset, i) => ({
            ...base(asset),
            name: asset.name || `Custom ${i + 1}`,
            detail: `table spans ${asset.meta.periodMultiplier || 1} period${(asset.meta.periodMultiplier || 1) === 1 ? '' : 's'}`,
            inUse: AppState.currentWaveform === asset.id,
        })),
        ir: irs.map((asset) => ({
            ...base(asset),
            detail: [
                formatSeconds(irSeconds(asset)),
                asset.meta.bakeFrequency ? `baked at ${asset.meta.bakeFrequency.toFixed(1)} Hz` : null,
            ].filter(Boolean).join(' · '),
            inUse: usesIR(asset.id),
        })),
        soundfile: soundfiles.map((asset) => ({
            ...base(asset),
            detail: 'as imported',
            inUse: sourceManager.fileSource?.id === asset.id,
        })),
        recording: recordingStore.list().map(({ key }) => {
            const take = recordingStore.get(key);
            return {
                id: key,
                kind: 'recording',
                name: take.name,
                bytes: take.audio.channels.reduce((sum, channel) => sum + channel.length * 4, 0),
                savedAt: null,
                detail: `${take.audio.channels.length} ch · ${formatSeconds(take.duration)}`,
                inUse: AppState.recorder.selected === key,
            };
        }),
    };
}

function base(asset) {
    return { id: asset.id, kind: asset.kind, name: asset.name || asset.id, bytes: asset.bytes, savedAt: asset.savedAt };
}

function irSeconds(asset) {
    const rate = asset.meta.sampleRate || 48000;
    return (asset.bytes / 4) / rate;
}

/** Seconds, in the precision that reads: an IR tail, or a take's length. */
function formatSeconds(seconds) {
    if (seconds < 10) return `${seconds.toFixed(2)} s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

function usesIR(key) {
    const count = AppState.currentSystem.ratios.length;
    for (let i = 0; i < count; i++) {
        if (OvertoneSignalActions.getConvolution(i).ir === key) return true;
    }
    return false;
}

/** Bytes the library holds, and what the browser has granted this origin. */
export async function storageReport() {
    const [usage, quota] = await Promise.all([assetStore.usage(), assetStore.quota()]);
    const libraryBytes = Object.values(usage).reduce((sum, kind) => sum + kind.bytes, 0);
    return { usage, libraryBytes, quota, ephemeral: assetStore.ephemeral };
}

// ---- Operations -------------------------------------------------------

/** Put this file to work in the synth — what that means is per kind. */
export async function useEntry(entry) {
    switch (entry.kind) {
        case 'wave':
            setCurrentWaveform(entry.id);
            break;
        case 'ir': {
            const count = AppState.currentSystem.ratios.length;
            for (let i = 0; i < count; i++) OvertoneSignalActions.setConvolution(i, { ir: entry.id });
            break;
        }
        case 'soundfile':
            await SourceActions.loadLibraryEntry(entry);
            break;
        case 'recording':
            RecordingActions.select(entry.id);
            break;
    }
    changed();
}

/** A new display name. Stored assets keep their content id. */
export async function renameEntry(entry, name) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === entry.name) return;
    if (entry.kind === 'recording') {
        recordingStore.rename(entry.id, trimmed);
        document.dispatchEvent(new CustomEvent(RECORDINGS_CHANGED, { detail: { key: entry.id } }));
    } else {
        await renameAsset(entry.id, trimmed);
        if (entry.kind === 'wave') {
            getWavetableManager().setName(entry.id, trimmed);
            syncWaveformOptions();
        } else if (entry.kind === 'ir') {
            irManager.setName(entry.id, trimmed);
            document.dispatchEvent(new CustomEvent(CONVOLUTION_IRS_CHANGED));
        }
    }
    changed();
}

/**
 * Delete a file, and unpick it wherever the synth is pointing at it: a
 * voice ringing through a deleted IR, or an oscillator playing a deleted
 * waveform, would otherwise hold the only copy of something the user just
 * threw away.
 */
export async function removeEntry(entry) {
    switch (entry.kind) {
        case 'wave': {
            const manager = getWavetableManager();
            if (AppState.currentWaveform === entry.id) setCurrentWaveform('sine');
            manager.remove(entry.id);
            delete AppState.customWaveCoefficients?.[entry.id];
            delete AppState.customWavePeriodMultipliers?.[entry.id];
            forgetCustomWaveTable(entry.id);
            TonewheelActions.clearCustomWaveCache();
            await forgetAsset(entry.id);
            // Rewrites the menu, and renumbers what is left
            syncWaveformOptions(manager);
            break;
        }
        case 'ir': {
            const count = AppState.currentSystem.ratios.length;
            for (let i = 0; i < count; i++) {
                if (OvertoneSignalActions.getConvolution(i).ir === entry.id) {
                    OvertoneSignalActions.setConvolution(i, { ir: null });
                }
            }
            irManager.remove(entry.id);
            await forgetAsset(entry.id);
            document.dispatchEvent(new CustomEvent(CONVOLUTION_IRS_CHANGED));
            break;
        }
        case 'soundfile':
            // A file already loaded keeps playing — it is in memory. Only
            // the machine's copy goes.
            await forgetAsset(entry.id);
            break;
        case 'recording':
            if (AppState.recorder.selected === entry.id) {
                RecordingActions.reset();
                RecordingActions.select(recordingStore.list().find((r) => r.key !== entry.id)?.key ?? null);
            }
            recordingStore.remove(entry.id);
            document.dispatchEvent(new CustomEvent(RECORDINGS_CHANGED, { detail: { key: entry.id } }));
            break;
    }
    showStatus(`Deleted ${entry.name}`, 'success');
    changed();
}

/**
 * Write the file to disk. A sound file comes back byte for byte as it was
 * imported; the synthesized kinds are written as .wav.
 */
export async function downloadEntry(entry) {
    if (entry.kind === 'recording') {
        RecordingActions.select(entry.id);
        RecordingActions.downloadWav();
        return;
    }
    const record = await assetRecord(entry.id);
    if (!record) {
        showStatus(`${entry.name} is no longer in the library`, 'error');
        return;
    }
    if (entry.kind === 'soundfile') {
        WAVExporter.downloadFile(record.bytes, fileName(entry.name, ''), 'application/octet-stream');
        return;
    }
    if (entry.kind === 'ir') {
        const bytes = WAVExporter.createWAVBufferMulti([record.pcm], record.meta?.sampleRate || 48000, { float: true });
        WAVExporter.downloadFile(bytes, fileName(entry.name, '.wav'), 'audio/wav');
        return;
    }
    // A baked table is not a recording: it goes out as what wavetable
    // instruments read, one cycle of 4096 samples at 44.1 kHz
    const table = precomputeWavetableFromCoefficients(record, WAVE_TABLE_SIZE);
    WAVExporter.downloadFile(
        WAVExporter.createWAVBufferMulti([table], 44100, { float: true }),
        fileName(entry.name, '.wav'), 'audio/wav');
}

function fileName(name, extension) {
    const clean = name.replace(/[/\\:*?"<>|]/g, '-').trim() || 'twig-file';
    return clean.toLowerCase().endsWith(extension.toLowerCase()) ? clean : clean + extension;
}

// ---- Preview ----------------------------------------------------------

/**
 * The selected file as something drawable: a baked waveform as one cycle,
 * everything else as a min/max overview.
 *
 * Sound files are decoded on an OfflineAudioContext — drawing one must not
 * start an audio device.
 *
 * @returns {Promise<{table?: Float32Array, overview?: Object, duration: number, sampleRate: number}|null>}
 */
export async function previewOf(entry) {
    if (entry.kind === 'recording') {
        const take = recordingStore.get(entry.id);
        if (!take) return null;
        return {
            overview: overviewOfData(take.audio.channels[0], take.duration),
            duration: take.duration,
            sampleRate: take.audio.sampleRate,
        };
    }
    const record = await assetRecord(entry.id);
    if (!record) return null;
    if (entry.kind === 'wave') {
        return { table: precomputeWavetableFromCoefficients(record, WAVE_TABLE_SIZE), duration: 0, sampleRate: 0 };
    }
    if (entry.kind === 'ir') {
        const sampleRate = record.meta?.sampleRate || 48000;
        return {
            overview: overviewOfData(record.pcm, record.pcm.length / sampleRate),
            duration: record.pcm.length / sampleRate,
            sampleRate,
        };
    }
    const buffer = await decodeStored(record.bytes);
    return {
        overview: overviewOfData(buffer.getChannelData(0), buffer.duration),
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        buffer,
    };
}

// ---- Hearing one -------------------------------------------------------

/**
 * Play the file, or stop it if it is the one already sounding. The synth
 * is not involved: previews go straight to the output (audition.js), the
 * exception being a take, which plays on the recorder's own transport so
 * its MIDI plays with it.
 */
export async function playEntry(entry, preview = null) {
    if (isPlaying(entry)) {
        if (entry.kind === 'recording') RecordingActions.pause();
        else audition.stop();
        return;
    }
    switch (entry.kind) {
        case 'wave': {
            // The PeriodicWave is built on first use, which needs a context
            await initAudio();
            const manager = getWavetableManager();
            const wave = manager.getWaveform(entry.id);
            if (wave) {
                await audition.playWave(entry.id, wave, AppState.fundamentalFrequency, manager.getPeriodMultiplier(entry.id));
            }
            break;
        }
        case 'ir': {
            const record = await assetRecord(entry.id);
            if (record?.pcm) await audition.playSamples(entry.id, record.pcm, record.meta?.sampleRate || 48000);
            break;
        }
        case 'soundfile': {
            const buffer = preview?.buffer || await decodeStored((await assetRecord(entry.id))?.bytes);
            if (buffer) await audition.playBuffer(entry.id, buffer);
            break;
        }
        case 'recording':
            RecordingActions.select(entry.id);
            RecordingActions.play();
            break;
    }
}

export function isPlaying(entry) {
    if (entry.kind === 'recording') {
        return AppState.recorder.selected === entry.id && AppState.recorder.transport === 'playing';
    }
    return audition.playing === entry.id;
}

/** Decode without an audio device — a drawing shouldn't open the speakers. */
export async function decodeStored(bytes) {
    const offline = new OfflineAudioContext(1, 1, 44100);
    return decodeAudioFile(offline, bytes.slice(0));
}

/** The library changed: the file manager re-reads it. */
function changed() {
    document.dispatchEvent(new CustomEvent(LIBRARY_CHANGED));
}
