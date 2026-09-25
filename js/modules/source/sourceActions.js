import { polySampleMode, restartAudio, updateAllHarmonicClocks, updateAllHarmonicSamples } from '../../audio.js';
import { AppState, FILTER_BANK_Q, SOUNDFILE_MODES, SOURCE_MODES, updateAppState } from '../../config.js';
import { persistAppConfig, soundfileConfig } from '../../appConfig.js';
import { audioEngine } from '../../dsp/engine/AudioEngine.js';
import { sourceManager } from '../../dsp/SourceManager.js';
import { decodeAiff, isAiff } from '../../dsp/aiff.js';
import { showStatus } from '../../domUtils.js';
import { SOURCE_CHANGED } from '../../events.js';
import { OvertoneSignalActions } from '../overtoneSignal/overtoneSignalActions.js';
import { FundamentalActions } from '../fundamental/fundamentalActions.js';

export const SourceActions = {

    /**
     * Switch the signal source. Accepts a mode name or its SOURCE_MODES
     * index (the bridge address form). Entering any external mode tunes
     * every overtone's lowpass to its own pitch at high resonance so the
     * voice bank acts as a resonant filter bank; leaving restores nothing —
     * the filters stay as the user last set them.
     */
    setSourceMode(mode) {
        const name = typeof mode === 'number' ? SOURCE_MODES[Math.round(mode)] : mode;
        if (!SOURCE_MODES.includes(name) || name === AppState.sourceMode) return;
        // Sound-file mode without a file is silent until one is picked

        updateAppState({ sourceMode: name });

        if (name !== 'oscillators') {
            this._applyFilterBankDefaults();
        }

        document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { sourceMode: name } }));
        restartAudio();
    },

    /** Every voice: cutoff at its own pitch (multiplier 1), resonant Q. */
    _applyFilterBankDefaults() {
        const count = AppState.currentSystem.ratios.length;
        for (let i = 0; i < count; i++) {
            OvertoneSignalActions.setFilter(i, { multiplier: 1, q: FILTER_BANK_Q });
        }
    },

    /** ADC input device — exact id, 0-based index, or label substring. */
    async setAdcDevice(selector) {
        const devices = await sourceManager.inputDevices();
        let id = null;
        if (selector != null && selector !== '') {
            if (typeof selector === 'number') {
                id = devices[Math.round(selector)]?.id ?? null;
            } else {
                const s = String(selector).trim();
                const dev = devices.find((d) => d.id === s) ||
                    devices.find((d) => d.label === s) ||
                    devices.find((d) => d.label.toLowerCase().includes(s.toLowerCase()));
                id = dev ? dev.id : s;
            }
        }
        if (id === AppState.adcDeviceId) return;
        updateAppState({ adcDeviceId: id });
        document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { adcDeviceId: id } }));
        if (AppState.sourceMode === 'adc') restartAudio();
    },

    setAdcChannel(channel) {
        const ch = Math.max(0, Math.round(Number(channel) || 0));
        if (ch === AppState.adcChannel) return;
        updateAppState({ adcChannel: ch });
        document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { adcChannel: ch } }));
        if (AppState.sourceMode === 'adc') restartAudio();
    },

    // --- sound file ---

    /**
     * 'mono' (one player for the bank) | 'poly' (a player per voice). App
     * config (soundfileConfig, persisted), not synth state.
     */
    setSoundfileMode(mode) {
        if (!SOUNDFILE_MODES.includes(mode) || mode === soundfileConfig.mode) return;
        soundfileConfig.mode = mode;
        persistAppConfig();
        document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileMode: mode } }));
        // The voice head changes: rebuild the bank
        if (AppState.sourceMode === 'soundfile') restartAudio();
    },

    /** Poly: play the file at each overtone's pitch (from its fundamental) or as is. App config. */
    setSoundfileTune(on) {
        const tune = Boolean(on);
        if (tune === soundfileConfig.tune) return;
        soundfileConfig.tune = tune;
        persistAppConfig();
        document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileTune: tune } }));
        updateAllHarmonicSamples();
    },

    /** The file's fundamental in Hz for tuning; null/0 = the detected one. */
    setSoundfileFundamental(hz) {
        const v = Number(hz);
        const fundamental = v > 0 ? Math.min(20000, v) : null;
        if (fundamental === AppState.soundfileFundamental) return;
        updateAppState({ soundfileFundamental: fundamental });
        document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileFundamental: fundamental } }));
        updateAllHarmonicSamples();
    },

    /** Loop the file, or play it once per trigger (the ADSR panel's Loop). */
    setSoundfileLoop(on) {
        const loop = Boolean(on);
        if (loop === AppState.soundfileLoop) return;
        updateAppState({ soundfileLoop: loop });
        document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileLoop: loop } }));
        if (AppState.sourceMode !== 'soundfile') return;
        if (polySampleMode()) {
            updateAllHarmonicSamples();
        } else {
            sourceManager.setLoop(loop);
            updateAllHarmonicClocks();
        }
    },

    /**
     * The part of the file that plays and loops: [start, end] as 0-1
     * fractions (at least 1 % apart), or null for the whole file.
     */
    async setSoundfileRange(range) {
        let next = null;
        if (Array.isArray(range)) {
            const a = Math.max(0, Math.min(1, Number(range[0]) || 0));
            const b = Math.max(0, Math.min(1, Number(range[1]) || 0));
            const [start, end] = a <= b ? [a, b] : [b, a];
            if (end - start >= 0.01 && !(start === 0 && end === 1)) next = [start, end];
        }
        const cur = AppState.soundfileRange;
        if ((cur?.[0] ?? null) === (next?.[0] ?? null) && (cur?.[1] ?? null) === (next?.[1] ?? null)) return;
        updateAppState({ soundfileRange: next });
        document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileRange: next } }));
        if (AppState.sourceMode === 'soundfile') {
            if (polySampleMode()) {
                updateAllHarmonicSamples();
            } else {
                sourceManager.setRange(next);
                updateAllHarmonicClocks();
            }
        }
        // The region has its own pitch: YIN runs on it and the fundamental
        // — the samplers' and twig's — follows, replacing any typed value
        if (!sourceManager.hasFile) return;
        const hz = await sourceManager.detectFundamental(next);
        if (!next && AppState.soundfileRange !== null) return; // superseded meanwhile
        if (next && AppState.soundfileRange !== next) return;
        updateAppState({ soundfileFundamental: null });
        if (hz) FundamentalActions.setFundamentalExact(hz);
        updateAllHarmonicSamples();
        document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileFundamental: null } }));
    },

    /**
     * Decode a dropped/picked audio file, keep it in the source manager,
     * and switch to soundfile mode.
     */
    async loadSoundFile(file) {
        if (!file) return;
        try {
            const arrayBuffer = await file.arrayBuffer();
            // A context always exists by the time a user can drop a file;
            // decodeAudioData needs one even before playback starts
            const { initAudio } = await import('../../audio.js');
            await initAudio();
            const buffer = await decodeAudioFile(audioEngine.context, arrayBuffer);
            // Resolves once YIN has the file's fundamental (a typed override
            // belonged to the previous file — the new one starts from its
            // own detected pitch, which the samplers then tune from)
            const hz = await sourceManager.setFileBuffer(buffer, file.name);
            // A new file: whole, and starting from its own detected pitch
            updateAppState({ soundfileName: file.name, soundfileFundamental: null, soundfileRange: null });
            // The bank tunes itself around the sample: its fundamental
            // becomes twig's, so the first overtone plays the file as is
            if (hz) FundamentalActions.setFundamentalExact(hz);
            if (AppState.sourceMode === 'soundfile') {
                // Mono: the manager swapped the file in place (the clocks
                // realign with it); poly: the voices take the new buffer AND
                // its detected fundamental
                updateAllHarmonicSamples();
                updateAllHarmonicClocks();
                document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileName: file.name } }));
            } else {
                this.setSourceMode('soundfile');
            }
            showStatus(`Loaded ${file.name}${hz ? ` · ${hz.toFixed(hz >= 100 ? 1 : 2)} Hz` : ''}`, 'success');
        } catch (error) {
            showStatus(`Could not load ${file?.name || 'file'}: ${error.message}`, 'error');
        }
    },
};

/**
 * Decode a file to an AudioBuffer. The browser handles WAV/MP3/FLAC/OGG/
 * M4A; AIFF (Logic's and Pro Tools' default) it cannot — Chromium ships
 * no AIFF demuxer — so that goes through js/dsp/aiff.js.
 */
async function decodeAudioFile(ctx, arrayBuffer) {
    if (!isAiff(arrayBuffer)) return ctx.decodeAudioData(arrayBuffer);
    const { sampleRate, channels } = decodeAiff(arrayBuffer);
    const buffer = ctx.createBuffer(channels.length, channels[0].length, sampleRate);
    channels.forEach((data, c) => buffer.copyToChannel(data, c));
    return buffer;
}
