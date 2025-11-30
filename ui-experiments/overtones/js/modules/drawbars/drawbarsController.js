// controller/DrawbarController.js
import { DrawbarsComponent } from "./DrawbarsComponent.js";
import { DrawbarsActions } from "./drawbarsActions.js";
import {
    DRAWBARS_RANDOMIZED,
    DRAWBARS_RESET,
    SPECTRAL_SYSTEM_CHANGED,
    SUBHARMONIC_TOGGLED
} from "../../events.js";
import { BaseController } from "../base/BaseController.js";
import { AppState } from "../../config.js";

const RESET_DRAWBARS_BUTTON_ID = "reset-drawbars-button";
const RANDOMIZE_DRAWBARS_BUTTON_ID = "randomize-drawbars-button";

export class DrawbarsController extends BaseController {

    createComponent() {
        return new DrawbarsComponent("#drawbars");
    }

    /**
     * Wire Component → Actions
     */
    bindComponentEvents() {
        this.component.onChange = (index, value) => {
            DrawbarsActions.setDrawbar(index, value);
        };
    }

    reset() {
        DrawbarsActions.reset();
    }

    randomize() {
        DrawbarsActions.randomize();
    }

    /**
     * DOM / Global events
     */
    bindExternalEvents() {
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
    }


    getProps() {
        return {
            isSubharmonic: AppState.isSubharmonic
        };
    }

    // no update() override — BaseController handles render + bindRenderedEvents
}
