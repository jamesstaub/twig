import { BaseController } from '../base/BaseController.js';
import { SpectralSystemActions } from './spectralSystemActions.js';
import { SpectralSystemComponent } from './SpectralSystemComponent.js';
import { AppState, spectralSystems } from '../../config.js';
import { SPECTRAL_SYSTEM_CHANGED } from '../../events.js';

export class SpectralSystemController extends BaseController {
    /**
     * Build and return the component instance
     */
    createComponent() {
        const selectEl = document.getElementById('ratio-system-select');
        const descriptionEl = document.getElementById('system-description');
        return new SpectralSystemComponent(selectEl, descriptionEl);
    }

    /**
     * Provide props for rendering
     */
    getProps() {
        return {
            systems: spectralSystems,
            currentSystem: AppState.currentSystem
        };
    }

    /**
     * Handle events coming from the component itself
     */
    bindComponentEvents() {
        this.component.onChange = (systemIndex) => {
            SpectralSystemActions.setSystem(systemIndex);
        };
    }

    /**
     * Listen to external/global events
     */
    bindExternalEvents() {
    document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => {
            this.update();
        });
    }
}
