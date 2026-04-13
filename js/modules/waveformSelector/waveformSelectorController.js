import { BaseController } from "../base/BaseController.js";
import { WaveformSelectorComponent } from "./WaveformSelectorComponent.js";
import { handleWaveformChange, CURRENT_WAVEFORM_CHANGED } from "../waveform/waveformActions.js";
import { AppState } from "../../config.js";

export class WaveformSelectorController extends BaseController {
    createComponent(selector) {
        return new WaveformSelectorComponent(selector);
    }

    getProps() {
        return { currentWaveform: AppState.currentWaveform };
    }

    bindComponentEvents() {
        this.component.onChange = (e) => handleWaveformChange(e);
    }

    bindExternalEvents() {
        document.addEventListener(CURRENT_WAVEFORM_CHANGED, () => this.update());
    }
}
