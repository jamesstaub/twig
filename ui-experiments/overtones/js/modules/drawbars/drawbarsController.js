
// controller/DrawbarController.js
import { DrawbarsComponent } from "./DrawbarsComponent.js";
import { DrawbarsActions } from "./drawbarsActions.js";
import { DRAWBAR_CHANGE, DRAWBARS_RANDOMIZED, DRAWBARS_RESET, SPECTRAL_SYSTEM_CHANGED } from "../../events.js";

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

        // Whenever drawbar values change, update sliders
    // document.addEventListener(DRAWBAR_CHANGE, () => {
        //     drawbars.update();
        // });

        document.addEventListener(DRAWBARS_RANDOMIZED, () => this.update());
        document.addEventListener(DRAWBARS_RESET, () => this.update());

        // Update labels when spectral system changes
        document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => {
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
        this.component.render();
    }

}
