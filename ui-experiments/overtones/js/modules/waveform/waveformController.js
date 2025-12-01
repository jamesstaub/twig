import { AppState } from "../../config.js";
import { BaseController } from "../base/BaseController.js";
import WaveformComponent from "./WaveformComponent.js";


export class WaveformController extends BaseController {
    createComponent(selector) {
        return new WaveformComponent(selector);
    }

    getProps() {
        const { p5Instance, harmonicAmplitudes, currentSystem, currentWaveform } = AppState;

        return {
            p5Instance,
            harmonicAmplitudes,
            currentSystem,
            currentWaveform,
        };
    }

}