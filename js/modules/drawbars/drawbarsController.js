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
            case "convolution": OvertoneSignalActions.resetConvolutions(); break;
            default: DrawbarsActions.reset();
        }
    }

    randomize() {
        switch (this.component.view) {
            case "filter": OvertoneSignalActions.randomizeFilters(); break;
            case "sequence": OvertoneSignalActions.randomizeGates(); break;
            case "convolution": OvertoneSignalActions.randomizeConvolutions(); break;
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
                this.update();
            });
        });

        // A new IR extends every column's IR stepper — re-render the view
        document.addEventListener(CONVOLUTION_IRS_CHANGED, () => {
            if (this.component.view === 'convolution') this.update();
        });

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


    getProps() {
        return {
            isSubharmonic: AppState.isSubharmonic
        };
    }

    // no update() override — BaseController handles render + bindRenderedEvents
}
