import BaseComponent from "../base/BaseComponent.js";


const RATIO_SYSTEM_SELECT_ID = '#ratio-system-select';

export class SpectralSystemComponent extends BaseComponent {
    // Store reference to the click handler for proper removal
    _subharmonicToggleHandler = null;
    constructor(elementId) {
        super(elementId);

        /**
         * Public callbacks set by the controller:
         *  - onChange(systemIndex)
         *  - onSubharmonicToggle()
         */
        this.onChange = null;
        this.onSubharmonicToggle = null;
    }

    /**
     * Main render cycle: receives fresh props from BaseController.
     */
    render({ systems, currentSystem, isSubharmonic }) {
        const selectEl = this.q('#ratio-system-select');
        const descriptionEl = this.q('#system-description');

        if (!selectEl) return;

        // --- Populate dropdown safely ---
        // Only clear children, never touch attributes
        while (selectEl.firstChild) {
            selectEl.removeChild(selectEl.firstChild);
        }
        systems.forEach((system, index) => {
            const option = document.createElement('option');
            option.textContent = system.name;
            option.value = index;
            if (system === currentSystem) option.selected = true;
            selectEl.appendChild(option);
        });

        // --- Description (HTML allowed) ---
        this.updateContent(descriptionEl, currentSystem?.description || '', {
            asHTML: true
        });

        // --- Subharmonic toggle ---
        this.renderSubharmonicToggle({ isSubharmonic });
    }

    updateSelector({ currentSystem, systems }) {
        const selectEl = this.q('#ratio-system-select');
        if (!selectEl) return;

        const index = systems.findIndex(s => s === currentSystem);
        if (index >= 0) selectEl.value = index;
    }

    /**
     * Bind interactive events once: BaseComponent guarantees
     * bindComponentEvents() runs only after construction.
     */


    bindComponentEvents() {
        const selectEl = this.q(RATIO_SYSTEM_SELECT_ID);
        if (!selectEl) return;

        // Remove previous listener if exists
        if (this._selectChangeHandler) {
            selectEl.removeEventListener('change', this._selectChangeHandler);
        }

        this._selectChangeHandler = (e) => {
            const systemIndex = parseInt(e.target.value);
            console.log('[SpectralSystemComponent] Dropdown changed:', systemIndex);
            this.onChange?.(systemIndex);
            e.target.setAttribute('aria-valuenow', systemIndex);
        };
        selectEl.addEventListener('change', this._selectChangeHandler);
    }


    /**
     * Called by both render() and by SUBHARMONIC_TOGGLED external event.
     * It updates the UI state of the toggle without re-rendering the whole component.
     */
    renderSubharmonicToggle({ isSubharmonic }) {
        const subharmonicToggle = this.q('#subharmonic-toggle');
        if (!subharmonicToggle) return;

        subharmonicToggle.classList.toggle('active', isSubharmonic);
        subharmonicToggle.setAttribute('aria-checked', isSubharmonic);

        // Remove previous event listener if present
        if (this._subharmonicToggleHandler) {
            subharmonicToggle.removeEventListener('click', this._subharmonicToggleHandler);
        }
        // Create and store a named handler
        this._subharmonicToggleHandler = (e) => {
            this.onSubharmonicToggle?.();
        };
        subharmonicToggle.addEventListener('click', this._subharmonicToggleHandler);
    }
}
