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
    SPECTRAL_SYSTEM_CHANGED,
    SUBHARMONIC_TOGGLED
} from "../../events.js";
import { BaseController } from "../base/BaseController.js";
import { AppState } from "../../config.js";
import { irManager } from "../../dsp/IRManager.js";

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
                this.refreshNote();
            });
        });

        // A new IR extends every column's IR stepper — re-render the view
        document.addEventListener(CONVOLUTION_IRS_CHANGED, () => {
            if (this.component.view === 'convolution') this.update();
            this.refreshNote();
        });
        this.refreshNote();

    }


    /** Hint under the tabs: the convolution view is inert until an IR exists. */
    refreshNote() {
        const note = document.getElementById('drawbars-note');
        if (!note) return;
        const show = this.component.view === 'convolution' && irManager.list().length === 0;
        note.textContent = show ? 'create IR to use convolution' : '';
        note.classList.toggle('hidden', !show);
    }

    getProps() {
        return {
            isSubharmonic: AppState.isSubharmonic
        };
    }

    // no update() override — BaseController handles render + bindRenderedEvents
}
