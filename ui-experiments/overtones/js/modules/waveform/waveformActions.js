import { addWaveformToAudio, restartAudio, sampleCurrentWaveform } from "../../audio.js";
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


export function handleAddToWaveforms(routingMode, isSubharmonic) {
    sampleCurrentWaveform(routingMode, isSubharmonic).then(sampledData => {
        const buffer = sampledData.buffer || sampledData; // Handle both old and new format
        if (buffer.length > 0) {
            addToWaveforms(sampledData);
        }
    }).catch(error => {
        console.error('Failed to sample waveform for adding:', error);
        showStatus('Failed to sample waveform for adding', 'error');
    });
}


/**
 * Adds a sampled waveform to the available waveform library with period multiplier support.
 * 
 * WORKFLOW:
 * 1. Extract buffer and period multiplier from sampling data
 * 2. Store in WavetableManager with period multiplier metadata
 * 3. Register with getAudioEngine() for AudioWorklet compatibility
 * 4. Store period multiplier in AppState for frequency correction
 * 5. Add UI option and automatically select new waveform
 * 
 * PERIOD MULTIPLIER STORAGE:
 * The period multiplier is stored in multiple locations for robustness:
 * - WavetableManager: Primary storage with PeriodicWave object
 * - AppState.customWavePeriodMultipliers: Fallback/compatibility storage
 * 
 * This ensures frequency correction works correctly whether using individual
 * oscillators or AudioWorklet synthesis, and persists across audio system
 * restarts or mode switches.
 * 
 * AUTOMATIC SELECTION:
 * After adding the waveform, it's automatically selected and synthesis is
 * restarted if currently playing. This provides immediate audio feedback
 * of the newly created waveform.
 * 
 * @param {Float32Array|Object} sampledData - Sampled waveform data or {buffer, periodMultiplier}
 */

export async function addToWaveforms(sampledData) {
    const buffer = sampledData.buffer || sampledData;
    const periodMultiplier = sampledData.periodMultiplier || 1;

    if (buffer.length === 0) {
        showStatus("Warning: Cannot add empty waveform data.", "warning");
        return;
    }

    try {
        // 1) AUDIO
        const { waveKey, coefficients, periodicWave } =
            await addWaveformToAudio(buffer, periodMultiplier, AppState);

        // 2) STATE
        const customWaveIndex = addWaveformToState(
            AppState,
            waveKey,
            coefficients,
            periodicWave,
            periodMultiplier
        );

        // 3) UI
        addWaveformToUI(AppState, waveKey, customWaveIndex);

        document.dispatchEvent(new CustomEvent(CURRENT_WAVEFORM_CHANGED));

    } catch (error) {
        showStatus(`Failed to add waveform: ${error.message}`, "error");
    }
}



// Handles ONLY AppState updates, no DOM, no audio


export function addWaveformToState(AppState, waveKey, coefficients, periodicWave, periodMultiplier) {

    AppState.blWaveforms[waveKey] = periodicWave;

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
