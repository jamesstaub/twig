import { addWaveformToAudio, buildCurrentSpectrum, getWavetableManager, updateAllHarmonicWaveforms } from "../../audio.js";
import { AppState, updateAppState } from "../../config.js";
import { showStatus } from "../../domUtils.js";
import { generateFilenameParts } from "../../utils.js";
import { LIBRARY_CHANGED } from "../../events.js";

import { TonewheelActions } from "../tonewheel/tonewheelActions.js";
import { MANAGE_FILES_OPTION, openSettings } from "../settings/settingsSurface.js";

export const CURRENT_WAVEFORM_CHANGED = 'currentWaveformChanged';

/**
 * The oscillator menu's choosable waveform names, in menu order (built-ins,
 * then baked waves) — skipping the "Interpolated" display option and the
 * library entry.
 */
export function waveformMenuNames() {
    const select = document.getElementById('waveform-select');
    return select
        ? [...select.options].filter(isWaveformOption).map((o) => o.value)
        : ['sine', 'square', 'triangle', 'sawtooth'];
}

function isWaveformOption(option) {
    return !option.disabled && option.dataset.role !== 'action';
}

export function handleWaveformChange(e) {
    if (e.target.value === MANAGE_FILES_OPTION) {
        // Not a waveform: put the menu back where it was and open the library
        e.target.value = AppState.waveformMorph ? '' : AppState.currentWaveform;
        openSettings('files');
        return;
    }
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
        // The machine's library gained a file — the menus that list it
        // (the file manager, the sampler's picker) re-read on this
        document.dispatchEvent(new CustomEvent(LIBRARY_CHANGED));

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

/**
 * Rewrite the menu's library entries from the wavetable manager: the baked
 * waveforms in order, then "Manage files…" once there is one. ONE path for
 * a bake, a boot restore, a rename and a delete — "Custom 3" is a position,
 * so the numbering stays truthful only if it is rewritten whole. The
 * built-ins and the "Interpolated" tail are left alone, as is the current
 * selection when it still exists.
 */
export function syncWaveformOptions(wavetableManager = getWavetableManager()) {
    const select = document.getElementById('waveform-select');
    if (!select) return;
    const chosen = select.value;
    for (const option of [...select.options]) {
        if (option.value.startsWith('custom_') || option.dataset.role === 'action') option.remove();
    }
    // Everything goes before the display-only "Interpolated" entry, which
    // is hidden — so the library entry reads as the menu's last line
    const tail = select.querySelector('option[disabled][hidden]');
    const waves = wavetableManager.list();
    waves.forEach(({ key, name }, i) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `Custom ${i + 1}: ${name || key}`;
        select.insertBefore(option, tail);
    });
    if (waves.length) {
        const manage = document.createElement('option');
        manage.value = MANAGE_FILES_OPTION;
        manage.dataset.role = 'action';
        manage.textContent = 'Manage files…';
        select.insertBefore(manage, tail);
    }
    if ([...select.options].some((o) => o.value === chosen)) select.value = chosen;
    AppState.customWaveCount = waves.length;
}

export function addWaveformToUI(waveKey, name, customWaveIndex) {
    syncWaveformOptions();
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
    syncWaveformOptions(wavetableManager);
    for (const { key } of wavetableManager.list()) {
        const coefficients = wavetableManager.getCoefficients(key);
        if (!coefficients) continue;
        AppState.customWaveCoefficients = AppState.customWaveCoefficients || {};
        AppState.customWaveCoefficients[key] = coefficients;
        AppState.customWavePeriodMultipliers = AppState.customWavePeriodMultipliers || {};
        AppState.customWavePeriodMultipliers[key] = wavetableManager.getPeriodMultiplier(key);
    }
}
