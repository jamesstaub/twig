// controller/DrawbarController.js
import { DrawbarsComponent } from "./DrawbarsComponent.js";
import { DrawbarsActions } from "./drawbarsActions.js";
import { OvertoneSignalActions } from "../overtoneSignal/overtoneSignalActions.js";
import {
    CONVOLUTION_IRS_CHANGED,
    DRAWBAR_CHANGE,
    DRAWBARS_RANDOMIZED,
    DRAWBARS_RESET,
    OVERTONE_SIGNAL_CHANGED,
    SOURCE_CHANGED,
    SPECTRAL_SYSTEM_CHANGED,
    SUBHARMONIC_TOGGLED
} from "../../events.js";
import { irManager } from "../../dsp/IRManager.js";
import { ConvolutionActions } from "../convolution/convolutionActions.js";
import { BaseController } from "../base/BaseController.js";
import { AppState } from "../../config.js";

const RESET_DRAWBARS_BUTTON_ID = "reset-drawbars-button";
const RANDOMIZE_DRAWBARS_BUTTON_ID = "randomize-drawbars-button";

export class DrawbarsController extends BaseController {

    createComponent(selector) {
        return new DrawbarsComponent(selector);
    }


    /**
     * Wire Component → Actions
     */
    bindComponentEvents() {
        this.component.onChange = (index, value) => {
            DrawbarsActions.setDrawbar(index, value);
        };
    }

    updateDrawbar({ index, value }) {
        this.component.updateSingleDrawbar(index, value);
    }

    /** Reset applies to the values the active view edits. */
    reset() {
        switch (this.component.view) {
            case "filter": OvertoneSignalActions.resetFilters(); break;
            case "sequence": OvertoneSignalActions.resetGates(); break;
            default: DrawbarsActions.reset();
        }
    }

    randomize() {
        switch (this.component.view) {
            case "filter": OvertoneSignalActions.randomizeFilters(); break;
            case "sequence": OvertoneSignalActions.randomizeGates(); break;
            default: DrawbarsActions.randomize();
        }
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

        document.getElementById(RESET_DRAWBARS_BUTTON_ID)?.addEventListener("click", () => {
            this.reset();
        });

        document.getElementById(RANDOMIZE_DRAWBARS_BUTTON_ID)?.addEventListener("click", () => {
            this.randomize();
        });

        // Per-overtone signal edits from the modal or OSC → visible controls
        document.addEventListener(OVERTONE_SIGNAL_CHANGED, (e) => {
            const { index, kind } = e.detail || {};
            if (index !== undefined) this.component.syncSignal(index, kind);
        });

        // View tabs: gain | filter | sequence | convolution
        document.querySelectorAll("#drawbars-tabs .drawbars-tab").forEach((btn) => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#drawbars-tabs .drawbars-tab")
                    .forEach((b) => b.classList.toggle("active", b === btn));
                this.component.view = btn.dataset.view;
                this.refreshIRSelect();
                this.update();
            });
        });

        // Convolution IR menu: visible only in the convolution view,
        // repopulated whenever an IR is created or selected
        const irSelect = document.getElementById('conv-ir-select');
        irSelect?.addEventListener('change', () => {
            ConvolutionActions.selectIR(irSelect.value || null);
        });
        document.addEventListener(CONVOLUTION_IRS_CHANGED, () => this.refreshIRSelect());

        // External source modes have no oscillator cycles to sequence —
        // hide the sequence view (and leave it if it's active). Applied
        // once at init too: the bridge bootstrap replays state before
        // controllers bind, so the event alone can be missed.
        const applySourceGating = () => {
            const seqTab = document.querySelector('#drawbars-tabs [data-view="sequence"]');
            const external = AppState.sourceMode !== 'oscillators';
            seqTab?.classList.toggle('hidden', external);
            if (external && this.component.view === 'sequence') {
                document.querySelector('#drawbars-tabs [data-view="gain"]')?.click();
            }
        };
        document.addEventListener(SOURCE_CHANGED, applySourceGating);
        applySourceGating();
    }


    /** Populate + show/hide the IR menu for the convolution view. */
    refreshIRSelect() {
        const select = document.getElementById('conv-ir-select');
        if (!select) return;
        select.classList.toggle('hidden', this.component.view !== 'convolution');
        select.innerHTML = '';
        const none = document.createElement('option');
        none.value = '';
        none.textContent = irManager.list().length ? 'no IR' : 'no IRs — use Create IR';
        select.appendChild(none);
        for (const ir of irManager.list()) {
            const opt = document.createElement('option');
            opt.value = ir.key;
            opt.textContent = ir.name;
            if (ir.key === AppState.convolutionIR) opt.selected = true;
            select.appendChild(opt);
        }
    }

    getProps() {
        return {
            isSubharmonic: AppState.isSubharmonic
        };
    }

    // no update() override — BaseController handles render + bindRenderedEvents
}
