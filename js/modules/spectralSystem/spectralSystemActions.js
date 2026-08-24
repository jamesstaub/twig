import { updateAudioProperties } from '../../audio.js';
import {
    AppState,
    COMPRESS_A_MAX, COMPRESS_A_MIN,
    setCurrentSystem,
    START_HARMONIC_MAX,
    STIFFNESS_B_MAX,
    STRETCH_A_MAX, STRETCH_A_MIN,
    updateAppState,
} from '../../config.js';
import { SPECTRAL_SYSTEM_CHANGED, SUBHARMONIC_TOGGLED } from '../../events.js';
import { smoothUpdateSystem } from '../../utils.js';

export const SpectralSystemActions = {
    toggleSubharmonic() {
        const isSubharmonic = !AppState.isSubharmonic;
        updateAppState({ isSubharmonic });
        document.dispatchEvent(new CustomEvent(SUBHARMONIC_TOGGLED, { detail: { isSubharmonic } }));
    },

    setSystem(index) {
        setCurrentSystem(index); // applies AppState.startHarmonic to generative systems

        // The amplitude store is GROW-ONLY: switching to a system with
        // fewer partials keeps the hidden tail, so a larger system gets
        // its drawbar state back. Only pad when the new system is bigger.
        const numPartials = AppState.currentSystem.ratios.length;
        const amps = AppState.harmonicAmplitudes || [];
        for (let i = amps.length; i < numPartials; i++) {
            amps[i] = i === 0 ? 1.0 : 0.0;
        }
        AppState.harmonicAmplitudes = amps;

        smoothUpdateSystem(index);

        document.dispatchEvent(new CustomEvent(SPECTRAL_SYSTEM_CHANGED, {
            detail: { index, system: AppState.currentSystem }
        }));
    },

    /**
     * Shift generative systems to start their partial window at `value`
     * (1 = default). No effect on fixed-table systems beyond storing the
     * value for the next generative system selected.
     */
    setStartHarmonic(value) {
        const startHarmonic = Math.min(START_HARMONIC_MAX, Math.max(1, Math.round(value) || 1));
        if (startHarmonic === AppState.startHarmonic) return;
        updateAppState({ startHarmonic });
        this._regenerateSystem();
    },

    /**
     * Stiff-string inharmonicity coefficient B (0 = pure harmonic series).
     * Only the Stiff String system reads it; the value is kept so it's
     * there when that system is selected.
     */
    setStiffnessB(value) {
        const v = Number(value);
        if (!isFinite(v)) return;
        const stiffnessB = Math.min(STIFFNESS_B_MAX, Math.max(0, v));
        if (stiffnessB === AppState.stiffnessB) return;
        updateAppState({ stiffnessB });
        this._regenerateSystem();
    },

    /**
     * Acoustic-tube far-end boundary: 0 = open-open (all harmonics),
     * 1 = open-closed (odd harmonics). Only the Tube system reads it.
     */
    setTubeClosedness(value) {
        const v = Number(value);
        if (!isFinite(v)) return;
        const tubeClosedness = Math.min(1, Math.max(0, v));
        if (tubeClosedness === AppState.tubeClosedness) return;
        updateAppState({ tubeClosedness });
        this._regenerateSystem();
    },

    /** Sethares pseudo-octave for the Stretched system (2..3). */
    setStretchA(value) {
        this._setClampedParam('stretchA', value, STRETCH_A_MIN, STRETCH_A_MAX);
    },

    /** Sethares pseudo-octave for the Compressed system (1.5..2). */
    setCompressA(value) {
        this._setClampedParam('compressA', value, COMPRESS_A_MIN, COMPRESS_A_MAX);
    },

    _setClampedParam(key, value, min, max) {
        const v = Number(value);
        if (!isFinite(v)) return;
        const clamped = Math.min(max, Math.max(min, v));
        if (clamped === AppState[key]) return;
        updateAppState({ [key]: clamped });
        this._regenerateSystem();
    },

    /** Rebuild the current system's ratios after a tunable-param change. */
    _regenerateSystem() {
        const index = AppState.currentSystemIndex;
        setCurrentSystem(index);
        smoothUpdateSystem(index);

        document.dispatchEvent(new CustomEvent(SPECTRAL_SYSTEM_CHANGED, {
            detail: { index, system: AppState.currentSystem }
        }));
    },

    // TODO could move this to an audio actions file
    updateAudio() {
        updateAudioProperties();
    }

};
