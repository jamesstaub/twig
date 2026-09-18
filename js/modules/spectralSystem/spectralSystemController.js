// controller/SpectralSystemController.js

import { BaseController } from '../base/BaseController.js';
import { SpectralSystemActions } from './spectralSystemActions.js';
import { SpectralSystemComponent } from './SpectralSystemComponent.js';
import { AppState, spectralSystems } from '../../config.js';
import { FUNDAMENTAL_CHANGED, SPECTRAL_SYSTEM_CHANGED, SUBHARMONIC_TOGGLED } from '../../events.js';
import { calculateFrequency, formatFrequency } from '../../utils.js';

export class SpectralSystemController extends BaseController {

    init() {
        super.init();
        // now the component is rendered and DOM nodes exist
        this.component.bindComponentEvents();
    }

    update() {
        const props = super.update();
        this.component.updateSelector(props);
    }


    /**
     * Instantiate the component.
     * BaseComponent will validate the target selector internally.
     */
    createComponent(selector) {
        return new SpectralSystemComponent(selector);
    }

    /**
     * Always provide fresh props for each render cycle.
     * The BaseController.update() method will call this before
     * every component.render(props).
     */
    getProps() {
        const sys = AppState.currentSystem;
        const labels = (AppState.isSubharmonic && sys.subharmonicLabels) ? sys.subharmonicLabels : sys.labels;
        return {
            voices: sys.ratios.map((ratio, i) => ({
                ratio,
                label: labels[i] || `#${i + 1}`,
                hz: formatFrequency(calculateFrequency(ratio)),
            })),
            systems: spectralSystems,
            currentSystem: AppState.currentSystem,
            currentSystemIndex: AppState.currentSystemIndex,
            startHarmonic: AppState.startHarmonic,
            systemParams: {
                stiffnessB: AppState.stiffnessB,
                tubeClosedness: AppState.tubeClosedness,
                stretchA: AppState.stretchA,
                compressA: AppState.compressA,
            },
            isSubharmonic: AppState.isSubharmonic
        };
    }

    /**
     * Connect component → actions.
     * The component uses event callbacks instead of touching global state.
     */
    bindComponentEvents() {
        this.component.onChange = (systemIndex) => {
            SpectralSystemActions.setSystem(systemIndex);
        };

        this.component.onSubharmonicToggle = () => {
            SpectralSystemActions.toggleSubharmonic();
        };

        this.component.onStartHarmonicChange = (startHarmonic) => {
            SpectralSystemActions.setStartHarmonic(startHarmonic);
        };

        // Per-system param dials route by key so future params only need
        // an entry here and in SYSTEM_PARAM_DIALS
        const paramActions = {
            stiffnessB: (v) => SpectralSystemActions.setStiffnessB(v),
            tubeClosedness: (v) => SpectralSystemActions.setTubeClosedness(v),
            stretchA: (v) => SpectralSystemActions.setStretchA(v),
            compressA: (v) => SpectralSystemActions.setCompressA(v),
        };
        this.component.onParamChange = (key, value) => paramActions[key]?.(value);

        if (typeof this.component.bindComponentEvents === 'function') {
            this.component.bindComponentEvents();
        }
    }

    /**
     * Listen for external/global events and refresh the UI.
     */
    bindExternalEvents() {
        document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => {
            this.update();
        });

        // Only the frequency list depends on the fundamental — a sweep
        // must not rebuild the menu under an open dropdown
        document.addEventListener(FUNDAMENTAL_CHANGED, () => {
            this.component.renderFrequencies(this.getProps());
        });

        document.addEventListener(SUBHARMONIC_TOGGLED, () => {
            // If the component includes a specialized sub-render method,
            // we update that first.
            if (typeof this.component.renderSubharmonicToggle === 'function') {
                this.component.renderSubharmonicToggle({
                    isSubharmonic: AppState.isSubharmonic
                });
            }

            // Full UI update afterward to ensure full sync.
            this.update();

            // FIXME — should live in an AudioController
            SpectralSystemActions.updateAudio();
        });
    }
}
