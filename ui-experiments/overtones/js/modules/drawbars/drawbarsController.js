
// controller/DrawbarController.js
import { DrawbarsComponent } from "./DrawbarsComponent.js";
import { DrawbarsActions } from "./drawbarsActions.js";
import { DRAWBAR_CHANGE, DRAWBARS_RANDOMIZED, DRAWBARS_RESET, SPECTRAL_SYSTEM_CHANGED, SUBHARMONIC_TOGGLED } from "../../events.js";

export class DrawbarsController {
    constructor() {
        this.component = new DrawbarsComponent("drawbars");
    }

    init() {
        this.component.render();
        // connect component → actions
        this.component.onChange = (i, val) => {
            DrawbarsActions.setDrawbar(i, val);
        }

        this.setupEvents();
    }


    setupEvents() {
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
