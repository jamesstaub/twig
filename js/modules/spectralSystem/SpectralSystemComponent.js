import BaseComponent from "../base/BaseComponent.js";
import { Dial } from "../generic/dial/Dial.js";
import { ValueTip } from "../generic/valueTip.js";
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
        // The current system's description (HTML) — shown in a ValueTip from
        // the "?" button rather than as an always-visible block, which used
        // to cost every system ~50px of the row's height regardless of
        // whether anyone was reading it.
        this._description = '';
    }

    /**
     * Main render cycle: receives fresh props from BaseController.
     */
    render({ systems, currentSystem, currentSystemIndex, isSubharmonic, startHarmonic, systemParams }) {
        const selectEl = this.q('#ratio-system-select');

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

        this._description = currentSystem?.description || '';

        this.renderDials({ currentSystem, startHarmonic, systemParams });

        // --- Subharmonic toggle ---
        this.renderSubharmonicToggle({ isSubharmonic });
    }

    updateSelector({ currentSystemIndex, currentSystem, startHarmonic, systemParams }) {
        const selectEl = this.q('#ratio-system-select');
        if (!selectEl) return;

        if (currentSystemIndex >= 0) selectEl.value = currentSystemIndex;
        this._description = currentSystem?.description || '';
        this.renderDials({ currentSystem, startHarmonic, systemParams });
    }

    /**
     * Start harmonic (generative systems only) and the current system's
     * tunable params (stiffness, stretch, …) as one inline row of dials,
     * each with its name above it. Dial instances are rebuilt only when the
     * set of visible dials changes (system switch) — external updates
     * (bridge, reload) sync through setValue, which doesn't echo, so an
     * in-progress drag is never torn down under the pointer.
     */
    renderDials({ currentSystem, startHarmonic, systemParams }) {
        const row = this.q('#system-dials-row');
        if (!row) return;

        const hasStartHarmonic = Boolean(currentSystem?.generate);
        const paramKeys = (currentSystem?.params || []).filter((k) => SYSTEM_PARAM_DIALS[k]);
        row.classList.toggle('hidden', !hasStartHarmonic && paramKeys.length === 0);

        const signature = `${hasStartHarmonic}|${paramKeys.join(',')}`;
        if (this._dialSignature !== signature) {
            this._dialSignature = signature;
            this._startHarmonicDial = null;
            this._paramDials = {};
            row.innerHTML = '';

            if (hasStartHarmonic) {
                const dial = new Dial({
                    min: 1, max: 64, step: 1, size: 26,
                    value: startHarmonic ?? 1,
                    label: 'start harmonic',
                    format: (v) => String(Math.round(v)),
                    onChange: (v) => this.onStartHarmonicChange?.(Math.round(v)),
                });
                this._startHarmonicDial = dial;
                row.appendChild(this.dialColumn('start harmonic', dial));
            }

            for (const key of paramKeys) {
                const def = SYSTEM_PARAM_DIALS[key];
                const dial = new Dial({
                    min: 0, max: 1, step: 0.005, size: 26,
                    value: def.toPosition(systemParams?.[key]),
                    label: def.label,
                    format: def.format,
                    onChange: (t) => this.onParamChange?.(key, def.toValue(t)),
                });
                this._paramDials[key] = dial;
                row.appendChild(this.dialColumn(def.label, dial));
            }
            return;
        }

        if (this._startHarmonicDial && this._startHarmonicDial.value !== (startHarmonic ?? 1)) {
            this._startHarmonicDial.setValue(startHarmonic ?? 1);
        }
        for (const [key, dial] of Object.entries(this._paramDials || {})) {
            const pos = SYSTEM_PARAM_DIALS[key].toPosition(systemParams?.[key]);
            // Tolerance beats the dial step so a value that round-tripped
            // through the taper doesn't jitter the knob mid-drag
            if (Math.abs(pos - dial.value) > 0.004) dial.setValue(pos);
        }
    }

    /** Dial with its name ABOVE it (not beside), matching this row's layout. */
    dialColumn(label, dial) {
        const col = document.createElement('div');
        col.className = 'system-dial-col';
        const name = document.createElement('span');
        name.className = 'system-dial-name';
        name.textContent = label;
        col.append(name, dial.el);
        return col;
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

        this.bindInfoButton();
    }

    /**
     * "?" button: click-toggles a ValueTip holding the system's (HTML)
     * description. Click-to-toggle rather than hover, since jweb/touch
     * contexts have no reliable hover — dismissed by clicking anywhere
     * else, same convention as the drawbar context menu.
     */
    bindInfoButton() {
        const btn = this.q('#system-info-btn');
        if (!btn) return;

        if (this._infoBtnHandler) {
            btn.removeEventListener('click', this._infoBtnHandler);
        }
        if (this._infoDismiss) {
            document.removeEventListener('mousedown', this._infoDismiss);
        }

        this._infoBtnHandler = (e) => {
            e.stopPropagation();
            if (this._infoOpen) {
                ValueTip.hide();
                this._infoOpen = false;
                return;
            }
            const r = btn.getBoundingClientRect();
            ValueTip.show(this._description || 'No description.', r.left + r.width / 2, r.top, {
                autoHideMs: 0,
                interactive: true,
                html: true,
                wrap: true,
            });
            this._infoOpen = true;
        };
        btn.addEventListener('click', this._infoBtnHandler);

        // Dismiss on outside click (deferred so this same click doesn't
        // immediately close what it just opened)
        this._infoDismiss = (e) => {
            if (this._infoOpen && e.target !== btn && !e.target.closest('.value-tip')) {
                ValueTip.hide();
                this._infoOpen = false;
            }
        };
        document.addEventListener('mousedown', this._infoDismiss);
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
        this._subharmonicToggleHandler = () => {
            this.onSubharmonicToggle?.();
        };
        subharmonicToggle.addEventListener('click', this._subharmonicToggleHandler);
    }
}
