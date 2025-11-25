
// controller/DrawbarController.js
import { DrawbarsComponent } from "./DrawbarsComponent.js";
import { DrawbarsActions } from "./drawbarsActions.js";
import { DRAWBARS_RANDOMIZED, DRAWBARS_RESET, SPECTRAL_SYSTEM_CHANGED, SUBHARMONIC_TOGGLED } from "../../events.js";
import { BaseController } from "../base/BaseController.js";

export class DrawbarsController extends BaseController {
    createComponent() {
        return new DrawbarsComponent("drawbars");
    }

    bindComponentEvents() {
        // connect component → actions
        this.component.onChange = (i, val) => {
            DrawbarsActions.setDrawbar(i, val);
        }
    }

    bindExternalEvents() {
        document.addEventListener(DRAWBARS_RANDOMIZED, () => this.update());
        document.addEventListener(DRAWBARS_RESET, () => this.update());
        document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => this.update());
        document.addEventListener(SUBHARMONIC_TOGGLED, () => {
            this.update();
        });
    }

    randomize() {
        DrawbarsActions.randomize();
    }

    reset() {
        DrawbarsActions.reset();
    }

    update() {
        // Pass isSubharmonic to component.render so labels update
        if (window.AppState && typeof window.AppState.isSubharmonic !== 'undefined') {
            this.component.render({ isSubharmonic: window.AppState.isSubharmonic });
        } else {
            this.component.render();
        }
    }

}
