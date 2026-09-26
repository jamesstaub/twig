import { addWaveformToAudio, buildCurrentSpectrum, updateAllHarmonicWaveforms } from "../../audio.js";
import { AppState, updateAppState } from "../../config.js";
import { showStatus } from "../../domUtils.js";
import { generateFilenameParts } from "../../utils.js";

import { TonewheelActions } from "../tonewheel/tonewheelActions.js";

export const CURRENT_WAVEFORM_CHANGED = 'currentWaveformChanged';

/**
 * The oscillator menu's choosable waveform names, in menu order (built-ins,
 * then baked waves) — skipping the disabled "Interpolated" display option.
 */
export function waveformMenuNames() {
    const select = document.getElementById('waveform-select');
    return select ? [...select.options].filter((o) => !o.disabled).map((o) => o.value) : ['sine', 'square', 'triangle', 'sawtooth'];
}

export function handleWaveformChange(e) {
    setCurrentWaveform(e.target.value);
}

/** Choose the waveform: running voices morph onto it — no restart, no click. */
export function setCurrentWaveform(currentWaveform) {
    if (!currentWaveform) return; // the menu's display-only "Interpolated" entry
    updateAppState({ currentWaveform, waveformMorph: null });

    document.dispatchEvent(new CustomEvent(CURRENT_WAVEFORM_CHANGED, {
        detail: { currentWaveform }
    }));

    updateAllHarmonicWaveforms();
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
        // The name is settled first: it is stored with the asset, so the
        // menu reads the same label in every later session
        const name = waveformLabel();

        // 1) AUDIO (and the library — the key is the spectrum's content id)
        const { waveKey, coefficients } = await addWaveformToAudio(spectrum, name);

        // 2) STATE
        const customWaveIndex = addWaveformToState(
            AppState,
            waveKey,
            coefficients,
            spectrum.periodMultiplier
        );

        // 3) UI
        addWaveformToUI(waveKey, name, customWaveIndex);

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

/** What a bake is called: the sound it was made from. */
export function waveformLabel() {
    const parts = generateFilenameParts();
    return `${parts.noteLetter}-${parts.waveform}-${parts.systemName}-${parts.levels}` +
        (parts.subharmonicFlag ? `-${parts.subharmonicFlag}` : '');
}

/** Put a waveform in the oscillator menu (once per key). */
export function addWaveformOption(waveKey, name, index) {
    const select = document.getElementById('waveform-select');
    if (!select || select.querySelector(`option[value="${waveKey}"]`)) return;
    const option = document.createElement('option');
    option.textContent = `Custom ${index}: ${name}`;
    option.value = waveKey;
    // Before the display-only "Interpolated" entry, which stays last
    const tail = select.querySelector('option[disabled][hidden]');
    select.insertBefore(option, tail);
}

export function addWaveformToUI(waveKey, name, customWaveIndex) {
    addWaveformOption(waveKey, name, customWaveIndex);
    const select = document.getElementById('waveform-select');
    if (select) select.value = waveKey;
    setCurrentWaveform(waveKey);

    showStatus(
        `Successfully added new waveform: Custom ${customWaveIndex}. Now synthesizing with it!`,
        "success"
    );
}

/**
 * Put every waveform the machine has kept back into the menu and the
 * state the visualizations read. The PeriodicWaves themselves are built
 * on first use (WavetableManager), so this costs nothing at boot.
 */
export function restoreWaveformOptions(wavetableManager) {
    wavetableManager.list().forEach(({ key, name }, i) => {
        addWaveformOption(key, name || key, i + 1);
        const coefficients = wavetableManager.getCoefficients(key);
        if (coefficients) {
            AppState.customWaveCoefficients = AppState.customWaveCoefficients || {};
            AppState.customWaveCoefficients[key] = coefficients;
            AppState.customWavePeriodMultipliers = AppState.customWavePeriodMultipliers || {};
            AppState.customWavePeriodMultipliers[key] = wavetableManager.getPeriodMultiplier(key);
        }
    });
    AppState.customWaveCount = wavetableManager.list().length;
}
