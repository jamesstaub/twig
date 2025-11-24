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
        const selectors = {
            selectEl: document.getElementById('ratio-system-select'),
            descriptionEl: document.getElementById('system-description'),
            subharmonicToggle: document.getElementById('subharmonic-toggle'),
            subharmonicLabel: document.getElementById('subharmonic-label'),
            overtoneLabels: document.querySelectorAll('.toggle-label.overtone')
        };
        return new SpectralSystemComponent(selectors);
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
    }

    /**
     * Listen to external/global events
     */
    bindExternalEvents() {
        document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => {
            this.update();
        });
        // Subharmonic toggle click wiring using bindEvent from BaseComponent
        if (this.component.selectors.subharmonicToggle) {
            this.component.bindEvent(
                this.component.selectors.subharmonicToggle,
                'click',
                () => SpectralSystemActions.toggleSubharmonic()
            );
        }
        // Listen for subharmonic toggled event to update UI
        document.addEventListener(SUBHARMONIC_TOGGLED, () => {
            this.component.renderSubharmonicToggle({ isSubharmonic: this.getProps().isSubharmonic });
        });
    }
    /**
     * Update component with latest props
     */
    update() {
        if (this.component && typeof this.component.render === 'function') {
            this.component.render(this.getProps());
        }
    }
}
