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
         *  - onStartHarmonicChange(startHarmonic)
         */
        this.onChange = null;
        this.onSubharmonicToggle = null;
        this.onStartHarmonicChange = null;
        this.onStiffnessChange = null;
    }

    /**
     * Main render cycle: receives fresh props from BaseController.
     */
    render({ systems, currentSystem, currentSystemIndex, isSubharmonic, startHarmonic, stiffnessB }) {
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
            if (index === currentSystemIndex) option.selected = true;
            selectEl.appendChild(option);
        });

        // --- Description (HTML allowed) ---
        this.updateContent(descriptionEl, currentSystem?.description || '', {
            asHTML: true
        });

        this.renderStartHarmonic({ currentSystem, startHarmonic });
        this.renderStiffness({ currentSystem, stiffnessB });

        // --- Subharmonic toggle ---
        this.renderSubharmonicToggle({ isSubharmonic });
    }

    updateSelector({ currentSystemIndex, currentSystem, startHarmonic, stiffnessB }) {
        const selectEl = this.q('#ratio-system-select');
        if (!selectEl) return;

        if (currentSystemIndex >= 0) selectEl.value = currentSystemIndex;
        this.renderStartHarmonic({ currentSystem, startHarmonic });
        this.renderStiffness({ currentSystem, stiffnessB });
    }

    /**
     * Show the stiffness-B input only for systems that read it (the Stiff
     * String model). Skips writing the value while the user is typing.
     */
    renderStiffness({ currentSystem, stiffnessB }) {
        const row = this.q('#stiffness-row');
        const input = this.q('#stiffness-input');
        if (!row || !input) return;

        row.classList.toggle('hidden', !currentSystem?.stiffness);
        if (document.activeElement !== input) {
            input.value = stiffnessB ?? 0.001;
        }
    }

    /**
     * Show the start-harmonic input only for generative systems (those with
     * a generate() — fixed measured/historical tables can't be shifted).
     * Skips writing the value while the user is typing in the field.
     */
    renderStartHarmonic({ currentSystem, startHarmonic }) {
        const row = this.q('#start-harmonic-row');
        const input = this.q('#start-harmonic-input');
        if (!row || !input) return;

        row.classList.toggle('hidden', !currentSystem?.generate);
        if (document.activeElement !== input) {
            input.value = startHarmonic ?? 1;
        }
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

        const startInput = this.q('#start-harmonic-input');
        if (startInput) {
            if (this._startHarmonicHandler) {
                startInput.removeEventListener('change', this._startHarmonicHandler);
            }
            this._startHarmonicHandler = (e) => {
                this.onStartHarmonicChange?.(parseInt(e.target.value, 10));
            };
            startInput.addEventListener('change', this._startHarmonicHandler);
        }

        const stiffnessInput = this.q('#stiffness-input');
        if (stiffnessInput) {
            if (this._stiffnessHandler) {
                stiffnessInput.removeEventListener('change', this._stiffnessHandler);
            }
            this._stiffnessHandler = (e) => {
                this.onStiffnessChange?.(parseFloat(e.target.value));
            };
            stiffnessInput.addEventListener('change', this._stiffnessHandler);
        }
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
