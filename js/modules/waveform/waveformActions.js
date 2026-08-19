import { addWaveformToAudio, buildCurrentSpectrum, restartAudio } from "../../audio.js";
import { AppState, updateAppState } from "../../config.js";
import { showStatus } from "../../domUtils.js";
import { generateFilenameParts } from "../../utils.js";

import { TonewheelActions } from "../tonewheel/tonewheelActions.js";

export const CURRENT_WAVEFORM_CHANGED = 'currentWaveformChanged';

export function handleWaveformChange(e) {
    const currentWaveform = e.target.value

    updateAppState({ currentWaveform });

    document.dispatchEvent(new CustomEvent(CURRENT_WAVEFORM_CHANGED, {
        detail: { currentWaveform }
    }));

    if (AppState.isPlaying) {
        restartAudio();
    }
}


export function handleAddToWaveforms(isSubharmonic) {
    buildCurrentSpectrum(isSubharmonic).then(spectrum => {
        if (!spectrum) {
            showStatus("Nothing to capture — no active drawbars.", "warning");
            return;
        }
        return addToWaveforms(spectrum);
    }).catch(error => {
        console.error('Failed to bake waveform:', error);
        showStatus('Failed to bake waveform', 'error');
    });
}


/**
 * Adds a baked spectrum to the waveform library: registers the PeriodicWave,
 * stores coefficients and period multiplier in AppState (used for frequency
 * correction and for nesting the wave as a later bake's primitive), then
 * selects it in the UI.
 *
 * @param {Object} spectrum - { real, imag, periodMultiplier } from buildCurrentSpectrum
 */
export async function addToWaveforms(spectrum) {
    try {
        // 1) AUDIO
        const { waveKey, coefficients } = await addWaveformToAudio(spectrum);

        // 2) STATE
        const customWaveIndex = addWaveformToState(
            AppState,
            waveKey,
            coefficients,
            spectrum.periodMultiplier
        );

        // 3) UI
        addWaveformToUI(AppState, waveKey, customWaveIndex);

        document.dispatchEvent(new CustomEvent(CURRENT_WAVEFORM_CHANGED));

    } catch (error) {
        showStatus(`Failed to add waveform: ${error.message}`, "error");
    }
}



// Handles ONLY AppState updates, no DOM, no audio


export function addWaveformToState(AppState, waveKey, coefficients, periodMultiplier) {

    if (!AppState.customWaveCoefficients) {
        AppState.customWaveCoefficients = {};
    }
    AppState.customWaveCoefficients[waveKey] = coefficients;

    AppState.customWaveCount = (AppState.customWaveCount || 0) + 1;

    if (!AppState.customWavePeriodMultipliers) {
        AppState.customWavePeriodMultipliers = {};
    }
    AppState.customWavePeriodMultipliers[waveKey] = periodMultiplier;

    TonewheelActions.clearCustomWaveCache();

    return AppState.customWaveCount;
}


// Handles ONLY DOM + messages

export function addWaveformToUI(AppState, waveKey, customWaveIndex) {
    const select = document.getElementById('waveform-select');
    if (!select) return;

    const parts = generateFilenameParts();
    const optionName =
        `${parts.noteLetter}-${parts.waveform}-${parts.systemName}-${parts.levels}` +
        (parts.subharmonicFlag ? `-${parts.subharmonicFlag}` : '');

    const option = document.createElement('option');
    option.textContent = `Custom ${customWaveIndex}: ${optionName}`;
    option.value = waveKey;

    select.appendChild(option);

    updateAppState({ currentWaveform: waveKey });
    select.value = waveKey;

    showStatus(
        `Successfully added new waveform: Custom ${customWaveIndex}. Now synthesizing with it!`,
        "success"
    );

    if (AppState.isPlaying) {
        restartAudio();
    }
}
