// controller/SpectralSystemController.js

import { BaseController } from '../base/BaseController.js';
import { SpectralSystemActions } from './spectralSystemActions.js';
import { SpectralSystemComponent } from './SpectralSystemComponent.js';
import { AppState, spectralSystems } from '../../config.js';
import { SPECTRAL_SYSTEM_CHANGED, SUBHARMONIC_TOGGLED } from '../../events.js';

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
        return {
            systems: spectralSystems,
            currentSystem: AppState.currentSystem,
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
