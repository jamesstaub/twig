import BaseComponent from "../base/BaseComponent.js";
import { Dial } from "../generic/dial/Dial.js";
import {
    COMPRESS_A_MAX, COMPRESS_A_MIN, DEFAULT_COMPRESS_A,
    DEFAULT_STIFFNESS_B, DEFAULT_STRETCH_A, DEFAULT_TUBE_CLOSEDNESS,
    STIFFNESS_B_MAX, STRETCH_A_MAX, STRETCH_A_MIN,
} from "../../config.js";


const RATIO_SYSTEM_SELECT_ID = '#ratio-system-select';

/**
 * Dial definitions for per-system tunable params. A system opts in by
 * listing keys in its `params` array (config.js); the dial's value is the
 * matching AppState field, delivered via props.systemParams and written
 * back through onParamChange(key, value). Dials work in a normalized 0-1
 * position with per-param taper, so parameters whose useful range is tiny
 * relative to their bounds still get fine control.
 */
const SYSTEM_PARAM_DIALS = {
    stiffnessB: {
        label: 'stiffness',
        // Cubic taper: real pianos live at B ≈ 0.0001–0.001, a fraction of
        // the 0–0.1 range — linear travel would bury them in the first 2%
        toValue: (t) => STIFFNESS_B_MAX * t * t * t,
        toPosition: (v) => Math.cbrt((v ?? DEFAULT_STIFFNESS_B) / STIFFNESS_B_MAX),
        format: (t) => {
            const b = STIFFNESS_B_MAX * t * t * t;
            return b < 1e-6 ? 'B 0' : `B ${b.toPrecision(2)}`;
        },
    },
    tubeClosedness: {
        label: 'closed end',
        // Linear — the whole open→closed sweep is equally musical
        toValue: (t) => t,
        toPosition: (v) => v ?? DEFAULT_TUBE_CLOSEDNESS,
        format: (t) => (t <= 0.0025 ? 'open' : t >= 0.9975 ? 'closed' : `${Math.round(t * 100)}%`),
    },
    stretchA: linearParamDial('stretch', STRETCH_A_MIN, STRETCH_A_MAX, DEFAULT_STRETCH_A),
    compressA: linearParamDial('compress', COMPRESS_A_MIN, COMPRESS_A_MAX, DEFAULT_COMPRESS_A),
};

/** Linear dial over [min, max] with an "A 2.10"-style pseudo-octave readout. */
function linearParamDial(label, min, max, fallback) {
    return {
        label,
        toValue: (t) => min + t * (max - min),
        toPosition: (v) => ((v ?? fallback) - min) / (max - min),
        format: (t) => `A ${(min + t * (max - min)).toFixed(2)}`,
    };
}

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
        this.onParamChange = null;
    }

    /**
     * Main render cycle: receives fresh props from BaseController.
     */
    render({ systems, currentSystem, currentSystemIndex, isSubharmonic, startHarmonic, systemParams }) {
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
        this.renderSystemParams({ currentSystem, systemParams });

        // --- Subharmonic toggle ---
        this.renderSubharmonicToggle({ isSubharmonic });
    }

    updateSelector({ currentSystemIndex, currentSystem, startHarmonic, systemParams }) {
        const selectEl = this.q('#ratio-system-select');
        if (!selectEl) return;

        if (currentSystemIndex >= 0) selectEl.value = currentSystemIndex;
        this.renderStartHarmonic({ currentSystem, startHarmonic });
        this.renderSystemParams({ currentSystem, systemParams });
    }

    /**
     * Dials for the current system's tunable params. Dial instances are
     * rebuilt only when the param list changes (system switch) — external
     * updates (bridge, reload) sync through setValue, which doesn't echo,
     * so an in-progress drag is never torn down under the pointer.
     */
    renderSystemParams({ currentSystem, systemParams }) {
        const row = this.q('#system-params-row');
        if (!row) return;

        const keys = (currentSystem?.params || []).filter((k) => SYSTEM_PARAM_DIALS[k]);
        row.classList.toggle('hidden', keys.length === 0);

        const signature = keys.join(',');
        if (this._paramSignature !== signature) {
            this._paramSignature = signature;
            this._paramDials = {};
            row.innerHTML = '';
            for (const key of keys) {
                const def = SYSTEM_PARAM_DIALS[key];
                const label = document.createElement('label');
                label.className = 'start-harmonic-label';
                label.textContent = def.label;
                const dial = new Dial({
                    min: 0, max: 1, step: 0.005, size: 26,
                    value: def.toPosition(systemParams?.[key]),
                    label: def.label,
                    format: def.format,
                    onChange: (t) => this.onParamChange?.(key, def.toValue(t)),
                });
                this._paramDials[key] = dial;
                row.append(label, dial.el);
            }
            return;
        }

        for (const [key, dial] of Object.entries(this._paramDials || {})) {
            const pos = SYSTEM_PARAM_DIALS[key].toPosition(systemParams?.[key]);
            // Tolerance beats the dial step so a value that round-tripped
            // through the taper doesn't jitter the knob mid-drag
            if (Math.abs(pos - dial.value) > 0.004) dial.setValue(pos);
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
