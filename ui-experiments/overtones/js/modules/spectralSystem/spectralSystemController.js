import { BaseController } from '../base/BaseController.js';
import { SpectralSystemActions } from './spectralSystemActions.js';
import { SpectralSystemComponent } from './SpectralSystemComponent.js';
import { AppState, spectralSystems } from '../../config.js';
import { SPECTRAL_SYSTEM_CHANGED, SUBHARMONIC_TOGGLED } from '../../events.js';

export class SpectralSystemController extends BaseController {
    /**
     * Build and return the component instance
     */
    createComponent() {
        const elements = {
            selectEl: document.getElementById('ratio-system-select'),
            descriptionEl: document.getElementById('system-description'),
            subharmonicToggle: document.getElementById('subharmonic-toggle'),
            subharmonicLabel: document.getElementById('subharmonic-label'),
            overtoneLabels: document.querySelectorAll('.toggle-label.overtone')
        };
        return new SpectralSystemComponent(elements);
    }

    /**
     * Provide props for rendering
     */
    getProps() {
        return {
            systems: spectralSystems,
            currentSystem: AppState.currentSystem,
            isSubharmonic: AppState.isSubharmonic
        };
    }

    /**
     * Handle events coming from the component itself
     */
    bindComponentEvents() {
        this.component.onChange = (systemIndex) => {
            SpectralSystemActions.setSystem(systemIndex);
        };

        // Subharmonic toggle click wiring using bindEvent from BaseComponent
        if (this.component.elements.subharmonicToggle) {
            this.component.bindEvent(
                this.component.elements.subharmonicToggle,
                'click',
                () => SpectralSystemActions.toggleSubharmonic()
            );
        }
    }

    /**
     * Listen to external/global events
     */
    bindExternalEvents() {
        document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => {
            this.update();
        });

        // Listen for subharmonic toggled event to update UI
        document.addEventListener(SUBHARMONIC_TOGGLED, () => {
            this.component.renderSubharmonicToggle({ isSubharmonic: this.getProps().isSubharmonic });
            this.update();
            SpectralSystemActions.updateAudio();
        });
    }

}
