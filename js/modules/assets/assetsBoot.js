/**
 * The machine's library, restored at boot.
 *
 * Baked waveforms and impulse responses the user made in earlier sessions
 * (js/dsp/assetStore.js) go back into the managers and the menus BEFORE
 * the first render, so a preset that references one resolves and the
 * pickers list it. Only the small parts are read here — coefficients,
 * samples, names; the PeriodicWave and the IR buffer are built the first
 * time something plays them, since at boot there is no AudioContext yet.
 */

import { restore } from '../../dsp/assetLibrary.js';
import { getWavetableManager } from '../../audio.js';
import { restoreWaveformOptions } from '../waveform/waveformActions.js';
import { CONVOLUTION_IRS_CHANGED } from '../../events.js';

export async function restoreLibrary() {
    try {
        const wavetableManager = getWavetableManager();
        const counts = await restore(wavetableManager);
        restoreWaveformOptions(wavetableManager);
        // The IR steppers appear only when IRs exist
        if (counts.irs > 0) document.dispatchEvent(new CustomEvent(CONVOLUTION_IRS_CHANGED));
        return counts;
    } catch (err) {
        // A library that won't load must never stop the synth starting
        console.warn('[assets] could not restore the library:', err.message);
        return { waves: 0, irs: 0 };
    }
}
