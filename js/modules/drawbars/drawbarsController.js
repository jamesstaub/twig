import { DrawbarsComponent } from "./DrawbarsComponent.js";
import { FAMILIES, FAMILY_ORDER } from "./drawbarParams.js";
import {
    CONVOLUTION_IRS_CHANGED,
    DRAWBAR_CHANGE,
    DRAWBARS_RANDOMIZED,
    DRAWBARS_RESET,
    OVERTONE_SIGNAL_CHANGED,
    SHAPE_MODE_CHANGED,
    SPECTRAL_SYSTEM_CHANGED,
    SUBHARMONIC_TOGGLED,
    SURFACE_CHANGED
} from "../../events.js";
import { BaseController } from "../base/BaseController.js";
import { AppState } from "../../config.js";
import { irManager } from "../../dsp/IRManager.js";
import { SURFACES, surfaceState } from "../surfaces/surfaceState.js";

const ROOT_ID = "drawbars-control-root";
const TITLE_ID = "drawbars-title";
const PARAM_TABS_ID = "drawbars-tabs";
const FAMILY_TABS_ID = "drawbars-family-tabs";
const NOTE_ID = "drawbars-note";

// Below this panel height there is no room for dials under the bars: the
// family's other parameters become tabs that put them on the bars instead
const COMPACT_STRIP_HEIGHT = 420;

/**
 * The drawbar strip's controller. The strip's parameter FAMILY follows
 * the active surface (surfaceState: gain / filter / convolution / adsr
 * each name one) — or, in the embed band where there is no toolbar, the
 * family tabs in the strip's header. Within a family, the header's
 * parameter tabs (shown only while the strip is compact) choose which
 * parameter the bars edit. `reset()` / `randomize()` act on the current
 * family — ui.js hands them to the panel's overtone toolbar.
 */
export class DrawbarsController extends BaseController {

    constructor(selector) {
        super(selector);
        this.family = "gain";
        this.paramIndex = 0;
        this.compact = false;
    }

    createComponent(selector) {
        return new DrawbarsComponent(selector);
    }

    getProps() {
        return {
            isSubharmonic: AppState.isSubharmonic,
            family: this.family,
            paramIndex: this.paramIndex,
            compact: this.compact,
        };
    }

    /**
     * Wire Component → callbacks
     */
    bindComponentEvents() {
        // Column label click / context menu → the overtone inspector.
        // Assigned by ui.js (this.onInspect) so the strip doesn't know
        // where the editor lives.
        this.component.onInspect = (index) => this.onInspect?.(index);
    }

    /** Switch the strip to a parameter family (its first parameter on the bars). */
    setFamily(name) {
        if (!FAMILIES[name] || name === this.family) return;
        this.family = name;
        this.paramIndex = 0;
        this.renderHeader();
        this.update();
        this.refreshNote();
    }

    setParamIndex(i) {
        if (i === this.paramIndex) return;
        this.paramIndex = i;
        this.renderHeader();
        this.update();
    }

    /**
     * Compact when the panel can't fit dials under the bars. Measured, not
     * assumed: the strip's height comes from the flex chain, and it differs
     * per surface layout, viewport and the embed band.
     */
    syncCompact() {
        const root = document.getElementById(ROOT_ID);
        if (!root || root.hidden) return;
        const compact = root.clientHeight > 0 && root.clientHeight < COMPACT_STRIP_HEIGHT;
        if (compact === this.compact) return;
        this.compact = compact;
        if (!compact) this.paramIndex = 0; // dials are back; the bars show the primary again
        this.renderHeader();
        this.update();
    }

    updateDrawbar({ index }) {
        this.component.refreshColumn(index);
    }

    reset() {
        FAMILIES[this.family].reset();
    }

    randomize() {
        FAMILIES[this.family].randomize();
    }

    /**
     * DOM / Global events
     */
    bindExternalEvents() {
        document.addEventListener(DRAWBAR_CHANGE, (event) => this.updateDrawbar(event.detail));
        document.addEventListener(DRAWBARS_RANDOMIZED, () => this.update());
        document.addEventListener(DRAWBARS_RESET, () => this.update());
        document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => this.update());
        document.addEventListener(SUBHARMONIC_TOGGLED, () => this.update());

        document.addEventListener(SHAPE_MODE_CHANGED, () => this.component.syncShapeMarker());

        // The active surface names the family
        document.addEventListener(SURFACE_CHANGED, (e) => {
            const family = SURFACES.find((s) => s.id === e.detail?.active)?.family;
            if (family) this.setFamily(family);
        });
        const initial = SURFACES.find((s) => s.id === surfaceState.active)?.family;
        if (initial) this.family = initial;

        // Per-overtone signal edits from the inspector or OSC → the column
        document.addEventListener(OVERTONE_SIGNAL_CHANGED, (e) => {
            const { index } = e.detail || {};
            if (index !== undefined) this.component.refreshColumn(index);
        });

        // A new IR extends every column's IR stepper — re-render the family
        document.addEventListener(CONVOLUTION_IRS_CHANGED, () => {
            if (this.family === "convolution") this.update();
            this.refreshNote();
        });

        // Height-driven compact mode (tabs instead of dials)
        const root = document.getElementById(ROOT_ID);
        if (root && window.ResizeObserver) {
            new ResizeObserver(() => this.syncCompact()).observe(root);
        }
        window.addEventListener("resize", () => this.syncCompact());

        this.renderHeader();
        this.refreshNote();
    }

    /** First render: the compact measurement needs the panel laid out. */
    init() {
        super.init();
        this.syncCompact();
    }

    /**
     * The header: the family's name, the family tabs (embed only — CSS
     * hides them on the surfaces shell, where the toolbar chooses), and
     * the parameter tabs (only while compact).
     */
    renderHeader() {
        const title = document.getElementById(TITLE_ID);
        if (title) title.textContent = FAMILIES[this.family].label;

        const familyTabs = document.getElementById(FAMILY_TABS_ID);
        if (familyTabs) {
            familyTabs.innerHTML = "";
            for (const name of FAMILY_ORDER) {
                familyTabs.appendChild(this.tab(FAMILIES[name].label.toLowerCase(), name === this.family, () => this.setFamily(name)));
            }
        }

        const paramTabs = document.getElementById(PARAM_TABS_ID);
        if (paramTabs) {
            paramTabs.innerHTML = "";
            paramTabs.hidden = !this.compact;
            FAMILIES[this.family].params.forEach((param, i) => {
                paramTabs.appendChild(this.tab(param.label, i === this.paramIndex, () => this.setParamIndex(i)));
            });
        }
    }

    tab(text, active, onClick) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "drawbars-tab" + (active ? " active" : "");
        btn.textContent = text;
        btn.addEventListener("click", onClick);
        return btn;
    }

    /** Hint beside the tabs: the convolution family is inert until an IR exists. */
    refreshNote() {
        const note = document.getElementById(NOTE_ID);
        if (!note) return;
        const show = this.family === "convolution" && irManager.list().length === 0;
        note.textContent = show ? "create IR to use convolution" : "";
        note.classList.toggle("hidden", !show);
    }
}
