/**

 */

import { AppState } from "../../config.js";
import { SliderController } from "../atoms/slider/sliderController.js";
import { BaseController } from "../base/BaseController.js";
import { TonewheelComponent } from "./TonewheelComponent.js";
import { TonewheelActions } from "./tonewheelActions.js";

let spreadSliderController;
let vizFreqSliderController;

export class TonewheelController extends BaseController {

    init() {
        super.init();

        // Spread Slider
        spreadSliderController = new SliderController('#spread-slider-root', {
            min: 0,
            max: 1,
            step: 0.01,
            value: AppState.spreadFactor ?? 0.2,
            label: 'Gain',
            formatValue: (v) => `${(v * 100).toFixed(0)}%`
        }, (value) => {
            TonewheelActions.setSpreadFactor(value);
        });
        spreadSliderController.init();

        // Visualization Frequency Slider
        vizFreqSliderController = new SliderController('#viz-freq-slider-root', {
            min: 0.1,
            max: 20,
            step: 0.1,
            value: AppState.visualizationFrequency ?? 1,
            label: 'Rate',
            formatValue: (v) => `${v.toFixed(1)} Hz`
        }, (value) => {
            TonewheelActions.setVisualizationFrequency(value);
        });
        vizFreqSliderController.init();

    }

    createComponent(selector) {
        return new TonewheelComponent(selector);
    }

    getProps() {
        let p5Instance = null;
        p5Instance = TonewheelActions.initVisualization();
        return { p5Instance };
    }

    bindComponentEvents() {
        // No component events for now
    }

    bindExternalEvents() {
        // Listen for state changes if needed
    }
}
