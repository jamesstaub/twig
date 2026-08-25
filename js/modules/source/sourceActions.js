import { restartAudio } from '../../audio.js';
import { AppState, FILTER_BANK_Q, SOURCE_MODES, updateAppState } from '../../config.js';
import { sourceManager } from '../../dsp/SourceManager.js';
import { showStatus } from '../../domUtils.js';
import { SOURCE_CHANGED } from '../../events.js';
import { OvertoneSignalActions } from '../overtoneSignal/overtoneSignalActions.js';

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
        if (name === 'soundfile' && !sourceManager.hasFile) {
            showStatus('Load a sound file first (or drop one on the Source section)', 'warning');
            return;
        }

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
            const buffer = await AppState.audioContext.decodeAudioData(arrayBuffer);
            sourceManager.setFileBuffer(buffer, file.name);
            updateAppState({ soundfileName: file.name });
            if (AppState.sourceMode === 'soundfile') {
                restartAudio();
                document.dispatchEvent(new CustomEvent(SOURCE_CHANGED, { detail: { soundfileName: file.name } }));
            } else {
                this.setSourceMode('soundfile');
            }
            showStatus(`Loaded ${file.name}`, 'success');
        } catch (error) {
            showStatus(`Could not load ${file?.name || 'file'}: ${error.message}`, 'error');
        }
    },
};
