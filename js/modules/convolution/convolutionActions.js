import { sampleCurrentWaveform } from '../../audio.js';
import { AppState, IR_RING_MAX_SECONDS, updateAppState } from '../../config.js';
import { irManager } from '../../dsp/IRManager.js';
import { showStatus } from '../../domUtils.js';
import { CONVOLUTION_IRS_CHANGED, IR_RING_CHANGED } from '../../events.js';
import { generateFilenameParts } from '../../utils.js';
import { OvertoneSignalActions } from '../overtoneSignal/overtoneSignalActions.js';

export const ConvolutionActions = {

    /**
     * Bake the current timbre into a convolution IR: the same snapped
     * single-cycle render as the wavetable bake, resampled to real time at
     * the current fundamental (the buffer spans periodMultiplier periods of
     * f0), so the IR's resonances sit exactly on the sounding partials.
     * The new IR joins the per-overtone menus and is assigned to every
     * overtone (each can then pick its own).
     */
    async createIRFromCurrent() {
        const { buffer, periodMultiplier } = await sampleCurrentWaveform('mono', AppState.isSubharmonic);
        if (!buffer || buffer.length === 0) {
            showStatus('Nothing to capture — no active drawbars.', 'warning');
            return;
        }

        const ctx = AppState.audioContext;
        const f0 = AppState.fundamentalFrequency;
        const loopSeconds = periodMultiplier / f0;
        const loopLength = Math.max(32, Math.round(loopSeconds * ctx.sampleRate));
        // Ring: tile the loop-continuous cycle to cover the ring time with
        // an exponential decay reaching −60 dB at the end — a modal
        // resonator rather than a one-cycle spectral stamp
        const ring = AppState.irRingSeconds;
        const loops = ring > 0 ? Math.max(1, Math.ceil((ring * ctx.sampleRate) / loopLength)) : 1;
        const length = loopLength * loops;
        const decayPerSample = ring > 0 ? Math.log(1000) / (ring * ctx.sampleRate) : 0;
        const audioBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = audioBuffer.getChannelData(0);
        // Linear resample of the cycle onto the IR grid, repeated per loop
        for (let i = 0; i < length; i++) {
            const pos = ((i % loopLength) / loopLength) * buffer.length;
            const i0 = Math.floor(pos);
            const i1 = (i0 + 1) % buffer.length;
            const frac = pos - i0;
            const sample = buffer[i0] * (1 - frac) + buffer[i1] * frac;
            data[i] = decayPerSample ? sample * Math.exp(-decayPerSample * i) : sample;
        }

        const parts = generateFilenameParts();
        const ringTag = ring > 0 ? `-ring${ring.toFixed(1)}s` : '';
        const name = `${parts.noteLetter}-${parts.systemName}-${parts.levels}${ringTag}`;
        const key = irManager.add(audioBuffer, name, f0);
        // Menus need the new entry before voices point at it
        document.dispatchEvent(new CustomEvent(CONVOLUTION_IRS_CHANGED));
        const count = AppState.currentSystem.ratios.length;
        for (let i = 0; i < count; i++) {
            OvertoneSignalActions.setConvolution(i, { ir: key });
        }
        showStatus(`Created IR: ${name}`, 'success');
    },

    /** Ring time for subsequent Create IR bakes (0..IR_RING_MAX_SECONDS). */
    setRingSeconds(value) {
        const v = Number(value);
        if (!isFinite(v)) return;
        const irRingSeconds = Math.max(0, Math.min(IR_RING_MAX_SECONDS, v));
        if (irRingSeconds === AppState.irRingSeconds) return;
        updateAppState({ irRingSeconds });
        document.dispatchEvent(new CustomEvent(IR_RING_CHANGED));
    },

    /** Select one overtone's IR by key, or by creation index (bridge form). */
    selectIR(index, selector) {
        const key = typeof selector === 'number' ? irManager.keyAt(Math.round(selector)) : (selector || null);
        if (key !== null && !irManager.get(key)) return; // unknown — no-op
        OvertoneSignalActions.setConvolution(index, { ir: key });
    },
};
