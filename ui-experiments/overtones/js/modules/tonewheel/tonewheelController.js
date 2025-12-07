/**

 */

import { BaseController } from "../base/BaseController.js";
import { TonewheelComponent } from "./TonewheelComponent.js";
import { TonewheelActions } from "./tonewheelActions.js";


export class TonewheelController extends BaseController {
    createComponent(selector) {
        return new TonewheelComponent(selector);
    }

    getProps() {
        // Create the p5 sketch and pass it as a prop
        let p5Instance = null;
        if (typeof window !== 'undefined' && window.p5) {
            p5Instance = TonewheelActions.initVisualization();
        }
        return { p5Instance };
    }

    bindComponentEvents() {
        // No component events for now
    }

    bindExternalEvents() {
        // Listen for state changes if needed
    }
}
