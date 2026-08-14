import { updateAudioProperties } from '../../audio.js';
import { AppState, spectralSystems, updateAppState } from '../../config.js';
import { SPECTRAL_SYSTEM_CHANGED, SUBHARMONIC_TOGGLED } from '../../events.js';
import { smoothUpdateSystem } from '../../utils.js';

export const SpectralSystemActions = {
    toggleSubharmonic() {
        const isSubharmonic = !AppState.isSubharmonic;
        updateAppState({ isSubharmonic });
        document.dispatchEvent(new CustomEvent(SUBHARMONIC_TOGGLED, { detail: { isSubharmonic } }));
    },

    setSystem(index) {
        updateAppState({ currentSystem: spectralSystems[index] });

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

    // TODO could move this to an audio actions file
    updateAudio() {
        updateAudioProperties();
    }

};
