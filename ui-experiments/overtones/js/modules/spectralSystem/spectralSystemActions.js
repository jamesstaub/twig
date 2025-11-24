import { AppState, spectralSystems, updateAppState } from '../../config.js';
import { SPECTRAL_SYSTEM_CHANGED } from '../../events.js';
import { smoothUpdateSystem } from '../../utils.js';

export const SpectralSystemActions = {
    setSystem(index) {
        updateAppState({ currentSystem: spectralSystems[index] });

        // Resize amplitudes to match new system
        const numPartials = AppState.currentSystem.ratios.length;
        const oldAmps = AppState.harmonicAmplitudes || [];
        const newAmps = [];
        for (let i = 0; i < numPartials; i++) {
            newAmps[i] = typeof oldAmps[i] === 'number' ? oldAmps[i] : (i === 0 ? 1.0 : 0.0);
        }
        for (let i = oldAmps.length; i < numPartials; i++) {
            newAmps[i] = (i === 0 ? 1.0 : 0.0);
        }
        AppState.harmonicAmplitudes = newAmps;

        smoothUpdateSystem(index);

        document.dispatchEvent(new CustomEvent(SPECTRAL_SYSTEM_CHANGED, {
            detail: { index, system: AppState.currentSystem }
        }));
    }

};
