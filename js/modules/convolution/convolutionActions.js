import { sampleCurrentWaveform, updateAllHarmonicConvolutions } from '../../audio.js';
import { AppState, updateAppState } from '../../config.js';
import { irManager } from '../../dsp/IRManager.js';
import { showStatus } from '../../domUtils.js';
import { CONVOLUTION_IRS_CHANGED } from '../../events.js';
import { generateFilenameParts } from '../../utils.js';

export const ConvolutionActions = {

    /**
     * Bake the current timbre into a convolution IR: the same snapped
     * single-cycle render as the wavetable bake, resampled to real time at
     * the current fundamental (the buffer spans periodMultiplier periods of
     * f0), so the IR's resonances sit exactly on the sounding partials.
     * The new IR is added to the menu and selected.
     */
    async createIRFromCurrent() {
        const { buffer, periodMultiplier } = await sampleCurrentWaveform('mono', AppState.isSubharmonic);
        if (!buffer || buffer.length === 0) {
            showStatus('Nothing to capture — no active drawbars.', 'warning');
            return;
        }

        const ctx = AppState.audioContext;
        const seconds = periodMultiplier / AppState.fundamentalFrequency;
        const length = Math.max(32, Math.round(seconds * ctx.sampleRate));
        const audioBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = audioBuffer.getChannelData(0);
        // Linear resample of the (loop-continuous) cycle onto the IR grid
        for (let i = 0; i < length; i++) {
            const pos = (i / length) * buffer.length;
            const i0 = Math.floor(pos);
            const i1 = (i0 + 1) % buffer.length;
            const frac = pos - i0;
            data[i] = buffer[i0] * (1 - frac) + buffer[i1] * frac;
        }

        const parts = generateFilenameParts();
        const name = `${parts.noteLetter}-${parts.systemName}-${parts.levels}`;
        const key = irManager.add(audioBuffer, name);
        this.selectIR(key);
        showStatus(`Created IR: ${name}`, 'success');
    },

    /** Select an IR by key (or by creation index from the bridge). */
    selectIR(selector) {
        const key = typeof selector === 'number' ? irManager.keyAt(Math.round(selector)) : selector;
        if (key !== null && !irManager.get(key)) return; // unknown key — no-op
        if (key === AppState.convolutionIR) {
            // Still announce list changes (a fresh IR can reuse selection flow)
            document.dispatchEvent(new CustomEvent(CONVOLUTION_IRS_CHANGED));
            return;
        }
        updateAppState({ convolutionIR: key });
        updateAllHarmonicConvolutions();
        document.dispatchEvent(new CustomEvent(CONVOLUTION_IRS_CHANGED));
    },
};
