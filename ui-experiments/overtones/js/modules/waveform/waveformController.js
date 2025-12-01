import { AppState } from "../../config.js";
import { DRAWBAR_CHANGE, DRAWBARS_RESET, SPECTRAL_SYSTEM_CHANGED, SUBHARMONIC_TOGGLED } from "../../events.js";
import { BaseController } from "../base/BaseController.js";
import { CURRENT_WAVEFORM_CHANGED } from "./waveformActions.js";
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

    bindExternalEvents() {
        document.addEventListener(DRAWBARS_RESET, () => this.update());
        document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => this.update());
        document.addEventListener(SUBHARMONIC_TOGGLED, () => this.update());
        document.addEventListener(CURRENT_WAVEFORM_CHANGED, () => this.update());
        document.addEventListener(DRAWBAR_CHANGE, () => this.update());

    }

}